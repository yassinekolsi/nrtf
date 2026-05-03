'use client'

export type ReviewStatus = 'processing' | 'accepted' | 'requires_review' | 'failed'

export interface DocumentRecord {
  id: string
  created_at: string | null
  filename: string
  doc_type: string
  supplier: string | null
  billing_month: string | null
  raw_json: Record<string, unknown>
  normalized_kwh: number | null
  co2_emissions_kg: number | null
  review_status: ReviewStatus
  overall_confidence: number | null
}

export interface DocumentsSummary {
  total_normalized_kwh: number
  total_co2_kg: number
  by_supplier: Array<{
    supplier: string
    total_kwh: number
    total_co2_kg: number
  }>
}

export interface DocumentsCo2MonthlyItem {
  billing_month: string
  gas_kwh: number
  grid_kwh: number
  co2_gas_kg: number
  co2_grid_kg: number
  co2_total_kg: number
  scada_gas_kwh: number
  scada_co2_gas_kg: number
}

export interface DocumentsCo2MonthlyResponse {
  factors: {
    natural_gas: number
    grid_electricity: number
    self_produced: number
  }
  items: DocumentsCo2MonthlyItem[]
}

export interface DocumentBatchUploadItem {
  id: string | null
  filename: string
  review_status: ReviewStatus
  overall_confidence: number | null
  warnings: string[]
  detail: string | null
}

export interface DocumentBatchUploadResponse {
  items: DocumentBatchUploadItem[]
  accepted: number
  requires_review: number
  failed: number
}

export interface DocumentReviewPayload {
  doc_type?: string | null
  supplier?: string | null
  billing_month?: string | null
  document_date?: string | null
  invoice_number?: string | null
  reference_number?: string | null
  site_name?: string | null
  client_name?: string | null
  energy_type?: string | null
  raw_value?: number | string | null
  raw_unit?: string | null
  pci_factor?: number | string | null
  amount_ttc?: number | string | null
  index_ancien?: number | string | null
  index_nouveau?: number | string | null
  subscribed_power?: number | string | null
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000/api'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

type CacheOptions = {
  ttlMs?: number
  skipCache?: boolean
  cacheKey?: string
}

const DEFAULT_TTL_MS = 120_000
const DOCUMENTS_SUMMARY_TTL_MS = 300_000
const DOCUMENTS_LIST_TTL_MS = 120_000
const CO2_MONTHLY_TTL_MS = 300_000

const responseCache = new Map<string, CacheEntry<unknown>>()
const inflightRequests = new Map<string, Promise<unknown>>()

function buildCacheKey(path: string, init?: RequestInit, overrideKey?: string) {
  if (overrideKey) return overrideKey
  const method = init?.method?.toUpperCase() ?? 'GET'
  return `${method}:${path}`
}

function readCache<T>(key: string) {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key)
    return null
  }
  return entry.value as T
}

function writeCache<T>(key: string, value: T, ttlMs: number) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (typeof payload?.detail === 'string') {
      return payload.detail
    }

    if (Array.isArray(payload?.detail)) {
      return payload.detail
        .map((issue: { msg?: unknown; loc?: unknown }) => {
          if (typeof issue?.msg !== 'string') {
            return JSON.stringify(issue)
          }

          const location = Array.isArray(issue.loc) ? issue.loc.join('.') : null
          return location ? `${location}: ${issue.msg}` : issue.msg
        })
        .join('; ')
    }

    if (typeof payload?.error === 'string') {
      return payload.error
    }

    return JSON.stringify(payload)
  } catch {
    const text = await response.text()
    return text || `Request failed with status ${response.status}`
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: CacheOptions
): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET'
  const skipCache = options?.skipCache || method !== 'GET'
  const cacheKey = buildCacheKey(path, init, options?.cacheKey)

  if (!skipCache) {
    const cached = readCache<T>(cacheKey)
    if (cached) return cached

    const inflight = inflightRequests.get(cacheKey)
    if (inflight) return inflight as Promise<T>
  }

  const request = (async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
    })

    if (!response.ok) {
      throw new Error(await parseError(response))
    }

    const data = (await response.json()) as T
    if (!skipCache) {
      writeCache(cacheKey, data, options?.ttlMs ?? DEFAULT_TTL_MS)
    }

    return data
  })()

  if (!skipCache) {
    inflightRequests.set(cacheKey, request)
  }

  try {
    return await request
  } finally {
    if (!skipCache) {
      inflightRequests.delete(cacheKey)
    }
  }
}

export function getDocumentsApiBaseUrl() {
  return API_BASE_URL
}

export function getDocumentSourceUrl(id: string) {
  return `${API_BASE_URL}/documents/${id}/source`
}

export function fetchDocuments(options?: {
  docType?: string
  reviewStatus?: ReviewStatus
}) {
  const search = new URLSearchParams()
  if (options?.docType) {
    search.set('doc_type', options.docType)
  }
  if (options?.reviewStatus) {
    search.set('review_status', options.reviewStatus)
  }

  const suffix = search.toString() ? `?${search.toString()}` : ''
  return apiFetch<DocumentRecord[]>(`/documents${suffix}`, undefined, {
    ttlMs: DOCUMENTS_LIST_TTL_MS,
  })
}

export function fetchDocumentsSummary() {
  return apiFetch<DocumentsSummary>('/documents/summary', undefined, {
    ttlMs: DOCUMENTS_SUMMARY_TTL_MS,
  })
}

export function fetchDocumentsCo2Monthly() {
  return apiFetch<DocumentsCo2MonthlyResponse>('/documents/co2/monthly', undefined, {
    ttlMs: CO2_MONTHLY_TTL_MS,
  })
}

export function uploadDocument(formData: FormData) {
  return apiFetch<DocumentRecord>('/documents/upload', {
    method: 'POST',
    body: formData,
  })
}

export function uploadDocumentsBatch(formData: FormData) {
  return apiFetch<DocumentBatchUploadResponse>('/documents/upload/batch', {
    method: 'POST',
    body: formData,
  })
}

export function uploadExcelDocuments(formData: FormData) {
  return apiFetch<{ inserted: number }>('/documents/upload/excel', {
    method: 'POST',
    body: formData,
  })
}

export function uploadScadaExcel(formData: FormData) {
  return apiFetch<{
    inserted: number
    skipped: number
    pci_factor: number
    interval_minutes: number
    sheet_name: string
  }>('/scada/upload/excel', {
    method: 'POST',
    body: formData,
  })
}

export function reviewDocument(id: string, payload: DocumentReviewPayload) {
  return apiFetch<DocumentRecord>(`/documents/${id}/review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
