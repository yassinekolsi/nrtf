from __future__ import annotations

import argparse
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from utils.scada_excel import parse_numeric_value, parse_scada_excel


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed SCADA ledger from a BILAN TOTAL Excel file."
    )
    parser.add_argument("xlsx_path", type=Path, help="Path to the .xlsx file")
    parser.add_argument(
        "--interval-minutes",
        type=int,
        default=10,
        help="Sampling interval in minutes (default: 10)",
    )
    parser.add_argument(
        "--pci-factor",
        type=str,
        default="",
        help="Override PCI factor (default: read from file)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse the file and print stats without inserting into the database",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.xlsx_path.exists():
        print(f"File not found: {args.xlsx_path}")
        return 1

    file_bytes = args.xlsx_path.read_bytes()
    pci_override = parse_numeric_value(args.pci_factor) if args.pci_factor else None

    try:
        readings, stats = parse_scada_excel(
            file_bytes,
            interval_minutes=args.interval_minutes,
            pci_factor_override=pci_override,
        )
    except Exception as exc:
        print(f"Failed to parse SCADA Excel: {exc}")
        return 1

    print(
        "Parsed SCADA Excel: "
        f"sheet={stats.sheet_name}, "
        f"columns={stats.total_columns}, "
        f"parsed={stats.parsed_columns}, "
        f"skipped={stats.skipped_columns}, "
        f"pci={stats.pci_factor}, "
        f"interval={stats.interval_minutes}m"
    )

    if not readings:
        print("No readings found. Nothing to insert.")
        return 1

    if args.dry_run:
        print("Dry run enabled - no database writes performed.")
        return 0

    from database import SessionLocal
    from models import ScadaLedger

    db = SessionLocal()
    try:
        records = [
            ScadaLedger(
                timestamp=reading.timestamp,
                normalized_kwh=reading.normalized_kwh,
                power_gross_kw=reading.power_gross_kw,
                gas_flow_nm3h=reading.gas_flow_nm3h,
                raw_metrics=reading.raw_metrics,
            )
            for reading in readings
        ]
        db.add_all(records)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Failed to insert SCADA records: {exc}")
        return 1
    finally:
        db.close()

    print(f"Inserted {len(readings)} SCADA records.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
