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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return response.json() as Promise<T>
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
  return apiFetch<DocumentRecord[]>(`/documents${suffix}`, {
    cache: 'no-store',
  })
}

export function fetchDocumentsSummary() {
  return apiFetch<DocumentsSummary>('/documents/summary', {
    cache: 'no-store',
  })
}

export function fetchDocumentsCo2Monthly() {
  return apiFetch<DocumentsCo2MonthlyResponse>('/documents/co2/monthly', {
    cache: 'no-store',
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
