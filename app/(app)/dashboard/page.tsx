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
  fetchTelemetryLatest,
  fetchTelemetryStats,
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

function getReading(readings: TelemetryReading[], sensorId: string) {
  return readings.find((reading) => reading.sensor_id === sensorId);
}

function formatValue(value: number | undefined, digits = 1) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : "--";
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
  const [powerChartData, setPowerChartData] = useState<PowerChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const loadTelemetry = useCallback(async () => {
    try {
      const [stats, latest] = await Promise.all([
        fetchTelemetryStats(),
        fetchTelemetryLatest(),
      ]);

      setTelemetryStats(stats);
      setLatestReadings(latest);
      setTelemetryError(null);

      const powerReading = getReading(latest, SENSOR_IDS.power);
      if (powerReading) {
        setPowerChartData((prev) => {
          const nextPoint: PowerChartPoint = {
            time: new Date(powerReading.timestamp_ms).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            puissanceMoteur: powerReading.value / 1000,
          };
          return [...prev.slice(-23), nextPoint];
        });
      }
    } catch (error) {
      setTelemetryError(error instanceof Error ? error.message : "Telemetry unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
    const interval = window.setInterval(loadTelemetry, 10_000);
    return () => window.clearInterval(interval);
  }, [loadTelemetry]);

  useEffect(() => {
    async function loadMetadata() {
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
      }
    }

    loadMetadata();
  }, []);

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

      {(telemetryError || metadataError) && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {telemetryError ?? metadataError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t.enginePower}
          value={formatValue(sensors.power ? sensors.power.value / 1000 : undefined, 2)}
          unit={t.kw}
          status="good"
          subtitle={sensors.power ? sensors.power.sensor_id : "No reading"}
        />
        <KPICard
          label={t.temperature}
          value={formatValue(sensors.temperature?.value)}
          unit={t.celsius}
          status={
            sensors.temperature?.value === undefined
              ? "normal"
              : sensors.temperature.value <= 30
              ? "good"
              : sensors.temperature.value <= 35
              ? "warning"
              : "critical"
          }
        />
        <KPICard
          label="Humidity"
          value={formatValue(sensors.humidity?.value)}
          unit="%"
          status="normal"
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
          label="Vibration"
          value={formatValue(sensors.vibration?.value, 2)}
          unit={sensors.vibration?.unit || ""}
          status={sensors.vibration?.value && sensors.vibration.value > 2 ? "warning" : "good"}
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
        data={powerChartData}
        loading={loading}
        error={telemetryError}
      />

      {/* Active Alarms */}
      <ActiveAlarms
        alarms={activeAlarms}
        activeCount={eventStats?.unacknowledged ?? activeAlarms.length}
        loading={loading}
        error={metadataError}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  );
}
