/** UI helpers: className merge + status/risk/score color maps. */

import clsx, { type ClassValue } from "clsx";
import type {
  DealHealthScore,
  DiligenceStatus,
  InternalReviewStatus,
  RiskLevel,
} from "./domain/types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export const STATUS_STYLES: Record<DiligenceStatus, string> = {
  Received: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "Not Applicable": "bg-ink-100 text-ink-600 ring-ink-500/20",
  Denied: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export const REVIEW_STATUS_STYLES: Record<InternalReviewStatus, string> = {
  Uploaded: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "Under Review": "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  "Needs Clarification": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Overdue: "bg-rose-50 text-rose-700 ring-rose-600/20",
  "Internal Review Complete": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export const RISK_STYLES: Record<RiskLevel, string> = {
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Moderate: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Elevated: "bg-orange-50 text-orange-700 ring-orange-600/20",
  High: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export const DEAL_SCORE_STYLES: Record<DealHealthScore, string> = {
  Strong: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Moderate: "bg-lime-50 text-lime-700 ring-lime-600/20",
  "Needs Review": "bg-amber-50 text-amber-700 ring-amber-600/20",
  "High Risk": "bg-rose-50 text-rose-700 ring-rose-600/20",
  "Insufficient Data": "bg-ink-100 text-ink-600 ring-ink-500/20",
};

/** Completion-bar color by percentage. */
export function progressColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  if (pct >= 25) return "bg-orange-500";
  return "bg-rose-500";
}
