"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, AlertCircle, Info, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { allAlarms, equipmentList, alarmCounts, Alarm } from "@/lib/mockData";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

const severityConfig = {
  Critique: {
    icon: AlertTriangle,
    className: "bg-alarm-red text-alarm-red-foreground",
  },
  Moyen: {
    icon: AlertCircle,
    className: "bg-warning-amber text-warning-amber-foreground",
  },
  Info: {
    icon: Info,
    className: "bg-muted text-muted-foreground",
  },
};

export default function AlertesPage() {
  const { t } = useLanguage();
  const [alarms, setAlarms] = useState<Alarm[]>(allAlarms);
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const filteredAlarms = useMemo(() => {
    return alarms.filter((alarm) => {
      // Equipment filter
      if (equipmentFilter !== "all" && alarm.equipment !== equipmentFilter) {
        return false;
      }
      // Severity filter
      if (severityFilter !== "all" && alarm.severity !== severityFilter) {
        return false;
      }
      // Date range filter
      if (dateFrom) {
        const alarmDate = new Date(alarm.timestamp);
        const fromDate = new Date(dateFrom);
        if (alarmDate < fromDate) return false;
      }
      if (dateTo) {
        const alarmDate = new Date(alarm.timestamp);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59);
        if (alarmDate > toDate) return false;
      }
      return true;
    });
  }, [alarms, equipmentFilter, severityFilter, dateFrom, dateTo]);

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
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.alerts}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} {t.ongoing} / {alarms.length} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From:</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To:</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>

            {/* Equipment Filter */}
            <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t.allEquipment} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allEquipment}</SelectItem>
                {equipmentList.map((eq) => (
                  <SelectItem key={eq} value={eq}>
                    {eq}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Severity Filter */}
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t.allSeverities} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allSeverities}</SelectItem>
                <SelectItem value="Critique">{t.critical}</SelectItem>
                <SelectItem value="Moyen">{t.medium}</SelectItem>
                <SelectItem value="Info">{t.info}</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEquipmentFilter("all");
                setSeverityFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alarms Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">{t.dateTime}</TableHead>
                <TableHead className="text-[15px]">{t.equipment}</TableHead>
                <TableHead className="text-[15px]">{t.description}</TableHead>
                <TableHead className="text-[15px]">{t.severity}</TableHead>
                <TableHead className="text-[15px]">{t.status}</TableHead>
                <TableHead className="text-right text-[15px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlarms.map((alarm) => {
                const config = severityConfig[alarm.severity];
                const Icon = config.icon;

                return (
                  <TableRow key={alarm.id}>
                    <TableCell className="text-[15px]">
                      {new Date(alarm.timestamp).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-[15px] font-medium">
                      {alarm.equipment}
                    </TableCell>
                    <TableCell className="text-[15px]">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {alarm.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", config.className)}>
                        {alarm.severity === "Critique"
                          ? t.critical
                          : alarm.severity === "Moyen"
                          ? t.medium
                          : t.info}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={alarm.status === "En cours" ? "destructive" : "secondary"}
                        className={cn(
                          "text-xs",
                          alarm.status === "En cours"
                            ? "bg-alarm-red/10 text-alarm-red"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {alarm.status === "En cours" ? t.ongoing : t.acknowledged}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {alarm.status === "En cours" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(alarm.id)}
                          className="text-xs"
                        >
                          {t.acknowledge}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
