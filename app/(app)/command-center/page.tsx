"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, ArrowDownUp, GaugeCircle, RadioTower } from "lucide-react";
import { ActiveAlarms, type ActiveAlarmItem } from "@/components/active-alarms";
import { KPICard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/language-context";

const powerSplitData = Array.from({ length: 24 }, (_, index) => {
  const hour = index.toString().padStart(2, "0");
  const businessLoad = index >= 7 && index <= 20 ? 1 : 0.72;
  const trigeneration = Math.round((980 + Math.sin(index / 3) * 120) * businessLoad);
  const steg = Math.round((310 + Math.cos(index / 4) * 90) * businessLoad);

  return {
    time: `${hour}:00`,
    trigeneration,
    steg,
    total: trigeneration + steg,
  };
});

const sankeyData = {
  nodes: [
    { name: "Gas" },
    { name: "Trigeneration" },
    { name: "Electricity" },
    { name: "Heat recovery" },
    { name: "Absorption cold" },
    { name: "Losses" },
    { name: "Grid import" },
    { name: "Site demand" },
  ],
  links: [
    { source: 0, target: 1, value: 2860 },
    { source: 1, target: 2, value: 1210 },
    { source: 1, target: 3, value: 760 },
    { source: 3, target: 4, value: 258 },
    { source: 1, target: 5, value: 590 },
    { source: 6, target: 7, value: 430 },
    { source: 2, target: 7, value: 1210 },
    { source: 4, target: 7, value: 258 },
  ],
};

const gaugeCluster = [
  { label: "Power factor", value: 96, display: "0.96", subtitle: "threshold 0.95" },
  { label: "Reactive energy", value: 42, display: "420", unit: "kVAr", subtitle: "current load" },
  { label: "Tri-gen load ratio", value: 78, display: "78", unit: "%", subtitle: "target band 70-90%" },
];

const initialAlarms: ActiveAlarmItem[] = [
  {
    id: "cmd-1",
    timestamp: "2026-05-03T08:15:00.000Z",
    equipment: "Trigeneration",
    description: "Electrical output below 1200 kW target",
    severity: "Moyen",
    status: "En cours",
  },
  {
    id: "cmd-2",
    timestamp: "2026-05-03T07:42:00.000Z",
    equipment: "Chiller fleet",
    description: "Zone C return temperature above 12 C target",
    severity: "Info",
    status: "En cours",
  },
  {
    id: "cmd-3",
    timestamp: "2026-05-03T06:58:00.000Z",
    equipment: "Power quality",
    description: "Power factor close to correction threshold",
    severity: "Moyen",
    status: "En cours",
  },
];

function formatNumber(value: number, digits = 0) {
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

function tooltipStyle() {
  return {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    fontSize: "12px",
  };
}

function GaugeTile({
  label,
  value,
  display,
  unit,
  subtitle,
}: {
  label: string;
  value: number;
  display: string;
  unit?: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-4">
      <div
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--primary) ${Math.min(100, Math.max(0, value)) * 3.6}deg, var(--muted) 0deg)`,
        }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-card">
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{display}</div>
            {unit ? <div className="text-[10px] text-muted-foreground">{unit}</div> : null}
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const { t } = useLanguage();
  const [alarms, setAlarms] = useState(initialAlarms);
  const latestPowerSplit = powerSplitData[powerSplitData.length - 1];

  const handleAcknowledge = (alarmId: string) => {
    setAlarms((current) =>
      current.map((alarm) =>
        alarm.id === alarmId ? { ...alarm, status: "Acquitté" } : alarm,
      ),
    );
  };

  const activeCount = alarms.filter((alarm) => alarm.status === "En cours").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.commandCenter}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plant-level overview for electricity, gas, CO2, trigeneration, and alerts.
          </p>
        </div>
        <Badge className="gap-2 bg-energy-green text-energy-green-foreground">
          <RadioTower className="h-3.5 w-3.5" />
          IoT streaming
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KPICard label="Total power draw" value={formatNumber(latestPowerSplit.total)} unit="kW" status="normal" subtitle="-3.8% vs yesterday" />
        <KPICard label="Gas consumption today" value="3,220" unit="Nm3" status="normal" subtitle="29,246 kWh thermal" />
        <KPICard label="CO2 today" value="6,180" unit="kg" status="good" subtitle="below daily average" />
        <KPICard label="Active anomalies" value={activeCount} status={activeCount > 0 ? "critical" : "good"} subtitle="with acknowledge flow" />
        <KPICard label="Trigeneration status" value="ONLINE" status="good" subtitle="1,120 kW output" />
        <KPICard label="Grid import/export" value={formatNumber(latestPowerSplit.steg)} unit="kW" status="normal" subtitle="positive = buying" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-primary" />
              Real-time power split, last 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={powerSplitData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => `${formatNumber(value)} kW`} />
                  <Area type="monotone" dataKey="trigeneration" name="Trigeneration" stackId="power" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.42} />
                  <Area type="monotone" dataKey="steg" name="STEG" stackId="power" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.28} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ArrowDownUp className="h-5 w-5 text-primary" />
              Energy flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={sankeyData}
                  nodePadding={22}
                  nodeWidth={14}
                  link={{ stroke: "var(--chart-1)", strokeOpacity: 0.35 }}
                >
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => `${formatNumber(value)} kW`} />
                </Sankey>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <GaugeCircle className="h-5 w-5 text-primary" />
            Gauge cluster
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {gaugeCluster.map((gauge) => (
              <GaugeTile key={gauge.label} {...gauge} />
            ))}
          </div>
        </CardContent>
      </Card>

      <ActiveAlarms
        alarms={alarms}
        activeCount={activeCount}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  );
}
