# 10 — MVP Build Plan

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering, Product, Delivery/PM, Solution Architecture
**Status:** Implementation-grade specification
**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Supabase Postgres (RLS) · Microsoft Graph · Azure OpenAI
**Last reviewed:** 2026-06-26

---

## 1. Purpose & Scope

This document defines the **Phase 1 MVP** precisely — what we build, what we deliberately stub, and the architecture of *this repository* — and maps the road from the seed-backed demo to a production system wired to Supabase, Microsoft 365, and Azure OpenAI.

It is grounded in one organizing decision that shapes everything below:

> **The application layer depends on a `DiligenceRepository` interface, never on a concrete data source.** The MVP ships a deterministic, in-memory `SeedRepository` so the entire product runs end-to-end with **zero external secrets**. The production `SupabaseRepository` is a drop-in that satisfies the same interface and maps 1:1 to the SQL schema in `/supabase/migrations`. The Supabase / Microsoft Graph / OpenAI integrations are *seams*, not dependencies, in Phase 1.

This is what makes the MVP demonstrable on day one (no infrastructure to stand up, no PHI to handle) while keeping the SQL schema, RBAC matrix, and domain model production-ready.

### 1.1 What "MVP" means here

The MVP is a **working, navigable, role-aware product** with a fully populated demo transaction — not a wireframe and not a slide deck. Every Phase 1 surface renders real data computed by the real domain/analytics engine. The only thing that is faked is *where the data comes from* (a seed module instead of a live database) and the *external side effects* (sending email, writing bytes to SharePoint, calling a model).

---

## 2. Phase 1 MVP Scope (precise)

The following capabilities are **in scope and implemented** in Phase 1. Each maps to concrete code already present in this repository.

| # | Capability | What Phase 1 delivers | Backing code |
|---|------------|-----------------------|--------------|
| 1 | **Authentication** | Session model + `currentUser()` resolution. A single seeded admin session (`u-admin`, Nina Patel) drives the demo; the real Supabase Auth / Entra ID handshake is a seam (`getRepository()` and a future `getSession()`). | `repository.ts`, `.env.example` (`DATA_BACKEND`) |
| 2 | **Role-based access** | Full permission catalog (44 permissions), role→permission matrix for all 8 roles, transaction-level scoping, strict internal/seller separation, reviewer-category mapping. Enforced in selectors/components; mirrored by Postgres RLS. | `domain/rbac.ts` |
| 3 | **Transaction creation** | Transaction entity with 20-stage pipeline, stage history, coordinator/owner/contact assignment, risk level, template binding. Read + list + detail in MVP; create/edit form is a thin write path over the repository. | `domain/types.ts`, seeded `TRANSACTIONS` |
| 4 | **Contact list** | Internal + external contacts per transaction, primary-contact designation, business roles. | `TransactionContact`, seeded `CONTACTS`, `/contacts` |
| 5 | **AMA diligence template** | The full **AMA Healthcare Diligence List** (categories A–H + Other + review queue) as a versioned template; instantiated onto each transaction as request items. | `domain/diligence-template.ts` |
| 6 | **Request tracker** | Per-transaction request items with category, timeline, assigned external contact + internal reviewer, due date, notes (internal + seller-facing), AI fields, human-review flag. | `DiligenceRequestItem`, `/diligence` |
| 7 | **Status tracking** | External request statuses (Received / Pending / Not Applicable / Denied) **and** internal review statuses (Uploaded → … → Internal Review Complete), with overdue derivation. | `DILIGENCE_STATUSES`, `INTERNAL_REVIEW_STATUSES`, `domain/analytics.ts` |
| 8 | **Manual document upload** | Document metadata model (filename, mime, size, version, uploader + uploader type), linkage to request items, review status. Upload UI captures metadata; byte storage is local/stubbed (no SharePoint in Phase 1). | `Document`, seeded `DOCUMENTS` |
| 9 | **External seller portal** | Token-scoped portal (`/portal/[token]`) resolving a `SellerPortalUser` to exactly one transaction; seller sees only their requests, can upload / mark N/A / comment (seller-facing visibility only). Hard-isolated from internal data. | `SellerPortalUser`, `sellerByToken()`, `rbac.canSeeInternal` |
| 10 | **Basic data room** | Per-category folders with counts (pre/post, received/pending/NA/denied/overdue), last-upload date, and a `sharePointSyncStatus` field that reads `not_connected` until Phase 2. | `DataRoom`, `FolderMeta`, `buildFolderMeta()`, `/data-rooms` |
| 11 | **Basic dashboard** | Global pipeline dashboard: active deals, avg pre-signing completion, overdue items, high-risk deals, upcoming meetings, recent uploads, stage distribution, leadership digest. | `/(app)/page.tsx`, `getTransactionSummaries()` |
| 12 | **Activity timeline** | Per-transaction and global activity feed across 19 event types (upload, status change, risk detected, KPI updated, meeting scheduled, etc.), sorted newest-first. | `ActivityEvent`, seeded `ACTIVITY`, `repo.activity()` |

### 2.1 Cross-cutting Phase 1 deliverables

- **Domain/analytics engine** (real, not stubbed): completion stats per timeline, deal-health assessment, missing-item report, folder metadata, and a deterministic rule-based executive summary — all in `src/lib/domain/*` and composed by `src/lib/selectors.ts`.
- **Seeded demo**: the hero transaction **"ABC Family Medicine"** populated with the full AMA checklist, sample documents, extracted KPIs, risk flags, tasks, meetings, comments, and a seller portal token (see §8).
- **Production-ready SQL schema + RLS** authored alongside the demo (see `docs/03-database-schema.md`); committed under `/supabase/migrations` and *not* required to run the demo.

### 2.2 Explicit Phase 1 non-goals

The MVP is intentionally narrow. The following are **deferred** (and the code carries clean seams for them):

- Live Supabase persistence and Supabase/Entra auth handshake (schema is ready; runtime backend is `seed`).
- SharePoint byte storage and two-way sync via Microsoft Graph.
- Outlook email/calendar send (reminders, meeting invites) via Graph.
- AI document classification, metric extraction, and the AI assistant calling a live model (the *shapes* are present and seeded; no model is invoked).
- Background workers, webhooks, cron (delta sync, subscription renewal, reminder engine).
- The Category A secure-credential vault flow (Azure Key Vault envelope encryption).

---

## 3. Phase Map (1 → 5)

| Phase | Theme | Headline outcomes | Primary seams activated |
|-------|-------|-------------------|-------------------------|
| **1 — MVP (this repo)** | Workflow operating system on seed data | Auth/RBAC, transactions, contacts, AMA template, request tracker, status tracking, manual upload, seller portal, basic data room, basic dashboard, activity timeline. Runs with no external secrets. | `DiligenceRepository` (seed impl) |
| **2 — SharePoint + M365** | Real persistence & document system of record | Swap `SeedRepository`→`SupabaseRepository` (RLS live). Provision data-room folders in SharePoint; upload bytes via Graph (`Sites.Selected`); delta sync + webhooks; Outlook reminders & meeting invites; metadata mirror in Postgres. | `DATA_BACKEND=supabase`, `AZURE_*`, `SHAREPOINT_*` |
| **3 — AI Document Intelligence** | Classification, extraction, assistant | Azure Document Intelligence OCR + Azure OpenAI classification (category, timeline, doc type, confidence) writing the `ai*` fields already on `Document`/`DiligenceRequestItem`; KPI extraction populating `extracted_metrics`; human-review queue; grounded AI assistant + executive summary upgraded from rules to model. | `OPENAI_API_KEY` / `AZURE_OPENAI_*`, `AZURE_DOCUMENT_INTELLIGENCE_*` |
| **4 — Dashboards & Analytics** | Decision support at scale | Cross-deal KPI dashboards & benchmarks, deal-health trending, portfolio analytics, exportable reports, valuation views for executives, drill-downs from flag → metric → source page. | Materialized views / read models over `extracted_metrics`, `risk_flags` |
| **5 — Automation & Reporting** | Hands-off operations | Reminder engine (overdue cadence), auto status transitions, scheduled report generation/distribution, subscription-renewal cron, audit-report exports, templated seller communications. | Cron + queue workers, `reminder:*`, `audit:read` |

Each phase is additive and ships behind the same interfaces; no UI rewrite is required to move from Phase 1 to Phase 2 because pages consume *selectors*, not data sources.

---

## 4. Repository Architecture (this codebase)

### 4.1 Layering

```
┌───────────────────────────────────────────────────────────────────────┐
│  app/  (Next.js 14 App Router, RSC-first)                              │
│  Server Components render view models. Thin. No business logic.        │
└───────────────┬───────────────────────────────────────────────────────┘
                │ calls
┌───────────────▼───────────────────────────────────────────────────────┐
│  lib/selectors.ts  (server-side view-model composition)               │
│  Joins a TransactionBundle with the analytics engine → TransactionView│
└───────────────┬───────────────────────────────┬───────────────────────┘
                │ reads via                       │ computes via
┌───────────────▼───────────────┐   ┌─────────────▼─────────────────────┐
│  lib/data/repository.ts        │   │  lib/domain/*  (pure functions)   │
│  DiligenceRepository interface │   │  types, template, rbac, kpi,      │
│   ├─ SeedRepository  (Phase 1) │   │  analytics, summary, assistant    │
│   └─ SupabaseRepository (P2)   │   │  No I/O. Fully unit-testable.     │
└───────────────┬───────────────┘   └───────────────────────────────────┘
                │ Phase 1 reads from
┌───────────────▼───────────────────────────────────────────────────────┐
│  lib/data/seed.ts  (deterministic in-memory dataset, fixed clock NOW) │
└───────────────────────────────────────────────────────────────────────┘
```

**Key properties**

- **RSC-first.** Pages are async Server Components that call `getRepository()` and selectors directly. No client data-fetching, no API layer needed for reads in Phase 1.
- **Pure domain.** Everything in `lib/domain/*` is a pure function of its inputs (the seed passes a fixed `NOW = 2026-06-26T14:30Z`, so output is deterministic and snapshot-testable).
- **One write surface later.** Phase 1 is read-dominant; mutations (create transaction, change status, post comment, upload) land as Server Actions / Route Handlers that call repository write methods — added to the interface as the surfaces are built, with the same seed/Supabase dual implementation.

### 4.2 Why seed-backed, not "mock API"

A mock HTTP API would force a network boundary and serialization we don't need in Phase 1 and would diverge from the production query shapes. Instead the seed satisfies the **exact same interface** the Supabase implementation will, so the contract is validated by the running app, not by a parallel fixture. Swapping backends is a one-line change in `getRepository()` gated on `DATA_BACKEND`.

---

## 5. Folder Structure

```
mergers/
├── .env.example              # All external seams documented; demo needs none
├── next.config.mjs           # poweredByHeader off; notes seed-only demo
├── package.json              # Next 14.2, React 18, Tailwind 3, lucide, clsx
├── tailwind.config.ts        # brand/ink palettes, design tokens
├── tsconfig.json             # strict; @/* → src/*; excludes /supabase
├── docs/                     # 01–10 enterprise specs (this file is 10)
├── supabase/
│   └── migrations/           # Production-ready SQL: tables, enums, RLS, triggers
└── src/
    ├── app/
    │   ├── layout.tsx                 # Root layout, fonts, globals
    │   ├── globals.css                # Tailwind layers + scrollbar utils
    │   └── (app)/                     # Authenticated internal app shell
    │       ├── layout.tsx             # Sidebar + Topbar; loads currentUser + overdue count
    │       ├── page.tsx               # Global Dashboard (#11)
    │       ├── transactions/          # List + [id] detail (overview, diligence, data room, KPIs, activity)
    │       ├── data-rooms/            # Category folders + sync status (#10)
    │       ├── diligence/             # Request tracker across deals (#6/#7)
    │       ├── kpis/                  # KPI dashboards (basic in P1, deep in P4)
    │       ├── tasks/                 # Task board
    │       ├── calendar/              # Meetings (read; Outlook send in P2)
    │       ├── contacts/              # Contact directory (#4)
    │       ├── reports/               # Exec summary / missing-item report (rules in P1)
    │       ├── settings/              # Org + integration config (seams)
    │       └── admin/                 # Users, roles, template, audit (read)
    │   └── portal/
    │       └── [token]/               # External seller portal (#9), token-scoped
    ├── components/
    │   ├── Sidebar.tsx                # Primary nav (client; active-route aware)
    │   ├── Topbar.tsx                 # User chip, overdue badge
    │   ├── Tabs.tsx                   # Transaction-detail tab nav
    │   └── ui.tsx                     # Card, StatCard, ProgressBar, RiskBadge, DealScoreBadge, EmptyState, PageHeader
    └── lib/
        ├── format.ts                  # Date/number/relative-time formatting
        ├── ui.ts                      # cn() class helper
        ├── selectors.ts               # Server view-model composition
        ├── data/
        │   ├── repository.ts          # DiligenceRepository + SeedRepository + factory
        │   └── seed.ts                # Deterministic demo dataset
        └── domain/
            ├── types.ts               # Source-of-truth domain types + enums
            ├── diligence-template.ts  # AMA Healthcare Diligence List
            ├── rbac.ts                # Permissions, role matrix, scoping
            ├── kpi-definitions.ts     # KPI catalog + benchmarks
            ├── analytics.ts           # Completion, deal health, missing-items, folders
            ├── summary.ts             # Rule-based executive summary
            └── assistant.ts           # Grounded Q&A scaffold (model wired in P3)
```

> Route folders under `(app)/` that are not yet fleshed out as files are part of the Phase 1 information architecture (the `Sidebar` `NAV` array is the canonical list) and are built out against existing selectors; none require new data plumbing.

---

## 6. The Data-Access Abstraction

### 6.1 The interface (contract)

`src/lib/data/repository.ts` declares `DiligenceRepository` — the **only** data contract the app knows about. Representative surface:

```ts
export interface DiligenceRepository {
  organization(): Promise<Organization>;
  users(): Promise<User[]>;
  currentUser(): Promise<User>;

  transactions(): Promise<Transaction[]>;
  transaction(id: string): Promise<Transaction | undefined>;
  bundle(id: string): Promise<TransactionBundle | undefined>;   // one fetch → full detail page

  contacts(transactionId: string): Promise<TransactionContact[]>;
  requestItems(transactionId: string): Promise<DiligenceRequestItem[]>;
  documents(transactionId: string): Promise<Document[]>;
  metrics(transactionId: string): Promise<ExtractedMetric[]>;
  riskFlags(transactionId: string): Promise<RiskFlag[]>;
  tasks(transactionId?: string): Promise<Task[]>;
  meetings(transactionId?: string): Promise<Meeting[]>;
  comments(transactionId: string): Promise<Comment[]>;
  activity(transactionId?: string): Promise<ActivityEvent[]>;

  sellerByToken(token: string): Promise<SellerPortalUser | undefined>;
  sellerPortalUsers(): Promise<SellerPortalUser[]>;
}
```

`bundle(id)` returns a `TransactionBundle` (transaction + contacts + request items + documents + metrics + risk flags + tasks + meetings + comments + activity) in one call — the unit a transaction-detail page needs. In the seed impl it fans out with `Promise.all`; in Supabase it becomes a small set of batched queries or a single Postgres function.

### 6.2 The two implementations

| | `SeedRepository` (Phase 1) | `SupabaseRepository` (Phase 2) |
|---|---|---|
| Source | `src/lib/data/seed.ts` in-memory arrays | Postgres via `@supabase/supabase-js` (server client) |
| Filtering | `Array.filter` on `transactionId` | SQL `where transaction_id = …`, RLS-enforced |
| `currentUser()` | Returns seeded `CURRENT_USER_ID` | Resolves Supabase Auth / Entra session → `users` row |
| Determinism | Fixed `NOW`, fixed timestamps | Live clock + DB state |
| Secrets needed | **None** | `NEXT_PUBLIC_SUPABASE_URL`, `…ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Auth/RLS | App-level checks via `rbac.ts` | App checks **plus** DB RLS as defense-in-depth |

### 6.3 The factory (the single swap point)

```ts
let _repo: DiligenceRepository | null = null;

export function getRepository(): DiligenceRepository {
  if (_repo) return _repo;
  // Phase 2: if (process.env.DATA_BACKEND === "supabase") _repo = new SupabaseRepository();
  _repo = new SeedRepository();
  return _repo;
}
```

Every page and selector calls `getRepository()`. Switching the whole platform from demo to production persistence is one `if` and an env var — **no page changes**.

### 6.4 External seams (Graph / OpenAI)

The same pattern guards the other integrations. Each is a server-only module behind a narrow interface, no-op or seed-driven in Phase 1:

| Seam | Phase 1 behavior | Activated in | Env |
|------|------------------|--------------|-----|
| `DocumentStore` (SharePoint via Graph) | Bytes held locally/in-memory; `sharePointSyncStatus = "not_connected"` | Phase 2 | `AZURE_*`, `SHAREPOINT_*` |
| `MailService` (Outlook via Graph) | Reminder/invite actions logged as activity, not sent | Phase 2/5 | `AZURE_*` |
| `AiService` (Azure OpenAI + Doc Intelligence) | Returns seeded classifications/metrics; assistant answers from rules | Phase 3 | `OPENAI_API_KEY` / `AZURE_OPENAI_*`, `AZURE_DOCUMENT_INTELLIGENCE_*` |

---

## 7. Seeding Strategy

`src/lib/data/seed.ts` builds a complete, deterministic world. Design rules:

1. **Fixed clock.** `NOW = new Date("2026-06-26T14:30:00.000Z")`. All seeded timestamps are literals, so overdue/relative-time logic renders identically on every load and is snapshot-testable.
2. **Template-driven instantiation.** Request items are generated by `instantiateItems()` mapping over `AMA_DILIGENCE_ITEMS`, so the demo's checklist *is* the real template — there is no divergent fixture list to maintain.
3. **Realistic deal physiology.** Statuses, due dates, reviewer assignments, AI confidences, and document flags are set per item to produce a believable mid-diligence deal, including overdue criticals and a low-confidence file in the review queue.
4. **Back-linking.** After documents are defined, a loop attaches `UploadedDocumentRef`s onto their request items, keeping both views consistent.
5. **AI vs human separation.** Metrics carry `source: "ai" | "human"`; a human-reviewed EBITDA override is seeded to demonstrate provenance and the "never co-mingle" invariant.

### 7.1 The hero transaction — ABC Family Medicine

| Aspect | Seeded value |
|--------|--------------|
| Deal | `tx-abc` · "Project Cedar — ABC Family Medicine" · Primary Care · OH · 3 locations · 6 providers |
| Stage | Pre-signing diligence in progress (with stage history) |
| People | Coordinator Marcus Reed, owner Dana Lowe (exec), finance lead Priya Shah; seller contacts Dr. Robert Klein + Susan Doyle |
| Checklist | Full AMA list instantiated; mix of Received / Pending / Not Applicable / Denied with internal review states |
| Critical gaps | Unit-level T12 P&L (**overdue**, critical), debt schedule (overdue), AR aging by DOS bucket, payer mix, lease agreements (all critical, due soon) |
| Documents | 9 docs incl. consolidated T12 P&L (v2), AR aging, denial report, employee roster, a duplicate/outdated P&L (rejected), and an unreadable low-confidence scan in the review queue |
| Sample KPIs | T12 revenue **$4.8M**, EBITDA **$720K** (15% margin), payroll **39%** of revenue, total AR **$610K**, days in AR **52**, denial rate **9.2%**, Medicare payer mix **42%**, **42** employees, **6** providers — each with confidence, source doc, and period |
| Risk flags | Elevated payroll, high days-in-AR, missing unit-level profitability, payer concentration |
| Tasks / meetings / comments | In-flight tasks, a scheduled Financial Diligence Review + Executive Review, and a seller↔internal comment thread (internal + seller-facing) |
| Seller portal | Token `abc-secure-demo-portal` → scoped to `tx-abc` only |

Three additional transactions (Summit Orthopedics, Coastal Pediatrics, Valley Cardiology) populate the pipeline at different stages and health levels so the **global dashboard and cross-deal views are non-trivial** from first run.

---

## 8. Build / Run / Test

### 8.1 Prerequisites

- Node.js **≥ 18.18** (see `engines` in `package.json`).
- No database, no Azure tenant, no API keys. The demo runs entirely on the seed backend (`DATA_BACKEND=seed`, the default).

### 8.2 Commands

```bash
# Install
npm install

# Run the demo (http://localhost:3000) — seed-backed, no secrets
npm run dev

# Type safety (strict mode, no emit)
npm run typecheck

# Lint
npm run lint

# Production build (still seed-backed unless env wired)
npm run build && npm run start
```

### 8.3 Optional: point at Supabase (Phase 2 preview)

```bash
cp .env.example .env.local
# set DATA_BACKEND=supabase and the NEXT_PUBLIC_SUPABASE_* / SERVICE_ROLE keys
# apply /supabase/migrations to the project, then:
npm run dev
```

### 8.4 Testing strategy

| Layer | Approach (Phase 1) |
|-------|--------------------|
| Domain (`lib/domain/*`) | Pure-function unit tests against the fixed-`NOW` seed: completion math, overdue derivation, deal-health scoring, missing-item report, folder counts. Deterministic → snapshot-friendly. |
| Selectors | Compose-and-assert tests verifying the `TransactionView` shape and that ABC's known KPIs/gaps surface. |
| RBAC | Table-driven tests over `ROLE_PERMISSIONS` / `canAccessTransaction` / `canSeeInternal`, asserting the seller is isolated and reviewers are category-scoped. |
| Types/build | `tsc --noEmit` + `next build` are the CI gate; strict mode catches contract drift between domain types and both repository impls. |
| RLS (Phase 2) | pgTAP / SQL tests proving a seller JWT can read only its own transaction rows. |

---

## 9. Work Breakdown, Milestones & Acceptance Criteria

| Milestone | Work | Acceptance criteria |
|-----------|------|---------------------|
| **M0 — Foundation** | Next 14 App Router scaffold, Tailwind tokens, app shell (Sidebar/Topbar), `ui.tsx` primitives, `cn`/format utils. | `npm run dev` serves the app shell; nav renders; `typecheck`/`lint` clean. |
| **M1 — Domain core** | `types.ts` (entities + enums), `diligence-template.ts` (AMA list), `rbac.ts`, `kpi-definitions.ts`, `analytics.ts`, `summary.ts`. | Domain compiles strict; AMA template covers A–H + Other + queue; RBAC matrix complete for 8 roles; analytics functions pure & deterministic. |
| **M2 — Data layer + seed** | `DiligenceRepository` interface, `SeedRepository`, `getRepository()` factory, full `seed.ts` (ABC + 3 deals). | `bundle("tx-abc")` returns a complete, internally consistent bundle; documents back-link to request items; no external secret required to boot. |
| **M3 — Global dashboard + activity** | `(app)/page.tsx`, `getTransactionSummaries()`, activity feed. | Dashboard shows active deals, avg pre-signing %, overdue count, high-risk deals, upcoming meetings, recent uploads, stage distribution; activity sorted newest-first. |
| **M4 — Transactions, diligence, status** | Transaction list + detail (overview/diligence/data-room/KPI/activity tabs), request tracker with both status axes, overdue badges, critical-gap flags. | All four AMA external statuses and all seven internal review statuses render; ABC's overdue criticals are visibly flagged; completion % matches analytics. |
| **M5 — Data room + contacts + KPIs (basic)** | Category folders w/ counts + sync status, contact directory, basic KPI cards with confidence/source. | Folder counts reconcile with request items; `sharePointSyncStatus` reads `not_connected`; KPI cards cite source doc + period + confidence; AI vs human values distinguished. |
| **M6 — Seller portal** | `/portal/[token]` resolving `sellerByToken`, transaction-scoped seller view (upload / mark N/A / comment), strict isolation. | Valid token shows exactly one transaction; **no** internal notes, deal score, valuation, KPIs, or other deals are reachable; invalid/expired token is rejected. |
| **M7 — Reports + admin/settings (read) + SQL schema** | Rule-based exec summary & missing-item report; admin (users/roles/template/audit) read views; settings seams; `/supabase/migrations` authored. | Exec summary + missing-item report generate for any deal; SQL schema applies cleanly with RLS policies derived from `rbac.ts`. |
| **M8 — Hardening & handoff** | CI (typecheck/lint/build), README run instructions, seed/snapshot tests, doc set 01–10. | CI green; demo reproducible from clean clone with `npm i && npm run dev`; STUB/IMPLEMENTED matrix (§10) accurate. |

**Definition of Done for the MVP:** a clean clone, `npm install && npm run dev`, lands on a populated global dashboard; ABC Family Medicine opens to a complete diligence picture (statuses, KPIs, risks, data room, activity); the seller portal token shows an isolated seller view — all with **no secrets configured** — and `npm run typecheck && npm run lint && npm run build` pass.

---

## 10. Implemented vs Stubbed in This Repo

> "Stubbed" here means the **shape and seam exist and render** with seed data, but no external side effect occurs and no live model/service is called.

### 10.1 Implemented (real logic, runs now)

- Domain model & all enums (`types.ts`); the full AMA diligence template (`diligence-template.ts`).
- RBAC: permission catalog, role matrix, transaction scoping, internal/seller separation, reviewer-category mapping (`rbac.ts`).
- Analytics engine: completion stats per timeline, overdue derivation, deal-health scoring, missing-item report, folder metadata (`analytics.ts`).
- Rule-based executive summary (`summary.ts`).
- Data-access interface + seed implementation + factory (`repository.ts`, `seed.ts`).
- Server-side selectors / view-model composition (`selectors.ts`).
- App shell, navigation, UI primitives, and the global dashboard with live computed metrics.
- The fully populated demo world (ABC + 3 deals, contacts, documents metadata, KPIs, risks, tasks, meetings, comments, activity, seller token).

### 10.2 Stubbed (seam present; wired in a later phase)

| Capability | Phase 1 state | Real impl phase |
|------------|---------------|-----------------|
| Supabase persistence | `SupabaseRepository` is the documented drop-in; runtime uses `SeedRepository` | 2 |
| Supabase Auth / Entra ID session | `currentUser()` returns the seeded admin; no real login handshake | 2 |
| Postgres RLS enforcement | Policies authored in `/supabase/migrations`; not in the demo path | 2 |
| SharePoint byte storage + sync (Graph) | Metadata only; `sharePointSyncStatus = "not_connected"`; deep links are seeded URLs | 2 |
| Outlook reminders & meeting invites (Graph) | Meetings/reminders modeled & shown; nothing is actually sent | 2 / 5 |
| AI classification & metric extraction (Azure OpenAI + Doc Intelligence) | `ai*` fields populated from seed; no model invoked | 3 |
| AI assistant / generated summary | Answers/summaries from deterministic rules, not a live model | 3 |
| Category A secure-credential vault (Key Vault envelope encryption) | Items flagged `sensitive`/default Post-Signing; no vault integration | 3 |
| Automation: reminder engine, auto-transitions, scheduled reports, webhooks/cron | Modeled as activity/tasks; no background workers | 5 |
| Write mutations (create/edit/status/comment/upload) | Read-complete; writes added as Server Actions over the same repository contract | 2 (with persistence) |

---

## 11. Risks & Mitigations (MVP)

| Risk | Mitigation |
|------|------------|
| Seed model drifts from production schema | Domain `types.ts` is the single source of truth for **both** repository impls and mirrors `/supabase/migrations`; `tsc` strict catches drift. |
| "Demo-ware" temptation (logic baked into pages) | All business logic lives in pure `lib/domain/*`; pages are thin RSCs over selectors — same code path for Supabase. |
| Seller data leakage | Isolation enforced at three layers in Phase 1 (token scoping, `rbac` checks, view-model omission) and a fourth (RLS) in Phase 2. |
| PHI handling before BAA boundaries are wired | No real documents or PHI in Phase 1; bytes/AI stay stubbed until SharePoint (Graph BAA) and Azure OpenAI (BAA) are configured. |
| Phase 2 swap surprises | The factory swap is exercised continuously because the app already depends only on the interface; Supabase impl is validated against the same selector tests. |

---

## 12. Summary

The Phase 1 MVP is a **complete, role-aware diligence operating system running on a deterministic seed**, delivering all twelve in-scope capabilities against the real AMA template and a real analytics engine — with **zero external secrets**. Every external dependency (Supabase, Microsoft Graph/SharePoint, Outlook, Azure OpenAI/Document Intelligence) is a clean seam behind a narrow interface, so Phases 2–5 are additive activations, not rewrites. The production SQL schema and RLS ship alongside the demo, making the swap from "convincing demo" to "live system" a one-line backend selection rather than a re-architecture.
