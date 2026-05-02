from datetime import datetime
from typing import Any
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
    supplier: str
    billing_month: str
    raw_json: dict[str, Any]
    normalized_kwh: float
    co2_emissions_kg: float


class DocumentsCreate(DocumentsBase):
    pass


class DocumentsRead(DocumentsBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)


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
