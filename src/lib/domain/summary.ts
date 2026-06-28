/**
 * Executive summary generation.
 *
 * In production this is produced by the LLM layer (grounded, cited — see
 * /docs/08-ai-architecture-plan.md). Here it is composed deterministically from
 * extracted metrics, completion stats, the missing-item report, and the deal
 * score so the platform demonstrates the full "readable without opening the data
 * room" experience offline.
 */

import { formatUSD, formatPercent, formatNumber } from "../format";
import { assessDealHealth, buildMissingItemReport, metricLookup } from "./analytics";
import type {
  DiligenceRequestItem,
  Document,
  ExecutiveSummary,
  ExtractedMetric,
  RiskFlag,
  Transaction,
} from "./types";

export function generateExecutiveSummary(
  transaction: Transaction,
  items: DiligenceRequestItem[],
  documents: Document[],
  metrics: ExtractedMetric[],
  riskFlags: RiskFlag[],
  now = new Date(),
): ExecutiveSummary {
  const ml = metricLookup(metrics);
  const missing = buildMissingItemReport(items, documents, now);
  const deal = assessDealHealth(transaction, items, metrics, now);

  const num = (k: string) => ml.num(k);
  const money = (k: string) => {
    const v = num(k);
    return v === undefined ? null : formatUSD(v, { compact: true });
  };

  const specialtyPhrase = transaction.specialty ? `${transaction.specialty.toLowerCase()} practice` : "practice";
  const locationPhrase =
    transaction.locationsCount > 0
      ? `${transaction.locationsCount} location${transaction.locationsCount === 1 ? "" : "s"}`
      : "an undisclosed number of locations";
  const statePhrase = transaction.state ? ` in ${transaction.state}` : "";
  const providerPhrase =
    transaction.providersCount > 0
      ? ` with ${transaction.providersCount} provider${transaction.providersCount === 1 ? "" : "s"}`
      : "";
  const practiceOverview =
    `${transaction.practiceName} is a ${specialtyPhrase} operating ${locationPhrase}${statePhrase}${providerPhrase}. ` +
    `The transaction is currently in the "${transaction.stage}" stage.`;

  const sections: { heading: string; body: string }[] = [];

  // Financial
  const finBits: string[] = [];
  const t12 = money("t12_revenue");
  const netRev = money("net_revenue_fy");
  if (t12) finBits.push(`Consolidated T12 revenue is ${t12}.`);
  else if (netRev) finBits.push(`Latest net revenue is ${netRev}.`);
  const ebitda = money("ebitda");
  const adjEbitda = money("adjusted_ebitda");
  const margin = num("ebitda_margin");
  if (ebitda) finBits.push(`EBITDA is ${ebitda}${adjEbitda ? ` (adjusted ${adjEbitda})` : ""}${margin !== undefined ? ` at a ${formatPercent(margin)} margin` : ""}.`);
  const payrollPct = num("payroll_pct_revenue");
  if (payrollPct !== undefined) finBits.push(`Payroll runs ${formatPercent(payrollPct)} of revenue.`);
  const yoy = num("yoy_revenue_growth");
  if (yoy !== undefined) finBits.push(`Revenue is ${yoy >= 0 ? "growing" : "declining"} ${formatPercent(Math.abs(yoy))} year over year.`);
  if (finBits.length) sections.push({ heading: "Financial", body: finBits.join(" ") });

  // Revenue cycle
  const rcBits: string[] = [];
  const totalAr = money("total_ar");
  const daysAr = num("days_in_ar");
  if (totalAr) rcBits.push(`Total AR is ${totalAr}${daysAr !== undefined ? ` at ${Math.round(daysAr)} days in AR` : ""}.`);
  const denial = num("denial_rate");
  if (denial !== undefined) rcBits.push(`Denial rate is ${formatPercent(denial)}.`);
  const collRate = num("collection_rate");
  if (collRate !== undefined) rcBits.push(`Collection rate is ${formatPercent(collRate)}.`);
  if (rcBits.length) sections.push({ heading: "Revenue Cycle", body: rcBits.join(" ") });

  // Volume & patients
  const volBits: string[] = [];
  const totalPatients = num("total_patients_emr");
  if (totalPatients !== undefined) volBits.push(`${formatNumber(totalPatients)} total patients in the EMR.`);
  const annualVisits = num("annual_visit_volume");
  if (annualVisits !== undefined) volBits.push(`${formatNumber(annualVisits)} annual visits.`);
  if (volBits.length) sections.push({ heading: "Patient Volume", body: volBits.join(" ") });

  // Staffing
  const hrBits: string[] = [];
  const totalEmployees = num("total_employees");
  if (totalEmployees !== undefined) hrBits.push(`${formatNumber(totalEmployees)} total employees.`);
  const providers = num("total_providers") ?? transaction.providersCount;
  if (providers !== undefined) hrBits.push(`${formatNumber(providers)} providers on staff.`);
  if (hrBits.length) sections.push({ heading: "Staffing", body: hrBits.join(" ") });

  // Deal health
  sections.push({
    heading: "Deal Health",
    body: `${deal.score} (${deal.numericScore}/100). ${deal.rationale}`,
  });

  return {
    transactionId: transaction.id,
    generatedAt: now.toISOString(),
    practiceOverview,
    sections,
    missingDocuments: [
      ...missing.criticalPreSigningGaps.map((i) => `${i.name} (critical pre-signing)`),
      ...missing.pendingPreSigning
        .filter((i) => !i.criticalPreSigning)
        .slice(0, 6)
        .map((i) => i.name),
    ],
    riskFlags: riskFlags.map((r) => `${r.title} — ${r.detail}`),
    opportunities: deriveOpportunities(ml),
    recommendedNextSteps: deriveNextSteps(missing),
  };
}

function deriveOpportunities(ml: ReturnType<typeof metricLookup>): string[] {
  const out: string[] = [];
  const denial = ml.num("denial_rate");
  if (denial !== undefined && denial > 8)
    out.push(`Denial rate of ${formatPercent(denial)} suggests recoverable revenue through denial-management improvements.`);
  const daysAr = ml.num("days_in_ar");
  if (daysAr !== undefined && daysAr > 45)
    out.push(`Elevated days in AR (${Math.round(daysAr)}) indicates upside from tighter follow-up workflows post-close.`);
  const margin = ml.num("ebitda_margin");
  if (margin !== undefined && margin < 15)
    out.push(`Sub-15% EBITDA margin leaves room for cost-structure synergies under acquirer scale.`);
  if (out.length === 0) out.push("Stable operating profile; integration synergies in shared back-office functions.");
  return out;
}

function deriveNextSteps(missing: ReturnType<typeof buildMissingItemReport>): string[] {
  const steps: string[] = [];
  if (missing.criticalPreSigningGaps.length > 0) {
    steps.push(
      `Request ${missing.criticalPreSigningGaps
        .slice(0, 3)
        .map((i) => i.name)
        .join(", ")} to unblock pre-signing valuation.`,
    );
  }
  if (missing.overdue.length > 0) steps.push(`Escalate ${missing.overdue.length} overdue item(s) with the seller.`);
  if (missing.uploadedNotMatched.length > 0)
    steps.push(`Clear the Unclassified Review Queue (${missing.uploadedNotMatched.length} file(s)).`);
  if (steps.length === 0) steps.push("Proceed to financial and operational deep-dive reviews.");
  return steps;
}
