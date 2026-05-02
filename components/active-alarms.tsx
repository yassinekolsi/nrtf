"use client";

import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";

const severityConfig = {
  Critique: {
    icon: AlertTriangle,
    className: "bg-alarm-red text-alarm-red-foreground",
    iconColor: "text-alarm-red",
  },
  Moyen: {
    icon: AlertCircle,
    className: "bg-warning-amber text-warning-amber-foreground",
    iconColor: "text-warning-amber",
  },
  Info: {
    icon: Info,
    className: "bg-muted text-muted-foreground",
    iconColor: "text-muted-foreground",
  },
};

export interface ActiveAlarmItem {
  id: string;
  timestamp: string;
  equipment: string;
  description: string;
  severity: "Critique" | "Moyen" | "Info";
  status: "En cours" | "Acquitté";
}

interface ActiveAlarmsProps {
  alarms: ActiveAlarmItem[];
  activeCount: number;
  loading?: boolean;
  error?: string | null;
  onAcknowledge?: (alarmId: string) => void;
}

export function ActiveAlarms({
  alarms,
  activeCount,
  loading = false,
  error = null,
  onAcknowledge,
}: ActiveAlarmsProps) {
  const { t } = useLanguage();

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg font-semibold">
          <span>{t.activeAlarms}</span>
          {activeCount > 0 && (
            <Badge variant="destructive" className="bg-alarm-red text-alarm-red-foreground">
              {activeCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : error ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {error}
            </p>
          ) : alarms.filter((a) => a.status === "En cours").length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              {t.activeAlarms}: 0
            </p>
          ) : (
            alarms
              .filter((a) => a.status === "En cours")
              .map((alarm) => {
                const config = severityConfig[alarm.severity];
                const Icon = config.icon;

                return (
                  <div
                    key={alarm.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn("h-5 w-5", config.iconColor)} />
                      <div>
                        <p className="text-sm font-medium">{alarm.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {alarm.equipment} — {new Date(alarm.timestamp).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={cn("text-xs", config.className)}>
                        {alarm.severity}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAcknowledge?.(alarm.id)}
                        className="text-xs"
                      >
                        {t.acknowledge}
                      </Button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
