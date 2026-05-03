"""
scripts/validate_recovery.py — Track B validation script.

Run with: python scripts/validate_recovery.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure repo root is on path when run from any working directory
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT))

from utils.recovery import (
    _load_and_compute_all,
    export_recovery_outputs,
    get_recovery_summary,
)

REQUIRED_FIELDS = [
    "source_id",
    "name",
    "location",
    "temperature_c_min",
    "temperature_c_max",
    "captured_power_kw",
    "recoverable_energy_kwh_year",
    "co2_reduction_kg_year",
    "annual_savings_dt",
    # simple_payback_years may be null — we check existence not truthiness
    "priority_score",
    "assumptions",
]


def validate() -> None:
    print("=" * 60)
    print("Track B — Waste Heat Recovery Validation")
    print("=" * 60)

    # Load and compute
    opportunities, _ = _load_and_compute_all()

    # 1. At least 3 opportunities
    count = len(opportunities)
    assert count >= 3, f"Expected at least 3 opportunities, got {count}"
    print(f"[OK] {count} opportunities loaded")

    # 2. Required fields present on every opportunity
    for opp in opportunities:
        sid = opp.get("source_id", "UNKNOWN")
        for field in REQUIRED_FIELDS:
            assert field in opp, f"Missing field {field!r} on opportunity {sid!r}"
        # simple_payback_years must exist (even if None)
        assert "simple_payback_years" in opp, (
            f"Missing 'simple_payback_years' on opportunity {sid!r}"
        )
    print("[OK] All required fields present on all opportunities")

    # 3. No negative energy
    for opp in opportunities:
        sid = opp["source_id"]
        assert opp["recoverable_energy_kwh_year"] >= 0, (
            f"Negative energy on {sid!r}: {opp['recoverable_energy_kwh_year']}"
        )
    print("[OK] No negative energy values")

    # 3b. Input ranges remain valid
    for opp in opportunities:
        sid = opp["source_id"]
        assert 0.0 <= opp["load_factor"] <= 1.0, (
            f"load_factor out of range on {sid!r}: {opp['load_factor']}"
        )
        assert 0.0 <= opp["waste_heat_fraction"] <= 1.0, (
            f"waste_heat_fraction out of range on {sid!r}: {opp['waste_heat_fraction']}"
        )
        assert 0.0 <= opp["capture_efficiency"] <= 1.0, (
            f"capture_efficiency out of range on {sid!r}: {opp['capture_efficiency']}"
        )
        assert 0.0 < opp["reference_efficiency"] <= 1.0, (
            f"reference_efficiency out of range on {sid!r}: {opp['reference_efficiency']}"
        )
    print("[OK] Input ranges validated")

    # 4. No negative CO2
    for opp in opportunities:
        sid = opp["source_id"]
        assert opp["co2_reduction_kg_year"] >= 0, (
            f"Negative CO2 on {sid!r}: {opp['co2_reduction_kg_year']}"
        )
    print("[OK] No negative CO2 values")

    # 5. No negative CAPEX
    for opp in opportunities:
        sid = opp["source_id"]
        assert opp["capex_dt"] >= 0, (
            f"Negative CAPEX on {sid!r}: {opp['capex_dt']}"
        )
    print("[OK] No negative CAPEX values")

    # 6. Priority scores between 0 and 100
    for opp in opportunities:
        sid = opp["source_id"]
        score = opp["priority_score"]
        assert 0.0 <= score <= 100.0, (
            f"Priority score out of range on {sid!r}: {score}"
        )
    print("[OK] All priority scores in [0, 100]")

    # 7. Export outputs
    result = export_recovery_outputs(opportunities)
    print(f"[OK] Submission written: {result['submission_path']}")
    print(f"[OK] Report written:     {result['report_path']}")
    print(f"[OK] Items exported:     {result['items_exported']}")

    # 8. Summary
    summary = get_recovery_summary(opportunities)
    print()
    print("Summary:")
    print(f"  Total energy    : {summary['total_recoverable_energy_mwh_year']:.1f} MWh/year")
    print(f"  Total CO2       : {summary['total_co2_reduction_t_year']:.1f} tCO2/year")
    print(f"  Total savings   : {summary['total_annual_savings_dt']:,.0f} DT/year")
    best = summary['best_payback_years']
    print(f"  Best payback    : {f'{best:.1f} years' if best is not None else 'N/A'}")
    print(f"  Top opportunity : {summary['top_opportunity']}")

    print()
    print("Ranked opportunities:")
    for opp in sorted(opportunities, key=lambda o: o.get("priority_rank", 99)):
        payback = (
            f"{opp['simple_payback_years']:.1f} yr"
            if opp["simple_payback_years"] is not None
            else "N/A"
        )
        print(
            f"  #{opp['priority_rank']:2d} [{opp['priority_score']:5.1f}] "
            f"{opp['name']:<45} "
            f"{opp['recoverable_energy_mwh_year']:6.1f} MWh/yr  "
            f"payback {payback}"
        )

    print()
    print("=" * 60)
    print("All validations PASSED")
    print("=" * 60)


if __name__ == "__main__":
    validate()
