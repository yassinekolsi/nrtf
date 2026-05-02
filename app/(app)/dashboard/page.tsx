"use client";

import { KPICard } from "@/components/kpi-card";
import { PowerChart } from "@/components/power-chart";
import { ActiveAlarms } from "@/components/active-alarms";
import { currentKPIs } from "@/lib/mockData";
import { useLanguage } from "@/lib/language-context";

export default function DashboardPage() {
  const { t } = useLanguage();

  // Determine statuses based on values
  const stegStatus = currentKPIs.importSTEG < 0 ? "good" : "normal";
  const pfStatus = currentKPIs.facteurPuissance < 0.95 ? "warning" : "good";

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-foreground">{t.dashboard}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label={t.enginePower}
          value={currentKPIs.puissanceMoteur}
          unit={t.kw}
          status="good"
        />
        <KPICard
          label={t.temperature}
          value={currentKPIs.temperature}
          unit={t.celsius}
          status={currentKPIs.temperature <= 30 ? "good" : currentKPIs.temperature <= 35 ? "warning" : "critical"}
        />
        <KPICard
          label={t.stegImport}
          value={currentKPIs.importSTEG}
          unit={t.kw}
          status={stegStatus}
          subtitle={currentKPIs.importSTEG < 0 ? "Selling to grid" : "Buying from grid"}
        />
        <KPICard
          label={t.powerFactor}
          value={currentKPIs.facteurPuissance}
          status={pfStatus}
        />
      </div>

      {/* Power Chart */}
      <PowerChart />

      {/* Active Alarms */}
      <ActiveAlarms />
    </div>
  );
}
