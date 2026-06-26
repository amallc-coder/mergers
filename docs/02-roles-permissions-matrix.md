# 02 — User Roles & Permissions Matrix

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering, Security/Compliance, Product
**Status:** Implementation-grade specification
**Last reviewed:** 2026-06-26

---

## 1. Purpose & Scope

This document is the authoritative source of truth for **authorization** across the platform. It defines:

1. The eight roles and what each can do, in business terms.
2. A complete **role × resource × action** permissions matrix.
3. The **external Seller isolation** model (the single most security-sensitive boundary in the system).
4. **Transaction-level scoping** via reviewer assignment, and the **least-privilege** rules that govern it.
5. The mapping from this model to **Postgres Row Level Security (RLS)** policies.
6. A **permission-key naming convention** that the codebase (middleware, server actions, RLS, UI guards) must use verbatim.

Authentication (who you are) is covered in the Auth & Identity document. This document concerns **authorization** (what you may do) only. Internal users authenticate via Microsoft Entra ID (SSO); the external Seller authenticates via Supabase Auth (email + magic link / OTP, MFA-eligible).

### Design tenets

- **Deny by default.** Every resource starts inaccessible. Access is granted by explicit grant only.
- **Defense in depth.** Authorization is enforced at three layers — UI (hide/disable), API/server-action (reject), and database (RLS). The database is the final, non-bypassable backstop. UI hiding is UX, never security.
- **Least privilege.** A role receives the narrowest set of permissions required for its function. Category-specialist reviewers do not see other categories' sensitive data by default.
- **Transaction scoping over global roles.** Most permissions are not "can do X" but "can do X *on transactions I'm assigned to*." Role grants the *verb*; assignment grants the *object*.
- **The Seller is a tenant of exactly one transaction** and is structurally incapable of perceiving the existence of any other transaction, any internal artifact, or any internal user identity beyond a generic "M&A Team" display name.

---

## 2. Role Catalog

There are **8 roles**: 7 internal (acquiring company) and 1 external.

| # | Role key | Role name | Class | Trust tier | Default transaction visibility |
|---|----------|-----------|-------|-----------|-------------------------------|
| 1 | `admin` | Admin | Internal | Tier 0 (platform) | All transactions |
| 2 | `coordinator` | M&A Coordinator | Internal | Tier 1 (deal owner) | All transactions (operationally), full control on owned |
| 3 | `executive` | Executive Leadership | Internal | Tier 1 (oversight) | All transactions (read-heavy) |
| 4 | `finance_reviewer` | Finance Reviewer | Internal | Tier 2 (specialist) | Assigned transactions only |
| 5 | `operations_reviewer` | Operations Reviewer | Internal | Tier 2 (specialist) | Assigned transactions only |
| 6 | `legal_reviewer` | Legal/Compliance Reviewer | Internal | Tier 2 (specialist) | Assigned transactions only |
| 7 | `hr_reviewer` | HR Reviewer | Internal | Tier 2 (specialist) | Assigned transactions only |
| 8 | `seller` | Seller / Acquisition Candidate | **External** | Tier 3 (untrusted, isolated) | **Exactly one transaction** |

> **Implementation note.** Roles are stored in `app_role` enum and assigned in two places:
> - **Global role** (`profiles.global_role`) — the role tier a user carries everywhere (e.g., `admin`, `coordinator`, `executive`, `finance_reviewer`).
> - **Per-transaction assignment** (`transaction_members` rows) — binds a specialist (or coordinator) to a specific transaction with a scoped role and category grants.
>
> The Seller is never written to `transaction_members` as an internal member; it is represented by a `seller_participants` row that joins the seller's `auth.uid()` to exactly one `transaction_id`.

### 2.1 Admin

The platform owner / superuser for the acquiring company. Responsible for system configuration, not deal execution.

- **Can:** manage users and role assignments; configure SharePoint, Outlook, and AI integrations; manage diligence templates and the AMA Healthcare Diligence List; manage global settings; view audit logs; access all transactions for support/break-glass purposes (logged).
- **Should not (by convention):** routinely act inside deals or override deal metrics. Admin is infrastructure, not a deal role. Break-glass access to deal content is audited and alertable.
- **Sensitive credential category (A. Logins/Passwords):** Admin can configure *who* may access the secure credential workflow but is **not** granted blanket plaintext credential read; credential reveal is gated by a separate `credential:reveal` grant and step-up auth (see §6.4).

### 2.2 M&A Coordinator

The operational owner and quarterback of acquisitions. The "deal driver."

- **Can:** create/edit/archive transactions; manage external contacts and the Seller invitation; build and assign diligence items; assign internal reviewers and set category grants; manage data room structure; upload/view/download all documents on their transactions; write and read internal notes and seller-facing notes; configure reminders and schedule meetings; view AI summaries, AI deal score, valuation, KPI dashboard, and risk log; **request** but not unilaterally finalize executive-only sign-offs.
- **Cannot:** manage platform users, integration configs, or AI settings (Admin domain); override the AI deal score (that is an executive control — see §6.5); see transactions where they hold no membership unless granted org-wide coordinator visibility (configurable; default ON for read, OFF for write).

### 2.3 Executive Leadership

Decision-makers (e.g., CEO, CFO, CMO, Head of Corporate Development) who consume diligence outputs and make go/no-go calls.

- **Can:** read across all transactions (portfolio view); view valuation, AI deal score, KPI dashboard, risk log, AI summaries; **override / sign off** the AI deal score and final valuation recommendation (the `metric:override` capability); add executive deal commentary (a restricted note class); approve/decline a deal stage gate.
- **Cannot:** perform document-level diligence operations (upload/delete), edit diligence item mechanics, manage contacts, or touch platform/integration config. Read-broad, write-narrow-and-high.

### 2.4 Finance Reviewer

Specialist for categories **B. Finance/Accounting** and **C. Revenue Cycle/Billing**.

- **Can (on assigned transactions, within granted categories):** view/download documents; set internal review status (Uploaded → Under Review → Accepted / Rejected / Needs Clarification); write internal notes; write seller-facing clarification notes; flag human-review-required; contribute to valuation inputs (financial line items) if granted `valuation:contribute`; view category-relevant slices of the KPI dashboard and risk log.
- **Cannot:** see categories they are not granted (e.g., HR/Payroll PII) by default; manage assignments; override deal score; create transactions; configure anything.

### 2.5 Operations Reviewer

Specialist for **E. Operations/Clinical** and (commonly co-granted) **G. IT/EMR/Systems**.

- Same capability shape as Finance Reviewer, scoped to Operations/Clinical/IT categories and operational risk-log entries.

### 2.6 Legal/Compliance Reviewer

Specialist for **H. Legal/Contracts/Business** and **D. Providers/Credentialing** (compliance dimension).

- Same capability shape, scoped to Legal/Contracts and credentialing/compliance.
- **Elevated:** typically the role granted `credential:reveal` eligibility for category **A. Logins/Passwords** during post-signing transition, alongside Coordinator, under step-up auth. Compliance reviewers often own the risk log's regulatory entries (Stark, Anti-Kickback, HIPAA, licensure).

### 2.7 HR Reviewer

Specialist for **F. HR/Payroll**.

- Same capability shape, scoped to HR/Payroll. **PII-sensitive:** employee rosters, comp, benefits, I-9/W-4 data. HR Reviewer's category grant is *exclusive by default* — other specialists do not receive `category:F` unless explicitly granted, because of PII minimization.

### 2.8 Seller / Acquisition Candidate (External)

The selling practice's representative(s). **Untrusted, isolated, single-transaction tenant.**

- **Can — and only can — within their one transaction:**
  - View the diligence items **assigned to them** (item name, category, needed timeline, due date, status, seller-facing notes only).
  - **Upload** documents to an item's upload link.
  - **Replace** a previously uploaded document (versioned).
  - Mark an item **Not Applicable** (request — sets diligence request status to `Not Applicable`, subject to internal acceptance).
  - **Comment** on an item (seller-facing notes thread only).
  - Set/confirm request status from their side: `Received` (acknowledged), `Pending`, `Not Applicable` (`Denied` is internal-only when used as a *review* outcome; see status note below).
  - View *their own* upload history and the high-level item status the internal team chooses to expose.
- **Can NEVER (hard boundary — see §4):**
  - See any other transaction or even that other transactions exist.
  - See **internal notes**, **AI classification/confidence**, **AI summary**, **AI deal score**, **valuation**, **KPI dashboard**, **risk log**, or any **deal commentary**.
  - See internal review statuses beyond a sanitized public projection (e.g., internal `Under Review` may surface to the seller as a neutral "With our team"; `Rejected`/`Needs Clarification` surface only as a seller-safe request for more info — never internal rejection rationale).
  - See internal reviewer identities, assignment, or which internal user touched an item — only a generic "M&A Team."
  - Download documents *uploaded by the internal team* (the data room is internal; the seller only sees the items and their own uploads).
  - Delete documents (replace/version only; hard delete is internal).
  - Access settings, admin, templates, integrations, or user management of any kind.

---

## 3. Resource / Action Taxonomy

Every protected operation is a `resource:action` pair. The full resource set:

| Resource | Description |
|----------|-------------|
| `transaction` | An acquisition deal (the top-level scoping object) |
| `contact` | External contacts at the seller practice (and internal contact records) |
| `data_room` | The SharePoint-backed document repository structure for a transaction |
| `diligence_item` | A single AMA Diligence List item instance on a transaction |
| `document` | A file (upload/view/download/delete/replace) |
| `internal_note` | Internal-only notes on items/transactions |
| `seller_note` | Seller-facing notes / clarification threads |
| `ai_summary` | AI-generated diligence/document summaries |
| `ai_classification` | AI category/type classification + confidence on an item/doc |
| `deal_score` | AI deal score |
| `valuation` | Valuation model and outputs |
| `kpi_dashboard` | KPI / metrics dashboard |
| `risk_log` | Risk register entries |
| `reminder` | Automated/manual reminders |
| `meeting` | Outlook-scheduled meetings |
| `settings` | Global application settings |
| `user` | User accounts & role assignment |
| `template` | Diligence templates / AMA list management |
| `sharepoint_config` | SharePoint/Graph integration config |
| `outlook_config` | Outlook/Graph integration config |
| `ai_config` | AI provider/model/prompt/threshold config |
| `credential` | Secure credential (Category A) reveal workflow |
| `audit_log` | Immutable audit trail |

Standard actions: `create`, `read`, `update`, `delete`, plus resource-specific verbs (`upload`, `download`, `replace`, `assign`, `override`, `reveal`, `invite`, `export`, `configure`).

---

## 4. Seller Isolation — The Hard Boundary

> **This is the highest-priority security control in the platform.** A leak here is a deal-breaking, potentially HIPAA-implicating incident. It is enforced redundantly at every layer and assumed-hostile.

### 4.1 What "isolation" means structurally

1. **Single-transaction binding.** A seller principal is bound to exactly **one** `transaction_id` via `seller_participants`. There is no query path — UI, API, or SQL — that returns rows from any other transaction. RLS predicates for every seller-readable table include `transaction_id = current_seller_transaction()`.
2. **Field-level projection, not just row-level.** Even within their transaction, the seller sees a **sanitized projection** of each diligence item. Internal-only columns (`internal_notes`, `ai_classification`, `ai_confidence`, `internal_review_status`, `assigned_internal_reviewer`, `human_review_required`) are **never** selected into seller responses. This is enforced by:
   - A dedicated read path: a Postgres **view** `seller_diligence_item_v` (security-barrier view / security-invoker) that physically omits internal columns, plus a `seller_documents_v` view limited to documents the seller themselves uploaded.
   - Server actions for sellers query **only** these views — never base tables.
3. **Sanitized status mapping.** Internal review statuses are mapped through a fixed translation table before reaching the seller:

   | Internal review status | Seller-visible label |
   |------------------------|----------------------|
   | Uploaded | Submitted |
   | Under Review | With the M&A Team |
   | Accepted / Internal Review Complete | Accepted |
   | Needs Clarification | Action needed: more info requested |
   | Rejected | Action needed: please resubmit |
   | Overdue | Past due |

   The seller never sees the literal internal enum, internal rejection reasoning, or any AI-derived field. Only the seller-facing note attached to a clarification/rejection is shown.
4. **Identity opacity.** Internal reviewer names, emails, and assignment metadata are stripped. The seller sees a single generic actor: **"M&A Team."** Outlook meeting invitations to the seller use a shared/coordinator mailbox or scrub internal attendee lists where policy requires.
5. **No enumeration.** No endpoint accepts a `transaction_id` from a seller and trusts it. The seller's transaction is derived **server-side** from their session (`current_seller_transaction()`), never from a request parameter. Any seller request carrying a mismatched `transaction_id` is rejected (403) and audited as a potential probe.
6. **Upload sandbox.** Seller uploads land in a quarantined SharePoint/storage path scoped to their transaction, are virus/malware-scanned, and are surfaced to internal users only after scan-clean. The seller cannot list the broader data room, traverse folders, or fetch internal documents.

### 4.2 Seller capability allowlist (everything else is denied)

The seller's *entire* permission set:

```
transaction:read           (own transaction, sanitized projection only)
diligence_item:read         (assigned items, via seller view)
diligence_item:set_status   (Received / Pending / Not Applicable only)
document:upload             (to assigned item upload links)
document:replace            (own prior uploads; versioned)
document:read               (own uploads only)
seller_note:create          (seller-facing thread)
seller_note:read            (seller-facing thread)
```

Explicitly and permanently denied to sellers (non-exhaustive but enforced as a deny-list backstop): `internal_note:*`, `valuation:*`, `deal_score:*`, `ai_summary:*`, `ai_classification:*`, `kpi_dashboard:*`, `risk_log:*`, `document:download` (internal docs), `document:delete`, `contact:*`, `data_room:*` (structure), `reminder:*`, `meeting:create`, `settings:*`, `user:*`, `template:*`, `*_config:*`, `credential:*`, `audit_log:*`, and **any** read of a transaction other than their own.

---

## 5. Transaction-Level Scoping & Least Privilege

### 5.1 Two-dimensional authorization: verb × object

A permission decision is the **AND** of two checks:

1. **Capability check** — does the user's role grant the `resource:action` *verb*? (global)
2. **Scope check** — is the user bound to *this* transaction (and, for specialists, this *category*)? (per-object)

```
allow(user, action, object) :=
    role_grants(user.role, action)            -- verb
AND in_scope(user, object.transaction_id)     -- object
AND (action.category is null
     OR category_granted(user, object.category))  -- category (specialists)
```

### 5.2 Scope tiers

| Tier | Roles | Scope rule |
|------|-------|-----------|
| Org-wide read | Admin, Executive, (Coordinator-read default ON) | `in_scope` always true for **read**; writes still gated by capability |
| Org-wide write | Admin (config only), Coordinator (deal ops on owned/assigned) | true where role owns/leads transaction |
| Transaction-scoped | Finance / Operations / Legal / HR Reviewers | `in_scope` ⇔ row exists in `transaction_members(user, transaction)` |
| Category-scoped | All specialist reviewers | additionally requires `category_grants` row for the item's category |
| Single-transaction | Seller | `in_scope` ⇔ `transaction_id = current_seller_transaction()` |

### 5.3 Reviewer assignment

- The **M&A Coordinator** (and Admin) assigns reviewers to a transaction by inserting `transaction_members(transaction_id, user_id, scoped_role, category_grants[])`.
- `category_grants` is an array of category letters (`B`,`C`,…). A Finance Reviewer assigned with `{B,C}` sees only Finance/Accounting and Revenue Cycle items on that deal.
- **Category A (Logins/Passwords)** is never in default grants; it requires explicit, separately audited `credential:reveal` eligibility and is defaulted to Post-Signing timeline.
- **Category F (HR/Payroll)** PII is exclusive to HR Reviewer by default; co-granting requires a justification note (captured in audit log).
- Removing a `transaction_members` row instantly revokes all scoped access (RLS re-evaluates per query). No cached grant survives.

### 5.4 Least-privilege rules (enforced)

1. Specialists default to **their categories only** — cross-category visibility is opt-in per assignment, never automatic.
2. **Write implies prior read scope**, never the reverse. Read access does not confer write.
3. **High-impact verbs are role-pinned**, not delegable: `metric:override` (deal score / valuation sign-off) is Executive-only; `*_config:configure` and `user:*` are Admin-only; `credential:reveal` is grant-gated + step-up.
4. **Seller is allowlist-only.** Sellers are subject to an explicit allowlist *and* a redundant deny-list; either failing denies.
5. **No ambient admin.** Admin's access to deal *content* (not config) is break-glass: permitted, but flagged and audited, and surfaced in the transaction's activity feed.

---

## 6. Master Permissions Matrix (Role × Resource × Action)

**Legend**
- ✅ Full — permitted (subject to transaction/category scope where the role is scoped)
- 🔵 Scoped — permitted only on assigned transactions / granted categories
- 👁 Read-only
- 🟡 Conditional — permitted with extra gate (grant flag, step-up auth, or break-glass; see footnote)
- ⬜ — not permitted
- 🚫 — **structurally forbidden** (hard deny, enforced at DB + deny-list)

> Where a cell shows 🔵 for a specialist, the underlying capability is granted but only on transactions the reviewer is assigned to, and (for category-bearing resources) only within granted categories.

### 6.1 Transactions, Contacts, Data Room

| Resource:Action | Admin | Coordinator | Executive | Finance R. | Operations R. | Legal R. | HR R. | Seller |
|---|---|---|---|---|---|---|---|---|
| `transaction:create` | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `transaction:read` | ✅ | ✅ (all) | 👁 (all) | 🔵 | 🔵 | 🔵 | 🔵 | 🟡¹ |
| `transaction:update` | ✅ | ✅ (owned) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `transaction:delete`/archive | ✅ | 🟡² | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `transaction:assign_reviewers` | ✅ | ✅ (owned) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `contact:create` | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `contact:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `contact:update` | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `contact:delete` | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `data_room:read` (structure) | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `data_room:manage` (folders) | ✅ | ✅ (owned) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `seller:invite` | ✅ | ✅ (owned) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |

¹ Seller `transaction:read` returns **only** their own transaction via the sanitized seller view.
² Coordinator archive permitted on owned deals; hard delete is Admin-only.

### 6.2 Diligence Items & Documents

| Resource:Action | Admin | Coordinator | Executive | Finance R. | Operations R. | Legal R. | HR R. | Seller |
|---|---|---|---|---|---|---|---|---|
| `diligence_item:create` | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `diligence_item:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🟡³ |
| `diligence_item:update` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `diligence_item:set_review_status` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `diligence_item:set_request_status` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🟡⁴ |
| `diligence_item:assign` (contact/reviewer) | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `diligence_item:flag_human_review` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `document:upload` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🔵⁵ |
| `document:read`/view | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🟡⁶ |
| `document:download` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫⁷ |
| `document:replace` (version) | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🔵⁵ |
| `document:delete` (hard) | ✅ | 🟡² | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `credential:reveal` (Cat. A) | 🟡⁸ | 🟡⁸ | ⬜ | ⬜ | ⬜ | 🟡⁸ | ⬜ | 🚫 |

³ Seller reads via `seller_diligence_item_v` — assigned items, sanitized fields only.
⁴ Seller may set request status to **Received / Pending / Not Applicable** only; `Denied` as a review outcome is internal.
⁵ Seller upload/replace limited to upload links on items assigned to them; quarantined + scanned.
⁶ Seller may view **only documents they uploaded**; internal documents are not listed or fetchable.
⁷ Seller cannot download internal documents; replace/version of own files only.
⁸ `credential:reveal` requires (a) an explicit per-transaction grant flag, **and** (b) step-up MFA re-auth, **and** is fully audited; defaulted to Post-Signing.

### 6.3 Notes, AI, Valuation, Metrics, Risk

| Resource:Action | Admin | Coordinator | Executive | Finance R. | Operations R. | Legal R. | HR R. | Seller |
|---|---|---|---|---|---|---|---|---|
| `internal_note:create` | ✅ | ✅ | ✅⁹ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `internal_note:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `seller_note:create` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🔵 |
| `seller_note:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🔵 |
| `ai_summary:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `ai_summary:generate` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `ai_classification:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `ai_classification:override` | ✅ | ✅ | ⬜ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `deal_score:read` | ✅ | ✅ | 👁 | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🚫 |
| `deal_score:override` (`metric:override`) | ⬜¹¹ | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `valuation:read` | ✅ | ✅ | 👁 | 🔵¹⁰ | ⬜ | ⬜ | ⬜ | 🚫 |
| `valuation:contribute` (inputs) | ✅ | ✅ | ⬜ | 🟡¹² | ⬜ | ⬜ | ⬜ | 🚫 |
| `valuation:override`/sign-off | ⬜ | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `kpi_dashboard:read` | ✅ | ✅ | 👁 | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🚫 |
| `risk_log:read` | ✅ | ✅ | 👁 | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🔵¹⁰ | 🚫 |
| `risk_log:create`/update | ✅ | ✅ | ✅⁹ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `deal_commentary:create` (exec) | ⬜ | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |

⁹ Executive notes/risk entries are a restricted **executive commentary** class, readable by internal users, never the seller.
¹⁰ Specialist read of cross-cutting metrics is **category-filtered**: a Finance Reviewer sees the financial slice of the KPI dashboard/risk log; HR sees the HR slice. Full unfiltered view is Coordinator/Executive/Admin.
¹¹ Admin does **not** hold `metric:override`; metric sign-off is an Executive business decision, deliberately separated from platform administration.
¹² `valuation:contribute` is grant-gated: Finance Reviewer must hold the `valuation:contribute` flag on the assignment to push financial inputs into the model; they still cannot override the final number.

### 6.4 Reminders, Meetings, Platform Admin & Config

| Resource:Action | Admin | Coordinator | Executive | Finance R. | Operations R. | Legal R. | HR R. | Seller |
|---|---|---|---|---|---|---|---|---|
| `reminder:create`/update | ✅ | ✅ | ⬜ | 🔵¹³ | 🔵¹³ | 🔵¹³ | 🔵¹³ | 🚫 |
| `reminder:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🟡¹⁴ |
| `meeting:create` (Outlook) | ✅ | ✅ | ✅ | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `meeting:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🟡¹⁴ |
| `settings:read` | ✅ | 👁 | 👁 | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `settings:configure` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `user:read` | ✅ | 👁¹⁵ | 👁¹⁵ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `user:create`/update/deactivate | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `user:assign_role` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `template:read` | ✅ | ✅ | 👁 | 🔵 | 🔵 | 🔵 | 🔵 | 🚫 |
| `template:manage` (AMA list) | ✅ | 🟡¹⁶ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `sharepoint_config:configure` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `outlook_config:configure` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `ai_config:configure` | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |
| `audit_log:read` | ✅ | 🟡¹⁷ | 👁¹⁷ | ⬜ | ⬜ | ⬜ | ⬜ | 🚫 |

¹³ Reviewers may create reminders only for items they own on assigned transactions.
¹⁴ Seller sees only reminders/meetings the team explicitly extends to them (seller-facing), scrubbed of internal attendees.
¹⁵ Coordinator/Executive `user:read` is a directory view (name/role/availability) for assignment; not full account admin.
¹⁶ Coordinator may manage per-transaction template *instances* (which items apply to this deal); editing the global AMA master list is Admin-only.
¹⁷ Coordinator/Executive audit visibility is scoped to their transactions' activity feed; the full platform audit log is Admin-only.

---

## 7. Mapping to Postgres Row Level Security (RLS)

RLS is the **non-bypassable backstop**. Even if the API layer is compromised or a query is malformed, the database refuses out-of-scope rows. Every multi-tenant table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.

### 7.1 Identity & helper functions

The current user is `auth.uid()` (Supabase JWT). We derive context with `SECURITY DEFINER` helpers (stable, schema-locked, no search-path injection):

```sql
-- Global role for an internal user (null for sellers)
create or replace function app.current_global_role()
returns app_role language sql stable security definer
set search_path = '' as $$
  select global_role from public.profiles where id = auth.uid()
$$;

-- True if the user is an internal member of this transaction
create or replace function app.is_member(txn uuid)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.transaction_members m
    where m.user_id = auth.uid() and m.transaction_id = txn
  )
$$;

-- True if the user holds a category grant on this transaction
create or replace function app.has_category(txn uuid, cat text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.transaction_members m
    where m.user_id = auth.uid()
      and m.transaction_id = txn
      and cat = any(m.category_grants)
  )
$$;

-- The seller's single bound transaction (null for internal users)
create or replace function app.current_seller_transaction()
returns uuid language sql stable security definer
set search_path = '' as $$
  select transaction_id from public.seller_participants
  where user_id = auth.uid()
$$;

-- Convenience: org-wide reader (admin / executive / coordinator)
create or replace function app.is_org_reader()
returns boolean language sql stable security definer
set search_path = '' as $$
  select app.current_global_role() in ('admin','executive','coordinator')
$$;
```

### 7.2 Canonical RLS patterns

**Transactions** — internal read broad, seller read pinned, write narrow:

```sql
-- READ: org readers see all; specialists see assigned; sellers see only theirs
create policy txn_read on public.transactions
for select using (
      app.is_org_reader()
   or app.is_member(id)
   or id = app.current_seller_transaction()
);

-- WRITE: only admin or coordinator (and coordinator only as deal owner)
create policy txn_write on public.transactions
for update using (
      app.current_global_role() = 'admin'
   or (app.current_global_role() = 'coordinator' and owner_id = auth.uid())
) with check (
      app.current_global_role() = 'admin'
   or (app.current_global_role() = 'coordinator' and owner_id = auth.uid())
);
```

**Diligence items** — category-scoped specialists, seller via view only:

```sql
create policy item_read_internal on public.diligence_items
for select using (
      app.is_org_reader()
   or (app.is_member(transaction_id) and app.has_category(transaction_id, category))
);

-- NOTE: sellers do NOT read this base table. They are routed to
-- seller_diligence_item_v, which omits internal_notes / ai_* / internal_review_status
-- and filters: transaction_id = app.current_seller_transaction()
--          AND assigned_seller_contact = auth.uid()
```

**Internal notes** — hard-walled from sellers at the table level:

```sql
alter table public.internal_notes enable row level security;
alter table public.internal_notes force row level security;

create policy internal_note_rw on public.internal_notes
for all using (
      app.is_org_reader()
   or app.is_member(transaction_id)
) with check (
      app.is_org_reader()
   or app.is_member(transaction_id)
);
-- There is intentionally NO policy clause referencing current_seller_transaction().
-- With RLS forced and no seller-granting policy, sellers match zero rows. Hard deny.
```

**Deal score / valuation override** — Executive-only `with check`:

```sql
create policy deal_score_override on public.deal_scores
for update using (app.is_org_reader())
with check (app.current_global_role() = 'executive');
-- Read is allowed to org readers + scoped specialists (separate select policy);
-- only an executive's UPDATE survives the with-check.
```

**Documents** — seller sees only own uploads, never internal docs:

```sql
create policy doc_read on public.documents
for select using (
      app.is_org_reader()
   or app.is_member(transaction_id)
   or ( transaction_id = app.current_seller_transaction()
        and uploaded_by = auth.uid()
        and source = 'seller_upload' )
);
```

### 7.3 RLS principles

1. **Forced RLS everywhere** multi-tenant — `FORCE ROW LEVEL SECURITY` so even the table owner is subject to policy; service-role usage is confined to narrowly audited server functions.
2. **No seller policy = seller denied.** For internal-only tables, we simply omit any seller-referencing policy. With RLS forced and deny-by-default, the seller matches nothing. This is the cleanest expression of the hard boundary.
3. **Field-level isolation via views, not just policies.** Seller responses go through `security_barrier` / `security_invoker` views that *physically exclude* internal columns — RLS controls rows, views control columns.
4. **Server-derived scope.** `current_seller_transaction()` reads the seller's binding from the DB by `auth.uid()`; the client cannot supply or spoof it.
5. **WITH CHECK on every write policy** to prevent privilege escalation via update (e.g., reassigning a row to a transaction you can read but not own).
6. **Helper functions are `STABLE SECURITY DEFINER` with locked `search_path`** to avoid recursion in policies and search-path injection.
7. **Step-up & break-glass** (credential reveal, admin deal access) are enforced in the application/edge layer (re-auth, AAL2 claim check) and *recorded* in `audit_log`; RLS gates the row, the app gates the ceremony.

---

## 8. Permission-Key Naming Convention (Codebase Contract)

A single canonical permission vocabulary is shared by **UI guards**, **API/server-action middleware**, **RLS helper logic**, and **audit events**. One spelling, everywhere.

### 8.1 Grammar

```
<resource>:<action>[:<qualifier>]
```

- **resource** — singular, snake_case noun from §3 (`transaction`, `diligence_item`, `internal_note`, `deal_score`, `sharepoint_config`).
- **action** — lowercase verb (`create`, `read`, `update`, `delete`, `upload`, `download`, `replace`, `assign`, `override`, `reveal`, `invite`, `configure`, `generate`, `contribute`, `export`).
- **qualifier** *(optional)* — narrows the action (`diligence_item:set_status:request`, `metric:override:deal_score`).

Aliases for cross-cutting high-impact verbs are intentionally short and stable:

| Alias key | Expands to | Meaning |
|-----------|-----------|---------|
| `metric:override` | `deal_score:override` + `valuation:override` | Executive sign-off on AI/financial outputs |
| `document:manage` | upload + replace + delete | Coordinator document control |
| `config:write` | `{sharepoint,outlook,ai}_config:configure` + `settings:configure` | Admin integration/config control |

### 8.2 Canonical key registry (excerpt)

| Permission key | Granted to (default) | Scope |
|----------------|----------------------|-------|
| `transaction:create` | admin, coordinator | global |
| `transaction:read` | all internal; seller (own) | scoped |
| `transaction:update` | admin, coordinator(owner) | scoped |
| `transaction:assign_reviewers` | admin, coordinator(owner) | scoped |
| `contact:manage` | admin, coordinator | scoped |
| `diligence_item:create` | admin, coordinator | scoped |
| `diligence_item:set_review_status` | admin, coordinator, specialists | scoped+category |
| `diligence_item:set_status:request` | specialists, **seller** (limited) | scoped |
| `document:upload` | internal scoped, **seller** (assigned items) | scoped |
| `document:download` | internal scoped | scoped |
| `document:replace` | internal scoped, **seller** (own) | scoped |
| `document:delete` | admin, coordinator(owner) | scoped |
| `internal_note:read` / `:create` | internal scoped | scoped — **never seller** |
| `seller_note:read` / `:create` | internal scoped, **seller** | scoped |
| `ai_summary:read` / `:generate` | internal scoped | scoped — **never seller** |
| `ai_classification:override` | coordinator, specialists | scoped+category |
| `deal_score:read` | internal (category-filtered for specialists) | scoped |
| `metric:override` | **executive only** | scoped |
| `valuation:contribute` | finance (flag-gated) | scoped+flag |
| `valuation:read` | admin, coordinator, executive, finance | scoped |
| `kpi_dashboard:read` | internal (category-filtered) | scoped |
| `risk_log:read` / `:write` | internal scoped | scoped |
| `credential:reveal` | grant-gated (coordinator, legal, admin) | scoped+stepup |
| `reminder:manage` | admin, coordinator, specialists(own) | scoped |
| `meeting:create` | internal | scoped |
| `user:manage` / `user:assign_role` | **admin only** | global |
| `template:manage` | admin (global), coordinator (instance) | global/scoped |
| `sharepoint_config:configure` | **admin only** | global |
| `outlook_config:configure` | **admin only** | global |
| `ai_config:configure` | **admin only** | global |
| `audit_log:read` | admin (full), coordinator/exec (scoped) | global/scoped |

### 8.3 Enforcement surfaces

| Layer | Mechanism | Uses keys for |
|-------|-----------|---------------|
| UI | `<Can permission="document:upload" txn={id}>` guard component; nav/feature gating | hide/disable (UX only) |
| Server Action / Route | `assertPermission(user, 'diligence_item:update', { txn, category })` before any mutation | reject (401/403) |
| Database | RLS policies + helper functions encode the same scope logic | final backstop |
| Audit | every mutation emits `{ actor, permission_key, resource_id, txn, outcome, ts }` | traceability |

> **Invariant.** The set of keys a role can satisfy in the UI must be a **subset** of what the server action allows, which must be a subset of what RLS permits. If any layer is more permissive than the layer below it, that is a bug. CI includes a contract test that asserts each role's effective key set is consistent across all three layers and that the seller's effective set never intersects the forbidden deny-list in §4.2.

---

## 9. Summary of Hard Invariants

1. **Seller ⊆ one transaction, sanitized projection, allowlist-only** — enforced at view, RLS (by omission), server-derived scope, and a redundant deny-list.
2. **`metric:override` is Executive-only** — not Admin, not Coordinator.
3. **All `*_config:configure`, `user:*` are Admin-only.**
4. **Specialists are transaction-scoped AND category-scoped**; cross-category and Category A/F access is explicit, justified, and audited.
5. **Deny-by-default + forced RLS** is the foundation; UI hiding is never relied upon for security.
6. **One permission vocabulary** spans UI, API, DB, and audit, with a CI contract test guaranteeing the three layers agree.
