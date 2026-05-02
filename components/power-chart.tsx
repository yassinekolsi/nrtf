"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/language-context";

export interface PowerChartPoint {
  time: string;
  puissanceMoteur: number;
  importSTEG?: number;
}

interface PowerChartProps {
  data: PowerChartPoint[];
  loading?: boolean;
  error?: string | null;
  unit?: string;
}

export function PowerChart({ data, loading = false, error = null, unit }: PowerChartProps) {
  const { t } = useLanguage();
  const displayUnit = unit ?? t.kw;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{t.last24Hours}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No live telemetry yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="time"
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
                  tickFormatter={(value: number) => `${value.toFixed(1)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${displayUnit}`, t.enginePower]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "14px", paddingTop: "16px" }}
                />
                <Line
                  type="monotone"
                  dataKey="puissanceMoteur"
                  name={t.enginePower}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={data.length === 1}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
