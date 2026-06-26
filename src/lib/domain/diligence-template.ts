/**
 * The Standard AMA Healthcare Diligence List.
 *
 * This is the canonical, reusable diligence template. It is admin-editable in
 * production (versioned in the `diligence_templates` table) and is instantiated
 * into per-transaction `diligence_request_items` when a transaction is created.
 *
 * Every item, its category, and its pre/post-signing timeline are encoded
 * exactly per the AMA healthcare diligence specification.
 */

import type {
  CategoryKey,
  DiligenceCategoryMeta,
  DiligenceTemplate,
  DiligenceTemplateItem,
  NeededTimeline,
} from "./types";

// ─────────────────────── Category metadata (data-room folders) ───────────────────────

export const CATEGORY_META: Record<CategoryKey, DiligenceCategoryMeta> = {
  logins_passwords: {
    key: "logins_passwords",
    ordinal: "01",
    label: "Logins / Passwords",
    folderName: "01. Logins Passwords",
    sensitive: true,
    description:
      "Sensitive system credentials. Never requested in plain text — handled through the secure credential request workflow and restricted to Admins and approved transition users.",
    aiExtractionTargets: [],
  },
  finance_accounting: {
    key: "finance_accounting",
    ordinal: "02",
    label: "Finance / Accounting",
    folderName: "02. Finance Accounting",
    description:
      "Financial statements, tax, GL, AP, debt, and leases used to establish revenue, EBITDA, and profitability.",
    aiExtractionTargets: [
      "Annual revenue",
      "Monthly revenue",
      "Gross revenue",
      "Net revenue",
      "EBITDA",
      "Adjusted EBITDA",
      "EBITDA margin",
      "Net income",
      "Payroll expense",
      "Rent expense",
      "Supplies expense",
      "Operating expenses",
      "Debt obligations",
      "Add-backs",
      "Revenue trend",
      "Unit-level profitability",
      "Location-level profitability",
    ],
  },
  revenue_cycle_billing: {
    key: "revenue_cycle_billing",
    ordinal: "03",
    label: "Revenue Cycle / Billing",
    folderName: "03. Revenue Cycle Billing",
    description:
      "AR, denials, collections, payer mix, claims, and visit volumes that establish revenue-cycle health.",
    aiExtractionTargets: [
      "AR aging",
      "Days in AR",
      "Total AR",
      "AR by payer",
      "AR by date-of-service bucket",
      "Charges by month",
      "Payments by month",
      "Adjustments by month",
      "Collections by month",
      "Collection rate",
      "Net collection ratio",
      "Gross collection ratio",
      "Denial rate",
      "Top denial reasons",
      "Payer mix",
      "CPT mix",
      "ICD mix",
      "Visits by month",
      "Visits by year",
      "Ancillary volume",
      "Active patient count",
      "Total patients in EMR",
      "Revenue per visit",
      "Revenue per patient",
    ],
  },
  providers_credentialing: {
    key: "providers_credentialing",
    ordinal: "04",
    label: "Providers / Credentialing",
    folderName: "04. Providers Credentialing",
    description:
      "Provider roster, NPI, licensure, DEA, malpractice, and credentialing status used for provider-risk assessment.",
    aiExtractionTargets: [
      "Provider count",
      "Physician count",
      "APP count",
      "Provider FTE",
      "Provider specialties",
      "Provider credentialing status",
      "NPI information",
      "License expiration dates",
      "DEA expiration dates",
      "Malpractice coverage details",
      "Supervising agreement gaps",
      "Credentialing risk flags",
    ],
  },
  operations_clinical: {
    key: "operations_clinical",
    ordinal: "05",
    label: "Operations / Clinical",
    folderName: "05. Operations Clinical",
    description:
      "Service lines, scheduling, visit volumes, staffing, equipment, and referral patterns used to assess operations and integration complexity.",
    aiExtractionTargets: [
      "Locations",
      "Service lines",
      "Provider schedules",
      "Patient demographics",
      "Weekly visits by provider",
      "Visits by site",
      "Staffing model",
      "Staff-to-provider ratio",
      "Equipment list",
      "Inventory list",
      "Referral sources",
      "Ancillary utilization",
      "Operational variation by location",
      "Scheduling capacity",
      "Provider-facing hours",
      "Visit capacity",
      "Integration complexity",
    ],
  },
  hr_payroll: {
    key: "hr_payroll",
    ordinal: "06",
    label: "HR / Payroll",
    folderName: "06. HR Payroll",
    description:
      "Employee roster, compensation, benefits, PTO, 401k, org chart, and key-role dependency used for HR transition risk.",
    aiExtractionTargets: [
      "Employee count",
      "FTE count",
      "Part-time count",
      "Full-time count",
      "Salary employees",
      "Hourly employees",
      "Payroll expense",
      "Payroll by position",
      "Benefits cost",
      "PTO liability",
      "401k obligations",
      "Payroll vendor",
      "Payroll calendar",
      "Key personnel dependency",
      "Org structure",
      "HR transition risk",
    ],
  },
  it_emr_systems: {
    key: "it_emr_systems",
    ordinal: "07",
    label: "IT / EMR / Systems",
    folderName: "07. IT EMR Systems",
    description:
      "EMR, billing, reporting, hardware, telecom, and domain inventory used to plan data migration and go-live.",
    aiExtractionTargets: [
      "EMR system",
      "Billing system",
      "Reporting systems",
      "IT vendors",
      "Phone/fax inventory",
      "Email domain information",
      "Website/domain registrar",
      "ISP information",
      "Hardware inventory",
      "Employee count by site",
      "Go-live dependencies",
      "Data migration needs",
      "System access gaps",
      "IT transition risks",
    ],
  },
  legal_contracts_business: {
    key: "legal_contracts_business",
    ordinal: "08",
    label: "Legal / Contracts / Business",
    folderName: "08. Legal Contracts Business",
    description:
      "Entity, tax, CLIA, insurance, licensure, payer enrollment, locations, and vendor contracts used for legal and compliance risk.",
    aiExtractionTargets: [
      "Legal entity details",
      "Tax ID status",
      "W-9 information",
      "IRS letter status",
      "CLIA certificate status",
      "Licensure status",
      "Insurance coverage",
      "Payer enrollment status",
      "Location list",
      "Vendor contracts",
      "Lease obligations",
      "Compliance gaps",
      "Business continuity risk",
      "Contract assignment risk",
    ],
  },
  other: {
    key: "other",
    ordinal: "09",
    label: "Other",
    folderName: "09. Other",
    description: "Miscellaneous documents that do not map to a standard category.",
    aiExtractionTargets: [],
  },
  unclassified_review_queue: {
    key: "unclassified_review_queue",
    ordinal: "10",
    label: "Unclassified Review Queue",
    folderName: "10. Unclassified Review Queue",
    description:
      "Holding area for documents the AI could not confidently classify; awaits human review and re-routing.",
    aiExtractionTargets: [],
  },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "logins_passwords",
  "finance_accounting",
  "revenue_cycle_billing",
  "providers_credentialing",
  "operations_clinical",
  "hr_payroll",
  "it_emr_systems",
  "legal_contracts_business",
  "other",
  "unclassified_review_queue",
];

// ─────────────────────── Item definitions ───────────────────────

const PRE: NeededTimeline = "Pre Signing";
const POST: NeededTimeline = "Post Signing";

/** Helper to build item rows compactly while keeping explicit keys. */
function items(
  category: CategoryKey,
  letter: string,
  rows: Array<[name: string, timeline: NeededTimeline, opts?: Partial<DiligenceTemplateItem>]>,
): DiligenceTemplateItem[] {
  return rows.map(([name, timeline, opts], i) => ({
    key: `${letter}.${String(i + 1).padStart(2, "0")}`,
    category,
    name,
    neededTimeline: timeline,
    ...opts,
  }));
}

// A. Logins / Passwords — all Post Signing, all sensitive
const A = items("logins_passwords", "A", [
  ["EMR / EHR", POST, { sensitive: true }],
  ["Accounting software", POST, { sensitive: true }],
  ["Payroll and benefits", POST, { sensitive: true }],
  ["Website domain", POST, { sensitive: true }],
  ["Reporting tools", POST, { sensitive: true }],
  ["Bank account 1", POST, { sensitive: true }],
  ["Bank account 2", POST, { sensitive: true }],
  ["Bank account 3", POST, { sensitive: true }],
  ["Bank account 4", POST, { sensitive: true }],
  ["Billing platform", POST, { sensitive: true }],
  ["Purchasing software", POST, { sensitive: true }],
]);

// B. Finance / Accounting
const B = items("finance_accounting", "B", [
  ["Consolidated trailing 12-month P&L", PRE, { criticalPreSigning: true }],
  ["Consolidated monthly P&L for 2024 and 2025", PRE, { criticalPreSigning: true }],
  ["Unit-level T12 P&L", PRE, { criticalPreSigning: true }],
  ["Unit-level 2024 and 2025 P&L", PRE, { criticalPreSigning: true }],
  ["Balance sheets", PRE, { criticalPreSigning: true }],
  ["Unit-level balance sheets for current year, 2024, and 2025", PRE],
  ["Last 2–3 years of tax returns", PRE, { criticalPreSigning: true }],
  ["Last 18–36 months of bank statements", POST],
  ["Full accounting platform access", POST, { sensitive: true }],
  ["General ledger detail", PRE],
  ["AP aging", PRE],
  ["Debt schedule", PRE, { criticalPreSigning: true }],
  ["Loan agreements", PRE],
  ["Lease agreements", PRE, { criticalPreSigning: true }],
  ["Bank account list", POST],
  ["Credit card list", POST],
  ["CPA / accounting firm contact information", POST],
  ["Payroll system and additional financial tool access", POST, { sensitive: true }],
  ["Budgets for each location", POST],
]);

// C. Revenue Cycle / Billing
const C = items("revenue_cycle_billing", "C", [
  ["Current AR aging by payer", PRE, { criticalPreSigning: true }],
  ["Current AR aging by date-of-service bucket", PRE, { criticalPreSigning: true }],
  ["Denial reports", PRE],
  ["Top denial categories", PRE],
  ["Fee schedules for all major payors", PRE],
  ["Collections by month for 24 months", PRE, { criticalPreSigning: true }],
  ["Charges, payments, and adjustments by month", PRE],
  ["Clearinghouse access", POST, { sensitive: true }],
  ["Billing platform access", POST, { sensitive: true }],
  ["EOB / EFT workflow details", POST],
  ["Historical claims data extracts", PRE],
  ["ICD and CPT data", PRE],
  ["Payor mix reporting", PRE, { criticalPreSigning: true }],
  ["Total visits by month for 24 months", PRE],
  ["Total individual visits per year for last 3 years", PRE],
  ["Ancillary volumes by month for 24 months", PRE],
  ["Total patients in EMR", PRE],
]);

// D. Providers / Credentialing — all Post Signing
const D = items("providers_credentialing", "D", [
  ["Provider roster", POST],
  ["Provider NPI", POST],
  ["CAQH access", POST, { sensitive: true }],
  ["PECOS access", POST, { sensitive: true }],
  ["Board certifications", POST],
  ["CV / resume", POST],
  ["Licenses", POST],
  ["DEA / CDS", POST],
  ["Malpractice insurance", POST],
  ["Driver's license", POST],
  ["Supervising / collaborating agreements", POST],
  ["References", POST],
  ["ACLS / BLS / PALS where applicable", POST],
  ["PHO affiliations", POST],
  ["Group NPI and facility linkage details", POST],
]);

// E. Operations / Clinical — all Pre Signing
const E = items("operations_clinical", "E", [
  ["Patient demographics", PRE],
  ["Service line list", PRE],
  ["Operational workflow map", PRE],
  ["Scheduling templates", PRE],
  ["Provider-facing hours", PRE],
  ["Weekly visit volume by provider", PRE],
  ["Clinical process variation by location", PRE],
  ["Inventory list", PRE],
  ["Equipment list", PRE],
  ["Referral patterns", PRE],
  ["Ancillary utilization by provider/site", PRE],
  ["Staffing model by location", PRE],
  ["Payroll totals by month by position for 3 months", PRE],
]);

// F. HR / Payroll — all Pre Signing
const F = items("hr_payroll", "F", [
  ["Full employee roster", PRE, { criticalPreSigning: true }],
  ["Full-time / part-time status", PRE],
  ["Salary / hourly status", PRE],
  ["Rates of pay", PRE],
  ["PTO / vacation balances", PRE],
  ["Insurance details", PRE],
  ["401k details and plan administrator", PRE],
  ["Benefit summaries", PRE],
  ["Payroll calendar", PRE],
  ["Payroll vendor / in-house processing details", PRE],
  ["Org chart", PRE],
  ["Key role dependency list", PRE],
]);

// G. IT / EMR / Systems
const G = items("it_emr_systems", "G", [
  ["EMR name and admin access", POST, { sensitive: true }],
  ["Billing software name and admin access", POST, { sensitive: true }],
  ["Reporting tool access", PRE, { sensitive: true }],
  ["Historical EMR / old claims data access", POST, { sensitive: true }],
  ["Main phone and fax numbers", POST],
  ["Email account list", POST],
  ["Website and domain registrar", POST],
  ["Internet service provider", POST],
  ["Telephone provider", POST],
  ["Current / previous IT contact", POST],
  ["Desktop and laptop inventory", POST],
  ["Employee count by site", PRE],
  ["Go-live date assumptions", POST],
  ["File-sharing / collaboration access", POST, { sensitive: true }],
]);

// H. Legal / Contracts / Business — all Post Signing
const H = items("legal_contracts_business", "H", [
  ["Tax ID", POST],
  ["W-9", POST],
  ["IRS letter", POST],
  ["Bank letter", POST],
  ["Group information by location", POST],
  ["Billing information by location", POST],
  ["CLIA certificate, if applicable", POST],
  ["General liability / umbrella / property insurance", POST],
  ["Licensure documents", POST],
  ["Compliance documents", POST],
  ["Medicare / Medicaid / commercial enrollment status", POST],
  ["Availity and payer portal access", POST, { sensitive: true }],
  ["UHC admin information", POST],
  ["List of locations and addresses", POST],
  ["Vendor list and contracts", POST],
]);

export const AMA_DILIGENCE_ITEMS: DiligenceTemplateItem[] = [
  ...A,
  ...B,
  ...C,
  ...D,
  ...E,
  ...F,
  ...G,
  ...H,
];

export const AMA_DILIGENCE_TEMPLATE: DiligenceTemplate = {
  id: "tmpl-ama-standard-v1",
  name: "Standard AMA Healthcare Diligence List",
  version: 1,
  description:
    "Default, reusable diligence request list for healthcare practice acquisitions. Covers credentials, finance, revenue cycle, providers, operations, HR, IT, and legal. Editable by admins.",
  items: AMA_DILIGENCE_ITEMS,
};

export function templateItemByKey(key: string): DiligenceTemplateItem | undefined {
  return AMA_DILIGENCE_ITEMS.find((i) => i.key === key);
}

export function itemsForCategory(category: CategoryKey): DiligenceTemplateItem[] {
  return AMA_DILIGENCE_ITEMS.filter((i) => i.category === category);
}
