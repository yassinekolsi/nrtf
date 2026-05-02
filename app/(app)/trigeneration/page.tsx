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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KPICard } from "@/components/kpi-card";
import {
  fetchScadaSummary,
  fetchTelemetryHistory,
  fetchTelemetryLatest,
  type ScadaSummary,
  type TelemetryReading,
} from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

// Custom dot component for quality anomalies.
function CustomDot(props: { cx?: number; cy?: number; payload?: { isAnomaly: boolean } }) {
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
  current: "acs712_current_01",
  voltage: "acs712_nominal_voltage_01",
  vibration: "mpu6050_vib_01",
};

interface PowerHistoryPoint {
  date: string;
  powerKW: number;
  isAnomaly: boolean;
}

function getReading(readings: TelemetryReading[], sensorId: string) {
  return readings.find((reading) => reading.sensor_id === sensorId);
}

function formatValue(value: number | undefined, digits = 1) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : "--";
}

export default function TrigenerationPage() {
  const { t } = useLanguage();
  const [latestReadings, setLatestReadings] = useState<TelemetryReading[]>([]);
  const [history, setHistory] = useState<PowerHistoryPoint[]>([]);
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
        const [latestResult, historyResult, scadaResult] = await Promise.allSettled([
          fetchTelemetryLatest(),
          fetchTelemetryHistory(SENSOR_IDS.power, 200),
          fetchScadaSummary(),
        ]);

        if (latestResult.status === "fulfilled") {
          setLatestReadings(latestResult.value);
        }
        if (historyResult.status === "fulfilled") {
          setHistory(
            historyResult.value
              .slice()
              .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
              .map((reading) => ({
                date: new Date(reading.timestamp_ms).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                powerKW: reading.value / 1000,
                isAnomaly: reading.quality.toLowerCase() !== "valid",
              })),
          );
        }
        if (scadaResult.status === "fulfilled") {
          setScadaSummary(scadaResult.value);
        }

        const firstError = [latestResult, historyResult, scadaResult].find(
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
      current: getReading(latestReadings, SENSOR_IDS.current),
      voltage: getReading(latestReadings, SENSOR_IDS.voltage),
      vibration: getReading(latestReadings, SENSOR_IDS.vibration),
    }),
    [latestReadings],
  );

  const powerKW = sensors.power ? sensors.power.value / 1000 : undefined;
  const utilizationPercent = Math.min(
    100,
    Math.max(0, Math.round(((scadaSummary?.avg_power_kw ?? powerKW ?? 0) / 1200) * 100)),
  );

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{t.trigeneration}</h1>
        <Badge className="bg-energy-green text-energy-green-foreground">
          Live from ESP32
        </Badge>
      </div>

      {error && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t.activePower}
          value={formatValue(powerKW, 2)}
          unit={t.kw}
          status="good"
          subtitle={sensors.power?.sensor_id ?? "No reading"}
        />
        <KPICard
          label="Current"
          value={formatValue(sensors.current?.value, 2)}
          unit="A"
          status="normal"
        />
        <KPICard
          label="Voltage"
          value={formatValue(sensors.voltage?.value, 1)}
          unit="V"
          status="good"
        />
        <KPICard
          label="Vibration"
          value={formatValue(sensors.vibration?.value, 2)}
          unit={sensors.vibration?.unit || ""}
          status={sensors.vibration?.value && sensors.vibration.value > 2 ? "warning" : "good"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Power Chart */}
        <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">
              {t.dailyElectricalProduction} ({t.kw})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No telemetry history yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={history}
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
                        tickFormatter={(v: number) => `${v.toFixed(1)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)} ${t.kw}`, "Power"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="powerKW"
                        stroke="var(--chart-1)"
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

        {/* Quality Chart */}
        <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">
              Power Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No telemetry history yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={history}
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
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                        formatter={(value: number, name: string, props: { payload?: { isAnomaly: boolean } }) => {
                          const isAnomaly = props.payload?.isAnomaly;
                          return [`${value.toFixed(2)} ${t.kw} ${isAnomaly ? "(ANOMALY)" : ""}`, "Power"];
                        }}
                      />
                      <ReferenceLine
                        y={scadaSummary?.avg_power_kw ?? 0}
                        stroke="var(--chart-2)"
                        strokeDasharray="5 5"
                        label={{ value: "SCADA avg", position: "right", fontSize: 11 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="powerKW"
                        stroke="var(--chart-5)"
                        strokeWidth={2}
                        dot={<CustomDot />}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
      </div>

      {/* SCADA Status */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
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
