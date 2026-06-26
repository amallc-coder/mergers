import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/domain/rbac";
import type { User } from "@/lib/domain/types";

export function Topbar({ user, overdueCount }: { user: User; overdueCount: number }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-white px-5">
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg bg-ink-50 px-3 py-1.5 text-sm text-ink-400">
        <Search size={16} />
        <span className="truncate">Search transactions, documents, KPIs…</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative text-ink-500" title={`${overdueCount} overdue items`}>
          <Bell size={20} />
          {overdueCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {overdueCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-ink-900">{user.name}</p>
            <p className="text-xs text-ink-400">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
