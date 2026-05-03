"use client";

import { Fragment } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Snowflake, Thermometer, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

const chillers = [
  { id: "CH-01", model: "Carrier 30XA", zone: "Zone A", currentKw: 420, eer: 3.3, status: "Online", hours: 186 },
  { id: "CH-02", model: "Carrier 30XA", zone: "Zone A", currentKw: 380, eer: 3.1, status: "Online", hours: 214 },
  { id: "CH-03", model: "Trane RTAC", zone: "Zone B", currentKw: 315, eer: 3.4, status: "Online", hours: 142 },
  { id: "CH-04", model: "Trane RTAC", zone: "Zone B", currentKw: 260, eer: 3.0, status: "Standby", hours: 96 },
  { id: "CH-05", model: "York YVAA", zone: "Zone C", currentKw: 290, eer: 3.2, status: "Online", hours: 272 },
  { id: "CH-06", model: "York YVAA", zone: "Zone C", currentKw: 180, eer: 2.8, status: "Maintenance", hours: 402 },
  { id: "ABS-01", model: "Absorption LiBr", zone: "Core", currentKw: 258, eer: 0.7, status: "Recovered heat", hours: 74 },
];

const hourlyOutput = Array.from({ length: 24 }, (_, hour) => {
  const dayLoad = hour >= 7 && hour <= 20 ? 1 : 0.55;
  const peak = hour >= 12 && hour <= 17 ? 1.2 : 1;

  return {
    hour: `${hour.toString().padStart(2, "0")}:00`,
    "CH-01": Math.round(320 * dayLoad * peak),
    "CH-02": Math.round(285 * dayLoad * peak),
    "CH-03": Math.round(240 * dayLoad * peak),
    "CH-04": Math.round((hour % 3 === 0 ? 160 : 90) * dayLoad),
    "CH-05": Math.round(220 * dayLoad * peak),
    "CH-06": hour >= 10 && hour <= 16 ? 120 : 0,
    "ABS-01": hour >= 8 && hour <= 22 ? 258 : 110,
  };
});

const temperatureData = Array.from({ length: 24 }, (_, hour) => ({
  hour: `${hour.toString().padStart(2, "0")}:00`,
  supplyA: 5.8 + Math.sin(hour / 3) * 0.3,
  returnA: 11.7 + Math.cos(hour / 4) * 0.5,
  supplyB: 6.1 + Math.cos(hour / 5) * 0.25,
  returnB: 12.2 + Math.sin(hour / 4) * 0.45,
  supplyC: 6.3 + Math.sin(hour / 4) * 0.35,
  returnC: 12.4 + Math.cos(hour / 3) * 0.4,
}));

const scatterByZone = {
  "Zone A": Array.from({ length: 10 }, (_, index) => ({
    ambient: 24 + index * 1.1,
    eer: 3.62 - index * 0.045,
    load: 64 + index * 3,
  })),
  "Zone B": Array.from({ length: 10 }, (_, index) => ({
    ambient: 25 + index * 1.05,
    eer: 3.48 - index * 0.038,
    load: 58 + index * 2,
  })),
  "Zone C": Array.from({ length: 10 }, (_, index) => ({
    ambient: 23.5 + index * 1.2,
    eer: 3.31 - index * 0.052,
    load: 52 + index * 3,
  })),
};

const electricityData = chillers.map((chiller) => ({
  id: chiller.id,
  kwh: chiller.id === "ABS-01" ? 0 : Math.round((chiller.currentKw / Math.max(chiller.eer, 1)) * 14),
}));

const activationHours = ["00", "03", "06", "09", "12", "15", "18", "21"];
const activationRows = chillers.map((chiller, rowIndex) => ({
  id: chiller.id,
  values: activationHours.map((_, colIndex) =>
    Math.min(100, Math.max(12, 38 + rowIndex * 7 + colIndex * 8 + (rowIndex % 2 ? 12 : 0))),
  ),
}));

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

export default function ChilledWaterPage() {
  const { t } = useLanguage();
  const totalColdKw = chillers.reduce((sum, chiller) => sum + chiller.currentKw, 0);
  const electricChillers = chillers.filter((chiller) => chiller.id !== "ABS-01");
  const weightedEer =
    electricChillers.reduce((sum, chiller) => sum + chiller.currentKw * chiller.eer, 0) /
    electricChillers.reduce((sum, chiller) => sum + chiller.currentKw, 0);
  const absorptionKw = chillers.find((chiller) => chiller.id === "ABS-01")?.currentKw ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.chilledWaterPage}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Refrigeration fleet, absorption contribution, temperatures, and activation patterns.
          </p>
        </div>
        <Badge className="gap-2 border border-primary/30 bg-primary/15 text-primary">
          <Snowflake className="h-3.5 w-3.5" />
          7 units monitored
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Total cold production now"
          value={formatNumber(totalColdKw)}
          unit="kW"
          status="good"
          subtitle="Electric + absorption output"
        />
        <KPICard
          label="Absorption share"
          value={formatNumber((absorptionKw / totalColdKw) * 100, 1)}
          unit="%"
          status="normal"
          subtitle={`${formatNumber(absorptionKw)} kW from recovered heat`}
        />
        <KPICard
          label="Weighted system EER"
          value={formatNumber(weightedEer, 2)}
          status={weightedEer >= 3.1 ? "good" : "warning"}
          subtitle="Electric fleet only"
        />
        <KPICard
          label="Supply / return temps"
          value="6.1 / 12.1"
          unit="C"
          status="good"
          subtitle="Average across 3 zones"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Output per chiller, last 24h</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyOutput} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => `${formatNumber(value)} kW`} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {chillers.map((chiller, index) => (
                    <Area
                      key={chiller.id}
                      type="monotone"
                      dataKey={chiller.id}
                      stackId="cold"
                      stroke={`var(--chart-${(index % 5) + 1})`}
                      fill={`var(--chart-${(index % 5) + 1})`}
                      fillOpacity={0.28}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">EER vs ambient temperature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    dataKey="ambient"
                    name="Ambient"
                    unit="C"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="eer"
                    name="EER"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={[2.7, 3.8]}
                  />
                  <ZAxis type="number" dataKey="load" range={[60, 180]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle()} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Scatter name="Zone A" data={scatterByZone["Zone A"]} fill="var(--chart-1)" />
                  <Scatter name="Zone B" data={scatterByZone["Zone B"]} fill="var(--chart-2)" />
                  <Scatter name="Zone C" data={scatterByZone["Zone C"]} fill="var(--chart-4)" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Electricity consumed per chiller, daily</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={electricityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="id" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => `${formatNumber(value)} kWh`} />
                  <Bar dataKey="kwh" name="Daily kWh" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Supply and return temperature by zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temperatureData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[5, 13.5]} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(value: number) => `${formatNumber(value, 1)} C`} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="supplyA" name="A supply" stroke="var(--chart-1)" dot={false} />
                  <Line type="monotone" dataKey="returnA" name="A return" stroke="var(--chart-1)" strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="supplyB" name="B supply" stroke="var(--chart-2)" dot={false} />
                  <Line type="monotone" dataKey="returnB" name="B return" stroke="var(--chart-2)" strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="supplyC" name="C supply" stroke="var(--chart-4)" dot={false} />
                  <Line type="monotone" dataKey="returnC" name="C return" stroke="var(--chart-4)" strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Activation heatmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[64px_repeat(8,minmax(26px,1fr))] gap-1 text-xs">
              <div />
              {activationHours.map((hour) => (
                <div key={hour} className="text-center text-muted-foreground">{hour}</div>
              ))}
              {activationRows.map((row) => (
                <Fragment key={row.id}>
                  <div className="flex h-7 items-center font-medium text-foreground">
                    {row.id}
                  </div>
                  {row.values.map((value, index) => (
                    <div
                      key={`${row.id}-${activationHours[index]}`}
                      className="h-7 rounded-md border border-primary/20"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--primary) ${value}%, white)`,
                      }}
                      title={`${row.id} ${activationHours[index]}:00 ${value}%`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Low activation</span>
              <span>High activation</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Fleet table</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Current kW</TableHead>
                  <TableHead className="text-right">EER</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Maintenance h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chillers.map((chiller) => (
                  <TableRow key={chiller.id}>
                    <TableCell className="font-medium">{chiller.id}</TableCell>
                    <TableCell>{chiller.model}</TableCell>
                    <TableCell>{chiller.zone}</TableCell>
                    <TableCell className="text-right">{formatNumber(chiller.currentKw)}</TableCell>
                    <TableCell className="text-right">{formatNumber(chiller.eer, 1)}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "gap-1",
                          chiller.status === "Maintenance"
                            ? "bg-warning-amber text-warning-amber-foreground"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        {chiller.status === "Maintenance" ? (
                          <Wrench className="h-3 w-3" />
                        ) : (
                          <Thermometer className="h-3 w-3" />
                        )}
                        {chiller.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(chiller.hours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
