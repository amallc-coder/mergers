"use client";

import { Activity } from "lucide-react";
import { AuthProvider, useAuth, type AdminUser } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";
import { TopNav } from "./TopNav";
import { DataProvider, LiveDataBanner } from "@/lib/data/DataProvider";

export function AppShell({
  initialUsers,
  overdueCount,
  children,
}: {
  initialUsers: AdminUser[];
  overdueCount: number;
  children: React.ReactNode;
}) {
  return (
    <AuthProvider initialUsers={initialUsers}>
      <Gate overdueCount={overdueCount}>{children}</Gate>
    </AuthProvider>
  );
}

function Gate({ overdueCount, children }: { overdueCount: number; children: React.ReactNode }) {
  const { hydrated, currentUser } = useAuth();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="flex items-center gap-2 text-ink-400">
          <Activity size={18} className="animate-pulse" />
          <span className="text-sm">Loading…</span>
        </span>
      </div>
    );
  }

  if (!currentUser) return <LoginScreen />;

  return (
    <DataProvider>
      <div className="flex min-h-screen flex-col">
        <TopNav overdueCount={overdueCount} />
        <LiveDataBanner />
        <main className="scrollbar-thin flex-1">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </DataProvider>
  );
}
