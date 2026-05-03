"use client";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000/api";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheOptions = {
  ttlMs?: number;
  skipCache?: boolean;
  cacheKey?: string;
};

const DEFAULT_TTL_MS = 60_000;
const TELEMETRY_STATS_TTL_MS = 10_000;
const TELEMETRY_LATEST_TTL_MS = 8_000;
const TELEMETRY_HISTORY_TTL_MS = 55_000;
const DOCUMENTS_SUMMARY_TTL_MS = 300_000;
const DOCUMENTS_LIST_TTL_MS = 120_000;
const DOCUMENTS_CO2_MONTHLY_TTL_MS = 300_000;
const SCADA_SUMMARY_TTL_MS = 60_000;
const SCADA_RECORDS_TTL_MS = 60_000;

const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function buildCacheKey(path: string, init?: RequestInit, overrideKey?: string) {
  if (overrideKey) return overrideKey;
  const method = init?.method?.toUpperCase() ?? "GET";
  return `${method}:${path}`;
}

function readCache<T>(key: string) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeCache<T>(key: string, value: T, ttlMs: number) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

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

export interface TelemetryLiveSnapshot {
  latest: TelemetryReading[];
  history: Record<string, TelemetryReading[]>;
  stats: TelemetryStats;
}

export interface TelemetryHistoryParams {
  limit?: number;
  hours?: number;
  since_ms?: number;
  until_ms?: number;
  order?: "asc" | "desc";
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

export interface DocumentsCo2MonthlyItem {
  billing_month: string;
  gas_kwh: number;
  grid_kwh: number;
  co2_gas_kg: number;
  co2_grid_kg: number;
  co2_total_kg: number;
  scada_gas_kwh: number;
  scada_co2_gas_kg: number;
}

export interface DocumentsCo2MonthlyResponse {
  factors: {
    natural_gas: number;
    grid_electricity: number;
    self_produced: number;
  };
  items: DocumentsCo2MonthlyItem[];
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

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: CacheOptions,
): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const skipCache = options?.skipCache || method !== "GET";
  const cacheKey = buildCacheKey(path, init, options?.cacheKey);

  if (!skipCache) {
    const cached = readCache<T>(cacheKey);
    if (cached) return cached;

    const inflight = inflightRequests.get(cacheKey);
    if (inflight) return inflight as Promise<T>;
  }

  const request = (async () => {
    const response = await fetch(`${BASE}${path}`, {
      cache: "no-store",
      ...init,
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const data = (await response.json()) as T;
    if (!skipCache) {
      writeCache(cacheKey, data, options?.ttlMs ?? DEFAULT_TTL_MS);
    }

    return data;
  })();

  if (!skipCache) {
    inflightRequests.set(cacheKey, request);
  }

  try {
    return await request;
  } finally {
    if (!skipCache) {
      inflightRequests.delete(cacheKey);
    }
  }
}

export function fetchTelemetryStats() {
  return apiFetch<TelemetryStats>("/telemetry/stats", undefined, {
    ttlMs: TELEMETRY_STATS_TTL_MS,
  });
}

export function fetchTelemetryLatest() {
  return apiFetch<TelemetryReading[]>("/telemetry/latest", undefined, {
    ttlMs: TELEMETRY_LATEST_TTL_MS,
  });
}

export function fetchTelemetryLiveSnapshot(sensorIds?: string[]) {
  const search = new URLSearchParams();
  sensorIds?.forEach((sensorId) => search.append("sensor_id", sensorId));
  const query = search.toString();
  const path = query ? `/telemetry/live?${query}` : "/telemetry/live";
  return apiFetch<TelemetryLiveSnapshot>(path, undefined, { skipCache: true });
}

export function fetchTelemetryHistory(sensorId: string, limit?: number): Promise<TelemetryReading[]>;
export function fetchTelemetryHistory(
  sensorId: string,
  params?: TelemetryHistoryParams,
): Promise<TelemetryReading[]>;
export function fetchTelemetryHistory(
  sensorId: string,
  params: number | TelemetryHistoryParams = 200,
) {
  const query: Record<string, string | number | boolean | undefined> =
    typeof params === "number" ? { limit: params } : { ...params };
  return apiFetch<TelemetryReading[]>(
    withParams(`/telemetry/history/${encodeURIComponent(sensorId)}`, query),
    undefined,
    { ttlMs: TELEMETRY_HISTORY_TTL_MS },
  );
}

export function fetchDocumentsSummary() {
  return apiFetch<DocumentsSummary>("/documents/summary", undefined, {
    ttlMs: DOCUMENTS_SUMMARY_TTL_MS,
  });
}

export function fetchDocumentsCo2Monthly() {
  return apiFetch<DocumentsCo2MonthlyResponse>("/documents/co2/monthly", undefined, {
    ttlMs: DOCUMENTS_CO2_MONTHLY_TTL_MS,
  });
}

export function fetchDocuments(params?: {
  skip?: number;
  limit?: number;
  doc_type?: string;
  review_status?: string;
}) {
  return apiFetch<DocumentRecord[]>(withParams("/documents", params), undefined, {
    ttlMs: DOCUMENTS_LIST_TTL_MS,
  });
}

export function fetchEvents(params?: {
  skip?: number;
  limit?: number;
  severity?: string;
  source?: string;
  acknowledged?: boolean;
}) {
  return apiFetch<EventRecord[]>(withParams("/events", params), undefined, {
    skipCache: true,
  });
}

export function fetchEventStats() {
  return apiFetch<EventStats>("/events/stats", undefined, { skipCache: true });
}

export function acknowledgeEvent(id: string) {
  return apiFetch<EventRecord>(`/events/${encodeURIComponent(id)}/acknowledge`, {
    method: "PATCH",
  });
}

export function fetchScadaSummary() {
  return apiFetch<ScadaSummary>("/scada/summary", undefined, {
    ttlMs: SCADA_SUMMARY_TTL_MS,
  });
}

export function fetchScadaRecords(params?: { skip?: number; limit?: number }) {
  return apiFetch<ScadaRecord[]>(withParams("/scada", params), undefined, {
    ttlMs: SCADA_RECORDS_TTL_MS,
  });
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
