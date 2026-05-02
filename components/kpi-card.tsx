"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: "normal" | "good" | "warning" | "critical";
  subtitle?: string;
}

export function KPICard({ label, value, unit, status = "normal", subtitle }: KPICardProps) {
  const statusColors = {
    normal: "text-foreground",
    good: "text-energy-green",
    warning: "text-warning-amber",
    critical: "text-alarm-red",
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tracking-tight", statusColors[status])}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
          {unit && (
            <span className="text-lg font-medium text-muted-foreground">{unit}</span>
          )}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
