"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchDocuments,
  fetchDocumentsSummary,
  type DocumentRecord,
  type DocumentsSummary,
} from "@/lib/api-client";
import { useLanguage } from "@/lib/language-context";

interface MonthlyEnergyRow {
  month: string;
  monthKey: string;
  gasKWh: number;
  stegKWh: number;
  co2Kg: number;
}

function formatNumber(value: number, digits = 0) {
  return Number(value.toFixed(digits)).toLocaleString();
}

function rawNumber(document: DocumentRecord, key: string) {
  const canonical = document.raw_json.canonical;
  if (!canonical || typeof canonical !== "object") return null;

  const value = (canonical as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function monthLabel(month: string | null) {
  if (!month) return "Unknown";
  const [monthPart, yearPart] = month.split("/");
  if (!monthPart || !yearPart) return month;
  const date = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function buildMonthlyRows(electricityDocs: DocumentRecord[], gasDocs: DocumentRecord[]) {
  const rows = new Map<string, MonthlyEnergyRow>();

  const ensureRow = (doc: DocumentRecord) => {
    const key = doc.billing_month ?? "unknown";
    const existing = rows.get(key);
    if (existing) return existing;

    const row = {
      month: monthLabel(doc.billing_month),
      monthKey: key,
      gasKWh: 0,
      stegKWh: 0,
      co2Kg: 0,
    };
    rows.set(key, row);
    return row;
  };

  electricityDocs.forEach((doc) => {
    const row = ensureRow(doc);
    row.stegKWh += doc.normalized_kwh ?? 0;
    row.co2Kg += doc.co2_emissions_kg ?? 0;
  });

  gasDocs.forEach((doc) => {
    const row = ensureRow(doc);
    row.gasKWh += doc.normalized_kwh ?? 0;
    row.co2Kg += doc.co2_emissions_kg ?? 0;
  });

  return Array.from(rows.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export default function EnergiePage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("consumption");
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [electricityDocs, setElectricityDocs] = useState<DocumentRecord[]>([]);
  const [gasDocs, setGasDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEnergyData() {
      try {
        setLoading(true);
        const [summaryResult, electricityResult, gasResult] = await Promise.all([
          fetchDocumentsSummary(),
          fetchDocuments({ doc_type: "STEG_ELECTRICITY", limit: 12 }),
          fetchDocuments({ doc_type: "STEG_GAS", limit: 12 }),
        ]);

        setSummary(summaryResult);
        setElectricityDocs(electricityResult);
        setGasDocs(gasResult);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Energy data unavailable");
      } finally {
        setLoading(false);
      }
    }

    loadEnergyData();
  }, []);

  const monthlyRows = useMemo(
    () => buildMonthlyRows(electricityDocs, gasDocs),
    [electricityDocs, gasDocs],
  );

  const chartData = monthlyRows.map((row) => ({
    month: row.month,
    [t.gas]: Math.round(row.gasKWh / 1000),
    [`${t.stegImport} (MWh)`]: Math.round(row.stegKWh / 1000),
  }));

  const totalAmount = electricityDocs.reduce(
    (sum, doc) => sum + (rawNumber(doc, "amount_ttc") ?? 0),
    0,
  );
  const hasDocuments = electricityDocs.length > 0 || gasDocs.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.energy}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatNumber(summary?.total_normalized_kwh ?? 0)} kWh / {formatNumber(summary?.total_co2_kg ?? 0)} kg CO2
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {summary?.by_supplier.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {summary.by_supplier.map((supplier) => (
            <Card key={supplier.supplier} className="border-border bg-card">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-muted-foreground">{supplier.supplier}</p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {formatNumber(supplier.total_kwh)} kWh
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(supplier.total_co2_kg)} kg CO2
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="consumption" className="text-[15px]">
            {t.consumption}
          </TabsTrigger>
          <TabsTrigger value="billing" className="text-[15px]">
            {t.stegBilling}
          </TabsTrigger>
        </TabsList>

        {/* Consumption Tab */}
        <TabsContent value="consumption" className="mt-6 space-y-6">
          {/* Bar Chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">
                {t.consumption} (MWh) — Last 6 Months
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : !hasDocuments ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No documents uploaded yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "14px", paddingTop: "16px" }} />
                      <Bar
                        dataKey={t.gas}
                        fill="var(--chart-3)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey={`${t.stegImport} (MWh)`}
                        fill="var(--chart-2)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary Table */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">
                Monthly Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[15px]">{t.month}</TableHead>
                    <TableHead className="text-right text-[15px]">{t.gas} (Nm³)</TableHead>
                    <TableHead className="text-right text-[15px]">{t.gas} (kWh)</TableHead>
                    <TableHead className="text-right text-[15px]">{t.autoproduction} (kWh)</TableHead>
                    <TableHead className="text-right text-[15px]">{t.stegImport} (kWh)</TableHead>
                    <TableHead className="text-right text-[15px]">{t.co2Avoided} (tCO₂)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : monthlyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No documents uploaded yet
                      </TableCell>
                    </TableRow>
                  ) : monthlyRows.map((row) => (
                    <TableRow key={row.monthKey}>
                      <TableCell className="text-[15px] font-medium">{row.month}</TableCell>
                      <TableCell className="text-right text-[15px]">
                        -
                      </TableCell>
                      <TableCell className="text-right text-[15px]">
                        {formatNumber(row.gasKWh)}
                      </TableCell>
                      <TableCell className="text-right text-[15px] text-energy-green">
                        -
                      </TableCell>
                      <TableCell className="text-right text-[15px]">
                        {formatNumber(row.stegKWh)}
                      </TableCell>
                      <TableCell className="text-right text-[15px] text-energy-green">
                        {formatNumber(row.co2Kg / 1000, 2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STEG Billing Tab */}
        <TabsContent value="billing" className="mt-6 space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">
                STEG Billing — November 2025
              </CardTitle>
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/documents">
                  <Upload className="h-4 w-4" />
                  {t.importReading}
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[15px]">{t.timeSlot}</TableHead>
                    <TableHead className="text-[15px]">{t.code}</TableHead>
                    <TableHead className="text-right text-[15px]">{t.oldIndex}</TableHead>
                    <TableHead className="text-right text-[15px]">{t.newIndex}</TableHead>
                    <TableHead className="text-right text-[15px]">{t.consumptionKWh}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : electricityDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No documents uploaded yet
                      </TableCell>
                    </TableRow>
                  ) : electricityDocs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-[15px] font-medium">
                        {row.billing_month ?? "-"}
                      </TableCell>
                      <TableCell className="text-[15px] font-mono">
                        {row.doc_type}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-mono">
                        {rawNumber(row, "index_ancien")?.toLocaleString() ?? "-"}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-mono">
                        {rawNumber(row, "index_nouveau")?.toLocaleString() ?? "-"}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-semibold">
                        {formatNumber(row.normalized_kwh ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Total Amount */}
              <div className="rounded-lg border border-border bg-muted/30 p-6">
                <p className="text-sm font-medium text-muted-foreground">
                  {t.totalAmount}
                </p>
                <p className="mt-1 text-3xl font-bold text-foreground">
                  {totalAmount > 0 ? `${formatNumber(totalAmount, 2)} DT TTC` : "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
