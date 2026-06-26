/**
 * Seed dataset.
 *
 * Provides a fully-populated demo so the platform runs end-to-end without any
 * external services. The hero transaction "ABC Family Medicine" is populated to
 * match the worked example in the product spec (T12 revenue ~$4.8M, EBITDA
 * ~$720K, payroll ~39% of revenue, total AR ~$610K, 42 employees) including the
 * critical missing pre-signing items (unit-level P&L, payer mix, lease agreements).
 *
 * All timestamps are fixed (the spec "currentDate" is 2026-06-26) so the seed is
 * deterministic and renders identically on every load.
 */

import { AMA_DILIGENCE_ITEMS } from "../domain/diligence-template";
import type {
  ActivityEvent,
  Comment,
  DiligenceRequestItem,
  DiligenceStatus,
  Document,
  ExtractedMetric,
  InternalReviewStatus,
  Meeting,
  Organization,
  RiskFlag,
  SellerPortalUser,
  Task,
  Transaction,
  TransactionContact,
  User,
} from "../domain/types";

export const NOW = new Date("2026-06-26T14:30:00.000Z");
const iso = (s: string) => new Date(s).toISOString();

// ─────────────────────────── Organization & users ───────────────────────────

export const ORG: Organization = {
  id: "org-amallc",
  name: "AM Administrators (Acquirer)",
  acquiringEntity: true,
};

export const USERS: User[] = [
  { id: "u-admin", organizationId: ORG.id, name: "Nina Patel", email: "npatel@amadministrators.com", role: "admin", title: "Platform Administrator" },
  { id: "u-coord", organizationId: ORG.id, name: "Marcus Reed", email: "mreed@amadministrators.com", role: "ma_coordinator", title: "M&A Coordinator" },
  { id: "u-exec", organizationId: ORG.id, name: "Dana Lowe", email: "dlowe@amadministrators.com", role: "executive_leadership", title: "Chief Development Officer" },
  { id: "u-finance", organizationId: ORG.id, name: "Priya Shah", email: "pshah@amadministrators.com", role: "finance_reviewer", title: "Finance Diligence Lead" },
  { id: "u-ops", organizationId: ORG.id, name: "Carlos Mendez", email: "cmendez@amadministrators.com", role: "operations_reviewer", title: "Operations Diligence Lead" },
  { id: "u-legal", organizationId: ORG.id, name: "Erin Walsh", email: "ewalsh@amadministrators.com", role: "legal_compliance_reviewer", title: "Legal & Compliance Counsel" },
  { id: "u-hr", organizationId: ORG.id, name: "Tomás Rivera", email: "trivera@amadministrators.com", role: "hr_reviewer", title: "HR Diligence Lead" },
  { id: "u-seller-abc", organizationId: "ext", name: "Dr. Robert Klein", email: "rklein@abcfamilymed.com", role: "seller", title: "Managing Partner, ABC Family Medicine", scopedTransactionIds: ["tx-abc"] },
];

/** The signed-in user for this demo session (the platform admin). */
export const CURRENT_USER_ID = "u-admin";

// ─────────────────────────── Request-item instantiation ───────────────────────────

interface ItemConfig {
  received?: string[];
  notApplicable?: string[];
  denied?: string[];
  reviewComplete?: string[];
  accepted?: string[];
  underReview?: string[];
  needsClarification?: string[];
  /** Per-item due-date overrides (templateKey -> ISO date). */
  dueByKey?: Record<string, string>;
  preDue: string;
  postDue: string;
  externalContactId?: string;
  reviewerByCategory?: Partial<Record<string, string>>;
}

function instantiateItems(transactionId: string, cfg: ItemConfig): DiligenceRequestItem[] {
  const received = new Set(cfg.received ?? []);
  const na = new Set(cfg.notApplicable ?? []);
  const denied = new Set(cfg.denied ?? []);
  const reviewComplete = new Set(cfg.reviewComplete ?? []);
  const accepted = new Set(cfg.accepted ?? []);
  const underReview = new Set(cfg.underReview ?? []);
  const needsClar = new Set(cfg.needsClarification ?? []);

  return AMA_DILIGENCE_ITEMS.map((t) => {
    let status: DiligenceStatus = "Pending";
    if (received.has(t.key)) status = "Received";
    else if (na.has(t.key)) status = "Not Applicable";
    else if (denied.has(t.key)) status = "Denied";

    let internalReviewStatus: InternalReviewStatus | undefined;
    if (status === "Received") {
      if (reviewComplete.has(t.key)) internalReviewStatus = "Internal Review Complete";
      else if (accepted.has(t.key)) internalReviewStatus = "Accepted";
      else if (needsClar.has(t.key)) internalReviewStatus = "Needs Clarification";
      else if (underReview.has(t.key)) internalReviewStatus = "Under Review";
      else internalReviewStatus = "Uploaded";
    }

    const dueDate =
      cfg.dueByKey?.[t.key] ?? (t.neededTimeline === "Pre Signing" ? cfg.preDue : cfg.postDue);

    return {
      id: `ri-${transactionId}-${t.key}`,
      transactionId,
      templateItemKey: t.key,
      category: t.category,
      name: t.name,
      neededTimeline: t.neededTimeline,
      sensitive: !!t.sensitive,
      criticalPreSigning: !!t.criticalPreSigning,
      status,
      internalReviewStatus,
      assignedExternalContactId: cfg.externalContactId,
      assignedInternalReviewerId: cfg.reviewerByCategory?.[t.category],
      dueDate,
      documents: [],
      internalNotes: [],
      sellerFacingNotes: [],
      humanReviewRequired: needsClar.has(t.key),
      lastUpdated: iso("2026-06-24T10:00:00Z"),
    } satisfies DiligenceRequestItem;
  });
}

// ─────────────────────────── Transactions ───────────────────────────

export const TRANSACTIONS: Transaction[] = [
  {
    id: "tx-abc",
    organizationId: ORG.id,
    name: "Project Cedar — ABC Family Medicine",
    practiceName: "ABC Family Medicine",
    specialty: "Primary Care",
    state: "OH",
    locationsCount: 3,
    providersCount: 6,
    stage: "Pre-signing diligence in progress",
    assignedCoordinatorId: "u-coord",
    internalDealOwnerId: "u-exec",
    externalPrimaryContactId: "c-abc-1",
    sharePointFolderUrl: "https://amallc.sharepoint.com/sites/MADataRooms/ABC%20Family%20Medicine",
    lastActivityDate: iso("2026-06-26T13:05:00Z"),
    riskLevel: "Elevated",
    templateId: "tmpl-ama-standard-v1",
    createdAt: iso("2026-05-12T09:00:00Z"),
    stageHistory: [
      { stage: "Lead identified", enteredAt: iso("2026-04-02T09:00:00Z") },
      { stage: "NDA executed", enteredAt: iso("2026-04-20T09:00:00Z") },
      { stage: "Data room created", enteredAt: iso("2026-05-12T09:00:00Z") },
      { stage: "Initial diligence request sent", enteredAt: iso("2026-05-14T09:00:00Z") },
      { stage: "Pre-signing diligence in progress", enteredAt: iso("2026-05-28T09:00:00Z"), ownerId: "u-coord" },
    ],
  },
  {
    id: "tx-summit",
    organizationId: ORG.id,
    name: "Project Granite — Summit Orthopedics Group",
    practiceName: "Summit Orthopedics Group",
    specialty: "Orthopedics",
    state: "TX",
    locationsCount: 2,
    providersCount: 9,
    stage: "Financial review",
    assignedCoordinatorId: "u-coord",
    internalDealOwnerId: "u-exec",
    externalPrimaryContactId: "c-summit-1",
    sharePointFolderUrl: "https://amallc.sharepoint.com/sites/MADataRooms/Summit%20Orthopedics",
    lastActivityDate: iso("2026-06-25T16:40:00Z"),
    riskLevel: "Low",
    templateId: "tmpl-ama-standard-v1",
    createdAt: iso("2026-04-28T09:00:00Z"),
    stageHistory: [
      { stage: "Data room created", enteredAt: iso("2026-04-28T09:00:00Z") },
      { stage: "Pre-signing diligence in progress", enteredAt: iso("2026-05-10T09:00:00Z") },
      { stage: "Financial review", enteredAt: iso("2026-06-15T09:00:00Z"), ownerId: "u-finance" },
    ],
  },
  {
    id: "tx-coastal",
    organizationId: ORG.id,
    name: "Project Marlin — Coastal Pediatrics",
    practiceName: "Coastal Pediatrics",
    specialty: "Pediatrics",
    state: "FL",
    locationsCount: 4,
    providersCount: 12,
    stage: "Initial diligence request sent",
    assignedCoordinatorId: "u-coord",
    internalDealOwnerId: "u-exec",
    externalPrimaryContactId: "c-coastal-1",
    sharePointFolderUrl: "https://amallc.sharepoint.com/sites/MADataRooms/Coastal%20Pediatrics",
    lastActivityDate: iso("2026-06-24T11:15:00Z"),
    riskLevel: "Moderate",
    templateId: "tmpl-ama-standard-v1",
    createdAt: iso("2026-06-18T09:00:00Z"),
    stageHistory: [
      { stage: "Data room created", enteredAt: iso("2026-06-18T09:00:00Z") },
      { stage: "Initial diligence request sent", enteredAt: iso("2026-06-20T09:00:00Z"), ownerId: "u-coord" },
    ],
  },
  {
    id: "tx-valley",
    organizationId: ORG.id,
    name: "Project Sequoia — Valley Cardiology Partners",
    practiceName: "Valley Cardiology Partners",
    specialty: "Cardiology",
    state: "AZ",
    locationsCount: 1,
    providersCount: 5,
    stage: "Valuation review",
    assignedCoordinatorId: "u-coord",
    internalDealOwnerId: "u-exec",
    externalPrimaryContactId: "c-valley-1",
    sharePointFolderUrl: "https://amallc.sharepoint.com/sites/MADataRooms/Valley%20Cardiology",
    lastActivityDate: iso("2026-06-23T09:30:00Z"),
    riskLevel: "Low",
    templateId: "tmpl-ama-standard-v1",
    createdAt: iso("2026-03-30T09:00:00Z"),
    stageHistory: [
      { stage: "Pre-signing diligence in progress", enteredAt: iso("2026-04-15T09:00:00Z") },
      { stage: "Financial review", enteredAt: iso("2026-05-20T09:00:00Z") },
      { stage: "Valuation review", enteredAt: iso("2026-06-18T09:00:00Z"), ownerId: "u-exec" },
    ],
  },
];

// ─────────────────────────── Contacts ───────────────────────────

export const CONTACTS: TransactionContact[] = [
  { id: "c-abc-1", transactionId: "tx-abc", type: "external", name: "Dr. Robert Klein", email: "rklein@abcfamilymed.com", phone: "(614) 555-0142", role: "Managing Partner", primary: true },
  { id: "c-abc-2", transactionId: "tx-abc", type: "external", name: "Susan Doyle", email: "sdoyle@abcfamilymed.com", phone: "(614) 555-0177", role: "Practice Administrator", primary: false },
  { id: "c-abc-3", transactionId: "tx-abc", type: "internal", name: "Marcus Reed", email: "mreed@amadministrators.com", role: "M&A Coordinator", primary: false },
  { id: "c-abc-4", transactionId: "tx-abc", type: "internal", name: "Priya Shah", email: "pshah@amadministrators.com", role: "Finance Reviewer", primary: false },
  { id: "c-summit-1", transactionId: "tx-summit", type: "external", name: "Dr. Alan Pierce", email: "apierce@summitortho.com", phone: "(512) 555-0190", role: "President", primary: true },
  { id: "c-coastal-1", transactionId: "tx-coastal", type: "external", name: "Dr. Maria Santos", email: "msantos@coastalpeds.com", phone: "(305) 555-0123", role: "Owner", primary: true },
  { id: "c-valley-1", transactionId: "tx-valley", type: "external", name: "Dr. James Whitfield", email: "jwhitfield@valleycardio.com", phone: "(602) 555-0166", role: "Senior Partner", primary: true },
];

// ─────────────────────────── ABC diligence items ───────────────────────────

const abcReviewerByCategory: Partial<Record<string, string>> = {
  finance_accounting: "u-finance",
  revenue_cycle_billing: "u-finance",
  operations_clinical: "u-ops",
  it_emr_systems: "u-ops",
  legal_contracts_business: "u-legal",
  hr_payroll: "u-hr",
  providers_credentialing: "u-hr",
};

const abcItems = instantiateItems("tx-abc", {
  preDue: iso("2026-07-03T00:00:00Z"),
  postDue: iso("2026-08-15T00:00:00Z"),
  externalContactId: "c-abc-1",
  reviewerByCategory: abcReviewerByCategory,
  received: [
    // Finance
    "B.01", "B.02", "B.05", "B.07", "B.10", "B.11", "B.13",
    // Revenue cycle
    "C.01", "C.03", "C.04", "C.05", "C.06", "C.07", "C.14", "C.17",
    // HR (all pre-signing, mostly in)
    "F.01", "F.02", "F.03", "F.04", "F.05", "F.08", "F.09", "F.11",
    // Operations
    "E.01", "E.02", "E.05", "E.09", "E.12",
    // IT (pre-signing items)
    "G.12",
  ],
  reviewComplete: ["B.01", "B.05", "C.01", "C.03", "F.01"],
  accepted: ["B.02", "B.07", "C.05"],
  underReview: ["B.10", "B.11", "C.06", "C.07", "E.01", "E.02"],
  needsClarification: ["C.04"],
  notApplicable: ["B.06"], // unit-level balance sheets (single-entity bookkeeping) — N/A
  denied: ["F.06"], // insurance details — seller declined to share pre-signing
  dueByKey: {
    "B.03": iso("2026-06-20T00:00:00Z"), // Unit-level T12 P&L — OVERDUE, critical
    "B.12": iso("2026-06-22T00:00:00Z"), // Debt schedule — OVERDUE
    "C.02": iso("2026-06-30T00:00:00Z"), // AR aging by DOS bucket — critical, due soon
    "C.13": iso("2026-06-30T00:00:00Z"), // Payor mix reporting — critical
    "B.14": iso("2026-07-01T00:00:00Z"), // Lease agreements — critical
  },
});

// ── Attach uploaded documents & notes to specific ABC items ──
function abcItem(key: string): DiligenceRequestItem {
  const it = abcItems.find((i) => i.templateItemKey === key);
  if (!it) throw new Error(`seed: missing ABC item ${key}`);
  return it;
}

abcItem("B.01").aiClassification = "Consolidated T12 P&L";
abcItem("B.01").aiConfidence = 0.94;
abcItem("B.01").internalNotes.push("T12 revenue ties to $4.8M; clean presentation.");
abcItem("C.04").sellerFacingNotes.push("Please confirm whether denial categories include write-offs or only payer denials.");
abcItem("C.04").internalNotes.push("Denial taxonomy unclear — flagged for clarification.");
abcItem("B.03").internalNotes.push("Critical: unit-level T12 needed before valuation review.");
abcItem("F.06").sellerFacingNotes.push("Seller will provide insurance details after LOI execution.");

// ─────────────────────────── Other transactions' items ───────────────────────────

const summitItems = instantiateItems("tx-summit", {
  preDue: iso("2026-07-08T00:00:00Z"),
  postDue: iso("2026-09-01T00:00:00Z"),
  externalContactId: "c-summit-1",
  reviewerByCategory: { finance_accounting: "u-finance", revenue_cycle_billing: "u-finance" },
  received: [
    "B.01", "B.02", "B.03", "B.04", "B.05", "B.07", "B.10", "B.11", "B.12", "B.13", "B.14",
    "C.01", "C.02", "C.03", "C.05", "C.06", "C.07", "C.13", "C.14", "C.15", "C.17",
    "E.01", "E.02", "E.05", "E.06", "E.09", "E.12",
    "F.01", "F.02", "F.03", "F.04", "F.05", "F.08", "F.09", "F.11", "F.12",
  ],
  reviewComplete: ["B.01", "B.02", "B.03", "C.01", "C.02", "F.01"],
  accepted: ["B.05", "B.07", "C.05", "E.01"],
});

const coastalItems = instantiateItems("tx-coastal", {
  preDue: iso("2026-07-15T00:00:00Z"),
  postDue: iso("2026-09-15T00:00:00Z"),
  externalContactId: "c-coastal-1",
  received: ["B.01", "C.01", "F.01", "E.02"],
  underReview: ["B.01", "C.01"],
});

const valleyItems = instantiateItems("tx-valley", {
  preDue: iso("2026-06-10T00:00:00Z"),
  postDue: iso("2026-08-01T00:00:00Z"),
  externalContactId: "c-valley-1",
  reviewerByCategory: { finance_accounting: "u-finance", revenue_cycle_billing: "u-finance" },
  received: [
    "B.01", "B.02", "B.03", "B.04", "B.05", "B.06", "B.07", "B.10", "B.11", "B.12", "B.13", "B.14",
    "C.01", "C.02", "C.03", "C.04", "C.05", "C.06", "C.07", "C.11", "C.12", "C.13", "C.14", "C.15", "C.16", "C.17",
    "E.01", "E.02", "E.03", "E.04", "E.05", "E.06", "E.08", "E.09", "E.10", "E.12", "E.13",
    "F.01", "F.02", "F.03", "F.04", "F.05", "F.06", "F.07", "F.08", "F.09", "F.10", "F.11", "F.12",
  ],
  reviewComplete: [
    "B.01", "B.02", "B.03", "B.04", "B.05", "C.01", "C.02", "C.03", "F.01", "E.01",
  ],
});

export const REQUEST_ITEMS: DiligenceRequestItem[] = [
  ...abcItems,
  ...summitItems,
  ...coastalItems,
  ...valleyItems,
];

// ─────────────────────────── Documents ───────────────────────────

const spUrl = (tx: string, folder: string, file: string) =>
  `https://amallc.sharepoint.com/sites/MADataRooms/${tx}/${folder}/${encodeURIComponent(file)}`;

export const DOCUMENTS: Document[] = [
  {
    id: "doc-abc-1", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.01", category: "finance_accounting",
    fileName: "Consolidated T12 P&L 2025.pdf", mimeType: "application/pdf", sizeBytes: 412000, version: 2,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-26T13:05:00Z"),
    sharePointFileId: "01ABCDEF1", sharePointUrl: spUrl("ABC Family Medicine", "02. Finance Accounting", "Consolidated T12 P&L 2025.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Consolidated T12 P&L", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.94, aiDateRangeStart: "2025-06", aiDateRangeEnd: "2026-05",
    aiEntity: "ABC Family Medicine (consolidated)", reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-abc-2", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.02", category: "finance_accounting",
    fileName: "2024 Profit and Loss Statement.pdf", mimeType: "application/pdf", sizeBytes: 388000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-20T10:12:00Z"),
    sharePointFileId: "01ABCDEF2", sharePointUrl: spUrl("ABC Family Medicine", "02. Finance Accounting", "2024 Profit and Loss Statement.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Monthly P&L", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.92, aiDateRangeStart: "2024-01", aiDateRangeEnd: "2024-12",
    reviewStatus: "Accepted",
  },
  {
    id: "doc-abc-3", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.05", category: "finance_accounting",
    fileName: "Balance Sheet 2025.pdf", mimeType: "application/pdf", sizeBytes: 201000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-18T14:40:00Z"),
    sharePointFileId: "01ABCDEF3", sharePointUrl: spUrl("ABC Family Medicine", "02. Finance Accounting", "Balance Sheet 2025.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Balance sheet", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.9, reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-abc-4", transactionId: "tx-abc", requestItemId: "ri-tx-abc-C.01", category: "revenue_cycle_billing",
    fileName: "AR Aging by Payer May 2026.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 88000, version: 1, uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-22T09:05:00Z"),
    sharePointFileId: "01ABCDEF4", sharePointUrl: spUrl("ABC Family Medicine", "03. Revenue Cycle Billing", "AR Aging by Payer May 2026.xlsx"),
    sharePointSyncStatus: "synced", aiDocumentType: "AR aging", aiCategory: "revenue_cycle_billing",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.88, reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-abc-5", transactionId: "tx-abc", requestItemId: "ri-tx-abc-C.03", category: "revenue_cycle_billing",
    fileName: "Denial Report Q1 2026.pdf", mimeType: "application/pdf", sizeBytes: 145000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-21T11:20:00Z"),
    sharePointFileId: "01ABCDEF5", sharePointUrl: spUrl("ABC Family Medicine", "03. Revenue Cycle Billing", "Denial Report Q1 2026.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Denial report", aiCategory: "revenue_cycle_billing",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.86, reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-abc-6", transactionId: "tx-abc", requestItemId: "ri-tx-abc-F.01", category: "hr_payroll",
    fileName: "Employee Roster.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 64000, version: 1, uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-19T15:00:00Z"),
    sharePointFileId: "01ABCDEF6", sharePointUrl: spUrl("ABC Family Medicine", "06. HR Payroll", "Employee Roster.xlsx"),
    sharePointSyncStatus: "synced", aiDocumentType: "Employee roster", aiCategory: "hr_payroll",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.95, reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-abc-7", transactionId: "tx-abc", requestItemId: undefined, category: "unclassified_review_queue",
    fileName: "Scanned Document 0423.pdf", mimeType: "application/pdf", sizeBytes: 920000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-25T17:45:00Z"),
    sharePointFileId: "01ABCDEF7", sharePointUrl: spUrl("ABC Family Medicine", "10. Unclassified Review Queue", "Scanned Document 0423.pdf"),
    sharePointSyncStatus: "pending", aiDocumentType: "Unknown", aiConfidence: 0.41,
    aiFlags: ["low_confidence", "unreadable"], reviewStatus: "Under Review",
  },
  {
    id: "doc-abc-8", transactionId: "tx-abc", requestItemId: "ri-tx-abc-C.05", category: "revenue_cycle_billing",
    fileName: "Fee Schedule - Medicare 2026.pdf", mimeType: "application/pdf", sizeBytes: 156000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-22T09:30:00Z"),
    sharePointFileId: "01ABCDEF8", sharePointUrl: spUrl("ABC Family Medicine", "03. Revenue Cycle Billing", "Fee Schedule - Medicare 2026.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Fee schedule", aiCategory: "revenue_cycle_billing",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.83, reviewStatus: "Accepted",
  },
  {
    id: "doc-abc-9", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.02", category: "finance_accounting",
    fileName: "2024 Profit and Loss Statement (old).pdf", mimeType: "application/pdf", sizeBytes: 380000, version: 1,
    uploadedBy: "Susan Doyle", uploadedByType: "external", uploadedAt: iso("2026-06-15T08:00:00Z"),
    sharePointFileId: "01ABCDEF9", sharePointUrl: spUrl("ABC Family Medicine", "02. Finance Accounting", "2024 Profit and Loss Statement (old).pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Monthly P&L", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.79, aiFlags: ["duplicate", "outdated"], reviewStatus: "Rejected",
  },
  // Summit / Valley documents (lighter)
  {
    id: "doc-summit-1", transactionId: "tx-summit", requestItemId: "ri-tx-summit-B.01", category: "finance_accounting",
    fileName: "Summit T12 P&L.pdf", mimeType: "application/pdf", sizeBytes: 350000, version: 1,
    uploadedBy: "Dr. Alan Pierce", uploadedByType: "external", uploadedAt: iso("2026-06-15T10:00:00Z"),
    sharePointFileId: "01SUM1", sharePointUrl: spUrl("Summit Orthopedics", "02. Finance Accounting", "Summit T12 P&L.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Consolidated T12 P&L", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.96, reviewStatus: "Internal Review Complete",
  },
  {
    id: "doc-valley-1", transactionId: "tx-valley", requestItemId: "ri-tx-valley-B.01", category: "finance_accounting",
    fileName: "Valley T12 P&L.pdf", mimeType: "application/pdf", sizeBytes: 340000, version: 1,
    uploadedBy: "Dr. James Whitfield", uploadedByType: "external", uploadedAt: iso("2026-06-01T10:00:00Z"),
    sharePointFileId: "01VAL1", sharePointUrl: spUrl("Valley Cardiology", "02. Finance Accounting", "Valley T12 P&L.pdf"),
    sharePointSyncStatus: "synced", aiDocumentType: "Consolidated T12 P&L", aiCategory: "finance_accounting",
    aiNeededTimeline: "Pre Signing", aiConfidence: 0.97, reviewStatus: "Internal Review Complete",
  },
];

// Link documents back onto their request items.
for (const doc of DOCUMENTS) {
  if (!doc.requestItemId) continue;
  const item = REQUEST_ITEMS.find((i) => i.id === doc.requestItemId);
  if (item) {
    item.documents.push({
      documentId: doc.id,
      fileName: doc.fileName,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
    });
  }
}

// ─────────────────────────── Extracted metrics ───────────────────────────

let metricSeq = 0;
function metric(
  transactionId: string,
  metricKey: string,
  metricName: string,
  category: ExtractedMetric["category"],
  value: number | string | null,
  unit: string,
  period: string,
  sourceDoc: string | undefined,
  confidence: number,
  opts: Partial<ExtractedMetric> = {},
): ExtractedMetric {
  return {
    id: `m-${++metricSeq}`,
    transactionId,
    metricKey,
    metricName,
    category,
    metricValue: value,
    metricUnit: unit,
    period,
    sourceDocumentId: opts.sourceDocumentId,
    sourceDocumentName: sourceDoc,
    sourcePage: opts.sourcePage,
    confidenceScore: confidence,
    requiresHumanReview: opts.requiresHumanReview ?? confidence < 0.7,
    source: opts.source ?? "ai",
    lastUpdated: opts.lastUpdated ?? iso("2026-06-26T13:10:00Z"),
    ...opts,
  };
}

export const METRICS: ExtractedMetric[] = [
  // ABC — Financial
  metric("tx-abc", "t12_revenue", "Consolidated T12 revenue", "finance_accounting", 4800000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.94, { sourcePage: 1 }),
  metric("tx-abc", "net_revenue_fy", "Net revenue (FY2024)", "finance_accounting", 4200000, "USD", "FY2024", "2024 Profit and Loss Statement.pdf", 0.92, { sourcePage: 1 }),
  metric("tx-abc", "gross_revenue_fy", "Gross revenue (FY2024)", "finance_accounting", 5360000, "USD", "FY2024", "2024 Profit and Loss Statement.pdf", 0.9, { sourcePage: 1 }),
  metric("tx-abc", "ebitda", "EBITDA", "finance_accounting", 720000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.88, { sourcePage: 3 }),
  metric("tx-abc", "adjusted_ebitda", "Adjusted EBITDA", "finance_accounting", 815000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.74, { sourcePage: 3, requiresHumanReview: true }),
  metric("tx-abc", "ebitda_margin", "EBITDA margin", "finance_accounting", 15, "percent", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.88),
  metric("tx-abc", "net_income", "Net income", "finance_accounting", 540000, "USD", "FY2024", "2024 Profit and Loss Statement.pdf", 0.85),
  metric("tx-abc", "payroll_expense", "Payroll expense", "finance_accounting", 1872000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.9, { sourcePage: 2 }),
  metric("tx-abc", "payroll_pct_revenue", "Payroll as % of revenue", "finance_accounting", 39, "percent", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.9),
  metric("tx-abc", "rent_expense", "Rent expense", "finance_accounting", 372000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.86),
  metric("tx-abc", "supplies_expense", "Supplies expense", "finance_accounting", 288000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.84),
  metric("tx-abc", "operating_expenses", "Operating expenses", "finance_accounting", 4080000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.83),
  metric("tx-abc", "add_backs", "Add-backs", "finance_accounting", 95000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.7, { requiresHumanReview: true }),
  metric("tx-abc", "yoy_revenue_growth", "Year-over-year revenue growth", "finance_accounting", 14.3, "percent", "FY2024→TTM", "Consolidated T12 P&L 2025.pdf", 0.8),
  // ABC — Revenue cycle
  metric("tx-abc", "total_ar", "Total AR", "revenue_cycle_billing", 610000, "USD", "2026-05", "AR Aging by Payer May 2026.xlsx", 0.88),
  metric("tx-abc", "days_in_ar", "Days in AR", "revenue_cycle_billing", 52, "days", "2026-05", "AR Aging by Payer May 2026.xlsx", 0.82),
  metric("tx-abc", "denial_rate", "Denial rate", "revenue_cycle_billing", 9.2, "percent", "Q1 2026", "Denial Report Q1 2026.pdf", 0.81),
  metric("tx-abc", "collection_rate", "Collection rate", "revenue_cycle_billing", 94, "percent", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.79),
  metric("tx-abc", "net_collection_ratio", "Net collection ratio", "revenue_cycle_billing", 96, "percent", "TTM 2026-05", "AR Aging by Payer May 2026.xlsx", 0.77, { requiresHumanReview: true }),
  metric("tx-abc", "payer_mix", "Largest payer share (Medicare)", "revenue_cycle_billing", 42, "percent", "2026-05", "AR Aging by Payer May 2026.xlsx", 0.8),
  metric("tx-abc", "total_patients_emr", "Total patients in EMR", "revenue_cycle_billing", 18500, "count", "2026-06", "EMR Patient Count Export.pdf", 0.86),
  metric("tx-abc", "active_patient_count", "Active patient count", "revenue_cycle_billing", 9200, "count", "TTM 2026-05", "EMR Patient Count Export.pdf", 0.83),
  metric("tx-abc", "annual_visit_volume", "Annual visit volume", "revenue_cycle_billing", 41000, "count", "TTM 2026-05", "Visit Volume Report.xlsx", 0.85),
  metric("tx-abc", "monthly_visit_volume", "Monthly visit volume (avg)", "revenue_cycle_billing", 3420, "count", "TTM 2026-05", "Visit Volume Report.xlsx", 0.85),
  metric("tx-abc", "revenue_per_visit", "Revenue per visit", "revenue_cycle_billing", 117, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 0.72),
  // ABC — HR / Providers / Ops
  metric("tx-abc", "total_employees", "Total employees", "hr_payroll", 42, "count", "2026-06", "Employee Roster.xlsx", 0.95),
  metric("tx-abc", "full_time_employees", "Full-time employees", "hr_payroll", 31, "count", "2026-06", "Employee Roster.xlsx", 0.95),
  metric("tx-abc", "part_time_employees", "Part-time employees", "hr_payroll", 11, "count", "2026-06", "Employee Roster.xlsx", 0.95),
  metric("tx-abc", "total_providers", "Total providers", "providers_credentialing", 6, "count", "2026-06", "Employee Roster.xlsx", 0.9),
  metric("tx-abc", "physician_count", "Physician count", "providers_credentialing", 4, "count", "2026-06", "Employee Roster.xlsx", 0.9),
  metric("tx-abc", "app_count", "APP count", "providers_credentialing", 2, "count", "2026-06", "Employee Roster.xlsx", 0.9),
  metric("tx-abc", "total_locations", "Total locations", "operations_clinical", 3, "count", "2026-06", "Service Line List.pdf", 0.92),
  metric("tx-abc", "staff_to_provider_ratio", "Staff-to-provider ratio", "operations_clinical", 6, "ratio", "2026-06", "Employee Roster.xlsx", 0.8),

  // Summit — selected
  metric("tx-summit", "t12_revenue", "Consolidated T12 revenue", "finance_accounting", 11200000, "USD", "TTM 2026-05", "Summit T12 P&L.pdf", 0.96),
  metric("tx-summit", "ebitda", "EBITDA", "finance_accounting", 2576000, "USD", "TTM 2026-05", "Summit T12 P&L.pdf", 0.93),
  metric("tx-summit", "ebitda_margin", "EBITDA margin", "finance_accounting", 23, "percent", "TTM 2026-05", "Summit T12 P&L.pdf", 0.93),
  metric("tx-summit", "payroll_pct_revenue", "Payroll as % of revenue", "finance_accounting", 31, "percent", "TTM 2026-05", "Summit T12 P&L.pdf", 0.9),
  metric("tx-summit", "yoy_revenue_growth", "Year-over-year revenue growth", "finance_accounting", 9, "percent", "FY2024→TTM", "Summit T12 P&L.pdf", 0.86),
  metric("tx-summit", "days_in_ar", "Days in AR", "revenue_cycle_billing", 38, "days", "2026-05", "Summit AR Aging.xlsx", 0.85),
  metric("tx-summit", "denial_rate", "Denial rate", "revenue_cycle_billing", 4.5, "percent", "Q1 2026", "Summit Denial Report.pdf", 0.84),
  metric("tx-summit", "payer_mix", "Largest payer share", "revenue_cycle_billing", 33, "percent", "2026-05", "Summit AR Aging.xlsx", 0.82),
  metric("tx-summit", "total_employees", "Total employees", "hr_payroll", 68, "count", "2026-06", "Summit Roster.xlsx", 0.94),
  metric("tx-summit", "total_providers", "Total providers", "providers_credentialing", 9, "count", "2026-06", "Summit Roster.xlsx", 0.9),

  // Valley — selected (mature deal)
  metric("tx-valley", "t12_revenue", "Consolidated T12 revenue", "finance_accounting", 6700000, "USD", "TTM 2026-05", "Valley T12 P&L.pdf", 0.97),
  metric("tx-valley", "ebitda", "EBITDA", "finance_accounting", 1407000, "USD", "TTM 2026-05", "Valley T12 P&L.pdf", 0.95),
  metric("tx-valley", "ebitda_margin", "EBITDA margin", "finance_accounting", 21, "percent", "TTM 2026-05", "Valley T12 P&L.pdf", 0.95),
  metric("tx-valley", "payroll_pct_revenue", "Payroll as % of revenue", "finance_accounting", 33, "percent", "TTM 2026-05", "Valley T12 P&L.pdf", 0.92),
  metric("tx-valley", "yoy_revenue_growth", "Year-over-year revenue growth", "finance_accounting", 6, "percent", "FY2024→TTM", "Valley T12 P&L.pdf", 0.9),
  metric("tx-valley", "days_in_ar", "Days in AR", "revenue_cycle_billing", 41, "days", "2026-05", "Valley AR Aging.xlsx", 0.88),
  metric("tx-valley", "denial_rate", "Denial rate", "revenue_cycle_billing", 5.8, "percent", "Q1 2026", "Valley Denial Report.pdf", 0.86),
  metric("tx-valley", "payer_mix", "Largest payer share", "revenue_cycle_billing", 38, "percent", "2026-05", "Valley AR Aging.xlsx", 0.84),
  metric("tx-valley", "total_employees", "Total employees", "hr_payroll", 34, "count", "2026-06", "Valley Roster.xlsx", 0.95),
  metric("tx-valley", "total_providers", "Total providers", "providers_credentialing", 5, "count", "2026-06", "Valley Roster.xlsx", 0.92),
];

// One human-reviewed override example (separates AI vs human-reviewed data).
METRICS.push(
  metric("tx-abc", "ebitda", "EBITDA (reviewer adjusted)", "finance_accounting", 720000, "USD", "TTM 2026-05", "Consolidated T12 P&L 2025.pdf", 1, {
    source: "human",
    overriddenFromValue: 705000,
    lastUpdated: iso("2026-06-26T13:20:00Z"),
  }),
);

// ─────────────────────────── Risk flags ───────────────────────────

export const RISK_FLAGS: RiskFlag[] = [
  { id: "risk-abc-1", transactionId: "tx-abc", category: "finance_accounting", severity: "Elevated", title: "Payroll appears elevated", detail: "Payroll is 39% of revenue, above the 30-35% benchmark for primary care of this size.", sourceMetricKeys: ["payroll_pct_revenue"], createdAt: iso("2026-06-26T13:12:00Z") },
  { id: "risk-abc-2", transactionId: "tx-abc", category: "revenue_cycle_billing", severity: "Elevated", title: "AR over 90 days appears high", detail: "Days in AR of 52 with a Medicare-weighted mix suggests aged AR exposure; request AR by DOS bucket to confirm.", sourceMetricKeys: ["days_in_ar"], createdAt: iso("2026-06-26T13:12:00Z") },
  { id: "risk-abc-3", transactionId: "tx-abc", category: "finance_accounting", severity: "Moderate", title: "Unit-level profitability not yet available", detail: "Unit-level T12 and 2024-2025 P&Ls are outstanding, so location-level profitability cannot be assessed.", sourceMetricKeys: [], createdAt: iso("2026-06-26T13:12:00Z") },
  { id: "risk-abc-4", transactionId: "tx-abc", category: "revenue_cycle_billing", severity: "Moderate", title: "Payer concentration", detail: "Largest payer (Medicare) is ~42% of mix; reimbursement-policy changes would have outsized impact.", sourceMetricKeys: ["payer_mix"], createdAt: iso("2026-06-26T13:12:00Z") },
  { id: "risk-summit-1", transactionId: "tx-summit", category: "operations_clinical", severity: "Low", title: "Multi-site scheduling variation", detail: "Two sites use different scheduling templates; minor integration effort expected.", createdAt: iso("2026-06-20T10:00:00Z") },
];

// ─────────────────────────── Tasks ───────────────────────────

export const TASKS: Task[] = [
  { id: "t-abc-1", transactionId: "tx-abc", title: "Request unit-level monthly P&L", description: "Critical pre-signing finance item blocking valuation review.", status: "in_progress", assigneeId: "u-coord", dueDate: iso("2026-06-29T00:00:00Z"), category: "finance_accounting", createdAt: iso("2026-06-24T09:00:00Z") },
  { id: "t-abc-2", transactionId: "tx-abc", title: "Follow up on AR aging by DOS bucket", description: "Needed to validate aged-AR exposure.", status: "open", assigneeId: "u-finance", dueDate: iso("2026-06-30T00:00:00Z"), category: "revenue_cycle_billing", createdAt: iso("2026-06-24T09:05:00Z") },
  { id: "t-abc-3", transactionId: "tx-abc", title: "Clear unclassified review queue", description: "1 scanned file is low-confidence/unreadable; confirm and reclassify.", status: "open", assigneeId: "u-coord", dueDate: iso("2026-06-27T00:00:00Z"), category: "unclassified_review_queue", createdAt: iso("2026-06-25T18:00:00Z") },
  { id: "t-abc-4", transactionId: "tx-abc", title: "Confirm denial taxonomy with seller", description: "Denial report categories unclear (write-offs vs payer denials).", status: "blocked", assigneeId: "u-finance", category: "revenue_cycle_billing", createdAt: iso("2026-06-23T12:00:00Z") },
  { id: "t-summit-1", transactionId: "tx-summit", title: "Complete financial review memo", status: "in_progress", assigneeId: "u-finance", dueDate: iso("2026-07-02T00:00:00Z"), category: "finance_accounting", createdAt: iso("2026-06-18T09:00:00Z") },
];

// ─────────────────────────── Meetings ───────────────────────────

export const MEETINGS: Meeting[] = [
  { id: "mtg-abc-1", transactionId: "tx-abc", type: "Financial diligence review", title: "ABC Family Medicine — Financial Diligence Review", start: iso("2026-06-30T18:00:00Z"), end: iso("2026-06-30T19:00:00Z"), attendeeContactIds: ["c-abc-1", "c-abc-2", "c-abc-4"], agenda: ["Walk through consolidated T12 P&L", "Discuss outstanding unit-level P&L", "Review payroll ratio and add-backs", "AR aging by DOS bucket"], outlookEventId: "AAMkAB001", onlineMeetingUrl: "https://teams.microsoft.com/l/meetup-join/abc-fin" },
  { id: "mtg-abc-2", transactionId: "tx-abc", type: "Executive review", title: "ABC Family Medicine — Executive Review", start: iso("2026-07-07T15:00:00Z"), end: iso("2026-07-07T15:45:00Z"), attendeeContactIds: ["c-abc-3"], agenda: ["Deal health score walkthrough", "Risk flags & mitigations", "Go/no-go on LOI"], outlookEventId: "AAMkAB002" },
  { id: "mtg-summit-1", transactionId: "tx-summit", type: "Operations diligence review", title: "Summit Orthopedics — Operations Review", start: iso("2026-06-29T16:00:00Z"), end: iso("2026-06-29T17:00:00Z"), attendeeContactIds: ["c-summit-1"], agenda: ["Two-site scheduling alignment", "Equipment inventory"], outlookEventId: "AAMkSUM1" },
];

// ─────────────────────────── Comments ───────────────────────────

export const COMMENTS: Comment[] = [
  { id: "cm-1", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.03", authorId: "u-finance", authorName: "Priya Shah", authorType: "internal", visibility: "internal", body: "@Marcus Reed we cannot finish the financial memo without unit-level P&L — can we escalate?", createdAt: iso("2026-06-24T12:30:00Z") },
  { id: "cm-2", transactionId: "tx-abc", requestItemId: "ri-tx-abc-B.03", authorId: "u-coord", authorName: "Marcus Reed", authorType: "internal", visibility: "seller_facing", body: "Hi Susan — could you upload the unit-level (per-location) trailing 12-month P&L when you have a moment? It's our last critical pre-signing finance item.", createdAt: iso("2026-06-24T13:00:00Z") },
  { id: "cm-3", transactionId: "tx-abc", requestItemId: "ri-tx-abc-C.04", authorId: "u-seller-abc", authorName: "Susan Doyle", authorType: "external", visibility: "seller_facing", body: "The denial report groups payer denials only; write-offs are tracked separately. Want me to send the write-off report too?", createdAt: iso("2026-06-25T09:15:00Z") },
];

// ─────────────────────────── Seller portal users ───────────────────────────

export const SELLER_PORTAL_USERS: SellerPortalUser[] = [
  { id: "sp-abc-1", transactionId: "tx-abc", contactId: "c-abc-2", email: "sdoyle@abcfamilymed.com", name: "Susan Doyle", accessToken: "abc-secure-demo-portal", active: true, expiresAt: iso("2026-08-31T00:00:00Z"), lastAccessAt: iso("2026-06-26T13:05:00Z") },
  { id: "sp-summit-1", transactionId: "tx-summit", contactId: "c-summit-1", email: "apierce@summitortho.com", name: "Dr. Alan Pierce", accessToken: "summit-secure-demo-portal", active: true, expiresAt: iso("2026-09-30T00:00:00Z") },
];

// ─────────────────────────── Activity timeline ───────────────────────────

export const ACTIVITY: ActivityEvent[] = [
  { id: "act-1", transactionId: "tx-abc", type: "document_uploaded", actorId: "u-seller-abc", actorName: "Susan Doyle", summary: "Uploaded Consolidated T12 P&L 2025.pdf (v2)", category: "finance_accounting", createdAt: iso("2026-06-26T13:05:00Z") },
  { id: "act-2", transactionId: "tx-abc", type: "kpi_updated", actorName: "AI Extraction", summary: "Extracted T12 revenue $4.8M, EBITDA $720K, payroll 39% of revenue", category: "finance_accounting", createdAt: iso("2026-06-26T13:10:00Z") },
  { id: "act-3", transactionId: "tx-abc", type: "high_risk_detected", actorName: "AI Risk Engine", summary: "Flagged: payroll appears elevated (39% of revenue)", category: "finance_accounting", createdAt: iso("2026-06-26T13:12:00Z") },
  { id: "act-4", transactionId: "tx-abc", type: "ai_summary_updated", actorName: "AI Analyst", summary: "Executive summary refreshed with latest financials", createdAt: iso("2026-06-26T13:15:00Z") },
  { id: "act-5", transactionId: "tx-abc", type: "document_uploaded", actorId: "u-seller-abc", actorName: "Susan Doyle", summary: "Uploaded an unreadable scan to the review queue", category: "unclassified_review_queue", createdAt: iso("2026-06-25T17:45:00Z") },
  { id: "act-6", transactionId: "tx-abc", type: "seller_question", actorId: "u-seller-abc", actorName: "Susan Doyle", summary: "Asked a question on Denial reports", category: "revenue_cycle_billing", createdAt: iso("2026-06-25T09:15:00Z") },
  { id: "act-7", transactionId: "tx-abc", type: "request_overdue", actorName: "Reminder Engine", summary: "Unit-level T12 P&L is now overdue", category: "finance_accounting", createdAt: iso("2026-06-21T08:00:00Z") },
  { id: "act-8", transactionId: "tx-abc", type: "meeting_scheduled", actorId: "u-coord", actorName: "Marcus Reed", summary: "Scheduled Financial Diligence Review for Jun 30", createdAt: iso("2026-06-24T14:00:00Z") },
  { id: "act-9", transactionId: "tx-summit", type: "stage_changed", actorId: "u-coord", actorName: "Marcus Reed", summary: "Stage advanced to Financial review", createdAt: iso("2026-06-15T09:00:00Z") },
  { id: "act-10", transactionId: "tx-coastal", type: "diligence_request_sent", actorId: "u-coord", actorName: "Marcus Reed", summary: "Initial diligence request sent to seller", createdAt: iso("2026-06-20T09:00:00Z") },
];
