"use client";

import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { EnergyAssistant } from "./energy-assistant";
import { LanguageProvider } from "@/lib/language-context";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <TopBar />
        <main className="ml-64 min-h-screen bg-[linear-gradient(180deg,rgba(201,168,76,0.08),rgba(255,255,255,0)_18%),linear-gradient(180deg,#FFFFFF_0%,#F5F5F5_100%)] pt-20">
          <div className="mx-auto w-full max-w-[1520px] p-6 md:p-8 lg:p-10">
            {children}
          </div>
        </main>
        <EnergyAssistant />
      </div>
    </LanguageProvider>
  );
}
