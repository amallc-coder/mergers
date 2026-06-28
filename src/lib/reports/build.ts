/** Build a format-neutral ReportDoc for each catalog report from a decorated
 *  transaction view. Exporters then render it to PDF / Excel / Word / PPTX. */

import type { TransactionView } from "../selectors";
import type { CategoryKey, DiligenceRequestItem } from "../domain/types";
import { CATEGORY_META } from "../domain/diligence-template";
import { metricLookup } from "../domain/analytics";
import { formatDate, formatPercent, formatUSD } from "../format";
import type { ReportDoc, ReportSection } from "./types";

export interface ReportDef {
  key: string;
  label: string;
}

export const REPORT_CATALOG: ReportDef[] = [
  { key: "executive_summary", label: "Executive transaction summary" },
  { key: "diligence_completion", label: "Diligence completion report" },
  { key: "missing_documents", label: "Missing document report" },
  { key: "pre_signing_readiness", label: "Pre-signing readiness report" },
  { key: "post_signing_transition", label: "Post-signing transition report" },
  { key: "kpi_dashboard", label: "KPI dashboard report" },
  { key: "financial_summary", label: "Financial diligence summary" },
  { key: "revenue_cycle_summary", label: "Revenue cycle diligence summary" },
  { key: "hr_summary", label: "HR diligence summary" },
  { key: "legal_summary", label: "Legal / compliance summary" },
  { key: "risk_report", label: "Risk report" },
  { key: "investment_committee", label: "Investment committee summary" },
];

const itemsTable = (items: DiligenceRequestItem[]) => ({
  columns: ["Item", "Category", "Timeline", "Status", "Due"],
  rows: items.map((i) => [
    i.name,
    CATEGORY_META[i.category]?.label ?? i.category,
    i.neededTimeline,
    i.status,
    i.dueDate ? formatDate(i.dueDate) : "—",
  ]),
});

const foldersTable = (view: TransactionView) => ({
  columns: ["Category", "Received", "Pending", "Overdue", "Last upload"],
  rows: view.folders.map((f) => [
    f.folderName,
    f.receivedCount,
    f.pendingCount,
    f.overdueCount,
    f.lastUploadDate ? formatDate(f.lastUploadDate) : "—",
  ]),
});

function categoryMetricsSection(view: TransactionView, category: CategoryKey, heading: string): ReportSection {
  const ms = view.metrics.filter((m) => m.category === category);
  const items = view.requestItems.filter((i) => i.category === category);
  return {
    heading,
    paragraphs: [
      `${items.filter((i) => i.status === "Received").length} of ${items.length} requested items received in this category.`,
    ],
    table: ms.length
      ? {
          columns: ["Metric", "Value", "Period", "Source"],
          rows: ms.map((m) => [
            m.metricName,
            m.metricValue === null ? "—" : String(m.metricValue) + (m.metricUnit ? ` ${m.metricUnit}` : ""),
            m.period ?? "—",
            m.sourceDocumentName ?? "—",
          ]),
        }
      : itemsTable(items),
  };
}

export function buildReport(key: string, view: TransactionView): ReportDoc {
  const tx = view.transaction;
  const base = {
    generatedAt: new Date().toISOString(),
    meta: [
      { label: "Target", value: tx.practiceName },
      { label: "Stage", value: tx.stage },
      { label: "Deal health", value: `${view.deal.score} (${view.deal.numericScore}/100)` },
      { label: "Risk level", value: tx.riskLevel },
      { label: "Pre-signing complete", value: formatPercent(view.preStats.completionPct) },
    ],
  };
  const ml = metricLookup(view.metrics);
  const money = (k: string) => {
    const v = ml.num(k);
    return v === undefined ? "—" : formatUSD(v, { compact: true });
  };
  const pct = (k: string) => {
    const v = ml.num(k);
    return v === undefined ? "—" : formatPercent(v);
  };

  switch (key) {
    case "executive_summary":
    case "investment_committee": {
      const es = view.execSummary;
      return {
        ...base,
        title: key === "investment_committee" ? "Investment Committee Summary" : "Executive Transaction Summary",
        subtitle: tx.practiceName,
        sections: [
          { heading: "Practice overview", paragraphs: [es.practiceOverview] },
          ...es.sections.map((s) => ({ heading: s.heading, paragraphs: [s.body] })),
          { heading: "Key risks", paragraphs: es.riskFlags.length ? es.riskFlags : ["No material risks flagged from available data."] },
          { heading: "Opportunities", paragraphs: es.opportunities.length ? es.opportunities : ["—"] },
          { heading: "Recommended next steps", paragraphs: es.recommendedNextSteps },
          { heading: "Diligence completion by category", table: foldersTable(view) },
        ],
      };
    }
    case "diligence_completion":
      return {
        ...base,
        title: "Diligence Completion Report",
        subtitle: tx.practiceName,
        sections: [
          {
            heading: "Summary",
            paragraphs: [
              `Overall completion is ${formatPercent(view.allStats.completionPct)} (${view.allStats.received} received, ${view.allStats.pending} pending of ${view.allStats.total} items).`,
              `Pre-signing ${formatPercent(view.preStats.completionPct)}; post-signing ${formatPercent(view.postStats.completionPct)}.`,
            ],
          },
          { heading: "Completion by category", table: foldersTable(view) },
        ],
      };
    case "missing_documents":
      return {
        ...base,
        title: "Missing Document Report",
        subtitle: tx.practiceName,
        sections: [
          { heading: "Critical pre-signing gaps", table: itemsTable(view.missing.criticalPreSigningGaps) },
          { heading: "All pending pre-signing items", table: itemsTable(view.missing.pendingPreSigning) },
          { heading: "Pending post-signing items", table: itemsTable(view.missing.postSigningGaps) },
        ],
      };
    case "pre_signing_readiness":
      return {
        ...base,
        title: "Pre-Signing Readiness Report",
        subtitle: tx.practiceName,
        sections: [
          {
            heading: "Readiness",
            paragraphs: [
              `Pre-signing diligence is ${formatPercent(view.preStats.completionPct)} complete with ${view.missing.criticalPreSigningGaps.length} critical gap(s) outstanding.`,
              view.missing.narrative,
            ],
          },
          { heading: "Critical gaps", table: itemsTable(view.missing.criticalPreSigningGaps) },
        ],
      };
    case "post_signing_transition":
      return {
        ...base,
        title: "Post-Signing Transition Report",
        subtitle: tx.practiceName,
        sections: [
          {
            heading: "Transition status",
            paragraphs: [`Post-signing items are ${formatPercent(view.postStats.completionPct)} complete.`],
          },
          { heading: "Outstanding post-signing items", table: itemsTable(view.missing.postSigningGaps) },
        ],
      };
    case "kpi_dashboard":
    case "financial_summary":
      return {
        ...base,
        title: key === "kpi_dashboard" ? "KPI Dashboard Report" : "Financial Diligence Summary",
        subtitle: tx.practiceName,
        sections: [
          {
            heading: "Headline KPIs",
            table: {
              columns: ["Metric", "Value"],
              rows: [
                ["T12 revenue", money("t12_revenue")],
                ["EBITDA", money("ebitda")],
                ["EBITDA margin", pct("ebitda_margin")],
                ["Payroll % of revenue", pct("payroll_pct_revenue")],
                ["Days in AR", ml.num("days_in_ar") !== undefined ? `${Math.round(ml.num("days_in_ar")!)}d` : "—"],
                ["Denial rate", pct("denial_rate")],
              ],
            },
          },
          categoryMetricsSection(view, "finance_accounting", "Finance & accounting detail"),
        ],
      };
    case "revenue_cycle_summary":
      return { ...base, title: "Revenue Cycle Diligence Summary", subtitle: tx.practiceName, sections: [categoryMetricsSection(view, "revenue_cycle_billing", "Revenue cycle & billing")] };
    case "hr_summary":
      return { ...base, title: "HR Diligence Summary", subtitle: tx.practiceName, sections: [categoryMetricsSection(view, "hr_payroll", "HR & payroll")] };
    case "legal_summary":
      return { ...base, title: "Legal / Compliance Summary", subtitle: tx.practiceName, sections: [categoryMetricsSection(view, "legal_contracts_business", "Legal, contracts & business")] };
    case "risk_report":
      return {
        ...base,
        title: "Risk Report",
        subtitle: tx.practiceName,
        sections: [
          { heading: "Deal health", paragraphs: [view.deal.rationale] },
          {
            heading: "Risk flags",
            table: {
              columns: ["Severity", "Category", "Title", "Detail"],
              rows: view.riskFlags.map((r) => [r.severity, r.category ? CATEGORY_META[r.category]?.label ?? r.category : "—", r.title, r.detail ?? ""]),
            },
          },
          {
            heading: "Deal health factors",
            table: {
              columns: ["Factor", "Contribution", "Detail"],
              rows: view.deal.factors.map((f) => [f.label, String(f.contribution), f.detail]),
            },
          },
        ],
      };
    default:
      return { ...base, title: "Report", subtitle: tx.practiceName, sections: [{ heading: "Summary", paragraphs: ["No content."] }] };
  }
}
