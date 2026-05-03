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
  timestamp_ms?: number;
  [key: string]: number | string | undefined;
}

export interface PowerChartSeries {
  key: string;
  label: string;
  unit?: string;
  color?: string;
  yAxisId?: string;
}

export interface PowerChartAxis {
  id: string;
  orientation?: "left" | "right";
  domain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  tickDigits?: number;
  allowDataOverflow?: boolean;
  hide?: boolean;
}

interface PowerChartProps {
  data: PowerChartPoint[];
  series: PowerChartSeries[];
  yAxes?: PowerChartAxis[];
  loading?: boolean;
  error?: string | null;
}

export function PowerChart({ data, series, yAxes, loading = false, error = null }: PowerChartProps) {
  const { t } = useLanguage();
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const axes = yAxes?.length ? yAxes : [{ id: "default" }];
  const defaultAxisId = axes[0]?.id ?? "default";

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
                {axes.map((axis) => (
                  <YAxis
                    key={axis.id}
                    yAxisId={axis.id}
                    orientation={axis.orientation ?? "left"}
                    domain={axis.domain}
                    allowDataOverflow={axis.allowDataOverflow}
                    hide={axis.hide}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    tickFormatter={(value: number) => `${Number(value).toFixed(axis.tickDigits ?? 1)}`}
                  />
                ))}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(value: number, name, props) => {
                    const dataKey = String(props.dataKey ?? name);
                    const seriesEntry = seriesByKey.get(dataKey);
                    const label = seriesEntry?.label ?? name;
                    const numeric = typeof value === "number" ? value : Number(value);
                    if (!Number.isFinite(numeric)) return [value, label];
                    const unit = seriesEntry?.unit ?? "";
                    const formatted = `${numeric.toFixed(2)}${unit ? ` ${unit}` : ""}`;
                    return [formatted, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "14px", paddingTop: "16px" }}
                />
                {series.map((item, index) => (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    yAxisId={item.yAxisId ?? defaultAxisId}
                    name={item.label}
                    stroke={item.color ?? `var(--chart-${index + 1})`}
                    strokeWidth={2}
                    dot={data.length === 1}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
