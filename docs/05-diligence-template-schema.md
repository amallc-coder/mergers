# 05 — Diligence Template Schema

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering, Product, M&A Operations, Compliance
**Status:** Implementation-grade specification
**Depends on:** `03-database-schema.md` (authoritative table/enum definitions), `02-roles-permissions-matrix.md`
**Last reviewed:** 2026-06-26

---

## 1. Purpose & Scope

This document defines the **diligence template model** — the reusable, admin-editable catalog of diligence requests — and the **instantiation contract** that turns a template into the concrete, per-transaction request items reviewers and sellers work against.

It serves three audiences at once:

1. **Engineering** — the precise shape of `diligence_templates → diligence_categories → diligence_template_items` and the rules for materializing them into `diligence_request_items`.
2. **M&A Operations / Admin** — what is in the canonical **AMA Healthcare Diligence List**, item by item, with the correct **Needed Timeline** for each.
3. **AI/Platform** — the per-category **AI extraction targets** that drive Azure Document Intelligence + OpenAI classification and field extraction.

The template layer is **deliberately separated from the request layer**. Templates are slow-moving, org-owned, versioned catalog data. Request items are fast-moving, deal-scoped, stateful workflow data. A change to the master list must **never** retroactively mutate diligence already in flight on a live deal. That invariant drives every design decision below.

### 1.1 Where this sits in the data model

```
diligence_templates (versioned bundle)
        │ 1..N
        ▼
diligence_template_items ──► diligence_categories (A–H lookup)
        │
        │  INSTANTIATION (snapshot copy at attach time)
        ▼
diligence_request_items (per-transaction, stateful)
```

The template tree is the **mold**; request items are the **castings**. Once cast, a request item is an independent object — it remembers which template item it came from (`template_item_id`) for lineage and analytics, but it does not live-bind to it.

---

## 2. Data Model

The canonical column-level definitions live in `03-database-schema.md §5`. This section is the **behavioral and structural specification** layered on top: what each entity means, the constraints that matter, and how the three tiers relate. SQL types referenced here (`needed_timeline`, `app_role`, `internal_review_status`, `diligence_status`) are defined in `03-database-schema.md §2`.

### 2.1 Entity overview

| Entity | Grain | Mutability | Scope | Role |
|--------|-------|-----------|-------|------|
| `diligence_categories` | One row per category A–H | Admin-editable (rename/reorder), code-stable | Global | Top-level grouping + sensitivity/timeline/reviewer defaults |
| `diligence_templates` | One row per (name, version) bundle | Append-version (immutable once published) | Global | A named, versioned catalog snapshot (e.g. "Standard Primary Care v3") |
| `diligence_template_items` | One row per catalog request | Editable only on **draft** templates | Global | The canonical request definition (the "mold") |
| `diligence_request_items` | One row per request on one transaction | Stateful workflow object | Per-transaction | The live, assignable, statused work item (the "casting") |

### 2.2 `diligence_categories` (the A–H spine)

A small lookup table (not an enum) so Admin can rename, reorder, and tune defaults without a deploy, while the **`code` (`A`…`H`) stays stable** as the join/seed key.

Key fields and their semantics:

| Field | Semantics |
|-------|-----------|
| `code` | Stable identifier `A`–`H`. Never reused, never renumbered. The seed contract below keys on this. |
| `name` | Display label, admin-editable. |
| `is_sensitive` | `true` only for **A — Logins/Passwords**. Forces the secure credential path (no plaintext, vault-backed) on every descendant item. |
| `default_timeline` | Category-level default `needed_timeline`. **A defaults to `post_signing`**; the rest default `pre_signing` but are overridden per item per the spec tables in §3. |
| `required_reviewer_role` | The specialist who owns the category by default (e.g. `B/C → finance_reviewer`, `D → operations_reviewer` or a credentialing-designated reviewer, `F → hr_reviewer`, `H → legal_reviewer`, `G → operations_reviewer`). Cascades to `default_reviewer_role` on items unless overridden. |

> **Sensitivity is inherited, not declared per-item.** Any item whose category is `is_sensitive` is treated as a credential item end-to-end. Category A items additionally set `is_credential_item = true` on instantiation, routing them through the secure credential workflow described in §4.

### 2.3 `diligence_templates` (versioned bundles)

A template is a **named, versioned bundle** of template items. Versioning is the mechanism that lets the org evolve the master list without disturbing in-flight deals.

- **Identity:** `UNIQUE(name, version)`. "Standard Primary Care" v1, v2, v3 are three rows.
- **`practice_type`** is a targeting hint (`primary_care`, `specialty`, `rhc`, `physician_group`, `multi_location_outpatient`) used to surface the right default template when a coordinator opens a new transaction.
- **`is_active`** gates whether a version may be *newly attached*. Deactivating v2 when v3 ships stops new deals from picking v2; deals already on v2 are unaffected (they hold snapshots, not links — see §5).
- **Lifecycle:** `draft → published → active → retired`. Template items are editable only while the template is `draft`. Publishing freezes the item set; further changes require a **new version** (see §6).

### 2.4 `diligence_template_items` (the catalog)

The canonical request definitions. Each row is one diligence request as the org wants it phrased, categorized, timed, and routed *before* it is attached to any deal.

Behavioral notes on the columns:

| Column | Behavior |
|--------|----------|
| `category_id` | Pins the item to A–H. Drives sensitivity inheritance and reviewer defaults. |
| `item_name` | The seller- and reviewer-visible request title (matches the §3 tables verbatim). |
| `description` | Optional guidance rendered to the seller in the portal (what "good" looks like, acceptable formats). |
| `default_timeline` | `pre_signing` or `post_signing` — set **per the §3 spec tables**, which override the category default. |
| `is_required` | `true` for standard list items; `false` reserved for optional/conditional add-ons. |
| `default_reviewer_role` | Internal routing default; falls back to the category's `required_reviewer_role`. |
| `sort_order` | Stable ordering within a category (matches the `#` column in §3). |
| `ai_hint` | A short prompt fragment fed to the classifier/extractor to bias matching and extraction toward this item's expected document shape and target fields. |

### 2.5 `diligence_request_items` (the instantiated work item)

The workhorse, fully specified in `03-database-schema.md §5.4`. For this document the salient point is that it carries **a complete snapshot** of the template item's content (`item_name`, `category_id`, `needed_timeline`) plus all the **workflow state** the template never has: dual status (`request_status` / `review_status`), assignments (`assigned_contact_id`, `assigned_reviewer_id`), `due_date`, `upload_link_id`, split notes (`internal_notes` / `seller_notes`), AI denormalization (`latest_ai_classification_id`, `ai_confidence`, `requires_human_review`), and `is_credential_item`.

The `template_item_id` foreign key is **nullable** and exists purely for lineage and analytics (e.g. "acceptance rate of template item X across all deals"). Setting it null marks the item **ad hoc** — added by a coordinator on this deal only.

---

## 3. The Standard AMA Healthcare Diligence List

This is the canonical seed content for the **"AMA Standard — Full Healthcare Diligence List"** template (v1). Each category below maps to a `diligence_categories` row; each numbered item is one `diligence_template_items` row whose `sort_order` is its `#` and whose `default_timeline` is its **Needed Timeline**.

**Legend:** Needed Timeline ∈ { **Pre-Signing**, **Post-Signing** }, stored as `needed_timeline` ∈ {`pre_signing`, `post_signing`}.

### 3.A — Logins/Passwords

> **Security posture (applies to every item in Category A):** `is_sensitive = true` on the category; every instantiated item carries `is_credential_item = true`. These requests route through the **secure credential workflow** (§4): **no plaintext storage**, **vault-ready** envelope encryption, references held in Azure Key Vault, and visibility **restricted to Admin + explicitly approved transition users**. All Category A items default to **Post-Signing** and remain hidden from standard reviewers.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | EMR/EHR login | Post-Signing |
| 2 | Accounting software login | Post-Signing |
| 3 | Payroll and benefits login | Post-Signing |
| 4 | Website domain login | Post-Signing |
| 5 | Reporting tools login | Post-Signing |
| 6 | Bank account login 1 | Post-Signing |
| 7 | Bank account login 2 | Post-Signing |
| 8 | Bank account login 3 | Post-Signing |
| 9 | Bank account login 4 | Post-Signing |
| 10 | Billing platform login | Post-Signing |
| 11 | Purchasing software login | Post-Signing |

**AI extraction targets (Category A):** none by document parsing. Credentials are **never** sent to OCR/LLM pipelines. The only structured capture is **secure-field metadata** entered through the credential form: `system_name`, `login_url`, `username` (encrypted), `secret_ref` (Key Vault pointer), `mfa_method`, `account_owner`, `last_rotated_at`. Classification/extraction models are **explicitly disabled** for `is_credential_item` rows.

### 3.B — Finance/Accounting

**AI extraction targets (Category B):** statement period / fiscal year; entity & unit/location identifiers; revenue, COGS, operating expense, EBITDA and net income lines (consolidated and unit-level); balance-sheet totals (assets, liabilities, equity); tax-year and filing entity from returns; bank/account identifiers and statement period; AP aging buckets (0–30/31–60/61–90/90+) and vendor totals; GL account codes and period balances; debt instrument terms (principal, rate, maturity, lender); lease terms (lessor, monthly rent, term, expiry, location).

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | Consolidated trailing-12-month (T12) P&L | Pre-Signing |
| 2 | Consolidated monthly P&L (2024–2025) | Pre-Signing |
| 3 | Unit-level T12 P&L | Pre-Signing |
| 4 | Unit-level 2024–2025 P&L | Pre-Signing |
| 5 | Balance sheets | Pre-Signing |
| 6 | Unit-level balance sheets (CY / 2024 / 2025) | Pre-Signing |
| 7 | Tax returns (2–3 years) | Pre-Signing |
| 8 | Bank statements (18–36 months) | Post-Signing |
| 9 | Full accounting platform access | Post-Signing |
| 10 | General ledger (GL) detail | Pre-Signing |
| 11 | AP aging | Pre-Signing |
| 12 | Debt schedule | Pre-Signing |
| 13 | Loan agreements | Pre-Signing |
| 14 | Lease agreements | Pre-Signing |
| 15 | Bank account list | Post-Signing |
| 16 | Credit card list | Post-Signing |
| 17 | CPA contact | Post-Signing |
| 18 | Payroll / additional financial tool access | Post-Signing |
| 19 | Budgets per location | Post-Signing |

### 3.C — Revenue Cycle/Billing

**AI extraction targets (Category C):** payer names and AR balances by payer; AR aging by DOS bucket (0–30/31–60/61–90/90–120/120+); denial counts, denial reason/CARC codes and dollars; fee-schedule CPT → allowed-amount rows per payor; monthly collections totals; monthly charges / payments / adjustments; clearinghouse and billing-platform identifiers; EOB/EFT remittance fields; claim-level extracts (DOS, CPT, ICD-10, modifiers, billed, allowed, paid); payor-mix percentages; monthly and annual visit/encounter counts; ancillary service volumes; total active patient count.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | AR aging by payer | Pre-Signing |
| 2 | AR aging by DOS (date-of-service) bucket | Pre-Signing |
| 3 | Denial reports | Pre-Signing |
| 4 | Top denial categories | Pre-Signing |
| 5 | Fee schedules — major payors | Pre-Signing |
| 6 | Collections by month (24 months) | Pre-Signing |
| 7 | Charges / payments / adjustments by month | Pre-Signing |
| 8 | Clearinghouse access | Post-Signing |
| 9 | Billing platform access | Post-Signing |
| 10 | EOB/EFT workflow | Post-Signing |
| 11 | Historical claims extracts | Pre-Signing |
| 12 | ICD / CPT data | Pre-Signing |
| 13 | Payor mix reporting | Pre-Signing |
| 14 | Total visits by month (24 months) | Pre-Signing |
| 15 | Total individual visits / year (last 3 years) | Pre-Signing |
| 16 | Ancillary volumes by month (24 months) | Pre-Signing |
| 17 | Total patients in EMR | Pre-Signing |

### 3.D — Providers/Credentialing

> All Category D items default to **Post-Signing**. Several contain PII/PHI (driver's license, references) and are routed to the credentialing-designated reviewer with elevated handling.

**AI extraction targets (Category D):** provider full name; individual NPI and group/facility NPI; CAQH ID; PECOS enrollment status; board certification (specialty, board, expiry); CV work-history and education spans; state license numbers, states and expiries; DEA/CDS numbers and expiries; malpractice carrier, policy number, limits, effective/expiry dates; ACLS/BLS/PALS certification dates; supervising/collaborating physician names and agreement effective dates; PHO affiliation names; facility ↔ group NPI linkage.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | Provider roster | Post-Signing |
| 2 | NPI | Post-Signing |
| 3 | CAQH access | Post-Signing |
| 4 | PECOS access | Post-Signing |
| 5 | Board certifications | Post-Signing |
| 6 | CV / resume | Post-Signing |
| 7 | Licenses | Post-Signing |
| 8 | DEA / CDS | Post-Signing |
| 9 | Malpractice insurance | Post-Signing |
| 10 | Driver's license | Post-Signing |
| 11 | Supervising / collaborating agreements | Post-Signing |
| 12 | References | Post-Signing |
| 13 | ACLS / BLS / PALS | Post-Signing |
| 14 | PHO affiliations | Post-Signing |
| 15 | Group NPI & facility linkage | Post-Signing |

### 3.E — Operations/Clinical

> All Category E items default to **Pre-Signing**.

**AI extraction targets (Category E):** patient demographic distributions (age, geography, payer); service-line names; workflow process steps; scheduling template slot definitions; provider-facing hours by day; weekly visit volume per provider; per-location process variations; inventory SKUs and on-hand counts; equipment make/model/serial; referral source ↔ volume pairs; ancillary utilization per provider/site; staffing FTE counts by role and location; monthly payroll totals by position.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | Patient demographics | Pre-Signing |
| 2 | Service line list | Pre-Signing |
| 3 | Operational workflow map | Pre-Signing |
| 4 | Scheduling templates | Pre-Signing |
| 5 | Provider-facing hours | Pre-Signing |
| 6 | Weekly visit volume by provider | Pre-Signing |
| 7 | Clinical process variation by location | Pre-Signing |
| 8 | Inventory list | Pre-Signing |
| 9 | Equipment list | Pre-Signing |
| 10 | Referral patterns | Pre-Signing |
| 11 | Ancillary utilization by provider / site | Pre-Signing |
| 12 | Staffing model by location | Pre-Signing |
| 13 | Payroll totals by month by position (3 months) | Pre-Signing |

### 3.F — HR/Payroll

> All Category F items default to **Pre-Signing**. Employee-level data is PII; route to `hr_reviewer` with restricted visibility.

**AI extraction targets (Category F):** employee names and IDs; full-time/part-time status; salaried vs. hourly classification; pay rates; PTO/vacation accrued balances; benefit plan names and coverage tiers; 401(k) plan terms, match formula and administrator name; benefit summary details; payroll calendar dates and frequency; payroll vendor name (or in-house flag); org-chart reporting relationships; key-role dependency designations.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | Employee roster | Pre-Signing |
| 2 | FT / PT status | Pre-Signing |
| 3 | Salary / hourly status | Pre-Signing |
| 4 | Rates of pay | Pre-Signing |
| 5 | PTO / vacation balances | Pre-Signing |
| 6 | Insurance details | Pre-Signing |
| 7 | 401(k) details & administrator | Pre-Signing |
| 8 | Benefit summaries | Pre-Signing |
| 9 | Payroll calendar | Pre-Signing |
| 10 | Payroll vendor / in-house | Pre-Signing |
| 11 | Org chart | Pre-Signing |
| 12 | Key role dependency list | Pre-Signing |

### 3.G — IT/EMR/Systems

> Mixed timeline per the spec — note the items below. System **access** items default Post-Signing; informational/inventory items vary as marked.

**AI extraction targets (Category G):** EMR product name and admin-access details; billing-software product name and admin access; reporting-tool identifiers; historical EMR / legacy claims data-source details; main phone/fax numbers; email account inventory; domain registrar and renewal dates; ISP name; telephone provider name; IT contact names and phone/email; desktop/laptop asset inventory (make/model/serial/assignee); employee count per site; planned go-live date assumptions; file-sharing/collaboration platform identifiers.

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | EMR name & admin access | Post-Signing |
| 2 | Billing software name & admin access | Post-Signing |
| 3 | Reporting tool access | Pre-Signing |
| 4 | Historical EMR / old claims data access | Post-Signing |
| 5 | Main phone / fax | Post-Signing |
| 6 | Email account list | Post-Signing |
| 7 | Website / domain registrar | Post-Signing |
| 8 | ISP | Post-Signing |
| 9 | Telephone provider | Post-Signing |
| 10 | Current / previous IT contact | Post-Signing |
| 11 | Desktop / laptop inventory | Post-Signing |
| 12 | Employee count by site | Pre-Signing |
| 13 | Go-live date assumptions | Post-Signing |
| 14 | File-sharing / collaboration access | Post-Signing |

### 3.H — Legal/Contracts/Business

> All Category H items default to **Post-Signing**. Route to `legal_reviewer`. Several items (Availity & payer portal access, UHC admin info) overlap the Category A credential posture if they carry login secrets — those are split into a credential sub-request handled by §4.

**AI extraction targets (Category H):** Tax ID / EIN; W-9 legal name and TIN; IRS CP-575 / 147C confirmation details; bank-letter routing/account confirmation; group identifiers by location; billing identifiers by location; CLIA certificate number and expiry; insurance policy numbers, carriers, limits (GL/umbrella/property); licensure document numbers and expiries; compliance program document metadata; Medicare/Medicaid/commercial enrollment statuses and effective dates; Availity & payer-portal account identifiers; UHC administrative IDs; location names and full addresses; vendor names and contract terms (party, term, renewal, value).

| # | Item | Needed Timeline |
|---|------|-----------------|
| 1 | Tax ID | Post-Signing |
| 2 | W-9 | Post-Signing |
| 3 | IRS letter | Post-Signing |
| 4 | Bank letter | Post-Signing |
| 5 | Group info by location | Post-Signing |
| 6 | Billing info by location | Post-Signing |
| 7 | CLIA certificate | Post-Signing |
| 8 | GL / umbrella / property insurance | Post-Signing |
| 9 | Licensure docs | Post-Signing |
| 10 | Compliance docs | Post-Signing |
| 11 | Medicare / Medicaid / commercial enrollment status | Post-Signing |
| 12 | Availity & payer portal access | Post-Signing |
| 13 | UHC admin info | Post-Signing |
| 14 | List of locations / addresses | Post-Signing |
| 15 | Vendor list & contracts | Post-Signing |

### 3.1 Seed summary

| Category | Code | Items | Default sensitivity | Dominant timeline |
|----------|------|-------|---------------------|-------------------|
| Logins/Passwords | A | 11 | **Sensitive** (credential path) | Post-Signing (all) |
| Finance/Accounting | B | 19 | Standard | Mixed |
| Revenue Cycle/Billing | C | 17 | Standard | Mixed |
| Providers/Credentialing | D | 15 | PII/PHI | Post-Signing (all) |
| Operations/Clinical | E | 13 | Standard | Pre-Signing (all) |
| HR/Payroll | F | 12 | PII | Pre-Signing (all) |
| IT/EMR/Systems | G | 14 | Standard | Mixed |
| Legal/Contracts/Business | H | 15 | Standard | Post-Signing (all) |
| **Total** | | **116** | | |

---

## 4. Category A — Secure Credential Workflow

Category A is structurally a diligence category but operationally a **secrets-handling subsystem**. The template/instantiation machinery is identical; the storage and access path is not.

| Rule | Enforcement |
|------|-------------|
| **No plaintext, ever** | The `diligence_request_items` row stores **no** secret. The credential form writes ciphertext + a `secret_ref` pointer to **Azure Key Vault**; the DB holds only the reference and non-secret metadata. |
| **Vault-ready envelope encryption** | Username/secret captured client-side are envelope-encrypted; the DEK is wrapped by a KEK held in Key Vault. The DB never sees a reversible value. |
| **Restricted visibility** | Rows with `is_credential_item = true` are filtered out of standard reviewer RLS scopes. Visible only to **Admin** and **explicitly approved transition users** (membership recorded on the transaction, audited). |
| **Default Post-Signing** | Credentials are requested only after a deal is signed; the seed timeline is `post_signing` for all 11 items. |
| **No AI** | Classification/extraction pipelines are short-circuited for credential items (see §3.A). No credential bytes reach OCR/LLM services. |
| **Full audit** | Every read, reveal, rotation, and assignment is written to the append-only `permission_logs` / `audit_logs` (see `03-database-schema.md`). |

---

## 5. Instantiation: Template → Request Items

Attaching a template to a transaction **snapshots** its template items into `diligence_request_items`. Snapshot, not link — this is the core mechanic that protects in-flight deals from later catalog edits.

### 5.1 Algorithm

```text
instantiate(transaction_id, template_id, options):
  template ← load active template_id
  items    ← template_items WHERE template_id = template.id ORDER BY category, sort_order
  for each ti in items:
    if options.skip_categories contains ti.category.code: continue
    if options.only_required and not ti.is_required:     continue
    insert diligence_request_items:
      transaction_id          ← transaction_id
      template_item_id        ← ti.id                       -- lineage pointer (nullable)
      category_id             ← ti.category_id              -- snapshot
      item_name               ← ti.item_name                -- snapshot
      needed_timeline         ← ti.default_timeline         -- snapshot
      seller_notes            ← ti.description               -- snapshot (editable later)
      request_status          ← 'pending'
      review_status           ← NULL                         -- null until first upload
      assigned_reviewer_id    ← resolve(ti.default_reviewer_role OR category.required_reviewer_role)
      due_date                ← derive(needed_timeline, transaction milestones)  -- nullable
      is_credential_item      ← ti.category.is_sensitive
      requires_human_review   ← false
  record provenance: (transaction_id, template_id, template.version, instantiated_at, instantiated_by)
```

### 5.2 Snapshot vs. live-link — the contract

| Property | Behavior |
|----------|----------|
| **Content** (`item_name`, `category_id`, `needed_timeline`, guidance) | **Copied** at attach time. Editing the template item afterward does **not** change existing request items. |
| **Lineage** (`template_item_id`, template version) | **Retained** for analytics and "what changed in v4" diffs. |
| **Workflow state** | **Born on the request item.** Status, assignments, due dates, notes, uploads, AI verdicts exist only on the request side. |
| **Per-deal edits** | A coordinator may rename, retime, reassign, mark N/A, or delete a request item on one deal with zero effect on the template or other deals. |
| **Ad hoc items** | Inserted with `template_item_id = NULL`. First-class request items that simply have no catalog parent. |

### 5.3 Re-running / syncing a template onto an existing deal

Coordinators may **re-apply** a template (or a newer version) to a live transaction. The reconcile is **additive and non-destructive**:

- **Added** template items (present in new version, absent on deal by `template_item_id`) → inserted as new `pending` request items.
- **Removed** template items (on deal, dropped from new version) → **left untouched**; never auto-deleted. Surfaced as "no longer in template" for manual review.
- **Changed** template items (e.g. retimed) → **never overwrite** an existing request item; a diff is shown and the coordinator opts in per item. In-progress work (anything past `pending`) is protected from any automated mutation.

---

## 6. Template JSON Shape

The wire/seed representation of a template item, as consumed by the seeder and the Admin template editor API. Field names mirror `diligence_template_items` columns; `category_code` resolves to `category_id` at load time.

```jsonc
// A single template item (one row of the §3 tables)
{
  "id": "a3f1c9e2-1b44-4c77-9e2a-7d0b6f5e1234",   // uuid; omitted on create
  "template_id": "b21d77aa-9c0e-4f3b-8a11-0d2e4c6a9f00",
  "category_code": "B",                            // A–H; resolves to category_id
  "item_name": "Consolidated trailing-12-month (T12) P&L",
  "description": "Trailing 12 months, consolidated across all entities; Excel or PDF.",
  "default_timeline": "pre_signing",               // needed_timeline enum
  "is_required": true,
  "is_sensitive": false,                           // inherited from category; true ⇒ credential path
  "default_reviewer_role": "finance_reviewer",     // app_role; null ⇒ category default
  "sort_order": 1,                                 // matches the "#" column in §3
  "ai_hint": "income statement; extract revenue, COGS, opex, EBITDA, net income by period",
  "ai_extraction_targets": [                       // drives the extractor schema
    "statement_period",
    "revenue", "cogs", "operating_expense", "ebitda", "net_income"
  ]
}
```

```jsonc
// The enclosing template bundle
{
  "name": "AMA Standard — Full Healthcare Diligence List",
  "version": 1,
  "practice_type": "primary_care",
  "is_active": true,
  "status": "published",                           // draft | published | active | retired
  "items": [ /* diligence_template_items[] as above, grouped A→H */ ]
}
```

> **Note on `ai_extraction_targets`.** In the relational model these targets are stored as a `jsonb` array alongside `ai_hint` on the template item (or normalized into a child `template_item_extraction_targets` table when the org wants per-field validation rules). They define the field schema the Azure Document Intelligence + OpenAI extractor populates and against which `ai_confidence` and `requires_human_review` are computed.

---

## 7. Customization & Versioning

### 7.1 What Admin can customize

| Surface | Capability | Effect scope |
|---------|-----------|--------------|
| Categories | Rename, reorder, set default timeline / reviewer / sensitivity | Global, forward-looking |
| Templates | Create, clone, target a `practice_type`, activate/retire | Controls what is *attachable* |
| Template items (draft only) | Add/edit/remove items, set timeline, required flag, reviewer, AI hints/targets | Frozen on publish |
| Per-deal (Coordinator) | Add ad hoc items, edit/retime/reassign/delete request items, mark N/A | Single transaction only |

### 7.2 Versioning rules

1. **Published templates are immutable.** Once a template is `published`, its item set is frozen. Any change is made on a **clone** that increments `version` (`UNIQUE(name, version)`).
2. **Clone-to-edit.** "Edit standard list" clones the active version to a new `draft`, where items are mutable. Publishing the draft makes it the new active version and `is_active = false` on the prior version.
3. **In-flight deals are immune.** Because request items are snapshots (§5.2), publishing v4 has **zero** effect on deals already running v3. Their lineage still points at v3 items, and analytics can attribute outcomes to the exact version used.
4. **Opt-in propagation only.** Pushing v4 onto an existing deal is the explicit, per-item, additive reconcile in §5.3 — never an automatic overwrite.
5. **Provenance is recorded.** Each instantiation stores `(template_id, version, instantiated_at, instantiated_by)` so any deal's request set is traceable to an exact, immutable catalog snapshot — a defensible audit posture for regulated healthcare M&A.

### 7.3 Version lifecycle

```text
 draft ──publish──► published ──attach to deals──► active ──supersede──► retired
   ▲                                                                        │
   └──────────────────────── clone (new version) ◄─────────────────────────┘
```

---

## 8. Invariants (engineering checklist)

1. Category `code` (A–H) is immutable and the stable seed/join key.
2. Request items hold **snapshots**; editing a template never mutates live deals.
3. `template_item_id` is nullable (ad hoc) and used only for lineage/analytics — never for live re-binding.
4. `needed_timeline` per item follows the §3 tables exactly; category default applies only where unspecified.
5. Category A: `is_sensitive` ⇒ `is_credential_item` ⇒ vault-backed, no plaintext, no AI, Admin/approved-transition-user visibility only.
6. Published templates are immutable; all change is clone-and-version.
7. Propagation onto live deals is additive, non-destructive, and opt-in per item.
8. Every instantiation records template version provenance for audit.
