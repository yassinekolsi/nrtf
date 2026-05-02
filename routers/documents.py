from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import time
import unicodedata
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import Documents
from schemas import (
    DocumentReviewUpdate,
    DocumentsBatchUploadItem,
    DocumentsBatchUploadResponse,
    DocumentsRead,
)
from utils.energy import (
    UNIT_TO_KWH,
    estimate_co2_kg,
    normalize_gas_to_kwh,
    normalize_to_kwh,
)

router = APIRouter()

GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("EXPO_PUBLIC_GEMINI_API_KEY")
)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite-preview")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "45"))
GEMINI_MAX_RETRIES = max(0, int(os.getenv("GEMINI_MAX_RETRIES", "2")))
GEMINI_RETRY_BACKOFF_SECONDS = float(os.getenv("GEMINI_RETRY_BACKOFF_SECONDS", "8"))
GEMINI_MAX_RETRY_WAIT_SECONDS = float(os.getenv("GEMINI_MAX_RETRY_WAIT_SECONDS", "65"))
DEFAULT_PCI_FACTOR = 9.082
REVIEW_THRESHOLD = 80.0
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_ROOT = BASE_DIR / "data"
UPLOADS_DIR = DATA_ROOT / "uploads"

REVIEW_STATUSES = {"processing", "accepted", "requires_review", "failed"}
CANONICAL_DOC_TYPES = {
    "STEG_ELECTRICITY_BILL",
    "STEG_GAS_BILL",
    "SONEDE_WATER_BILL",
    "STEG_METER_READING",
    "STEG_PURCHASE_SALE_READING",
    "OTHER",
}
METER_LIKE_DOC_TYPES = {"STEG_METER_READING", "STEG_PURCHASE_SALE_READING"}
SUPPORTED_CO2_ENERGY_TYPES = {"electricity", "natural_gas", "fuel_oil", "coal"}
DOC_TYPE_TO_ENERGY_TYPE = {
    "STEG_ELECTRICITY_BILL": "electricity",
    "STEG_GAS_BILL": "natural_gas",
    "SONEDE_WATER_BILL": "water",
    "STEG_METER_READING": "electricity",
    "STEG_PURCHASE_SALE_READING": "electricity",
    "OTHER": "other",
}
CANONICAL_FIELDS = (
    "doc_type",
    "supplier",
    "invoice_number",
    "reference_number",
    "document_date",
    "billing_month",
    "site_name",
    "client_name",
    "energy_type",
    "raw_value",
    "raw_unit",
    "pci_factor",
    "amount_ttc",
    "index_ancien",
    "index_nouveau",
    "subscribed_power",
)
NUMERIC_FIELDS = {
    "raw_value",
    "pci_factor",
    "amount_ttc",
    "index_ancien",
    "index_nouveau",
    "subscribed_power",
}
FIELD_ALIASES = {
    "doc_type": (
        "doc_type",
        "document_type",
        "document_kind",
        "type",
    ),
    "supplier": ("supplier", "provider"),
    "invoice_number": (
        "invoice_number",
        "numero_facture",
        "facture_number",
        "n_facture",
    ),
    "reference_number": (
        "reference_number",
        "reference",
        "ref",
        "code_payeur",
    ),
    "document_date": (
        "document_date",
        "date",
        "date_document",
        "issue_date",
    ),
    "billing_month": (
        "billing_month",
        "period",
        "periode",
        "month",
        "mois",
    ),
    "site_name": (
        "site_name",
        "site",
        "adresse",
        "address",
    ),
    "client_name": (
        "client_name",
        "client",
        "consumer",
        "consommateur",
        "payer",
        "payeur",
    ),
    "energy_type": ("energy_type",),
    "raw_value": (
        "raw_value",
        "energy_quantity",
        "quantity",
        "consumption",
        "consommation_kwh",
        "volume_m3",
        "volume_nm3",
    ),
    "raw_unit": ("raw_unit", "unit"),
    "pci_factor": ("pci_factor", "pci"),
    "amount_ttc": (
        "amount_ttc",
        "montant_ttc",
        "total_amount_ttc",
        "montant",
    ),
    "index_ancien": ("index_ancien", "old_index"),
    "index_nouveau": ("index_nouveau", "new_index"),
    "subscribed_power": (
        "subscribed_power",
        "puissance_souscrite",
        "puissance",
    ),
}
MONTH_NAME_TO_NUMBER = {
    "janvier": 1,
    "janv": 1,
    "january": 1,
    "jan": 1,
    "fevrier": 2,
    "fevr": 2,
    "february": 2,
    "feb": 2,
    "mars": 3,
    "march": 3,
    "avril": 4,
    "avr": 4,
    "april": 4,
    "apr": 4,
    "mai": 5,
    "may": 5,
    "juin": 6,
    "june": 6,
    "jun": 6,
    "juillet": 7,
    "juil": 7,
    "july": 7,
    "jul": 7,
    "aout": 8,
    "août": 8,
    "august": 8,
    "aug": 8,
    "septembre": 9,
    "sept": 9,
    "september": 9,
    "sep": 9,
    "octobre": 10,
    "oct": 10,
    "october": 10,
    "novembre": 11,
    "nov": 11,
    "november": 11,
    "decembre": 12,
    "dec": 12,
    "december": 12,
}

METER_CODE_TO_LABEL = {
    "1.8.3": "Jour",
    "1.8.2": "Pointe",
    "1.8.1": "Nuit",
    "1.8.4": "Soire",
    "5.8.0": "Reactive",
    "1.6.3": "I Max J",
    "1.6.2": "I Max P",
    "1.6.4": "I Max S",
    "2.8.3": "Jour",
    "2.8.2": "Pointe",
    "2.8.1": "Nuit",
    "2.8.4": "Soire",
    "6.8.3": "QII Jour",
    "6.8.2": "QII Pointe",
    "6.8.1": "QII Nuit",
    "6.8.4": "QII Soire",
}
METER_REGISTER_ROW_DEFAULTS = {
    "STEG": [
        ("Jour", "1.8.3"),
        ("Pointe", "1.8.2"),
        ("Nuit", "1.8.1"),
        ("Soire", "1.8.4"),
        ("Reactive", "5.8.0"),
        ("I Max J", "1.6.3"),
        ("I Max P", "1.6.2"),
        ("I Max S", "1.6.4"),
    ],
    "Injection": [
        ("Jour", "2.8.3"),
        ("Pointe", "2.8.2"),
        ("Nuit", "2.8.1"),
        ("Soire", "2.8.4"),
        ("QII Jour", "6.8.3"),
        ("QII Pointe", "6.8.2"),
        ("QII Nuit", "6.8.1"),
        ("QII Soire", "6.8.4"),
    ],
    "Redressee": [
        ("Jour", "2.8.3"),
        ("Pointe", "2.8.2"),
        ("Nuit", "2.8.1"),
        ("Soire", "2.8.4"),
        ("QII Jour", "6.8.3"),
        ("QII Pointe", "6.8.2"),
        ("QII Nuit", "6.8.1"),
        ("QII Soire", "6.8.4"),
    ],
    "Production": [("Produite", None)],
}
METER_SECTION_TITLES = {
    "consumption": "Consumption Side",
    "injection": "Injection Side",
    "production": "Production Side",
    "other": "Other",
}

SYSTEM_PROMPT = """You are a strict OCR extraction API for industrial energy documents.

The uploaded document can be:
- a STEG electricity bill
- a STEG gas bill
- a SONEDE water bill
- a STEG meter-reading sheet such as FICHE RELEVE ENERGIE ACHAT ET VENTE
- a STEG cogeneration purchase/sale reading sheet
- or another industrial utility document in French, Arabic, or English

Return ONLY a raw JSON object using this schema:
{
  "doc_type": "STEG_ELECTRICITY_BILL | STEG_GAS_BILL | SONEDE_WATER_BILL | STEG_METER_READING | STEG_PURCHASE_SALE_READING | OTHER",
  "supplier": "string or null",
  "invoice_number": "string or null",
  "reference_number": "string or null",
  "document_date": "string or null",
  "billing_month": "MM/YYYY string or null",
  "site_name": "string or null",
  "client_name": "string or null",
  "energy_type": "electricity | natural_gas | water | other | null",
  "raw_value": "number or null",
  "raw_unit": "string or null",
  "pci_factor": "number or null",
  "amount_ttc": "number or null",
  "index_ancien": "number or null",
  "index_nouveau": "number or null",
  "subscribed_power": "number or null",
  "field_confidences": {
    "doc_type": "number 0-100 or null",
    "supplier": "number 0-100 or null",
    "document_date": "number 0-100 or null",
    "billing_month": "number 0-100 or null",
    "raw_value": "number 0-100 or null",
    "raw_unit": "number 0-100 or null",
    "amount_ttc": "number 0-100 or null"
  },
  "warnings": ["string"],
  "doc_specific": {},
  "ocr_confidence": "number 0-100",
  "readability_confidence": "number 0-100",
  "classification_confidence": "number 0-100"
}

Rules:
- Do not add markdown fences or commentary.
- Do not invent data. Use null when a field is absent or unreadable.
- billing_month must be MM/YYYY when a month/year is visible.
- For electricity bills, prefer the main energy quantity in kWh for raw_value/raw_unit.
- For gas bills, prefer the gas volume and its unit for raw_value/raw_unit.
- For meter-reading sheets, do not force invoice-like values. If there is no single trustworthy aggregate quantity, keep raw_value null.
- For meter-reading sheets, keep register tables inside doc_specific.registers as an array of grouped tables:
  {
    "registers": [
      {
        "register_label": "STEG | Injection | Redressee | Production | other label",
        "side": "consumption | injection | production | other | null",
        "register_role": "grid_consumption | injection_principal | injection_redressee | production_ctr | other | null",
        "register_id": "string or null",
        "reading_name": "string or null",
        "rows": [
          {
            "label": "Jour | Pointe | Nuit | Soire | Reactive | QII Jour | ...",
            "code": "OBIS code string or null",
            "ancien": "number or null",
            "nouveau": "number or null",
            "delta": "number or null"
          }
        ]
      }
    ]
  }
- When several side-by-side register tables exist on the same page, return them as separate register objects, not as a single merged list.
- For cogeneration purchase/sale sheets, keep these distinct when visible: STEG consumption side, injection principal CTR, injection redressee/redundant CTR, and production CTR.
- Preserve visible register IDs such as CTR numbers whenever they are readable.
- For FICHE RELEVE ENERGIE ACHAT ET VENTE documents with both purchase and sale/injection registers, classify as STEG_PURCHASE_SALE_READING.
- Use STEG_METER_READING only for simpler register sheets that are not the cogeneration purchase/sale form.
- If the document is not clearly one of the supported types, set doc_type to OTHER.
"""


def _strip_accents(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value) if not unicodedata.combining(char)
    )


def _gemini_stub(error_message: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "canonical": {field: None for field in CANONICAL_FIELDS},
        "raw_extracted": {field: None for field in CANONICAL_FIELDS},
        "field_confidences": {},
        "warnings": [],
        "doc_specific": {},
        "ocr_confidence": 0.0,
        "readability_confidence": 0.0,
        "classification_confidence": 0.0,
        "gemini_model": GEMINI_MODEL,
    }
    if error_message:
        payload["ocr_error"] = error_message
        payload["warnings"].append(error_message)
    return payload


def _clean_text_value(value: Any) -> str | None:
    if value is None:
        return None

    text_value = str(value).strip()
    if not text_value:
        return None

    if text_value.lower() in {"null", "none", "n/a", "unknown", "not specified"}:
        return None

    return text_value


def _parse_numeric_value(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return float(value)

    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    compact = re.sub(r"[^\d,.\-]", "", text_value.replace("\u00a0", ""))
    if not compact:
        return None

    if "," in compact and "." in compact:
        if compact.rfind(",") > compact.rfind("."):
            compact = compact.replace(".", "").replace(",", ".")
        else:
            compact = compact.replace(",", "")
    elif compact.count(",") == 1 and compact.count(".") == 0:
        compact = compact.replace(",", ".")
    elif compact.count(",") > 1 and compact.count(".") == 0:
        compact = compact.replace(",", "")
    elif compact.count(".") > 1 and compact.count(",") == 0:
        compact = compact.replace(".", "")

    try:
        return float(compact)
    except ValueError:
        return None


def _detect_mime_type(filename: str | None, content_type: str | None) -> str:
    if content_type and "/" in content_type:
        return content_type

    guessed_type, _ = mimetypes.guess_type(filename or "")
    if guessed_type:
        return guessed_type

    return "application/octet-stream"


def _is_path_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _slugify_filename(value: str) -> str:
    normalized = _strip_accents(value).lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized or "document"


def _store_source_file(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> dict[str, Any]:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    original_path = Path(filename)
    extension = "".join(original_path.suffixes).lower()
    safe_stem = _slugify_filename(original_path.stem)[:80]
    stored_name = f"{safe_stem}-{uuid4().hex}{extension}"
    stored_path = UPLOADS_DIR / stored_name
    stored_path.write_bytes(file_bytes)

    return {
        "source_filename": original_path.name,
        "source_storage_path": str(stored_path),
        "source_content_type": _detect_mime_type(original_path.name, content_type),
        "source_size_bytes": len(file_bytes),
    }


def _guess_media_type_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    guessed_type, _ = mimetypes.guess_type(filename)
    return guessed_type


def _resolve_document_source_path(document: Documents) -> tuple[Path | None, str | None]:
    raw_json = document.raw_json if isinstance(document.raw_json, dict) else {}
    stored_path_value = raw_json.get("source_storage_path")
    source_content_type = _clean_text_value(raw_json.get("source_content_type"))

    if isinstance(stored_path_value, str):
        stored_path = Path(stored_path_value)
        if stored_path.exists() and _is_path_within_root(stored_path, DATA_ROOT):
            return stored_path, source_content_type or _guess_media_type_from_filename(stored_path.name)

    if document.filename:
        matches = [path for path in DATA_ROOT.rglob(document.filename) if path.is_file()]
        if matches:
            matched_path = matches[0]
            return matched_path, source_content_type or _guess_media_type_from_filename(matched_path.name)

    return None, source_content_type


def _parse_year_fragment(value: str) -> int:
    year = int(value)
    if len(value) == 2:
        return 2000 + year
    return year


def _normalize_billing_month(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    compact = re.sub(r"\s+", " ", text_value.strip())
    month_year_match = re.search(r"(?<!\d)(0?[1-9]|1[0-2])[/-](\d{4})(?!\d)", compact)
    if month_year_match:
        month = int(month_year_match.group(1))
        year = int(month_year_match.group(2))
        return f"{month:02d}/{year:04d}"

    iso_month_match = re.search(r"(?<!\d)(\d{4})[/-](0?[1-9]|1[0-2])(?!\d)", compact)
    if iso_month_match:
        year = int(iso_month_match.group(1))
        month = int(iso_month_match.group(2))
        return f"{month:02d}/{year:04d}"

    full_date_match = re.search(
        r"(?<!\d)(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](\d{2,4})(?!\d)",
        compact,
    )
    if full_date_match:
        month = int(full_date_match.group(2))
        year = _parse_year_fragment(full_date_match.group(3))
        return f"{month:02d}/{year:04d}"

    normalized = _strip_accents(compact).lower()
    for month_name, month_number in MONTH_NAME_TO_NUMBER.items():
        month_pattern = rf"\b{re.escape(month_name)}\b[\s\-_:/]*(\d{{2,4}})"
        month_name_match = re.search(month_pattern, normalized)
        if month_name_match:
            year = _parse_year_fragment(month_name_match.group(1))
            return f"{month_number:02d}/{year:04d}"

    return None


def _validate_optional_billing_month(value: str | None) -> str | None:
    if _clean_text_value(value) is None:
        return None

    normalized = _normalize_billing_month(value)
    if normalized is None:
        raise ValueError("billing_month must use MM/YYYY format.")

    return normalized


def _normalize_review_status(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip().lower()
    if normalized not in REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid review_status filter.")
    return normalized


def _normalize_supplier(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    lowered = _strip_accents(text_value).lower()
    if "sonede" in lowered:
        return "SONEDE"
    if "steg" in lowered or "electricite" in lowered or "electricity" in lowered:
        return "STEG"

    return text_value.upper()


def _normalize_doc_type(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = _strip_accents(text_value).upper().replace(" ", "_").replace("-", "_")
    if normalized in CANONICAL_DOC_TYPES:
        return normalized
    if normalized == "STEG_ELECTRICITY":
        return "STEG_ELECTRICITY_BILL"
    if normalized == "STEG_GAS":
        return "STEG_GAS_BILL"
    if normalized == "SONEDE_WATER":
        return "SONEDE_WATER_BILL"
    if (
        "ACHAT_ET_VENTE" in normalized
        or "PURCHASE" in normalized
        or "SALE" in normalized
        or "COGENERATION" in normalized
    ):
        return "STEG_PURCHASE_SALE_READING"
    if "RELEVE" in normalized or "METER" in normalized or "CTR" in normalized:
        return "STEG_METER_READING"
    if "SONEDE" in normalized or "WATER" in normalized:
        return "SONEDE_WATER_BILL"
    if "GAS" in normalized:
        return "STEG_GAS_BILL"
    if "ELECTRIC" in normalized or "TENSION" in normalized:
        return "STEG_ELECTRICITY_BILL"
    if "OTHER" in normalized:
        return "OTHER"

    return None


def _normalize_energy_type(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = _strip_accents(text_value).lower().replace(" ", "_")
    aliases = {
        "electricity": "electricity",
        "electric": "electricity",
        "natural_gas": "natural_gas",
        "naturalgas": "natural_gas",
        "gas": "natural_gas",
        "water": "water",
        "fuel_oil": "fuel_oil",
        "fueloil": "fuel_oil",
        "coal": "coal",
        "other": "other",
    }
    return aliases.get(normalized, text_value.lower())


def _normalize_unit(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = text_value.strip().replace("³", "3")
    lowered = normalized.lower()
    alias_map = {
        "kwh": "kWh",
        "mwh": "MWh",
        "gwh": "GWh",
        "wh": "Wh",
        "gcal": "Gcal",
        "mcal": "Mcal",
        "kcal": "kcal",
        "nm3": "Nm3",
        "m3": "m3",
        "btu": "BTU",
        "mmbtu": "MMBTU",
        "toe": "TOE",
        "tep": "TEP",
        "gj": "GJ",
        "mj": "MJ",
        "thermie": "Thermie",
    }
    return alias_map.get(lowered, normalized)


def _is_gas_volume_unit(raw_unit: str | None, *, energy_type: str | None, doc_type: str | None) -> bool:
    if raw_unit is None:
        return False

    normalized = raw_unit.strip().lower().replace("³", "3")
    if normalized == "nm3":
        return True
    if normalized == "m3" and (energy_type == "natural_gas" or doc_type == "STEG_GAS_BILL"):
        return True
    return False


def _is_supported_water_unit(raw_unit: str | None, *, energy_type: str | None, doc_type: str | None) -> bool:
    if raw_unit is None:
        return False

    normalized = raw_unit.strip().lower().replace("³", "3")
    return normalized == "m3" and (energy_type == "water" or doc_type == "SONEDE_WATER_BILL")


def _normalization_factor_used(raw_unit: str | None) -> float | None:
    if raw_unit is None:
        return None
    return UNIT_TO_KWH.get(raw_unit) or UNIT_TO_KWH.get(raw_unit.lower())


def _normalize_energy_value(
    raw_value: float,
    raw_unit: str,
    *,
    pci_factor: float | None,
    energy_type: str | None,
    doc_type: str | None,
) -> float:
    if _is_gas_volume_unit(raw_unit, energy_type=energy_type, doc_type=doc_type):
        if pci_factor is None:
            raise ValueError("gas volume requires a PCI factor before it can be normalized.")
        return normalize_gas_to_kwh(raw_value, pci_factor)

    return normalize_to_kwh(raw_value, raw_unit)


def _supports_accept_without_energy_metrics(
    *,
    energy_type: str | None,
    doc_type: str | None,
    raw_unit: str | None,
    doc_specific: dict[str, Any] | None = None,
) -> bool:
    if _is_meter_like_doc_type(doc_type):
        return _doc_specific_has_meter_registers(doc_specific or {})
    return _is_supported_water_unit(raw_unit, energy_type=energy_type, doc_type=doc_type)


def _extract_retry_delay_seconds(raw_text: str) -> float | None:
    match = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)s", raw_text, flags=re.IGNORECASE)
    if not match:
        return None

    try:
        return float(match.group(1))
    except ValueError:
        return None


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    text_value = raw_text.strip()
    if not text_value:
        raise ValueError("Gemini returned an empty OCR response.")

    decoder = json.JSONDecoder()
    for start_index, character in enumerate(text_value):
        if character != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(text_value[start_index:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed

    match = re.search(r"\{[\s\S]*\}", text_value)
    if match:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("Gemini OCR response was not a JSON object.")


def _normalize_field_confidences(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}

    normalized: dict[str, float] = {}
    for key, raw_value in value.items():
        key_text = _clean_text_value(key)
        numeric_value = _parse_numeric_value(raw_value)
        if key_text is None or numeric_value is None:
            continue
        normalized[key_text] = max(0.0, min(100.0, float(numeric_value)))

    return normalized


def _coerce_doc_specific(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return {"items": value}
    return {}


def _first_present_mapping_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping:
            return mapping.get(key)
    return None


def _normalize_meter_register_name(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = _strip_accents(text_value).lower()
    if "redress" in normalized or "redresse" in normalized or "redond" in normalized:
        return "Redressee"
    if "steg" in normalized:
        return "STEG"
    if "inject" in normalized:
        return "Injection"
    if "produc" in normalized or "produit" in normalized:
        return "Production"
    return text_value


def _normalize_meter_row_label(value: Any, *, code: str | None = None) -> str | None:
    if code and code in METER_CODE_TO_LABEL:
        fallback_label = METER_CODE_TO_LABEL[code]
    else:
        fallback_label = None

    text_value = _clean_text_value(value)
    if text_value is None:
        return fallback_label

    normalized = _strip_accents(text_value).lower()
    alias_map = {
        "jour": "Jour",
        "pointe": "Pointe",
        "nuit": "Nuit",
        "soire": "Soire",
        "reactive": "Reactive",
        "qii jour": "QII Jour",
        "qii pointe": "QII Pointe",
        "qii nuit": "QII Nuit",
        "qii soire": "QII Soire",
        "i max j": "I Max J",
        "i max p": "I Max P",
        "i max s": "I Max S",
        "max j": "I Max J",
        "max p": "I Max P",
        "max s": "I Max S",
        "produite": "Produite",
        "production": "Produite",
    }
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return alias_map.get(normalized, text_value)


def _normalize_meter_code(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = text_value.replace(",", ".").replace(" ", "")
    if re.fullmatch(r"\d+\.\d+\.\d+", normalized):
        return normalized
    return text_value


def _normalize_meter_reading_name(value: Any) -> str | None:
    text_value = _clean_text_value(value)
    if text_value is None:
        return None

    normalized = _strip_accents(text_value).lower()
    if "redond" in normalized or "redress" in normalized or "redresse" in normalized:
        if "(" in text_value and ")" in text_value:
            return re.sub(r"\([^)]*\)", "(Redressee)", text_value)
        return f"{text_value} (Redressee)"
    return text_value


def _infer_meter_register_context(
    *,
    register_label: str | None,
    reading_name: str | None,
) -> dict[str, str | None]:
    normalized_label = _normalize_meter_register_name(register_label)
    normalized_reading_label = _normalize_meter_register_name(reading_name)
    effective_label = normalized_reading_label or normalized_label
    normalized_reading = _strip_accents(reading_name).lower() if reading_name else ""

    if effective_label == "STEG":
        return {
            "side": "consumption",
            "register_role": "grid_consumption",
            "flow_direction": "import",
        }
    if effective_label == "Production":
        return {
            "side": "production",
            "register_role": "production_ctr",
            "flow_direction": "produced",
        }
    if effective_label == "Redressee":
        return {
            "side": "injection",
            "register_role": "injection_redressee",
            "flow_direction": "export",
        }
    if effective_label == "Injection":
        register_role = "injection_principal" if "principal" in normalized_reading else "injection_other"
        return {
            "side": "injection",
            "register_role": register_role,
            "flow_direction": "export",
        }

    return {
        "side": "other",
        "register_role": "other",
        "flow_direction": None,
    }


def _infer_meter_tariff_period(label: str | None) -> str | None:
    if label is None:
        return None

    normalized = _strip_accents(label).lower()
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if "jour" in normalized:
        return "jour"
    if "pointe" in normalized:
        return "pointe"
    if "nuit" in normalized:
        return "nuit"
    if "soire" in normalized:
        return "soire"
    return None


def _infer_meter_row_semantics(
    *,
    register_label: str | None,
    reading_name: str | None,
    label: str | None,
    code: str | None,
) -> dict[str, Any]:
    context = _infer_meter_register_context(register_label=register_label, reading_name=reading_name)
    normalized_label = _strip_accents(label).lower() if label else ""
    normalized_code = code or ""

    quantity_type = "unknown"
    unit = None
    is_energy = False
    is_active_energy = False
    is_reactive_energy = False

    if normalized_code.startswith("1.6.") or "i max" in normalized_label or normalized_label.startswith("max "):
        quantity_type = "demand"
        unit = "kVA"
    elif (
        normalized_code.startswith("5.8.")
        or normalized_code.startswith("6.8.")
        or "react" in normalized_label
        or normalized_label.startswith("qii ")
    ):
        quantity_type = "reactive_energy"
        unit = "kvarh"
        is_energy = True
        is_reactive_energy = True
    elif (
        normalized_code.startswith("1.8.")
        or normalized_code.startswith("2.8.")
        or normalized_label == "produite"
        or context["side"] == "production"
    ):
        quantity_type = "active_energy"
        unit = "kWh"
        is_energy = True
        is_active_energy = True

    return {
        "side": context["side"],
        "register_role": context["register_role"],
        "flow_direction": context["flow_direction"],
        "tariff_period": _infer_meter_tariff_period(label),
        "quantity_type": quantity_type,
        "unit": unit,
        "is_energy": is_energy,
        "is_active_energy": is_active_energy,
        "is_reactive_energy": is_reactive_energy,
    }


def _default_meter_row(register_label: str | None, position: int) -> tuple[str | None, str | None]:
    if register_label is None:
        return None, None

    defaults = METER_REGISTER_ROW_DEFAULTS.get(register_label)
    if defaults is None or position < 0 or position >= len(defaults):
        return None, None

    return defaults[position]


def _normalize_meter_row(
    value: Any,
    *,
    register_label: str | None,
    register_id: str | None,
    reading_name: str | None,
    position: int,
) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    code = _normalize_meter_code(
        _first_present_mapping_value(value, "code", "obis", "obis_code", "code_obis")
    )
    default_label, default_code = _default_meter_row(register_label, position)
    if code is None:
        code = default_code

    label = _normalize_meter_row_label(
        _first_present_mapping_value(value, "label", "name", "libelle"),
        code=code,
    )
    if label is None:
        label = default_label

    ancien = _parse_numeric_value(_first_present_mapping_value(value, "ancien", "old", "index_ancien", "previous"))
    nouveau = _parse_numeric_value(_first_present_mapping_value(value, "nouveau", "new", "index_nouveau", "current"))

    if label is None and code is None and ancien is None and nouveau is None:
        return None

    delta = None
    if ancien is not None and nouveau is not None:
        delta = nouveau - ancien

    semantics = _infer_meter_row_semantics(
        register_label=register_label,
        reading_name=reading_name,
        label=label,
        code=code,
    )

    row_payload: dict[str, Any] = {
        "register": register_label,
        "register_id": register_id,
        "reading_name": reading_name,
        "label": label,
        "code": code,
        "ancien": ancien,
        "nouveau": nouveau,
        **semantics,
    }
    if delta is not None:
        row_payload["delta"] = delta

    return row_payload


def _normalize_meter_register(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    register_label_source = (
        _first_present_mapping_value(value, "register_label", "register", "label", "name", "type")
    )
    register_label = _normalize_meter_register_name(register_label_source)
    reading_name = _normalize_meter_reading_name(
        _first_present_mapping_value(value, "reading_name", "reading", "description", "type")
    )
    reading_name_register_label = _normalize_meter_register_name(reading_name)
    if reading_name_register_label == "Redressee":
        register_label = "Redressee"
    register_id = _clean_text_value(
        _first_present_mapping_value(value, "register_id", "ctr", "meter_id", "numero_ctr", "number")
    )
    register_context = _infer_meter_register_context(register_label=register_label, reading_name=reading_name)

    rows_source = value.get("rows") or value.get("register_rows") or value.get("items")
    if not isinstance(rows_source, list):
        rows_source = []

    rows: list[dict[str, Any]] = []
    for row_index, row_value in enumerate(rows_source):
        normalized_row = _normalize_meter_row(
            row_value,
            register_label=register_label,
            register_id=register_id,
            reading_name=reading_name,
            position=row_index,
        )
        if normalized_row is not None:
            rows.append(normalized_row)

    if not rows:
        return None

    active_energy_delta_total = sum(
        row["delta"]
        for row in rows
        if row.get("quantity_type") == "active_energy" and isinstance(row.get("delta"), (int, float))
    )
    reactive_energy_delta_total = sum(
        row["delta"]
        for row in rows
        if row.get("quantity_type") == "reactive_energy" and isinstance(row.get("delta"), (int, float))
    )
    demand_row_count = sum(1 for row in rows if row.get("quantity_type") == "demand")

    return {
        "register_label": register_label or reading_name or "Register",
        "register_id": register_id,
        "reading_name": reading_name,
        "side": register_context["side"],
        "register_role": register_context["register_role"],
        "flow_direction": register_context["flow_direction"],
        "summary": {
            "row_count": len(rows),
            "active_energy_row_count": sum(1 for row in rows if row.get("quantity_type") == "active_energy"),
            "reactive_energy_row_count": sum(1 for row in rows if row.get("quantity_type") == "reactive_energy"),
            "demand_row_count": demand_row_count,
            "active_energy_delta_total": active_energy_delta_total,
            "reactive_energy_delta_total": reactive_energy_delta_total,
        },
        "rows": rows,
    }


def _group_flat_meter_rows(values: list[Any]) -> list[dict[str, Any]]:
    registers: list[dict[str, Any]] = []
    grouped_by_key: dict[tuple[str, str | None, str | None], dict[str, Any]] = {}

    for row_value in values:
        if not isinstance(row_value, dict):
            continue

        register_label = _normalize_meter_register_name(
            _first_present_mapping_value(row_value, "register_label", "register", "type")
        )
        reading_name = _normalize_meter_reading_name(_first_present_mapping_value(row_value, "reading_name", "reading"))
        register_id = _clean_text_value(_first_present_mapping_value(row_value, "register_id", "ctr"))
        if _normalize_meter_register_name(reading_name) == "Redressee":
            register_label = "Redressee"
        key = (register_label or "Register", register_id, reading_name)

        group = grouped_by_key.get(key)
        if group is None:
            group = {
                "register_label": register_label or "Register",
                "register_id": register_id,
                "reading_name": reading_name,
                "rows": [],
            }
            grouped_by_key[key] = group
            registers.append(group)

        normalized_row = _normalize_meter_row(
            row_value,
            register_label=group["register_label"],
            register_id=group["register_id"],
            reading_name=group["reading_name"],
            position=len(group["rows"]),
        )
        if normalized_row is not None:
            group["rows"].append(normalized_row)

    return [register for register in registers if register["rows"]]


def _normalize_meter_doc_specific(value: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(value)
    grouped_source = None
    for key in ("registers", "register_groups", "meter_registers"):
        candidate = normalized.get(key)
        if isinstance(candidate, list):
            grouped_source = candidate
            break

    registers: list[dict[str, Any]] = []
    if grouped_source is not None:
        for register_value in grouped_source:
            normalized_register = _normalize_meter_register(register_value)
            if normalized_register is not None:
                registers.append(normalized_register)

    if not registers:
        flat_rows = normalized.get("register_rows")
        if isinstance(flat_rows, list):
            registers = _group_flat_meter_rows(flat_rows)

    if not registers:
        return normalized

    flat_rows: list[dict[str, Any]] = []
    for register in registers:
        register_label = register.get("register_label")
        register_id = register.get("register_id")
        reading_name = register.get("reading_name")
        rows = register.get("rows")
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            flat_row = dict(row)
            flat_row["register"] = register_label
            flat_row["register_id"] = register_id
            flat_row["reading_name"] = reading_name
            flat_rows.append(flat_row)

    normalized["registers"] = registers
    normalized["register_rows"] = flat_rows
    sections: dict[str, dict[str, Any]] = {}
    for section_side in ("consumption", "injection", "production", "other"):
        section_registers = [
            register for register in registers if register.get("side") == section_side
        ]
        if not section_registers:
            continue

        sections[section_side] = {
            "side": section_side,
            "title": METER_SECTION_TITLES.get(section_side, section_side.title()),
            "register_count": len(section_registers),
            "registers": section_registers,
            "register_ids": [
                register["register_id"]
                for register in section_registers
                if isinstance(register.get("register_id"), str)
            ],
            "register_roles": [
                register["register_role"]
                for register in section_registers
                if isinstance(register.get("register_role"), str)
            ],
        }

    structure = {
        "consumption_side": sections.get("consumption"),
        "injection_side": sections.get("injection"),
        "production_side": sections.get("production"),
    }
    structure = {key: value for key, value in structure.items() if value is not None}

    active_energy_rows = [
        row for row in flat_rows if row.get("quantity_type") == "active_energy"
    ]
    reactive_energy_rows = [
        row for row in flat_rows if row.get("quantity_type") == "reactive_energy"
    ]
    demand_rows = [row for row in flat_rows if row.get("quantity_type") == "demand"]
    normalized["summary"] = {
        "register_count": len(registers),
        "row_count": len(flat_rows),
        "has_multiple_registers": len(registers) > 1,
        "active_energy_row_count": len(active_energy_rows),
        "reactive_energy_row_count": len(reactive_energy_rows),
        "demand_row_count": len(demand_rows),
    }
    normalized["sections"] = sections
    normalized["structure"] = structure
    return normalized


def _doc_specific_has_meter_registers(value: dict[str, Any]) -> bool:
    registers = value.get("registers")
    if isinstance(registers, list):
        for register in registers:
            if isinstance(register, dict) and isinstance(register.get("rows"), list) and register["rows"]:
                return True

    register_rows = value.get("register_rows")
    return isinstance(register_rows, list) and any(isinstance(row, dict) for row in register_rows)


def _is_meter_like_doc_type(doc_type: str | None) -> bool:
    return doc_type in METER_LIKE_DOC_TYPES


def _is_purchase_sale_doc_specific(value: dict[str, Any]) -> bool:
    registers = value.get("registers")
    if not isinstance(registers, list):
        return False

    labels = {
        _normalize_meter_register_name(register.get("register_label"))
        for register in registers
        if isinstance(register, dict)
    }
    labels.discard(None)

    has_grid_side = "STEG" in labels
    has_cogen_side = bool({"Injection", "Redressee", "Production"} & labels)
    return has_grid_side and has_cogen_side


def _unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_values.append(normalized)
    return unique_values


def _first_present_value(parsed: dict[str, Any], field_name: str) -> Any:
    for alias in FIELD_ALIASES.get(field_name, (field_name,)):
        if alias in parsed:
            return parsed.get(alias)
    return None


def _normalize_ocr_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    canonical = {field: None for field in CANONICAL_FIELDS}

    for field_name in CANONICAL_FIELDS:
        raw_value = _first_present_value(parsed, field_name)
        if field_name in NUMERIC_FIELDS:
            canonical[field_name] = _parse_numeric_value(raw_value)
        elif field_name == "billing_month":
            canonical[field_name] = _normalize_billing_month(raw_value)
        elif field_name == "doc_type":
            canonical[field_name] = _normalize_doc_type(raw_value)
        elif field_name == "supplier":
            canonical[field_name] = _normalize_supplier(raw_value)
        elif field_name == "energy_type":
            canonical[field_name] = _normalize_energy_type(raw_value)
        elif field_name == "raw_unit":
            canonical[field_name] = _normalize_unit(raw_value)
        else:
            canonical[field_name] = _clean_text_value(raw_value)

    if canonical["raw_value"] is not None and canonical["raw_unit"] is None:
        if parsed.get("consommation_kwh") is not None:
            canonical["raw_unit"] = "kWh"
        elif parsed.get("volume_m3") is not None or parsed.get("volume_nm3") is not None:
            canonical["raw_unit"] = "m3"

    field_confidences = _normalize_field_confidences(parsed.get("field_confidences"))
    warnings = parsed.get("warnings")
    normalized_warnings: list[str] = []
    if isinstance(warnings, list):
        normalized_warnings = [warning for warning in (_clean_text_value(item) for item in warnings) if warning]
    elif isinstance(warnings, str):
        warning_text = _clean_text_value(warnings)
        if warning_text:
            normalized_warnings = [warning_text]

    ocr_confidence = _parse_numeric_value(
        parsed.get("ocr_confidence")
        or parsed.get("overall_confidence")
        or parsed.get("overallConfidence")
        or parsed.get("confidence")
    )
    readability_confidence = _parse_numeric_value(
        parsed.get("readability_confidence") or parsed.get("readabilityConfidence")
    )
    classification_confidence = _parse_numeric_value(
        parsed.get("classification_confidence") or parsed.get("classificationConfidence")
    )

    doc_specific = _coerce_doc_specific(parsed.get("doc_specific"))
    for top_level_key in ("registers", "register_groups", "meter_registers", "register_rows"):
        if top_level_key in parsed and top_level_key not in doc_specific:
            doc_specific[top_level_key] = parsed.get(top_level_key)
    doc_specific = _normalize_meter_doc_specific(doc_specific)

    return {
        "canonical": canonical,
        "raw_extracted": canonical.copy(),
        "field_confidences": field_confidences,
        "warnings": normalized_warnings,
        "doc_specific": doc_specific,
        "ocr_confidence": float(ocr_confidence or 0.0),
        "readability_confidence": float(readability_confidence or ocr_confidence or 0.0),
        "classification_confidence": float(classification_confidence or 0.0),
        "gemini_model": GEMINI_MODEL,
    }


def run_gemini_ocr(
    file_bytes: bytes,
    doc_type_hint: str | None = None,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    if not GEMINI_API_KEY:
        return _gemini_stub("GEMINI_API_KEY is not configured.")

    mime_type = _detect_mime_type(filename, content_type)
    hint_text = doc_type_hint or "AUTO_DETECT"
    encoded_file = base64.b64encode(file_bytes).decode("utf-8")

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": f"Document type hint: {hint_text}"},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded_file,
                        }
                    },
                ],
            }
        ],
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 3072,
            "thinkingConfig": {"thinkingBudget": 0},
            "responseMimeType": "application/json",
        },
    }

    response: requests.Response | None = None
    request_headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    for attempt in range(GEMINI_MAX_RETRIES + 1):
        try:
            response = requests.post(
                GEMINI_URL,
                headers=request_headers,
                json=payload,
                timeout=GEMINI_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            if attempt >= GEMINI_MAX_RETRIES:
                return _gemini_stub(f"Gemini OCR request failed: {exc}")

            retry_delay_seconds = min(
                GEMINI_MAX_RETRY_WAIT_SECONDS,
                GEMINI_RETRY_BACKOFF_SECONDS * (attempt + 1),
            )
            time.sleep(retry_delay_seconds)
            continue

        if response.ok:
            break

        if response.status_code == 429 and attempt < GEMINI_MAX_RETRIES:
            retry_delay_seconds = _extract_retry_delay_seconds(response.text) or (
                GEMINI_RETRY_BACKOFF_SECONDS * (attempt + 1)
            )
            time.sleep(min(GEMINI_MAX_RETRY_WAIT_SECONDS, retry_delay_seconds))
            continue

        if response.status_code >= 500 and attempt < GEMINI_MAX_RETRIES:
            retry_delay_seconds = min(
                GEMINI_MAX_RETRY_WAIT_SECONDS,
                GEMINI_RETRY_BACKOFF_SECONDS * (attempt + 1),
            )
            time.sleep(retry_delay_seconds)
            continue

        return _gemini_stub(f"Gemini OCR HTTP {response.status_code}: {response.text[:500]}")

    if response is None or not response.ok:
        status_code = response.status_code if response is not None else "unknown"
        response_text = response.text[:500] if response is not None else ""
        return _gemini_stub(f"Gemini OCR HTTP {status_code}: {response_text}")

    try:
        data = response.json()
    except json.JSONDecodeError as exc:
        return _gemini_stub(f"Gemini OCR returned invalid JSON: {exc}")

    raw_text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text")
    )
    if not raw_text:
        return _gemini_stub("Gemini OCR response did not contain a text payload.")

    try:
        parsed = _extract_json_object(raw_text)
    except (json.JSONDecodeError, ValueError) as exc:
        return _gemini_stub(f"Gemini OCR parsing failed: {exc}")

    normalized_payload = _normalize_ocr_payload(parsed)
    normalized_payload["raw_response_text"] = raw_text
    return normalized_payload


def _build_hints(
    *,
    doc_type: str | None = None,
    supplier: str | None = None,
    billing_month: str | None = None,
    energy_type: str | None = None,
    raw_value: str | float | None = None,
    raw_unit: str | None = None,
    pci_factor: str | float | None = None,
) -> dict[str, Any]:
    hints: dict[str, Any] = {}
    normalized_doc_type = _normalize_doc_type(doc_type)
    if normalized_doc_type:
        hints["doc_type"] = normalized_doc_type

    normalized_supplier = _normalize_supplier(supplier)
    if normalized_supplier:
        hints["supplier"] = normalized_supplier

    normalized_billing_month = _validate_optional_billing_month(
        None if billing_month is None else str(billing_month)
    )
    if normalized_billing_month:
        hints["billing_month"] = normalized_billing_month

    normalized_energy_type = _normalize_energy_type(energy_type)
    if normalized_energy_type:
        hints["energy_type"] = normalized_energy_type

    numeric_raw_value = _parse_numeric_value(raw_value)
    if numeric_raw_value is not None:
        hints["raw_value"] = numeric_raw_value

    normalized_raw_unit = _normalize_unit(raw_unit)
    if normalized_raw_unit:
        hints["raw_unit"] = normalized_raw_unit

    numeric_pci_factor = _parse_numeric_value(pci_factor)
    if numeric_pci_factor is not None:
        hints["pci_factor"] = numeric_pci_factor

    return hints


def _resolve_doc_type(canonical: dict[str, Any], hints: dict[str, Any], doc_specific: dict[str, Any]) -> str:
    doc_type = _normalize_doc_type(canonical.get("doc_type")) or _normalize_doc_type(hints.get("doc_type"))
    if doc_type:
        if doc_type == "STEG_METER_READING" and _is_purchase_sale_doc_specific(doc_specific):
            return "STEG_PURCHASE_SALE_READING"
        return doc_type

    supplier = _normalize_supplier(canonical.get("supplier")) or _normalize_supplier(hints.get("supplier"))
    energy_type = _normalize_energy_type(canonical.get("energy_type")) or _normalize_energy_type(
        hints.get("energy_type")
    )
    raw_unit = _normalize_unit(canonical.get("raw_unit")) or _normalize_unit(hints.get("raw_unit"))

    if _is_purchase_sale_doc_specific(doc_specific):
        return "STEG_PURCHASE_SALE_READING"
    if _doc_specific_has_meter_registers(doc_specific):
        return "STEG_METER_READING"
    if supplier == "SONEDE" or energy_type == "water":
        return "SONEDE_WATER_BILL"
    if supplier == "STEG":
        if energy_type == "natural_gas" or raw_unit == "Nm3":
            return "STEG_GAS_BILL"
        return "STEG_ELECTRICITY_BILL"
    if raw_unit == "Nm3":
        return "STEG_GAS_BILL"
    if raw_unit == "kWh":
        return "STEG_ELECTRICITY_BILL"

    return "OTHER"


def _resolve_energy_type(doc_type: str, canonical: dict[str, Any], hints: dict[str, Any]) -> str:
    explicit = _normalize_energy_type(canonical.get("energy_type")) or _normalize_energy_type(
        hints.get("energy_type")
    )
    if explicit:
        return explicit

    raw_unit = _normalize_unit(canonical.get("raw_unit")) or _normalize_unit(hints.get("raw_unit"))
    if raw_unit == "Nm3":
        return "natural_gas"
    if raw_unit == "m3" and doc_type == "SONEDE_WATER_BILL":
        return "water"

    return DOC_TYPE_TO_ENERGY_TYPE.get(doc_type, "other")


def _resolve_billing_month(canonical: dict[str, Any], hints: dict[str, Any]) -> str | None:
    return (
        _normalize_billing_month(canonical.get("billing_month"))
        or _normalize_billing_month(hints.get("billing_month"))
        or _normalize_billing_month(canonical.get("document_date"))
    )


def _resolve_pci_factor(
    canonical: dict[str, Any],
    hints: dict[str, Any],
    *,
    energy_type: str,
    raw_unit: str | None,
    doc_type: str,
) -> float | None:
    pci_factor = _parse_numeric_value(canonical.get("pci_factor"))
    if pci_factor is not None:
        return pci_factor

    hint_pci = _parse_numeric_value(hints.get("pci_factor"))
    if hint_pci is not None:
        return hint_pci

    if _is_gas_volume_unit(raw_unit, energy_type=energy_type, doc_type=doc_type):
        return DEFAULT_PCI_FACTOR

    return None


def _resolve_raw_value(canonical: dict[str, Any], hints: dict[str, Any]) -> float | None:
    raw_value = _parse_numeric_value(canonical.get("raw_value"))
    if raw_value is not None:
        return raw_value
    return _parse_numeric_value(hints.get("raw_value"))


def _resolve_raw_unit(canonical: dict[str, Any], hints: dict[str, Any], *, doc_type: str) -> str | None:
    raw_unit = _normalize_unit(canonical.get("raw_unit")) or _normalize_unit(hints.get("raw_unit"))
    if raw_unit:
        return raw_unit

    if doc_type in {"STEG_ELECTRICITY_BILL", "STEG_METER_READING", "STEG_PURCHASE_SALE_READING"} and _parse_numeric_value(
        canonical.get("raw_value")
    ) is not None:
        return "kWh"

    return None


def _infer_used_hints(canonical: dict[str, Any], hints: dict[str, Any]) -> dict[str, Any]:
    used_hints: dict[str, Any] = {}
    for key, value in hints.items():
        if canonical.get(key) is None and value is not None:
            used_hints[key] = value
    return used_hints


def _build_document_state(
    ocr_payload: dict[str, Any],
    hints: dict[str, Any] | None = None,
    *,
    manual_overrides: dict[str, Any] | None = None,
    force_accept: bool = False,
) -> dict[str, Any]:
    hints = hints or {}
    manual_overrides = manual_overrides or {}
    base_canonical = dict(ocr_payload.get("canonical") or {})
    canonical = {field: base_canonical.get(field) for field in CANONICAL_FIELDS}
    field_confidences = dict(ocr_payload.get("field_confidences") or {})
    warnings = list(ocr_payload.get("warnings") or [])
    doc_specific = _normalize_meter_doc_specific(dict(ocr_payload.get("doc_specific") or {}))

    used_hints = _infer_used_hints(canonical, hints)

    for field_name, value in manual_overrides.items():
        if field_name not in CANONICAL_FIELDS or value is None:
            continue
        canonical[field_name] = value

    doc_type = _resolve_doc_type(canonical, hints, doc_specific)
    canonical["doc_type"] = doc_type

    supplier = _normalize_supplier(canonical.get("supplier")) or _normalize_supplier(hints.get("supplier"))
    if supplier is None and doc_type.startswith("STEG_"):
        supplier = "STEG"
    if supplier is None and doc_type.startswith("SONEDE_"):
        supplier = "SONEDE"
    canonical["supplier"] = supplier

    canonical["document_date"] = _clean_text_value(canonical.get("document_date"))
    canonical["billing_month"] = _resolve_billing_month(canonical, hints)
    canonical["site_name"] = _clean_text_value(canonical.get("site_name"))
    canonical["client_name"] = _clean_text_value(canonical.get("client_name"))
    canonical["invoice_number"] = _clean_text_value(canonical.get("invoice_number"))
    canonical["reference_number"] = _clean_text_value(canonical.get("reference_number"))
    canonical["energy_type"] = _resolve_energy_type(doc_type, canonical, hints)
    canonical["raw_value"] = _resolve_raw_value(canonical, hints)
    canonical["raw_unit"] = _resolve_raw_unit(canonical, hints, doc_type=doc_type)
    canonical["raw_unit"] = _normalize_unit(canonical.get("raw_unit"))
    canonical["amount_ttc"] = _parse_numeric_value(canonical.get("amount_ttc"))
    canonical["index_ancien"] = _parse_numeric_value(canonical.get("index_ancien"))
    canonical["index_nouveau"] = _parse_numeric_value(canonical.get("index_nouveau"))
    canonical["subscribed_power"] = _parse_numeric_value(canonical.get("subscribed_power"))
    canonical["pci_factor"] = _resolve_pci_factor(
        canonical,
        hints,
        energy_type=canonical["energy_type"],
        raw_unit=canonical["raw_unit"],
        doc_type=doc_type,
    )

    readability_confidence = float(
        _parse_numeric_value(ocr_payload.get("readability_confidence"))
        or _parse_numeric_value(ocr_payload.get("ocr_confidence"))
        or 0.0
    )
    classification_confidence = _parse_numeric_value(ocr_payload.get("classification_confidence"))
    if classification_confidence is None:
        confidence_values = [
            field_confidences.get("doc_type"),
            field_confidences.get("supplier"),
        ]
        confidence_values = [value for value in confidence_values if value is not None]
        if confidence_values:
            classification_confidence = sum(confidence_values) / len(confidence_values)
        elif canonical["doc_type"] != "OTHER" and canonical["supplier"]:
            classification_confidence = 92.0
        elif canonical["doc_type"] != "OTHER" or canonical["supplier"]:
            classification_confidence = 68.0
        else:
            classification_confidence = 35.0

    required_fields = ["doc_type", "supplier", "billing_month", "energy_type"]
    if not _is_meter_like_doc_type(doc_type):
        required_fields.extend(["raw_value", "raw_unit"])
    if _is_gas_volume_unit(
        canonical["raw_unit"],
        energy_type=canonical["energy_type"],
        doc_type=doc_type,
    ):
        required_fields.append("pci_factor")

    missing_fields = [field_name for field_name in required_fields if canonical.get(field_name) is None]
    forced_review_reasons: list[str] = []
    accepts_without_energy_metrics = _supports_accept_without_energy_metrics(
        energy_type=canonical["energy_type"],
        doc_type=doc_type,
        raw_unit=canonical["raw_unit"],
        doc_specific=doc_specific,
    )
    requires_normalized_energy_metrics = canonical["energy_type"] in SUPPORTED_CO2_ENERGY_TYPES
    has_meter_registers = _doc_specific_has_meter_registers(doc_specific)
    has_normalizable_measurement = (
        canonical["raw_value"] is not None
        and canonical["raw_unit"] is not None
        and not (
            _is_gas_volume_unit(
                canonical["raw_unit"],
                energy_type=canonical["energy_type"],
                doc_type=doc_type,
            )
            and canonical["pci_factor"] is None
        )
    )

    if canonical["doc_type"] == "OTHER":
        forced_review_reasons.append("Document type could not be classified confidently.")
    if canonical["billing_month"] is None:
        forced_review_reasons.append("Billing month could not be derived from the document.")
    if canonical["raw_unit"] is not None:
        normalized_factor = _normalization_factor_used(canonical["raw_unit"])
        if (
            normalized_factor is None
            and not _is_gas_volume_unit(
                canonical["raw_unit"],
                energy_type=canonical["energy_type"],
                doc_type=doc_type,
            )
            and not _is_supported_water_unit(
                canonical["raw_unit"],
                energy_type=canonical["energy_type"],
                doc_type=doc_type,
            )
        ):
            forced_review_reasons.append(f"Unknown unit {canonical['raw_unit']!r}.")
    if _is_gas_volume_unit(
        canonical["raw_unit"],
        energy_type=canonical["energy_type"],
        doc_type=doc_type,
    ) and canonical["pci_factor"] is None:
        forced_review_reasons.append("Gas volume was detected without a usable PCI factor.")
    if _is_meter_like_doc_type(doc_type) and not has_meter_registers and canonical["raw_value"] is None:
        forced_review_reasons.append("Meter sheet registers could not be extracted reliably.")

    normalized_kwh: float | None = None
    co2_emissions_kg: float | None = None
    if has_normalizable_measurement and requires_normalized_energy_metrics:
        try:
            normalized_kwh = _normalize_energy_value(
                float(canonical["raw_value"]),
                str(canonical["raw_unit"]),
                pci_factor=_parse_numeric_value(canonical["pci_factor"]),
                energy_type=str(canonical["energy_type"]),
                doc_type=doc_type,
            )
            co2_emissions_kg = estimate_co2_kg(normalized_kwh, str(canonical["energy_type"]))
        except ValueError as exc:
            forced_review_reasons.append(str(exc))
    elif accepts_without_energy_metrics:
        normalized_kwh = None
        co2_emissions_kg = None
    elif not requires_normalized_energy_metrics:
        normalized_kwh = None
        co2_emissions_kg = None

    completeness_resolved = len(required_fields) - len(missing_fields)
    completeness_confidence = 0.0
    if required_fields:
        completeness_confidence = (completeness_resolved / len(required_fields)) * 100.0
    if normalized_kwh is None and requires_normalized_energy_metrics and not accepts_without_energy_metrics:
        completeness_confidence = min(completeness_confidence, 60.0)
    if doc_type == "OTHER":
        completeness_confidence = min(completeness_confidence, 55.0)

    if ocr_payload.get("ocr_error"):
        warnings.append(str(ocr_payload["ocr_error"]))

    for reason in forced_review_reasons:
        if reason not in warnings:
            warnings.append(reason)

    warnings = _unique_strings(warnings)

    overall_confidence = round(
        (0.35 * readability_confidence)
        + (0.25 * float(classification_confidence))
        + (0.40 * completeness_confidence),
        2,
    )

    review_status = "accepted"
    if ocr_payload.get("ocr_error") and completeness_confidence == 0 and canonical["doc_type"] == "OTHER":
        review_status = "failed"
        overall_confidence = min(overall_confidence, 45.0)
    elif force_accept:
        if missing_fields:
            raise ValueError(f"Review is still missing required field(s): {', '.join(missing_fields)}")
        if requires_normalized_energy_metrics and normalized_kwh is None and not accepts_without_energy_metrics:
            raise ValueError("Reviewed document still cannot be normalized into kWh.")
        if not requires_normalized_energy_metrics and not accepts_without_energy_metrics:
            raise ValueError("Reviewed document still cannot be accepted automatically.")
        review_status = "accepted"
        overall_confidence = max(overall_confidence, REVIEW_THRESHOLD)
    elif (
        overall_confidence < REVIEW_THRESHOLD
        or missing_fields
        or forced_review_reasons
        or (requires_normalized_energy_metrics and normalized_kwh is None and not accepts_without_energy_metrics)
        or (not requires_normalized_energy_metrics and not accepts_without_energy_metrics)
    ):
        review_status = "requires_review"
        overall_confidence = min(overall_confidence, 79.0)

    return {
        "doc_type": doc_type,
        "supplier": canonical["supplier"],
        "billing_month": canonical["billing_month"],
        "normalized_kwh": normalized_kwh,
        "co2_emissions_kg": co2_emissions_kg,
        "review_status": review_status,
        "overall_confidence": overall_confidence,
        "raw_json": {
            "canonical": canonical,
            "raw_extracted": canonical.copy(),
            "field_confidences": field_confidences,
            "warnings": warnings,
            "doc_specific": doc_specific,
            "required_fields": required_fields,
            "missing_fields": missing_fields,
            "used_hints": used_hints,
            "manual_overrides": manual_overrides,
            "ocr_confidence": float(_parse_numeric_value(ocr_payload.get("ocr_confidence")) or 0.0),
            "readability_confidence": readability_confidence,
            "classification_confidence": float(classification_confidence),
            "completeness_confidence": completeness_confidence,
            "overall_confidence": overall_confidence,
            "gemini_model": ocr_payload.get("gemini_model"),
            "raw_response_text": ocr_payload.get("raw_response_text"),
            "ocr_error": ocr_payload.get("ocr_error"),
        },
    }


def _build_document_entity(
    *,
    filename: str,
    ocr_payload: dict[str, Any],
    hints: dict[str, Any] | None = None,
    manual_overrides: dict[str, Any] | None = None,
    force_accept: bool = False,
) -> Documents:
    document_state = _build_document_state(
        ocr_payload,
        hints,
        manual_overrides=manual_overrides,
        force_accept=force_accept,
    )
    return Documents(
        filename=filename,
        doc_type=document_state["doc_type"],
        supplier=document_state["supplier"],
        billing_month=document_state["billing_month"],
        raw_json=document_state["raw_json"],
        normalized_kwh=document_state["normalized_kwh"],
        co2_emissions_kg=document_state["co2_emissions_kg"],
        review_status=document_state["review_status"],
        overall_confidence=document_state["overall_confidence"],
    )


def _persist_document(db: Session, document: Documents) -> Documents:
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def _build_failed_document(filename: str, detail: str) -> Documents:
    raw_json = _gemini_stub(detail)
    raw_json["warnings"] = [detail]
    raw_json["overall_confidence"] = 0.0
    return Documents(
        filename=filename,
        doc_type="OTHER",
        supplier=None,
        billing_month=None,
        raw_json=raw_json,
        normalized_kwh=None,
        co2_emissions_kg=None,
        review_status="failed",
        overall_confidence=0.0,
    )


def _json_compatible_value(value: Any) -> Any:
    if pd.isna(value):
        return None

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    if hasattr(value, "isoformat") and not isinstance(value, str):
        try:
            return value.isoformat()
        except Exception:
            pass

    return value


def _resolve_excel_measurement(
    row: pd.Series,
    value_column: str,
    unit_column: str,
) -> tuple[float | None, str | None, bool]:
    value_candidate = row.get(value_column)
    unit_candidate = row.get(unit_column)

    value = _parse_numeric_value(value_candidate)
    unit = _normalize_unit(unit_candidate)

    if value is not None and unit:
        return value, unit, False

    swapped_value = _parse_numeric_value(unit_candidate)
    swapped_unit = _normalize_unit(value_candidate)
    if swapped_value is not None and swapped_unit:
        return swapped_value, swapped_unit, True

    if pd.isna(value_candidate) and pd.isna(unit_candidate):
        return None, None, False

    raise ValueError(
        f"Could not read a numeric value and unit from columns "
        f"{value_column!r} / {unit_column!r}."
    )


def _normalize_review_update(payload: DocumentReviewUpdate) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    doc_type = _normalize_doc_type(payload.doc_type)
    if doc_type:
        normalized["doc_type"] = doc_type

    supplier = _normalize_supplier(payload.supplier)
    if supplier:
        normalized["supplier"] = supplier

    billing_month = _validate_optional_billing_month(payload.billing_month)
    if billing_month:
        normalized["billing_month"] = billing_month

    document_date = _clean_text_value(payload.document_date)
    if document_date:
        normalized["document_date"] = document_date

    energy_type = _normalize_energy_type(payload.energy_type)
    if energy_type:
        normalized["energy_type"] = energy_type

    for field_name in (
        "invoice_number",
        "reference_number",
        "site_name",
        "client_name",
        "raw_unit",
    ):
        value = _clean_text_value(getattr(payload, field_name))
        if value is None:
            continue
        normalized[field_name] = _normalize_unit(value) if field_name == "raw_unit" else value

    for field_name in (
        "raw_value",
        "pci_factor",
        "amount_ttc",
        "index_ancien",
        "index_nouveau",
        "subscribed_power",
    ):
        value = _parse_numeric_value(getattr(payload, field_name))
        if value is not None:
            normalized[field_name] = value

    return normalized


@router.post("/documents/upload", response_model=DocumentsRead)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str | None = Form(default=None),
    supplier: str | None = Form(default=None),
    billing_month: str | None = Form(default=None),
    energy_type: str | None = Form(default=None),
    raw_value: str | None = Form(default=None),
    raw_unit: str | None = Form(default=None),
    pci_factor: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DocumentsRead:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    source_metadata = _store_source_file(
        file_bytes,
        file.filename or "uploaded-document",
        file.content_type,
    )

    try:
        hints = _build_hints(
            doc_type=doc_type,
            supplier=supplier,
            billing_month=billing_month,
            energy_type=energy_type,
            raw_value=raw_value,
            raw_unit=raw_unit,
            pci_factor=pci_factor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ocr_payload = run_gemini_ocr(
        file_bytes,
        hints.get("doc_type"),
        filename=file.filename,
        content_type=file.content_type,
    )
    document = _build_document_entity(
        filename=file.filename or "uploaded-document",
        ocr_payload=ocr_payload,
        hints=hints,
    )
    document.raw_json.update(source_metadata)

    try:
        return _persist_document(db, document)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist document.") from exc


@router.post("/documents/upload/batch", response_model=DocumentsBatchUploadResponse)
async def upload_documents_batch(
    files: list[UploadFile] = File(...),
    supplier: str | None = Form(default=None),
    billing_month: str | None = Form(default=None),
    energy_type: str | None = Form(default=None),
    pci_factor: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DocumentsBatchUploadResponse:
    try:
        hints = _build_hints(
            supplier=supplier,
            billing_month=billing_month,
            energy_type=energy_type,
            pci_factor=pci_factor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    items: list[DocumentsBatchUploadItem] = []
    accepted = 0
    requires_review = 0
    failed = 0

    for upload_file in files:
        file_bytes = await upload_file.read()
        filename = upload_file.filename or "uploaded-document"

        if not file_bytes:
            items.append(
                DocumentsBatchUploadItem(
                    id=None,
                    filename=filename,
                    review_status="failed",
                    overall_confidence=0.0,
                    warnings=["Uploaded file is empty."],
                    detail="Uploaded file is empty.",
                )
            )
            failed += 1
            continue

        source_metadata = _store_source_file(
            file_bytes,
            filename,
            upload_file.content_type,
        )

        ocr_payload = run_gemini_ocr(
            file_bytes,
            hints.get("doc_type"),
            filename=upload_file.filename,
            content_type=upload_file.content_type,
        )
        document = _build_document_entity(
            filename=filename,
            ocr_payload=ocr_payload,
            hints=hints,
        )
        document.raw_json.update(source_metadata)

        try:
            persisted = _persist_document(db, document)
        except SQLAlchemyError as exc:
            db.rollback()
            failed_document = _build_failed_document(filename, "Failed to persist document.")
            failed_document.raw_json.update(source_metadata)
            persisted = _persist_document(db, failed_document)
            persisted.raw_json["warnings"].append(str(exc))

        warnings = persisted.raw_json.get("warnings") if isinstance(persisted.raw_json, dict) else []
        warning_list = [str(item) for item in warnings] if isinstance(warnings, list) else []
        items.append(
            DocumentsBatchUploadItem(
                id=persisted.id,
                filename=persisted.filename,
                review_status=persisted.review_status,
                overall_confidence=persisted.overall_confidence,
                warnings=warning_list,
                detail=(persisted.raw_json.get("ocr_error") if isinstance(persisted.raw_json, dict) else None),
            )
        )

        if persisted.review_status == "accepted":
            accepted += 1
        elif persisted.review_status == "requires_review":
            requires_review += 1
        else:
            failed += 1

    return DocumentsBatchUploadResponse(
        items=items,
        accepted=accepted,
        requires_review=requires_review,
        failed=failed,
    )


@router.patch("/documents/{doc_id}/review", response_model=DocumentsRead)
def review_document(
    doc_id: UUID,
    payload: DocumentReviewUpdate,
    db: Session = Depends(get_db),
) -> DocumentsRead:
    document = db.query(Documents).filter(Documents.id == doc_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    raw_json = document.raw_json if isinstance(document.raw_json, dict) else {}
    ocr_payload = {
        "canonical": dict(raw_json.get("canonical") or {}),
        "raw_extracted": dict(raw_json.get("raw_extracted") or {}),
        "field_confidences": dict(raw_json.get("field_confidences") or {}),
        "warnings": list(raw_json.get("warnings") or []),
        "doc_specific": dict(raw_json.get("doc_specific") or {}),
        "ocr_confidence": raw_json.get("ocr_confidence") or 0.0,
        "readability_confidence": raw_json.get("readability_confidence") or raw_json.get("ocr_confidence") or 0.0,
        "classification_confidence": raw_json.get("classification_confidence") or 0.0,
        "gemini_model": raw_json.get("gemini_model"),
        "raw_response_text": raw_json.get("raw_response_text"),
        "ocr_error": raw_json.get("ocr_error"),
    }

    try:
        manual_overrides = _normalize_review_update(payload)
        rebuilt = _build_document_entity(
            filename=document.filename,
            ocr_payload=ocr_payload,
            hints={},
            manual_overrides=manual_overrides,
            force_accept=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    document.doc_type = rebuilt.doc_type
    document.supplier = rebuilt.supplier
    document.billing_month = rebuilt.billing_month
    for key in (
        "source_filename",
        "source_storage_path",
        "source_content_type",
        "source_size_bytes",
    ):
        if key in raw_json:
            rebuilt.raw_json[key] = raw_json[key]
    document.raw_json = rebuilt.raw_json
    document.normalized_kwh = rebuilt.normalized_kwh
    document.co2_emissions_kg = rebuilt.co2_emissions_kg
    document.review_status = "accepted"
    document.overall_confidence = rebuilt.overall_confidence

    try:
        db.commit()
        db.refresh(document)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to persist review changes.") from exc

    return document


@router.post("/documents/upload/excel")
async def upload_documents_excel(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    supplier: str = Form(...),
    billing_month: str = Form(...),
    energy_type: str = Form(default="electricity"),
    unit_column: str = Form(...),
    value_column: str = Form(...),
    pci_factor: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded Excel file is empty.")

    normalized_billing_month = _validate_optional_billing_month(billing_month)
    if normalized_billing_month is None:
        raise HTTPException(status_code=400, detail="billing_month must use MM/YYYY format.")

    normalized_doc_type = _normalize_doc_type(doc_type)
    if normalized_doc_type is None:
        raise HTTPException(status_code=400, detail="doc_type is not recognized.")

    normalized_supplier = _normalize_supplier(supplier)
    if normalized_supplier is None:
        raise HTTPException(status_code=400, detail="supplier is required.")

    normalized_energy_type = _normalize_energy_type(energy_type) or "electricity"
    parsed_pci_factor = _parse_numeric_value(pci_factor) or DEFAULT_PCI_FACTOR

    try:
        dataframe = pd.read_excel(BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to read Excel file.") from exc

    missing_columns = [
        column_name
        for column_name in (value_column, unit_column)
        if column_name not in dataframe.columns
    ]
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing Excel column(s): {', '.join(missing_columns)}",
        )

    inserted = 0

    try:
        for row_index, (_, row) in enumerate(dataframe.iterrows(), start=2):
            raw_value, raw_unit, auto_swapped = _resolve_excel_measurement(
                row,
                value_column,
                unit_column,
            )

            if raw_value is None and raw_unit is None:
                continue
            if raw_value is None or raw_unit is None:
                raise ValueError(f"Row {row_index} is missing either the energy value or the unit.")

            normalized_kwh = _normalize_energy_value(
                raw_value,
                raw_unit,
                pci_factor=parsed_pci_factor,
                energy_type=normalized_energy_type,
                doc_type=normalized_doc_type,
            )
            co2_emissions_kg = (
                estimate_co2_kg(normalized_kwh, normalized_energy_type)
                if normalized_energy_type in SUPPORTED_CO2_ENERGY_TYPES
                else None
            )

            row_payload = {
                "source": "excel",
                "canonical": {
                    "doc_type": normalized_doc_type,
                    "supplier": normalized_supplier,
                    "invoice_number": None,
                    "reference_number": None,
                    "document_date": None,
                    "billing_month": normalized_billing_month,
                    "site_name": None,
                    "client_name": None,
                    "energy_type": normalized_energy_type,
                    "raw_value": raw_value,
                    "raw_unit": raw_unit,
                    "pci_factor": parsed_pci_factor,
                    "amount_ttc": None,
                    "index_ancien": None,
                    "index_nouveau": None,
                    "subscribed_power": None,
                },
                "field_confidences": {},
                "warnings": [],
                "doc_specific": {},
                "raw_row": {
                    str(column_name): _json_compatible_value(value)
                    for column_name, value in row.items()
                },
                "value_column": value_column,
                "unit_column": unit_column,
                "auto_swapped_columns": auto_swapped,
                "ocr_confidence": 100.0,
                "readability_confidence": 100.0,
                "classification_confidence": 100.0,
                "completeness_confidence": 100.0,
                "overall_confidence": 100.0,
                "used_hints": {},
                "manual_overrides": {},
                "required_fields": ["doc_type", "supplier", "billing_month", "energy_type", "raw_value", "raw_unit"],
                "missing_fields": [],
            }

            document = Documents(
                filename=file.filename or "uploaded-excel",
                doc_type=normalized_doc_type,
                supplier=normalized_supplier,
                billing_month=normalized_billing_month,
                raw_json=row_payload,
                normalized_kwh=normalized_kwh,
                co2_emissions_kg=co2_emissions_kg,
                review_status="accepted",
                overall_confidence=100.0,
            )
            db.add(document)
            inserted += 1

        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to persist Excel document rows.",
        ) from exc

    return {"inserted": inserted}


@router.get("/documents", response_model=list[DocumentsRead])
def list_documents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    doc_type: str | None = Query(default=None),
    review_status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DocumentsRead]:
    query = db.query(Documents)

    normalized_doc_type = _normalize_doc_type(doc_type)
    if doc_type and normalized_doc_type is None:
        raise HTTPException(status_code=400, detail="Invalid doc_type filter.")
    if normalized_doc_type:
        query = query.filter(Documents.doc_type == normalized_doc_type)

    normalized_review_status = _normalize_review_status(review_status)
    if normalized_review_status:
        query = query.filter(Documents.review_status == normalized_review_status)

    return (
        query.order_by(
            Documents.review_status.asc(),
            text("to_date(billing_month, 'MM/YYYY') DESC NULLS LAST"),
            Documents.billing_month.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/documents/summary")
def get_documents_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    accepted_documents = db.query(Documents).filter(Documents.review_status == "accepted")

    totals = (
        accepted_documents.with_entities(
            func.coalesce(func.sum(Documents.normalized_kwh), 0.0),
            func.coalesce(func.sum(Documents.co2_emissions_kg), 0.0),
        )
        .one()
    )

    by_supplier_rows = (
        accepted_documents.with_entities(
            Documents.supplier.label("supplier"),
            func.coalesce(func.sum(Documents.normalized_kwh), 0.0).label("total_kwh"),
            func.coalesce(func.sum(Documents.co2_emissions_kg), 0.0).label("total_co2_kg"),
        )
        .filter(Documents.supplier.isnot(None))
        .group_by(Documents.supplier)
        .order_by(Documents.supplier.asc())
        .all()
    )

    return {
        "total_normalized_kwh": float(totals[0] or 0.0),
        "total_co2_kg": float(totals[1] or 0.0),
        "by_supplier": [
            {
                "supplier": row.supplier,
                "total_kwh": float(row.total_kwh or 0.0),
                "total_co2_kg": float(row.total_co2_kg or 0.0),
            }
            for row in by_supplier_rows
        ],
    }


@router.get("/documents/{doc_id}/source")
def get_document_source(doc_id: UUID, db: Session = Depends(get_db)) -> FileResponse:
    document = db.query(Documents).filter(Documents.id == doc_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    source_path, source_content_type = _resolve_document_source_path(document)
    if source_path is None or not source_path.exists():
        raise HTTPException(status_code=404, detail="Document source file is unavailable.")

    return FileResponse(
        path=source_path,
        media_type=source_content_type or "application/octet-stream",
        filename=document.filename,
    )


@router.get("/documents/{doc_id}", response_model=DocumentsRead)
def get_document(doc_id: UUID, db: Session = Depends(get_db)) -> DocumentsRead:
    document = db.query(Documents).filter(Documents.id == doc_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    return document
