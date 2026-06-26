/** Shared formatting helpers for currency, percentages, counts, and dates. */

import type { MetricUnit } from "./domain/kpi-definitions";

export function formatUSD(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatMetricValue(
  value: number | string | null,
  unit: MetricUnit,
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  switch (unit) {
    case "USD":
      return formatUSD(value, { compact: true });
    case "percent":
      return formatPercent(value);
    case "ratio":
      return `${value.toFixed(2)}:1`;
    case "days":
      return `${Math.round(value)} days`;
    case "count":
      return formatNumber(value);
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso?: string, now = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = now.getTime() - then;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let phrase: string;
  if (mins < 60) phrase = `${mins}m`;
  else if (hours < 24) phrase = `${hours}h`;
  else phrase = `${days}d`;
  return future ? `in ${phrase}` : `${phrase} ago`;
}

export function confidencePct(c?: number): string {
  if (c === undefined) return "—";
  return `${Math.round(c * 100)}%`;
}
