"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { KPICard } from "@/components/kpi-card";
import { currentKPIs, last30DaysProduction } from "@/lib/mockData";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

// Custom dot component for temperature chart to highlight anomalies
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

export default function TrigenerationPage() {
  const { t } = useLanguage();

  // Determine temperature status
  const tempStatus: "good" | "warning" | "critical" = 
    currentKPIs.eauGlaceeTT01 <= 9 ? "good" : 
    currentKPIs.eauGlaceeTT01 <= 12 ? "warning" : "critical";

  // Calculate utilization percentage
  const utilizationPercent = Math.round(
    (currentKPIs.absorptionPuissanceMesuree / currentKPIs.absorptionPuissanceNominale) * 100
  );

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-foreground">{t.trigeneration}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t.activePower}
          value={currentKPIs.puissanceMoteur}
          unit={t.kw}
          status="good"
        />
        <KPICard
          label={t.chilledWater}
          value={currentKPIs.eauGlaceeTT01}
          unit={t.celsius}
          status={tempStatus}
        />
        <KPICard
          label={t.hotWater}
          value={currentKPIs.eauChaudeTT03}
          unit={t.celsius}
          status="good"
        />
        <KPICard
          label={t.engineHours}
          value={currentKPIs.heuresMoteur.toLocaleString()}
          unit={t.hours}
          status="normal"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily Production Chart */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">
              {t.dailyElectricalProduction} (kWh/day)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={last30DaysProduction}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[27000, 30000]}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    formatter={(value: number) => [`${value.toLocaleString()} kWh`, "Production"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="productionKWh"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Temperature Chart */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">
              {t.chilledWaterTemp} (°C)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={last30DaysProduction}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 20]}
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
                      return [`${value}°C ${isAnomaly ? "(ANOMALY)" : ""}`, "TT01"];
                    }}
                  />
                  <ReferenceLine
                    y={12}
                    stroke="var(--alarm-red)"
                    strokeDasharray="5 5"
                    label={{ value: "Limit 12°C", position: "right", fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tempTT01"
                    stroke="var(--chart-5)"
                    strokeWidth={2}
                    dot={<CustomDot />}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Absorption Machine Status */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">
            {t.absorptionMachine}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t.measuredCoolingPower}</p>
              <p className="text-2xl font-bold text-foreground">
                {currentKPIs.absorptionPuissanceMesuree} {t.kw}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t.nominalPower}</p>
              <p className="text-2xl font-bold text-muted-foreground">
                {currentKPIs.absorptionPuissanceNominale} {t.kw}
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
            <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  utilizationPercent < 50 ? "bg-warning-amber" : "bg-energy-green"
                )}
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
