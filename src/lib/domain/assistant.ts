/**
 * AI Assistant — internal healthcare M&A analyst.
 *
 * Production: RAG over the transaction's documents only, via the LLM layer with
 * citations and anti-hallucination guardrails (see /docs/08-ai-architecture-plan.md).
 *
 * This MVP implementation answers from the structured extracted metrics and
 * diligence state deterministically. It strictly follows the same rules:
 *   • Never invent data — if a metric is missing, it says so.
 *   • Always cite the source document for a number.
 *   • Reports the confidence score of the underlying extraction.
 *   • Uses healthcare acquisition terminology.
 */

import { formatMetricValue } from "../format";
import { buildMissingItemReport, completionForTimeline, metricLookup } from "./analytics";
import { kpiByKey } from "./kpi-definitions";
import type {
  DiligenceRequestItem,
  Document,
  ExtractedMetric,
  Transaction,
} from "./types";

export interface AssistantAnswer {
  question: string;
  answer: string;
  citations: { document: string; page?: number }[];
  confidence?: number;
  missingData: boolean;
}

export const SUGGESTED_QUESTIONS = [
  "What is the T12 revenue?",
  "What is EBITDA?",
  "What is adjusted EBITDA?",
  "What documents are missing before signing?",
  "What post-signing items are still pending?",
  "What is the AR aging by payer?",
  "What is the payer mix?",
  "How many patients are in the EMR?",
  "What is the total visit volume by month?",
  "How many employees does the practice have?",
  "What is payroll as a percentage of revenue?",
  "What are the biggest risks?",
  "What documents support the revenue number?",
  "What should we request next?",
  "Which items are denied or not applicable?",
  "What items are overdue?",
  "Summarize the transaction for leadership.",
];

interface AssistantContext {
  transaction: Transaction;
  items: DiligenceRequestItem[];
  documents: Document[];
  metrics: ExtractedMetric[];
  riskNarrative?: string;
}

/** Keyword -> metric key intents for direct metric questions. */
const METRIC_INTENTS: { match: RegExp; key: string }[] = [
  { match: /t12|trailing 12|ttm revenue/i, key: "t12_revenue" },
  { match: /adjusted ebitda/i, key: "adjusted_ebitda" },
  { match: /ebitda margin/i, key: "ebitda_margin" },
  { match: /ebitda/i, key: "ebitda" },
  { match: /net revenue/i, key: "net_revenue_fy" },
  { match: /gross revenue/i, key: "gross_revenue_fy" },
  { match: /payroll.*(percent|%|ratio|of revenue)/i, key: "payroll_pct_revenue" },
  { match: /payroll/i, key: "payroll_expense" },
  { match: /days in ar/i, key: "days_in_ar" },
  { match: /total ar|accounts receivable/i, key: "total_ar" },
  { match: /denial/i, key: "denial_rate" },
  { match: /payer mix|payor mix/i, key: "payer_mix" },
  { match: /collection rate/i, key: "collection_rate" },
  { match: /net collection/i, key: "net_collection_ratio" },
  { match: /patients in (the )?emr|total patients/i, key: "total_patients_emr" },
  { match: /active patient/i, key: "active_patient_count" },
  { match: /visit volume|visits by month|monthly visit/i, key: "monthly_visit_volume" },
  { match: /annual visit/i, key: "annual_visit_volume" },
  { match: /how many employees|employee count|total employees/i, key: "total_employees" },
  { match: /how many providers|provider count/i, key: "total_providers" },
];

export function answerQuestion(q: string, ctx: AssistantContext, now = new Date()): AssistantAnswer {
  const ml = metricLookup(ctx.metrics);
  const byKey = new Map(ctx.metrics.map((m) => [m.metricKey, m] as const));

  // Intent: missing pre-signing documents
  if (/missing.*(sign|before signing)|what.*missing/i.test(q)) {
    const missing = buildMissingItemReport(ctx.items, ctx.documents, now);
    const lines = [
      ...missing.criticalPreSigningGaps.map((i) => `• ${i.name} (critical pre-signing)`),
      ...missing.pendingPreSigning.filter((i) => !i.criticalPreSigning).map((i) => `• ${i.name}`),
    ];
    return {
      question: q,
      answer: lines.length
        ? `The following pre-signing items are still outstanding:\n${lines.join("\n")}`
        : "All pre-signing diligence items have been received.",
      citations: [],
      missingData: lines.length > 0,
    };
  }

  // Intent: post-signing pending
  if (/post.?sign/i.test(q)) {
    const post = ctx.items.filter((i) => i.neededTimeline === "Post Signing" && i.status === "Pending");
    return {
      question: q,
      answer: post.length
        ? `${post.length} post-signing item(s) are still pending:\n${post.map((i) => `• ${i.name}`).join("\n")}`
        : "No post-signing items are pending.",
      citations: [],
      missingData: post.length > 0,
    };
  }

  // Intent: overdue
  if (/overdue/i.test(q)) {
    const missing = buildMissingItemReport(ctx.items, ctx.documents, now);
    return {
      question: q,
      answer: missing.overdue.length
        ? `${missing.overdue.length} item(s) are overdue:\n${missing.overdue.map((i) => `• ${i.name}`).join("\n")}`
        : "Nothing is overdue right now.",
      citations: [],
      missingData: missing.overdue.length > 0,
    };
  }

  // Intent: denied / not applicable
  if (/denied|not applicable|n\/?a\b/i.test(q)) {
    const denied = ctx.items.filter((i) => i.status === "Denied");
    const na = ctx.items.filter((i) => i.status === "Not Applicable");
    return {
      question: q,
      answer:
        `Denied: ${denied.length ? denied.map((i) => i.name).join(", ") : "none"}.\n` +
        `Not applicable: ${na.length ? na.map((i) => i.name).join(", ") : "none"}.`,
      citations: [],
      missingData: false,
    };
  }

  // Intent: what should we request next
  if (/request next|what should we request|next step/i.test(q)) {
    const missing = buildMissingItemReport(ctx.items, ctx.documents, now);
    const targets = missing.criticalPreSigningGaps.length
      ? missing.criticalPreSigningGaps
      : missing.pendingPreSigning;
    return {
      question: q,
      answer: targets.length
        ? `Prioritize requesting: ${targets.slice(0, 4).map((i) => i.name).join(", ")}. These are the highest-leverage pre-signing gaps.`
        : "All critical pre-signing items are in. Move to financial and operational deep-dive review.",
      citations: [],
      missingData: targets.length > 0,
    };
  }

  // Intent: biggest risks
  if (/risk/i.test(q)) {
    return {
      question: q,
      answer: ctx.riskNarrative || "No material risks detected from the current data set.",
      citations: [],
      missingData: false,
    };
  }

  // Intent: documents supporting revenue
  if (/support.*(revenue|number)|which document/i.test(q)) {
    const revMetric = byKey.get("t12_revenue") || byKey.get("net_revenue_fy");
    return {
      question: q,
      answer: revMetric?.sourceDocumentName
        ? `The revenue figure (${formatMetricValue(revMetric.metricValue, "USD")}) is sourced from "${revMetric.sourceDocumentName}"${
            revMetric.sourcePage ? `, page ${revMetric.sourcePage}` : ""
          }, extracted with ${Math.round(revMetric.confidenceScore * 100)}% confidence.`
        : "No revenue figure has been extracted yet — the consolidated P&L is still outstanding.",
      citations: revMetric?.sourceDocumentName
        ? [{ document: revMetric.sourceDocumentName, page: revMetric.sourcePage }]
        : [],
      confidence: revMetric?.confidenceScore,
      missingData: !revMetric,
    };
  }

  // Intent: leadership summary
  if (/summar/i.test(q)) {
    const preStats = completionForTimeline(ctx.items, "Pre Signing", now);
    const t12 = byKey.get("t12_revenue");
    const ebitda = byKey.get("ebitda");
    const bits = [
      `${ctx.transaction.practiceName} — ${ctx.transaction.specialty}, ${ctx.transaction.locationsCount} location(s), ${ctx.transaction.providersCount} provider(s).`,
      t12 ? `T12 revenue ${formatMetricValue(t12.metricValue, "USD")}.` : "T12 revenue not yet available.",
      ebitda ? `EBITDA ${formatMetricValue(ebitda.metricValue, "USD")}.` : "EBITDA pending.",
      `Pre-signing completion ${preStats.completionPct}%.`,
    ];
    return { question: q, answer: bits.join(" "), citations: [], missingData: !t12 || !ebitda };
  }

  // Direct metric intents
  for (const intent of METRIC_INTENTS) {
    if (intent.match.test(q)) {
      const m = byKey.get(intent.key);
      const def = kpiByKey(intent.key);
      if (!m) {
        return {
          question: q,
          answer: `That metric (${def?.name ?? intent.key}) has not been extracted yet. The supporting document is still outstanding — it is surfaced as a gap in the missing-document tracker.`,
          citations: [],
          missingData: true,
        };
      }
      const valueStr = formatMetricValue(m.metricValue, def?.unit ?? "text");
      const reviewNote = m.requiresHumanReview ? " This extraction is flagged for human review." : "";
      return {
        question: q,
        answer:
          `${def?.name ?? m.metricName} for ${m.period} is ${valueStr}` +
          (m.sourceDocumentName
            ? `, per "${m.sourceDocumentName}"${m.sourcePage ? ` (p.${m.sourcePage})` : ""}`
            : "") +
          `.${reviewNote}`,
        citations: m.sourceDocumentName ? [{ document: m.sourceDocumentName, page: m.sourcePage }] : [],
        confidence: m.confidenceScore,
        missingData: false,
      };
    }
  }

  // Fallback
  return {
    question: q,
    answer:
      "I can answer from the extracted diligence data — try asking about T12 revenue, EBITDA, AR, payer mix, patient counts, staffing, missing pre-signing items, overdue items, or for a leadership summary. I only answer from documents that have been uploaded and extracted, and I cite the source.",
    citations: [],
    missingData: false,
  };
}
