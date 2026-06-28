/**
 * Analytics engine: completion stats, folder metadata roll-ups, missing-item
 * intelligence, and the AI deal-health score.
 *
 * All functions are pure (data in -> derived view out) so they can run on the
 * server with seed data today and against Supabase query results later. The
 * deal-score "explanations" mirror what the production LLM layer would phrase;
 * here they are computed deterministically from extracted metrics + completion.
 */

import { CATEGORY_META, CATEGORY_ORDER } from "./diligence-template";
import type {
  CategoryKey,
  CompletionStats,
  DealHealthAssessment,
  DealHealthFactor,
  DealHealthScore,
  DiligenceRequestItem,
  Document,
  ExtractedMetric,
  FolderMeta,
  MissingItemReport,
  RiskLevel,
  Transaction,
} from "./types";

export function isOverdue(item: DiligenceRequestItem, now = new Date()): boolean {
  if (item.status === "Received" || item.status === "Not Applicable") return false;
  if (!item.dueDate) return false;
  return new Date(item.dueDate).getTime() < now.getTime();
}

export function isUploadedNotReviewed(item: DiligenceRequestItem): boolean {
  return (
    item.documents.length > 0 &&
    item.internalReviewStatus !== "Internal Review Complete" &&
    item.internalReviewStatus !== "Accepted"
  );
}

export function computeCompletionStats(
  items: DiligenceRequestItem[],
  now = new Date(),
): CompletionStats {
  const stats: CompletionStats = {
    total: items.length,
    received: 0,
    pending: 0,
    notApplicable: 0,
    denied: 0,
    overdue: 0,
    uploadedNotReviewed: 0,
    internalReviewComplete: 0,
    completionPct: 0,
  };
  for (const item of items) {
    if (item.status === "Received") stats.received += 1;
    else if (item.status === "Pending") stats.pending += 1;
    else if (item.status === "Not Applicable") stats.notApplicable += 1;
    else if (item.status === "Denied") stats.denied += 1;
    if (isOverdue(item, now)) stats.overdue += 1;
    if (isUploadedNotReviewed(item)) stats.uploadedNotReviewed += 1;
    if (item.internalReviewStatus === "Internal Review Complete") stats.internalReviewComplete += 1;
  }
  const denominator = stats.total - stats.denied;
  stats.completionPct =
    denominator > 0 ? Math.round(((stats.received + stats.notApplicable) / denominator) * 100) : 0;
  return stats;
}

/** Completion stats filtered to a needed-timeline bucket. */
export function completionForTimeline(
  items: DiligenceRequestItem[],
  timeline: "Pre Signing" | "Post Signing",
  now = new Date(),
): CompletionStats {
  return computeCompletionStats(
    items.filter((i) => i.neededTimeline === timeline),
    now,
  );
}

export function buildFolderMeta(
  items: DiligenceRequestItem[],
  documents: Document[],
  now = new Date(),
): FolderMeta[] {
  return CATEGORY_ORDER.map((category) => {
    const meta = CATEGORY_META[category];
    const catItems = items.filter((i) => i.category === category);
    const catDocs = documents.filter((d) => d.category === category);
    const lastUpload = catDocs
      .map((d) => d.uploadedAt)
      .sort()
      .at(-1);
    const folder: FolderMeta = {
      category,
      folderName: meta.folderName,
      preSigningCount: catItems.filter((i) => i.neededTimeline === "Pre Signing").length,
      postSigningCount: catItems.filter((i) => i.neededTimeline === "Post Signing").length,
      receivedCount: catItems.filter((i) => i.status === "Received").length,
      pendingCount: catItems.filter((i) => i.status === "Pending").length,
      notApplicableCount: catItems.filter((i) => i.status === "Not Applicable").length,
      deniedCount: catItems.filter((i) => i.status === "Denied").length,
      overdueCount: catItems.filter((i) => isOverdue(i, now)).length,
      lastUploadDate: lastUpload,
      sharePointSyncStatus: catDocs.some((d) => d.sharePointSyncStatus === "error")
        ? "error"
        : catDocs.some((d) => d.sharePointSyncStatus === "pending")
          ? "pending"
          : catDocs.length > 0
            ? "synced"
            : "not_connected",
    };
    return folder;
  });
}

// ─────────────────────── Missing-item intelligence ───────────────────────

export function buildMissingItemReport(
  items: DiligenceRequestItem[],
  documents: Document[],
  now = new Date(),
): MissingItemReport {
  const pre = items.filter((i) => i.neededTimeline === "Pre Signing");
  const post = items.filter((i) => i.neededTimeline === "Post Signing");

  const pendingPreSigning = pre.filter((i) => i.status === "Pending");
  const criticalPreSigningGaps = pendingPreSigning.filter((i) => i.criticalPreSigning);
  const report: MissingItemReport = {
    receivedPreSigning: pre.filter((i) => i.status === "Received"),
    pendingPreSigning,
    criticalPreSigningGaps,
    postSigningGaps: post.filter((i) => i.status === "Pending"),
    overdue: items.filter((i) => isOverdue(i, now)),
    notApplicable: items.filter((i) => i.status === "Not Applicable"),
    denied: items.filter((i) => i.status === "Denied"),
    uploadedNotMatched: documents.filter((d) => !d.requestItemId),
    duplicates: documents.filter((d) => d.aiFlags?.includes("duplicate")),
    outdated: documents.filter((d) => d.aiFlags?.includes("outdated")),
    lowConfidence: documents.filter(
      (d) => d.aiFlags?.includes("low_confidence") || (d.aiConfidence ?? 1) < 0.6,
    ),
    needsClarification: items.filter((i) => i.internalReviewStatus === "Needs Clarification"),
    narrative: "",
  };

  report.narrative = composeMissingNarrative(report);
  return report;
}

function composeMissingNarrative(r: MissingItemReport): string {
  const parts: string[] = [];
  if (r.criticalPreSigningGaps.length > 0) {
    const names = r.criticalPreSigningGaps.slice(0, 3).map((i) => i.name);
    parts.push(
      `${r.criticalPreSigningGaps.length} critical pre-signing item(s) are still missing — most notably ${names.join(
        ", ",
      )}. These should be prioritized before valuation review.`,
    );
  }
  if (r.overdue.length > 0) {
    parts.push(`${r.overdue.length} request(s) are overdue and warrant a reminder or escalation.`);
  }
  if (r.uploadedNotMatched.length > 0) {
    parts.push(
      `${r.uploadedNotMatched.length} uploaded file(s) are not yet matched to a request item and sit in the review queue.`,
    );
  }
  if (r.lowConfidence.length > 0) {
    parts.push(`${r.lowConfidence.length} document(s) were classified with low confidence and need human review.`);
  }
  if (parts.length === 0) {
    parts.push("No critical pre-signing gaps detected. Pre-signing diligence is on track.");
  }
  return parts.join(" ");
}

// ─────────────────────── Deal-health scoring ───────────────────────

interface MetricLookup {
  num(key: string): number | undefined;
  has(key: string): boolean;
  citation(key: string): string | undefined;
}

// ─────────────────────── KPI anomaly detection ───────────────────────

export interface KpiAnomaly {
  metricKey: string;
  label: string;
  value?: number;
  severity: "warn" | "info";
  /** What looks off about the figure. */
  message: string;
  /** A ready-to-send clarification question for the seller. */
  suggestedQuestion: string;
  /** The diligence category the clarification task should file under. */
  category: CategoryKey;
}

/**
 * Compare the extracted KPIs to market-expected bands and surface the ones that
 * look off — so the team can dig in and raise a clarification with the seller.
 * Pure: metrics in → anomalies out. Bands mirror the deal-score benchmarks.
 */
export function detectKpiAnomalies(metrics: ExtractedMetric[]): KpiAnomaly[] {
  const ml = metricLookup(metrics);
  const out: KpiAnomaly[] = [];

  const payroll = ml.num("payroll_pct_revenue");
  if (payroll !== undefined) {
    if (payroll < 15)
      out.push({
        metricKey: "payroll_pct_revenue", label: "Payroll % of revenue", value: payroll, severity: "warn",
        category: "finance_accounting",
        message: `Payroll is only ${payroll}% of revenue — well below the ~25–40% typical for a clinical practice. The figure is likely partial (one period, or owner/contractor comp excluded).`,
        suggestedQuestion: "Our records show total payroll at an unusually low share of revenue. Could you confirm the full annual payroll cost, including owner/physician compensation and any contracted (1099) clinical staff? A full-year payroll register or W-3 summary would help us reconcile.",
      });
    else if (payroll > 55)
      out.push({
        metricKey: "payroll_pct_revenue", label: "Payroll % of revenue", value: payroll, severity: "warn",
        category: "finance_accounting",
        message: `Payroll is ${payroll}% of revenue — above the typical range; verify whether owner compensation or one-time amounts are included.`,
        suggestedQuestion: "Payroll appears high as a share of revenue. Could you break down total compensation by owner vs. staff, and flag any one-time bonuses or accruals included in the period?",
      });
  }

  const daysAr = ml.num("days_in_ar");
  if (daysAr !== undefined && daysAr > 60)
    out.push({
      metricKey: "days_in_ar", label: "Days in AR", value: daysAr, severity: "warn",
      category: "revenue_cycle_billing",
      message: `Days in AR is ${Math.round(daysAr)} — above the ~35-day healthy mark, suggesting slow collections or aged balances.`,
      suggestedQuestion: "Days in AR looks elevated. Could you share a current AR aging by bucket (0–30 / 31–60 / 61–90 / 90+) and note any large or disputed balances?",
    });

  const denial = ml.num("denial_rate");
  if (denial !== undefined && denial > 12)
    out.push({
      metricKey: "denial_rate", label: "Denial rate", value: denial, severity: "warn",
      category: "revenue_cycle_billing",
      message: `Denial rate is ${denial}% — above the ~5% healthy mark.`,
      suggestedQuestion: "The denial rate looks high. Could you share the top denial reasons (CARC/RARC) and your current rework/appeals process?",
    });

  const margin = ml.num("ebitda_margin");
  if (margin !== undefined) {
    if (margin < 5)
      out.push({
        metricKey: "ebitda_margin", label: "EBITDA margin", value: margin, severity: "warn",
        category: "finance_accounting",
        message: `EBITDA margin is ${margin}% — thin. Confirm whether add-backs (owner comp normalization, one-time costs) have been applied.`,
        suggestedQuestion: "We calculate a thin EBITDA margin. Could you provide an adjusted EBITDA bridge with add-backs (owner compensation normalization, one-time / non-recurring items)?",
      });
    else if (margin > 45)
      out.push({
        metricKey: "ebitda_margin", label: "EBITDA margin", value: margin, severity: "info",
        category: "finance_accounting",
        message: `EBITDA margin is ${margin}% — unusually high; verify the figure is operating EBITDA, not gross profit.`,
        suggestedQuestion: "The EBITDA margin we calculated is unusually high. Could you confirm the EBITDA figure is after all operating expenses (not gross profit) and share the supporting P&L?",
      });
  }

  return out;
}

export function metricLookup(metrics: ExtractedMetric[]): MetricLookup {
  // Prefer human-reviewed values over AI values for the same key.
  const byKey = new Map<string, ExtractedMetric>();
  for (const m of metrics) {
    const existing = byKey.get(m.metricKey);
    if (!existing || (existing.source === "ai" && m.source === "human")) {
      byKey.set(m.metricKey, m);
    }
  }
  return {
    num(key) {
      const m = byKey.get(key);
      if (!m || typeof m.metricValue !== "number") return undefined;
      return m.metricValue;
    },
    has(key) {
      return byKey.has(key);
    },
    citation(key) {
      const m = byKey.get(key);
      return m?.sourceDocumentName;
    },
  };
}

/** Map a value to a 0..1 quality where higher input is better, with banded thresholds. */
function bandHigher(value: number, weak: number, strong: number): number {
  if (value <= weak) return 0.15;
  if (value >= strong) return 1;
  return 0.15 + (0.85 * (value - weak)) / (strong - weak);
}

/** Map a value to a 0..1 quality where lower input is better. */
function bandLower(value: number, strong: number, weak: number): number {
  if (value <= strong) return 1;
  if (value >= weak) return 0.15;
  return 1 - (0.85 * (value - strong)) / (weak - strong);
}

export function assessDealHealth(
  transaction: Transaction,
  items: DiligenceRequestItem[],
  metrics: ExtractedMetric[],
  now = new Date(),
): DealHealthAssessment {
  const ml = metricLookup(metrics);
  const preStats = completionForTimeline(items, "Pre Signing", now);
  const allStats = computeCompletionStats(items, now);
  const factors: DealHealthFactor[] = [];

  const add = (
    label: string,
    weight: number,
    quality: number,
    detail: string,
    citations?: string[],
  ) => {
    factors.push({
      label,
      weight,
      contribution: Math.round(quality * 100),
      detail,
      citations,
    });
  };

  // Completion factors
  add(
    "Pre-signing completion",
    20,
    preStats.completionPct / 100,
    `${preStats.completionPct}% of pre-signing items received (${preStats.received}/${preStats.total}).`,
  );
  add(
    "Data room completion",
    8,
    allStats.completionPct / 100,
    `${allStats.completionPct}% of all diligence items received or marked N/A.`,
  );

  // Financial factors
  const ebitdaMargin = ml.num("ebitda_margin");
  if (ebitdaMargin !== undefined) {
    add(
      "EBITDA margin",
      15,
      bandHigher(ebitdaMargin, 8, 22),
      `EBITDA margin of ${ebitdaMargin}% (strong ≥ 22%, weak ≤ 8%).`,
      cit(ml, "ebitda_margin"),
    );
  }
  const yoy = ml.num("yoy_revenue_growth");
  if (yoy !== undefined) {
    add(
      "Revenue growth",
      8,
      bandHigher(yoy, -5, 10),
      `Year-over-year revenue growth of ${yoy}%.`,
      cit(ml, "yoy_revenue_growth"),
    );
  }
  const payrollPct = ml.num("payroll_pct_revenue");
  if (payrollPct !== undefined) {
    add(
      "Payroll ratio",
      8,
      bandLower(payrollPct, 30, 45),
      `Payroll is ${payrollPct}% of revenue (healthy ≤ 30%, elevated ≥ 45%).`,
      cit(ml, "payroll_pct_revenue"),
    );
  }

  // Revenue-cycle factors
  const daysInAr = ml.num("days_in_ar");
  if (daysInAr !== undefined) {
    add(
      "AR health (days in AR)",
      8,
      bandLower(daysInAr, 35, 65),
      `${daysInAr} days in AR (healthy ≤ 35, concerning ≥ 65).`,
      cit(ml, "days_in_ar"),
    );
  }
  const denialRate = ml.num("denial_rate");
  if (denialRate !== undefined) {
    add(
      "Denial trends",
      6,
      bandLower(denialRate, 5, 12),
      `Denial rate of ${denialRate}% (healthy ≤ 5%, concerning ≥ 12%).`,
      cit(ml, "denial_rate"),
    );
  }

  // Concentration factors
  const topPayer = ml.num("payer_mix"); // stored as the largest single-payer share %
  if (topPayer !== undefined) {
    add(
      "Payer concentration",
      5,
      bandLower(topPayer, 35, 60),
      `Largest payer represents ${topPayer}% of mix (diversified ≤ 35%, concentrated ≥ 60%).`,
      cit(ml, "payer_mix"),
    );
  }

  // Compliance / legal / credentialing completeness via category completion
  const legalStats = computeCompletionStats(
    items.filter((i) => i.category === "legal_contracts_business"),
    now,
  );
  add(
    "Legal / compliance completeness",
    5,
    legalStats.completionPct / 100,
    `${legalStats.completionPct}% of legal/compliance items received.`,
  );
  const credStats = computeCompletionStats(
    items.filter((i) => i.category === "providers_credentialing"),
    now,
  );
  add(
    "Credentialing readiness",
    4,
    credStats.completionPct / 100,
    `${credStats.completionPct}% of provider/credentialing items received.`,
  );

  // Critical-gap penalty factor
  const criticalGaps = items.filter(
    (i) => i.criticalPreSigning && i.neededTimeline === "Pre Signing" && i.status === "Pending",
  ).length;
  add(
    "Critical pre-signing gaps",
    9,
    criticalGaps === 0 ? 1 : Math.max(0.1, 1 - criticalGaps * 0.2),
    criticalGaps === 0
      ? "No critical pre-signing documents are missing."
      : `${criticalGaps} critical pre-signing document(s) still missing.`,
  );

  // Aggregate
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const numericScore = Math.round(
    factors.reduce((s, f) => s + (f.weight * f.contribution) / 100, 0) / totalWeight * 100,
  );

  // Insufficient-data guard
  const financialMetricsPresent = ["ebitda_margin", "net_revenue_fy", "t12_revenue"].filter((k) =>
    ml.has(k),
  ).length;
  let score: DealHealthScore;
  if (preStats.completionPct < 15 && financialMetricsPresent < 2) {
    score = "Insufficient Data";
  } else if (numericScore >= 80) score = "Strong";
  else if (numericScore >= 65) score = "Moderate";
  else if (numericScore >= 50) score = "Needs Review";
  else score = "High Risk";

  const riskLevel: RiskLevel =
    score === "Strong"
      ? "Low"
      : score === "Moderate"
        ? "Moderate"
        : score === "Needs Review"
          ? "Elevated"
          : "High";

  return {
    score,
    numericScore,
    riskLevel,
    rationale: composeScoreRationale(score, numericScore, factors, criticalGaps),
    factors: factors.sort((a, b) => b.weight - a.weight),
  };
}

function cit(ml: MetricLookup, key: string): string[] | undefined {
  const c = ml.citation(key);
  return c ? [c] : undefined;
}

function composeScoreRationale(
  score: DealHealthScore,
  numeric: number,
  factors: DealHealthFactor[],
  criticalGaps: number,
): string {
  if (score === "Insufficient Data") {
    return "Not enough financial documentation and pre-signing completion to score the deal reliably. Prioritize the consolidated and unit-level P&Ls and the core revenue-cycle reports.";
  }
  const strengths = factors
    .filter((f) => f.contribution >= 70)
    .slice(0, 2)
    .map((f) => f.label.toLowerCase());
  const weaknesses = factors
    .filter((f) => f.contribution < 50)
    .slice(0, 2)
    .map((f) => f.label.toLowerCase());
  let s = `Overall health scores ${numeric}/100 (${score}).`;
  if (strengths.length) s += ` Supported by ${strengths.join(" and ")}.`;
  if (weaknesses.length) s += ` Held back by ${weaknesses.join(" and ")}.`;
  if (criticalGaps > 0)
    s += ` ${criticalGaps} critical pre-signing document(s) remain outstanding and should be requested next.`;
  return s;
}
