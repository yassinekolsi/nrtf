from __future__ import annotations

import os
import time
import uuid
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta
from threading import Lock
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models import EventsAndAnomalies, TelemetryData
from schemas import TelemetryDataCreate, TelemetryDataRead
from utils.energy import check_sensor_anomaly

router = APIRouter()
logger = logging.getLogger(__name__)

TELEMETRY_MIN_TIMESTAMP_MS = int(
    os.getenv("TELEMETRY_MIN_TIMESTAMP_MS", str(int(time.time() * 1000))) or "0"
)
STUCK_WINDOW = int(os.getenv("TELEMETRY_STUCK_WINDOW", "15") or "15")
STUCK_TOLERANCE = float(os.getenv("TELEMETRY_STUCK_TOLERANCE", "0.0001") or "0.0001")
SPIKE_STDDEV_MULTIPLIER = float(os.getenv("TELEMETRY_SPIKE_STDDEV", "3") or "3")
SPIKE_MIN_SAMPLES = int(os.getenv("TELEMETRY_SPIKE_MIN_SAMPLES", "12") or "12")
LIVE_HISTORY_HOURS = int(os.getenv("TELEMETRY_LIVE_HISTORY_HOURS", "24") or "24")
LIVE_HISTORY_WINDOW_MS = int(timedelta(hours=LIVE_HISTORY_HOURS).total_seconds() * 1000)
LIVE_HISTORY_MAX_POINTS_PER_SENSOR = int(
    os.getenv("TELEMETRY_LIVE_MAX_POINTS_PER_SENSOR", "20000") or "20000"
)
LIVE_ONLINE_WINDOW_MS = int(os.getenv("TELEMETRY_LIVE_ONLINE_WINDOW_MS", "60000") or "60000")

_live_lock = Lock()
_live_latest_by_sensor: dict[str, TelemetryDataRead] = {}
_live_history_by_sensor: dict[str, deque[TelemetryDataRead]] = defaultdict(
    lambda: deque(maxlen=LIVE_HISTORY_MAX_POINTS_PER_SENSOR)
)

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


def _record_live_readings(readings: list[TelemetryDataRead]) -> None:
    cutoff_ms = int(time.time() * 1000) - LIVE_HISTORY_WINDOW_MS
    with _live_lock:
        for reading in readings:
            _live_latest_by_sensor[reading.sensor_id] = reading
            history = _live_history_by_sensor[reading.sensor_id]
            history.append(reading)
            while history and history[0].timestamp_ms < cutoff_ms:
                history.popleft()


def _get_live_snapshot(sensor_ids: list[str] | None = None) -> dict[str, Any]:
    cutoff_ms = int(time.time() * 1000) - LIVE_HISTORY_WINDOW_MS
    online_cutoff_ms = int(time.time() * 1000) - LIVE_ONLINE_WINDOW_MS

    with _live_lock:
        selected_sensor_ids = (
            list(dict.fromkeys(sensor_ids))
            if sensor_ids
            else sorted(set(_live_latest_by_sensor) | set(_live_history_by_sensor))
        )
        latest = [
            reading
            for sensor_id in selected_sensor_ids
            if (reading := _live_latest_by_sensor.get(sensor_id)) is not None
        ]

        history: dict[str, list[TelemetryDataRead]] = {}
        total_readings = 0
        anomaly_count = 0
        last_seen_ms = 0
        for sensor_id in selected_sensor_ids:
            readings = [
                reading
                for reading in _live_history_by_sensor.get(sensor_id, [])
                if reading.timestamp_ms >= cutoff_ms
            ]
            history[sensor_id] = readings
            total_readings += len(readings)
            anomaly_count += sum(1 for reading in readings if reading.quality.lower() != "valid")
            if readings:
                last_seen_ms = max(last_seen_ms, max(reading.timestamp_ms for reading in readings))

        sensors_online = sum(1 for reading in latest if reading.timestamp_ms >= online_cutoff_ms)

    return {
        "latest": latest,
        "history": history,
        "stats": {
            "total_readings": total_readings,
            "anomaly_count": anomaly_count,
            "sensors_online": sensors_online,
            "last_seen_ms": last_seen_ms,
        },
    }


def _build_anomaly_rows(
    db: Session,
    reading_rows: list[dict[str, Any]],
) -> list[EventsAndAnomalies]:
    anomaly_rows: list[EventsAndAnomalies] = []
    sensor_ids = {str(item["sensor_id"]) for item in reading_rows}
    prev_values = _fetch_latest_values(db, sensor_ids)

    for item in reading_rows:
        sensor_id = str(item["sensor_id"])
        sensor_type = str(item["type"])
        value = float(item["value"])
        quality = str(item["quality"])
        timestamp_ms = int(item["timestamp_ms"])

        prev_value = prev_values.get(sensor_id)
        is_anomaly, reason, confidence = check_sensor_anomaly(
            sensor_type,
            value,
            prev_value,
        )
        if is_anomaly:
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=_timestamp_ms_to_datetime(timestamp_ms),
                    source="EDGE_AI",
                    description=reason,
                    severity="CRITIQUE",
                    acknowledged=False,
                    context_data={
                        "sensor_id": sensor_id,
                        "value": value,
                        "confidence": confidence,
                        "quality": quality,
                    },
                )
            )

        if quality.lower() == "invalid":
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=_timestamp_ms_to_datetime(timestamp_ms),
                    source="EDGE_AI",
                    description="Invalid sensor data",
                    severity="CRITIQUE",
                    acknowledged=False,
                    context_data={
                        "sensor_id": sensor_id,
                        "value": value,
                        "confidence": 1.0,
                        "quality": quality,
                    },
                )
            )

        recent_values = _fetch_recent_values(db, sensor_id, STUCK_WINDOW)
        if len(recent_values) >= STUCK_WINDOW - 1:
            recent_slice = recent_values[: max(STUCK_WINDOW - 1, 0)]
            older_value = recent_values[STUCK_WINDOW - 1] if len(recent_values) >= STUCK_WINDOW else None
            if _values_close(value, recent_slice) and (
                older_value is None or abs(older_value - value) > STUCK_TOLERANCE
            ):
                anomaly_rows.append(
                    EventsAndAnomalies(
                        timestamp=_timestamp_ms_to_datetime(timestamp_ms),
                        source="EDGE_AI",
                        description="Stuck sensor detected",
                        severity="AVERTISSEMENT",
                        acknowledged=False,
                        context_data={
                            "sensor_id": sensor_id,
                            "value": value,
                            "confidence": 0.95,
                            "window": STUCK_WINDOW,
                        },
                    )
                )

        since_ms = timestamp_ms - int(timedelta(hours=24).total_seconds() * 1000)
        sample_count, avg_value, stddev_value = _fetch_rollup_stats(
            db,
            sensor_id,
            since_ms,
        )
        if (
            sample_count >= SPIKE_MIN_SAMPLES
            and avg_value is not None
            and stddev_value is not None
            and stddev_value > 0
        ):
            delta = abs(value - avg_value)
            threshold = SPIKE_STDDEV_MULTIPLIER * stddev_value
            if delta > threshold:
                anomaly_rows.append(
                    EventsAndAnomalies(
                        timestamp=_timestamp_ms_to_datetime(timestamp_ms),
                        source="EDGE_AI",
                        description="Spike detected",
                        severity="AVERTISSEMENT",
                        acknowledged=False,
                        context_data={
                            "sensor_id": sensor_id,
                            "value": value,
                            "expected": avg_value,
                            "stddev": stddev_value,
                            "confidence": 0.85,
                        },
                    )
                )

    return anomaly_rows


def _persist_telemetry_rows(reading_rows: list[dict[str, Any]]) -> None:
    db = SessionLocal()
    try:
        telemetry_rows = [TelemetryData(**item) for item in reading_rows]
        anomaly_rows = _build_anomaly_rows(db, reading_rows)

        db.add_all(telemetry_rows)
        db.add_all(anomaly_rows)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to persist telemetry data in background")
    finally:
        db.close()


@router.post("/telemetry")
def create_telemetry(
    payload: list[TelemetryDataCreate],
    background_tasks: BackgroundTasks,
) -> dict[str, int]:
    reading_rows: list[dict[str, Any]] = []
    live_readings: list[TelemetryDataRead] = []

    for item in payload:
        reading_id = uuid.uuid4()
        reading_data = item.model_dump()
        row = {"id": reading_id, **reading_data}
        reading_rows.append(row)
        live_readings.append(TelemetryDataRead(id=reading_id, **reading_data))

    # Keep dashboard reads off Neon: live endpoints serve this RAM buffer.
    _record_live_readings(live_readings)
    background_tasks.add_task(_persist_telemetry_rows, reading_rows)

    return {
        "inserted": len(reading_rows),
        "anomalies_created": 0,
        "queued_for_persistence": len(reading_rows),
    }


@router.get("/telemetry/live")
def get_live_telemetry(
    sensor_id: list[str] | None = Query(default=None),
) -> dict[str, Any]:
    return _get_live_snapshot(sensor_id)


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
    limit: int = Query(default=200, ge=1, le=20000),
    hours: int | None = Query(default=None, ge=1, le=168),
    since_ms: int | None = Query(default=None, ge=0),
    until_ms: int | None = Query(default=None, ge=0),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
) -> list[TelemetryDataRead]:
    now_ms = int(time.time() * 1000)
    if hours is not None:
        since_ms = now_ms - int(timedelta(hours=hours).total_seconds() * 1000)

    effective_since = max(
        TELEMETRY_MIN_TIMESTAMP_MS,
        since_ms if since_ms is not None else TELEMETRY_MIN_TIMESTAMP_MS,
    )
    if until_ms is not None and until_ms < effective_since:
        raise HTTPException(status_code=400, detail="until_ms must be greater than since_ms")

    order_clause = "ASC" if order.lower() == "asc" else "DESC"
    time_filter = "AND td.timestamp_ms <= :until_ms" if until_ms is not None else ""
    params = {
        "sensor_id": sensor_id,
        "limit": limit,
        "since_ms": effective_since,
        "min_timestamp_ms": effective_since,
    }
    if until_ms is not None:
        params["until_ms"] = until_ms

    rows = db.execute(
        text(
            f"""
            WITH invalid_packet_timestamps AS (
                {INVALID_PACKET_TIMESTAMPS_SQL}
            )
            SELECT td.id, td.timestamp_ms, td.node_id, td.sensor_id, td.type, td.value, td.unit, td.quality
            FROM telemetry_data td
            WHERE td.sensor_id = :sensor_id
              AND td.timestamp_ms >= :since_ms
              {time_filter}
              AND NOT EXISTS (
                  SELECT 1
                  FROM invalid_packet_timestamps invalid
                  WHERE invalid.timestamp_ms = td.timestamp_ms
              )
            ORDER BY td.timestamp_ms {order_clause}
            LIMIT :limit
            """
        ),
        params,
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
