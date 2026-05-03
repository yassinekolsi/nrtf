"use client";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000/api";

export interface TelemetryReading {
  id: string;
  timestamp_ms: number;
  node_id: string;
  sensor_id: string;
  type: string;
  value: number;
  unit: string;
  quality: string;
}

export interface TelemetryStats {
  sensors_online: number;
  anomaly_count: number;
  last_seen_ms: number;
  total_readings: number;
}

export interface DocumentsSummary {
  total_normalized_kwh: number;
  total_co2_kg: number;
  by_supplier: Array<{
    supplier: string;
    total_kwh: number;
    total_co2_kg: number;
  }>;
}

export interface DocumentRecord {
  id: string;
  created_at: string;
  filename: string;
  doc_type: string;
  supplier: string | null;
  billing_month: string | null;
  raw_json: Record<string, unknown>;
  normalized_kwh: number | null;
  co2_emissions_kg: number | null;
  review_status: string;
  overall_confidence: number | null;
}

export interface EventRecord {
  id: string;
  timestamp: string;
  source: string;
  description: string;
  severity: string;
  acknowledged: boolean;
  context_data: Record<string, unknown>;
}

export interface EventStats {
  total: number;
  unacknowledged: number;
  critique_count: number;
  by_source: Array<{ source: string; count: number }>;
}

export interface ScadaSummary {
  total_normalized_kwh: number;
  avg_power_kw: number;
  total_co2_kg: number;
  record_count: number;
}

export interface ScadaRecord {
  id: string;
  timestamp: string;
  normalized_kwh: number;
  power_gross_kw: number;
  gas_flow_nm3h: number;
  raw_metrics: Record<string, unknown>;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      return JSON.stringify(detail);
    }
    return JSON.stringify(payload);
  } catch {
    const text = await response.text();
    return text || `Request failed with status ${response.status}`;
  }
}

function withParams(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<T>;
}

export function fetchTelemetryStats() {
  return apiFetch<TelemetryStats>("/telemetry/stats");
}

export function fetchTelemetryLatest() {
  return apiFetch<TelemetryReading[]>("/telemetry/latest");
}

export function fetchTelemetryHistory(sensorId: string, limit = 200) {
  return apiFetch<TelemetryReading[]>(
    withParams(`/telemetry/history/${encodeURIComponent(sensorId)}`, { limit }),
  );
}

export function fetchDocumentsSummary() {
  return apiFetch<DocumentsSummary>("/documents/summary");
}

export function fetchDocuments(params?: {
  skip?: number;
  limit?: number;
  doc_type?: string;
  review_status?: string;
}) {
  return apiFetch<DocumentRecord[]>(withParams("/documents", params));
}

export function fetchEvents(params?: {
  skip?: number;
  limit?: number;
  severity?: string;
  source?: string;
  acknowledged?: boolean;
}) {
  return apiFetch<EventRecord[]>(withParams("/events", params));
}

export function fetchEventStats() {
  return apiFetch<EventStats>("/events/stats");
}

export function acknowledgeEvent(id: string) {
  return apiFetch<EventRecord>(`/events/${encodeURIComponent(id)}/acknowledge`, {
    method: "PATCH",
  });
}

export function fetchScadaSummary() {
  return apiFetch<ScadaSummary>("/scada/summary");
}

export function fetchScadaRecords(params?: { skip?: number; limit?: number }) {
  return apiFetch<ScadaRecord[]>(withParams("/scada", params));
}

export function uploadScadaExcel(formData: FormData) {
  return apiFetch<{
    inserted: number;
    skipped: number;
    pci_factor: number;
    interval_minutes: number;
    sheet_name: string;
  }>("/scada/upload/excel", {
    method: "POST",
    body: formData,
  });
}
