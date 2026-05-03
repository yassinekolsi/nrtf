from uuid import UUID
import math

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import EventsAndAnomalies, ScadaLedger
from schemas import ScadaLedgerCreate, ScadaLedgerRead
from utils.energy import estimate_co2_kg
from utils.scada_excel import parse_numeric_value, parse_scada_excel

router = APIRouter(prefix="/scada")


@router.post("", response_model=ScadaLedgerRead)
def create_scada_record(
    payload: ScadaLedgerCreate,
    db: Session = Depends(get_db),
) -> ScadaLedger:
    record = ScadaLedger(**payload.model_dump())

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist SCADA record") from exc

    return record


@router.get("", response_model=list[ScadaLedgerRead])
def list_scada_records(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[ScadaLedger]:
    return (
        db.query(ScadaLedger)
        .order_by(ScadaLedger.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/summary")
def get_scada_summary(db: Session = Depends(get_db)) -> dict[str, float | int]:
    total_normalized_kwh, avg_power_kw, record_count = db.query(
        func.coalesce(func.sum(ScadaLedger.normalized_kwh), 0.0),
        func.coalesce(func.avg(ScadaLedger.power_gross_kw), 0.0),
        func.count(ScadaLedger.id),
    ).one()

    return {
        "total_normalized_kwh": float(total_normalized_kwh),
        "avg_power_kw": float(avg_power_kw),
        "total_co2_kg": float(estimate_co2_kg(total_normalized_kwh, "natural_gas")),
        "record_count": record_count,
    }


@router.post("/upload/excel")
async def upload_scada_excel(
    file: UploadFile = File(...),
    interval_minutes: int = Form(default=10),
    pci_factor: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int | float | str]:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded Excel file is empty.")

    if interval_minutes <= 0:
        raise HTTPException(status_code=400, detail="interval_minutes must be greater than zero.")

    pci_override = parse_numeric_value(pci_factor) if pci_factor is not None else None

    try:
        readings, stats = parse_scada_excel(
            file_bytes,
            interval_minutes=interval_minutes,
            pci_factor_override=pci_override,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to read SCADA Excel file.") from exc

    if not readings:
        raise HTTPException(status_code=400, detail="No SCADA readings found in the Excel file.")

    interval_hours = stats.interval_minutes / 60
    efficiency_window = max(1, math.ceil(60 / stats.interval_minutes))
    efficiency_count = 0
    pf_low_prev = False
    ratio_bad_prev = False
    anomaly_rows: list[EventsAndAnomalies] = []

    readings_sorted = sorted(readings, key=lambda item: item.timestamp)
    records = [
        ScadaLedger(
            timestamp=reading.timestamp,
            normalized_kwh=reading.normalized_kwh,
            power_gross_kw=reading.power_gross_kw,
            gas_flow_nm3h=reading.gas_flow_nm3h,
            raw_metrics=reading.raw_metrics,
        )
        for reading in readings_sorted
    ]

    for reading in readings_sorted:
        metrics = reading.raw_metrics or {}

        power_factor = metrics.get("power_factor")
        if power_factor is not None:
            pf_low = power_factor < 0.90
            if pf_low and not pf_low_prev:
                anomaly_rows.append(
                    EventsAndAnomalies(
                        timestamp=reading.timestamp,
                        source="TRIGEN_SCADA",
                        description="Power factor below 0.90",
                        severity="AVERTISSEMENT",
                        acknowledged=False,
                        context_data={
                            "field": "power_factor",
                            "value": power_factor,
                            "expected_min": 0.90,
                            "confidence": 0.8,
                        },
                    )
                )
            pf_low_prev = pf_low

        efficiency = metrics.get("efficiency_electrical_pct")
        if efficiency is not None and efficiency < 38:
            efficiency_count += 1
        else:
            efficiency_count = 0

        if efficiency_count == efficiency_window:
            anomaly_rows.append(
                EventsAndAnomalies(
                    timestamp=reading.timestamp,
                    source="TRIGEN_SCADA",
                    description="Electrical efficiency below 38% for > 1 hour",
                    severity="AVERTISSEMENT",
                    acknowledged=False,
                    context_data={
                        "field": "efficiency_electrical_pct",
                        "value": efficiency,
                        "expected_min": 38.0,
                        "window_readings": efficiency_window,
                        "confidence": 0.8,
                    },
                )
            )

        ratio_bad = False
        if interval_hours > 0 and reading.power_gross_kw > 0:
            electric_kwh = reading.power_gross_kw * interval_hours
            if electric_kwh > 0:
                ratio = reading.normalized_kwh / electric_kwh
                ratio_bad = ratio < 1.1 or ratio > 2.1
                if ratio_bad and not ratio_bad_prev:
                    anomaly_rows.append(
                        EventsAndAnomalies(
                            timestamp=reading.timestamp,
                            source="TRIGEN_SCADA",
                            description="Gas/electricity ratio anomaly",
                            severity="AVERTISSEMENT",
                            acknowledged=False,
                            context_data={
                                "field": "gas_electric_ratio",
                                "value": ratio,
                                "expected_range": [1.1, 2.1],
                                "confidence": 0.75,
                            },
                        )
                    )
        ratio_bad_prev = ratio_bad

    try:
        db.add_all(records)
        if anomaly_rows:
            db.add_all(anomaly_rows)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist SCADA records.") from exc

    return {
        "inserted": len(records),
        "skipped": stats.skipped_columns,
        "pci_factor": stats.pci_factor,
        "interval_minutes": stats.interval_minutes,
        "sheet_name": stats.sheet_name,
    }


@router.get("/{record_id}", response_model=ScadaLedgerRead)
def get_scada_record(
    record_id: UUID,
    db: Session = Depends(get_db),
) -> ScadaLedger:
    record = db.query(ScadaLedger).filter(ScadaLedger.id == record_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="SCADA record not found")

    return record
