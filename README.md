# Re-Tech Fusion - Industrial Energy Intelligence System

End-to-end platform for an industrial trigeneration site in Tunisia. It unifies IoT telemetry, SCADA Excel exports, and energy documents into a single dashboard with CO2 tracking and anomaly detection.

## What works now (demo-ready)

- Tri-generation (SCADA) Excel import (BILAN TOTAL) with summary + latest readings table.
- SCADA API endpoints: list, summary, and Excel upload.
- Telemetry ingestion and live metrics on the dashboard and Tri-generation Live (IoT) page.
- Documents ingestion:
  - PDF/image batch upload with OCR extraction and review queue.
  - Excel batch upload with value/unit column mapping.
- Events and anomalies:
  - Telemetry anomalies (threshold, spike, stuck, invalid quality) create events.
  - Tri-generation SCADA anomalies (PF < 0.90, electrical efficiency < 38% for 1h, gas/electric ratio anomaly) create events.
- Pages wired to backend APIs: Dashboard, Energy, Tri-generation Live (IoT), Tri-generation (SCADA), Documents, Alerts.

## Quick start (local)

1. Create an .env file (see .env.example) with at least:
   - DATABASE_URL
2. Start the stack:

```powershell
.\start.ps1
```

3. Open:
   - Frontend: http://127.0.0.1:3000
   - Backend: http://127.0.0.1:8000

## Tri-generation (SCADA) import

1. Go to the Tri-generation page in the sidebar (this is the SCADA view).
2. Upload a BILAN TOTAL .xlsx file.
3. Keep interval at 10 minutes (default). PCI factor is optional (auto-read from file).

Result:
- SCADA rows are stored in scada_ledger.
- Summary and latest readings are visible on the Tri-generation page.
- Anomalies are written to events_and_anomalies.

Optional CLI import:

```powershell
C:\Users\28k\AppData\Local\Programs\Python\Python313\python.exe scripts\seed_scada.py <path_to_xlsx>
```

## Documents import

- Photo/PDF: upload one or more documents. OCR extracts fields and routes low-confidence rows to review.
- Excel batch: upload a table and map the value and unit columns.

## Key API endpoints

- GET /api/telemetry/latest
- GET /api/telemetry/history/{sensor_id}
- POST /api/telemetry
- GET /api/scada
- GET /api/scada/summary
- POST /api/scada/upload/excel
- GET /api/documents
- GET /api/documents/summary
- POST /api/documents/upload/batch
- POST /api/documents/upload/excel
- GET /api/events
- GET /api/events/stats

## Tech stack

- FastAPI + SQLAlchemy
- PostgreSQL
- Next.js (App Router) + Tailwind
- openpyxl + pandas for Excel
- OCR pipeline for documents (pdfplumber, pytesseract, optional Claude Vision)

## Notes

- The SCADA import expects the BILAN TOTAL layout (rows as fields, columns as timestamps).
- Anomaly logic is focused on the demo signals described above. It can be extended with drift/dropout and monthly patterns if needed.
