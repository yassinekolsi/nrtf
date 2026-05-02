from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import ScadaLedger
from schemas import ScadaLedgerCreate, ScadaLedgerRead
from utils.energy import estimate_co2_kg

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


@router.get("/{record_id}", response_model=ScadaLedgerRead)
def get_scada_record(
    record_id: UUID,
    db: Session = Depends(get_db),
) -> ScadaLedger:
    record = db.query(ScadaLedger).filter(ScadaLedger.id == record_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="SCADA record not found")

    return record
