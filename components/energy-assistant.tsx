"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Database,
  Flame,
  Leaf,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchDocumentsCo2Monthly,
  fetchEvents,
  fetchEventStats,
  fetchScadaRecords,
  fetchScadaSummary,
  fetchTelemetryLiveSnapshot,
  type DocumentsCo2MonthlyItem,
  type EventRecord,
  type ScadaRecord,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SkillTone = "normal" | "good" | "warning" | "critical";

interface AssistantMetric {
  label: string;
  value: string;
  tone?: SkillTone;
}

interface AssistantChartDatum {
  name: string;
  value: number;
  tone?: SkillTone;
}

interface AssistantChart {
  type: "bar" | "pie";
  title: string;
  unit?: string;
  digits?: number;
  data: AssistantChartDatum[];
}

interface AssistantMessage {
  id: string;
  role: "assistant" | "user";
  title: string;
  body: string;
  metrics?: AssistantMetric[];
  charts?: AssistantChart[];
  lines?: string[];
  footnote?: string;
  createdAt?: Date;
}

type SkillResult = Omit<AssistantMessage, "id" | "role" | "createdAt">;

interface SkillDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  run: () => Promise<SkillResult>;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeMessage(
  message: Omit<AssistantMessage, "id" | "createdAt">,
): AssistantMessage {
  return {
    ...message,
    id: makeId(),
    createdAt: new Date(),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The assistant skill could not run.";
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(value);
}

const chartColors = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-3)",
];

function chartColor(tone: SkillTone | undefined, index: number) {
  if (tone === "critical") return "var(--alarm-red)";
  if (tone === "warning") return "var(--warning-amber)";
  if (tone === "good") return "var(--chart-1)";
  return chartColors[index % chartColors.length];
}

function chartTooltipStyle() {
  return {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    fontSize: "12px",
  };
}

function formatChartValue(value: number | string, chart: AssistantChart) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${formatNumber(numeric, chart.digits ?? 1)}${chart.unit ? ` ${chart.unit}` : ""}`;
}

function formatDateTime(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "No timestamp";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);

  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parseBillingMonth(value: string) {
  const [monthPart, yearPart] = value.split("/");
  const month = Number(monthPart);
  const year = Number(yearPart);

  if (!Number.isFinite(month) || !Number.isFinite(year)) return 0;
  return Date.UTC(year, month - 1, 1);
}

function formatBillingMonth(value: string) {
  const timestamp = parseBillingMonth(value);
  if (!timestamp) return value;

  return new Date(timestamp).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
  });
}

function sortMonthlyItems(items: DocumentsCo2MonthlyItem[]) {
  return [...items].sort(
    (first, second) =>
      parseBillingMonth(first.billing_month) - parseBillingMonth(second.billing_month),
  );
}

function totalEnergyKwh(item: DocumentsCo2MonthlyItem) {
  return item.gas_kwh + item.grid_kwh + item.scada_gas_kwh;
}

function totalCo2Kg(item: DocumentsCo2MonthlyItem) {
  return item.co2_total_kg + item.scada_co2_gas_kg;
}

function summarizeSources(events: EventRecord[]) {
  const counts = new Map<string, number>();
  events.forEach((event) => {
    counts.set(event.source, (counts.get(event.source) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([source, count]) => `${source}: ${count}`);
}

function isCritical(event: EventRecord) {
  return event.severity.toLowerCase().includes("crit");
}

function numberMetric(record: ScadaRecord | undefined, key: string) {
  const value = record?.raw_metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function runAnomalySkill(): Promise<SkillResult> {
  const [stats, activeEvents, liveSnapshot] = await Promise.all([
    fetchEventStats(),
    fetchEvents({ limit: 8, acknowledged: false }),
    fetchTelemetryLiveSnapshot(),
  ]);

  const criticalEvents = activeEvents.filter(isCritical);
  const sourceLines = summarizeSources(activeEvents);
  const latestLines = activeEvents.slice(0, 4).map((event) => {
    const stamp = formatDateTime(event.timestamp);
    return `${event.source} - ${event.description} (${event.severity}, ${stamp})`;
  });

  return {
    title: "Anomaly Detection",
    body:
      activeEvents.length > 0
        ? "I found open anomalies that need operator review. Start with critical items, then check repeated sources."
        : "No unacknowledged anomalies came back from the API. Historical events still remain in the log.",
    metrics: [
      {
        label: "Open",
        value: formatNumber(stats.unacknowledged),
        tone: stats.unacknowledged > 0 ? "warning" : "good",
      },
      {
        label: "Critical",
        value: formatNumber(criticalEvents.length || stats.critique_count),
        tone: criticalEvents.length > 0 || stats.critique_count > 0 ? "critical" : "good",
      },
      {
        label: "Live Sensor Flags",
        value: formatNumber(liveSnapshot.stats.anomaly_count),
        tone: liveSnapshot.stats.anomaly_count > 0 ? "warning" : "good",
      },
    ],
    charts: [
      {
        type: "pie",
        title: "Open anomaly split",
        unit: "events",
        digits: 0,
        data: ([
          { name: "Critical", value: criticalEvents.length || stats.critique_count, tone: "critical" },
          {
            name: "Medium / Info",
            value: Math.max(0, stats.unacknowledged - (criticalEvents.length || stats.critique_count)),
            tone: stats.unacknowledged > 0 ? "warning" : "good",
          },
          { name: "Live flags", value: liveSnapshot.stats.anomaly_count, tone: "normal" },
        ] satisfies AssistantChartDatum[]).filter((item) => item.value > 0),
      },
    ],
    lines: latestLines.length ? latestLines : sourceLines,
    footnote: `Sensors online: ${formatNumber(liveSnapshot.stats.sensors_online)}. Last seen: ${formatDateTime(liveSnapshot.stats.last_seen_ms)}.`,
  };
}

async function runThreeMonthEnergySkill(): Promise<SkillResult> {
  const monthly = sortMonthlyItems((await fetchDocumentsCo2Monthly()).items).slice(-3);

  if (!monthly.length) {
    return {
      title: "Energy Last 3 Months",
      body: "I could not find accepted monthly energy records yet. Upload billing or SCADA data, then run this again.",
      metrics: [{ label: "Months Found", value: "0", tone: "warning" as const }],
    };
  }

  const totalKwh = monthly.reduce((sum, item) => sum + totalEnergyKwh(item), 0);
  const gridKwh = monthly.reduce((sum, item) => sum + item.grid_kwh, 0);
  const gasKwh = monthly.reduce((sum, item) => sum + item.gas_kwh + item.scada_gas_kwh, 0);

  return {
    title: "Energy Last 3 Months",
    body: "I pulled the latest 3 billing months in the database and combined grid, gas, and SCADA trigeneration energy.",
    metrics: [
      { label: "Total", value: `${formatNumber(totalKwh / 1000, 1)} MWh`, tone: "normal" },
      { label: "Grid", value: `${formatNumber(gridKwh / 1000, 1)} MWh`, tone: "normal" },
      { label: "Gas + SCADA", value: `${formatNumber(gasKwh / 1000, 1)} MWh`, tone: "normal" },
    ],
    charts: [
      {
        type: "bar",
        title: "Energy by billing month",
        unit: "MWh",
        digits: 1,
        data: monthly.map((item) => ({
          name: formatBillingMonth(item.billing_month),
          value: totalEnergyKwh(item) / 1000,
          tone: "normal",
        })),
      },
      {
        type: "pie",
        title: "Grid vs gas split",
        unit: "MWh",
        digits: 1,
        data: [
          { name: "Grid", value: gridKwh / 1000, tone: "normal" },
          { name: "Gas + SCADA", value: gasKwh / 1000, tone: "good" },
        ],
      },
    ],
    lines: monthly.map(
      (item) =>
        `${formatBillingMonth(item.billing_month)}: ${formatNumber(totalEnergyKwh(item) / 1000, 1)} MWh, ${formatNumber(totalCo2Kg(item) / 1000, 2)} tCO2`,
    ),
    footnote: "This uses accepted documents plus monthly SCADA gas energy when available.",
  };
}

async function runScadaSkill(): Promise<SkillResult> {
  const [summary, records] = await Promise.all([
    fetchScadaSummary(),
    fetchScadaRecords({ skip: 0, limit: 5 }),
  ]);

  const latest = records[0];
  const powerFactor = numberMetric(latest, "power_factor");
  const electricalEfficiency = numberMetric(latest, "efficiency_electrical_pct");

  return {
    title: "Tri-generation SCADA Health",
    body:
      summary.record_count > 0
        ? "I checked the SCADA ledger summary and the latest imported readings."
        : "No SCADA readings are stored yet. Import a Tri-generation SCADA file to unlock this skill.",
    metrics: [
      { label: "Records", value: formatNumber(summary.record_count), tone: summary.record_count ? "good" : "warning" },
      { label: "Avg Power", value: `${formatNumber(summary.avg_power_kw, 1)} kW`, tone: "normal" },
      { label: "Gas CO2", value: `${formatNumber(summary.total_co2_kg / 1000, 2)} t`, tone: "normal" },
    ],
    charts: latest
      ? [
          {
            type: "bar",
            title: "Latest SCADA indicators",
            digits: 1,
            data: [
              { name: "Power kW", value: latest.power_gross_kw, tone: "good" },
              { name: "Gas Nm3/h", value: latest.gas_flow_nm3h, tone: "normal" },
              ...(powerFactor === null
                ? []
                : [
                    {
                      name: "PF x100",
                      value: powerFactor * 100,
                      tone: powerFactor < 0.9 ? ("warning" as const) : ("good" as const),
                    },
                  ]),
            ],
          },
        ]
      : undefined,
    lines: latest
      ? [
          `Latest reading: ${formatDateTime(latest.timestamp)}`,
          `Power: ${formatNumber(latest.power_gross_kw, 1)} kW, gas flow: ${formatNumber(latest.gas_flow_nm3h, 1)} Nm3/h`,
          powerFactor === null ? "Power factor: not mapped in latest row" : `Power factor: ${formatNumber(powerFactor, 2)}`,
          electricalEfficiency === null
            ? "Electrical efficiency: not mapped in latest row"
            : `Electrical efficiency: ${formatNumber(electricalEfficiency, 1)}%`,
        ]
      : undefined,
    footnote: "Existing import logic already creates anomaly events for low power factor, low efficiency, and gas/electric ratio drift.",
  };
}

async function runCo2Skill(): Promise<SkillResult> {
  const monthly = sortMonthlyItems((await fetchDocumentsCo2Monthly()).items);
  const latest = monthly.slice(-6);
  const totalKg = latest.reduce((sum, item) => sum + totalCo2Kg(item), 0);
  const scadaKg = latest.reduce((sum, item) => sum + item.scada_co2_gas_kg, 0);
  const gridKg = latest.reduce((sum, item) => sum + item.co2_grid_kg, 0);
  const gasKg = latest.reduce((sum, item) => sum + item.co2_gas_kg, 0);

  return {
    title: "CO2 Summary",
    body: latest.length
      ? "I summarized the latest monthly emissions split between grid, gas invoices, and SCADA gas energy."
      : "There is no monthly emissions data yet.",
    metrics: [
      { label: "Latest Window", value: `${formatNumber(totalKg / 1000, 2)} tCO2`, tone: "normal" },
      { label: "Grid", value: `${formatNumber(gridKg / 1000, 2)} t`, tone: "normal" },
      { label: "Gas", value: `${formatNumber((gasKg + scadaKg) / 1000, 2)} t`, tone: "normal" },
    ],
    charts: latest.length
      ? [
          {
            type: "pie",
            title: "Latest CO2 split",
            unit: "tCO2",
            digits: 2,
            data: ([
              { name: "Grid", value: gridKg / 1000, tone: "normal" },
              { name: "Gas invoices", value: gasKg / 1000, tone: "warning" },
              { name: "SCADA gas", value: scadaKg / 1000, tone: "good" },
            ] satisfies AssistantChartDatum[]).filter((item) => item.value > 0),
          },
        ]
      : undefined,
    lines: latest.slice(-3).map(
      (item) =>
        `${formatBillingMonth(item.billing_month)}: grid ${formatNumber(item.co2_grid_kg / 1000, 2)} t, gas ${formatNumber((item.co2_gas_kg + item.scada_co2_gas_kg) / 1000, 2)} t`,
    ),
    footnote: "Gas factor: 0.202 kgCO2/kWh. Grid factor: 0.50 kgCO2/kWh.",
  };
}

async function runHeatRecoverySkill(): Promise<SkillResult> {
  const roiData = [
    { name: "Compressor", value: 10640, tone: "good" as const },
    { name: "Boiler", value: 11760, tone: "normal" as const },
    { name: "Chiller", value: 26880, tone: "warning" as const },
  ];
  const totalSavings = roiData.reduce((sum, item) => sum + item.value, 0);

  return {
    title: "Heat Recovery Priority",
    body: "I used the audit baseline and ranked the preset recovery scenarios by practical actionability and conservative DT savings.",
    metrics: [
      { label: "Fast ROI", value: "Compressor heat", tone: "good" },
      { label: "Money", value: `${formatNumber(totalSavings)} DT/yr`, tone: "good" },
      { label: "Largest Volume", value: "Chiller condenser", tone: "warning" },
    ],
    charts: [
      {
        type: "bar",
        title: "Annual savings by scenario",
        unit: "DT/yr",
        digits: 0,
        data: roiData,
      },
      {
        type: "pie",
        title: "Savings contribution",
        unit: "DT/yr",
        digits: 0,
        data: roiData,
      },
    ],
    lines: [
      "1. Compressor heat rejection: about 380 MWh/year recoverable, roughly 77 tCO2/year avoided, 1.5-2 year payback.",
      "2. Boiler Alpha economizer: about 600 MWh/year, roughly 121 tCO2/year avoided, medium installation complexity.",
      "3. Chiller condenser heat for ECS: about 4,800 MWh/year partial capture, highest integration complexity.",
    ],
    footnote: "This skill is intentionally deterministic for the current audit scenarios; connect it to live heat meters later for dynamic ROI.",
  };
}

const skillDefinitions: SkillDefinition[] = [
  {
    id: "detect-anomalies",
    label: "Detect anomalies",
    description: "Open events, critical sources, live sensor flags",
    icon: AlertTriangle,
    run: runAnomalySkill,
  },
  {
    id: "energy-three-months",
    label: "Energy last 3 months",
    description: "Grid, gas, SCADA energy totals",
    icon: Zap,
    run: runThreeMonthEnergySkill,
  },
  {
    id: "scada-health",
    label: "SCADA health",
    description: "Tri-generation records and latest reading",
    icon: Database,
    run: runScadaSkill,
  },
  {
    id: "co2-summary",
    label: "CO2 summary",
    description: "Latest monthly emissions split",
    icon: Leaf,
    run: runCo2Skill,
  },
  {
    id: "heat-recovery-roi",
    label: "Heat recovery ROI",
    description: "Preset audit recovery scenarios",
    icon: Flame,
    run: runHeatRecoverySkill,
  },
];

const openingMessage = makeMessage({
  role: "assistant",
  title: "Energy Agent Ready",
  body: "Pick a predefined skill and I will fetch the matching plant data.",
  metrics: [
    { label: "Mode", value: "Preset skills", tone: "good" },
    { label: "Source", value: "Live API", tone: "normal" },
  ],
});
openingMessage.id = "energy-agent-opening";
openingMessage.createdAt = undefined;

function MetricPill({ metric }: { metric: AssistantMetric }) {
  const toneClass = {
    normal: "border-primary/20 bg-background text-foreground",
    good: "border-primary/25 bg-primary/15 text-foreground",
    warning: "border-warning-amber/50 bg-warning-amber/20 text-foreground",
    critical: "border-alarm-red/35 bg-alarm-red/10 text-alarm-red",
  }[metric.tone ?? "normal"];

  return (
    <div className={cn("min-w-0 rounded-md border px-3 py-2", toneClass)}>
      <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {metric.label}
      </p>
      <p className="mt-1 truncate text-sm font-bold">{metric.value}</p>
    </div>
  );
}

function AssistantChartBlock({ chart }: { chart: AssistantChart }) {
  if (!chart.data.length) return null;

  return (
    <div className="rounded-xl border border-primary/15 bg-card p-3">
      <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
        {chart.title}
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="name"
                innerRadius={46}
                outerRadius={78}
                paddingAngle={3}
                labelLine={false}
              >
                {chart.data.map((item, index) => (
                  <Cell
                    key={`${chart.title}-${item.name}`}
                    fill={chartColor(item.tone, index)}
                  />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={chartTooltipStyle()}
                formatter={(value: number | string) => [formatChartValue(value, chart), chart.unit ?? "Value"]}
              />
            </PieChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <RechartsTooltip
                contentStyle={chartTooltipStyle()}
                formatter={(value: number | string) => [formatChartValue(value, chart), chart.unit ?? "Value"]}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chart.data.map((item, index) => (
                  <Cell
                    key={`${chart.title}-${item.name}`}
                    fill={chartColor(item.tone, index)}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {chart.data.map((item, index) => (
          <span
            key={`${chart.title}-legend-${item.name}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 text-[0.68rem] text-muted-foreground"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: chartColor(item.tone, index) }}
            />
            {item.name}: {formatChartValue(item.value, chart)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-xl border px-5 py-4 text-sm",
          isUser
            ? "max-w-[78%] border-primary/45 bg-primary text-primary-foreground"
            : "w-full border-primary/20 bg-background text-foreground",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.12em]">
            {message.title}
          </p>
          {message.createdAt ? (
            <span className="shrink-0 text-[0.68rem] opacity-65">
              {message.createdAt.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
        <p className="mt-2 leading-5">{message.body}</p>
        {message.metrics?.length ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {message.metrics.map((metric) => (
              <MetricPill key={`${message.id}-${metric.label}`} metric={metric} />
            ))}
          </div>
        ) : null}
        {message.charts?.some((chart) => chart.data.length) ? (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {message.charts.filter((chart) => chart.data.length).map((chart) => (
              <AssistantChartBlock key={`${message.id}-${chart.title}`} chart={chart} />
            ))}
          </div>
        ) : null}
        {message.lines?.length ? (
          <div className="mt-4 space-y-2.5">
            {message.lines.map((line) => (
              <p
                key={`${message.id}-${line}`}
                className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
              >
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {message.footnote ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {message.footnote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EnergyAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([openingMessage]);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [isOpen, messages, runningSkillId]);

  const runningSkill = useMemo(
    () => skillDefinitions.find((skill) => skill.id === runningSkillId),
    [runningSkillId],
  );

  const runSkill = async (skill: SkillDefinition) => {
    setIsOpen(true);
    setRunningSkillId(skill.id);
    setMessages((current) => [
      ...current,
      makeMessage({
        role: "user",
        title: "Run Skill",
        body: skill.label,
      }),
    ]);

    try {
      const result = await skill.run();
      setMessages((current) => [
        ...current,
        makeMessage({
          role: "assistant",
          ...result,
        }),
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        makeMessage({
          role: "assistant",
          title: "Skill Failed",
          body: getErrorMessage(error),
          metrics: [{ label: "Status", value: "API unavailable", tone: "critical" }],
        }),
      ]);
    } finally {
      setRunningSkillId(null);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <section
          aria-label="Energy assistant"
          className="mb-4 flex h-[min(780px,calc(100vh-7rem))] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-primary/35 bg-card shadow-[0_20px_80px_rgba(26,26,26,0.20)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-primary/20 bg-sidebar px-5 py-4 text-sidebar-foreground">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-sm font-bold uppercase tracking-[0.16em] text-primary">
                    Energy Agent
                  </h2>
                  <Badge className="border border-primary/30 bg-primary/15 text-primary">
                    Skills
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-sidebar-foreground/68">
                  One tap queries for operations, energy, CO2, and ROI.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-sidebar-foreground hover:text-primary"
              onClick={() => setIsOpen(false)}
              aria-label="Close energy assistant"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="border-b border-primary/15 bg-muted/30 px-4 py-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {skillDefinitions.map((skill) => {
                const Icon = skill.icon;
                const isRunning = runningSkillId === skill.id;

                return (
                  <Button
                    key={skill.id}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start rounded-lg border-primary/25 bg-background px-3 py-3 text-left normal-case tracking-normal after:hidden"
                    onClick={() => void runSkill(skill)}
                    disabled={runningSkillId !== null}
                  >
                    {isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Icon className="h-4 w-4 text-primary" />
                    )}
                      <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {skill.label}
                      </span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {skill.description}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div
            ref={logRef}
            className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(201,168,76,0.08),rgba(255,255,255,0)_34%)] px-5 py-5"
            aria-live="polite"
          >
            {messages.map((message) => (
              <AssistantBubble key={message.id} message={message} />
            ))}
            {runningSkill ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-background px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Running {runningSkill.label}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-primary/15 bg-background px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Preset skills only
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="after:hidden"
              onClick={() => setMessages([openingMessage])}
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-lg"
              className="h-14 w-14 border-primary bg-sidebar text-primary shadow-[0_14px_40px_rgba(26,26,26,0.25)] hover:bg-sidebar/95"
              onClick={() => setIsOpen((current) => !current)}
              aria-label="Open energy assistant"
            >
              {runningSkillId ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <MessageSquare className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Energy assistant
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
