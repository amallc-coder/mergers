/**
 * Core domain types for the Healthcare M&A Diligence Platform.
 *
 * These mirror the production Postgres schema (see /supabase/migrations) but are
 * the single source of truth for the application layer. The seed-backed data
 * layer and the (future) Supabase data layer both satisfy these contracts.
 */

// ───────────────────────────── Enums ─────────────────────────────

/** The 20 default M&A transaction stages, in pipeline order. */
export const TRANSACTION_STAGES = [
  "Lead identified",
  "Initial outreach",
  "NDA sent",
  "NDA executed",
  "Data room created",
  "Initial diligence request sent",
  "Pre-signing diligence in progress",
  "Financial review",
  "Operational review",
  "Legal review",
  "Valuation review",
  "LOI drafted",
  "LOI sent",
  "LOI executed",
  "Post-signing diligence in progress",
  "Definitive agreement diligence",
  "Closing preparation",
  "Closed",
  "Paused",
  "Declined",
] as const;
export type TransactionStage = (typeof TRANSACTION_STAGES)[number];

/** Stages that represent terminal / non-active pipeline states (legacy seed +
 *  the configurable live pipeline labels). Stage values are config-driven now,
 *  so this is a plain string list rather than the narrow enum. */
export const TERMINAL_STAGES: string[] = [
  "Closed", "Paused", "Declined",
  "Signed / Closed", "On Hold", "Passed / Dead",
];

/** A configurable pipeline stage (see the pipeline_stages table / app_snapshot). */
export interface PipelineStage {
  key: string;
  label: string;
  sortOrder: number;
  isTerminal: boolean;
  automations: { action: string }[];
}

/** Feature 3 — global contact (person) with a many-to-many link to deals. */
export interface Person {
  id: string;
  type: string; // internal | external | seller
  name: string;
  email: string;
  phone?: string;
  title?: string;
  functionalRoles: string[];
  createdAt: string;
}
export interface ContactLink {
  contactId: string;
  transactionId: string;
  isPrimary: boolean;
  roleOnDeal?: string;
}
export interface Communication {
  id: string;
  transactionId?: string;
  contactId?: string;
  toEmail?: string;
  toName?: string;
  subject?: string;
  templateKey?: string;
  status: string; // queued | sent | failed | skipped
  error?: string;
  sentAt?: string;
  createdBy?: string;
  createdAt: string;
}
export interface AlertRoute {
  category: string;
  roles: string[];
}
/** A message in the per-transaction seller↔buyer thread (internal note, an
 *  outbound clarification to the seller, or a seller reply). */
export interface Message {
  id: string;
  transactionId: string;
  direction: "internal" | "to_seller" | "from_seller";
  subject?: string | null;
  body: string;
  relatedMetricKey?: string | null;
  relatedTaskId?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authorType: "internal" | "seller" | "ai";
  status: string; // draft | queued | sent | delivered | read
  readAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
}
/** Functional roles internal contacts can hold (drives role->category alerting). */
export const FUNCTIONAL_ROLES = [
  "Finance",
  "Operations",
  "Legal",
  "HR",
  "Executive Leadership",
  "M&A Coordinator",
];

/** Default pipeline used in seed/sample mode; the live backend supplies its own
 *  config from the pipeline_stages table. */
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { key: "prospect_sourced", label: "Prospect / Sourced", sortOrder: 1, isTerminal: false, automations: [] },
  { key: "nda_sent", label: "NDA Sent", sortOrder: 2, isTerminal: false, automations: [{ action: "send_nda" }] },
  { key: "nda_executed", label: "NDA Executed", sortOrder: 3, isTerminal: false, automations: [] },
  { key: "data_requested", label: "Data Requested / Waiting on Data", sortOrder: 4, isTerminal: false, automations: [{ action: "request_documents" }] },
  { key: "diligence_in_progress", label: "Diligence In Progress", sortOrder: 5, isTerminal: false, automations: [] },
  { key: "loi_drafted", label: "LOI Drafted", sortOrder: 6, isTerminal: false, automations: [] },
  { key: "loi_sent", label: "LOI Sent", sortOrder: 7, isTerminal: false, automations: [{ action: "schedule_followup" }] },
  { key: "loi_executed", label: "LOI Executed", sortOrder: 8, isTerminal: false, automations: [] },
  { key: "definitive_agreement", label: "Definitive Agreement / Final Contracting", sortOrder: 9, isTerminal: false, automations: [] },
  { key: "signed_closed", label: "Signed / Closed", sortOrder: 10, isTerminal: true, automations: [] },
  { key: "on_hold", label: "On Hold", sortOrder: 11, isTerminal: true, automations: [] },
  { key: "passed_dead", label: "Passed / Dead", sortOrder: 12, isTerminal: true, automations: [] },
];

/** External-facing diligence request status (visible to the seller). */
export const DILIGENCE_STATUSES = [
  "Received",
  "Pending",
  "Not Applicable",
  "Denied",
] as const;
export type DiligenceStatus = (typeof DILIGENCE_STATUSES)[number];

/** Internal review status (never shown to the seller). */
export const INTERNAL_REVIEW_STATUSES = [
  "Uploaded",
  "Under Review",
  "Accepted",
  "Rejected",
  "Needs Clarification",
  "Overdue",
  "Internal Review Complete",
] as const;
export type InternalReviewStatus = (typeof INTERNAL_REVIEW_STATUSES)[number];

/** Pre-signing vs post-signing timing for a diligence item. */
export const NEEDED_TIMELINES = ["Pre Signing", "Post Signing"] as const;
export type NeededTimeline = (typeof NEEDED_TIMELINES)[number];

/** The eight standard AMA diligence categories (plus Other / review queue). */
export const CATEGORY_KEYS = [
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
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const RISK_LEVELS = ["Low", "Moderate", "Elevated", "High"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const DEAL_HEALTH_SCORES = [
  "Strong",
  "Moderate",
  "Needs Review",
  "High Risk",
  "Insufficient Data",
] as const;
export type DealHealthScore = (typeof DEAL_HEALTH_SCORES)[number];

/** Internal + external user roles. */
export const ROLES = [
  "admin",
  "ma_coordinator",
  "executive_leadership",
  "finance_reviewer",
  "operations_reviewer",
  "legal_compliance_reviewer",
  "hr_reviewer",
  "seller",
] as const;
export type Role = (typeof ROLES)[number];

// ───────────────────────────── Entities ─────────────────────────────

export interface Organization {
  id: string;
  name: string;
  acquiringEntity: boolean;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  title?: string;
  /** Transactions this user is explicitly scoped to (reviewers/sellers). Empty = all (admin/exec). */
  scopedTransactionIds?: string[];
}

export type ContactType = "internal" | "external";

export interface TransactionContact {
  id: string;
  transactionId: string;
  type: ContactType;
  name: string;
  email: string;
  phone?: string;
  role: string; // freeform business role e.g. "Practice CFO", "Seller Counsel"
  primary: boolean;
}

export interface DiligenceCategoryMeta {
  key: CategoryKey;
  /** Folder ordinal e.g. "01" */
  ordinal: string;
  label: string;
  /** Data-room folder name, e.g. "01. Finance Accounting" */
  folderName: string;
  /** Whether the category contains sensitive credential items. */
  sensitive?: boolean;
  description: string;
  /** AI metrics this category is expected to surface. */
  aiExtractionTargets: string[];
}

export interface DiligenceTemplateItem {
  /** Stable key, e.g. "B.03" */
  key: string;
  category: CategoryKey;
  name: string;
  neededTimeline: NeededTimeline;
  /** Sensitive credential item — restricted handling. */
  sensitive?: boolean;
  /** Item is treated as critical for pre-signing decisioning. */
  criticalPreSigning?: boolean;
  /** Optional guidance shown to the seller. */
  sellerGuidance?: string;
}

export interface DiligenceTemplate {
  id: string;
  name: string;
  version: number;
  description: string;
  items: DiligenceTemplateItem[];
}

export interface UploadedDocumentRef {
  documentId: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface DiligenceRequestItem {
  id: string;
  transactionId: string;
  templateItemKey: string;
  category: CategoryKey;
  name: string;
  neededTimeline: NeededTimeline;
  sensitive: boolean;
  criticalPreSigning: boolean;
  status: DiligenceStatus;
  internalReviewStatus?: InternalReviewStatus;
  assignedExternalContactId?: string;
  assignedInternalReviewerId?: string;
  dueDate?: string; // ISO date
  uploadLinkId?: string;
  documents: UploadedDocumentRef[];
  internalNotes: string[];
  sellerFacingNotes: string[];
  aiClassification?: string;
  aiConfidence?: number; // 0..1
  humanReviewRequired: boolean;
  lastUpdated: string; // ISO datetime
}

export interface FolderMeta {
  category: CategoryKey;
  folderName: string;
  preSigningCount: number;
  postSigningCount: number;
  receivedCount: number;
  pendingCount: number;
  notApplicableCount: number;
  deniedCount: number;
  overdueCount: number;
  lastUploadDate?: string;
  sharePointSyncStatus: SharePointSyncStatus;
}

export type SharePointSyncStatus = "synced" | "pending" | "error" | "not_connected";

export interface DataRoom {
  id: string;
  transactionId: string;
  sharePointFolderUrl?: string;
  folders: FolderMeta[];
}

export interface Document {
  id: string;
  transactionId: string;
  requestItemId?: string;
  category: CategoryKey;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedBy: string;
  uploadedByType: ContactType;
  uploadedAt: string;
  sharePointFileId?: string;
  sharePointUrl?: string;
  sharePointSyncStatus: SharePointSyncStatus;
  // AI classification fields
  aiDocumentType?: string;
  aiCategory?: CategoryKey;
  aiNeededTimeline?: NeededTimeline;
  aiConfidence?: number;
  aiDateRangeStart?: string;
  aiDateRangeEnd?: string;
  aiEntity?: string;
  aiFlags?: DocumentFlag[];
  reviewStatus?: InternalReviewStatus;
}

export type DocumentFlag =
  | "duplicate"
  | "outdated"
  | "unreadable"
  | "missing_sections"
  | "low_confidence";

export interface ExtractedMetric {
  id: string;
  transactionId: string;
  metricKey: string;
  metricName: string;
  category: CategoryKey;
  metricValue: number | string | null;
  metricUnit: string;
  period: string; // e.g. "FY2024", "2025-03", "TTM"
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourcePage?: number;
  confidenceScore: number; // 0..1
  requiresHumanReview: boolean;
  source: "ai" | "human"; // separate AI-extracted from human-reviewed
  overriddenFromValue?: number | string | null;
  lastUpdated: string;
}

export interface RiskFlag {
  id: string;
  transactionId: string;
  category: CategoryKey;
  severity: RiskLevel;
  title: string;
  detail: string;
  sourceMetricKeys?: string[];
  createdAt: string;
}

export type TaskStatus = "open" | "in_progress" | "blocked" | "done";

export interface Task {
  id: string;
  transactionId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
  category?: CategoryKey;
  createdAt: string;
}

export const MEETING_TYPES = [
  "Introductory call",
  "Data request review",
  "Financial diligence review",
  "Revenue cycle review",
  "Operations diligence review",
  "HR diligence review",
  "Legal diligence review",
  "IT transition review",
  "Executive review",
  "Closing preparation",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export interface Meeting {
  id: string;
  transactionId: string;
  type: MeetingType;
  title: string;
  start: string;
  end: string;
  attendeeContactIds: string[];
  agenda: string[];
  outlookEventId?: string;
  location?: string;
  onlineMeetingUrl?: string;
}

export type CommentVisibility = "internal" | "seller_facing";

export interface Comment {
  id: string;
  transactionId: string;
  requestItemId?: string;
  authorId: string;
  authorName: string;
  authorType: ContactType;
  visibility: CommentVisibility;
  body: string;
  createdAt: string;
}

export type ActivityType =
  | "transaction_created"
  | "data_room_created"
  | "diligence_request_sent"
  | "document_uploaded"
  | "document_replaced"
  | "document_rejected"
  | "document_approved"
  | "seller_question"
  | "request_overdue"
  | "high_risk_detected"
  | "ai_summary_updated"
  | "kpi_updated"
  | "critical_item_missing"
  | "meeting_scheduled"
  | "stage_changed"
  | "reminder_sent"
  | "status_changed"
  | "comment_added"
  | "metric_overridden";

export interface ActivityEvent {
  id: string;
  transactionId: string;
  type: ActivityType;
  actorId?: string;
  actorName: string;
  summary: string;
  detail?: string;
  category?: CategoryKey;
  createdAt: string;
}

export interface StageRecord {
  /** Config-driven stage label (see pipeline_stages). */
  stage: string;
  ownerId?: string;
  dueDate?: string;
  enteredAt?: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  organizationId: string;
  name: string;
  practiceName: string;
  /** Optional — live deals sourced from SharePoint may not have these set yet. */
  specialty: string | null;
  state: string | null;
  locationsCount: number;
  providersCount: number;
  /** Config-driven pipeline stage label (see pipeline_stages). */
  stage: string;
  /** When the deal entered its current stage (for time-in-stage). */
  stageEnteredAt?: string;
  assignedCoordinatorId: string;
  internalDealOwnerId: string;
  externalPrimaryContactId?: string;
  sharePointFolderUrl?: string;
  lastActivityDate: string;
  riskLevel: RiskLevel;
  templateId: string;
  stageHistory: StageRecord[];
  createdAt: string;
}

export interface SellerPortalUser {
  id: string;
  transactionId: string;
  contactId: string;
  email: string;
  name: string;
  /** Opaque token used in the portal URL (/portal/[token]). */
  accessToken: string;
  active: boolean;
  expiresAt?: string;
  lastAccessAt?: string;
}

export interface AuditLogEntry {
  id: string;
  transactionId?: string;
  actorId?: string;
  actorName: string;
  action: AuditAction;
  target?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
}

export type AuditAction =
  | "login"
  | "file_upload"
  | "file_view"
  | "file_download"
  | "file_delete"
  | "request_sent"
  | "reminder_sent"
  | "comment_added"
  | "status_changed"
  | "ai_summary_generated"
  | "metric_extracted"
  | "metric_override"
  | "permission_changed"
  | "sharepoint_sync"
  | "outlook_sync"
  | "stage_changed";

// ─────────────────────── Derived / computed views ───────────────────────

export interface CompletionStats {
  total: number;
  received: number;
  pending: number;
  notApplicable: number;
  denied: number;
  overdue: number;
  uploadedNotReviewed: number;
  internalReviewComplete: number;
  /** Completion % = (received + NA) / (total - denied), guarded for divide-by-zero. */
  completionPct: number;
}

export interface MissingItemReport {
  receivedPreSigning: DiligenceRequestItem[];
  pendingPreSigning: DiligenceRequestItem[];
  criticalPreSigningGaps: DiligenceRequestItem[];
  postSigningGaps: DiligenceRequestItem[];
  overdue: DiligenceRequestItem[];
  notApplicable: DiligenceRequestItem[];
  denied: DiligenceRequestItem[];
  uploadedNotMatched: Document[];
  duplicates: Document[];
  outdated: Document[];
  lowConfidence: Document[];
  needsClarification: DiligenceRequestItem[];
  narrative: string;
}

export interface DealHealthAssessment {
  score: DealHealthScore;
  numericScore: number; // 0..100
  riskLevel: RiskLevel;
  rationale: string;
  factors: DealHealthFactor[];
}

export interface DealHealthFactor {
  label: string;
  weight: number;
  contribution: number; // -100..100 scaled
  detail: string;
  citations?: string[];
}

export interface ExecutiveSummary {
  transactionId: string;
  generatedAt: string;
  practiceOverview: string;
  sections: { heading: string; body: string }[];
  missingDocuments: string[];
  riskFlags: string[];
  opportunities: string[];
  recommendedNextSteps: string[];
}
