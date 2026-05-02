from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import EventsAndAnomalies, TelemetryData
from schemas import TelemetryDataCreate, TelemetryDataRead
from utils.energy import check_sensor_anomaly

router = APIRouter()


def _timestamp_ms_to_datetime(timestamp_ms: int) -> datetime:
    return datetime.utcfromtimestamp(timestamp_ms / 1000)


@router.post("/telemetry")
def create_telemetry(
    payload: list[TelemetryDataCreate],
    db: Session = Depends(get_db),
) -> dict[str, int]:
    telemetry_rows: list[TelemetryData] = []
    anomaly_rows: list[EventsAndAnomalies] = []

    for item in payload:
        telemetry_rows.append(TelemetryData(**item.model_dump()))

        is_anomaly, reason, confidence = check_sensor_anomaly(item.type, item.value)
        if is_anomaly or item.quality.lower() == "invalid":
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=_timestamp_ms_to_datetime(item.timestamp_ms),
                    source="EDGE_AI",
                    description=reason if reason else "Invalid sensor data",
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
            SELECT DISTINCT ON (sensor_id)
                   id, timestamp_ms, node_id, sensor_id, type, value, unit, quality
            FROM telemetry_data
            ORDER BY sensor_id, timestamp_ms DESC
            """
        )
    ).mappings().all()

    return [TelemetryDataRead.model_validate(dict(row)) for row in rows]


@router.get("/telemetry/history/{sensor_id}", response_model=list[TelemetryDataRead])
def get_sensor_history(
    sensor_id: str,
    limit: int = Query(default=200, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> list[TelemetryData]:
    return (
        db.query(TelemetryData)
        .filter(TelemetryData.sensor_id == sensor_id)
        .order_by(TelemetryData.timestamp_ms.desc())
        .limit(limit)
        .all()
    )


@router.get("/telemetry/stats")
def get_telemetry_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    stats = db.execute(
        text(
            """
            SELECT
                (SELECT COUNT(*) FROM telemetry_data) AS total_readings,
                (SELECT COUNT(*) FROM events_and_anomalies) AS anomaly_count,
                (
                    SELECT COUNT(DISTINCT sensor_id)
                    FROM telemetry_data
                    WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 300000
                ) AS sensors_online,
                (SELECT MAX(timestamp_ms) FROM telemetry_data) AS last_seen_ms
            """
        )
    ).mappings().one()

    return {
        "total_readings": int(stats["total_readings"] or 0),
        "anomaly_count": int(stats["anomaly_count"] or 0),
        "sensors_online": int(stats["sensors_online"] or 0),
        "last_seen_ms": int(stats["last_seen_ms"] or 0),
    }
