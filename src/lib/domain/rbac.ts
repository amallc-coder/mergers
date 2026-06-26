/**
 * Role-Based Access Control.
 *
 * Defines the permission catalog, the role -> permission matrix, and helpers for
 * enforcing transaction-level scoping and strict internal/seller separation.
 *
 * The matrix below is the source of truth that the production Postgres Row Level
 * Security policies are derived from (see /supabase/migrations and
 * /docs/02-roles-permissions-matrix.md).
 */

import type { CategoryKey, Role, User } from "./types";

export const PERMISSIONS = [
  // Transactions
  "transaction:read",
  "transaction:create",
  "transaction:update",
  "transaction:delete",
  // Contacts
  "contact:manage",
  // Data room
  "dataroom:read",
  "dataroom:manage",
  // Diligence
  "diligence:read",
  "diligence:send",
  "diligence:update_status",
  "diligence:assign",
  // Documents
  "document:upload",
  "document:view",
  "document:download",
  "document:delete",
  "document:review",
  // Notes (strict separation)
  "internal_note:read",
  "internal_note:write",
  "seller_note:read",
  "seller_note:write",
  // AI / analytics
  "ai_summary:read",
  "deal_score:read",
  "valuation:read",
  "kpi:read",
  "metric:override",
  "ai_assistant:use",
  // Risk
  "risk:read",
  "risk:write",
  // Automation
  "reminder:send",
  "reminder:manage",
  "meeting:schedule",
  // Admin / settings
  "settings:read",
  "settings:manage",
  "user:manage",
  "template:manage",
  "sharepoint:configure",
  "outlook:configure",
  "ai:configure",
  "audit:read",
  // Seller portal
  "portal:access",
  "portal:upload",
  "portal:mark_na",
  "portal:comment",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/** Permissions common to every internal reviewer role. */
const REVIEWER_BASE: Permission[] = [
  "transaction:read",
  "dataroom:read",
  "diligence:read",
  "diligence:update_status",
  "document:view",
  "document:download",
  "document:review",
  "internal_note:read",
  "internal_note:write",
  "seller_note:read",
  "seller_note:write",
  "ai_summary:read",
  "kpi:read",
  "risk:read",
  "risk:write",
  "ai_assistant:use",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,

  ma_coordinator: [
    "transaction:read",
    "transaction:create",
    "transaction:update",
    "contact:manage",
    "dataroom:read",
    "dataroom:manage",
    "diligence:read",
    "diligence:send",
    "diligence:update_status",
    "diligence:assign",
    "document:upload",
    "document:view",
    "document:download",
    "document:review",
    "internal_note:read",
    "internal_note:write",
    "seller_note:read",
    "seller_note:write",
    "ai_summary:read",
    "deal_score:read",
    "kpi:read",
    "risk:read",
    "risk:write",
    "ai_assistant:use",
    "reminder:send",
    "reminder:manage",
    "meeting:schedule",
    "settings:read",
  ],

  executive_leadership: [
    "transaction:read",
    "dataroom:read",
    "diligence:read",
    "document:view",
    "ai_summary:read",
    "deal_score:read",
    "valuation:read",
    "kpi:read",
    "risk:read",
    "ai_assistant:use",
  ],

  finance_reviewer: [...REVIEWER_BASE],
  operations_reviewer: [...REVIEWER_BASE],
  legal_compliance_reviewer: [...REVIEWER_BASE],
  hr_reviewer: [...REVIEWER_BASE],

  // External seller — strictly isolated. No internal notes, no deal score,
  // no valuation, no KPI dashboard, no other transactions.
  seller: ["portal:access", "portal:upload", "portal:mark_na", "portal:comment"],
};

/**
 * Categories each reviewer role is responsible for. Used to scope reviewer
 * dashboards and the documents they are expected to review.
 */
export const REVIEWER_CATEGORIES: Partial<Record<Role, CategoryKey[]>> = {
  finance_reviewer: ["finance_accounting", "revenue_cycle_billing"],
  operations_reviewer: ["operations_clinical", "it_emr_systems"],
  legal_compliance_reviewer: ["legal_contracts_business"],
  hr_reviewer: ["hr_payroll", "providers_credentialing"],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  ma_coordinator: "M&A Coordinator",
  executive_leadership: "Executive Leadership",
  finance_reviewer: "Finance Reviewer",
  operations_reviewer: "Operations Reviewer",
  legal_compliance_reviewer: "Legal / Compliance Reviewer",
  hr_reviewer: "HR Reviewer",
  seller: "Seller / Acquisition Candidate",
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function userCan(user: Pick<User, "role">, permission: Permission): boolean {
  return hasPermission(user.role, permission);
}

/** True if the user is external (seller). */
export function isSeller(role: Role): boolean {
  return role === "seller";
}

/**
 * Transaction-level scoping. Admins and executives see everything; coordinators
 * see all transactions; reviewers and sellers are limited to their assignments.
 */
export function canAccessTransaction(user: User, transactionId: string): boolean {
  if (isSeller(user.role)) {
    return (user.scopedTransactionIds ?? []).includes(transactionId);
  }
  if (user.role === "admin" || user.role === "executive_leadership" || user.role === "ma_coordinator") {
    return true;
  }
  // Reviewers: scoped if assignment list provided, otherwise org-wide read.
  const scoped = user.scopedTransactionIds;
  if (!scoped || scoped.length === 0) return true;
  return scoped.includes(transactionId);
}

/** Whether a comment/note of the given visibility is readable by the user. */
export function canSeeInternal(role: Role): boolean {
  return !isSeller(role);
}
