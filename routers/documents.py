from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import unicodedata
from datetime import datetime
from io import BytesIO
from typing import Any
from uuid import UUID

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
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
DEFAULT_PCI_FACTOR = 9.082
REVIEW_THRESHOLD = 80.0

REVIEW_STATUSES = {"processing", "accepted", "requires_review", "failed"}
CANONICAL_DOC_TYPES = {
    "STEG_ELECTRICITY_BILL",
    "STEG_GAS_BILL",
    "SONEDE_WATER_BILL",
    "STEG_METER_READING",
    "OTHER",
}
SUPPORTED_CO2_ENERGY_TYPES = {"electricity", "natural_gas", "fuel_oil", "coal"}
DOC_TYPE_TO_ENERGY_TYPE = {
    "STEG_ELECTRICITY_BILL": "electricity",
    "STEG_GAS_BILL": "natural_gas",
    "SONEDE_WATER_BILL": "water",
    "STEG_METER_READING": "electricity",
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

SYSTEM_PROMPT = """You are a strict OCR extraction API for industrial energy documents.

The uploaded document can be:
- a STEG electricity bill
- a STEG gas bill
- a SONEDE water bill
- a STEG meter-reading sheet such as FICHE RELEVE ENERGIE ACHAT ET VENTE
- or another industrial utility document in French, Arabic, or English

Return ONLY a raw JSON object using this schema:
{
  "doc_type": "STEG_ELECTRICITY_BILL | STEG_GAS_BILL | SONEDE_WATER_BILL | STEG_METER_READING | OTHER",
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
- For meter-reading sheets, keep register tables inside doc_specific.register_rows.
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


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    text_value = raw_text.strip()
    if not text_value:
        raise ValueError("Gemini returned an empty OCR response.")

    match = re.search(r"\{[\s\S]*\}", text_value)
    json_text = match.group(0) if match else text_value
    parsed = json.loads(json_text)

    if not isinstance(parsed, dict):
        raise ValueError("Gemini OCR response was not a JSON object.")

    return parsed


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

    return {
        "canonical": canonical,
        "raw_extracted": canonical.copy(),
        "field_confidences": field_confidences,
        "warnings": normalized_warnings,
        "doc_specific": _coerce_doc_specific(parsed.get("doc_specific")),
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

    try:
        response = requests.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,
            },
            json=payload,
            timeout=GEMINI_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return _gemini_stub(f"Gemini OCR request failed: {exc}")

    if not response.ok:
        return _gemini_stub(f"Gemini OCR HTTP {response.status_code}: {response.text[:500]}")

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
        return doc_type

    supplier = _normalize_supplier(canonical.get("supplier")) or _normalize_supplier(hints.get("supplier"))
    energy_type = _normalize_energy_type(canonical.get("energy_type")) or _normalize_energy_type(
        hints.get("energy_type")
    )
    raw_unit = _normalize_unit(canonical.get("raw_unit")) or _normalize_unit(hints.get("raw_unit"))

    if doc_specific.get("register_rows"):
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

    if doc_type in {"STEG_ELECTRICITY_BILL", "STEG_METER_READING"} and _parse_numeric_value(
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
    doc_specific = dict(ocr_payload.get("doc_specific") or {})

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

    required_fields = ["doc_type", "supplier", "billing_month", "energy_type", "raw_value", "raw_unit"]
    if _is_gas_volume_unit(
        canonical["raw_unit"],
        energy_type=canonical["energy_type"],
        doc_type=doc_type,
    ):
        required_fields.append("pci_factor")

    missing_fields = [field_name for field_name in required_fields if canonical.get(field_name) is None]
    forced_review_reasons: list[str] = []

    if canonical["doc_type"] == "OTHER":
        forced_review_reasons.append("Document type could not be classified confidently.")
    if canonical["billing_month"] is None:
        forced_review_reasons.append("Billing month could not be derived from the document.")
    if canonical["raw_unit"] is not None:
        normalized_factor = _normalization_factor_used(canonical["raw_unit"])
        if normalized_factor is None and not _is_gas_volume_unit(
            canonical["raw_unit"],
            energy_type=canonical["energy_type"],
            doc_type=doc_type,
        ):
            forced_review_reasons.append(f"Unknown unit {canonical['raw_unit']!r}.")
    if _is_gas_volume_unit(
        canonical["raw_unit"],
        energy_type=canonical["energy_type"],
        doc_type=doc_type,
    ) and canonical["pci_factor"] is None:
        forced_review_reasons.append("Gas volume was detected without a usable PCI factor.")
    if doc_type == "STEG_METER_READING" and (
        canonical["raw_value"] is None or canonical["raw_unit"] is None
    ):
        forced_review_reasons.append("Meter sheet does not contain a trustworthy normalized quantity yet.")
    if doc_type == "SONEDE_WATER_BILL":
        forced_review_reasons.append("Water documents are ingested but not auto-accepted in v1.")

    normalized_kwh: float | None = None
    co2_emissions_kg: float | None = None
    if not missing_fields and canonical["energy_type"] in SUPPORTED_CO2_ENERGY_TYPES:
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
    elif canonical["energy_type"] not in SUPPORTED_CO2_ENERGY_TYPES:
        normalized_kwh = None
        co2_emissions_kg = None

    completeness_resolved = len(required_fields) - len(missing_fields)
    completeness_confidence = 0.0
    if required_fields:
        completeness_confidence = (completeness_resolved / len(required_fields)) * 100.0
    if normalized_kwh is None and canonical["energy_type"] in SUPPORTED_CO2_ENERGY_TYPES:
        completeness_confidence = min(completeness_confidence, 60.0)
    if doc_type in {"SONEDE_WATER_BILL", "OTHER"}:
        completeness_confidence = min(completeness_confidence, 55.0)

    if ocr_payload.get("ocr_error"):
        warnings.append(str(ocr_payload["ocr_error"]))

    for reason in forced_review_reasons:
        if reason not in warnings:
            warnings.append(reason)

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
        if canonical["energy_type"] not in SUPPORTED_CO2_ENERGY_TYPES:
            raise ValueError("Reviewed document still cannot be normalized into accepted energy data.")
        if normalized_kwh is None:
            raise ValueError("Reviewed document still cannot be normalized into kWh.")
        review_status = "accepted"
        overall_confidence = max(overall_confidence, REVIEW_THRESHOLD)
    elif (
        overall_confidence < REVIEW_THRESHOLD
        or missing_fields
        or forced_review_reasons
        or canonical["energy_type"] not in SUPPORTED_CO2_ENERGY_TYPES
        or normalized_kwh is None
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

        try:
            persisted = _persist_document(db, document)
        except SQLAlchemyError as exc:
            db.rollback()
            failed_document = _build_failed_document(filename, "Failed to persist document.")
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


@router.get("/documents/{doc_id}", response_model=DocumentsRead)
def get_document(doc_id: UUID, db: Session = Depends(get_db)) -> DocumentsRead:
    document = db.query(Documents).filter(Documents.id == doc_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    return document
