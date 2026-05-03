"""
utils/recovery.py — Waste Heat Recovery Decision Engine

Calculation engine for Track B: Waste Heat Recovery Opportunity Design.
All calculations are deterministic and config-driven.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_CONFIG_PATH = _REPO_ROOT / "configs" / "recovery_opportunities.json"
_SUBMISSIONS_DIR = _REPO_ROOT / "submissions"
_REPORTS_DIR = _REPO_ROOT / "reports"


# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------


def load_recovery_config(path: str | Path | None = None) -> dict:
    """Load recovery opportunities config from JSON file."""
    config_path = Path(path) if path else _DEFAULT_CONFIG_PATH
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Core calculation engine
# ---------------------------------------------------------------------------


def _require_range(name: str, value: float, *, min_value: float, max_value: float) -> None:
    if not (min_value <= value <= max_value):
        raise ValueError(f"{name} must be between {min_value} and {max_value}")


def _require_non_negative(name: str, value: float) -> None:
    if value < 0:
        raise ValueError(f"{name} must be >= 0")


def _payback_to_roi_score(payback: Optional[float]) -> float:
    """Convert simple payback (years) to ROI score 0-100."""
    if payback is None:
        return 0.0
    if payback <= 2.0:
        return 100.0
    if payback <= 5.0:
        # Linear interpolation from 100 to 60
        return 100.0 - (payback - 2.0) / 3.0 * 40.0
    if payback <= 8.0:
        # Linear interpolation from 60 to 25
        return 60.0 - (payback - 5.0) / 3.0 * 35.0
    return 10.0


def calculate_opportunity(raw: dict, global_parameters: dict) -> dict:
    """
    Calculate all derived fields for a single recovery opportunity.

    Parameters
    ----------
    raw : dict
        Raw opportunity from config (audit assumptions).
    global_parameters : dict
        Global constants: CO2 factors, gas price, efficiency, discount rate.

    Returns
    -------
    dict
        Fully computed opportunity object with calculation trace.
    """
    # ---- Input parameters ------------------------------------------------
    source_power_kw = float(raw["source_power_kw"])
    load_factor = float(raw["load_factor"])
    waste_heat_fraction = float(raw["waste_heat_fraction"])
    capture_efficiency = float(raw["capture_efficiency"])
    availability_hours = float(raw["availability_hours_per_year"])
    avoided_vector: str = raw.get("avoided_energy_vector", "natural_gas")

    _require_non_negative("source_power_kw", source_power_kw)
    _require_range("load_factor", load_factor, min_value=0.0, max_value=1.0)
    _require_range("waste_heat_fraction", waste_heat_fraction, min_value=0.0, max_value=1.0)
    _require_range("capture_efficiency", capture_efficiency, min_value=0.0, max_value=1.0)
    _require_non_negative("availability_hours_per_year", availability_hours)

    # Override CO2 factor from avoided vector
    if avoided_vector == "natural_gas":
        avoided_factor = float(
            raw.get(
                "avoided_emission_factor_kgco2_per_kwh",
                global_parameters["natural_gas_factor_kgco2_per_kwh"],
            )
        )
    elif avoided_vector == "electricity":
        avoided_factor = float(
            raw.get(
                "avoided_emission_factor_kgco2_per_kwh",
                global_parameters["grid_factor_kgco2_per_kwh"],
            )
        )
    else:
        avoided_factor = float(
            raw.get(
                "avoided_emission_factor_kgco2_per_kwh",
                global_parameters["natural_gas_factor_kgco2_per_kwh"],
            )
        )

    reference_efficiency = float(
        raw.get("reference_efficiency", global_parameters["default_boiler_efficiency"])
    )
    energy_price = float(
        raw.get(
            "energy_price_dt_per_kwh",
            global_parameters["default_gas_price_dt_per_kwh"],
        )
    )
    capex_dt = float(raw.get("capex_dt", 0.0))
    opex_dt_year = float(raw.get("opex_dt_year", 0.0))
    discount_rate = float(global_parameters.get("discount_rate", 0.05))
    project_lifetime = int(global_parameters.get("project_lifetime_years", 10))

    _require_range("reference_efficiency", reference_efficiency, min_value=0.01, max_value=1.0)
    _require_non_negative("energy_price_dt_per_kwh", energy_price)
    _require_non_negative("capex_dt", capex_dt)
    _require_non_negative("opex_dt_year", opex_dt_year)
    _require_range("discount_rate", discount_rate, min_value=0.0, max_value=1.0)
    _require_range("project_lifetime_years", float(project_lifetime), min_value=1.0, max_value=100.0)

    # ---- Core formulas ---------------------------------------------------
    # thermal_power_kw = source_power_kw * load_factor * waste_heat_fraction
    estimated_thermal_power_kw = source_power_kw * load_factor * waste_heat_fraction
    # captured_power_kw = estimated_thermal_power_kw * capture_efficiency
    captured_power_kw = estimated_thermal_power_kw * capture_efficiency
    # recoverable_energy_kwh_year = captured_power_kw * availability_hours
    recoverable_energy_kwh_year = captured_power_kw * availability_hours
    recoverable_energy_mwh_year = recoverable_energy_kwh_year / 1000.0

    # co2_reduction_kg_year = recoverable_energy_kwh_year * avoided_factor / reference_efficiency
    co2_reduction_kg_year = (
        recoverable_energy_kwh_year * avoided_factor / reference_efficiency
    )
    co2_reduction_t_year = co2_reduction_kg_year / 1000.0

    # annual_savings_dt = recoverable_energy_kwh_year * energy_price - opex_dt_year
    annual_savings_dt = recoverable_energy_kwh_year * energy_price - opex_dt_year

    # simple_payback_years = capex_dt / annual_savings_dt (null if savings <= 0)
    if annual_savings_dt > 0:
        simple_payback_years: Optional[float] = round(
            capex_dt / annual_savings_dt, 2
        )
    else:
        simple_payback_years = None

    # npv_10y_dt = annual_savings_dt * annuity_factor - capex_dt
    if project_lifetime <= 0:
        npv_10y_dt = -capex_dt
    elif discount_rate == 0.0:
        annuity_factor = float(project_lifetime)
        npv_10y_dt = annual_savings_dt * annuity_factor - capex_dt
    else:
        annuity_factor = (
            1.0 - (1.0 + discount_rate) ** (-project_lifetime)
        ) / discount_rate
        npv_10y_dt = annual_savings_dt * annuity_factor - capex_dt

    # ---- Scoring inputs --------------------------------------------------
    integration_complexity_score: int = int(
        raw.get("integration_complexity_score", 5)
    )
    measurement_confidence_score_input: int = int(
        raw.get("measurement_confidence_score", 5)
    )

    # Feasibility score: 100 - complexity * 10
    feasibility_score = 100.0 - integration_complexity_score * 10.0
    # Measurement confidence score: input * 10
    measurement_confidence_score_out = float(measurement_confidence_score_input * 10)
    # ROI score from payback
    roi_score = _payback_to_roi_score(simple_payback_years)

    # Complexity label
    if integration_complexity_score <= 3:
        complexity_label = "low"
    elif integration_complexity_score <= 6:
        complexity_label = "medium"
    else:
        complexity_label = "high"

    # Calculation trace (for traceability)
    calculation_trace = [
        f"thermal_power_kw = {source_power_kw} * {load_factor} * {waste_heat_fraction} = {round(estimated_thermal_power_kw, 2)}",
        f"captured_power_kw = {round(estimated_thermal_power_kw, 2)} * {capture_efficiency} = {round(captured_power_kw, 2)}",
        f"recoverable_energy_kwh_year = {round(captured_power_kw, 2)} * {availability_hours} = {round(recoverable_energy_kwh_year, 0):.0f}",
        f"co2_reduction_kg_year = {round(recoverable_energy_kwh_year, 0):.0f} * {avoided_factor} / {reference_efficiency} = {round(co2_reduction_kg_year, 0):.0f}",
        f"annual_savings_dt = {round(recoverable_energy_kwh_year, 0):.0f} * {energy_price} - {opex_dt_year} = {round(annual_savings_dt, 2)}",
        f"npv_10y_dt = {round(annual_savings_dt, 2)} * {round(annuity_factor, 4)} - {capex_dt} = {round(npv_10y_dt, 0):.0f}",
    ]

    result = {
        "source_id": raw["source_id"],
        "name": raw["name"],
        "system": raw["system"],
        "location": raw["location"],
        "description": raw["description"],
        "temperature_c_min": raw.get("temperature_c_min", 0),
        "temperature_c_max": raw.get("temperature_c_max", 0),
        "source_power_kw": source_power_kw,
        "load_factor": load_factor,
        "waste_heat_fraction": waste_heat_fraction,
        "capture_efficiency": capture_efficiency,
        "estimated_thermal_power_kw": round(estimated_thermal_power_kw, 2),
        "captured_power_kw": round(captured_power_kw, 2),
        "availability_hours_per_year": availability_hours,
        "recoverable_energy_kwh_year": round(recoverable_energy_kwh_year, 0),
        "recoverable_energy_mwh_year": round(recoverable_energy_mwh_year, 2),
        "avoided_energy_vector": avoided_vector,
        "avoided_emission_factor_kgco2_per_kwh": avoided_factor,
        "reference_efficiency": reference_efficiency,
        "co2_reduction_kg_year": round(co2_reduction_kg_year, 0),
        "co2_reduction_t_year": round(co2_reduction_t_year, 2),
        "energy_price_dt_per_kwh": energy_price,
        "annual_savings_dt": round(annual_savings_dt, 2),
        "opex_dt_year": opex_dt_year,
        "capex_dt": capex_dt,
        "simple_payback_years": simple_payback_years,
        "npv_10y_dt": round(npv_10y_dt, 0),
        "integration_complexity_score": integration_complexity_score,
        "implementation_cost_score": raw.get("implementation_cost_score", 5),
        "measurement_confidence_score": measurement_confidence_score_input,
        "strategic_fit_score": raw.get("strategic_fit_score", 5),
        # Scoring sub-scores (normalized after ranking)
        "_feasibility_score": feasibility_score,
        "_measurement_confidence_score_out": measurement_confidence_score_out,
        "_roi_score": roi_score,
        "complexity_label": complexity_label,
        "assumptions": raw.get("assumptions", []),
        "calculation_trace": calculation_trace,
        "data_quality": "audit_assumption",
        "requires_measurement": raw.get("requires_measurement", []),
    }

    return result


def rank_opportunities(opportunities: list[dict]) -> list[dict]:
    """
    Normalize energy/CO2 scores and compute weighted priority scores.
    Ranks by priority_score desc, then simple_payback_years asc.
    """
    if not opportunities:
        return []

    # Normalise energy score
    max_energy = max(o["recoverable_energy_kwh_year"] for o in opportunities)
    max_co2 = max(o["co2_reduction_kg_year"] for o in opportunities)

    for opp in opportunities:
        energy_score = (
            100.0 * opp["recoverable_energy_kwh_year"] / max_energy
            if max_energy > 0
            else 0.0
        )
        co2_score = (
            100.0 * opp["co2_reduction_kg_year"] / max_co2 if max_co2 > 0 else 0.0
        )
        roi_score = opp["_roi_score"]
        feasibility_score = opp["_feasibility_score"]
        meas_conf_score = opp["_measurement_confidence_score_out"]

        priority_score = (
            0.30 * energy_score
            + 0.25 * co2_score
            + 0.20 * roi_score
            + 0.15 * feasibility_score
            + 0.10 * meas_conf_score
        )
        
        # Bound the priority score between 0 and 100
        priority_score = max(0.0, min(100.0, priority_score))

        opp["priority_score"] = round(priority_score, 1)
        opp["_energy_score"] = round(energy_score, 1)
        opp["_co2_score"] = round(co2_score, 1)

    # Sort
    def sort_key(o: dict):
        payback = o["simple_payback_years"] if o["simple_payback_years"] is not None else 9999.0
        return (-o["priority_score"], payback)

    ranked = sorted(opportunities, key=sort_key)

    for idx, opp in enumerate(ranked, start=1):
        opp["priority_rank"] = idx

    return ranked


# ---------------------------------------------------------------------------
# Public API functions
# ---------------------------------------------------------------------------


def _load_and_compute_all() -> tuple[list[dict], dict]:
    """Load config and compute all opportunities."""
    cfg = load_recovery_config()
    global_params = cfg["global_parameters"]
    raw_opportunities = cfg["opportunities"]
    computed = [calculate_opportunity(r, global_params) for r in raw_opportunities]
    ranked = rank_opportunities(computed)
    return ranked, global_params


def simulate_opportunity(source_id: str, overrides: dict) -> dict:
    """
    Simulate a single opportunity with overridden parameters.

    Parameters
    ----------
    source_id : str
        The opportunity to simulate.
    overrides : dict
        Fields to override (e.g. capture_efficiency, capex_dt, etc.)

    Returns
    -------
    dict
        {"base": {...}, "simulated": {...}, "deltas": {...}}
    """
    cfg = load_recovery_config()
    global_params = cfg["global_parameters"]
    raw_opportunities = cfg["opportunities"]

    raw = next((r for r in raw_opportunities if r["source_id"] == source_id), None)
    if raw is None:
        raise KeyError(f"source_id not found: {source_id!r}")

    base = calculate_opportunity(raw, global_params)

    # Override global params
    sim_global = dict(global_params)
    if "discount_rate" in overrides:
        sim_global["discount_rate"] = float(overrides["discount_rate"])
    if "project_lifetime_years" in overrides:
        sim_global["project_lifetime_years"] = int(overrides["project_lifetime_years"])

    # Override raw fields
    sim_raw = dict(raw)
    for field in (
        "capture_efficiency",
        "energy_price_dt_per_kwh",
        "capex_dt",
        "reference_efficiency",
        "load_factor",
        "availability_hours_per_year",
        "opex_dt_year",
    ):
        if field in overrides:
            sim_raw[field] = overrides[field]

    simulated = calculate_opportunity(sim_raw, sim_global)

    # Compute deltas for key metrics
    def delta(key: str) -> float:
        base_val = base.get(key) or 0.0
        sim_val = simulated.get(key) or 0.0
        return round(sim_val - base_val, 2)

    payback_delta = None
    if simulated["simple_payback_years"] is not None and base["simple_payback_years"] is not None:
        payback_delta = round(
            simulated["simple_payback_years"] - base["simple_payback_years"], 2
        )

    deltas = {
        "recoverable_energy_kwh_year": delta("recoverable_energy_kwh_year"),
        "recoverable_energy_mwh_year": delta("recoverable_energy_mwh_year"),
        "co2_reduction_t_year": delta("co2_reduction_t_year"),
        "annual_savings_dt": delta("annual_savings_dt"),
        "simple_payback_years": payback_delta,
        "npv_10y_dt": delta("npv_10y_dt"),
    }

    return {"base": base, "simulated": simulated, "deltas": deltas}


def get_recovery_summary(opportunities: list[dict]) -> dict:
    """Build KPI summary from a ranked opportunity list."""
    if not opportunities:
        return {
            "total_recoverable_energy_kwh_year": 0,
            "total_recoverable_energy_mwh_year": 0,
            "total_co2_reduction_t_year": 0,
            "total_annual_savings_dt": 0,
            "best_payback_years": None,
            "top_opportunity": None,
            "opportunity_count": 0,
        }

    total_energy_kwh = sum(o["recoverable_energy_kwh_year"] for o in opportunities)
    total_co2_t = sum(o["co2_reduction_t_year"] for o in opportunities)
    total_savings = sum(o["annual_savings_dt"] for o in opportunities)

    paybacks = [
        o["simple_payback_years"]
        for o in opportunities
        if o["simple_payback_years"] is not None
    ]
    best_payback = min(paybacks) if paybacks else None

    # Top opportunity = rank 1
    top = next((o for o in opportunities if o.get("priority_rank") == 1), opportunities[0])

    return {
        "total_recoverable_energy_kwh_year": round(total_energy_kwh, 0),
        "total_recoverable_energy_mwh_year": round(total_energy_kwh / 1000.0, 2),
        "total_co2_reduction_t_year": round(total_co2_t, 2),
        "total_annual_savings_dt": round(total_savings, 2),
        "best_payback_years": best_payback,
        "top_opportunity": top["source_id"],
        "opportunity_count": len(opportunities),
    }


def export_recovery_outputs(opportunities: list[dict]) -> dict:
    """
    Write submissions/recovery_opportunities.json and reports/waste_heat_report.md.

    Returns
    -------
    dict
        {"submission_path": ..., "report_path": ..., "items_exported": ...}
    """
    _SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)
    _REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    generated_at = datetime.now(timezone.utc).isoformat()
    summary = get_recovery_summary(opportunities)

    # ---- Submission JSON ------------------------------------------------
    submission = {
        "track": "Part 3 Track B - Waste Heat Recovery Opportunity Design",
        "site": "Adwya pharmaceutical factory demo",
        "generated_at": generated_at,
        "method": {
            "description": "Audit-config driven waste heat ranking engine",
            "scoring_weights": {
                "recoverable_energy": 0.30,
                "co2_reduction": 0.25,
                "roi": 0.20,
                "feasibility": 0.15,
                "measurement_confidence": 0.10,
            },
        },
        "summary": summary,
        "opportunities": opportunities,
    }

    submission_path = _SUBMISSIONS_DIR / "recovery_opportunities.json"
    with open(submission_path, "w", encoding="utf-8") as f:
        json.dump(submission, f, ensure_ascii=False, indent=2)

    # ---- Markdown Report ------------------------------------------------
    report_lines = _generate_markdown_report(opportunities, summary, generated_at)
    report_path = _REPORTS_DIR / "waste_heat_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    return {
        "submission_path": str(submission_path.relative_to(_REPO_ROOT)),
        "report_path": str(report_path.relative_to(_REPO_ROOT)),
        "items_exported": len(opportunities),
    }


def _generate_markdown_report(
    opportunities: list[dict], summary: dict, generated_at: str
) -> list[str]:
    """Generate Markdown report content."""
    lines = [
        "# Waste Heat Recovery Report",
        "",
        f"> Generated: {generated_at}",
        f"> Site: Adwya pharmaceutical factory (Kilani Group)",
        "",
        "> **DISCLAIMER**: Some values are audit-derived engineering estimates, "
        "not certified investment-grade measurements. "
        "All figures must be validated by on-site instrumentation before final investment decisions.",
        "",
        "---",
        "",
        "## 1. Objective",
        "",
        "Identify, quantify, rank, and simulate waste heat recovery opportunities "
        "at the Adwya pharmaceutical production site. "
        "The goal is to transform audit observations into a ranked, actionable investment roadmap.",
        "",
        "---",
        "",
        "## 2. Data Sources",
        "",
        "| Source | Description |",
        "|--------|-------------|",
        "| `configs/recovery_opportunities.json` | Primary audit-based assumptions |",
        "| `utils/energy.py` | CO₂ emission factors and conversion constants |",
        "| Site audit context | Process descriptions, equipment ratings, and shift schedules |",
        "",
        "---",
        "",
        "## 3. Global Assumptions",
        "",
        "| Parameter | Value |",
        "|-----------|-------|",
        "| Natural gas CO₂ factor | 0.202 kgCO₂/kWh |",
        "| Grid electricity CO₂ factor | 0.50 kgCO₂/kWh |",
        "| Default boiler efficiency | 90% |",
        "| Natural gas price | 0.028 DT/kWh |",
        "| Discount rate | 5% |",
        "| Project lifetime | 10 years |",
        "",
        "---",
        "",
        "## 4. Scoring Method",
        "",
        "Opportunities are ranked using a weighted priority score (0–100):",
        "",
        "| Criterion | Weight | Sub-score basis |",
        "|-----------|--------|-----------------|",
        "| Recoverable energy | 30% | Normalised vs max in set |",
        "| CO₂ reduction | 25% | Normalised vs max in set |",
        "| Return on investment | 20% | Derived from simple payback |",
        "| Feasibility | 15% | Inverse of integration complexity |",
        "| Measurement confidence | 10% | Direct input score × 10 |",
        "",
        "---",
        "",
        "## 5. Ranked Opportunities",
        "",
        "| Rank | Name | System | Cap. Power kW | Energy MWh/yr | CO₂ t/yr | Savings DT/yr | CAPEX DT | Payback yr | Score |",
        "|------|------|--------|--------------|--------------|----------|--------------|---------|-----------|-------|",
    ]

    for opp in sorted(opportunities, key=lambda o: o.get("priority_rank", 99)):
        payback = (
            f"{opp['simple_payback_years']:.1f}"
            if opp["simple_payback_years"] is not None
            else "N/A"
        )
        lines.append(
            f"| {opp['priority_rank']} "
            f"| {opp['name']} "
            f"| {opp['system']} "
            f"| {opp['captured_power_kw']:.1f} "
            f"| {opp['recoverable_energy_mwh_year']:.1f} "
            f"| {opp['co2_reduction_t_year']:.1f} "
            f"| {opp['annual_savings_dt']:,.0f} "
            f"| {opp['capex_dt']:,.0f} "
            f"| {payback} "
            f"| {opp['priority_score']:.1f} |"
        )

    lines += [
        "",
        "---",
        "",
        "## 6. Top 3 Recommended Scenarios",
        "",
    ]

    top3 = sorted(opportunities, key=lambda o: o.get("priority_rank", 99))[:3]
    for opp in top3:
        payback = (
            f"{opp['simple_payback_years']:.1f} years"
            if opp["simple_payback_years"] is not None
            else "N/A"
        )
        lines += [
            f"### {opp['priority_rank']}. {opp['name']}",
            "",
            f"- **System**: {opp['system']}",
            f"- **Location**: {opp['location']}",
            f"- **Captured power**: {opp['captured_power_kw']:.1f} kW",
            f"- **Recoverable energy**: {opp['recoverable_energy_mwh_year']:.1f} MWh/year",
            f"- **CO₂ reduction**: {opp['co2_reduction_t_year']:.1f} tCO₂/year",
            f"- **Annual savings**: {opp['annual_savings_dt']:,.0f} DT/year",
            f"- **CAPEX**: {opp['capex_dt']:,.0f} DT",
            f"- **Simple payback**: {payback}",
            f"- **NPV (10y)**: {opp['npv_10y_dt']:,.0f} DT",
            f"- **Priority score**: {opp['priority_score']:.1f}/100",
            f"- **Complexity**: {opp['complexity_label']}",
            "",
            f"**Assumptions**: {'; '.join(opp['assumptions'][:3])}",
            "",
        ]

    lines += [
        "---",
        "",
        "## 7. Sensitivity Notes",
        "",
        "- Compressor heat recovery payback is sensitive to actual load factor and nearby hot water demand.",
        "- Boiler economizer savings depend heavily on flue gas temperature (not measured — assumed 160°C).",
        "- Chiller condenser heat recovery requires demand validation; low temperature (35–45°C) limits usability.",
        "- Trigeneration dispatch optimization savings are contingent on operational scheduling changes.",
        "- All savings assume stable natural gas price of 0.028 DT/kWh.",
        "",
        "---",
        "",
        "## 8. Measurement Gaps",
        "",
        "The following measurements are required before investment-grade analysis:",
        "",
    ]

    for opp in opportunities:
        if opp.get("requires_measurement"):
            lines.append(f"**{opp['name']}**:")
            for m in opp["requires_measurement"]:
                lines.append(f"- {m}")
            lines.append("")

    lines += [
        "---",
        "",
        "## 9. Jury Demo Path",
        "",
        "```",
        "1. Open /recovery dashboard page",
        "2. Review KPI cards: total MWh, CO₂, savings, best payback",
        "3. Review ranked opportunity table",
        "4. Use simulator: change capture_efficiency on compressor recovery",
        "5. Observe delta in payback and NPV",
        "6. Click 'Export Track B Submission'",
        "7. Show generated JSON and Markdown report",
        "```",
        "",
        "**Pitch**: Our platform does not stop at CO₂ reporting. After ingesting documents, "
        "telemetry, and SCADA-like data, it closes the decision loop by identifying where "
        "the plant is wasting recoverable heat, ranking the opportunities by energy, CO₂ impact, "
        "ROI, feasibility, and confidence, then turning the audit into an actionable investment roadmap.",
        "",
        "---",
        f"*Report generated by NRTF Recovery Engine — {generated_at}*",
    ]

    return lines
