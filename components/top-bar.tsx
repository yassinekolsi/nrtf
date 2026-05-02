"use client";

import { useEffect, useState } from "react";
import { Bell, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language-context";
import { fetchEventStats } from "@/lib/api-client";

export function TopBar() {
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [alarmCount, setAlarmCount] = useState(0);

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
    async function loadAlarmCount() {
      try {
        const stats = await fetchEventStats();
        setAlarmCount(stats.unacknowledged);
      } catch {
        setAlarmCount(0);
      }
    }

    loadAlarmCount();
    const interval = window.setInterval(loadAlarmCount, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "fr" : "en");
  };

  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-20 items-center justify-between border-b border-primary/45 bg-sidebar px-8 text-sidebar-foreground">
      {/* Site Name */}
      <div className="flex items-center">
        <h1 className="font-heading text-base font-semibold uppercase tracking-[0.24em] text-primary">
          {t.siteName}
        </h1>
      </div>

      {/* Date & Time */}
      <div className="flex flex-col items-center">
        <span className="font-heading text-sm font-medium tracking-[0.14em] text-sidebar-foreground">
          {currentTime}
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-sidebar-foreground/62">
          {currentDate}
        </span>
      </div>

      {/* Right Section - Language Toggle & Alarm Badge */}
      <div className="flex items-center gap-4">
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
        </div>
      </div>
    </header>
  );
}
