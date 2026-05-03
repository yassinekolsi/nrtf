"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calculator,
  CircleDollarSign,
  Flame,
  Gauge,
  Leaf,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPICard } from "@/components/kpi-card";
import { useLanguage } from "@/lib/language-context";

const wasteHeatSources = [
  {
    source: "Trigeneration flue gas (residual losses ~20%)",
    label: "Trigeneration flue gas",
    temperature: "300–400",
    fluxDisplay: "~372",
    fluxKw: 372,
    availability: 22,
    annualDisplay: "~2,983",
    annualMwh: 2983,
  },
  {
    source: "Compressor heat rejection (~80% of 132 kW)",
    label: "Compressor heat",
    temperature: "40–60",
    fluxDisplay: "~106",
    fluxKw: 106,
    availability: 20,
    annualDisplay: "~775",
    annualMwh: 775,
  },
  {
    source: "Steam boiler Alpha flue gas (5–10% of 1240 kW)",
    label: "Boiler Alpha flue gas",
    temperature: "150–200",
    fluxDisplay: "~62–124",
    fluxKw: 93,
    availability: 18,
    annualDisplay: "~406–812",
    annualMwh: 609,
  },
  {
    source: "Steam boiler Gamma flue gas (5–10% of 600 kW)",
    label: "Boiler Gamma flue gas",
    temperature: "150–200",
    fluxDisplay: "~30–60",
    fluxKw: 45,
    availability: 18,
    annualDisplay: "~197–394",
    annualMwh: 296,
  },
  {
    source: "Steam blowdown (3–5% of boiler thermal output)",
    label: "Steam blowdown",
    temperature: "120",
    fluxDisplay: "~55–93",
    fluxKw: 74,
    availability: 18,
    annualDisplay: "~360–609",
    annualMwh: 485,
  },
  {
    source: "Condenser heat from electric chillers (2650 kW × 1/EER)",
    label: "Chiller condenser heat",
    temperature: "35–45",
    fluxDisplay: "~820",
    fluxKw: 820,
    availability: 20,
    annualDisplay: "~5,986",
    annualMwh: 5986,
  },
];

const prioritizationCriteria = [
  {
    criterion: "Recoverable energy potential",
    weight: "30%",
    description: "MWh/year available",
  },
  {
    criterion: "CO2 reduction potential",
    weight: "25%",
    description: "tCO2/year avoided",
  },
  {
    criterion: "Integration complexity (inverted)",
    weight: "20%",
    description: "Low = simpler to install",
  },
  {
    criterion: "Implementation cost (inverted)",
    weight: "15%",
    description: "Lower capex = higher score",
  },
  {
    criterion: "Strategic fit",
    weight: "10%",
    description: "Alignment with existing infrastructure",
  },
];

const scenarios = [
  {
    id: "A",
    title: "Compressor Heat Rejection",
    tag: "Highest ROI",
    source: "Air compressor (132 kW, 39% load → ~52 kW average rejected)",
    recoveryMethod: "Air-water heat exchanger on compressor exhaust",
    useCase: "Pre-heat boiler feed water or sanitary water",
    recoverable: "~380 MWh/year",
    co2Avoided: "~77 tCO2/year (replaces gas boiler)",
    capex: "12,000–18,000 DT",
    capexDefaultDt: 15000,
    payback: "1.5–2 years",
    complexity: "Low",
    recoverableKwhYear: 380000,
    defaultCaptureEfficiency: 1,
    accent: "border-energy-green/40",
  },
  {
    id: "B",
    title: "Steam Boiler Economizer",
    tag: "High Energy",
    source: "Boiler Alpha flue gas (exit ~180°C, target ~120°C)",
    recoveryMethod: "Finned-tube economizer on chimney",
    useCase: "Pre-heat boiler feed water (80°C → 95°C)",
    recoverable: "~600 MWh/year",
    co2Avoided: "~121 tCO2/year",
    capex: "35,000–50,000 DT",
    capexDefaultDt: 42500,
    payback: "3–4 years",
    complexity: "Medium",
    recoverableKwhYear: 600000,
    defaultCaptureEfficiency: 0.7,
    accent: "border-primary/40",
  },
  {
    id: "C",
    title: "Chiller Condenser Heat for ECS",
    tag: "Highest Volume",
    source: "6 electric chillers condensers (combined ~820 kW rejected at 40–45°C)",
    recoveryMethod: "Heat pump or direct plate exchanger to sanitary water circuit",
    useCase: "Pre-heat ECS across all 3 zones",
    recoverable: "~4,800 MWh/year (partial capture at 30%)",
    co2Avoided: "~289 tCO2/year",
    capex: "80,000–120,000 DT",
    capexDefaultDt: 100000,
    payback: "4–5 years",
    complexity: "High",
    recoverableKwhYear: 4800000,
    defaultCaptureEfficiency: 0.2,
    accent: "border-alarm-red/40",
  },
];

const DEFAULT_GAS_PRICE_DT_PER_KWH = 0.028;

const opportunityChartData = wasteHeatSources.map((item) => ({
  label: item.label,
  annualMwh: item.annualMwh,
  fluxKw: item.fluxKw,
  availability: item.availability,
}));

const radarData = [
  { criterion: "Energy", scenarioA: 6, scenarioB: 7, scenarioC: 10 },
  { criterion: "CO2", scenarioA: 6, scenarioB: 7, scenarioC: 9 },
  { criterion: "Ease", scenarioA: 9, scenarioB: 6, scenarioC: 3 },
  { criterion: "Capex", scenarioA: 8, scenarioB: 6, scenarioC: 4 },
  { criterion: "Strategic", scenarioA: 7, scenarioB: 8, scenarioC: 9 },
];

const roiCode = `def calculate_scenario_roi(
    recoverable_kwh_year: float,
    capture_efficiency: float,      # 0.0–1.0
    gas_price_dt_per_kwh: float,    # ~0.028 DT/kWh (BP2 tariff)
    capex_dt: float,
    co2_factor: float = 0.202,      # kgCO2/kWh gas avoided
) -> dict:
    captured_kwh = recoverable_kwh_year * capture_efficiency
    annual_saving_dt = captured_kwh * gas_price_dt_per_kwh
    co2_avoided_kg = captured_kwh * co2_factor
    simple_payback_years = capex_dt / annual_saving_dt
    return {
        "captured_kwh_year": captured_kwh,
        "annual_saving_dt": annual_saving_dt,
        "co2_avoided_tonne_year": co2_avoided_kg / 1000,
        "simple_payback_years": simple_payback_years,
        "npv_10y": annual_saving_dt * 8.53 - capex_dt,  # NPV at 5% discount, 10 years
    }`;

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR");
}

function formatDecimal(value: number, digits = 1) {
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

function calculateScenarioRoi({
  recoverableKwhYear,
  captureEfficiency,
  gasPriceDtPerKwh,
  capexDt,
  co2Factor = 0.202,
}: {
  recoverableKwhYear: number;
  captureEfficiency: number;
  gasPriceDtPerKwh: number;
  capexDt: number;
  co2Factor?: number;
}) {
  const capturedKwh = recoverableKwhYear * captureEfficiency;
  const annualSavingDt = capturedKwh * gasPriceDtPerKwh;
  const co2AvoidedKg = capturedKwh * co2Factor;
  const simplePaybackYears = annualSavingDt > 0 ? capexDt / annualSavingDt : 0;

  return {
    capturedKwhYear: capturedKwh,
    annualSavingDt,
    co2AvoidedTonneYear: co2AvoidedKg / 1000,
    simplePaybackYears,
    npv10y: annualSavingDt * 8.53 - capexDt,
  };
}

type OpportunityTooltipPayload = {
  label: string;
  annualMwh: number;
  fluxKw: number;
  availability: number;
};

function OpportunityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: OpportunityTooltipPayload }[];
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-sm">
      <p className="font-semibold text-foreground">{data.label}</p>
      <p className="mt-1 text-muted-foreground">
        Annual energy: {formatNumber(data.annualMwh)} MWh
      </p>
      <p className="text-muted-foreground">
        Estimated flux: {formatNumber(data.fluxKw)} kW
      </p>
      <p className="text-muted-foreground">Availability: {data.availability} h/day</p>
    </div>
  );
}

export default function RecoveryPage() {
  const { t } = useLanguage();
  const [selectedScenarioId, setSelectedScenarioId] = useState("A");
  const [captureEfficiencyPct, setCaptureEfficiencyPct] = useState(
    scenarios[0].defaultCaptureEfficiency * 100,
  );
  const [gasPriceMilliDt, setGasPriceMilliDt] = useState(28);
  const [capexDt, setCapexDt] = useState(scenarios[0].capexDefaultDt);
  const totalAnnualMwh = useMemo(
    () => Math.round(wasteHeatSources.reduce((sum, item) => sum + item.annualMwh, 0)),
    [],
  );
  const totalCo2Top3 = useMemo(() => 77 + 121 + 289, []);
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [selectedScenarioId],
  );
  const roi = useMemo(
    () =>
      calculateScenarioRoi({
        recoverableKwhYear: selectedScenario.recoverableKwhYear,
        captureEfficiency: captureEfficiencyPct / 100,
        gasPriceDtPerKwh: gasPriceMilliDt / 1000,
        capexDt,
      }),
    [capexDt, captureEfficiencyPct, gasPriceMilliDt, selectedScenario],
  );
  const defaultRoiRows = useMemo(
    () =>
      scenarios.map((scenario) => {
        const scenarioRoi = calculateScenarioRoi({
          recoverableKwhYear: scenario.recoverableKwhYear,
          captureEfficiency: scenario.defaultCaptureEfficiency,
          gasPriceDtPerKwh: DEFAULT_GAS_PRICE_DT_PER_KWH,
          capexDt: scenario.capexDefaultDt,
        });

        return {
          id: scenario.id,
          label: `Scenario ${scenario.id}`,
          title: scenario.title,
          annualSavingDt: Math.round(scenarioRoi.annualSavingDt),
          capturedMwh: Math.round(scenarioRoi.capturedKwhYear / 1000),
          co2Tonne: Number(scenarioRoi.co2AvoidedTonneYear.toFixed(1)),
          paybackYears: Number(scenarioRoi.simplePaybackYears.toFixed(1)),
          npv10y: Math.round(scenarioRoi.npv10y),
          capexDt: scenario.capexDefaultDt,
        };
      }),
    [],
  );
  const totalDefaultAnnualSavings = useMemo(
    () => defaultRoiRows.reduce((sum, row) => sum + row.annualSavingDt, 0),
    [defaultRoiRows],
  );
  const totalDefaultNpv10y = useMemo(
    () => defaultRoiRows.reduce((sum, row) => sum + row.npv10y, 0),
    [defaultRoiRows],
  );
  const totalDefaultCapturedMwh = useMemo(
    () => defaultRoiRows.reduce((sum, row) => sum + row.capturedMwh, 0),
    [defaultRoiRows],
  );
  const fastestDefaultPayback = useMemo(
    () => Math.min(...defaultRoiRows.map((row) => row.paybackYears)),
    [defaultRoiRows],
  );

  const selectScenario = (scenario: (typeof scenarios)[number]) => {
    setSelectedScenarioId(scenario.id);
    setCaptureEfficiencyPct(scenario.defaultCaptureEfficiency * 100);
    setCapexDt(scenario.capexDefaultDt);
  };

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-primary/30 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.35),transparent_45%),linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(245,245,245,0.7)_55%,rgba(201,168,76,0.12)_100%)] p-8 shadow-[0_25px_60px_rgba(17,17,17,0.08)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
        <div className="absolute right-8 top-8 hidden h-32 w-32 rounded-full border border-primary/40 bg-[radial-gradient(circle,rgba(201,168,76,0.25)_0%,transparent_70%)] lg:block" />
        <div className="absolute bottom-6 right-24 hidden h-12 w-40 rounded-full bg-primary/10 blur-2xl lg:block" />
        <div className="relative z-10 space-y-5">
          <Badge className="gap-2 bg-primary/15 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Audit + SCADA synthesis
          </Badge>
          <div>
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">
              {t.heatRecovery}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Prioritize waste heat recovery across trigeneration, boilers, compressors, and chillers with a
              quantified ROI model and execution-ready scenarios.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KPICard
              label="Total recoverable heat"
              value={`~${formatNumber(totalAnnualMwh)}`}
              unit="MWh/yr"
              status="good"
              subtitle="Across 6 audited sources"
            />
            <KPICard
              label="Top 3 CO2 reduction"
              value={`~${formatNumber(totalCo2Top3)}`}
              unit="tCO2/yr"
              status="normal"
              subtitle="Scenarios A, B, C"
            />
            <KPICard
              label="Best payback"
              value="1.5–2"
              unit="years"
              status="good"
              subtitle="Scenario A"
            />
            <KPICard
              label="Highest volume"
              value="~4,800"
              unit="MWh/yr"
              status="warning"
              subtitle="Scenario C"
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden border-primary/40 bg-[linear-gradient(135deg,rgba(201,168,76,0.18)_0%,rgba(255,255,255,0.96)_48%,rgba(26,26,26,0.04)_100%)] shadow-[0_24px_55px_rgba(17,17,17,0.08)]">
          <CardHeader className="border-b border-primary/20 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <CircleDollarSign className="h-6 w-6 text-primary" />
                Money on the Table
              </CardTitle>
              <Badge className="border border-primary/30 bg-white/75 text-primary">
                Conservative gas tariff: {formatDecimal(DEFAULT_GAS_PRICE_DT_PER_KWH, 3)} DT/kWh
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/25 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Annual savings</p>
                <p className="mt-2 text-3xl font-bold text-energy-green">
                  {formatNumber(totalDefaultAnnualSavings)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">DT/yr</span>
                </p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">10-year NPV</p>
                <p className="mt-2 text-3xl font-bold text-foreground">
                  {formatNumber(totalDefaultNpv10y)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">DT</span>
                </p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Captured energy</p>
                <p className="mt-2 text-3xl font-bold text-foreground">
                  {formatNumber(totalDefaultCapturedMwh)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">MWh/yr</span>
                </p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Fastest payback</p>
                <p className="mt-2 text-3xl font-bold text-energy-green">
                  {formatDecimal(fastestDefaultPayback, 1)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">years</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/25 bg-white/80 p-4">
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <div>
                  <p className="font-semibold text-foreground">1. Capture</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recoverable kWh x capture rate</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">2. Savings</p>
                  <p className="mt-1 text-xs text-muted-foreground">Captured kWh x avoided gas tariff</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">3. Payback</p>
                  <p className="mt-1 text-xs text-muted-foreground">Capex divided by annual savings</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">4. NPV</p>
                  <p className="mt-1 text-xs text-muted-foreground">10-year value at 5% discount</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" />
              ROI Ranking by Scenario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={defaultRoiRows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [
                      `${formatNumber(value)} DT`,
                      name === "annualSavingDt" ? "Annual saving" : "10-year NPV",
                    ]}
                  />
                  <Bar dataKey="annualSavingDt" name="Annual saving" radius={[6, 6, 0, 0]}>
                    {defaultRoiRows.map((row, index) => (
                      <Cell
                        key={row.id}
                        fill={index === 0 ? "var(--chart-1)" : index === 1 ? "var(--chart-2)" : "var(--chart-4)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {defaultRoiRows.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-xl border border-border bg-muted/25 p-3 text-sm md:grid-cols-[1fr_auto_auto_auto] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-foreground">{row.label}: {row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(row.capturedMwh)} MWh/yr captured, {formatDecimal(row.co2Tonne, 1)} tCO2/yr avoided
                    </p>
                  </div>
                  <span className="font-semibold text-energy-green">{formatNumber(row.annualSavingDt)} DT/yr</span>
                  <span className="text-muted-foreground">Payback {formatDecimal(row.paybackYears, 1)} yr</span>
                  <span className={row.npv10y >= 0 ? "font-semibold text-foreground" : "font-semibold text-alarm-red"}>
                    NPV {formatNumber(row.npv10y)} DT
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6.1 Identified Waste Heat Sources + Potential */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">
              6.1 Identified Waste Heat Sources (from audit + SCADA data)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[13px]">Source</TableHead>
                  <TableHead className="text-[13px]">Temperature (°C)</TableHead>
                  <TableHead className="text-[13px]">Estimated Flux (kW)</TableHead>
                  <TableHead className="text-[13px]">Availability (h/day)</TableHead>
                  <TableHead className="text-[13px]">Annual Energy (MWh)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wasteHeatSources.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell className="max-w-[280px] text-[13px] font-medium">
                      {row.source}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      <Badge variant="outline" className="border-primary/30 text-foreground">
                        {row.temperature}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] font-semibold">
                      {row.fluxDisplay}
                    </TableCell>
                    <TableCell className="text-[13px]">{row.availability}</TableCell>
                    <TableCell className="text-[13px] font-semibold text-energy-green">
                      {row.annualDisplay}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border bg-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Recovery Potential by Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Annual recoverable energy across audited sources, with tooltip context on
              flux and availability.
            </p>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={opportunityChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip content={<OpportunityTooltip />} />
                  <Bar
                    dataKey="annualMwh"
                    name="Annual energy (MWh)"
                    fill="var(--chart-1)"
                    radius={[6, 6, 6, 6]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                High-temp streams (&gt;200°C)
              </div>
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                Mid-temp recovery (80–200°C)
              </div>
              <div className="flex items-center gap-2">
                <Leaf className="h-4 w-4 text-primary" />
                Low-temp recovery (&lt;80°C)
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6.2 Prioritization Framework */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">6.2 Prioritization Framework</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Each opportunity is scored across 5 criteria (0–10 scale).
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[13px]">Criterion</TableHead>
                  <TableHead className="text-[13px]">Weight</TableHead>
                  <TableHead className="text-[13px]">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prioritizationCriteria.map((item) => (
                  <TableRow key={item.criterion}>
                    <TableCell className="text-[13px] font-medium">{item.criterion}</TableCell>
                    <TableCell className="text-[13px] font-semibold text-primary">
                      {item.weight}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {item.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border bg-[linear-gradient(145deg,rgba(201,168,76,0.15)_0%,rgba(255,255,255,0.9)_55%)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Priority Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-primary/30 bg-white/80 p-5 text-sm text-foreground">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
{`Priority Score = 0.30 × energy + 0.25 × co2 + 0.20 × (10 - complexity)
              + 0.15 × (10 - cost_score) + 0.10 × strategic_fit`}
              </pre>
            </div>
            <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-white/70 px-4 py-3">
                <span>Energy + CO2 weight</span>
                <span className="font-semibold text-primary">55%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-white/70 px-4 py-3">
                <span>Execution friction weight</span>
                <span className="font-semibold text-primary">35%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-white/70 px-4 py-3">
                <span>Strategic alignment</span>
                <span className="font-semibold text-primary">10%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 6.3 Top Scenarios */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">6.3 Top 3 Prioritized Recovery Scenarios</h2>
          <p className="text-sm text-muted-foreground">
            Ranked by weighted scoring, ROI, and integration feasibility.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <Card
              key={scenario.id}
              className={`border-2 ${scenario.accent} bg-card shadow-[0_20px_40px_rgba(17,17,17,0.08)]`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary/15 text-primary">Scenario {scenario.id}</Badge>
                  <Badge variant="outline" className="border-primary/40 text-foreground">
                    {scenario.tag}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-lg font-semibold">{scenario.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Source:</span> {scenario.source}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Recovery method:</span> {scenario.recoveryMethod}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Use:</span> {scenario.useCase}
                </p>
                <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span>Recoverable</span>
                    <span className="font-semibold text-foreground">{scenario.recoverable}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>CO2 avoided</span>
                    <span className="font-semibold text-foreground">{scenario.co2Avoided}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estimated capex</span>
                    <span className="font-semibold text-foreground">{scenario.capex}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Simple payback</span>
                    <span className="font-semibold text-foreground">{scenario.payback}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-secondary text-foreground">
                  Complexity: {scenario.complexity}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Calculator className="h-5 w-5 text-primary" />
              6.4 ROI Simulator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {scenarios.map((scenario) => (
                <Button
                  key={scenario.id}
                  variant={selectedScenarioId === scenario.id ? "default" : "outline"}
                  size="sm"
                  className="after:content-none"
                  onClick={() => selectScenario(scenario)}
                >
                  Scenario {scenario.id}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto after:content-none"
                onClick={() => selectScenario(selectedScenario)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="font-semibold text-foreground">{selectedScenario.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{selectedScenario.useCase}</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Capture efficiency</span>
                  <span className="text-muted-foreground">{formatDecimal(captureEfficiencyPct, 0)}%</span>
                </div>
                <Slider
                  value={[captureEfficiencyPct]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(value) => setCaptureEfficiencyPct(value[0] ?? 0)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Gas price avoided</span>
                  <span className="text-muted-foreground">
                    {formatDecimal(gasPriceMilliDt / 1000, 3)} DT/kWh
                  </span>
                </div>
                <Slider
                  value={[gasPriceMilliDt]}
                  min={15}
                  max={60}
                  step={1}
                  onValueChange={(value) => setGasPriceMilliDt(value[0] ?? 28)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Capex</span>
                  <span className="text-muted-foreground">{formatNumber(capexDt)} DT</span>
                </div>
                <Slider
                  value={[capexDt]}
                  min={10000}
                  max={130000}
                  step={1000}
                  onValueChange={(value) => setCapexDt(value[0] ?? selectedScenario.capexDefaultDt)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Simulator Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Captured energy
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {formatNumber(Math.round(roi.capturedKwhYear / 1000))}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">MWh/yr</span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Annual saving
                </p>
                <p className="mt-2 text-2xl font-bold text-energy-green">
                  {formatNumber(Math.round(roi.annualSavingDt))}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">DT/yr</span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  CO2 avoided
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {formatDecimal(roi.co2AvoidedTonneYear, 1)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">t/yr</span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Simple payback
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {formatDecimal(roi.simplePaybackYears, 1)}
                  <span className="ml-2 text-sm font-medium text-muted-foreground">years</span>
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">10-year NPV at 5%</span>
                <span className={roi.npv10y >= 0 ? "font-bold text-energy-green" : "font-bold text-alarm-red"}>
                  {formatNumber(Math.round(roi.npv10y))} DT
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Radar + ROI Logic */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Scenario Score Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              0–10 scoring across energy, CO2, ease of integration, capex, and strategic fit.
            </p>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis angle={24} domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Radar
                    name="Scenario A"
                    dataKey="scenarioA"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.25}
                  />
                  <Radar
                    name="Scenario B"
                    dataKey="scenarioB"
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.18}
                  />
                  <Radar
                    name="Scenario C"
                    dataKey="scenarioC"
                    stroke="var(--chart-4)"
                    fill="var(--chart-4)"
                    fillOpacity={0.18}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">6.4 ROI Simulator Logic</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Reference logic used to quantify captured energy, DT savings, and payback windows.
            </p>
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                {roiCode}
              </pre>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
