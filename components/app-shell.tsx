"use client";

import { ReactNode, useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { EnergyAssistant } from "./energy-assistant";
import { LanguageProvider } from "@/lib/language-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background">
        <Sidebar className="hidden md:flex" />
        <TopBar onMenuClick={() => setMobileOpen(true)} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[18rem] bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar variant="mobile" onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="ml-0 min-h-screen bg-[linear-gradient(180deg,rgba(201,168,76,0.08),rgba(255,255,255,0)_18%),linear-gradient(180deg,#FFFFFF_0%,#F5F5F5_100%)] pt-16 md:ml-64 md:pt-20">
          <div className="mx-auto w-full max-w-[1520px] p-4 md:p-8 lg:p-10">
            {children}
          </div>
        </main>
        <EnergyAssistant />
      </div>
    </LanguageProvider>
  );
}
