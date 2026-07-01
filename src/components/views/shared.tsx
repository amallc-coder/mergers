"use client";

import { Loader2, Cloud, Database, Lock } from "lucide-react";

/** Full-width loading row while the runtime snapshot is being fetched. */
export function ViewLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-12 text-ink-400">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

/** Small pill indicating whether the page is showing live, locked, or sample data. */
export function SourceBadge({ source }: { source: "seed" | "live" | "locked" }) {
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <Cloud size={13} /> Live data
      </span>
    );
  }
  if (source === "locked") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ochre-100 px-2.5 py-1 text-xs font-medium text-ochre-700">
        <Lock size={13} /> Locked — enter passcode
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">
      <Database size={13} /> Sample data
    </span>
  );
}

/** Canonical link to a transaction detail that works for seed + live ids on a
 * static export (query-param page, not a pre-rendered dynamic route). */
export function txHref(id: string): string {
  return `/transactions/detail?id=${encodeURIComponent(id)}`;
}
