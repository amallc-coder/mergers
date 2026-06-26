# Product Requirements Document — Healthcare M&A Diligence Workflow Platform

| Field | Value |
|---|---|
| Document | 01 — Product Requirements Document (PRD) |
| Product | AMA Healthcare M&A Diligence Workflow Platform |
| Audience | Product, Engineering, Security, Executive Sponsors, Implementation Partners |
| Owner | Principal Product/Engineering Architect |
| Status | Approved for Build — Phase 1 |
| Version | 1.0 |
| Last Updated | 2026-06-26 |

---

## 1. Vision & Objectives

### 1.1 Vision

A single, turnkey command center for an **acquiring** healthcare organization to run every practice acquisition — primary care, specialty groups, Rural Health Clinics (RHCs), physician groups, and multi-location outpatient groups — from first contact through post-signing transition. The platform replaces the prevailing reality of ad-hoc email threads, shared drives, spreadsheet trackers, and tribal knowledge with a structured, auditable, AI-accelerated diligence pipeline.

The platform treats diligence as a **production line**: a standardized request list (the AMA Healthcare Diligence List) is issued to each seller, documents flow in through a secure portal, AI auto-organizes and classifies them, reviewers accept or reject, KPIs are extracted, executive summaries and a deal health score are generated, risks and missing items surface automatically, and everything synchronizes to SharePoint as the system of record.

### 1.2 Strategic Objectives

| # | Objective | Target Outcome |
|---|---|---|
| O1 | **Compress diligence cycle time** | Reduce average days-to-diligence-complete by ≥40% vs. the current email/spreadsheet baseline. |
| O2 | **Standardize the diligence process** | Every transaction runs the same 8-category list, the same 20 stages, and the same review SLAs, regardless of practice type or deal team. |
| O3 | **Increase deal throughput per coordinator** | Enable a single M&A Coordinator to manage 3–5x more concurrent transactions through automation and AI assist. |
| O4 | **Reduce diligence risk & surprises** | Surface missing documents, expiring credentials, payer-contract risks, and financial red flags before signing, not after. |
| O5 | **Create an auditable, defensible record** | Every status change, document action, AI decision, and access event is logged for SOC 2-style audit and post-close legal defensibility. |
| O6 | **Deliver executive-grade visibility** | Leadership sees a live portfolio of deals with health scores, KPIs, and next steps without asking the deal team for status. |
| O7 | **Protect sensitive data** | HIPAA-conscious handling of PHI/PII and a hardened credential-handoff workflow for logins/passwords. |

### 1.3 Guiding Principles

- **Turnkey over configurable.** Sensible defaults (default list, default stages, default SLAs) ship out of the box; configuration is optional, not required.
- **AI assists, humans decide.** AI classifies, extracts, summarizes, and flags — but acceptance/rejection, risk sign-off, and deal decisions remain human, with confidence scores and a human-review-required gate.
- **Seller isolation is absolute.** External sellers see only their own transaction, only seller-facing content, never another deal, never internal notes.
- **SharePoint is the durable record; the app is the workflow brain.** The platform orchestrates; SharePoint persists the documents of record.
- **Every action is attributable.** No anonymous mutations; full audit trail.

---

## 2. Problem Statement

Acquiring organizations growing through acquisition face a diligence process that is slow, error-prone, and unauditable:

1. **Fragmented intake.** Sellers email documents to whoever they know; files land in inboxes and personal drives. Nobody has a single, current view of what was requested, received, denied, or still outstanding.
2. **Manual organization.** Coordinators rename, sort, and file hundreds of documents per deal by hand into category folders. This is hours of low-value work and a frequent source of misfiling.
3. **No standardization.** Each deal lead runs diligence their own way. Lists drift, categories differ, and SLAs are informal, so deals are not comparable and quality is uneven.
4. **Pre-signing vs. post-signing confusion.** Items that must be obtained before signing get tangled with items that can wait until after, causing both premature exposure (e.g., credentials shared too early) and dangerous gaps (e.g., a missing payer contract discovered post-close).
5. **Slow, reactive risk discovery.** Missing documents, expiring licenses/credentials, and financial anomalies are found late — sometimes after signing — because nobody is systematically watching the gaps.
6. **Executive blindness.** Leadership cannot see deal status without interrupting the team. There is no portfolio view, no health score, no early-warning signal.
7. **Weak auditability.** When a regulator, lawyer, or board asks "who saw what, when, and what was decided," the answer lives in scattered email and memory.
8. **Sensitive-credential exposure.** Logins and passwords for clinical and financial systems are frequently shared over insecure channels with no controlled hand-off, retention, or revocation.

The platform exists to convert this from a manual, fragmented, reactive process into a **standardized, automated, auditable, proactive** one.

---

## 3. Target Users & Personas

The platform has **8 roles**: 7 internal (to the acquiring company) and 1 external (the seller). All internal access is governed by role-based access control (RBAC); the external role is governed by strict per-transaction isolation.

### 3.1 Internal Roles

#### Persona 1 — Admin
- **Who:** IT/security or program owner for the M&A function.
- **Goals:** Provision users and roles; configure default diligence lists, stages, and SLAs; manage integrations (SharePoint, Graph, Entra ID, AI providers); govern the audit log and data retention.
- **Pains today:** No central control; security relies on individual discipline.
- **Key capabilities:** Full configuration, user/role management, integration credentials, audit-log access, system settings, the sensitive credential-vault policy. **Not** intended to be a day-to-day deal operator.
- **Success looks like:** Onboarding a new reviewer takes minutes; every integration and policy is centrally controlled and logged.

#### Persona 2 — M&A Coordinator
- **Who:** The operational hub of every deal; runs the diligence pipeline day to day.
- **Goals:** Create transactions, generate data rooms, send diligence requests, chase outstanding items, assign reviewers, keep statuses current, and drive each deal through the 20 stages.
- **Pains today:** Manual chasing, manual filing, no single source of truth, constant status reporting to leadership.
- **Key capabilities:** Create/manage transactions; full diligence-tracker control; send requests and reminders; reassign items; manage the seller relationship; trigger summaries and meetings; full visibility within assigned deals.
- **Success looks like:** Manages 3–5x more deals; spends time on judgment, not filing and chasing.

#### Persona 3 — Executive Leadership
- **Who:** CEO/COO/CFO/CMO and corporate development sponsors.
- **Goals:** Portfolio-level visibility; deal health at a glance; KPIs and executive summaries; informed go/no-go and pacing decisions.
- **Pains today:** Must interrupt deal teams for status; no comparable metrics across deals.
- **Key capabilities:** Read-mostly across all transactions; executive summary and KPI dashboards; deal health scores; risk and next-step views; notification subscriptions for key milestones. Limited need to touch individual documents.
- **Success looks like:** Opens a dashboard, sees every live deal's health, KPIs, risks, and next steps without sending a single "what's the status?" email.

#### Persona 4 — Finance Reviewer
- **Who:** Finance/accounting SME.
- **Goals:** Review Finance/Accounting (Category B) and Revenue Cycle/Billing (Category C) submissions; validate financial KPIs; flag financial risk.
- **Key capabilities:** Review queue scoped to assigned items/categories; accept/reject/request clarification; confirm or correct AI-extracted KPIs; add internal notes; raise financial risks to the deal health score.
- **Success looks like:** A clean, prioritized review queue with AI-extracted figures pre-populated for confirmation rather than manual transcription.

#### Persona 5 — Operations Reviewer
- **Who:** Operations/clinical operations SME.
- **Goals:** Review Operations/Clinical (Category E) and IT/EMR/Systems (Category G) submissions; assess operational readiness and transition complexity.
- **Key capabilities:** Category-scoped review queue; accept/reject/clarify; operational-risk flags; transition/readiness notes feeding the health score.
- **Success looks like:** Operational risks (staffing, EMR migration, location footprint) are visible and tracked early.

#### Persona 6 — Legal/Compliance Reviewer
- **Who:** Legal counsel / compliance officer.
- **Goals:** Review Legal/Contracts/Business (Category H) and the compliance dimensions of Providers/Credentialing (Category D); identify contractual, regulatory, and credentialing risk.
- **Key capabilities:** Category-scoped review queue; accept/reject/clarify; contract and credential risk flags; compliance notes; visibility into payer contracts, leases, corporate documents, and provider credentialing.
- **Success looks like:** Contract anomalies, change-of-control clauses, and credentialing gaps surface before signing.

#### Persona 7 — HR Reviewer
- **Who:** HR/people-operations SME.
- **Goals:** Review HR/Payroll (Category F) submissions; assess workforce, compensation, benefits, and retention exposure.
- **Key capabilities:** Category-scoped review queue; accept/reject/clarify; workforce/retention risk flags; HR notes feeding the health score.
- **Success looks like:** Workforce risks (key-person dependency, comp gaps, PTO liabilities) are quantified and tracked.

### 3.2 External Role

#### Persona 8 — Seller / Acquisition Candidate
- **Who:** The selling practice's owner, practice manager, or designated contact(s).
- **Goals:** Understand exactly what is needed; upload documents securely; see what is outstanding; communicate with the acquirer.
- **Pains today:** Confusing, repetitive requests; insecure email; no idea what is still owed.
- **Key capabilities:** Access **only their own transaction**; see only seller-facing item names, seller-facing notes, due dates, and status; upload documents; mark items Not Applicable or Denied with reason; respond to clarification requests. **Never** sees internal notes, AI classifications/confidence, reviewer identities, the deal health score, KPIs, executive summaries, or any other transaction.
- **Success looks like:** A clear checklist, secure uploads, and obvious "you're done" / "here's what's left" feedback.

### 3.3 Role × Capability Summary

| Capability | Admin | Coordinator | Exec | Finance | Ops | Legal | HR | Seller |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| System config & integrations | ✔ | — | — | — | — | — | — | — |
| User/role management | ✔ | — | — | — | — | — | — | — |
| Create/manage transactions | ✔ | ✔ | — | — | — | — | — | — |
| Generate data room | ✔ | ✔ | — | — | — | — | — | — |
| Send diligence requests/reminders | ✔ | ✔ | — | — | — | — | — | — |
| Review queue (own categories) | ✔ | ✔ | — | ✔(B,C) | ✔(E,G) | ✔(H,D) | ✔(F) | — |
| Accept/Reject/Clarify | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | — |
| Confirm/edit KPIs | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | — |
| View internal notes | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| View deal health/KPIs/exec summary | ✔ | ✔ | ✔ | ✔(scoped) | ✔(scoped) | ✔(scoped) | ✔(scoped) | — |
| Portfolio view (all deals) | ✔ | scoped | ✔ | — | — | — | — | — |
| Upload documents | ✔ | ✔ | — | — | — | — | — | ✔ |
| See only own transaction | — | — | — | — | — | — | — | ✔ |
| Sensitive credential vault | ✔(policy) | ✔(handoff) | — | — | — | — | — | ✔(submit) |
| Audit log access | ✔ | scoped | — | — | — | — | — | — |

> Category access for reviewers is the **default** mapping and is reassignable per transaction by Admin/Coordinator.

---

## 4. Platform Objective — The 13-Step Turnkey Flow

The platform's central promise is a turnkey, end-to-end diligence pipeline. Each transaction advances through 13 logical steps; steps may overlap or iterate, but the standard happy path is:

| Step | Action | What the platform does | Primary actor |
|---|---|---|---|
| 1 | **Create transaction** | Spin up a new deal record (practice name, type, locations, deal team, target dates). Seed the 20 default stages. | Coordinator |
| 2 | **Generate data room** | Auto-create the structured data room from the 8-category AMA Diligence List with all default items, pre/post-signing flags, and SLAs; provision the matching SharePoint folder tree. | System |
| 3 | **Send diligence request** | Issue the seller invitation and the categorized checklist via the seller portal + Outlook email, with secure upload links and due dates. | Coordinator → System |
| 4 | **Seller uploads** | Seller authenticates into their isolated portal and uploads documents against each item; can mark items N/A or Denied with reason. | Seller |
| 5 | **Auto-organize** | Each upload is ingested, virus-scanned, OCR'd (Document Intelligence), and routed to the correct category/item folder in SharePoint; filenames normalized. | System (AI) |
| 6 | **Track received/pending/denied/NA** | Diligence request status is maintained per item: Received, Pending, Not Applicable, Denied; review status maintained separately. | System + Reviewers |
| 7 | **Separate pre/post-signing** | Items are partitioned by needed timeline so the team knows what gates signing vs. what is deferred (Category A defaults to Post-Signing). | System |
| 8 | **Notify leadership** | Milestone, risk, and threshold events push notifications to leadership and the deal team (in-app + email digests). | System |
| 9 | **Extract KPIs** | AI extracts financial, operational, billing, and workforce KPIs from accepted documents; reviewers confirm/correct. | System (AI) + Reviewers |
| 10 | **Executive summaries** | AI composes a per-transaction executive summary from confirmed KPIs, statuses, and risks; regenerated on material change. | System (AI) |
| 11 | **Identify missing / risks / next steps** | Missing-document intelligence + risk engine surface outstanding items, red flags (e.g., expiring credentials), and a recommended next-step list. | System (AI) |
| 12 | **Schedule meetings** | Outlook-integrated scheduling for diligence reviews, seller calls, and leadership readouts, pre-populated from deal context. | Coordinator → System |
| 13 | **SharePoint sync** | Documents and structured metadata persist to SharePoint as the system of record; bidirectional metadata sync keeps both in step. | System |

---

## 5. Scope

### 5.1 MVP (Phases 1–2) — In Scope

- Transaction CRUD with the 20 default stages and stage transitions.
- Auto-generated data room from the default 8-category AMA Diligence List with pre/post-signing flags and default SLAs.
- Secure, isolated seller portal: authenticate, view checklist, upload, mark N/A/Denied, respond to clarifications.
- Diligence tracker: request statuses (Received/Pending/Not Applicable/Denied) and review statuses (Uploaded/Under Review/Accepted/Rejected/Needs Clarification/Overdue/Internal Review Complete); assignments, due dates, notes (internal + seller-facing).
- AI document classification (category/item) with confidence score and human-review-required flag.
- Auto-organize uploads into SharePoint folder structure; SharePoint document sync (app → SharePoint).
- Notifications and reminders (in-app + Outlook email) for assignments, overdue items, and key milestones.
- Sensitive credential workflow for Category A (secure submission, controlled handoff, default Post-Signing).
- Role-based access control for all 7 internal roles; full audit logging.
- Basic reporting: per-transaction diligence status and portfolio list view.

### 5.2 Later Phases (3–5) — Planned

- AI **KPI extraction** with reviewer confirmation workflow.
- AI **executive summaries** and **deal health score**.
- **Missing-document intelligence** and proactive **risk engine** (expiring credentials, anomaly flags, payer-contract risk).
- Conversational **AI assistant** (deal Q&A grounded in the data room).
- Advanced **collaboration** (threaded comments, @mentions, tasks).
- Advanced **reporting/analytics** (Metabase dashboards, cross-deal benchmarking, cycle-time analytics).
- Outlook **meeting scheduling** automation and availability lookup.
- Bidirectional SharePoint metadata sync and conflict resolution.
- Configurable diligence templates per practice type.

### 5.3 Out of Scope (Platform-wide)

- Acting as the legal contracting / e-signature platform (integrations may be added, but contract execution is not owned here).
- General ledger / accounting system of record (the platform reviews financials; it is not the ERP).
- Clinical EMR functionality or PHI processing for care delivery (the platform handles diligence documents, not live clinical workflows).
- Post-close operational ERP/integration management beyond the transition handoff.
- Valuation modeling / financial deal modeling (KPIs are extracted and surfaced; modeling lives in finance tools).
- Seller-side document management for the seller's own purposes.

---

## 6. Functional Requirements

Requirements are grouped by area and tagged with target phase. **MUST** = required for that phase; **SHOULD** = strongly desired.

### 6.1 Transactions
- **FR-TX-1 (P1, MUST):** Create, read, update, archive transactions with: practice name, practice type (primary care, specialty, RHC, physician group, multi-location outpatient), locations, deal team, internal owner, seller contacts, target signing date, target close date, deal value (optional), and current stage.
- **FR-TX-2 (P1, MUST):** Seed the 20 default stages on creation; allow forward/backward stage transitions with reason capture and timestamp.
- **FR-TX-3 (P1, MUST):** Each transaction is fully data-isolated; cross-transaction access is governed by RBAC; seller access is single-transaction only.
- **FR-TX-4 (P2, SHOULD):** Clone/template a transaction's configuration (list, SLAs) from a prior deal of the same practice type.
- **FR-TX-5 (P1, MUST):** Transaction-level dashboard: stage, completion %, outstanding items, assigned reviewers, key dates.

### 6.2 Data Rooms
- **FR-DR-1 (P1, MUST):** On transaction creation, auto-generate the data room from the 8-category AMA Diligence List with all default items.
- **FR-DR-2 (P1, MUST):** Provision a matching SharePoint folder tree (one root per transaction, one subfolder per category, item-level subfolders as needed).
- **FR-DR-3 (P1, MUST):** Each item carries: category, item name, needed timeline (Pre/Post-Signing), request status, review status, assigned external contact, assigned internal reviewer, due date, upload link, uploaded documents, internal notes, seller-facing notes, AI classification, AI confidence, human-review-required flag, last-updated.
- **FR-DR-4 (P2, SHOULD):** Add/remove/edit items per transaction without affecting the master template.
- **FR-DR-5 (P3, SHOULD):** Per-practice-type templates (e.g., RHC-specific items such as RHC certification, cost reports).

### 6.3 Diligence Tracker
- **FR-DT-1 (P1, MUST):** Maintain **request status** per item: Received, Pending, Not Applicable, Denied.
- **FR-DT-2 (P1, MUST):** Maintain **internal review status** per item: Uploaded, Under Review, Accepted, Rejected, Needs Clarification, Overdue, Internal Review Complete.
- **FR-DT-3 (P1, MUST):** Partition and filter items by needed timeline (Pre-Signing vs. Post-Signing); Category A (Logins/Passwords) defaults to Post-Signing.
- **FR-DT-4 (P1, MUST):** Assign internal reviewer and external contact per item; reassign with audit trail.
- **FR-DT-5 (P1, MUST):** Due dates per item with overdue auto-flagging (review status → Overdue).
- **FR-DT-6 (P1, MUST):** Separate internal notes (never seller-visible) and seller-facing notes (seller-visible).
- **FR-DT-7 (P1, MUST):** Reviewer actions: Accept, Reject (reason required), Needs Clarification (message required), mark Internal Review Complete.
- **FR-DT-8 (P2, SHOULD):** Bulk operations (bulk assign, bulk reminder, bulk status).
- **FR-DT-9 (P1, MUST):** Filtered, sortable, role-scoped review queue per reviewer.

### 6.4 Seller Portal
- **FR-SP-1 (P1, MUST):** Seller authenticates (Entra ID External / Supabase Auth with magic link or invited account) and lands only on their transaction.
- **FR-SP-2 (P1, MUST):** Display the categorized checklist with seller-facing item names, seller-facing notes, due dates, request status, and upload affordance — never internal data.
- **FR-SP-3 (P1, MUST):** Upload one or many documents per item; show upload confirmation and current status.
- **FR-SP-4 (P1, MUST):** Seller may mark an item Not Applicable or Denied with a required reason.
- **FR-SP-5 (P1, MUST):** Seller can view and respond to Needs Clarification requests.
- **FR-SP-6 (P1, MUST):** Secure credential submission flow for Category A items (masked entry into the vault, not free-form upload), gated to Post-Signing by default.
- **FR-SP-7 (P1, MUST):** Clear progress indicator ("X of Y received; Z outstanding").
- **FR-SP-8 (P2, SHOULD):** Multiple seller contacts per transaction with per-item assignment.

### 6.5 AI Classification
- **FR-AI-1 (P1, MUST):** On upload, classify each document to category and most-likely item using Azure Document Intelligence (OCR/layout) + OpenAI/Azure OpenAI.
- **FR-AI-2 (P1, MUST):** Produce an AI classification label and a 0–1 confidence score persisted on the item/document.
- **FR-AI-3 (P1, MUST):** When confidence is below a configurable threshold, set human-review-required = true and route to the coordinator.
- **FR-AI-4 (P1, MUST):** AI never finalizes status; reviewers confirm or override classification, and overrides feed back as signal.
- **FR-AI-5 (P2, SHOULD):** Detect document type mismatches (e.g., a lease uploaded under Finance) and suggest re-filing.

### 6.6 KPI Extraction
- **FR-KPI-1 (P3, MUST):** Extract category-relevant KPIs from accepted documents (e.g., revenue, EBITDA, payer mix, AR days, visit volumes, provider count, FTE count, payroll, lease terms).
- **FR-KPI-2 (P3, MUST):** Present extracted KPIs to the relevant reviewer for confirm/edit with source-document citation.
- **FR-KPI-3 (P3, MUST):** Confirmed KPIs feed the executive summary, deal health score, and reporting; unconfirmed KPIs are visibly provisional.
- **FR-KPI-4 (P4, SHOULD):** Cross-document KPI reconciliation and anomaly detection (e.g., revenue mismatch across P&L and tax return).

### 6.7 Executive Summary
- **FR-ES-1 (P3, MUST):** Auto-generate a per-transaction executive summary from confirmed KPIs, statuses, risks, and stage.
- **FR-ES-2 (P3, MUST):** Regenerate on material change; show "as of" timestamp and source basis.
- **FR-ES-3 (P3, SHOULD):** One-click export to PDF/SharePoint; human edit-before-publish.
- **FR-ES-4 (P3, MUST):** Summaries are internal-only; never exposed to sellers.

### 6.8 Deal Health Score
- **FR-DH-1 (P3, MUST):** Compute a composite 0–100 deal health score per transaction from weighted inputs: diligence completion %, overdue/aging items, open risks by severity, missing pre-signing items, and KPI thresholds.
- **FR-DH-2 (P3, MUST):** Expose component breakdown and trend over time; explain *why* the score is what it is.
- **FR-DH-3 (P3, MUST):** Score drives portfolio sorting and leadership alerts on threshold crossings.
- **FR-DH-4 (P4, SHOULD):** Configurable weights per practice type / deal size.

### 6.9 Missing-Document Intelligence
- **FR-MD-1 (P3, MUST):** Continuously compute outstanding items by category and by pre/post-signing, distinguishing Pending vs. N/A vs. Denied.
- **FR-MD-2 (P3, MUST):** Risk engine flags: expiring or expired provider credentials/licenses, missing payer contracts, change-of-control clauses, expiring leases, and financial anomalies.
- **FR-MD-3 (P3, MUST):** Generate a prioritized **next-steps** list per transaction (who owes what, by when, to whom).
- **FR-MD-4 (P4, SHOULD):** Predictive "items likely to be needed but not yet requested" based on practice type and prior deals.

### 6.10 Notifications
- **FR-NT-1 (P1, MUST):** In-app + email notifications for: item assigned, document received, status change, clarification requested/answered, item overdue, stage change, risk raised, leadership-milestone reached.
- **FR-NT-2 (P1, MUST):** Role- and event-based subscriptions; leadership receives milestone/risk/threshold notifications.
- **FR-NT-3 (P2, SHOULD):** Configurable digest cadence (immediate, daily, weekly) per user.
- **FR-NT-4 (P1, MUST):** All seller-facing notifications exclude internal content.

### 6.11 Reminders
- **FR-RM-1 (P1, MUST):** Automated reminders to sellers for outstanding/overdue items on a configurable schedule (e.g., T-3, due date, overdue).
- **FR-RM-2 (P1, MUST):** Automated reminders to internal reviewers for items Under Review past SLA.
- **FR-RM-3 (P2, SHOULD):** Coordinator can trigger ad-hoc reminders and snooze/escalate.

### 6.12 Outlook (Microsoft Graph)
- **FR-OL-1 (P1, MUST):** Send diligence requests, reminders, and clarifications via Outlook from a deal mailbox/shared mailbox using Microsoft Graph.
- **FR-OL-2 (P2, SHOULD):** Capture relevant inbound seller email correspondence against the transaction.
- **FR-OL-3 (P4, MUST):** Schedule diligence/seller/leadership meetings via Graph calendar with availability lookup, pre-populated invites, and transaction linkage.

### 6.13 AI Assistant
- **FR-AS-1 (P4, MUST):** Conversational assistant scoped to a transaction's data room, answering grounded questions ("What's outstanding in Finance?", "Summarize the payer contracts," "Which credentials expire within 90 days?").
- **FR-AS-2 (P4, MUST):** Retrieval-augmented over the transaction's documents/metadata with citations; respects RBAC and never crosses transactions; never available to sellers.
- **FR-AS-3 (P4, SHOULD):** Action suggestions (draft a clarification, draft a reminder, propose next steps) requiring human confirmation.

### 6.14 Collaboration
- **FR-CL-1 (P2, MUST):** Internal threaded comments at item and transaction level, with @mentions triggering notifications.
- **FR-CL-2 (P2, SHOULD):** Lightweight internal tasks (assignee, due date, status) linked to items.
- **FR-CL-3 (P1, MUST):** Activity feed per transaction (immutable, audit-aligned).
- **FR-CL-4 (P3, SHOULD):** Hand-off checklist for pre-signing → post-signing transition.

### 6.15 Reporting
- **FR-RP-1 (P1, MUST):** Per-transaction diligence status report (by category, by status, pre/post-signing).
- **FR-RP-2 (P1, MUST):** Portfolio list view across all transactions (stage, completion %, owner, key dates) for leadership/coordinators.
- **FR-RP-3 (P4, SHOULD):** Analytics dashboards (Metabase): cycle-time, throughput per coordinator, bottleneck stages, risk frequency, health-score distribution.
- **FR-RP-4 (P4, SHOULD):** Exportable reports (PDF/CSV) and board-ready packets.

---

## 7. Non-Functional Requirements

### 7.1 Security & HIPAA-Conscious Handling
- **NFR-SEC-1:** Encryption in transit (TLS 1.2+) and at rest (AES-256) for all data and documents; Supabase storage and SharePoint both encrypted at rest.
- **NFR-SEC-2:** RBAC enforced server-side and via Supabase Row-Level Security; least-privilege defaults; seller isolation enforced at the database policy layer, not just the UI.
- **NFR-SEC-3:** PHI/PII minimization — diligence documents may contain PHI/PII; treat the platform as HIPAA-conscious: access controls, audit logging, no PHI in logs/telemetry, BAAs with Azure/Microsoft/OpenAI(Azure)/hosting as applicable.
- **NFR-SEC-4:** Sensitive credential vault (Category A): credentials stored encrypted with restricted access, controlled handoff, retention/expiry policy, and explicit revocation; never emailed; never shown to sellers after submission; access fully logged.
- **NFR-SEC-5:** MFA for all internal users (via Entra ID); seller access via invited, scoped accounts/magic links with expiry.
- **NFR-SEC-6:** Virus/malware scanning on every upload before ingestion/sync.
- **NFR-SEC-7:** Secrets in a managed vault (Azure Key Vault / Vercel env with restricted access); no secrets in source.
- **NFR-SEC-8:** AI data handling: use enterprise/Azure OpenAI with no-training-on-data guarantees; redact where feasible; document AI processing for compliance.

### 7.2 Auditability (SOC 2-style)
- **NFR-AUD-1:** Append-only audit log of every security-relevant and workflow-relevant event: auth, access, document view/upload/download, status changes, reassignments, AI decisions and overrides, config changes, exports.
- **NFR-AUD-2:** Each event records actor, role, transaction, target object, before/after, timestamp (UTC), and source IP/session.
- **NFR-AUD-3:** Audit log is tamper-evident and retained per policy (default ≥7 years for deal records); exportable for auditors.
- **NFR-AUD-4:** Segregation of duties: configuration vs. operation vs. review are distinct, logged role actions.

### 7.3 Performance
- **NFR-PERF-1:** Interactive views (dashboards, tracker, queues) p95 < 2s under normal load.
- **NFR-PERF-2:** Document upload acknowledged < 3s; AI classification completes async, target < 60s p95 per document.
- **NFR-PERF-3:** Notifications dispatched within 1 minute of trigger.
- **NFR-PERF-4:** Reports/dashboards render p95 < 5s; heavy analytics may be precomputed/cached.

### 7.4 Scalability
- **NFR-SCAL-1:** Support ≥500 concurrent active transactions and ≥10,000 documents per transaction without architectural change.
- **NFR-SCAL-2:** AI processing is queue-based and horizontally scalable; spikes degrade latency, not correctness.
- **NFR-SCAL-3:** Stateless app tier (Next.js on Vercel/Azure) scales horizontally; Postgres scales vertically with read replicas for reporting.

### 7.5 Availability & Reliability
- **NFR-AVL-1:** Target 99.9% monthly availability for the core app.
- **NFR-AVL-2:** SharePoint is system of record; the app degrades gracefully if Graph/AI is briefly unavailable (queue and retry, never lose an upload).
- **NFR-AVL-3:** RPO ≤ 1 hour, RTO ≤ 4 hours; automated Postgres backups + SharePoint redundancy.
- **NFR-AVL-4:** Idempotent, retried integration calls (Graph, AI, SharePoint) with dead-letter handling and reconciliation.

### 7.6 Compliance, Accessibility, Observability
- **NFR-CMP-1:** Data residency configurable (US regions) for PHI/PII.
- **NFR-CMP-2:** WCAG 2.1 AA for internal and seller UIs.
- **NFR-OBS-1:** Structured logging, metrics, tracing, and alerting; no PHI in observability data.
- **NFR-OBS-2:** Integration health dashboards (Graph, SharePoint, AI) with sync-failure alerts and reconciliation jobs.

---

## 8. Transaction Stages (20 Default)

Each transaction is seeded with these 20 stages. Stages are ordered but transitions are auditable and may iterate.

| # | Stage | Description / Exit Criteria |
|---|---|---|
| 1 | Lead Identified | Target practice identified; basic profile captured. |
| 2 | Initial Contact | Outreach made; mutual interest confirmed. |
| 3 | NDA / Confidentiality | NDA executed; confidential exchange enabled. |
| 4 | Preliminary Review | High-level fit, size, and strategic rationale assessed. |
| 5 | LOI Drafting | Letter of Intent drafted by the acquirer. |
| 6 | LOI Negotiation | Terms negotiated with seller. |
| 7 | LOI Executed | LOI signed; deal becomes active diligence candidate. |
| 8 | Data Room Setup | Data room generated; SharePoint tree provisioned. |
| 9 | Diligence Request Sent | Seller invited; categorized checklist issued. |
| 10 | Document Collection | Seller uploading; auto-organize and tracking active. |
| 11 | Pre-Signing Diligence Review | Reviewers working pre-signing items; risks surfaced. |
| 12 | KPI & Financial Analysis | KPIs extracted/confirmed; financial review completed. |
| 13 | Risk Assessment | Risks consolidated; deal health score evaluated. |
| 14 | Executive Review | Leadership readout; go/no-go on signing. |
| 15 | Final Negotiation | Final terms and purchase agreement negotiation. |
| 16 | Signing / Definitive Agreement | Definitive agreement executed. |
| 17 | Post-Signing Diligence | Post-signing items (incl. Category A credentials) collected/reviewed. |
| 18 | Transition Planning | Operational transition plan; handoff checklist. |
| 19 | Closing | Conditions satisfied; transaction closes. |
| 20 | Post-Close Transition | Onboarding/integration handoff; diligence record archived to SharePoint. |

---

## 9. Product Success Metrics & KPIs

Metrics for the platform itself (distinct from per-deal KPIs the platform extracts).

### 9.1 Efficiency
| Metric | Definition | Target |
|---|---|---|
| Diligence cycle time | Days from "Diligence Request Sent" to "Internal Review Complete" across all items | ≥40% reduction vs. baseline |
| Time-to-organize | Time from upload to correctly filed in SharePoint | < 5 min (auto) for ≥90% of docs |
| Coordinator concurrency | Concurrent active deals per coordinator | 3–5x baseline |
| Reminder-to-response time | Time from reminder to seller upload | ↓ trend quarter over quarter |

### 9.2 Quality & Risk
| Metric | Definition | Target |
|---|---|---|
| AI classification accuracy | % of AI classifications confirmed without override | ≥85% at GA, ≥92% by Phase 5 |
| Human-review-required rate | % of docs flagged for human review | Trends down as accuracy rises |
| Pre-signing completeness at signing | % of pre-signing items Accepted before stage 16 | ≥98% |
| Late-discovered risks | Risks found post-signing that were findable earlier | ↓ toward 0 |
| KPI confirmation rate | % of extracted KPIs confirmed by reviewers | ≥80% accepted as-extracted |

### 9.3 Adoption & Satisfaction
| Metric | Definition | Target |
|---|---|---|
| Active deal coverage | % of acquisitions run on the platform | ≥95% within 2 quarters of GA |
| Seller portal completion | % of sellers completing uploads via portal (not email) | ≥90% |
| Internal weekly active reviewers | Reviewers acting in their queue weekly | ≥90% of assigned |
| Exec self-serve | Leadership status checks via dashboard vs. asking team | ≥90% self-serve |
| Seller satisfaction (CSAT) | Post-diligence seller survey | ≥4.2 / 5 |

### 9.4 Reliability & Security
| Metric | Definition | Target |
|---|---|---|
| Core availability | Monthly uptime | ≥99.9% |
| Integration sync success | Successful Graph/SharePoint/AI operations | ≥99.5% |
| Audit completeness | Security/workflow events captured | 100% |
| Security incidents | PHI/credential exposure events | 0 |

---

## 10. Build Phases

Five phases deliver the platform incrementally; each is independently valuable and shippable.

### Phase 1 — Foundation & Core Tracker (MVP)
**Goal:** Stand up the workflow brain and a usable, secure diligence pipeline.
- Auth (Entra ID + Supabase Auth), RBAC, Row-Level Security, audit logging.
- Transactions + 20 default stages; auto-generated data room from the 8-category list.
- SharePoint folder provisioning and document sync (app → SharePoint).
- Diligence tracker: request + review statuses, pre/post-signing split, assignments, due dates, notes.
- Isolated seller portal: upload, N/A/Denied, clarifications, progress.
- Sensitive credential vault (Category A).
- Notifications + reminders (in-app + Outlook send).
- Basic per-transaction and portfolio reporting.
**Exit:** A deal can be run end-to-end manually with full tracking, isolation, and audit.

### Phase 2 — Automation & Intelligence (AI Classification)
**Goal:** Remove manual filing and add collaboration.
- AI document classification + confidence + human-review-required gate; auto-organize on upload.
- Document-type mismatch detection.
- Collaboration: threaded comments, @mentions, activity feed, lightweight tasks.
- Bulk tracker operations; configurable digest notifications; ad-hoc reminders/escalation.
- Per-transaction item add/remove/edit.
**Exit:** Uploads self-organize with high accuracy; teams collaborate in-platform.

### Phase 3 — Insight & Decision Support
**Goal:** Turn documents into decisions.
- KPI extraction with reviewer confirmation and source citation.
- Executive summaries (internal-only, regenerated on change).
- Deal health score with component breakdown and trend.
- Missing-document intelligence + risk engine + prioritized next steps.
- Pre→post-signing transition handoff checklist.
**Exit:** Leadership sees health, KPIs, risks, and next steps automatically per deal.

### Phase 4 — Conversational AI, Scheduling & Analytics
**Goal:** Conversational access, scheduling, and portfolio analytics.
- AI assistant (RAG over the data room, RBAC- and transaction-scoped, cited).
- Outlook meeting scheduling with availability lookup and transaction linkage.
- Inbound email capture against transactions.
- Analytics dashboards (Metabase): cycle-time, throughput, bottlenecks, risk frequency, health distribution; exportable packets.
- Cross-document KPI reconciliation / anomaly detection.
**Exit:** "Ask the deal" works; meetings scheduled in-platform; portfolio analytics live.

### Phase 5 — Scale, Optimization & Configurability
**Goal:** Harden, optimize, and make turnkey configurable.
- Per-practice-type diligence templates (primary care, specialty, RHC, physician group, outpatient).
- Configurable health-score weights and SLAs.
- Bidirectional SharePoint metadata sync with conflict resolution.
- Predictive missing-item suggestions; classification accuracy ≥92%.
- Performance/scale hardening to ≥500 concurrent transactions; SOC 2 readiness.
**Exit:** Configurable, scaled, audit-ready platform meeting all NFR targets.

---

## 11. Appendix — Reference Enumerations

**Diligence Categories (AMA Healthcare Diligence List):**
A. Logins/Passwords (sensitive; secure credential workflow; default Post-Signing) · B. Finance/Accounting · C. Revenue Cycle/Billing · D. Providers/Credentialing · E. Operations/Clinical · F. HR/Payroll · G. IT/EMR/Systems · H. Legal/Contracts/Business

**Diligence Request Statuses:** Received · Pending · Not Applicable · Denied

**Internal Review Statuses:** Uploaded · Under Review · Accepted · Rejected · Needs Clarification · Overdue · Internal Review Complete

**Roles:** Admin · M&A Coordinator · Executive Leadership · Finance Reviewer · Operations Reviewer · Legal/Compliance Reviewer · HR Reviewer · Seller/Acquisition Candidate (external)

**Per-Item Data Fields:** category · item name · needed timeline (Pre/Post-Signing) · request status · internal review status · assigned external contact · assigned internal reviewer · due date · upload link · uploaded documents · internal notes · seller-facing notes · AI classification · AI confidence score · human-review-required flag · last-updated
