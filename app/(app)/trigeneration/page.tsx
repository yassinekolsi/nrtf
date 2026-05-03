"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchScadaRecords,
  fetchScadaSummary,
  fetchTelemetryLatest,
  type ScadaRecord,
  type ScadaSummary,
  type TelemetryReading,
} from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

// Custom dot component for quality anomalies.
function CustomDot(props: { cx?: number; cy?: number; payload?: { isAnomaly?: boolean } }) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;

  if (payload.isAnomaly) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="var(--alarm-red)"
        stroke="var(--alarm-red)"
        strokeWidth={2}
      />
    );
  }
  return null;
}

const SENSOR_IDS = {
  power: "acs712_power_01",
};

const SCADA_HISTORY_LIMIT = 288;
const NOMINAL_POWER_KW = 1200;
const GAS_PCI_KWH_PER_NM3 = 9.082;
const HEAT_RECOVERY_BASELINE_KW = 161;
const ABSORPTION_BASELINE_KW = 258;

interface ScadaHistoryPoint {
  date: string;
  powerKw: number;
  gasInputKw: number;
  gasFlowNm3h: number;
  heatRecoveryKw: number;
  absorptionColdKw: number;
  powerFactor: number | null;
  electricalEfficiencyPct: number | null;
  totalEfficiencyPct: number | null;
  isAnomaly: boolean;
}

function getReading(readings: TelemetryReading[], sensorId: string) {
  return readings.find((reading) => reading.sensor_id === sensorId);
}

function formatValue(value: number | undefined, digits = 1) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : "--";
}

function formatNullableMetricValue(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  tone?: "default" | "good" | "warning" | "critical";
}

function MetricCard({ label, value, unit, subtitle, tone = "default" }: MetricCardProps) {
  const toneColors = {
    default: "text-foreground",
    good: "text-energy-green",
    warning: "text-warning-amber",
    critical: "text-alarm-red",
  };

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-br from-card via-card to-primary/10">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-foreground/55" />
      <CardContent className="relative p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tracking-tight", toneColors[tone])}>
            {value}
          </span>
          {unit ? <span className="text-lg font-medium text-muted-foreground">{unit}</span> : null}
        </div>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatTimestampLabel(timestamp: string | number) {
  return new Date(timestamp).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metric(record: ScadaRecord, key: string) {
  return toFiniteNumber(record.raw_metrics?.[key]);
}

function sumMetrics(record: ScadaRecord, keys: string[]) {
  const values = keys
    .map((key) => metric(record, key))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function estimateFromOutput(powerKw: number, baselineKw: number) {
  if (!Number.isFinite(powerKw) || powerKw <= 0) return 0;
  return (powerKw / NOMINAL_POWER_KW) * baselineKw;
}

function buildScadaPoint(record: ScadaRecord): ScadaHistoryPoint {
  const powerKw = toFiniteNumber(record.power_gross_kw) ?? 0;
  const gasFlowNm3h = toFiniteNumber(record.gas_flow_nm3h) ?? 0;
  const gasInputKw = gasFlowNm3h * GAS_PCI_KWH_PER_NM3;
  const directHeatRecovery = sumMetrics(record, [
    "hot_water_recup_power_kw",
    "hot_water_alpha_san_power_kw",
    "hot_water_alpha_power_kw",
    "hot_water_gamma_power_kw",
  ]);
  const directAbsorption = metric(record, "chilled_water_power_kw");
  const directElectricalEfficiency = metric(record, "efficiency_electrical_pct");
  const electricalEfficiencyPct =
    directElectricalEfficiency ?? (gasInputKw > 0 ? (powerKw / gasInputKw) * 100 : null);
  const totalEfficiencyPct = metric(record, "efficiency_total_pct");
  const powerFactor = metric(record, "power_factor");

  return {
    date: formatTimestampLabel(record.timestamp),
    powerKw,
    gasInputKw,
    gasFlowNm3h,
    heatRecoveryKw: directHeatRecovery ?? estimateFromOutput(powerKw, HEAT_RECOVERY_BASELINE_KW),
    absorptionColdKw: directAbsorption ?? estimateFromOutput(powerKw, ABSORPTION_BASELINE_KW),
    powerFactor,
    electricalEfficiencyPct,
    totalEfficiencyPct,
    isAnomaly:
      powerKw < NOMINAL_POWER_KW * 0.15 ||
      (powerFactor !== null && powerFactor < 0.9) ||
      (electricalEfficiencyPct !== null && electricalEfficiencyPct < 38),
  };
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return undefined;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export default function TrigenerationPage() {
  const { t } = useLanguage();
  const [latestReadings, setLatestReadings] = useState<TelemetryReading[]>([]);
  const [scadaRecords, setScadaRecords] = useState<ScadaRecord[]>([]);
  const [scadaSummary, setScadaSummary] = useState<ScadaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const readings = await fetchTelemetryLatest();
      setLatestReadings(readings);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Telemetry unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadPageData() {
      try {
        setLoading(true);
        const [latestResult, scadaResult, recordsResult] = await Promise.allSettled([
          fetchTelemetryLatest(),
          fetchScadaSummary(),
          fetchScadaRecords({ skip: 0, limit: SCADA_HISTORY_LIMIT }),
        ]);

        if (latestResult.status === "fulfilled") {
          setLatestReadings(latestResult.value);
        }
        if (scadaResult.status === "fulfilled") {
          setScadaSummary(scadaResult.value);
        }
        if (recordsResult.status === "fulfilled") {
          setScadaRecords(recordsResult.value);
        }

        const firstError = [latestResult, scadaResult, recordsResult].find(
          (result) => result.status === "rejected",
        );
        if (firstError?.status === "rejected") {
          setError(
            firstError.reason instanceof Error ? firstError.reason.message : "Trigeneration data unavailable",
          );
        } else {
          setError(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadPageData();
    const interval = window.setInterval(loadLatest, 10_000);
    return () => window.clearInterval(interval);
  }, [loadLatest]);

  const sensors = useMemo(
    () => ({
      power: getReading(latestReadings, SENSOR_IDS.power),
    }),
    [latestReadings],
  );

  const scadaHistory = useMemo(
    () =>
      scadaRecords
        .slice()
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(buildScadaPoint),
    [scadaRecords],
  );
  const latestScada = scadaHistory[scadaHistory.length - 1];
  const averageElectricalEfficiency = average(scadaHistory.map((point) => point.electricalEfficiencyPct));
  const averagePowerFactor = average(scadaHistory.map((point) => point.powerFactor));

  const power = sensors.power?.value;
  const powerUnit = sensors.power?.unit || "W";
  const utilizationPowerKW = powerUnit.toLowerCase() === "w" && typeof power === "number"
    ? power / 1000
    : power;
  const displayPowerKw = latestScada?.powerKw ?? scadaSummary?.avg_power_kw ?? utilizationPowerKW;
  const utilizationPercent = Math.min(
    100,
    Math.max(0, Math.round(((displayPowerKw ?? 0) / NOMINAL_POWER_KW) * 100)),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] border border-border bg-gradient-to-br from-primary/15 via-card to-muted/40 p-5">
        <h1 className="text-2xl font-bold text-foreground">{t.trigeneration}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatValue(scadaSummary?.total_normalized_kwh, 0)} kWh / {formatValue(scadaSummary?.total_co2_kg, 0)} kg CO2
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Electrical output"
          value={formatNullableMetricValue(displayPowerKw, 1)}
          unit={t.kw}
          tone={utilizationPercent < 50 ? "warning" : "good"}
          subtitle={`${utilizationPercent}% of 1.2 MW nominal`}
        />
        <MetricCard
          label="Gas input"
          value={formatNullableMetricValue(latestScada?.gasInputKw, 0)}
          unit="kWth"
          subtitle={`${formatNullableMetricValue(latestScada?.gasFlowNm3h, 1)} Nm3/h`}
        />
        <MetricCard
          label="Power factor"
          value={formatNullableMetricValue(latestScada?.powerFactor ?? averagePowerFactor, 2)}
          tone={(latestScada?.powerFactor ?? averagePowerFactor ?? 1) < 0.9 ? "warning" : "good"}
          subtitle="Target >= 0.90"
        />
        <MetricCard
          label="Electrical efficiency"
          value={formatNullableMetricValue(latestScada?.electricalEfficiencyPct ?? averageElectricalEfficiency, 1)}
          unit="%"
          tone={(latestScada?.electricalEfficiencyPct ?? averageElectricalEfficiency ?? 100) < 38 ? "warning" : "good"}
          subtitle="Motor gas-to-power"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-border bg-card">
          <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card pb-4">
            <CardTitle className="text-lg font-semibold">
              Electrical Output vs Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : scadaHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No SCADA records yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={scadaHistory}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => `${value.toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(1)} kW`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <ReferenceLine
                      y={NOMINAL_POWER_KW}
                      stroke="var(--chart-2)"
                      strokeDasharray="5 5"
                      label={{ value: "1.2 MW", position: "right", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="powerKw"
                      name="Electrical output"
                      stroke="var(--chart-1)"
                      strokeWidth={3}
                      dot={<CustomDot />}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border bg-card">
          <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card pb-4">
            <CardTitle className="text-lg font-semibold">
              Useful Thermal Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : scadaHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No SCADA records yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={scadaHistory}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => `${value.toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                      formatter={(value: number, name: string) => [`${value.toFixed(1)} kW`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <ReferenceLine
                      y={HEAT_RECOVERY_BASELINE_KW}
                      stroke="var(--chart-2)"
                      strokeDasharray="4 4"
                      label={{ value: "161 kW heat", position: "right", fontSize: 11 }}
                    />
                    <ReferenceLine
                      y={ABSORPTION_BASELINE_KW}
                      stroke="var(--chart-3)"
                      strokeDasharray="4 4"
                      label={{ value: "258 kW cold", position: "right", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="heatRecoveryKw"
                      name="Hot water recovery"
                      stroke="var(--chart-5)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="absorptionColdKw"
                      name="Absorption cooling"
                      stroke="var(--chart-4)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card pb-4">
          <CardTitle className="text-lg font-semibold">
            Power Quality and Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : scadaHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No SCADA records yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={scadaHistory}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="factor"
                    domain={[0, 1]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => value.toFixed(2)}
                  />
                  <YAxis
                    yAxisId="efficiency"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "Power factor") return [value.toFixed(2), name];
                      return [`${value.toFixed(1)}%`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <ReferenceLine
                    yAxisId="factor"
                    y={0.9}
                    stroke="var(--chart-4)"
                    strokeDasharray="5 5"
                    label={{ value: "PF 0.90", position: "right", fontSize: 11 }}
                  />
                  <ReferenceLine
                    yAxisId="efficiency"
                    y={80}
                    stroke="var(--chart-2)"
                    strokeDasharray="5 5"
                    label={{ value: "80% total", position: "right", fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="powerFactor"
                    name="Power factor"
                    yAxisId="factor"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="electricalEfficiencyPct"
                    name="Electrical efficiency"
                    yAxisId="efficiency"
                    stroke="var(--chart-5)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="totalEfficiencyPct"
                    name="Total efficiency"
                    yAxisId="efficiency"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card pb-4">
          <CardTitle className="text-lg font-semibold">
            SCADA Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total normalized energy</p>
              <p className="text-2xl font-bold text-foreground">
                {formatValue(scadaSummary?.total_normalized_kwh, 0)} kWh
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Average power</p>
              <p className="text-2xl font-bold text-muted-foreground">
                {formatValue(scadaSummary?.avg_power_kw, 1)} {t.kw}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.utilization}</span>
              <span className={cn(
                "font-semibold",
                utilizationPercent < 50 ? "text-warning-amber" : "text-energy-green"
              )}>
                {utilizationPercent}%
              </span>
            </div>
            <Progress value={utilizationPercent} className="h-4" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
