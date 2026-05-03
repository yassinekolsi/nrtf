"use client";

import {
  fetchDocuments as fetchDocumentsClient,
  fetchDocumentsSummary as fetchDocumentsSummaryClient,
  fetchScadaRecords,
  fetchScadaSummary,
  fetchTelemetryHistory,
  fetchTelemetryLatest,
  fetchTelemetryLiveSnapshot,
} from "@/lib/api-client";
import {
  fetchDocuments as fetchDocumentsApi,
  fetchDocumentsCo2Monthly,
  fetchDocumentsSummary as fetchDocumentsSummaryApi,
} from "@/lib/documents-api";

const POWER_SENSOR_ID = "acs712_power_01";
const DASHBOARD_SENSOR_IDS = ["dht11_temp_01", "dht11_hum_01", "mpu6050_vib_01"];
const TELEMETRY_HISTORY_PARAMS = { hours: 24, limit: 20000, order: "asc" as const };
const ENERGY_DOC_LIMIT = 12;
const SCADA_PAGE_SIZE = 10;

const prefetchers: Record<string, () => Promise<void>> = {
  "/dashboard": async () => {
    await Promise.all([
      fetchTelemetryLiveSnapshot(DASHBOARD_SENSOR_IDS),
      fetchDocumentsSummaryClient(),
    ]);
  },
  "/energie": async () => {
    await Promise.all([
      fetchDocumentsSummaryClient(),
      fetchDocumentsClient({ doc_type: "STEG_ELECTRICITY", limit: ENERGY_DOC_LIMIT }),
      fetchDocumentsClient({ doc_type: "STEG_GAS", limit: ENERGY_DOC_LIMIT }),
      fetchScadaSummary(),
    ]);
  },
  "/co2": async () => {
    await fetchDocumentsCo2Monthly();
  },
  "/trigeneration": async () => {
    await Promise.all([
      fetchTelemetryLatest(),
      fetchTelemetryHistory(POWER_SENSOR_ID, TELEMETRY_HISTORY_PARAMS),
      fetchScadaSummary(),
    ]);
  },
  "/scada": async () => {
    await Promise.all([
      fetchScadaSummary(),
      fetchScadaRecords({ skip: 0, limit: SCADA_PAGE_SIZE }),
    ]);
  },
  "/documents": async () => {
    await Promise.all([
      fetchDocumentsApi(),
      fetchDocumentsSummaryApi(),
      fetchDocumentsCo2Monthly(),
    ]);
  },
};

export function prefetchRouteData(path: string) {
  const normalized = path.split("?")[0]?.split("#")[0] ?? path;
  if (normalized === "/alertes") return;
  const prefetcher = prefetchers[normalized];
  if (!prefetcher) return;
  void prefetcher().catch(() => undefined);
}
