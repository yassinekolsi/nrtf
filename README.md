# Re-Tech Fusion - Industrial Energy Intelligence System

End-to-end platform for an industrial trigeneration site in Tunisia. It unifies IoT telemetry, SCADA Excel exports, and energy documents into a single dashboard with CO2 tracking and anomaly detection.

## 🌐 Live Demo (Render)
- https://nrtf.onrender.com

## 🌟 Key Features

### 1. Unified Industrial Dashboard
- **Real-time Overview:** Consolidated view of energy consumption across all sources.
- **Carbon Tracking:** Automated CO2 footprint calculation and emission tracking.
- **KPI Monitoring:** High-level metrics and system health status at a glance.

### 2. Tri-generation SCADA Integration
- **Automated Parsing:** Import and parse "BILAN TOTAL" Excel reports effortlessly.
- **Live Insights:** Real-time visibility into SCADA readings.
- **Historical Ledger:** Persistent data tracking for compliance and long-term analysis.
- **Efficiency Alerts:** Automated anomaly detection for performance drops (e.g., PF < 0.90, electrical efficiency < 38%).

### 3. Live IoT Telemetry & Monitoring
- **MQTT Ingestion:** Real-time sensor data ingestion via a dedicated MQTT bridge.
- **Interactive Visualization:** Live charts and metrics for Tri-generation equipment.
- **Intelligent Anomaly Detection:** Immediate event generation for sensor anomalies, including threshold breaches, spikes, stuck values, and invalid quality readings.

### 4. Intelligent Document Processing (AI/OCR)
- **Automated Utility Ingestion:** Upload utility bills (electricity, gas, water) and meter reading sheets via PDF or images.
- **AI-Powered Extraction:** Utilizes Gemini API to automatically capture billing periods, values, units, and supplier details.
- **Human-in-the-Loop Review:** Confidence scoring system with a dedicated review queue for uncertain extractions.
- **Batch Processing:** Support for batch Excel uploads with flexible column mapping.

### 5. Advanced Energy Analytics
- **Standardized Metrics:** Automatic normalization of diverse energy units (kWh, m3, Nm3, MWh, etc.) into a standardized metric.
- **Dynamic PCI Factors:** Accurate conversion of gas volumes using configurable PCI factors.

### 6. Alert & Event Management
- **Centralized Events System:** Consolidated tracking of both hardware anomalies and document processing issues.
- **Operator Workflow:** Acknowledgment system for operators to track and resolve active alerts.

### 7. Modern & Scalable Architecture
- **Cloud-Ready:** Fully containerized with Docker, complete with a Render blueprint for seamless deployment.
- **High-Performance Backend:** Built with FastAPI and PostgreSQL.
- **Sleek Frontend:** Responsive, modern Next.js interface powered by Tailwind CSS and Radix UI components.

## 🚀 Quick Start (Local Development)

1. Create an `.env` file (see `.env.example`) with at least:
   - `DATABASE_URL`
   - `GEMINI_API_KEY` (for document OCR)

2. Start the stack using the provided PowerShell script (which launches the backend, frontend, and MQTT bridge):

```powershell
.\start.ps1
```

3. Open your browser:
   - **Frontend:** http://127.0.0.1:3000
   - **Backend API Docs:** http://127.0.0.1:8000/docs

*Alternatively, you can run the entire stack via Docker Compose:*
```powershell
.\start.ps1 -Docker
```

## ⚠️ Live Telemetry in the Cloud
The MQTT bridge can run inside the Render container, but Render must be able to reach your MQTT broker.
If your broker is LAN-only, live telemetry will stay at 0 in production.

To get live data in the cloud, you need one of these:
- A public MQTT broker with TLS, reachable from Render
- A VPS or tunnel that can reach your LAN broker and forward MQTT traffic

## 📊 Data Ingestion Guides

### Tri-generation (SCADA) Import
1. Navigate to the **Tri-generation** page in the sidebar.
2. Upload a `BILAN TOTAL .xlsx` file.
3. The system will process the rows into the `scada_ledger`, update the latest readings, and flag any efficiency anomalies.

*Optional CLI import:*
```powershell
python scripts/seed_scada.py <path_to_xlsx>
```

### Documents Import
- **Photo/PDF:** Upload one or more documents on the Documents page. The AI OCR extracts fields and routes low-confidence extractions to the review queue.
- **Excel Batch:** Upload a tabular dataset and map the value and unit columns for bulk ingestion.

## 🔌 Key API Endpoints

**Telemetry & SCADA**
- `GET /api/telemetry/latest`
- `GET /api/telemetry/history/{sensor_id}`
- `GET /api/scada`
- `GET /api/scada/summary`
- `POST /api/scada/upload/excel`

**Documents**
- `GET /api/documents`
- `GET /api/documents/summary`
- `POST /api/documents/upload/batch`
- `POST /api/documents/upload/excel`

**Events**
- `GET /api/events`
- `GET /api/events/stats`

## 🛠️ Tech Stack
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL, Python 3.11+
- **Frontend:** Next.js (App Router), React 19, Tailwind CSS v4, Radix UI, Recharts
- **Data Processing:** pandas, openpyxl
- **AI/OCR:** Google Gemini API
- **Infrastructure:** Docker, Docker Compose, Render Blueprint
