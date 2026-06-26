# Mergers — Healthcare M&A Diligence Workflow Platform

A turnkey **M&A diligence operating system** for healthcare practice acquisitions —
primary care, specialty practices, RHCs, physician groups, and multi-location
outpatient groups. The acquiring company can create a transaction, auto-generate a
data room, send a standardized diligence request, let the seller upload documents
through a secure portal, auto-organize and classify files, extract financial /
operational / revenue-cycle KPIs, and read AI executive summaries and a deal-health
score — **without digging through folders manually**.

This repository implements the **Phase-1 MVP** as a production-shaped Next.js
application, backed by a production-grade Supabase Postgres schema and the full
**Standard AMA Healthcare Diligence List** as the domain core.

---

## What's in here

| Area | Status |
| --- | --- |
| 10 enterprise design documents (`/docs`) | ✅ Complete |
| Authentication & role-based access (RBAC model + RLS) | ✅ Model + DB policies |
| Transaction workspace with all 12 tabs | ✅ |
| Standard AMA diligence template (116 items, 8 categories) | ✅ |
| Diligence request tracker + filters (pre/post, status, overdue, missing…) | ✅ |
| Data room (auto folder structure + document list + AI classification) | ✅ |
| External seller upload portal (strict isolation) | ✅ |
| KPI dashboard + AI extraction model (with citations & confidence) | ✅ |
| AI executive summary, deal-health score, missing-item intelligence | ✅ |
| AI assistant (grounded Q&A over extracted data, runs offline) | ✅ |
| Global dashboard, tasks, calendar, contacts, reports, settings, admin | ✅ |
| Production Postgres schema (32 tables, enums, indexes) + RLS | ✅ |
| SharePoint / Outlook / Azure OpenAI integration | 📐 Designed; wired seams (Phases 2–3) |

The running demo uses a **seed-backed data layer** so it boots with zero external
services. The Supabase schema, Microsoft Graph, and Azure OpenAI integrations are
the production seams documented in `/docs` and exposed via `.env`.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are required for the demo. Useful scripts:

```bash
npm run build      # production build (all routes compile)
npm run typecheck  # tsc --noEmit
npm run lint
```

### Sign in

The app sits behind a role-based login. It uses a **client-side demo auth layer**
(sessions and the editable user/role config live in the browser's `localStorage`) —
the production design uses Supabase Auth / Microsoft Entra ID with MFA (see `/docs`).

- Any password works in the demo; or click one of the listed demo accounts.
- Each role sees a different navigation and access level (e.g. only **Admin** sees
  the Admin console). Sign in as **Nina Patel (Admin)** to edit users and the
  role→permission matrix under **Admin** — changes persist in your browser.
- The external **seller portal** (`/portal/...`) is separate and token-based — no login.

### Try the demo

- **Global dashboard** — `/` — pipeline health, high-risk deals, AI digest.
- **Hero transaction** — open **ABC Family Medicine** from `/transactions`.
  It is populated to match the spec's worked example: T12 revenue ~$4.8M,
  EBITDA ~$720K, payroll ~39% of revenue, total AR ~$610K, 42 employees — with
  the critical pre-signing gaps (unit-level P&L, payer mix, lease agreements)
  surfaced everywhere.
  - **Overview** — deal-health score with factor breakdown + recommended next action.
  - **Diligence Tracker** — filter by pre/post-signing, category, status, overdue, missing.
  - **KPI Dashboard** — every metric cites its source document and confidence.
  - **AI Summary** — executive summary, risks, opportunities, next steps.
  - **AI Assistant** — ask "What is the T12 revenue?", "What's missing before signing?".
- **Seller portal** — `/portal/abc-secure-demo-portal` — the seller's isolated,
  non-technical view (no internal notes, no KPIs, no deal score).
- **Admin** — `/admin` — the live RBAC permissions matrix and seller-isolation invariants.

---

## Architecture

```
Next.js 14 (App Router, RSC) + TypeScript + Tailwind
        │
        ├── src/lib/domain      ← domain core (single source of truth)
        │     types · diligence-template (AMA list) · rbac · kpi-definitions
        │     analytics (completion, missing-item, deal-score) · summary · assistant
        │
        ├── src/lib/data        ← DiligenceRepository abstraction
        │     SeedRepository (in-memory demo)  │  SupabaseRepository (prod drop-in)
        │
        ├── src/lib/selectors   ← compose repository + analytics into view models
        │
        ├── src/app             ← pages (server components) + route groups
        │     (app)/*  internal app shell      portal/[token]  seller portal
        │
        └── supabase/migrations ← production Postgres schema + RLS policies
```

**Why a repository abstraction?** Pages depend only on the `DiligenceRepository`
interface — never on the seed data directly. Swapping `DATA_BACKEND=seed` for
`supabase` changes nothing in the UI; the Supabase implementation maps 1:1 to the
tables in `supabase/migrations`.

### Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS, lucide-react
- **Database:** Supabase Postgres (schema + Row Level Security)
- **Auth:** Supabase Auth and/or Microsoft Entra ID (MFA)
- **Documents:** SharePoint via Microsoft Graph (primary repository)
- **AI:** Azure OpenAI / OpenAI + Azure Document Intelligence (PHI under a BAA)
- **Integrations:** Microsoft Graph (SharePoint + Outlook)

---

## Domain highlights

### Standard AMA Healthcare Diligence List
`src/lib/domain/diligence-template.ts` encodes all 8 categories (A–H), every item,
its pre/post-signing timeline, sensitivity, and critical-pre-signing flags, plus the
AI extraction targets per category. Sensitive credential items (category A) are
flagged for the secure credential workflow and never requested in plain text.

### RBAC & seller isolation
`src/lib/domain/rbac.ts` defines the permission catalog and role→permission matrix
for all 8 roles. External sellers are scoped to a single transaction and can never
see internal notes, AI deal scores, valuation, KPIs, or other transactions. This is
enforced in the UI and at the database layer (`supabase/migrations/0002_rls.sql`).

### Analytics engine
`src/lib/domain/analytics.ts` computes completion stats, folder roll-ups, the
missing-item report (critical pre-signing gaps, overdue, unmatched/duplicate/outdated
files), and the deal-health score (Strong / Moderate / Needs Review / High Risk /
Insufficient Data) with an explainable factor breakdown and source citations.

### Grounded AI
`assistant.ts` and `summary.ts` follow strict rules: never invent data, always cite
the source document, surface missing metrics, separate AI-extracted from
human-reviewed values, and report confidence. The MVP runs these deterministically
from the extracted metrics; the production LLM layer (RAG over the transaction's
documents only) is specified in `docs/08-ai-architecture-plan.md`.

---

## Database

Apply the schema to a Supabase project:

```bash
# migrations are plain SQL — apply in order
supabase/migrations/0001_schema.sql   # 32 tables, enums, indexes, append-only audit
supabase/migrations/0002_rls.sql      # reviewer scoping + seller isolation policies
supabase/seed.sql                     # 10 categories + default template header
```

The schema covers every entity in the spec: organizations, users, roles, transactions,
contacts, stages, diligence templates/categories/items, request items + status history,
seller portal users, upload links, data rooms, folders, documents + versions,
SharePoint files, AI classifications, extracted metrics, KPI snapshots, risk flags,
tasks, comments, notifications, reminder schedules, meetings, SharePoint/Outlook sync
logs, audit logs, and permission logs.

---

## Build phases

- **Phase 1 (this repo):** auth & RBAC model, transactions, contacts, AMA template,
  request tracker, status tracking, manual upload, seller portal, data room, dashboard,
  activity timeline.
- **Phase 2:** SharePoint folder creation + two-way file/metadata sync; Outlook calendar
  + email reminders; Microsoft login. → `docs/06`, `docs/07`.
- **Phase 3:** AI classification, request-item matching, document summaries, metric
  extraction, missing-doc detection, confidence scoring, source citations, review queue.
  → `docs/08`, `docs/09`.
- **Phase 4:** full KPI dashboards, deal-health score, risk indicators, leadership summary.
- **Phase 5:** smart reminders, leadership digests, AI follow-up emails & meeting agendas,
  investment-committee reports, comparative analysis, advanced permissions, Teams.

---

## Design documents (`/docs`)

1. [Product Requirements](docs/01-product-requirements.md)
2. [Roles & Permissions Matrix](docs/02-roles-permissions-matrix.md)
3. [Database Schema](docs/03-database-schema.md)
4. [Page-by-page UI Plan](docs/04-ui-plan.md)
5. [Diligence Template Schema](docs/05-diligence-template-schema.md)
6. [SharePoint Integration Plan](docs/06-sharepoint-integration-plan.md)
7. [Outlook Integration Plan](docs/07-outlook-integration-plan.md)
8. [AI Architecture Plan](docs/08-ai-architecture-plan.md)
9. [KPI Extraction Logic](docs/09-kpi-extraction-logic.md)
10. [MVP Build Plan](docs/10-mvp-build-plan.md)

---

## Security posture

HIPAA-conscious, SOC 2-style auditability by design: role-based access control,
transaction-level permissions, strict external-seller isolation, expiring/revocable
upload links, MFA / Microsoft Entra ID support, encryption in transit and at rest,
least-privilege SharePoint permissions, a sensitive-credential request workflow (no
plain-text password storage), append-only audit and permission logs, and
internal-vs-seller visibility controls enforced in both the app and Postgres RLS.
