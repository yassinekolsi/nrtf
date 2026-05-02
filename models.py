import uuid

from sqlalchemy import BigInteger, Boolean, Column, Float, String, TIMESTAMP, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from database import Base


class TelemetryData(Base):
    __tablename__ = "telemetry_data"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp_ms = Column(BigInteger, nullable=False)
    node_id = Column(String, nullable=False)
    sensor_id = Column(String, nullable=False)
    type = Column(String, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    quality = Column(String, nullable=False)


class Documents(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    filename = Column(String, nullable=False)
    doc_type = Column(String, nullable=False)
    supplier = Column(String, nullable=True)
    billing_month = Column(String, nullable=True)
    raw_json = Column(JSONB, nullable=False)
    normalized_kwh = Column(Float, nullable=True)
    co2_emissions_kg = Column(Float, nullable=True)
    review_status = Column(
        String,
        nullable=False,
        default="accepted",
        server_default=text("'accepted'"),
    )
    overall_confidence = Column(Float, nullable=True)


class ScadaLedger(Base):
    __tablename__ = "scada_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(TIMESTAMP(timezone=False), nullable=False)
    normalized_kwh = Column(Float, nullable=False)
    power_gross_kw = Column(Float, nullable=False)
    gas_flow_nm3h = Column(Float, nullable=False)
    raw_metrics = Column(JSONB, nullable=False)


class EventsAndAnomalies(Base):
    __tablename__ = "events_and_anomalies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(TIMESTAMP(timezone=False), nullable=False)
    source = Column(String, nullable=False)
    description = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    acknowledged = Column(Boolean, nullable=False)
    context_data = Column(JSONB, nullable=False)
