/** UI helpers: className merge + status/risk/score color maps (earth palette). */

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

const GOOD = "bg-brand-100 text-brand-700 ring-brand-700/20";
const WARN = "bg-ochre-50 text-ochre-600 ring-ochre-500/25";
const BAD = "bg-rust-50 text-rust-600 ring-rust-500/25";
const NEUTRAL = "bg-ink-100 text-ink-600 ring-ink-400/25";
const INFO = "bg-brand-50 text-brand-700 ring-brand-600/20";

export const STATUS_STYLES: Record<DiligenceStatus, string> = {
  Received: GOOD,
  Pending: WARN,
  "Not Applicable": NEUTRAL,
  Denied: BAD,
};

export const REVIEW_STATUS_STYLES: Record<InternalReviewStatus, string> = {
  Uploaded: INFO,
  "Under Review": INFO,
  Accepted: GOOD,
  Rejected: BAD,
  "Needs Clarification": WARN,
  Overdue: BAD,
  "Internal Review Complete": GOOD,
};

export const RISK_STYLES: Record<RiskLevel, string> = {
  Low: GOOD,
  Moderate: WARN,
  Elevated: "bg-rust-50 text-rust-500 ring-rust-400/25",
  High: BAD,
};

export const DEAL_SCORE_STYLES: Record<DealHealthScore, string> = {
  Strong: GOOD,
  Moderate: "bg-brand-50 text-brand-600 ring-brand-500/20",
  "Needs Review": WARN,
  "High Risk": BAD,
  "Insufficient Data": NEUTRAL,
};

/** Completion-bar color by percentage (green → ochre → rust). */
export function progressColor(pct: number): string {
  if (pct >= 80) return "bg-brand-600";
  if (pct >= 50) return "bg-brand-400";
  if (pct >= 25) return "bg-ochre-400";
  return "bg-rust-400";
}
