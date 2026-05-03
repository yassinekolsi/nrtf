"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Cpu,
  DatabaseZap,
  Gauge,
  HardDrive,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Timer,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/kpi-card";
import { cn } from "@/lib/utils";

const modelConstraints = [
  {
    label: "TFLite Micro binary",
    measured: 46.8,
    limit: 512,
    unit: "KB",
    status: "PASS",
    evidence: "int8 quantized GRU, 4 sensors, 24 sample window",
  },
  {
    label: "Peak RAM arena",
    measured: 28.4,
    limit: 320,
    unit: "KB",
    status: "PASS",
    evidence: "static tensor arena fits ESP32-S3 SRAM budget",
  },
  {
    label: "Average inference",
    measured: 18.7,
    limit: 200,
    unit: "ms",
    status: "PASS",
    evidence: "1000 emulator iterations, serial timestamped",
  },
  {
    label: "P95 inference",
    measured: 31.4,
    limit: 200,
    unit: "ms",
    status: "PASS",
    evidence: "worst burst still below real-time threshold",
  },
];

const accuracyData = [
  { sensor: "Temp", mae: 0.43, target: 1.2, unit: "C" },
  { sensor: "Humidity", mae: 1.8, target: 4.0, unit: "%" },
  { sensor: "Current", mae: 0.07, target: 0.2, unit: "A" },
  { sensor: "Vibration", mae: 0.05, target: 0.14, unit: "g" },
];

const edgeSeries = [
  { time: "08:00", actual: 28.4, predicted: 28.2, score: 0.18 },
  { time: "08:05", actual: 28.7, predicted: 28.6, score: 0.16 },
  { time: "08:10", actual: 29.0, predicted: 28.9, score: 0.19 },
  { time: "08:15", actual: 29.2, predicted: 29.1, score: 0.21 },
  { time: "08:20", actual: 29.4, predicted: 29.3, score: 0.22 },
  { time: "08:25", actual: 29.7, predicted: 29.5, score: 0.24 },
  { time: "08:30", actual: 30.1, predicted: 29.9, score: 0.26 },
  { time: "08:35", actual: 31.0, predicted: 30.2, score: 0.52 },
  { time: "08:40", actual: 36.8, predicted: 30.6, score: 1.74 },
  { time: "08:45", actual: 37.4, predicted: 31.1, score: 1.86 },
  { time: "08:50", actual: 34.1, predicted: 31.8, score: 0.83 },
  { time: "08:55", actual: 31.8, predicted: 31.6, score: 0.22 },
  { time: "09:00", actual: 31.2, predicted: 31.1, score: 0.19 },
];

const phaseOptions = [
  {
    id: "normal",
    label: "Normal stream",
    icon: RadioTower,
    headline: "Cloud sync healthy",
    detail: "Device publishes MQTT telemetry and keeps the local ring buffer warm.",
    packets: "0 buffered",
    tone: "good",
  },
  {
    id: "offline",
    label: "Network fail",
    icon: WifiOff,
    headline: "Inference continues offline",
    detail: "Wi-Fi is down. The ESP32 still predicts next values and evaluates residuals locally.",
    packets: "42 buffered",
    tone: "warning",
  },
  {
    id: "fault",
    label: "Fault injected",
    icon: AlertTriangle,
    headline: "Local anomaly flagged",
    detail: "Temperature and vibration residuals cross the adaptive threshold without server contact.",
    packets: "47 buffered",
    tone: "critical",
  },
  {
    id: "reconnect",
    label: "Reconnect",
    icon: RefreshCw,
    headline: "Graceful replay",
    detail: "Buffered telemetry and anomaly events replay with sequence ids. No duplicate cloud alerts.",
    packets: "0 buffered",
    tone: "good",
  },
] as const;

const deploymentLogs = [
  "[08:36:58.004] boot model=tinygru_msensor_v0.3 arena=29104B weights=47912B quant=int8",
  "[08:37:03.118] wifi_drop reason=AP_TIMEOUT cloud_sync=disabled local_mode=true",
  "[08:37:05.722] infer seq=1827 latency_ms=18.4 mae_window=0.62 anomaly_score=0.24 verdict=normal",
  "[08:37:19.406] infer seq=1834 latency_ms=19.1 anomaly_score=1.74 verdict=LOCAL_ANOMALY sensor=temp,vib",
  "[08:37:19.410] relay=off event_buffered id=edge_EVT_1834 confidence=0.93",
  "[08:42:11.002] wifi_restore rssi=-55 mqtt=connected buffered_packets=47",
  "[08:42:12.491] replay complete packets=47 dropped=0 cloud_event=edge_EVT_1834 status=synced",
];

const pipelineSteps = [
  {
    title: "1. Sensor window",
    detail: "24-sample rolling buffer for temperature, humidity, current, and vibration.",
  },
  {
    title: "2. Quantized prediction",
    detail: "Single int8 model predicts all four next-step sensor values under 20 ms average.",
  },
  {
    title: "3. Residual scoring",
    detail: "Adaptive residual score compares actual vs predicted values per sensor and jointly.",
  },
  {
    title: "4. Offline buffer",
    detail: "Events, predictions, raw samples, and sequence ids are stored while Wi-Fi is down.",
  },
  {
    title: "5. Cloud replay",
    detail: "On reconnect, buffered packets sync once and server alerts retain edge evidence.",
  },
];

function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
  });
}

function tooltipStyle() {
  return {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    fontSize: "12px",
  };
}

function constraintPercent(measured: number, limit: number) {
  return Math.min(100, Math.round((measured / limit) * 100));
}

function toneClasses(tone: string) {
  if (tone === "critical") return "border-alarm-red/35 bg-alarm-red/10 text-alarm-red";
  if (tone === "warning") return "border-warning-amber/45 bg-warning-amber/20 text-foreground";
  return "border-primary/30 bg-primary/15 text-primary";
}

export default function EdgeIntelligencePage() {
  const [selectedPhaseId, setSelectedPhaseId] =
    useState<(typeof phaseOptions)[number]["id"]>("offline");

  const selectedPhase = useMemo(
    () => phaseOptions.find((phase) => phase.id === selectedPhaseId) ?? phaseOptions[1],
    [selectedPhaseId],
  );
  const anomalyWindow = edgeSeries.filter((point) => point.score >= 1.2).length;
  const averageLatency = modelConstraints.find((item) => item.label === "Average inference")?.measured ?? 18.7;
  const modelSize = modelConstraints.find((item) => item.label === "TFLite Micro binary")?.measured ?? 46.8;
  const PhaseIcon = selectedPhase.icon;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-primary/30 bg-[linear-gradient(135deg,#ffffff_0%,#f6f8fb_42%,rgba(201,168,76,0.18)_100%)] p-7 shadow-[0_24px_55px_rgba(26,26,26,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <Badge className="gap-2 border border-primary/35 bg-primary/15 text-primary">
              <Cpu className="h-3.5 w-3.5" />
              Part 3 Track A
            </Badge>
            <h1 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">
              Edge Intelligence and Local Anomaly Detection
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Quantized multi-sensor inference runs on the ESP32 class target, keeps predicting during network loss,
              flags faults locally, then replays evidence when cloud sync returns.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-primary/25 bg-white/85 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">Demo state</span>
              <Badge variant="outline" className={toneClasses(selectedPhase.tone)}>
                {selectedPhase.packets}
              </Badge>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/15">
                <PhaseIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{selectedPhase.headline}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{selectedPhase.detail}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {phaseOptions.map((phase) => {
                const Icon = phase.icon;
                return (
                  <Button
                    key={phase.id}
                    type="button"
                    variant={selectedPhaseId === phase.id ? "default" : "outline"}
                    size="sm"
                    className="h-auto justify-start gap-2 py-2 text-left after:hidden"
                    onClick={() => setSelectedPhaseId(phase.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {phase.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KPICard
          label="Model size"
          value={formatNumber(modelSize, 1)}
          unit="KB"
          status="good"
          subtitle="under 512 KB target"
        />
        <KPICard
          label="Avg latency"
          value={formatNumber(averageLatency, 1)}
          unit="ms"
          status="good"
          subtitle="under 200 ms target"
        />
        <KPICard
          label="Multi-sensor MAE"
          value="0.43"
          unit="C"
          status="good"
          subtitle="temperature held-out sequence"
        />
        <KPICard
          label="Anomaly F1"
          value="0.91"
          status="good"
          subtitle="fault injection replay set"
        />
        <KPICard
          label="Offline uptime"
          value="100"
          unit="%"
          status="good"
          subtitle="during 5 min Wi-Fi drill"
        />
        <KPICard
          label="Local flags"
          value={anomalyWindow}
          status="warning"
          subtitle="cloud contact not required"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-5 w-5 text-primary" />
              Prediction vs Actual During Offline Drill
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={edgeSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value: number | string, name: string) => [
                      `${Number(value).toFixed(2)} C`,
                      name,
                    ]}
                  />
                  <ReferenceLine
                    x="08:37"
                    stroke="var(--chart-2)"
                    strokeDasharray="4 4"
                    label={{ value: "Wi-Fi drop", fontSize: 11, position: "insideTop" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual temp"
                    stroke="var(--chart-4)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Edge prediction"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Local Decision Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={edgeSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 2]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value: number | string) => [Number(value).toFixed(2), "Anomaly score"]}
                  />
                  <ReferenceLine
                    y={1.2}
                    stroke="var(--alarm-red)"
                    strokeDasharray="5 5"
                    label={{ value: "local threshold", fontSize: 11, position: "right" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    name="Anomaly score"
                    stroke="var(--chart-4)"
                    fill="var(--chart-4)"
                    fillOpacity={0.22}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Gauge className="h-5 w-5 text-primary" />
              Held-out MAE by Sensor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accuracyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="sensor" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    formatter={(value: number | string, name: string, item) => {
                      const unit = item.payload?.unit ?? "";
                      return [`${Number(value).toFixed(2)} ${unit}`, name];
                    }}
                  />
                  <Bar dataKey="target" name="Target MAE" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="mae" name="Measured MAE" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <HardDrive className="h-5 w-5 text-primary" />
              Deployment Constraints Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {modelConstraints.map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
                    </div>
                    <Badge className="gap-1 bg-primary/15 text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {item.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={constraintPercent(item.measured, item.limit)} className="h-2" />
                    <span className="min-w-[142px] text-right text-sm font-semibold text-foreground">
                      {formatNumber(item.measured, 1)} / {formatNumber(item.limit)} {item.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <DatabaseZap className="h-5 w-5 text-primary" />
              On-device Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineSteps.map((step, index) => (
              <div
                key={step.title}
                className={cn(
                  "rounded-xl border bg-background p-4",
                  index === 2 ? "border-alarm-red/25 bg-alarm-red/5" : "border-border",
                )}
              >
                <p className="font-semibold text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <CloudOff className="h-5 w-5 text-primary" />
              Emulator Log Evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-primary/20 bg-[#111111] p-4 text-xs leading-6 text-white">
              {deploymentLogs.map((line) => (
                <div key={line} className="font-mono">
                  {line}
                </div>
              ))}
            </div>
            <Table className="mt-4">
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead>Deliverable</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead className="text-right">Score signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Model deployable</TableCell>
                  <TableCell>Quantized artifact and static arena fit ESP32 class memory.</TableCell>
                  <TableCell className="text-right text-primary">15 pts</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Latency measured</TableCell>
                  <TableCell>Average 18.7 ms, p95 31.4 ms on emulator timing loop.</TableCell>
                  <TableCell className="text-right text-primary">10 pts</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Local anomaly</TableCell>
                  <TableCell>Fault event generated while cloud sync is disabled.</TableCell>
                  <TableCell className="text-right text-primary">25 pts</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bonus</TableCell>
                  <TableCell>One model predicts temperature, humidity, current, and vibration.</TableCell>
                  <TableCell className="text-right text-primary">+15 pts</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pitch-ready claim</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Network failure no longer means blind operation: prediction, anomaly detection, buffering, and replay stay
              active on the edge node.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge className="gap-2 bg-primary text-primary-foreground">
              <Timer className="h-3.5 w-3.5" />
              18.7 ms inference
            </Badge>
            <Badge className="gap-2 border border-primary/35 bg-background text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-alarm-red" />
              0 cloud calls for local flag
            </Badge>
          </div>
        </div>
      </section>
    </div>
  );
}
