"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FolderTree,
  ClipboardList,
  BarChart3,
  CheckSquare,
  Calendar,
  Users,
  FileText,
  Settings,
  ShieldCheck,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/ui";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Global Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Briefcase },
  { href: "/data-rooms", label: "Data Rooms", icon: FolderTree },
  { href: "/diligence", label: "Diligence Requests", icon: ClipboardList },
  { href: "/kpis", label: "KPI Dashboards", icon: BarChart3 },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-ink-100 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Activity size={18} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink-900">Mergers</p>
          <p className="text-[10px] uppercase tracking-wide text-ink-400">M&A Diligence</p>
        </div>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-100 px-5 py-3">
        <p className="text-[10px] text-ink-400">Phase 1 MVP · Seed data</p>
      </div>
    </aside>
  );
}
