from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import EventsAndAnomalies
from schemas import EventsAndAnomaliesCreate, EventsAndAnomaliesRead

router = APIRouter(prefix="/events")


@router.get("", response_model=list[EventsAndAnomaliesRead])
def get_events(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    severity: str | None = None,
    source: str | None = None,
    acknowledged: bool | None = None,
    db: Session = Depends(get_db),
) -> list[EventsAndAnomalies]:
    query = db.query(EventsAndAnomalies)

    if severity is not None:
        query = query.filter(EventsAndAnomalies.severity == severity)
    if source is not None:
        query = query.filter(EventsAndAnomalies.source == source)
    if acknowledged is not None:
        query = query.filter(EventsAndAnomalies.acknowledged == acknowledged)

    return (
        query.order_by(EventsAndAnomalies.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("", response_model=EventsAndAnomaliesRead)
def create_event(
    payload: EventsAndAnomaliesCreate,
    db: Session = Depends(get_db),
) -> EventsAndAnomalies:
    event = EventsAndAnomalies(**payload.model_dump())

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist event.") from exc

    return event


@router.patch("/{event_id}/acknowledge", response_model=EventsAndAnomaliesRead)
def acknowledge_event(
    event_id: UUID,
    db: Session = Depends(get_db),
) -> EventsAndAnomalies:
    event = db.get(EventsAndAnomalies, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")

    event.acknowledged = True

    try:
        db.commit()
        db.refresh(event)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to acknowledge event.") from exc

    return event


@router.get("/stats")
def get_event_stats(db: Session = Depends(get_db)) -> dict[str, object]:
    total = db.query(func.count(EventsAndAnomalies.id)).scalar() or 0
    unacknowledged = (
        db.query(func.count(EventsAndAnomalies.id))
        .filter(EventsAndAnomalies.acknowledged.is_(False))
        .scalar()
        or 0
    )
    critique_count = (
        db.query(func.count(EventsAndAnomalies.id))
        .filter(func.lower(EventsAndAnomalies.severity) == "critique")
        .scalar()
        or 0
    )
    by_source_rows = (
        db.query(
            EventsAndAnomalies.source.label("source"),
            func.count(EventsAndAnomalies.id).label("count"),
        )
        .group_by(EventsAndAnomalies.source)
        .order_by(func.count(EventsAndAnomalies.id).desc(), EventsAndAnomalies.source.asc())
        .all()
    )

    return {
        "total": int(total),
        "unacknowledged": int(unacknowledged),
        "critique_count": int(critique_count),
        "by_source": [
            {"source": row.source, "count": int(row.count)}
            for row in by_source_rows
        ],
    }
