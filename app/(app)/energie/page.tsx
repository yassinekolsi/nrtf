"use client";

import { useState } from "react";
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
import { monthlyConsumptionData, stegBillingData, stegTotalAmount } from "@/lib/mockData";
import { useLanguage } from "@/lib/language-context";

export default function EnergiePage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("consumption");

  // Transform data for chart
  const chartData = monthlyConsumptionData.map((d) => ({
    month: d.month,
    [t.gas]: Math.round(d.gazKWh / 1000),
    [t.autoproduction]: Math.round(d.autoproductionKWh / 1000),
    [`${t.stegImport} (MWh)`]: Math.round(d.importSTEGKWh / 1000),
  }));

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-foreground">{t.energy}</h1>

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
                      dataKey={t.autoproduction}
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey={`${t.stegImport} (MWh)`}
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
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
                  {monthlyConsumptionData.map((row) => (
                    <TableRow key={row.monthKey}>
                      <TableCell className="text-[15px] font-medium">{row.month}</TableCell>
                      <TableCell className="text-right text-[15px]">
                        {row.gazNm3.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px]">
                        {row.gazKWh.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px] text-energy-green">
                        {row.autoproductionKWh.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px]">
                        {row.importSTEGKWh.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px] text-energy-green">
                        {row.co2Evite}
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
                  {stegBillingData.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[15px] font-medium">
                        {row.trancheHoraire}
                      </TableCell>
                      <TableCell className="text-[15px] font-mono">
                        {row.code}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-mono">
                        {row.ancienIndex.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-mono">
                        {row.nouvelIndex.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-[15px] font-semibold">
                        {row.consommationKWh.toLocaleString()}
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
                  {stegTotalAmount}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
