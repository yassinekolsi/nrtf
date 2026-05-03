"""
routers/recovery.py — Waste Heat Recovery API

Endpoints:
  GET  /api/recovery/summary
  GET  /api/recovery/opportunities
  GET  /api/recovery/opportunities/{source_id}
  POST /api/recovery/simulate
  GET  /api/recovery/export
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.recovery import (
    _load_and_compute_all,
    export_recovery_outputs,
    get_recovery_summary,
    simulate_opportunity,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class SimulateRequest(BaseModel):
    source_id: str
    capture_efficiency: Optional[float] = None
    energy_price_dt_per_kwh: Optional[float] = None
    capex_dt: Optional[float] = None
    reference_efficiency: Optional[float] = None
    load_factor: Optional[float] = None
    availability_hours_per_year: Optional[float] = None
    opex_dt_year: Optional[float] = None
    discount_rate: Optional[float] = None
    project_lifetime_years: Optional[int] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/recovery/summary")
def get_summary() -> dict[str, Any]:
    """Return KPI summary of all waste heat recovery opportunities."""
    opportunities, _ = _load_and_compute_all()
    summary = get_recovery_summary(opportunities)
    return summary


@router.get("/recovery/opportunities")
def get_opportunities() -> dict[str, Any]:
    """Return all ranked recovery opportunities."""
    opportunities, _ = _load_and_compute_all()
    return {
        "items": opportunities,
        "count": len(opportunities),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/recovery/opportunities/{source_id}")
def get_opportunity(source_id: str) -> dict[str, Any]:
    """Return a single opportunity by source_id."""
    opportunities, _ = _load_and_compute_all()
    match = next(
        (o for o in opportunities if o["source_id"] == source_id), None
    )
    if match is None:
        raise HTTPException(
            status_code=404,
            detail=f"Opportunity not found: {source_id!r}",
        )
    return match


@router.post("/recovery/simulate")
def simulate(request: SimulateRequest) -> dict[str, Any]:
    """
    Re-calculate a single opportunity with overridden parameters.
    Returns base, simulated, and delta values for key metrics.
    """
    overrides = request.model_dump(exclude_none=True)
    overrides.pop("source_id", None)

    try:
        result = simulate_opportunity(request.source_id, overrides)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.get("/recovery/export")
def export() -> dict[str, Any]:
    """Write submission JSON and Markdown report, return file paths."""
    opportunities, _ = _load_and_compute_all()
    result = export_recovery_outputs(opportunities)
    return result
