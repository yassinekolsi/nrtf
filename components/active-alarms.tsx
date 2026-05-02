"use client";

import { useState } from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { activeAlarms, Alarm } from "@/lib/mockData";
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

export function ActiveAlarms() {
  const { t } = useLanguage();
  const [alarms, setAlarms] = useState<Alarm[]>(activeAlarms);

  const handleAcknowledge = (alarmId: string) => {
    setAlarms((prev) =>
      prev.map((alarm) =>
        alarm.id === alarmId
          ? { ...alarm, status: "Acquitté" as const, acknowledged_at: new Date().toISOString() }
          : alarm
      )
    );
  };

  const activeCount = alarms.filter((a) => a.status === "En cours").length;

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
          {alarms.filter((a) => a.status === "En cours").length === 0 ? (
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
                        onClick={() => handleAcknowledge(alarm.id)}
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
