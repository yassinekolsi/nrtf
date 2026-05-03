"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/kpi-card";
import { PowerChart, type PowerChartPoint } from "@/components/power-chart";
import { ActiveAlarms, type ActiveAlarmItem } from "@/components/active-alarms";
import {
  acknowledgeEvent,
  fetchDocumentsSummary,
  fetchEvents,
  fetchEventStats,
  fetchTelemetryLiveSnapshot,
  type DocumentsSummary,
  type EventStats,
  type TelemetryReading,
  type TelemetryStats,
} from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";

const SENSOR_IDS = {
  temperature: "dht11_temp_01",
  humidity: "dht11_hum_01",
  current: "acs712_current_01",
  power: "acs712_power_01",
  vibration: "mpu6050_vib_01",
  voltage: "acs712_nominal_voltage_01",
};

const LIVE_SENSOR_IDS = Object.values(SENSOR_IDS);
const LIVE_POLL_MS = 2_000;

function getReading(readings: TelemetryReading[], sensorId: string) {
  return readings.find((reading) => reading.sensor_id === sensorId);
}

function formatValue(value: number | undefined, digits = 1) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : "--";
}

function formatNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function downsampleReadings<T extends { timestamp_ms: number }>(readings: T[], maxPoints = 1200) {
  if (readings.length <= maxPoints) return readings;
  const step = Math.ceil(readings.length / maxPoints);
  const sampled = readings.filter((_, index) => index % step === 0);
  const last = readings[readings.length - 1];
  if (sampled[sampled.length - 1]?.timestamp_ms !== last.timestamp_ms) {
    sampled.push(last);
  }
  return sampled;
}

function formatHistoryTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildLiveHistoryData(history: Record<string, TelemetryReading[]>) {
  const combined = new Map<number, PowerChartPoint>();
  const addReadings = (sensorId: string, key: string) => {
    (history[sensorId] ?? []).forEach((reading) => {
      const timestamp = reading.timestamp_ms;
      const entry = combined.get(timestamp) ?? {
        time: formatHistoryTime(timestamp),
      };
      combined.set(timestamp, { ...entry, [key]: reading.value });
    });
  };

  addReadings(SENSOR_IDS.temperature, "temperature");
  addReadings(SENSOR_IDS.humidity, "humidity");
  addReadings(SENSOR_IDS.vibration, "vibration");

  const merged = Array.from(combined.entries())
    .map(([timestamp_ms, point]) => ({ ...point, timestamp_ms }))
    .sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  return downsampleReadings(merged);
}

function getTemperatureStatus(value: number | undefined) {
  if (value === undefined) return "normal";
  if (value <= 30) return "good";
  if (value <= 35) return "warning";
  return "critical";
}

function getHumidityStatus(value: number | undefined) {
  if (value === undefined) return "normal";
  if (value >= 35 && value <= 70) return "good";
  if (value >= 25 && value <= 80) return "warning";
  return "critical";
}

function getVibrationStatus(value: number | undefined) {
  if (value === undefined) return "normal";
  if (value <= 1.5) return "good";
  if (value <= 2) return "warning";
  return "critical";
}

function mapSeverity(severity: string): ActiveAlarmItem["severity"] {
  const normalized = severity.toUpperCase();
  if (normalized === "CRITIQUE" || normalized === "CRITICAL") return "Critique";
  if (normalized === "INFO") return "Info";
  return "Moyen";
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const [telemetryStats, setTelemetryStats] = useState<TelemetryStats | null>(null);
  const [latestReadings, setLatestReadings] = useState<TelemetryReading[]>([]);
  const [documentsSummary, setDocumentsSummary] = useState<DocumentsSummary | null>(null);
  const [eventStats, setEventStats] = useState<EventStats | null>(null);
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarmItem[]>([]);
  const [last24HoursData, setLast24HoursData] = useState<PowerChartPoint[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const buildJustification = useCallback(
    (contextData: Record<string, unknown> | null | undefined) => {
      if (!contextData || typeof contextData !== "object") return undefined;

      const parts: string[] = [];
      const sensorId = contextData.sensor_id;
      const quality = contextData.quality;
      const windowValue = toNumber(contextData.window);
      const value = toNumber(contextData.value);
      const expected = toNumber(contextData.expected);
      const stddev = toNumber(contextData.stddev);
      const confidence = toNumber(contextData.confidence);

      if (typeof sensorId === "string" && sensorId.trim()) {
        parts.push(`${t.sensor}: ${sensorId}`);
      }
      if (value !== null) {
        parts.push(`${t.value}: ${formatNumber(value)}`);
      }
      if (expected !== null) {
        parts.push(`${t.expected}: ${formatNumber(expected)}`);
      }
      if (stddev !== null) {
        parts.push(`${t.stddev}: ${formatNumber(stddev)}`);
      }
      if (confidence !== null) {
        const pct = confidence <= 1 ? confidence * 100 : confidence;
        parts.push(`${t.confidence}: ${pct.toFixed(0)}%`);
      }
      if (typeof quality === "string" && quality.trim()) {
        parts.push(`${t.quality}: ${quality}`);
      }
      if (windowValue !== null) {
        parts.push(`${t.window}: ${windowValue}`);
      }

      return parts.length ? parts.join(" · ") : undefined;
    },
    [t],
  );

  const loadTelemetry = useCallback(async () => {
    try {
      const snapshot = await fetchTelemetryLiveSnapshot(LIVE_SENSOR_IDS);
      setTelemetryStats(snapshot.stats);
      setLatestReadings(snapshot.latest);
      setLast24HoursData(buildLiveHistoryData(snapshot.history));
      setTelemetryError(null);
      setHistoryError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live telemetry unavailable";
      setTelemetryError(message);
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
    const interval = window.setInterval(loadTelemetry, LIVE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadTelemetry]);

  useEffect(() => {
    async function loadMetadata() {
      setMetadataLoading(true);
      try {
        const [summary, statsResult, eventsResult] = await Promise.allSettled([
          fetchDocumentsSummary(),
          fetchEventStats(),
          fetchEvents({ limit: 5, acknowledged: false }),
        ]);

        if (summary.status === "fulfilled") {
          setDocumentsSummary(summary.value);
        }
        if (statsResult.status === "fulfilled") {
          setEventStats(statsResult.value);
        }
        if (eventsResult.status === "fulfilled") {
          setActiveAlarms(
            eventsResult.value.map((event) => ({
              id: event.id,
              timestamp: event.timestamp,
              equipment: event.source,
              description: event.description,
              justification: buildJustification(event.context_data),
              severity: mapSeverity(event.severity),
              status: event.acknowledged ? "Acquitté" : "En cours",
            })),
          );
        }
        const firstError = [summary, statsResult, eventsResult].find(
          (result) => result.status === "rejected",
        );
        if (firstError?.status === "rejected") {
          setMetadataError(
            firstError.reason instanceof Error ? firstError.reason.message : "API metadata unavailable",
          );
        } else {
          setMetadataError(null);
        }
      } catch (error) {
        setMetadataError(error instanceof Error ? error.message : "API metadata unavailable");
      } finally {
        setMetadataLoading(false);
      }
    }

    loadMetadata();
  }, [buildJustification]);

  const sensors = useMemo(
    () => ({
      temperature: getReading(latestReadings, SENSOR_IDS.temperature),
      humidity: getReading(latestReadings, SENSOR_IDS.humidity),
      current: getReading(latestReadings, SENSOR_IDS.current),
      power: getReading(latestReadings, SENSOR_IDS.power),
      vibration: getReading(latestReadings, SENSOR_IDS.vibration),
      voltage: getReading(latestReadings, SENSOR_IDS.voltage),
    }),
    [latestReadings],
  );
  const powerUnit = sensors.power?.unit || "W";
  const last24HoursSeries = useMemo(
    () => [
      {
        key: "temperature",
        label: t.temperature,
        unit: sensors.temperature?.unit || t.celsius,
        color: "var(--chart-1)",
        yAxisId: "environment",
      },
      {
        key: "humidity",
        label: t.humidity,
        unit: sensors.humidity?.unit || "%",
        color: "var(--chart-2)",
        yAxisId: "environment",
      },
      {
        key: "vibration",
        label: t.vibration,
        unit: sensors.vibration?.unit || "g",
        color: "var(--chart-3)",
        yAxisId: "vibration",
      },
    ],
    [sensors.humidity?.unit, sensors.temperature?.unit, sensors.vibration?.unit, t],
  );

  const handleAcknowledge = async (eventId: string) => {
    await acknowledgeEvent(eventId);
    setActiveAlarms((prev) =>
      prev.map((alarm) =>
        alarm.id === eventId ? { ...alarm, status: "Acquitté" } : alarm,
      ),
    );
    setEventStats((prev) =>
      prev
        ? {
            ...prev,
            unacknowledged: Math.max(0, prev.unacknowledged - 1),
          }
        : prev,
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.dashboard}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {telemetryStats?.sensors_online ?? 0} sensors online / {telemetryStats?.total_readings ?? 0} readings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-energy-green text-energy-green-foreground">
            Live from ESP32
          </Badge>
          {eventStats && eventStats.unacknowledged > 0 && (
            <Badge variant="destructive" className="bg-alarm-red text-alarm-red-foreground">
              {eventStats.unacknowledged} alerts
            </Badge>
          )}
          {telemetryStats?.last_seen_ms ? (
            <Badge variant="secondary">
              Last seen {new Date(telemetryStats.last_seen_ms).toLocaleTimeString("fr-FR")}
            </Badge>
          ) : null}
        </div>
      </div>

      {(telemetryError || metadataError || historyError) && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {telemetryError ?? metadataError ?? historyError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t.enginePower}
          value={formatValue(sensors.power?.value, 2)}
          unit={powerUnit}
          status="good"
          subtitle={sensors.power ? sensors.power.sensor_id : "No reading"}
        />
        <KPICard
          label={t.temperature}
          value={formatValue(sensors.temperature?.value)}
          unit={sensors.temperature?.unit || t.celsius}
          status={getTemperatureStatus(sensors.temperature?.value)}
        />
        <KPICard
          label={t.humidity}
          value={formatValue(sensors.humidity?.value)}
          unit={sensors.humidity?.unit || "%"}
          status={getHumidityStatus(sensors.humidity?.value)}
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
          status="normal"
        />
        <KPICard
          label={t.vibration}
          value={formatValue(sensors.vibration?.value, 2)}
          unit={sensors.vibration?.unit || "g"}
          status={getVibrationStatus(sensors.vibration?.value)}
        />
        <KPICard
          label="Document Energy"
          value={formatValue(documentsSummary?.total_normalized_kwh, 0)}
          unit="kWh"
          status="normal"
        />
        <KPICard
          label="Document CO2"
          value={formatValue(documentsSummary?.total_co2_kg, 0)}
          unit="kg"
          status="normal"
        />
      </div>

      {/* Power Chart */}
      <PowerChart
        data={last24HoursData}
        series={last24HoursSeries}
        yAxes={[
          { id: "environment", orientation: "left", domain: [0, 100], tickDigits: 0 },
          {
            id: "vibration",
            orientation: "right",
            domain: [0, 2],
            tickDigits: 1,
            allowDataOverflow: true,
          },
        ]}
        loading={historyLoading}
        error={historyError}
      />

      {/* Active Alarms */}
      <ActiveAlarms
        alarms={activeAlarms}
        activeCount={eventStats?.unacknowledged ?? activeAlarms.length}
        loading={metadataLoading}
        error={metadataError}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  );
}
