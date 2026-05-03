from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import models  # noqa: F401
from database import Base, engine

app = FastAPI(title="Hackathon Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_documents_schema() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "documents" not in inspector.get_table_names():
            return

        columns = {
            column["name"]: column
            for column in inspector.get_columns("documents")
        }

        if "review_status" not in columns:
            connection.execute(
                text("ALTER TABLE documents ADD COLUMN review_status VARCHAR")
            )
            connection.execute(
                text("UPDATE documents SET review_status = 'accepted' WHERE review_status IS NULL")
            )
            connection.execute(
                text("ALTER TABLE documents ALTER COLUMN review_status SET DEFAULT 'accepted'")
            )
            connection.execute(
                text("ALTER TABLE documents ALTER COLUMN review_status SET NOT NULL")
            )

        if "overall_confidence" not in columns:
            connection.execute(
                text("ALTER TABLE documents ADD COLUMN overall_confidence DOUBLE PRECISION")
            )
            connection.execute(
                text("UPDATE documents SET overall_confidence = 100.0 WHERE overall_confidence IS NULL")
            )

        for column_name in (
            "supplier",
            "billing_month",
            "normalized_kwh",
            "co2_emissions_kg",
        ):
            column = columns.get(column_name)
            if column and not column.get("nullable", True):
                connection.execute(
                    text(
                        f"ALTER TABLE documents ALTER COLUMN {column_name} DROP NOT NULL"
                    )
                )


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_documents_schema()


try:
    from routers import telemetry

    app.include_router(telemetry.router, prefix="/api", tags=["telemetry"])
except ImportError:
    pass

try:
    from routers import scada

    app.include_router(scada.router, prefix="/api", tags=["scada"])
except ImportError:
    pass

try:
    from routers import events

    app.include_router(events.router, prefix="/api", tags=["events"])
except ImportError:
    pass

try:
    from routers import documents

    app.include_router(documents.router, prefix="/api", tags=["documents"])
except ImportError:
    pass

try:
    from routers import recovery

    app.include_router(recovery.router, prefix="/api", tags=["recovery"])
except ImportError:
    pass


@app.get("/")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0"}
