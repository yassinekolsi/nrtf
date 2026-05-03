"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
} from "recharts";
import { KPICard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/language-context";
import {
  fetchRecoverySummary,
  fetchRecoveryOpportunities,
  simulateRecoveryOpportunity,
  exportRecoveryOutputs,
  RecoverySummary,
  RecoveryOpportunity,
  RecoverySimulationPayload,
  RecoverySimulationResponse,
} from "@/lib/recovery-api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return v.toLocaleString("fr-TN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ComplexityBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    low: "bg-energy-green/20 text-energy-green border-energy-green/30",
    medium: "bg-warning-amber/20 text-warning-amber border-warning-amber/30",
    high: "bg-alarm-red/20 text-alarm-red border-alarm-red/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        colors[label] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RecoveryPage() {
  const { t } = useLanguage();

  const [summary, setSummary] = useState<RecoverySummary | null>(null);
  const [opportunities, setOpportunities] = useState<RecoveryOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulator state
  const [simSourceId, setSimSourceId] = useState<string>("");
  const [simCaptureEff, setSimCaptureEff] = useState<number>(0.6);
  const [simEnergyPrice, setSimEnergyPrice] = useState<number>(0.028);
  const [simCapex, setSimCapex] = useState<number>(15000);
  const [simRefEff, setSimRefEff] = useState<number>(0.9);
  const [simDiscountRate, setSimDiscountRate] = useState<number>(0.05);
  const [simLifetime, setSimLifetime] = useState<number>(10);
  const [simResult, setSimResult] = useState<RecoverySimulationResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Export state
  const [exportResult, setExportResult] = useState<{
    submission_path: string;
    report_path: string;
    items_exported: number;
  } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Load initial data
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sum, opps] = await Promise.all([
        fetchRecoverySummary(),
        fetchRecoveryOpportunities(),
      ]);
      setSummary(sum);
      setOpportunities(opps.items);
      if (opps.items.length > 0) {
        const first = opps.items[0];
        setSimSourceId(first.source_id);
        setSimCaptureEff(first.capture_efficiency);
        setSimEnergyPrice(first.energy_price_dt_per_kwh);
        setSimCapex(first.capex_dt);
        setSimRefEff(first.reference_efficiency);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load recovery data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Simulator: update defaults when source changes
  const handleSourceChange = (sid: string) => {
    setSimSourceId(sid);
    setSimResult(null);
    const opp = opportunities.find((o) => o.source_id === sid);
    if (opp) {
      setSimCaptureEff(opp.capture_efficiency);
      setSimEnergyPrice(opp.energy_price_dt_per_kwh);
      setSimCapex(opp.capex_dt);
      setSimRefEff(opp.reference_efficiency);
    }
  };

  const handleSimulate = async () => {
    if (!simSourceId) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const payload: RecoverySimulationPayload = {
        source_id: simSourceId,
        capture_efficiency: simCaptureEff,
        energy_price_dt_per_kwh: simEnergyPrice,
        capex_dt: simCapex,
        reference_efficiency: simRefEff,
        discount_rate: simDiscountRate,
        project_lifetime_years: simLifetime,
      };
      const res = await simulateRecoveryOpportunity(payload);
      setSimResult(res);
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await exportRecoveryOutputs();
      setExportResult(res);
    } catch {
      // ignore
    } finally {
      setExportLoading(false);
    }
  };

  // Chart data
  const barData = opportunities.map((o) => ({
    name: o.name.replace(" Heat Recovery", "").replace(" Recovery", "").replace(" Optimization", ""),
    score: o.priority_score,
    energy: o.recoverable_energy_mwh_year,
  }));

  const scatterData = opportunities
    .filter((o) => o.simple_payback_years !== null)
    .map((o) => ({
      name: o.name,
      x: o.recoverable_energy_mwh_year,
      y: o.simple_payback_years as number,
      z: o.co2_reduction_t_year,
    }));
  const scatterOmittedCount = opportunities.filter(
    (o) => o.simple_payback_years === null
  ).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading recovery data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-alarm-red font-semibold">Backend unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-md border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {t.recovery}
        </h1>
        <button
          id="export-track-b-btn"
          onClick={handleExport}
          disabled={exportLoading}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {exportLoading ? "Exporting…" : "Export Track B Submission"}
        </button>
      </div>

      {exportResult && (
        <Card className="border-energy-green/30 bg-energy-green/5">
          <CardContent className="p-4 text-sm text-energy-green">
            <p className="font-semibold">Export successful — {exportResult.items_exported} opportunities</p>
            <p className="mt-1 text-muted-foreground">📄 {exportResult.submission_path}</p>
            <p className="text-muted-foreground">📝 {exportResult.report_path}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Total Heat Potential"
            value={fmtNum(summary.total_recoverable_energy_mwh_year, 0)}
            unit="MWh/yr"
            status="good"
            subtitle={`${summary.opportunity_count} opportunities`}
          />
          <KPICard
            label="Total CO₂ Reduction"
            value={fmtNum(summary.total_co2_reduction_t_year, 1)}
            unit="tCO₂/yr"
            status="good"
          />
          <KPICard
            label="Est. Annual Savings"
            value={fmtNum(summary.total_annual_savings_dt, 0)}
            unit="DT/yr"
            status="normal"
          />
          <KPICard
            label="Best Payback"
            value={
              summary.best_payback_years != null
                ? fmtNum(summary.best_payback_years, 1)
                : "N/A"
            }
            unit="years"
            status={
              summary.best_payback_years != null && summary.best_payback_years <= 3
                ? "good"
                : "normal"
            }
            subtitle={`Top: ${summary.top_opportunity ?? "—"}`}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Priority Score Bar Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Priority Score by Opportunity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ top: 4, right: 12, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Score", angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(1)}`, "Priority Score"]}
                />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Energy vs Payback Scatter */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Energy vs Payback (bubble = CO₂ t/yr)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="x"
                  name="Energy MWh/yr"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Energy MWh/yr", position: "insideBottom", offset: -2, style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } }}
                />
                <YAxis
                  dataKey="y"
                  name="Payback yr"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Payback yr", angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } }}
                />
                <ZAxis dataKey="z" range={[40, 400]} name="CO₂ t/yr" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <Scatter
                  name="Opportunities"
                  data={scatterData}
                  fill="hsl(var(--primary))"
                  opacity={0.75}
                />
              </ScatterChart>
            </ResponsiveContainer>
            {scatterOmittedCount > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {scatterOmittedCount} opportunity(ies) with no positive savings (payback N/A)
                are not shown on this chart.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Opportunity Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Ranked Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[
                    "#",
                    "Source",
                    "System",
                    "Temp °C",
                    "Cap. kW",
                    "Energy MWh/yr",
                    "CO₂ t/yr",
                    "Savings DT/yr",
                    "CAPEX DT",
                    "Payback yr",
                    "Complexity",
                    "Score",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp, idx) => (
                  <tr
                    key={opp.source_id}
                    className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${
                      idx === 0 ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-3 font-bold text-primary">
                      {opp.priority_rank}
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground max-w-[160px]">
                      <span title={opp.description}>{opp.name}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{opp.system}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {opp.temperature_c_min}–{opp.temperature_c_max}
                    </td>
                    <td className="px-3 py-3">{fmtNum(opp.captured_power_kw, 1)}</td>
                    <td className="px-3 py-3 font-medium text-energy-green">
                      {fmtNum(opp.recoverable_energy_mwh_year, 1)}
                    </td>
                    <td className="px-3 py-3">{fmtNum(opp.co2_reduction_t_year, 1)}</td>
                    <td className="px-3 py-3">{fmtNum(opp.annual_savings_dt, 0)}</td>
                    <td className="px-3 py-3">{fmtNum(opp.capex_dt, 0)}</td>
                    <td className="px-3 py-3">
                      {opp.simple_payback_years != null
                        ? fmtNum(opp.simple_payback_years, 1)
                        : "N/A"}
                    </td>
                    <td className="px-3 py-3">
                      <ComplexityBadge label={opp.complexity_label} />
                    </td>
                    <td className="px-3 py-3 font-bold text-primary">
                      {opp.priority_score.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Simulator Panel */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Opportunity Simulator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Source
                </label>
                <select
                  id="sim-source-select"
                  value={simSourceId}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {opportunities.map((o) => (
                    <option key={o.source_id} value={o.source_id}>
                      #{o.priority_rank} — {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SimInput
                  id="sim-capture-eff"
                  label="Capture Efficiency"
                  value={simCaptureEff}
                  onChange={setSimCaptureEff}
                  step={0.05}
                  min={0.01}
                  max={1}
                />
                <SimInput
                  id="sim-energy-price"
                  label="Gas Price DT/kWh"
                  value={simEnergyPrice}
                  onChange={setSimEnergyPrice}
                  step={0.001}
                  min={0}
                  max={1}
                />
                <SimInput
                  id="sim-capex"
                  label="CAPEX (DT)"
                  value={simCapex}
                  onChange={setSimCapex}
                  step={1000}
                  min={0}
                />
                <SimInput
                  id="sim-ref-eff"
                  label="Reference Efficiency"
                  value={simRefEff}
                  onChange={setSimRefEff}
                  step={0.01}
                  min={0.1}
                  max={1}
                />
                <SimInput
                  id="sim-discount-rate"
                  label="Discount Rate"
                  value={simDiscountRate}
                  onChange={setSimDiscountRate}
                  step={0.01}
                  min={0}
                  max={0.2}
                />
                <SimInput
                  id="sim-lifetime"
                  label="Lifetime (years)"
                  value={simLifetime}
                  onChange={(v) => setSimLifetime(Math.round(v))}
                  step={1}
                  min={1}
                  max={30}
                />
              </div>

              <button
                id="sim-run-btn"
                onClick={handleSimulate}
                disabled={simLoading || !simSourceId}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {simLoading ? "Calculating…" : "Run Simulation"}
              </button>

              {simError && (
                <p className="text-xs text-alarm-red">{simError}</p>
              )}
            </div>

            {/* Simulation Results */}
            <div className="space-y-3">
              {simResult ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Results — {simResult.simulated.name}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <SimMetric
                      label="Energy MWh/yr"
                      base={simResult.base.recoverable_energy_mwh_year}
                      sim={simResult.simulated.recoverable_energy_mwh_year}
                      delta={simResult.deltas.recoverable_energy_mwh_year}
                      decimals={1}
                    />
                    <SimMetric
                      label="CO₂ t/yr"
                      base={simResult.base.co2_reduction_t_year}
                      sim={simResult.simulated.co2_reduction_t_year}
                      delta={simResult.deltas.co2_reduction_t_year}
                      decimals={1}
                    />
                    <SimMetric
                      label="Savings DT/yr"
                      base={simResult.base.annual_savings_dt}
                      sim={simResult.simulated.annual_savings_dt}
                      delta={simResult.deltas.annual_savings_dt}
                      decimals={0}
                    />
                    <SimMetric
                      label="Payback (yr)"
                      base={simResult.base.simple_payback_years}
                      sim={simResult.simulated.simple_payback_years}
                      delta={simResult.deltas.simple_payback_years}
                      decimals={1}
                      lowerIsBetter
                    />
                    <SimMetric
                      label="NPV 10y (DT)"
                      base={simResult.base.npv_10y_dt}
                      sim={simResult.simulated.npv_10y_dt}
                      delta={simResult.deltas.npv_10y_dt}
                      decimals={0}
                    />
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">
                    Configure parameters and click Run Simulation
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SimInput({
  id,
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  );
}

function SimMetric({
  label,
  base,
  sim,
  delta,
  decimals = 1,
  lowerIsBetter = false,
}: {
  label: string;
  base: number | null | undefined;
  sim: number | null | undefined;
  delta: number | null | undefined;
  decimals?: number;
  lowerIsBetter?: boolean;
}) {
  const deltaVal = delta ?? 0;
  const isPositive = lowerIsBetter ? deltaVal < 0 : deltaVal > 0;
  const isNegative = lowerIsBetter ? deltaVal > 0 : deltaVal < 0;

  const deltaColor = isPositive
    ? "text-energy-green"
    : isNegative
    ? "text-alarm-red"
    : "text-muted-foreground";

  const sign = deltaVal > 0 ? "+" : "";

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold text-foreground">
        {sim != null ? fmtNum(sim, decimals) : "N/A"}
      </p>
      <p className="text-xs text-muted-foreground">
        Base: {base != null ? fmtNum(base, decimals) : "N/A"}
      </p>
      {delta != null && (
        <p className={`text-xs font-semibold ${deltaColor}`}>
          {sign}{fmtNum(deltaVal, decimals)}
        </p>
      )}
    </div>
  );
}
