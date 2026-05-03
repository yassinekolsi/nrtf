"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Zap, 
  Settings2, 
  FileText, 
  AlertTriangle,
  Recycle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" as const },
  { href: "/energie", icon: Zap, labelKey: "energy" as const },
  { href: "/trigeneration", icon: Settings2, labelKey: "trigeneration" as const },
  { href: "/documents", icon: FileText, labelKey: "documents" as const },
  { href: "/alertes", icon: AlertTriangle, labelKey: "alerts" as const },
  { href: "/recovery", icon: Recycle, labelKey: "recovery" as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border/70 bg-sidebar text-sidebar-foreground">
      {/* Logo / Brand */}
      <div className="flex h-20 items-center border-b border-sidebar-border/70 px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <span className="block font-heading text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-primary">
              Kilani Group
            </span>
            <span className="block text-sm text-sidebar-foreground/72">EnergyOS</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-4 py-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
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
      <div className="border-t border-sidebar-border/70 px-7 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-sidebar-foreground/58">
          v1.0.0 — Adwya Plant
        </p>
      </div>
    </aside>
  );
}
