## 2026-05-02
- Added `get_db()` in `database.py` for safe SQLAlchemy session lifecycle handling.
- Reworked `main.py` with CORS, startup table creation, safe router loading under `/api`, and a root health/version endpoint.
- Created `routers/__init__.py` so router modules can be added incrementally without breaking app startup.
- Added shared `utils/energy.py` helpers for kWh normalization, CO2 estimation, and sensor anomaly checks.
- Created `routers/telemetry.py` with bulk ingest, anomaly event creation, latest/history queries, and dashboard stats endpoints.

### Prompt 4 — MQTT-to-HTTP Forwarder
- Added `scripts/mqtt_to_api.py` to subscribe to the hardware MQTT topic, flatten packet readings with `timestamp_ms` and derived `node_id`, and forward them to `POST /api/telemetry`.
- Included `.env` loading, optional TLS/CA handling, short success/error logging, and guarded exception handling so malformed packets or transport failures do not stop the bridge.

### Prompt 5 — Documents Routes + Frontend Upload Flow
- Added `routers/documents.py` with single upload, Excel batch import, list, detail, and supplier summary endpoints; normalization to `kWh` and CO2 calculation are live for both manual and Excel uploads.
- Wired `run_gemini_ocr()` to the Gemini REST API using the `gemini-3.1-flash-lite-preview` model pattern from `Hackathon-Maroc`, with parsed field mapping into `raw_json` and a safe fallback payload when OCR fails or the key is missing.
- Replaced the documents page mock data with a real frontend upload/list/detail flow against `/api/documents`, and linked the Energy page import button to the live documents screen.
- Verified the backend with a FastAPI smoke test against Neon and verified the frontend with a successful production `next build`.

### Dev Setup — Docker Compose + Local Start Script
- Added a single self-contained `docker-compose.yml` with backend/frontend services and inline startup commands, using only the specific project files/folders each container needs.
- Added `start.ps1` to launch the backend (`uvicorn`) and frontend (`pnpm dev`) locally in separate PowerShell windows, with an optional `-Docker` mode that runs `docker compose up`.
