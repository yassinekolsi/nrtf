"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Activity,
  BrainCircuit,
  Cpu,
  LayoutDashboard, 
  Zap, 
  Settings2, 
  Database,
  FileText, 
  AlertTriangle,
  Leaf,
  Flame,
  Snowflake
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { prefetchRouteData } from "@/lib/prefetch";

const navItems = [
  { href: "/command-center", icon: Activity, labelKey: "commandCenter" as const },
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" as const },
  { href: "/edge-intelligence", icon: BrainCircuit, labelKey: "edgeIntelligence" as const },
  { href: "/energie", icon: Zap, labelKey: "energy" as const },
  { href: "/trigeneration", icon: Settings2, labelKey: "trigeneration" as const },
  { href: "/chilled-water", icon: Snowflake, labelKey: "chilledWaterPage" as const },
  { href: "/co2", icon: Leaf, labelKey: "co2" as const },
  { href: "/recovery", icon: Flame, labelKey: "heatRecovery" as const },
  { href: "/fleet", icon: Cpu, labelKey: "fleetControl" as const },
  { href: "/scada", icon: Database, labelKey: "scada" as const },
  { href: "/documents", icon: FileText, labelKey: "documents" as const },
  { href: "/alertes", icon: AlertTriangle, labelKey: "alerts" as const },
];

type SidebarVariant = "desktop" | "mobile";

interface SidebarProps {
  variant?: SidebarVariant;
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ variant = "desktop", onNavigate, className }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isMobileVariant = variant === "mobile";

  const handlePrefetch = (href: string) => {
    if (href === "/alertes") return;
    prefetchRouteData(href);
  };

  return (
    <aside
      className={cn(
        isMobileVariant
          ? "flex h-full w-full flex-col bg-sidebar text-sidebar-foreground"
          : "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border/70 bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      {/* Logo / Brand */}
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border/70",
          isMobileVariant ? "h-16 px-5" : "h-20 px-7"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <span
              className={cn(
                "block font-heading font-semibold uppercase tracking-[0.28em] text-primary",
                isMobileVariant ? "text-[0.68rem]" : "text-[0.72rem]"
              )}
            >
              Kilani Group
            </span>
            <span className="block text-sm text-sidebar-foreground/72">EnergyOS</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 space-y-2 px-4",
          isMobileVariant ? "overflow-y-auto py-5" : "py-6"
        )}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              onMouseEnter={() => handlePrefetch(item.href)}
              onFocus={() => handlePrefetch(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-full border border-transparent px-4 py-3 text-[0.8rem] font-medium uppercase tracking-[0.18em] transition-[color,background-color,border-color]",
                isActive
                  ? "border-primary/45 bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground/78 hover:border-primary/30 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t[item.labelKey]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "border-t border-sidebar-border/70",
          isMobileVariant ? "px-5 py-4" : "px-7 py-5"
        )}
      >
        <p className="text-xs uppercase tracking-[0.18em] text-sidebar-foreground/58">
          v1.0.0 — Adwya Plant
        </p>
      </div>
    </aside>
  );
}
