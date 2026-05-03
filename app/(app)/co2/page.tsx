"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchDocumentsCo2Monthly,
  type DocumentsCo2MonthlyResponse,
} from "@/lib/documents-api";
import { useLanguage } from "@/lib/language-context";

function formatNumber(value: number, digits = 0) {
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

function monthLabel(month: string | null) {
  if (!month) return "Unknown";
  const [monthPart, yearPart] = month.split("/");
  if (!monthPart || !yearPart) return month;
  const date = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

export default function Co2Page() {
  const { t } = useLanguage();
  const [data, setData] = useState<DocumentsCo2MonthlyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCo2Data() {
      try {
        setLoading(true);
        const response = await fetchDocumentsCo2Monthly();
        setData(response);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "CO2 data unavailable");
      } finally {
        setLoading(false);
      }
    }

    loadCo2Data();
  }, []);

  const items = data?.items ?? [];

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.documents += item.co2_total_kg;
        acc.scada += item.scada_co2_gas_kg;
        return acc;
      },
      { documents: 0, scada: 0 },
    );
  }, [items]);

  const chartData = useMemo(
    () =>
      items.map((item) => ({
        month: monthLabel(item.billing_month),
        co2Gas: item.co2_gas_kg,
        co2Grid: item.co2_grid_kg,
        co2Scada: item.scada_co2_gas_kg,
      })),
    [items],
  );

  const totalCombined = totals.documents + totals.scada;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.co2Emissions}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(totalCombined, 0)} kg CO2
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              {t.co2FromDocuments}
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {formatNumber(totals.documents, 0)} kg
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              {t.co2FromScada}
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {formatNumber(totals.scada, 0)} kg
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{t.totalCo2}</p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {formatNumber(totalCombined, 0)} kg
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{t.monthlyEmissions}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No CO2 data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "14px",
                    }}
                    formatter={(value: number) => `${formatNumber(value, 1)} kg CO2`}
                  />
                  <Legend wrapperStyle={{ fontSize: "14px", paddingTop: "12px" }} />
                  <Bar
                    dataKey="co2Gas"
                    name={t.naturalGas}
                    stackId="co2"
                    fill="var(--chart-1)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="co2Grid"
                    name={t.gridElectricity}
                    stackId="co2"
                    fill="var(--chart-2)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="co2Scada"
                    name={t.scadaGas}
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">{t.emissionFactors}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{t.naturalGas}</span>
              <span>{formatNumber(data?.factors.natural_gas ?? 0, 3)} kg CO2/kWh</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t.gridElectricity}</span>
              <span>{formatNumber(data?.factors.grid_electricity ?? 0, 3)} kg CO2/kWh</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t.selfProduced}</span>
              <span>{formatNumber(data?.factors.self_produced ?? 0, 3)} kg CO2/kWh</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">{t.co2Emissions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{t.co2FromDocuments}</span>
              <span>{formatNumber(totals.documents, 0)} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t.co2FromScada}</span>
              <span>{formatNumber(totals.scada, 0)} kg</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>{t.totalCo2}</span>
              <span>{formatNumber(totalCombined, 0)} kg</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{t.month}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.month}</TableHead>
                <TableHead>{t.naturalGas} (kWh)</TableHead>
                <TableHead>{t.gridElectricity} (kWh)</TableHead>
                <TableHead>{t.scadaGas} (kWh)</TableHead>
                <TableHead>{t.co2FromDocuments} (kg)</TableHead>
                <TableHead>{t.co2FromScada} (kg)</TableHead>
                <TableHead>{t.totalCo2} (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No CO2 data yet
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.billing_month}>
                    <TableCell>{monthLabel(item.billing_month)}</TableCell>
                    <TableCell>{formatNumber(item.gas_kwh, 0)}</TableCell>
                    <TableCell>{formatNumber(item.grid_kwh, 0)}</TableCell>
                    <TableCell>{formatNumber(item.scada_gas_kwh, 0)}</TableCell>
                    <TableCell>{formatNumber(item.co2_total_kg, 1)}</TableCell>
                    <TableCell>{formatNumber(item.scada_co2_gas_kg, 1)}</TableCell>
                    <TableCell>{formatNumber(item.co2_total_kg + item.scada_co2_gas_kg, 1)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
