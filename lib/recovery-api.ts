'use client'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000/api'

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (typeof payload?.detail === 'string') return payload.detail
    if (typeof payload?.error === 'string') return payload.error
    return JSON.stringify(payload)
  } catch {
    return `Request failed with status ${response.status}`
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface RecoveryOpportunity {
  source_id: string
  name: string
  system: string
  location: string
  description: string
  temperature_c_min: number
  temperature_c_max: number
  source_power_kw: number
  load_factor: number
  waste_heat_fraction: number
  capture_efficiency: number
  estimated_thermal_power_kw: number
  captured_power_kw: number
  availability_hours_per_year: number
  recoverable_energy_kwh_year: number
  recoverable_energy_mwh_year: number
  avoided_energy_vector: string
  avoided_emission_factor_kgco2_per_kwh: number
  reference_efficiency: number
  co2_reduction_kg_year: number
  co2_reduction_t_year: number
  energy_price_dt_per_kwh: number
  annual_savings_dt: number
  opex_dt_year: number
  capex_dt: number
  simple_payback_years: number | null
  npv_10y_dt: number
  integration_complexity_score: number
  implementation_cost_score: number
  measurement_confidence_score: number
  strategic_fit_score: number
  priority_score: number
  priority_rank: number
  complexity_label: string
  assumptions: string[]
  calculation_trace: string[]
  data_quality: string
  requires_measurement: string[]
}

export interface RecoverySummary {
  total_recoverable_energy_kwh_year: number
  total_recoverable_energy_mwh_year: number
  total_co2_reduction_t_year: number
  total_annual_savings_dt: number
  best_payback_years: number | null
  top_opportunity: string | null
  opportunity_count: number
}

export interface RecoverySimulationPayload {
  source_id: string
  capture_efficiency?: number
  energy_price_dt_per_kwh?: number
  capex_dt?: number
  reference_efficiency?: number
  load_factor?: number
  availability_hours_per_year?: number
  opex_dt_year?: number
  discount_rate?: number
  project_lifetime_years?: number
}

export interface SimulationDeltas {
  recoverable_energy_kwh_year: number
  recoverable_energy_mwh_year: number
  co2_reduction_t_year: number
  annual_savings_dt: number
  simple_payback_years: number | null
  npv_10y_dt: number
}

export interface RecoverySimulationResponse {
  base: RecoveryOpportunity
  simulated: RecoveryOpportunity
  deltas: SimulationDeltas
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function fetchRecoverySummary(): Promise<RecoverySummary> {
  return apiFetch<RecoverySummary>('/recovery/summary', { cache: 'no-store' })
}

export function fetchRecoveryOpportunities(): Promise<{
  items: RecoveryOpportunity[]
  count: number
  generated_at: string
}> {
  return apiFetch('/recovery/opportunities', { cache: 'no-store' })
}

export function simulateRecoveryOpportunity(
  payload: RecoverySimulationPayload
): Promise<RecoverySimulationResponse> {
  return apiFetch<RecoverySimulationResponse>('/recovery/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function exportRecoveryOutputs(): Promise<{
  submission_path: string
  report_path: string
  items_exported: number
}> {
  return apiFetch('/recovery/export', { cache: 'no-store' })
}
