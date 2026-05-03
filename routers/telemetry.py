from __future__ import annotations

import os
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import EventsAndAnomalies, TelemetryData
from schemas import TelemetryDataCreate, TelemetryDataRead
from utils.energy import check_sensor_anomaly

router = APIRouter()

TELEMETRY_MIN_TIMESTAMP_MS = int(
    os.getenv("TELEMETRY_MIN_TIMESTAMP_MS", str(int(time.time() * 1000))) or "0"
)
STUCK_WINDOW = int(os.getenv("TELEMETRY_STUCK_WINDOW", "15") or "15")
STUCK_TOLERANCE = float(os.getenv("TELEMETRY_STUCK_TOLERANCE", "0.0001") or "0.0001")
SPIKE_STDDEV_MULTIPLIER = float(os.getenv("TELEMETRY_SPIKE_STDDEV", "3") or "3")
SPIKE_MIN_SAMPLES = int(os.getenv("TELEMETRY_SPIKE_MIN_SAMPLES", "12") or "12")

INVALID_PACKET_TIMESTAMPS_SQL = """
    SELECT DISTINCT timestamp_ms
    FROM telemetry_data
    WHERE
        timestamp_ms >= :min_timestamp_ms
        AND (
        (type = 'temperature' AND (value < 0 OR value > 60))
        OR (type = 'humidity' AND (value < 0 OR value > 100))
        OR (type = 'voltage' AND (value < 0 OR value > 30))
        OR (type = 'current' AND (value < 0 OR value > 5))
        OR (type = 'power' AND value < 0)
        OR (type = 'vibration_rms' AND (value < 0 OR value > 8))
        )
"""


def _timestamp_ms_to_datetime(timestamp_ms: int) -> datetime:
    return datetime.utcfromtimestamp(timestamp_ms / 1000)


def _fetch_latest_values(db: Session, sensor_ids: set[str]) -> dict[str, float]:
    if not sensor_ids:
        return {}

    rows = db.execute(
        text(
            """
            SELECT DISTINCT ON (sensor_id) sensor_id, value
            FROM telemetry_data
            WHERE sensor_id = ANY(:sensor_ids)
            ORDER BY sensor_id, timestamp_ms DESC
            """
        ),
        {"sensor_ids": list(sensor_ids)},
    ).mappings().all()

    return {str(row["sensor_id"]): float(row["value"]) for row in rows}


def _fetch_recent_values(db: Session, sensor_id: str, limit: int) -> list[float]:
    if limit <= 0:
        return []

    rows = db.execute(
        text(
            """
            SELECT value
            FROM telemetry_data
            WHERE sensor_id = :sensor_id
            ORDER BY timestamp_ms DESC
            LIMIT :limit
            """
        ),
        {"sensor_id": sensor_id, "limit": limit},
    ).scalars().all()

    return [float(value) for value in rows if value is not None]


def _fetch_rollup_stats(db: Session, sensor_id: str, since_ms: int) -> tuple[int, float | None, float | None]:
    row = db.execute(
        text(
            """
            SELECT COUNT(*) AS sample_count,
                   AVG(value) AS avg_value,
                   STDDEV_POP(value) AS stddev_value
            FROM telemetry_data
            WHERE sensor_id = :sensor_id
              AND timestamp_ms >= :since_ms
            """
        ),
        {"sensor_id": sensor_id, "since_ms": since_ms},
    ).mappings().one()

    return int(row["sample_count"] or 0), row["avg_value"], row["stddev_value"]


def _values_close(target: float, values: list[float]) -> bool:
    if not values:
        return False
    return all(abs(value - target) <= STUCK_TOLERANCE for value in values)


@router.post("/telemetry")
def create_telemetry(
    payload: list[TelemetryDataCreate],
    db: Session = Depends(get_db),
) -> dict[str, int]:
    telemetry_rows: list[TelemetryData] = []
    anomaly_rows: list[EventsAndAnomalies] = []

    sensor_ids = {item.sensor_id for item in payload}
    prev_values = _fetch_latest_values(db, sensor_ids)

    for item in payload:
        telemetry_rows.append(TelemetryData(**item.model_dump()))

        prev_value = prev_values.get(item.sensor_id)
        is_anomaly, reason, confidence = check_sensor_anomaly(
            item.type,
            item.value,
            prev_value,
        )
        if is_anomaly:
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=_timestamp_ms_to_datetime(item.timestamp_ms),
                    source="EDGE_AI",
                    description=reason,
                    severity="CRITIQUE",
                    acknowledged=False,
                    context_data={
                        "sensor_id": item.sensor_id,
                        "value": item.value,
                        "confidence": confidence,
                        "quality": item.quality,
                    },
                )
            )

        if item.quality.lower() == "invalid":
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=_timestamp_ms_to_datetime(item.timestamp_ms),
                    source="EDGE_AI",
                    description="Invalid sensor data",
                    severity="CRITIQUE",
                    acknowledged=False,
                    context_data={
                        "sensor_id": item.sensor_id,
                        "value": item.value,
                        "confidence": 1.0,
                        "quality": item.quality,
                    },
                )
            )

        recent_values = _fetch_recent_values(db, item.sensor_id, STUCK_WINDOW)
        if len(recent_values) >= STUCK_WINDOW - 1:
            recent_slice = recent_values[: max(STUCK_WINDOW - 1, 0)]
            older_value = recent_values[STUCK_WINDOW - 1] if len(recent_values) >= STUCK_WINDOW else None
            if _values_close(item.value, recent_slice) and (
                older_value is None or abs(older_value - item.value) > STUCK_TOLERANCE
            ):
                anomaly_rows.append(
                    EventsAndAnomalies(
                        timestamp=_timestamp_ms_to_datetime(item.timestamp_ms),
                        source="EDGE_AI",
                        description="Stuck sensor detected",
                        severity="AVERTISSEMENT",
                        acknowledged=False,
                        context_data={
                            "sensor_id": item.sensor_id,
                            "value": item.value,
                            "confidence": 0.95,
                            "window": STUCK_WINDOW,
                        },
                    )
                )

        since_ms = item.timestamp_ms - int(timedelta(hours=24).total_seconds() * 1000)
        sample_count, avg_value, stddev_value = _fetch_rollup_stats(
            db,
            item.sensor_id,
            since_ms,
        )
        if (
            sample_count >= SPIKE_MIN_SAMPLES
            and avg_value is not None
            and stddev_value is not None
            and stddev_value > 0
        ):
            delta = abs(item.value - avg_value)
            threshold = SPIKE_STDDEV_MULTIPLIER * stddev_value
            if delta > threshold:
                anomaly_rows.append(
                    EventsAndAnomalies(
                        timestamp=_timestamp_ms_to_datetime(item.timestamp_ms),
                        source="EDGE_AI",
                        description="Spike detected",
                        severity="AVERTISSEMENT",
                        acknowledged=False,
                        context_data={
                            "sensor_id": item.sensor_id,
                            "value": item.value,
                            "expected": avg_value,
                            "stddev": stddev_value,
                            "confidence": 0.85,
                        },
                    )
                )

    try:
        db.add_all(telemetry_rows)
        db.add_all(anomaly_rows)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist telemetry data") from exc

    return {
        "inserted": len(telemetry_rows),
        "anomalies_created": len(anomaly_rows),
    }


@router.get("/telemetry/latest", response_model=list[TelemetryDataRead])
def get_latest_telemetry(db: Session = Depends(get_db)) -> list[TelemetryDataRead]:
    rows = db.execute(
        text(
            """
            WITH invalid_packet_timestamps AS (
                """ + INVALID_PACKET_TIMESTAMPS_SQL + """
            )
            SELECT DISTINCT ON (sensor_id)
                   td.id, td.timestamp_ms, td.node_id, td.sensor_id, td.type, td.value, td.unit, td.quality
            FROM telemetry_data td
            WHERE td.timestamp_ms >= :min_timestamp_ms
              AND NOT EXISTS (
                SELECT 1
                FROM invalid_packet_timestamps invalid
                WHERE invalid.timestamp_ms = td.timestamp_ms
            )
            ORDER BY sensor_id, timestamp_ms DESC
            """
        ),
        {"min_timestamp_ms": TELEMETRY_MIN_TIMESTAMP_MS},
    ).mappings().all()

    return [TelemetryDataRead.model_validate(dict(row)) for row in rows]


@router.get("/telemetry/history/{sensor_id}", response_model=list[TelemetryDataRead])
def get_sensor_history(
    sensor_id: str,
    limit: int = Query(default=200, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> list[TelemetryDataRead]:
    rows = db.execute(
        text(
            """
            WITH invalid_packet_timestamps AS (
                """ + INVALID_PACKET_TIMESTAMPS_SQL + """
            )
            SELECT td.id, td.timestamp_ms, td.node_id, td.sensor_id, td.type, td.value, td.unit, td.quality
            FROM telemetry_data td
            WHERE td.sensor_id = :sensor_id
              AND td.timestamp_ms >= :min_timestamp_ms
              AND NOT EXISTS (
                  SELECT 1
                  FROM invalid_packet_timestamps invalid
                  WHERE invalid.timestamp_ms = td.timestamp_ms
              )
            ORDER BY td.timestamp_ms DESC
            LIMIT :limit
            """
        ),
        {
            "sensor_id": sensor_id,
            "limit": limit,
            "min_timestamp_ms": TELEMETRY_MIN_TIMESTAMP_MS,
        },
    ).mappings().all()

    return [TelemetryDataRead.model_validate(dict(row)) for row in rows]


@router.get("/telemetry/stats")
def get_telemetry_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    stats = db.execute(
        text(
            """
            WITH invalid_packet_timestamps AS (
                """ + INVALID_PACKET_TIMESTAMPS_SQL + """
            ),
            valid_telemetry AS (
                SELECT *
                FROM telemetry_data td
                WHERE td.timestamp_ms >= :min_timestamp_ms
                  AND NOT EXISTS (
                    SELECT 1
                    FROM invalid_packet_timestamps invalid
                    WHERE invalid.timestamp_ms = td.timestamp_ms
                )
            )
            SELECT
                (SELECT COUNT(*) FROM valid_telemetry) AS total_readings,
                (SELECT COUNT(*) FROM events_and_anomalies) AS anomaly_count,
                (
                    SELECT COUNT(DISTINCT sensor_id)
                    FROM valid_telemetry
                    WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 60000
                ) AS sensors_online,
                (SELECT MAX(timestamp_ms) FROM valid_telemetry) AS last_seen_ms
            """
        ),
        {"min_timestamp_ms": TELEMETRY_MIN_TIMESTAMP_MS},
    ).mappings().one()

    return {
        "total_readings": int(stats["total_readings"] or 0),
        "anomaly_count": int(stats["anomaly_count"] or 0),
        "sensors_online": int(stats["sensors_online"] or 0),
        "last_seen_ms": int(stats["last_seen_ms"] or 0),
    }
