# 09 — KPI Extraction Logic

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering, Data/Platform, Finance Reviewers, Operations Reviewers, AI/ML
**Status:** Implementation-grade specification
**Depends on:** `03-database-schema.md` (`ai_extracted_metrics`, `human_reviewed_metrics`, `kpi_snapshots`), `05-diligence-template-schema.md` (per-category AI extraction targets), `06-sharepoint-integration-plan.md` (document byte source)
**Last reviewed:** 2026-06-26

---

## 1. Purpose & Scope

This document is the authoritative specification for **how every KPI is produced** — from a raw uploaded document in SharePoint to a trusted number on the diligence dashboard and in the valuation model. It defines, **per diligence category**, every KPI we extract, and for each one:

- the **source document(s)** that supply it;
- the **extraction method** — *direct read* (a value lifted verbatim from a document field/cell) vs. *derived formula* (computed from other KPIs);
- the **explicit formula** where derived;
- the **unit**, **period**, and **period normalization** rules;
- the **validation rules** that gate it;
- and the **confidence handling** — when a value auto-promotes, when it forces human review, and how missing inputs are surfaced.

It is the contract between three layers that must never blur:

1. **Extraction** (Azure Document Intelligence + Azure/OpenAI) writes raw, provenance-stamped values into `ai_extracted_metrics`. It never writes a KPI directly to a dashboard.
2. **Review/Promotion** — a Finance or Operations Reviewer accepts, edits, or overrides an extracted value, creating an authoritative row in `human_reviewed_metrics`.
3. **Roll-up** — a server-side KPI job reads `human_reviewed_metrics` (preferring human-reviewed; falling back to high-confidence AI only where policy permits) and materializes period-normalized KPIs into `kpi_snapshots`.

> **The separation rule (restated, because it governs everything here).** Dashboards, valuation, and exports read `human_reviewed_metrics`. `ai_extracted_metrics` is a *suggestion surface*. A derived KPI is only as trusted as its **least-trusted input**. We never silently average AI output into a board-facing number.

### 1.1 What this document is *not*

It does not define prompt templates or the Document Intelligence model layouts (those live in the extraction service repo, fingerprinted by `prompt_fingerprint` / `model_name`). It defines the **canonical metric keys**, the **math**, and the **rules** — the stable contract those prompts must satisfy.

---

## 2. Canonical Metric Model

### 2.1 The metric key namespace

Every extractable or derived value has a stable, machine-readable `metric_key`. Keys are lowercase `snake_case`, namespaced by category letter, and **period-agnostic** (the period lives in `period_start`/`period_end`, never in the key).

```
<category>.<subject>[.<qualifier>]
```

| Segment | Rule | Examples |
|---------|------|----------|
| `category` | `finance`, `rcm`, `provider`, `ops`, `hr`, `it`, `legal` | `finance.ebitda` |
| `subject` | the metric noun | `finance.net_revenue` |
| `qualifier` | optional dimension member (payer, location, provider, bucket) | `rcm.ar.payer.medicare`, `finance.revenue.location.northgate` |

Dimensioned KPIs (by payer, by location, by provider, by DOS bucket, by CPT) are stored as **one row per member** with the member encoded in the qualifier **and** mirrored into `ai_extracted_metrics.source_locator` / a `dimension` field in the `metrics` jsonb for query convenience. This keeps `human_reviewed_metrics` flat and its `UNIQUE(transaction_id, metric_key, period_start, period_end)` constraint intact.

### 2.2 Metric kind (extraction method)

Every metric in the catalogs below is tagged with one of:

| Kind | Meaning | Storage |
|------|---------|---------|
| **DIRECT** | Read verbatim from a document field/cell/line item. | Written by the extractor to `ai_extracted_metrics` with `source_locator` (page/bbox/cell citation). |
| **DERIVED** | Computed by formula from other metric keys. | Computed by the KPI job *after* its inputs exist in `human_reviewed_metrics`. Never extracted directly. |
| **DERIVED-PREFERRED** | Derived by formula, **but** if the source document states the figure directly (e.g., a P&L that prints "EBITDA"), the DIRECT read is captured too and reconciled (§7.4). | Both an extracted DIRECT candidate and a computed DERIVED candidate may exist; reconciliation picks/flags. |
| **DIMENSIONAL** | DIRECT or DERIVED, but produced once per dimension member (per payer/location/provider/bucket/CPT). | One row per member. |

### 2.3 Units, periods, signs

| Aspect | Rule |
|--------|------|
| **Unit** | One of `usd`, `pct` (stored as a fraction 0–1, *not* 0–100), `count`, `fte`, `days`, `ratio`, `date`, `bool`, `text`. The unit is part of the metric's catalog definition and is validated on write. |
| **Currency** | `numeric(20,4)` for extraction precision; rounded to `numeric(18,2)` for display. Never `float`. |
| **Percent** | Stored as fraction. `payroll_pct_of_revenue = 0.32` means 32%. The UI multiplies by 100. This avoids the "is 32 already a percent?" ambiguity. |
| **Sign** | Expenses are stored as **positive** magnitudes (`finance.payroll_expense = 1_250_000`), not negatives, unless the metric is explicitly a net of inflows/outflows (`finance.net_income` may be negative). Add-backs are positive amounts that *increase* adjusted EBITDA. |
| **Period** | Closed interval `[period_start, period_end]`. A fiscal-year value uses the FY bounds; a monthly value uses month bounds; a trailing-twelve value (T12/TTM) uses the 12-month window ending at the latest closed month. Point-in-time balances (AR, AP, headcount) set `period_start = period_end = as_of_date`. |

### 2.4 Period normalization

Documents arrive in inconsistent period conventions (calendar year, fiscal year, partial-year stubs, rolling 12). The KPI job normalizes to three canonical shapes before roll-up:

| Canonical period | Definition | `period_type` tag |
|------------------|------------|-------------------|
| **FY** | The seller's fiscal year as declared on `transactions.fiscal_year_end_month` (defaults to December). FY2024 = the 12 months ending on that fiscal month-end in 2024. | `fy` |
| **Monthly** | A single calendar month, `[first, last]` of the month. | `month` |
| **T12 / TTM** | Trailing twelve months ending at `latest_closed_month`. Recomputed whenever a newer month closes. | `t12` |
| **As-of** | Point-in-time balance. `period_start = period_end`. | `as_of` |
| **Stub** | Partial-year actuals (e.g., Jan–May). Retained but **flagged** `is_partial = true`; never annualized silently — annualization is an explicit, attributed reviewer action (§7.5). | `stub` |

> **Annualization is never automatic.** If a document gives 5 months of revenue, we do **not** multiply by 12/5 to fabricate an FY figure. We store the stub, surface it as incomplete (§8), and let a reviewer choose to annualize with a recorded method (`run_rate_x12`, `seasonalized`, `none`).

---

## 3. Extraction → Review → Roll-up Pipeline

```
SharePoint (bytes)                  Postgres (index + workflow)
      │
      ▼
 Azure Document Intelligence  ──►  layout/tables/key-value pairs (raw OCR JSON)
      │
      ▼
 Azure/OpenAI extractor       ──►  maps OCR → metric_key candidates
      │                              (schema driven by template ai_extraction_targets, §05)
      ▼
 ai_extracted_metrics  ────────────┐  provenance='ai_extracted', confidence, source_locator
      │                            │
      │  (auto-promote if policy)  │
      ▼                            ▼
 human_reviewed_metrics  ◄──── Reviewer accept / edit / override  (provenance='human_reviewed')
      │
      ▼
 KPI job: derive + period-normalize + validate
      │
      ▼
 kpi_snapshots (metrics jsonb)  ──►  Dashboard / Valuation / Export
```

**Stage gates:**

1. A DIRECT metric below its **promotion threshold** (§7.2) stays in `ai_extracted_metrics` only; it cannot feed a DERIVED KPI until promoted.
2. A DERIVED KPI is computed **only** when every required input exists in `human_reviewed_metrics` for the matching normalized period (or, under explicit "AI-trusted" policy, exists as AI metrics above the high-confidence bar with the snapshot tagged `provisional`).
3. Every `kpi_snapshots` row records `computed_by` (job id) and an `inputs_provenance` summary in `metrics` so any number is traceable to its sources.

---

## 4. Financial KPIs (Category B — Finance/Accounting)

**Primary source documents:** Income Statements / P&L (annual + monthly), Balance Sheets, General Ledger / Trial Balance, Tax Returns (1120/1120-S/1065), AR & AP aging reports, debt schedules, budgets, depreciation schedules, owner-compensation detail. **Extraction model:** Document Intelligence *prebuilt-layout* + custom financial-statement model → OpenAI line-item mapping.

### 4.1 Direct-read financial metrics

| `metric_key` | Kind | Unit | Period | Source doc | Extraction notes |
|--------------|------|------|--------|-----------|------------------|
| `finance.gross_revenue` | DIRECT | usd | fy, month | P&L (top line / "Total Revenue" or "Gross Charges" depending on basis) | Capture both gross charges and net revenue lines distinctly — do not conflate. |
| `finance.net_revenue` | DIRECT | usd | fy, month | P&L ("Net Patient Revenue" / "Net Revenue") | Net of contractual adjustments. This is the denominator for most margins. |
| `finance.net_income` | DIRECT | usd | fy, month | P&L bottom line | May be negative. |
| `finance.payroll_expense` | DIRECT | usd | fy, month | P&L (salaries+wages+payroll taxes+benefits) or payroll register | Sum the payroll cluster if itemized; capture components too (`finance.payroll_expense.wages`, `.taxes`, `.benefits`). |
| `finance.rent_expense` | DIRECT | usd | fy, month | P&L (rent/occupancy) | Tie to leases in Category H for validation. |
| `finance.supplies_expense` | DIRECT | usd | fy, month | P&L (medical + office supplies) | |
| `finance.opex_total` | DIRECT | usd | fy, month | P&L ("Total Operating Expenses") | Captured directly when stated; otherwise DERIVED (§4.2). |
| `finance.depreciation` | DIRECT | usd | fy | P&L / depreciation schedule | Required add-back input for EBITDA. |
| `finance.amortization` | DIRECT | usd | fy | P&L / schedule | EBITDA input. |
| `finance.interest_expense` | DIRECT | usd | fy | P&L / debt schedule | EBITDA input. |
| `finance.tax_expense` | DIRECT | usd | fy | P&L / tax return | EBITDA input. |
| `finance.cogs` | DIRECT | usd | fy, month | P&L | For practices that report COGS. |

### 4.2 Derived financial metrics (explicit formulas)

| `metric_key` | Kind | Unit | Formula | Validation |
|--------------|------|------|---------|-----------|
| `finance.opex_total` | DERIVED-PREFERRED | usd | `Σ(operating expense line items)` when not stated | Derived total must match stated total within ±1% or flag reconciliation. |
| `finance.ebitda` | DERIVED-PREFERRED | usd | `EBITDA = net_income + interest_expense + tax_expense + depreciation + amortization` | All four add-backs must be present (or explicitly 0) or EBITDA is marked **incomplete**, not zero. |
| `finance.ebitda_margin` | DERIVED | pct | `EBITDA / net_revenue` | `net_revenue > 0`; result clamped to plausible `[-1, 1]` band, else flag. |
| `finance.adjusted_ebitda` | DERIVED | usd | `adjusted_ebitda = ebitda + Σ(add_backs)` | Each add-back is its own attributed line (§4.4); sum is auditable. |
| `finance.adjusted_ebitda_margin` | DERIVED | pct | `adjusted_ebitda / net_revenue` | Same band/denominator rules as EBITDA margin. |
| `finance.payroll_pct_of_revenue` | DERIVED | pct | `payroll_expense / net_revenue` | `net_revenue > 0`. Typical healthcare band 0.25–0.60; outside ⇒ soft flag. |
| `finance.rent_pct_of_revenue` | DERIVED | pct | `rent_expense / net_revenue` | `net_revenue > 0`. |
| `finance.opex_pct_of_revenue` | DERIVED | pct | `opex_total / net_revenue` | `net_revenue > 0`. |
| `finance.t12_revenue` | DERIVED | usd | `Σ(net_revenue[month] for trailing 12 closed months)` | All 12 months present, else flag `missing_months: [...]`. |
| `finance.revenue_yoy_growth` | DERIVED | pct | `(net_revenue[FY_n] − net_revenue[FY_n−1]) / net_revenue[FY_n−1]` | Both FYs present; prior-year `> 0`. |
| `finance.revenue_monthly_trend` | DERIVED (series) | usd | ordered series of `net_revenue[month]` over available window | Stored as a series object in `metrics` jsonb; gaps flagged. |
| `finance.unit_revenue.<location>` | DIMENSIONAL DIRECT | usd | per-location net revenue (read from location P&L) | Σ(locations) reconciles to consolidated `net_revenue` ±2%. |
| `finance.revenue.location.<loc>` | DIMENSIONAL DIRECT | usd | location-level revenue | See reconciliation above. |
| `finance.revenue.provider.<npi>` | DIMENSIONAL DIRECT | usd | provider-level revenue (from production report) | Σ(providers) reconciles to `gross_revenue` band; allocate unassigned to `provider.unattributed`. |
| `finance.budget.location.<loc>` | DIMENSIONAL DIRECT | usd | budgeted revenue/expense per location | From budget workbook; tagged `is_budget=true` to never mix with actuals. |
| `finance.budget_variance.<loc>` | DERIVED | pct | `(actual − budget) / budget` | `budget ≠ 0`. |

### 4.3 Balance-sheet & obligation metrics (point-in-time)

| `metric_key` | Kind | Unit | Period | Source | Notes |
|--------------|------|------|--------|--------|-------|
| `finance.debt_total` | DIRECT | usd | as_of | Balance sheet / debt schedule | Sum of notes payable, LOC, term loans, capital leases. |
| `finance.debt.<instrument>` | DIMENSIONAL DIRECT | usd | as_of | Debt schedule | Per instrument: balance, rate, maturity, monthly payment. |
| `finance.ap_total` | DIRECT | usd | as_of | AP aging | Total accounts payable. |
| `finance.ap_aging.<bucket>` | DIMENSIONAL DIRECT | usd | as_of | AP aging report | Buckets: `current`, `1_30`, `31_60`, `61_90`, `over_90`. Σ buckets = `ap_total` ±0.5%. |
| `finance.ar_total` | DIRECT | usd | as_of | AR aging (finance view) | Cross-validated against RCM `rcm.ar_total` (§5). |
| `finance.ar_aging.<bucket>` | DIMENSIONAL DIRECT | usd | as_of | AR aging | Same bucket set; Σ = `ar_total`. |

> **AR appears in two categories deliberately.** `finance.ar_total` (from the GL/finance AR aging) and `rcm.ar_total` (from the billing system) are extracted **independently** and **reconciled** (§5.4). A material gap between them is itself a risk flag (revenue recognition / write-off policy mismatch).

### 4.4 Add-backs (normalization adjustments to EBITDA)

Add-backs are the most scrutinized, most manipulable numbers in a healthcare deal. They are **never** auto-extracted into adjusted EBITDA. Each is a discrete, attributed line:

| `metric_key` | Unit | Typical source | Rule |
|--------------|------|----------------|------|
| `finance.addback.owner_compensation` | usd | Owner comp detail, W-2/K-1 | Excess owner comp above market replacement salary. |
| `finance.addback.owner_perks` | usd | GL detail (auto, travel, meals) | Personal/discretionary expenses run through the business. |
| `finance.addback.non_recurring` | usd | GL / management rep | One-time legal, COVID relief, startup costs. |
| `finance.addback.related_party_rent` | usd | Lease vs. market study | Above/below-market rent to related landlord. |
| `finance.addback.<custom>` | usd | Reviewer-entered | Free-form, requires `justification` text + supporting `document_version_id`. |

**Add-back handling:**
- Each add-back row carries `confidence` (if AI-suggested) and **mandatory `justification`** + source citation when promoted.
- `adjusted_ebitda = ebitda + Σ(addback.*)` is recomputed whenever any add-back changes; the snapshot stores the full add-back ledger in `metrics.addbacks[]` for the quality-of-earnings trail.
- An AI-suggested add-back is **always** `requires_human_review = true` regardless of confidence — these directly inflate valuation.

---

## 5. Revenue Cycle / Billing KPIs (Category C)

**Primary source documents:** AR aging by payer (billing system), charges/payments/adjustments reports (monthly), denial/remittance (ERA/835) reports, fee schedules, payer mix reports, CPT/ICD frequency reports, visit/encounter volume reports, patient counts. **Extraction model:** Document Intelligence table model → mapping to the RCM schema; large CSV/XLSX extracts parsed directly (no OCR) when machine-readable.

### 5.1 AR metrics

| `metric_key` | Kind | Unit | Period | Source | Notes |
|--------------|------|------|--------|--------|-------|
| `rcm.ar_total` | DIRECT | usd | as_of | AR aging (billing) | Total outstanding AR. |
| `rcm.ar.payer.<payer>` | DIMENSIONAL DIRECT | usd | as_of | AR by payer | Members: `medicare`, `medicaid`, `commercial`, `self_pay`, `other`, plus named plans. Σ = `ar_total`. |
| `rcm.ar.dos_bucket.<bucket>` | DIMENSIONAL DIRECT | usd | as_of | AR by DOS aging | Buckets by date-of-service age: `0_30`, `31_60`, `61_90`, `91_120`, `over_120`. Σ = `ar_total`. |
| `rcm.ar_over_90_pct` | DERIVED | pct | as_of | derived | `(ar.dos_bucket.91_120 + ar.dos_bucket.over_120) / ar_total`. Aging-quality KPI; band >0.25 ⇒ flag. |

### 5.2 Volume & money-flow metrics (monthly)

| `metric_key` | Kind | Unit | Period | Source | Notes |
|--------------|------|------|--------|--------|-------|
| `rcm.charges` | DIRECT | usd | month | Charges report | Gross charges billed. |
| `rcm.payments` | DIRECT | usd | month | Payments report | Cash collected (insurer + patient). |
| `rcm.adjustments_contractual` | DIRECT | usd | month | Adjustments report | Contractual write-downs. |
| `rcm.adjustments_other` | DIRECT | usd | month | Adjustments report | Bad debt, charity, admin write-offs (kept separate from contractual). |
| `rcm.visits` | DIRECT | count | month, fy | Encounter/visit report | Distinct billable encounters. |
| `rcm.patients` | DIRECT | count | fy, as_of | Patient panel report | Unique patients (active panel). |
| `rcm.charges.cpt.<cpt>` | DIMENSIONAL DIRECT | usd/count | fy | CPT frequency report | CPT mix: charges + count per CPT. Top-N retained, remainder rolled to `cpt.other`. |
| `rcm.dx.icd.<icd>` | DIMENSIONAL DIRECT | count | fy | ICD frequency report | ICD mix by count. Top-N + `icd.other`. |
| `rcm.payer_mix.<payer>` | DIMENSIONAL DERIVED | pct | fy | derived from charges or visits by payer | `charges.payer.<p> / Σ charges.payer.*`. State the basis (charge-based vs. visit-based) in `metrics`. |

### 5.3 Denial metrics

| `metric_key` | Kind | Unit | Period | Source | Notes |
|--------------|------|------|--------|--------|-------|
| `rcm.denials_count` | DIRECT | count | month | Denial/835 report | Number of denied claim lines. |
| `rcm.claims_submitted` | DIRECT | count | month | Submission report | Denominator for denial rate. |
| `rcm.denial_rate` | DERIVED | pct | month | derived | `denials_count / claims_submitted` (count basis) **or** `denied_amount / billed_amount` (dollar basis) — basis tagged. |
| `rcm.denial.category.<cat>` | DIMENSIONAL DIRECT | count/usd | fy | Denial reason report (CARC/RARC) | Top denial categories: `eligibility`, `auth`, `coding`, `timely_filing`, `medical_necessity`, `duplicate`, `other`. |

### 5.4 Derived RCM ratios (the headline billing KPIs)

| `metric_key` | Kind | Unit | Formula | Validation |
|--------------|------|------|---------|-----------|
| `rcm.days_in_ar` | DERIVED | days | `ar_total / avg_daily_charges`, where `avg_daily_charges = Σ charges[trailing 3 months] / days_in_those_months` | `avg_daily_charges > 0`. Healthcare band ~25–60 days; outside ⇒ flag. |
| `rcm.net_collection_ratio` | DERIVED | pct | `payments / (charges − adjustments_contractual)` | Denominator `> 0`; result band `[0.85, 1.02]` typical, `>1.0` indicates prior-period collections (note, don't reject). |
| `rcm.gross_collection_ratio` | DERIVED | pct | `payments / charges` | `charges > 0`; band varies widely by fee-schedule inflation. |
| `rcm.collection_rate` | DERIVED | pct | alias of net collection ratio unless a specific contract defines otherwise | Document which definition the deal uses. |
| `rcm.revenue_per_visit` | DERIVED | usd | `payments / visits` (or `net_revenue / visits`) | `visits > 0`; basis (payments vs. net revenue) tagged. |
| `rcm.revenue_per_patient` | DERIVED | usd | `payments / patients` (panel basis) | `patients > 0`. |
| `rcm.fee_schedule_available` | DIRECT | bool | presence of fee schedule document for each major payer | A coverage KPI: `true` only if a current fee schedule exists per top payer; partial ⇒ list missing. |
| `rcm.ar_reconciliation_gap` | DERIVED | pct | `abs(rcm.ar_total − finance.ar_total) / finance.ar_total` | Cross-category check; `> 0.05` raises a `risk_flags` row automatically. |

---

## 6. KPIs for Categories D, E, F, G, H

The financial and RCM categories are formula-heavy; the remaining categories are dominated by **coverage**, **currency/expiry**, and **count/distribution** KPIs. They follow the identical extraction → review → roll-up pipeline.

### 6.1 Provider / Credentialing KPIs (Category D)

**Sources:** provider roster, CVs, license/DEA/board-cert documents, CAQH profiles, payer enrollment grids, malpractice (COI), call schedules.

| `metric_key` | Kind | Unit | Formula / source | Validation & confidence |
|--------------|------|------|------------------|-------------------------|
| `provider.count_total` | DIRECT | count | Provider roster | Cross-check vs. distinct NPIs in production report. |
| `provider.fte_total` | DIRECT | fte | Roster (FTE column) | Σ provider FTE; partial-FTE allowed. |
| `provider.count.specialty.<spec>` | DIMENSIONAL DIRECT | count | Roster | Specialty mix. |
| `provider.license_expiry.<npi>` | DIRECT | date | License document | **Expiry < as_of + 90d ⇒ auto risk flag.** Date extraction always `requires_human_review` if confidence < 0.95 (credentialing is high-stakes). |
| `provider.dea_expiry.<npi>` | DIRECT | date | DEA cert | Same expiry-window flagging. |
| `provider.board_cert_status.<npi>` | DIRECT | text/bool | Board cert | `active`/`expired`/`not_certified`. |
| `provider.payer_enrollment_pct` | DERIVED | pct | `enrolled_provider_payer_pairs / (providers × active_payers)` | Enrollment coverage; gaps listed by (provider, payer). |
| `provider.malpractice_active_pct` | DERIVED | pct | `providers_with_current_COI / provider_count_total` | < 1.0 ⇒ flag the uninsured providers. |
| `provider.expiring_credentials_count` | DERIVED | count | count of credentials with `expiry < as_of + 90d` | Headline credentialing-risk number on the dashboard. |

### 6.2 Operations / Clinical KPIs (Category E)

**Sources:** location list, hours of operation, scheduling templates, staffing rosters, equipment lists, inventory, referral reports, patient demographics.

| `metric_key` | Kind | Unit | Formula / source | Validation |
|--------------|------|------|------------------|-----------|
| `ops.location_count` | DIRECT | count | Location list | Reconcile with revenue-by-location members. |
| `ops.visits_per_provider_per_day.<npi>` | DERIVED | count | `visits[provider, period] / clinical_days[provider, period]` | Productivity KPI; outliers flagged. |
| `ops.staffing_fte.role.<role>` | DIMENSIONAL DIRECT | fte | Staffing roster | By role (MA, front desk, RN, billing). |
| `ops.support_staff_per_provider` | DERIVED | ratio | `Σ non_provider_fte / provider_fte_total` | Staffing-leverage KPI. |
| `ops.payer_mix_demographic.<payer>` | DIMENSIONAL DIRECT | pct | Demographics report | Patient-population payer distribution (distinct from billing payer mix). |
| `ops.equipment_count` | DIRECT | count | Equipment list | With make/model/serial captured as text fields. |
| `ops.referral_volume.source.<src>` | DIMENSIONAL DIRECT | count | Referral report | Referral concentration; top source > 25% ⇒ concentration flag. |
| `ops.appointment_capacity_utilization` | DERIVED | pct | `booked_slots / available_slots` | From scheduling templates × actuals; `available_slots > 0`. |

### 6.3 HR / Payroll KPIs (Category F)

**Sources:** employee census, payroll register, benefits summaries, 401(k) docs, org chart, PTO balances.

| `metric_key` | Kind | Unit | Formula / source | Validation |
|--------------|------|------|------------------|-----------|
| `hr.headcount_total` | DIRECT | count | Employee census | Reconcile vs. payroll register names. |
| `hr.headcount.employment_type.<type>` | DIMENSIONAL DIRECT | count | Census | `ft`/`pt`/`prn`/`contract`. |
| `hr.avg_wage.role.<role>` | DERIVED | usd | `Σ wages[role] / headcount[role]` | Per-role average compensation. |
| `hr.pto_liability_total` | DERIVED | usd | `Σ(accrued_pto_hours × hourly_rate)` over all employees | Balance-sheet-affecting; reconciled to any GL accrual. |
| `hr.benefit_cost_total` | DIRECT | usd | Benefits summary / register | Employer-paid benefit cost. |
| `hr.benefit_load_pct` | DERIVED | pct | `(payroll_taxes + benefit_cost_total) / base_wages` | Burden rate; band 0.15–0.35 typical. |
| `hr.401k_match_rate` | DIRECT | pct | 401(k) plan doc | Match formula captured as text + parsed rate. |
| `hr.key_person_dependency_count` | DIRECT | count | Org chart / management flags | Key-role single points of failure ⇒ each a soft risk flag. |
| `hr.turnover_rate` | DERIVED | pct | `separations[period] / avg_headcount[period]` | If separation data supplied; else surfaced as missing. |

### 6.4 IT / EMR / Systems KPIs (Category G)

**Sources:** systems inventory, EMR/PM contracts, license counts, integration list, security policies, BAAs.

| `metric_key` | Kind | Unit | Formula / source | Validation |
|--------------|------|------|------------------|-----------|
| `it.systems_count` | DIRECT | count | Systems inventory | Core systems enumerated. |
| `it.emr_vendor` | DIRECT | text | EMR contract | Captured for integration/migration risk. |
| `it.license_count.<system>` | DIMENSIONAL DIRECT | count | License records | Per-system seat counts; reconcile vs. headcount. |
| `it.contract_expiry.<system>` | DIRECT | date | System contracts | Expiry-window flagging like credentials. |
| `it.annual_software_cost` | DERIVED | usd | `Σ system_annual_cost` | Ties to `finance` software opex. |
| `it.baa_coverage_pct` | DERIVED | pct | `vendors_with_signed_BAA / vendors_handling_PHI` | < 1.0 ⇒ HIPAA risk flag (compliance-critical). |
| `it.integration_count` | DIRECT | count | Integration list | Migration-complexity signal. |

### 6.5 Legal / Contracts / Business KPIs (Category H)

**Sources:** entity docs, payer contracts, vendor/lease agreements, litigation disclosures, licenses/permits, insurance policies.

| `metric_key` | Kind | Unit | Formula / source | Validation |
|--------------|------|------|------------------|-----------|
| `legal.payer_contract_count` | DIRECT | count | Payer contracts | Reconcile vs. payers appearing in RCM. |
| `legal.payer_contract_expiry.<payer>` | DIRECT | date | Contract | Expiring contracts flagged; missing contract for a top-revenue payer ⇒ flag. |
| `legal.lease_count` | DIRECT | count | Lease agreements | Reconcile vs. `ops.location_count`. |
| `legal.lease_annual_cost.<loc>` | DIMENSIONAL DIRECT | usd | Lease | Cross-check vs. `finance.rent_expense`. |
| `legal.change_of_control_clause_count` | DIRECT | count | Contract review | Contracts requiring consent on sale ⇒ each a transaction risk. |
| `legal.open_litigation_count` | DIRECT | count | Litigation disclosure | > 0 ⇒ risk flag with description. |
| `legal.insurance_coverage_summary` | DIRECT | text/usd | Policies | Coverage limits per policy type. |
| `legal.license_expiry.<license>` | DIRECT | date | Business licenses/permits | Expiry-window flagging. |
| `legal.contract_coverage_pct` | DERIVED | pct | `material_contracts_received / material_contracts_expected` | Coverage KPI driving completeness. |

> **Category A (Logins/Passwords) produces no KPIs.** Credential items are excluded from all extraction pipelines (`05 §3.A`). No credential bytes reach OCR/LLM services; therefore no metric keys, no confidence scores, no snapshots.

---

## 7. Confidence Handling, Promotion & Reconciliation

### 7.1 Where confidence comes from

Each DIRECT extraction carries a `confidence` (0–1) on `ai_extracted_metrics`, combining:

| Signal | Contribution |
|--------|--------------|
| Document Intelligence field/cell confidence | OCR-level certainty of the raw value. |
| LLM mapping confidence | Certainty that the raw value maps to *this* `metric_key`. |
| Structural validation | Does it satisfy unit/sign/range rules (§7.3)? A value that fails a hard rule is capped at low confidence. |
| Cross-source agreement | Multiple documents agreeing on the same figure raises confidence. |

A DERIVED KPI's confidence is `min(confidence of all inputs) × formula_penalty`, where `formula_penalty` (default 1.0) is reduced for formulas known to amplify error (e.g., ratios with small denominators).

### 7.2 Promotion thresholds & policy

| Confidence band | DIRECT metric behavior | DERIVED dependency behavior |
|-----------------|------------------------|-----------------------------|
| **≥ 0.92 (high)** | Eligible for **auto-promotion** to `human_reviewed_metrics` *only if* the category's `auto_promote` policy is on (default OFF for Finance valuation-driving keys, ON for low-stakes counts). Otherwise queued, pre-filled. | May feed a `provisional` snapshot (tagged, not board-final) under explicit AI-trusted policy. |
| **0.70–0.92 (medium)** | Stays in `ai_extracted_metrics`; surfaced to reviewer as a suggestion with citation. `requires_human_review = true`. | Cannot feed a final snapshot until inputs promoted. |
| **< 0.70 (low)** | Flagged; shown but visually marked low-trust; never auto-promoted. | Blocks the dependent KPI; KPI reported as `incomplete` with reason `low_confidence_input`. |
| **Always-review keys** | Any add-back, any expiry date, any valuation-driving margin: `requires_human_review = true` regardless of confidence. | — |

> **Default posture:** valuation-driving Finance keys (`net_revenue`, `ebitda`, `adjusted_ebitda`, all add-backs) **never auto-promote**, full stop. A human creates the `human_reviewed_metrics` row.

### 7.3 Validation rules (applied at extraction and at promotion)

| Rule type | Examples |
|-----------|----------|
| **Unit/sign** | Percent in `[−1, 1]` (after fraction normalization); expenses positive; counts non-negative integers; dates valid and ≤ today + reasonable horizon. |
| **Range / plausibility** | EBITDA margin `[−1, 1]`; net collection ratio `[0.5, 1.1]`; days in AR `[0, 365]`; payroll % `[0, 1]`. Out-of-band ⇒ soft flag (shown, not blocked). |
| **Sum reconciliation** | Σ(AR by payer) = AR total ±0.5%; Σ(AR by DOS bucket) = AR total; Σ(location revenue) ≈ consolidated ±2%; Σ(add-backs) traceable. |
| **Cross-document** | `finance.ar_total` vs `rcm.ar_total` (§5.4); `finance.rent_expense` vs Σ`legal.lease_annual_cost`; `it.license_count` vs `hr.headcount`. |
| **Temporal coherence** | Monthly net revenue sums to FY net revenue ±2%; T12 uses 12 distinct, contiguous closed months. |
| **Completeness** | Required inputs for each DERIVED KPI present for the matching period. |

A failed **hard** rule (unit/sign/sum) blocks promotion. A failed **soft** rule (plausibility band) surfaces a warning and forces `requires_human_review`.

### 7.4 DERIVED-PREFERRED reconciliation

For keys that can be both stated and computed (EBITDA, opex_total):

1. Compute the DERIVED value from inputs.
2. If a DIRECT value was also extracted from the document, compare.
3. **Match within tolerance (±1%)** ⇒ accept, confidence boosted, note `reconciled: true`.
4. **Mismatch** ⇒ both values retained, `requires_human_review = true`, a `risk_flags`/reconciliation note created showing both figures and their citations. The reviewer chooses the authoritative one.

### 7.5 Human-override & audit flow

Every promotion, edit, override, and annualization is an **attributed, audited** action.

```
AI suggests (ai_extracted_metrics)
        │  confidence, source_locator (page/bbox/cell)
        ▼
Reviewer opens the metric in the Finance/Ops review panel
        │
        ├─ ACCEPT  → human_reviewed_metrics row, provenance='human_reviewed',
        │            source_ai_metric_id set, value unchanged
        │
        ├─ EDIT    → human_reviewed_metrics row with a NEW value,
        │            old AI value retained on the ai_ row, delta logged
        │
        ├─ OVERRIDE→ human_reviewed_metrics row, source_ai_metric_id may be NULL
        │            (hand-entered), justification REQUIRED
        │
        └─ REJECT  → no human_reviewed_metrics row; ai_ metric marked rejected;
                     dependent KPI stays incomplete
        │
        ▼
audit_logs append: actor, action, metric_key, period, old→new value,
                   confidence, model fingerprint, source citation, timestamp
        │
        ▼
KPI job recomputes affected DERIVED keys + next kpi_snapshots row
```

**Audit guarantees (per `03 §`):**
- `human_reviewed_metrics.reviewed_by` is **NOT NULL** — there is always an accountable human.
- The `source_ai_metric_id` back-reference preserves the AI lineage even after override.
- Append-only `audit_logs` capture old→new for every value change; nothing is mutated in place without a trail.
- Re-running extraction (new doc version) creates **new** `ai_extracted_metrics` rows; it never overwrites a human-reviewed value. The reviewer is notified that a newer AI suggestion exists and may re-promote.

---

## 8. Missing-Metric Surfacing

Missing data is a first-class signal in diligence, not an empty cell. The KPI job computes a **coverage map** per transaction and writes it into `kpi_snapshots.metrics`.

| State | Definition | Surfaced as |
|-------|------------|-------------|
| **Present** | Authoritative value in `human_reviewed_metrics` for the period. | Value shown, provenance badge. |
| **AI-only** | Value exists in `ai_extracted_metrics` but not yet promoted. | "Needs review" badge, suggested value with confidence + citation. |
| **Incomplete (derived)** | DERIVED KPI missing one+ inputs. | KPI shown as `—` with `reason` and the list of missing input keys, each linkable to the diligence item that would supply it. |
| **Missing (no source)** | No document mapped to the source item; or item status `Pending`/`Denied`/`Not Applicable`. | Driven from `diligence_request_items`: a missing KPI links back to the open request item and its assigned seller contact and due date. |
| **Stub/partial** | Period present but partial (e.g., 5-month stub). | `is_partial` badge; excluded from FY roll-ups unless annualized (§2.4). |

The dashboard's **Data Completeness** panel renders this map: per category, `% of expected KPIs present`, the list of blocking missing inputs, and a one-click path to the underlying diligence request item. A missing valuation-critical KPI (net revenue, EBITDA, AR) escalates the category's deal-health bucket regardless of how many other items are complete.

---

## 9. `kpi_snapshots` Roll-up Model

### 9.1 When snapshots are written

| Trigger | Behavior |
|---------|----------|
| A `human_reviewed_metrics` row is created/edited | Affected DERIVED KPIs recomputed; a new snapshot row appended. |
| A new month closes | T12 and monthly-trend KPIs recomputed. |
| Nightly job | Full recompute for every active transaction + a portfolio row (`transaction_id IS NULL`). |
| Reviewer requests recompute | On-demand, attributed in `computed_by`. |

Snapshots are **append-only** — we never mutate a prior snapshot, so deal-health movement over time is queryable. The table's authoritative columns (`deal_health`, `items_total/received/accepted/overdue`, `pct_complete`, `avg_cycle_time_hours`, `open_risk_count`) come from the diligence workflow; the **extended KPI bag** lives in `metrics jsonb`, structured as below.

### 9.2 The `metrics` jsonb structure

```jsonc
{
  "schema_version": 3,
  "period_context": { "fy_latest": "FY2024", "t12_end": "2025-05-31",
                      "fiscal_year_end_month": 12 },
  "financial": { "net_revenue_fy2024": 8420000.00,
                 "ebitda_fy2024": 1610000.00,
                 "adjusted_ebitda_fy2024": 1985000.00,
                 "ebitda_margin_fy2024": 0.1912,
                 "t12_revenue": 8610000.00,
                 "revenue_yoy_growth": 0.058,
                 "payroll_pct_of_revenue": 0.317 },
  "rcm": { "ar_total": 1240000.00, "days_in_ar": 38.4,
           "net_collection_ratio": 0.962, "denial_rate": 0.071 },
  "coverage": { "finance": 0.92, "rcm": 0.88, "provider": 0.74,
                "missing_critical": ["finance.adjusted_ebitda_fy2023"] },
  "inputs_provenance": { "human_reviewed": 41, "ai_only": 7, "missing": 5 },
  "addbacks": [
    { "key": "finance.addback.owner_compensation", "value": 220000.00,
      "justification": "Owner comp $480k vs market $260k",
      "document_version_id": "…", "reviewed_by": "…" }
  ]
}
```

---

## 10. Canonical JSON Record Example

The end-to-end shape of a single KPI as it lives in the AI staging layer and after human promotion — the concrete instance the rest of the platform reads. This is the spec example for `net_collection_ratio` derived for FY2024.

```json
{
  "ai_extracted_metric": {
    "id": "8f3c1a2e-7b44-4d31-9a10-3e2f9c5b1d77",
    "transaction_id": "a1b2c3d4-0000-4444-8888-111122223333",
    "document_version_id": "d9e8f7a6-5b4c-4321-aaaa-bbbbccccdddd",
    "metric_key": "rcm.net_collection_ratio",
    "metric_label": "Net Collection Ratio (FY2024)",
    "value_numeric": 0.9620,
    "value_text": null,
    "unit": "pct",
    "period_start": "2024-01-01",
    "period_end": "2024-12-31",
    "period_type": "fy",
    "kind": "derived",
    "derived_from": ["rcm.payments", "rcm.charges", "rcm.adjustments_contractual"],
    "formula": "payments / (charges - adjustments_contractual)",
    "provenance": "ai_extracted",
    "confidence": 0.8740,
    "model_name": "gpt-4o-2024-11-20",
    "model_provider": "azure_openai",
    "prompt_fingerprint": "sha256:1c9d…",
    "source_locator": {
      "document": "2024_RCM_Summary.xlsx",
      "sheet": "Collections",
      "cells": { "payments": "C14", "charges": "C8", "contractual_adj": "C11" }
    },
    "validation": {
      "hard_rules_passed": true,
      "soft_flags": [],
      "band": [0.85, 1.02],
      "in_band": true
    },
    "requires_human_review": true,
    "human_reviewed_metric_id": null,
    "created_at": "2026-06-24T15:02:11Z"
  },

  "human_reviewed_metric": {
    "id": "11112222-3333-4444-5555-666677778888",
    "transaction_id": "a1b2c3d4-0000-4444-8888-111122223333",
    "metric_key": "rcm.net_collection_ratio",
    "value_numeric": 0.9620,
    "value_text": null,
    "unit": "pct",
    "period_start": "2024-01-01",
    "period_end": "2024-12-31",
    "provenance": "human_reviewed",
    "source_ai_metric_id": "8f3c1a2e-7b44-4d31-9a10-3e2f9c5b1d77",
    "review_action": "accept",
    "override_value": null,
    "justification": null,
    "reviewed_by": "5c5c5c5c-aaaa-bbbb-cccc-d1d1d1d1d1d1",
    "reviewed_at": "2026-06-25T18:41:09Z",
    "created_at": "2026-06-25T18:41:09Z",
    "updated_at": "2026-06-25T18:41:09Z"
  },

  "audit_log_entry": {
    "actor_id": "5c5c5c5c-aaaa-bbbb-cccc-d1d1d1d1d1d1",
    "action": "metric.promote.accept",
    "metric_key": "rcm.net_collection_ratio",
    "period": "FY2024",
    "old_value": null,
    "new_value": 0.9620,
    "ai_confidence": 0.8740,
    "model_name": "gpt-4o-2024-11-20",
    "source_ai_metric_id": "8f3c1a2e-7b44-4d31-9a10-3e2f9c5b1d77",
    "at": "2026-06-25T18:41:09Z"
  }
}
```

---

## 11. Implementation Checklist

| # | Requirement | Owner |
|---|-------------|-------|
| 1 | Seed the `metric_key` catalog (key, label, kind, unit, period_types, formula, inputs, validation band, always_review flag, source item link) as code-versioned reference data. | Platform |
| 2 | Extractor writes only to `ai_extracted_metrics` with `source_locator` + confidence; never to dashboards. | AI/ML |
| 3 | DERIVED keys computed in the KPI job from `human_reviewed_metrics` (or AI-trusted under explicit `provisional` policy). | Platform |
| 4 | Promotion endpoint enforces always-review keys, justification on override, and append-only `audit_logs`. | Backend |
| 5 | Reconciliation checks (AR cross-source, sum-to-total, monthly→FY) run on every roll-up and raise `risk_flags`. | Platform |
| 6 | Coverage map + missing-metric links rendered from `kpi_snapshots.metrics` + `diligence_request_items`. | Frontend |
| 7 | Valuation-driving Finance keys default `auto_promote = OFF`. | Config |
| 8 | Percent stored as fraction; currency `numeric`; no annualization without recorded method. | Schema/validation |

---

*End of document.*
