"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { ROLE_LABELS, type Permission } from "@/lib/domain/rbac";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/ui";

const NAV: { href: string; label: string; perm?: Permission }[] = [
  { href: "/", label: "Home" },
  { href: "/transactions", label: "Transactions", perm: "transaction:read" },
  { href: "/data-rooms", label: "Data Rooms", perm: "dataroom:read" },
  { href: "/diligence", label: "Diligence", perm: "diligence:read" },
  { href: "/kpis", label: "KPIs", perm: "kpi:read" },
  { href: "/tasks", label: "Tasks", perm: "transaction:read" },
  { href: "/calendar", label: "Calendar", perm: "transaction:read" },
  { href: "/contacts", label: "Contacts", perm: "transaction:read" },
  { href: "/reports", label: "Reports", perm: "ai_summary:read" },
  { href: "/admin", label: "Admin", perm: "user:manage" },
];

export function TopNav({ overdueCount }: { overdueCount: number }) {
  const pathname = usePathname();
  const { currentUser, can, logout } = useAuth();
  if (!currentUser) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const items = NAV.filter((n) => !n.perm || can(n.perm));

  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-panel">
      {/* Row 1: brand + status + account */}
      <div className="flex h-12 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700 text-canvas">
            <Activity size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">clinilytics</span>
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
            M&amp;A
          </span>
        </div>

        <div className="flex items-center gap-3">
          {overdueCount > 0 ? (
            <span className="hidden items-center gap-1 rounded border border-rust-200 bg-rust-50 px-2 py-1 text-[11px] font-medium text-rust-600 sm:inline-flex">
              <AlertTriangle size={12} /> {overdueCount} overdue
            </span>
          ) : null}
          <span className="hidden items-center gap-1.5 text-[11px] text-ink-500 md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Synced · seed
          </span>
          <div className="flex items-center gap-2">
            <Avatar name={currentUser.name} size={26} />
            <div className="hidden leading-tight sm:block">
              <p className="text-xs font-medium text-ink-900">{currentUser.name}</p>
              <p className="text-[10px] text-ink-400">{ROLE_LABELS[currentUser.role]}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-canvas px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100/50"
          >
            <LogOut size={13} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>

      {/* Row 2: main nav */}
      <nav className="scrollbar-thin flex h-11 items-center gap-1 overflow-x-auto border-t border-ink-200/70 px-3 sm:px-5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-xs font-medium leading-none transition-colors",
                active ? "bg-ink-900 text-canvas" : "text-ink-600 hover:bg-ink-100/60 hover:text-ink-900",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
