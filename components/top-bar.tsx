"use client";

import { useEffect, useState } from "react";
import { Bell, Globe, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";
import { fetchEventStats, fetchTelemetryStats } from "@/lib/api-client";

const timeRanges = ["1h", "6h", "24h", "7d", "30d", "custom"];

function formatSyncTime(timestampMs: number, locale: string) {
  if (!timestampMs) return "--";
  return new Date(timestampMs).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TopBar() {
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [alarmCount, setAlarmCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [lastSeenMs, setLastSeenMs] = useState(0);
  const [activeRange, setActiveRange] = useState("24h");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(language === "fr" ? "fr-FR" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setCurrentDate(
        now.toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, [language]);

  useEffect(() => {
    async function loadStatus() {
      try {
        const [eventStats, telemetryStats] = await Promise.allSettled([
          fetchEventStats(),
          fetchTelemetryStats(),
        ]);

        if (eventStats.status === "fulfilled") {
          setAlarmCount(eventStats.value.unacknowledged);
          setCriticalCount(eventStats.value.critique_count);
        }
        if (telemetryStats.status === "fulfilled") {
          setLastSeenMs(telemetryStats.value.last_seen_ms);
        }
      } catch {
        setAlarmCount(0);
        setCriticalCount(0);
      }
    }

    loadStatus();
    const interval = window.setInterval(loadStatus, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "fr" : "en");
  };

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const isLive = lastSeenMs > 0 && Date.now() - lastSeenMs < 90_000;

  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-20 items-center justify-between gap-5 border-b border-primary/45 bg-sidebar px-8 text-sidebar-foreground">
      {/* Site Name */}
      <div className="flex min-w-[210px] items-center">
        <h1 className="font-heading text-base font-semibold uppercase tracking-[0.24em] text-primary">
          {t.siteName}
        </h1>
      </div>

      {/* Global Controls */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <div className="hidden min-w-[145px] flex-col items-center xl:flex">
          <span className="font-heading text-sm font-medium tracking-[0.14em] text-sidebar-foreground">
            {currentTime}
          </span>
          <span className="max-w-[250px] truncate text-xs uppercase tracking-[0.12em] text-sidebar-foreground/62">
            {currentDate}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-primary/30 bg-white/5 p-1">
          {timeRanges.map((range) => (
            <Button
              key={range}
              variant={activeRange === range ? "default" : "ghost"}
              size="sm"
              className="h-8 px-3 text-[0.68rem] uppercase after:content-none"
              onClick={() => setActiveRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Right Section - Language Toggle & Alarm Badge */}
      <div className="flex shrink-0 items-center gap-3">
        <Badge
          className={
            isLive
              ? "gap-2 border border-energy-green/30 bg-energy-green text-energy-green-foreground"
              : "gap-2 border border-alarm-red/30 bg-alarm-red text-alarm-red-foreground"
          }
        >
          <RadioTower className="h-3.5 w-3.5" />
          {isLive ? "IoT streaming" : "Disconnected"}
        </Badge>
        <span className="hidden text-xs text-sidebar-foreground/62 2xl:inline">
          Last sync {formatSyncTime(lastSeenMs, locale)}
        </span>

        {/* Language Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleLanguage}
          className="border-primary/45 text-sidebar-foreground hover:border-primary hover:bg-primary/10 hover:text-primary after:content-none"
        >
          <Globe className="h-4 w-4" />
          {language.toUpperCase()}
        </Button>

        {/* Alarm Badge */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-sidebar-foreground hover:text-primary"
            asChild
          >
            <a href="/alertes">
              <Bell className="h-5 w-5" />
              {alarmCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-alarm-red text-xs font-bold text-alarm-red-foreground">
                  {alarmCount}
                </span>
              )}
            </a>
          </Button>
          {alarmCount > 0 ? (
            <span className="absolute right-0 top-10 hidden w-max rounded-md border border-primary/25 bg-sidebar px-2 py-1 text-[0.65rem] uppercase tracking-[0.1em] text-sidebar-foreground/72 xl:block">
              {criticalCount} critical / {alarmCount} open
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
