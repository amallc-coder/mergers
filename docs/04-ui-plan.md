# 04 — Page-by-Page UI / UX Plan

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering (frontend), Product, Design, UX, Accessibility, Executive Sponsors
**Status:** Implementation-grade specification
**Last reviewed:** 2026-06-26
**Stack assumed:** Next.js 14 (App Router, RSC + Server Actions) · TypeScript · Tailwind CSS · `lucide-react` · `clsx`

---

## 1. Purpose & How To Read This Document

This document specifies the **user interface and user experience** of the platform, page by page. For every key screen it defines: **layout**, **components**, **data shown**, **primary actions**, and **role visibility**. It is written to be built against directly — the component inventory in §16 is the contract between this plan and the React codebase.

Two cross-cutting rules govern everything below:

1. **The UI is the third layer of authorization, never the first.** Hiding or disabling controls is UX courtesy. The API/server-action layer and Postgres RLS are the real enforcement (see Doc 02). Every "role visibility" note in this document must have a corresponding server-side guard. If the UI shows it but the server denies it, that is a UX bug, not a security hole; if the UI hides it but the server allows it, that is a security hole.
2. **Executive-friendly, minimal clicks.** The primary persona for the most-visited surfaces (Global Dashboard, Transaction Overview, KPI Dashboard) is a non-technical executive scanning for status. Default to **glanceable summaries, progressive disclosure, and at most two clicks to any answer.** Power density (dense tables, bulk actions) is reserved for the M&A Coordinator and reviewer surfaces.

Role keys used throughout (from Doc 02): `admin`, `coordinator`, `executive`, `finance_reviewer`, `operations_reviewer`, `legal_reviewer`, `hr_reviewer`, `seller`. The four specialist reviewer roles are collectively abbreviated **"Reviewers"** where behavior is identical.

---

## 2. Design System Foundations

### 2.1 Design Principles

| Principle | What it means in the UI |
|---|---|
| **Glance, then drill** | Every page opens with summary cards / completion bars before any dense table. The executive answer is above the fold; the detail is one scroll or one click below. |
| **One primary action per surface** | Each page has a single, visually dominant primary button (filled `brand-600`). Secondary actions are outline/ghost. No screen presents two equally-weighted "do it now" buttons. |
| **Status is always color + shape + text** | Never color alone (accessibility). A chip is a colored pill **plus** an icon **plus** a label. |
| **Calm by default, loud on risk** | Neutral `ink` palette dominates. Saturated color (red/amber) is reserved for risk, overdue, and rejected states so it actually means something when it appears. |
| **Seller sees a different product** | The external portal is not the internal app with things hidden — it is a separate, simplified, branded surface with its own layout shell. |
| **No dead ends** | Empty states always offer the next action ("No risks logged — Add the first risk" / "No documents yet — here's the upload link to send"). |

### 2.2 Color Tokens (from `tailwind.config.ts`)

| Token | Hex | Usage |
|---|---|---|
| `brand-600` | `#1f47eb` | Primary buttons, active nav, links, focus rings, primary progress fill |
| `brand-50` | `#eef4ff` | Active nav background, selected row tint, info banners |
| `ink-900` | `#1f2430` | Primary text, headings |
| `ink-500` | `#65738f` | Secondary text, labels, placeholder |
| `ink-200` | `#d5d9e2` | Borders, dividers, track of progress bars |
| `ink-50` | `#f6f7f9` | App background, table header background |
| Semantic (mapped in `globals.css` as CSS vars, used via Tailwind `text-*`/`bg-*` utility aliases) | | |
| `success` | emerald-600 `#059669` | Accepted, Received, on-track, complete |
| `warning` | amber-500 `#f59e0b` | Pending, Under Review, Needs Clarification, due-soon |
| `danger` | red-600 `#dc2626` | Rejected, Denied, Overdue, High/Critical risk |
| `neutral` | ink-400 `#8591aa` | Not Applicable, Not Started, draft |
| `info` | brand-500 `#3464f6` | AI-related states, informational |

### 2.3 Typography & Spacing

- **Font:** system sans via `--font-sans` (Inter-class). Sizes: Display 30/36, H1 24/32, H2 18/28, H3 16/24, Body 14/22, Small 12/18, Mono (IDs, hashes, confidence %) 13/20.
- **Spacing scale:** 4px base. Page gutter 24px (mobile 16px). Card padding 20px. Section gap 24px.
- **Radius:** `rounded-lg` (8px) for cards/inputs, `rounded-full` for chips/avatars/progress, `rounded-md` (6px) for buttons.
- **Elevation:** `shadow-card` for resting cards, `shadow-pop` for popovers/menus/modals/drag-over states.
- **Grid:** 12-column, max content width 1440px, centered. Tables may go full-bleed within the content column.

### 2.4 Iconography

`lucide-react` only, 1.5px stroke, 16px inline / 20px nav / 24px feature. Canonical icon-to-meaning mapping is fixed (e.g., `ShieldAlert`=risk, `Sparkles`=AI, `CloudUpload`=upload, `RefreshCw`=SharePoint sync, `Lock`=credentials/Category A) so meaning is learnable across the app.

### 2.5 Theming

Light theme ships first. Tokens are CSS variables so a dark theme is additive (Phase 2). Brand color is centralized for white-label of the Seller portal per acquiring entity.

---

## 3. Application Shell & Navigation

### 3.1 Internal Shell (all internal roles)

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  [≡] Logo  | Transaction Switcher ▾ |        🔍  ⏰  ❓  🔔  ◐  ◯ │
├──────────┬─────────────────────────────────────────────────────────────┤
│ SIDEBAR  │  PAGE HEADER  (title · breadcrumb · context · primary action)│
│          │  ────────────────────────────────────────────────────────── │
│ ▦ Global │                                                              │
│ ◫ Trans  │                       PAGE BODY                              │
│ ▤ Data   │                                                              │
│ ☑ Dilig  │                                                              │
│ ▥ KPI    │                                                              │
│ ☐ Tasks  │                                                              │
│ ▣ Calend │                                                              │
│ ◑ Contac │                                                              │
│ ▦ Report │                                                              │
│ ⚙ Setting│                                                              │
│ ⛨ Admin  │                                                              │
└──────────┴─────────────────────────────────────────────────────────────┘
```

- **Top bar (sticky, 56px):** hamburger (collapses sidebar), logo (→ Global Dashboard), **Transaction Switcher** (typeahead combobox scoping the whole app to one deal; "All Transactions" = portfolio mode), global search (⌘K command palette), reminders bell, help, **notifications** bell with unread dot, theme toggle, user avatar menu (profile, role badge, sign out).
- **Sidebar (240px, collapsible to 64px icon rail):** the 11 main-nav items. Active item: `bg-brand-50 text-brand-700` + left accent bar. Collapsed state shows icon + tooltip. **Admin** item renders only for `admin`; **KPI Dashboards** and **Reports** are visually present for all internal roles but route to role-filtered content.
- **Page header:** breadcrumb (`Transactions / Northgate Pediatrics / Diligence`), page title, contextual metadata (deal stage chip, health score badge), and the page's single primary action right-aligned.
- **Command palette (⌘K):** jump to transaction, jump to nav, run quick actions ("Add risk", "New task", "Invite seller"). Keyboard-first power-user accelerator.

### 3.2 External Shell (`seller` only)

A **completely separate layout** (`/portal/*` route group) — narrower, branded with the acquiring entity's logo, no sidebar, no transaction switcher, no portfolio concept. Top bar shows only: acquiring-entity logo, the single deal name, a help link, and account menu (limited to "My Account" + sign out). The seller can never perceive navigation to anything outside their one transaction. See §11.

### 3.3 Global Nav → Role Visibility Matrix

| Nav item | admin | coordinator | executive | Reviewers | seller |
|---|:--:|:--:|:--:|:--:|:--:|
| Global Dashboard | ✅ | ✅ | ✅ | ✅ (assigned-scoped) | — |
| Transactions | ✅ | ✅ | ✅ | ✅ (assigned only) | — |
| Data Rooms | ✅ | ✅ | ✅ (read) | ✅ (assigned + granted categories) | — |
| Diligence Requests | ✅ | ✅ | ✅ (read) | ✅ (assigned + granted categories) | — (seller sees portal equivalent) |
| KPI Dashboards | ✅ | ✅ | ✅ | ✅ (category slice) | — |
| Tasks | ✅ | ✅ | ✅ | ✅ (own + assigned) | — |
| Calendar | ✅ | ✅ | ✅ | ✅ | limited (own meetings, in portal) |
| Contacts | ✅ | ✅ | ✅ (read) | ✅ (read) | — |
| Reports | ✅ | ✅ | ✅ | ✅ (scoped) | — |
| Settings | ✅ | ✅ (deal-scoped) | own prefs | own prefs | own prefs (portal) |
| Admin | ✅ | — | — | — | — |

---

## 4. Page: Global Dashboard

**Route:** `/` · **Primary persona:** Executive Leadership & M&A Coordinator · **Purpose:** Portfolio command center — the live state of every active deal in one glance.

### 4.1 Layout

Top-down, glance-to-drill:

1. **KPI strip** — 5 KPI cards across the top (full width).
2. **Portfolio pipeline** — horizontal stage funnel (the 20 stages bucketed into ~6 phases) showing how many deals sit in each phase.
3. **Two-column body:**
   - **Left (8 cols):** Active Transactions table (the portfolio).
   - **Right (4 cols):** Attention rail — "Needs Your Attention" stack: overdue items, expiring credentials, high/critical risks, pending sign-offs.
4. **Activity feed** — collapsible, recent portfolio-wide activity (coordinator/admin only).

### 4.2 Components & Data

| Zone | Component | Data shown |
|---|---|---|
| KPI strip | `KpiCard` ×5 | **Active Deals**, **Avg Deal Health** (0–100, weighted), **Diligence Completion** (portfolio %, with sparkline trend), **Overdue Items** (count, red if >0), **Items Awaiting Internal Review** (count) |
| Pipeline | `StageFunnel` | Deal count per phase; click a phase → Transactions list pre-filtered to that stage |
| Portfolio table | `TransactionTable` | Deal name, practice type, stage chip, **health score badge**, **completion bar**, open risks (badge), overdue count, next milestone date, owner avatar |
| Attention rail | `AttentionList` (grouped) | Overdue diligence items, credentials expiring ≤30 days, unresolved High/Critical risks, sign-offs awaiting executive |
| Activity | `ActivityFeed` (compact) | Cross-deal events (status changes, uploads, AI completions) |

### 4.3 Primary Actions

- **Primary button:** **New Transaction** (coordinator/admin).
- Row click → Transaction Detail. Attention item click → deep link to the exact item/risk. KPI card click → drill to filtered list.

### 4.4 Role Visibility

| Role | What they see |
|---|---|
| `admin`, `coordinator` | Full portfolio, all deals, activity feed, New Transaction. |
| `executive` | Full portfolio (read-heavy), health/KPI focus, sign-offs-awaiting surfaced prominently; no New Transaction, no activity feed mutation. |
| Reviewers | **Scoped portfolio** — only transactions they are assigned to; KPI cards recomputed over their assigned set; attention rail shows only their queue. |
| `seller` | No access (different product entirely). |

---

## 5. Page: Transactions (List)

**Route:** `/transactions` · **Purpose:** The filterable index of all deals; the coordinator's working list.

### 5.1 Layout

- **Header:** title, deal count, **New Transaction** primary button, view toggle (**Table** / **Board** kanban by stage).
- **Filter bar (sticky):** search; facets for **practice type**, **stage/phase**, **owner**, **health band** (Healthy / Watch / At-Risk), **has overdue**, **has open risks**, **pre-signing vs post-signing focus**, **archived**. Saved views (e.g., "My deals", "At-risk", "Closing this quarter").
- **Body:** dense, sortable `TransactionTable` (or kanban board). Pagination + "rows per page".

### 5.2 Data per row

Deal name (+ subtitle: legal entity / location count) · practice type · stage chip · health badge · completion bar (with `received / total` tooltip) · pre/post-signing split mini-bars · open risks badge · overdue badge · last activity · owner avatar · row overflow menu (Open, Edit, Archive, Duplicate from template).

### 5.3 Primary Actions

**New Transaction** → modal wizard: deal name, practice type, # locations, target close, owner, **seed from default AMA Diligence List** (default ON), invite seller now (optional). Bulk select → assign owner / archive (coordinator/admin).

### 5.4 Role Visibility

`admin`/`coordinator`: all deals + create/archive. `executive`: all deals, read, no create. Reviewers: **assigned deals only** (RLS-enforced), no create. Board view available to all internal roles.

---

## 6. Page: Transaction Detail (12 Tabs)

**Route:** `/transactions/[id]` · **Purpose:** The single workspace for one deal. This is the most important screen in the product.

### 6.1 Shared Detail Shell

A persistent **transaction header** sits above the tab strip on every tab:

- **Identity:** deal name, legal entity, practice type, # locations, owner avatar.
- **Status cluster:** stage chip, **health score badge** (0–100, color-banded), **overall completion bar**, target-close countdown.
- **Quick stats:** received/total items, overdue count, open risks, pending reviews.
- **Header actions:** **Advance Stage** (primary, role-gated), overflow (Edit, Archive, Export deal pack, Open in SharePoint, Invite/Manage seller).
- **Tab strip:** 12 tabs (horizontal, scrollable on mobile, condensing into a "More ▾" overflow). Each tab badges its own count where meaningful (e.g., Diligence shows overdue count; Risk Log shows open-critical count). Tabs deep-link via `/transactions/[id]/[tab]`.

Tab visibility is role-aware: a tab the role cannot see is **not rendered** (e.g., `seller` never reaches this shell at all; reviewers see Internal Notes only if assigned).

### 6.2 Tab 1 — Overview

- **Layout:** left 2/3 deal summary + AI executive brief snippet; right 1/3 "at a glance" stats and next steps.
- **Components:** `DealSummaryCard` (key facts, deal economics if granted), `CompletionByCategory` (8 horizontal bars, one per A–H category, pre/post split), `NextStepsList` (top open tasks + overdue items), `AiBriefPreview` (2–3 sentence AI executive summary with "View full AI Summary →").
- **Data:** stage, health, valuation snapshot (finance/exec only), completion %, top 3 risks, upcoming meetings.
- **Actions:** Advance stage, jump to any tab. **Visibility:** all internal roles; deal-economics block gated to finance/exec/coordinator/admin.

### 6.3 Tab 2 — Contacts

- **Layout:** two groups — **Internal team** (reviewers + owner with assigned categories) and **External contacts** (seller-side people).
- **Components:** `ContactCard` grid, `AssignmentEditor`, seller-invite status pill (Invited / Active / Expired).
- **Data:** name, title, org, email/phone, role on deal, category assignments, last contacted.
- **Actions:** add/edit external contact, **assign reviewer + grant categories** (coordinator/admin), **invite/re-invite Seller** (coordinator/admin), set primary seller contact. **Visibility:** all internal read; mutation = coordinator/admin. Reviewers see internal contacts and only external contacts in their granted categories.

### 6.4 Tab 3 — Data Room

Embeds the **Data Room** experience scoped to this transaction. Full spec in §7. Within the tab: folder tree (A–H category structure) + document list with classification, confidence, review status, version history. Drag-and-drop upload, document preview, SharePoint sync indicator. Reviewers see only granted-category folders.

### 6.5 Tab 4 — Diligence Request Tracker

Embeds the **Diligence Request Tracker** scoped to this deal. Full spec in §8. The operational heart: every diligence item with timeline, status, assignee, due date, AI classification, review status. Reviewers see their granted categories; coordinator/admin see all.

### 6.6 Tab 5 — AI Summary

- **Layout:** single readable column (max 760px) like a generated report, with a right TOC rail.
- **Components:** `AiExecutiveSummary` (narrative), `DealHealthExplainer` (what drives the score), `RedFlagList` (AI-surfaced risks with source citations), `MissingItemsCallout`, `KpiHighlightGrid`, **regenerate** control with model/version + timestamp, **confidence banner**, and a persistent **"AI-assisted — verify before relying"** disclaimer.
- **Data:** generated narrative, extracted KPIs, flagged risks each linking to the source document/page, confidence scores, generation metadata (model, prompt version, generated-at, generated-by).
- **Actions:** **Regenerate summary** (coordinator/admin), **promote a flagged risk → Risk Log**, **promote a missing item → reminder/task**, copy/export, thumbs up/down feedback. Every AI claim links to its evidence. **Visibility:** all internal roles read; regenerate = coordinator/admin; finance-specific economic detail gated.

### 6.7 Tab 6 — KPI Dashboard

Embeds the per-deal **KPI Dashboard** (§9): financial, operational, clinical, RCM, workforce KPI cards with trends, source attribution, and human-verified flags. Reviewers see their category slice.

### 6.8 Tab 7 — Tasks

- **Layout:** grouped list (Overdue / Due Soon / Upcoming / Done) or board by status.
- **Components:** `TaskList`, `TaskRow` (title, assignee, due, linked item/category, priority), `TaskComposer`.
- **Data:** internal tasks (not seller-visible), each optionally linked to a diligence item, risk, or document.
- **Actions:** create/assign/complete task, set due/priority, bulk reassign. **Visibility:** internal only; reviewers see own + assigned; coordinator/admin see all.

### 6.9 Tab 8 — Meetings

- **Layout:** upcoming list + past list, plus mini calendar.
- **Components:** `MeetingCard` (title, time, attendees, Teams/Outlook link, agenda, notes), `ScheduleMeetingButton` (Graph-backed availability).
- **Data:** meetings synced via Microsoft Graph (Outlook), attendees (internal + seller where invited), agenda, linked notes/recording link.
- **Actions:** schedule (find availability via Graph), edit, attach notes, link to diligence items. **Visibility:** internal full; seller sees only meetings they are invited to (rendered in their portal, not here).

### 6.10 Tab 9 — Activity Timeline

- **Layout:** reverse-chronological vertical timeline with day separators.
- **Components:** `ActivityTimeline`, per-event `ActivityRow` (actor avatar, action verb, object link, timestamp, source: human/AI/system), filter chips (by actor, by type: status / upload / review / AI / sync / access).
- **Data:** the immutable audit stream for this deal — status transitions, uploads/downloads, review decisions, AI runs, SharePoint syncs, access events, permission changes.
- **Actions:** filter, export audit (admin/coordinator). **Read-only — no edit/delete ever** (audit integrity). **Visibility:** internal; full detail to coordinator/admin; reviewers see events within their categories; access/permission events admin-emphasized.

### 6.11 Tab 10 — Internal Notes

- **Layout:** threaded notes feed + composer; category/topic filter.
- **Components:** `NoteThread`, `NoteComposer` (rich text, @mentions, attach reference to item/doc/risk), visibility selector (always **internal-only**, hard-locked — clearly labeled "Never visible to Seller").
- **Data:** internal commentary, decisions, rationale; explicitly segregated from seller-facing notes.
- **Actions:** post note, @mention (notifies), reply, resolve thread. **Visibility:** internal only; reviewers post in their categories; **structurally impossible to expose to `seller`** (separate table + RLS).

### 6.12 Tab 11 — Risk Log

- **Layout:** sortable risk register table + summary band (counts by severity).
- **Components:** `RiskSummaryBand` (Critical/High/Medium/Low tallies), `RiskTable`, `RiskDrawer` (detail/edit), `AddRiskButton`.
- **Data per risk:** title, category (A–H or cross-cutting), **severity badge**, likelihood, status (Open / Mitigating / Accepted / Closed), owner, linked evidence (doc/item), source (human vs AI-surfaced), mitigation plan, created/updated.
- **Actions:** add risk, edit, change severity/status, assign owner, link evidence, accept-with-rationale (gated), close. AI-surfaced risks enter as **proposed** and require human confirmation. **Visibility:** internal; reviewers manage risks in their categories; accept/close of Critical may require executive sign-off; finance/legal risks respect category grants.

### 6.13 Tab 12 — SharePoint Sync Log

- **Layout:** sync status banner + event table.
- **Components:** `SyncStatusBanner` (Healthy / Syncing / Degraded / Error + last-sync time), `SyncEventTable`, `RetryButton`.
- **Data:** per-document and per-folder sync events — direction (app→SP / SP→app), object, status (Queued / Synced / Conflict / Failed), SharePoint path/URL, error detail, retry history, timestamps; mapping of this deal → SharePoint site/library.
- **Actions:** **retry failed sync**, **resolve conflict** (choose authoritative version), open in SharePoint, view mapping config. **Visibility:** coordinator/admin (operational); reviewers read-only status; executive sees only the health banner. Errors raise a notification to the coordinator.

### 6.14 Tab Visibility Summary

| Tab | admin | coordinator | executive | Reviewers (assigned) |
|---|:--:|:--:|:--:|:--:|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Contacts | ✅ | ✅ | read | granted-category read |
| Data Room | ✅ | ✅ | read | granted categories |
| Diligence Tracker | ✅ | ✅ | read | granted categories |
| AI Summary | ✅ | ✅ | ✅ | read |
| KPI Dashboard | ✅ | ✅ | ✅ | category slice |
| Tasks | ✅ | ✅ | ✅ | own + assigned |
| Meetings | ✅ | ✅ | ✅ | ✅ |
| Activity Timeline | ✅ | ✅ | read | category-scoped read |
| Internal Notes | ✅ | ✅ | ✅ | granted categories |
| Risk Log | ✅ | ✅ | ✅ | granted categories |
| SharePoint Sync Log | ✅ | ✅ | banner only | status read |

---

## 7. Page: Data Room

**Route:** `/transactions/[id]/data-room` (also `/data-rooms` portfolio index) · **Purpose:** Browse, classify, review, and version every document in the deal — the document plane.

### 7.1 Layout — Three-Pane Explorer

```
┌─────────────┬───────────────────────────────────────┬──────────────────┐
│ FOLDER TREE │  DOCUMENT LIST (table)                 │  PREVIEW / DETAIL │
│ A. Logins 🔒│  ▢ name  class  conf  status  ver  …   │  (doc viewer +    │
│ B. Finance  │  ───────────────────────────────────── │   metadata panel) │
│ C. RCM      │  ▢ EOB_2024.pdf  Finance  96%  Accepted │  [thumbnail]      │
│ D. Provider │  ▢ Lease_A.pdf   Legal    71%⚠ Review   │  Classification…  │
│ E. Ops      │  ▢ …                                    │  Version history  │
│ F. HR       │                                         │  Review actions   │
│ G. IT/EMR   │  [⬆ Drag & drop files here]            │                  │
│ H. Legal    │                                         │                  │
└─────────────┴───────────────────────────────────────┴──────────────────┘
```

### 7.2 Pane 1 — Folder Tree

- **Components:** `FolderTree` mirroring the **8 categories A–H** (Category A "Logins/Passwords" badged with `Lock`, visually distinct, default Post-Signing). Sub-folders per diligence item or per coordinator-defined structure.
- **Data:** folder name, doc count, completion %, category color dot, sync status dot.
- **Behavior:** select folder → filters doc list. Reviewers see **only granted-category folders**; ungranted folders are not rendered. Category A is hidden unless explicitly granted the credential workflow.

### 7.3 Pane 2 — Document List

- **Components:** `DocumentTable` with columns: checkbox, **doc name + type icon**, **AI classification chip** (which category/item the AI assigned), **confidence score** (%, with `ConfidenceMeter`: green ≥90, amber 70–89, red <70), **review status chip**, **version** (v3 ▾), uploaded-by + source (Seller / Internal / Email-ingest), date, overflow menu.
- **Data:** all documents in the selected folder/category, filterable and sortable.
- **Filters (toolbar):** classification category, **review status** (Uploaded / Under Review / Accepted / Rejected / Needs Clarification / Internal Review Complete), **confidence band**, **human-review-required only**, source, date range, **misclassified/unclassified**.
- **Bulk actions:** accept, request clarification, reassign category, download, move folder (coordinator/admin + reviewers within category).
- **Drag-and-drop upload (`DropzoneOverlay`):** drop files anywhere on the pane → upload queue with per-file progress, AI auto-classification on completion, and a confirm-or-correct step for the suggested category. Large files chunk-upload with resumable progress.

### 7.4 Pane 3 — Preview / Detail

- **Components:** `DocumentPreview` (in-browser PDF/image/Office viewer via Graph/embedded viewer, page nav, zoom, search-in-doc), `DocMetaPanel`, `ClassificationPanel` (AI category + confidence + **"Confirm / Reclassify"**), `ReviewActionBar`, `VersionHistory`.
- **Data:** filename, size, type, classification + confidence, assigned reviewer, review status, linked diligence item, internal notes on the doc, seller-facing notes, extracted KPIs (if any), SharePoint URL, audit of actions.
- **Version history:** `VersionHistory` lists every version (vN, uploaded-by, date, size, "current" badge), with **view / compare / restore / download** per version and an inline diff note when a reupload supersedes a prior file.
- **Review actions:** set status (Under Review → Accepted / Rejected / Needs Clarification), **flag human-review-required**, write internal note, write seller-facing clarification (triggers seller notification), confirm/correct AI classification. Each action writes to the Activity Timeline.

### 7.5 Role Visibility

| Capability | admin | coordinator | executive | Reviewers | seller |
|---|:--:|:--:|:--:|:--:|:--:|
| Browse folders/docs | all | all | read all | granted categories | upload-only via portal, no browse |
| Upload | ✅ | ✅ | — | granted categories | own items (portal) |
| Set review status | ✅ | ✅ | — | granted categories | — |
| Confirm/correct classification | ✅ | ✅ | — | granted categories | — |
| Version restore | ✅ | ✅ | — | granted categories | — |
| See seller-facing notes | ✅ | ✅ | ✅ | ✅ | only their own |
| See internal notes on doc | ✅ | ✅ | ✅ | ✅ | **never** |
| Category A (credentials) | per secure workflow | per secure workflow | — | only if granted | controlled hand-off only |

---

## 8. Page: Diligence Request Tracker

**Route:** `/transactions/[id]/diligence` (also `/diligence-requests` portfolio index) · **Purpose:** The production line — track every diligence item from request to internal-review-complete.

### 8.1 Layout

- **Header:** title, **overall completion bar** + pre-signing / post-signing split bars, primary action **Add Item** (and **Issue List to Seller**), secondary **Send Reminders**, **Export**.
- **Category accordion / grouped table:** 8 sections A–H, each with a category completion bar and counts. Collapsed by default for executives; expanded for coordinators. Within each, a dense `DiligenceTable`.
- **View toggle:** grouped table (default) · kanban by status · matrix (category × status heatmap).

### 8.2 `DiligenceTable` Columns (per item)

Item name · **category** · **timeline chip** (Pre-Signing / Post-Signing) · **request status chip** (Received / Pending / Not Applicable / Denied) · **internal review status chip** (Uploaded / Under Review / Accepted / Rejected / Needs Clarification / Overdue / Internal Review Complete) · assigned **external contact** · assigned **internal reviewer** · **due date** (red if overdue) · uploaded docs count (→ Data Room) · **AI classification + confidence** · **human-review-required flag** · last-updated · row overflow.

### 8.3 Filters

Powerful, persistent filter bar (saved views): **pre/post-signing**, **category (A–H)**, **request status**, **review status**, **overdue**, **missing/not-yet-received**, **needs clarification**, **human-review-required**, assigned reviewer, assigned external contact, due-date range. Quick-filter chips: "Overdue", "Missing pre-signing", "Awaiting my review", "Needs clarification".

### 8.4 Item Drawer (`DiligenceItemDrawer`)

Click a row → right drawer with full item: description, both note streams (**internal notes** + **seller-facing notes** clearly separated), **upload link** (copyable, with expiry), uploaded documents (mini Data Room), status controls, timeline toggle (Pre/Post-Signing), reviewer & contact assignment, due date, AI classification with confidence and confirm/correct, human-review-required toggle, mini activity log.

### 8.5 Primary Actions

- **Add Item** (custom or from template); **Issue/Re-issue List to Seller**; **Bulk assign reviewers**; **Bulk set timeline**; **Send reminders** (to seller for missing/overdue); per-item status transitions; **Mark Not Applicable / Denied** with required rationale; **Mark Internal Review Complete**.
- Status transitions are guarded (e.g., can't go Accepted without an uploaded doc) and every transition is audited.

### 8.6 Role Visibility

`coordinator`/`admin`: full list, all categories, issue list, add items, assign, all transitions. `executive`: read with completion focus. Reviewers: **granted categories only** — can set review statuses, write notes, flag human-review-required, request clarification; cannot issue the list or mark items Denied/N/A (coordinator decision). Category A obeys the secure credential workflow (default Post-Signing, controlled visibility).

---

## 9. Page: KPI Dashboard

**Route:** `/transactions/[id]/kpi` (and portfolio `/kpi`) · **Purpose:** Extracted, verifiable deal metrics for finance/ops/exec decisioning.

### 9.1 Layout

- **Header:** title, period selector, **export to deck/PDF**, "as-of" timestamp, **data-source confidence banner**.
- **KPI card grid** grouped into sections:
  - **Financial:** revenue (TTM), EBITDA / adj. EBITDA, margin, AR days, payer mix, revenue concentration.
  - **Revenue Cycle:** clean-claim rate, denial rate, days in AR, collection rate.
  - **Operations/Clinical:** visit volume, provider productivity (wRVU), no-show rate, panel size, locations.
  - **Workforce/HR:** FTE count, provider count, turnover, comp ratios.
  - **Credentialing:** % providers credentialed, expiring credentials (≤90/60/30 days).
- **Trend & comparison:** mini line/bar charts per KPI; benchmark vs. portfolio median where available.

### 9.2 `KpiCard` Anatomy

Metric label · large value · delta vs. prior period (↑/↓ + color) · sparkline · **source attribution** ("from EOB_2024.pdf p.3" link) · **AI-extracted vs human-verified** badge · confidence dot · last-updated. Cards with low confidence or unverified extraction show an amber "Verify" affordance.

### 9.3 Actions & Visibility

- **Actions:** drill into source document, **mark KPI verified**, override value with rationale (audited), add KPI note, export.
- **Visibility:** `executive` (all, read), `coordinator`/`admin` (all + verify/override), `finance_reviewer` (financial + RCM), `operations_reviewer` (ops/clinical), `hr_reviewer` (workforce), `legal_reviewer` (credentialing/compliance counts). Each reviewer sees their **category slice**; the full grid is finance/exec/coordinator/admin.

---

## 10. Page: AI Assistant

**Route:** `/transactions/[id]/assistant` (deal-scoped) and `/assistant` (portfolio, coordinator/admin) · **Purpose:** Conversational, grounded co-pilot over the deal's documents and data.

### 10.1 Layout

- **Two-pane:** left = chat thread; right = **evidence/citations panel** showing the documents/passages grounding the latest answer.
- **Header:** scope selector (this deal / specific category / specific document), model/version indicator, **"AI-assisted — verify"** disclaimer.

### 10.2 Components & Behavior

- `ChatThread`, `MessageComposer` (with suggested prompts: "Summarize Category B status", "What pre-signing items are missing?", "List financial red flags with sources", "Draft a clarification request to the seller for item C-4").
- `CitationPanel` — every answer cites source docs/pages; clicking a citation opens the document preview at that page.
- **Grounded retrieval only:** answers are constrained to the deal's indexed documents + structured data; the assistant states when it lacks evidence rather than speculating.
- **Action chips on answers:** "Create task", "Add to Risk Log", "Send as seller clarification", "Save to Internal Notes" — turning AI output into tracked work, all human-confirmed.
- **Confidence + feedback:** per-answer confidence, thumbs up/down, "report inaccuracy" (logged for tuning).

### 10.3 Visibility

Internal only. Reviewers' assistant is scoped to their granted categories/documents (retrieval respects RLS — the model cannot surface ungranted content). `seller` has **no AI assistant**. All prompts/answers are audited; PHI handling per security doc.

---

## 11. Page: External Seller Portal

**Route group:** `/portal/*` · **Persona:** `seller` only · **Purpose:** A simple, friendly, single-deal surface for the seller to fulfill diligence requests — and nothing else.

### 11.1 Portal Principles

- **Radical simplicity & isolation.** The seller perceives only **their one transaction**. No portfolio, no internal users (only a generic "M&A Team"), no internal notes, no other deals, no AI internals, no risk log, no KPIs.
- **Task-list mental model.** "Here's what we need from you, here's what's done, here's what's outstanding."
- **Branded** with the acquiring entity's logo/colors.

### 11.2 Portal Pages

| Portal page | Layout & content |
|---|---|
| **Welcome / Home** | Friendly header, **overall progress ring** (items provided / requested), counts: Outstanding · Submitted · Accepted · Needs Your Attention. Primary CTA: "Continue providing documents". A short "How this works" panel. |
| **My Document Requests** | The seller-facing slice of the Diligence Tracker: each requested item shows item name, plain-language description, **timeline label** ("Needed now" vs "Needed after signing"), **status** (Requested / Submitted / Accepted / Needs Clarification — internal statuses like "Under Review/Rejected" are *translated* to seller-safe language), due date, **seller-facing notes only**, and an **Upload** control. Items can be marked by seller as **Not Applicable / Denied with reason** (routes to coordinator). Category A credential items use the **secure credential hand-off** form, not a file upload, and appear only when explicitly requested. |
| **Item Detail / Upload** | `Dropzone` drag-and-drop + file picker; upload progress; list of files the seller has submitted for this item; the seller-facing clarification thread (read coordinator messages, reply). Confirmation toast on successful submit. |
| **Messages** | Lightweight thread with the "M&A Team" (maps to seller-facing notes / clarification requests). Never exposes internal identities or internal notes. |
| **Meetings** | Only meetings the seller is invited to; accept/propose time via Graph; join link. |
| **My Account** | Profile, MFA, magic-link/OTP session management, contact info. |

### 11.3 Seller Status Translation

Internal review statuses are mapped to seller-safe equivalents so the seller never sees raw internal judgments:

| Internal | Seller sees |
|---|---|
| Uploaded / Under Review | **Submitted — In Review** |
| Accepted / Internal Review Complete | **Accepted** |
| Needs Clarification | **Action Needed** (+ the seller-facing note) |
| Rejected | **Please Re-submit** (+ reason, seller-facing note) |
| Overdue | **Overdue — Please Submit** |

### 11.4 Visibility & Security

Seller sees **only**: their items, seller-facing notes, their own uploads, their meetings, their account. **Never:** other transactions, internal notes, internal reviewer identities, AI summaries, KPIs, risk log, sync logs, or any portfolio surface. Enforced by RLS (`seller_participants` → single `transaction_id`) plus a separate route group and layout. Upload links are scoped, expiring, and audited.

---

## 12. Supporting Pages

### 12.1 Tasks (global)

`/tasks` — all tasks across the user's accessible transactions; grouped Overdue/Due Soon/Upcoming/Done; filter by deal, assignee, priority, linked-object; create/assign/complete. Reviewers see own + assigned; coordinator/admin see all.

### 12.2 Calendar (global)

`/calendar` — month/week/agenda views of meetings + diligence due dates + reminders, sourced from Microsoft Graph (Outlook) + platform deadlines. Color-coded by deal. Schedule meeting (availability via Graph), open in Outlook. Seller has a portal-only, single-deal mini calendar.

### 12.3 Contacts (global)

`/contacts` — directory of internal team and external/seller contacts across accessible deals; filter by deal, category, role; view assignments and last-contacted. Mutation (coordinator/admin); read (others, scoped).

### 12.4 Reports

`/reports` — prebuilt + exportable: Deal Health Report, Diligence Completion Report, Overdue/Missing Items, Risk Register Export, Credential-Expiry Report, Activity/Audit Export, Portfolio Executive Summary. Export to PDF/XLSX/deck. Scoped to accessible deals/categories; audit exports gated to coordinator/admin.

### 12.5 Settings

`/settings` — tabbed:
- **Profile & Preferences** (all roles): name, avatar, notification preferences, timezone, theme.
- **Notifications** (all): channel + event preferences (in-app, email via Graph), digest cadence.
- **Diligence Templates** (coordinator/admin): manage the default AMA Diligence List, categories, default timelines, SLAs.
- **Integrations** (admin): SharePoint site mapping, Microsoft Graph/Entra, Azure OpenAI / Document Intelligence config, connection health.
- **Security** (admin/own): MFA, sessions, SSO.
Reviewers/executive see Profile/Notifications/Security(own) only.

### 12.6 Admin

`/admin` (admin only) — user management & role assignment, category-grant management, audit log explorer (cross-deal), integration health & sync controls, feature flags, retention/credential-workflow policy, data export/legal hold. Not rendered for any non-admin role.

---

## 13. Cross-Cutting UX Patterns

### 13.1 Completion Bars

`CompletionBar` — `brand-600` fill on `ink-200` track, `rounded-full`, height 8px (compact) / 12px (feature). Variants: **single** (overall %), **segmented** (pre-signing vs post-signing in one bar with a divider), **stacked-by-status** (Accepted / In-review / Outstanding). Always paired with a `received / total` text label and tooltip breakdown. Per-category bars on Overview and Diligence Tracker.

### 13.2 KPI Cards

`KpiCard` — see §9.2. Compact variant (dashboard strip) shows label + value + delta only; full variant adds sparkline + source + verification badge. Loading = skeleton; empty = "No data extracted yet".

### 13.3 Risk Badges & Severity

`RiskBadge` — Critical (red, `ShieldAlert`), High (orange), Medium (amber), Low (ink). Always icon + label + color. Risk counts render as `Badge` pills on the Risk Log tab and Global Dashboard attention rail.

### 13.4 Status Chips

`StatusChip` — single component, variant-driven, covering **all** status vocabularies:

| Domain | Values → color |
|---|---|
| Diligence request | Received (success) · Pending (warning) · Not Applicable (neutral) · Denied (danger) |
| Internal review | Uploaded (neutral) · Under Review (warning) · Accepted (success) · Rejected (danger) · Needs Clarification (warning) · Overdue (danger) · Internal Review Complete (success-solid) |
| Timeline | Pre-Signing (info) · Post-Signing (neutral) |
| Sync | Synced (success) · Syncing (info) · Conflict (warning) · Failed (danger) |
| AI | AI-Classified (info + `Sparkles`) · Human-Verified (success) · Needs Review (warning) |

All chips: pill shape, icon + label, accessible name, never color-only.

### 13.5 Filters

`FilterBar` + `FilterChip` + `SavedViews`. Filters are URL-synced (shareable, back-button-safe), multi-select, with an active-filter summary and one-click clear. Standard facets everywhere relevant: **pre/post-signing, category (A–H), request status, review status, overdue, missing**. Quick-filter chips for the top 3–4 intents per page. Reviewers' filter options are pre-scoped to granted categories.

### 13.6 Drag-and-Drop Upload

`Dropzone` / `DropzoneOverlay` — drop anywhere on a data-room/upload surface; `shadow-pop` highlight on drag-over; per-file `UploadQueue` with progress, retry, cancel; resumable chunked upload for large files; on completion, AI classification runs and presents **Confirm / Reclassify**. Accepted types and size limits surfaced inline; clear errors. Keyboard/file-picker fallback always present (accessibility — drag-and-drop is never the only path).

### 13.7 Document Preview

`DocumentPreview` — in-browser viewer (PDF/image/Office via Graph embed) with page nav, zoom, search-in-document, and citation deep-linking (AI/KPI sources open at the cited page). Side metadata panel + review action bar. Download respects permissions and is audited.

### 13.8 Notifications & Reminders

In-app `NotificationCenter` (bell + dropdown + full page) and email via Graph. Events: new upload, status change, overdue, needs-clarification, sign-off requested, sync error, AI run complete, mention. Per-user preferences in Settings; digest option.

### 13.9 Empty, Loading, Error States

Every list/card has three designed states: **loading** (skeletons, never spinners-on-blank), **empty** (icon + one-line explanation + the next action), **error** (cause + retry, never a raw stack). RSC streaming + Suspense boundaries keep above-the-fold content fast.

### 13.10 Confirmation & Audit Affordances

Destructive or consequential actions (Deny, Reject, Archive, Restore version, Accept-Critical-risk, Issue list, Override KPI) use a confirm dialog that **requires a rationale** where the rationale is audited. Toasts confirm success and link to the audit entry.

---

## 14. Mobile Responsiveness

| Breakpoint | Behavior |
|---|---|
| `< 640` (mobile) | Sidebar → bottom tab bar or hamburger drawer. Tables → **stacked cards** (each row becomes a card with label:value pairs and a chevron). Transaction Detail tabs → swipeable segmented control + "More ▾". Three-pane Data Room → single column with folder → list → preview as drill-in screens. Drag-and-drop replaced by prominent file-picker/camera-capture. KPI strip scrolls horizontally (snap). |
| `640–1024` (tablet) | Sidebar collapses to icon rail; two-pane layouts collapse to one with a toggle; tables keep priority columns, hide secondary behind "expand row". |
| `≥ 1024` (desktop) | Full layouts as specified. |

The **Seller Portal is mobile-first** — sellers frequently upload from phones, so upload, status, and messages are designed primarily for small screens with camera capture for document photos.

---

## 15. Accessibility (WCAG 2.1 AA target)

- **Color & contrast:** all text ≥ 4.5:1 (≥ 3:1 large); status never conveyed by color alone (icon + label always). Verified against the token palette.
- **Keyboard:** every interactive element reachable and operable by keyboard; logical tab order; visible `brand-600` focus ring (never removed); ⌘K palette; skip-to-content link; Escape closes drawers/modals; arrow-key navigation in tables and trees.
- **Screen readers:** semantic landmarks (`nav`/`main`/`aside`), proper headings hierarchy, ARIA roles on tabs/menus/dialogs/trees/comboboxes, `aria-live` for upload progress, async results, and toasts; status chips expose accessible names ("Status: Accepted").
- **Forms:** programmatic label association, inline error text tied via `aria-describedby`, required-field indication beyond color.
- **Motion:** respect `prefers-reduced-motion`; no essential information conveyed only by animation.
- **Targets & zoom:** ≥ 44px touch targets on mobile; layout reflows to 400% zoom without horizontal scroll.
- **Data viz:** charts include text/table alternatives and accessible labels; KPI deltas have textual equivalents.
- **Documents:** preview viewer exposes text layer / accessible name; downloads available as fallback.

---

## 16. Component Inventory (Build Contract)

Engineering builds against these. Naming is canonical; components live under `src/components/<group>/`.

### 16.1 Shell & Navigation
| Component | Responsibility |
|---|---|
| `AppShell` | Internal layout: top bar + sidebar + page slot |
| `PortalShell` | External seller layout (branded, no sidebar) |
| `TopBar` | Logo, transaction switcher, search, bells, avatar menu |
| `SideNav` / `NavItem` | Role-filtered main nav, collapsible rail |
| `TransactionSwitcher` | Combobox scoping app to one deal / portfolio |
| `CommandPalette` | ⌘K quick-jump & quick-actions |
| `PageHeader` | Breadcrumb, title, context, single primary action |
| `Breadcrumbs` | Hierarchical path |

### 16.2 Primitives
| Component | Responsibility |
|---|---|
| `Button` (primary/secondary/ghost/danger) | Actions; one primary per surface |
| `StatusChip` | All status vocabularies, variant-driven |
| `Badge` | Counts, flags (overdue, human-review-required) |
| `RiskBadge` | Severity badge (Critical→Low) |
| `Avatar` / `AvatarStack` | People, assignees, attendee groups |
| `Tooltip`, `Popover`, `Menu`, `Modal`, `Drawer`, `ConfirmDialog` | Overlays; ConfirmDialog supports required rationale |
| `Tabs` | Transaction Detail + settings tabs |
| `Toast` / `Toaster` | Success/error feedback, audit links |
| `Skeleton`, `EmptyState`, `ErrorState` | The three async states |

### 16.3 Data Display
| Component | Responsibility |
|---|---|
| `DataTable` | Sortable/filterable/paginated base table + bulk select |
| `TransactionTable` | Portfolio/list rows |
| `DocumentTable` | Data-room doc rows |
| `DiligenceTable` | Diligence items |
| `RiskTable` | Risk register |
| `SyncEventTable` | SharePoint sync events |
| `CompletionBar` (single/segmented/stacked) | Progress visualization |
| `KpiCard` (compact/full) | Metric cards |
| `ConfidenceMeter` | AI confidence % (color-banded) |
| `StageFunnel` / `StageChip` | Pipeline + deal stage |
| `Sparkline` / `MiniChart` | Trends in KPI cards |
| `ProgressRing` | Seller portal overall progress |

### 16.4 Feature Components
| Component | Responsibility |
|---|---|
| `FolderTree` | A–H category tree, counts, grants-aware |
| `DocumentPreview` | In-browser doc viewer + citation deep-link |
| `VersionHistory` | Per-doc versions, restore/compare |
| `ClassificationPanel` | AI category + confidence + confirm/correct |
| `ReviewActionBar` | Set review status, flag human-review |
| `Dropzone` / `DropzoneOverlay` / `UploadQueue` | Drag-and-drop + resumable upload |
| `DiligenceItemDrawer` | Full item detail/edit |
| `FilterBar` / `FilterChip` / `SavedViews` | URL-synced filtering |
| `KpiDashboardGrid` | Grouped KPI sections |
| `AiExecutiveSummary` / `RedFlagList` / `MissingItemsCallout` | AI Summary blocks |
| `ChatThread` / `MessageComposer` / `CitationPanel` | AI Assistant |
| `RiskSummaryBand` / `RiskDrawer` | Risk Log |
| `ActivityTimeline` / `ActivityRow` | Audit timeline |
| `NoteThread` / `NoteComposer` | Internal & seller-facing notes (segregated) |
| `SyncStatusBanner` / `RetryButton` | SharePoint sync |
| `ContactCard` / `AssignmentEditor` | Contacts & reviewer/category assignment |
| `MeetingCard` / `ScheduleMeetingButton` | Graph-backed meetings |
| `NotificationCenter` | In-app notifications |
| `AttentionList` | Dashboard "needs attention" rail |
| `CompletionByCategory` | 8-category progress block |

### 16.5 Seller Portal Components
| Component | Responsibility |
|---|---|
| `SellerHome` | Welcome + progress ring + counts |
| `SellerRequestList` / `SellerRequestCard` | Seller-facing diligence items (translated statuses) |
| `SellerUploadPanel` | Mobile-first upload for an item |
| `CredentialHandoffForm` | Secure Category-A credential submission (not file upload) |
| `SellerMessageThread` | Clarification thread with "M&A Team" |

### 16.6 Guards & Utilities
| Component/Util | Responsibility |
|---|---|
| `RoleGate` | Conditional render by role/grant (UX layer only) |
| `TransactionScope` | Provides current-deal context |
| `CategoryGrantGate` | Hides ungranted-category UI for reviewers |
| `cn()` (`clsx`) | Class composition |
| `useAuditedAction` | Wraps consequential actions → confirm + audit |

---

## 17. Open UX Questions / Phase-2 Candidates

1. **Dark theme** — tokens are ready; defer to Phase 2.
2. **Side-by-side document comparison** (e.g., lease v2 vs v3 diff) — desirable for legal review; Phase 2.
3. **Bulk seller-facing messaging** — beyond per-item clarifications.
4. **Configurable executive dashboard widgets** — drag-to-arrange KPI strip.
5. **Offline/poor-connectivity upload** in the seller portal (service-worker queue) for clinics with weak networks.

---

*End of Document 04 — Page-by-Page UI / UX Plan.*
