from datetime import datetime
from typing import Any
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TelemetryDataBase(BaseModel):
    timestamp_ms: int
    node_id: str
    sensor_id: str
    type: str
    value: float
    unit: str
    quality: str


class TelemetryDataCreate(TelemetryDataBase):
    pass


class TelemetryDataRead(TelemetryDataBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


class DocumentsBase(BaseModel):
    filename: str
    doc_type: str
    supplier: str | None
    billing_month: str | None
    raw_json: dict[str, Any]
    normalized_kwh: float | None
    co2_emissions_kg: float | None
    review_status: Literal["processing", "accepted", "requires_review", "failed"]
    overall_confidence: float | None


class DocumentsCreate(DocumentsBase):
    pass


class DocumentsRead(DocumentsBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


class DocumentsBatchUploadItem(BaseModel):
    id: UUID | None
    filename: str
    review_status: Literal["processing", "accepted", "requires_review", "failed"]
    overall_confidence: float | None
    warnings: list[str]
    detail: str | None = None


class DocumentsBatchUploadResponse(BaseModel):
    items: list[DocumentsBatchUploadItem]
    accepted: int
    requires_review: int
    failed: int


class DocumentReviewUpdate(BaseModel):
    doc_type: str | None = None
    supplier: str | None = None
    billing_month: str | None = None
    document_date: str | None = None
    energy_type: str | None = None
    raw_value: float | str | None = None
    raw_unit: str | None = None
    pci_factor: float | str | None = None
    invoice_number: str | None = None
    reference_number: str | None = None
    site_name: str | None = None
    client_name: str | None = None
    amount_ttc: float | str | None = None
    index_ancien: float | str | None = None
    index_nouveau: float | str | None = None
    subscribed_power: float | str | None = None


class ScadaLedgerBase(BaseModel):
    timestamp: datetime
    normalized_kwh: float
    power_gross_kw: float
    gas_flow_nm3h: float
    raw_metrics: dict[str, Any]


class ScadaLedgerCreate(ScadaLedgerBase):
    pass


class ScadaLedgerRead(ScadaLedgerBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


class EventsAndAnomaliesBase(BaseModel):
    timestamp: datetime
    source: str
    description: str
    severity: str
    acknowledged: bool
    context_data: dict[str, Any]


class EventsAndAnomaliesCreate(EventsAndAnomaliesBase):
    pass


class EventsAndAnomaliesRead(EventsAndAnomaliesBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)
