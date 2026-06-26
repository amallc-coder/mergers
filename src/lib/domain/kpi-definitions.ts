/**
 * The KPI catalog — every metric the platform extracts/derives, grouped by the
 * diligence category that feeds it. Drives the KPI dashboard and the
 * missing-metric surfacing. See /docs/09-kpi-extraction-logic.md for formulas.
 */

import type { CategoryKey } from "./types";

export type MetricUnit = "USD" | "percent" | "ratio" | "count" | "days" | "text" | "boolean";

export interface KpiDefinition {
  key: string;
  name: string;
  category: CategoryKey;
  unit: MetricUnit;
  /** Whether the value is derived from other metrics rather than read directly. */
  derived?: boolean;
  /** Plain-English derivation/formula for derived metrics. */
  formula?: string;
  /** Higher is better (true), lower is better (false), or neutral (undefined). */
  higherIsBetter?: boolean;
  group:
    | "Financial"
    | "Revenue Cycle"
    | "Provider"
    | "Operations"
    | "HR"
    | "IT"
    | "Legal";
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // ── Financial ──
  { key: "gross_revenue_fy", name: "Gross revenue (by year)", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true },
  { key: "net_revenue_fy", name: "Net revenue (by year)", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true },
  { key: "monthly_revenue_trend", name: "Monthly revenue trend", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "t12_revenue", name: "Consolidated T12 revenue", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true },
  { key: "unit_level_revenue", name: "Unit-level revenue", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "ebitda", name: "EBITDA", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true },
  { key: "adjusted_ebitda", name: "Adjusted EBITDA", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true, derived: true, formula: "EBITDA + add-backs" },
  { key: "ebitda_margin", name: "EBITDA margin", category: "finance_accounting", unit: "percent", group: "Financial", higherIsBetter: true, derived: true, formula: "EBITDA / Net revenue" },
  { key: "net_income", name: "Net income", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: true },
  { key: "payroll_expense", name: "Payroll expense", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "payroll_pct_revenue", name: "Payroll as % of revenue", category: "finance_accounting", unit: "percent", group: "Financial", higherIsBetter: false, derived: true, formula: "Payroll expense / Net revenue" },
  { key: "rent_expense", name: "Rent expense", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "supplies_expense", name: "Supplies expense", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "operating_expenses", name: "Operating expenses", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "debt_obligations", name: "Debt obligations", category: "finance_accounting", unit: "USD", group: "Financial", higherIsBetter: false },
  { key: "ap_aging", name: "AP aging", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "revenue_by_location", name: "Revenue by location", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "revenue_by_provider", name: "Revenue by provider", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "budget_by_location", name: "Budget by location", category: "finance_accounting", unit: "USD", group: "Financial" },
  { key: "yoy_revenue_growth", name: "Year-over-year revenue growth", category: "finance_accounting", unit: "percent", group: "Financial", higherIsBetter: true, derived: true, formula: "(Net revenue_Y / Net revenue_Y-1) - 1" },
  { key: "add_backs", name: "Add-backs", category: "finance_accounting", unit: "USD", group: "Financial" },

  // ── Revenue Cycle ──
  { key: "total_ar", name: "Total AR", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle", higherIsBetter: false },
  { key: "ar_by_payer", name: "AR by payer", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "ar_by_dos_bucket", name: "AR by date-of-service bucket", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "days_in_ar", name: "Days in AR", category: "revenue_cycle_billing", unit: "days", group: "Revenue Cycle", higherIsBetter: false, derived: true, formula: "Total AR / (Trailing charges / days)" },
  { key: "collections_by_month", name: "Collections by month", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "charges_by_month", name: "Charges by month", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "payments_by_month", name: "Payments by month", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "adjustments_by_month", name: "Adjustments by month", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle" },
  { key: "denial_rate", name: "Denial rate", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle", higherIsBetter: false, derived: true, formula: "Denied claims / Total claims submitted" },
  { key: "top_denial_categories", name: "Top denial categories", category: "revenue_cycle_billing", unit: "text", group: "Revenue Cycle" },
  { key: "fee_schedule_availability", name: "Fee schedule availability", category: "revenue_cycle_billing", unit: "boolean", group: "Revenue Cycle" },
  { key: "payer_mix", name: "Payer mix", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle" },
  { key: "cpt_mix", name: "CPT mix", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle" },
  { key: "icd_mix", name: "ICD mix", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle" },
  { key: "visits_by_month", name: "Visits by month", category: "revenue_cycle_billing", unit: "count", group: "Revenue Cycle" },
  { key: "visits_by_year", name: "Visits by year", category: "revenue_cycle_billing", unit: "count", group: "Revenue Cycle" },
  { key: "collection_rate", name: "Collection rate", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle", higherIsBetter: true, derived: true, formula: "Payments / Charges" },
  { key: "net_collection_ratio", name: "Net collection ratio", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle", higherIsBetter: true, derived: true, formula: "Payments / (Charges - Contractual adjustments)" },
  { key: "gross_collection_ratio", name: "Gross collection ratio", category: "revenue_cycle_billing", unit: "percent", group: "Revenue Cycle", derived: true, formula: "Payments / Gross charges" },
  { key: "revenue_per_visit", name: "Revenue per visit", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle", higherIsBetter: true, derived: true, formula: "Net revenue / Total visits" },
  { key: "revenue_per_patient", name: "Revenue per patient", category: "revenue_cycle_billing", unit: "USD", group: "Revenue Cycle", higherIsBetter: true, derived: true, formula: "Net revenue / Active patients" },
  { key: "active_patient_count", name: "Active patient count", category: "revenue_cycle_billing", unit: "count", group: "Revenue Cycle" },
  { key: "total_patients_emr", name: "Total patients in EMR", category: "revenue_cycle_billing", unit: "count", group: "Revenue Cycle" },

  // ── Provider / Credentialing ──
  { key: "total_providers", name: "Total providers", category: "providers_credentialing", unit: "count", group: "Provider" },
  { key: "physician_count", name: "Physician count", category: "providers_credentialing", unit: "count", group: "Provider" },
  { key: "app_count", name: "APP count", category: "providers_credentialing", unit: "count", group: "Provider" },
  { key: "provider_fte", name: "Provider FTE", category: "providers_credentialing", unit: "count", group: "Provider" },
  { key: "npi_completion", name: "Provider NPI completion", category: "providers_credentialing", unit: "percent", group: "Provider", higherIsBetter: true },
  { key: "license_completion", name: "License completion", category: "providers_credentialing", unit: "percent", group: "Provider", higherIsBetter: true },
  { key: "dea_completion", name: "DEA / CDS completion", category: "providers_credentialing", unit: "percent", group: "Provider", higherIsBetter: true },
  { key: "malpractice_status", name: "Malpractice coverage status", category: "providers_credentialing", unit: "text", group: "Provider" },
  { key: "board_cert_status", name: "Board certification status", category: "providers_credentialing", unit: "percent", group: "Provider", higherIsBetter: true },
  { key: "missing_credentialing_items", name: "Missing credentialing items", category: "providers_credentialing", unit: "count", group: "Provider", higherIsBetter: false },
  { key: "provider_dependency_risk", name: "Provider dependency risk", category: "providers_credentialing", unit: "text", group: "Provider" },

  // ── Operations / Clinical ──
  { key: "total_locations", name: "Total locations", category: "operations_clinical", unit: "count", group: "Operations" },
  { key: "service_lines", name: "Service lines", category: "operations_clinical", unit: "text", group: "Operations" },
  { key: "weekly_visits_by_provider", name: "Weekly visit volume by provider", category: "operations_clinical", unit: "count", group: "Operations" },
  { key: "monthly_visit_volume", name: "Monthly visit volume", category: "operations_clinical", unit: "count", group: "Operations" },
  { key: "annual_visit_volume", name: "Annual visit volume", category: "operations_clinical", unit: "count", group: "Operations" },
  { key: "visits_per_provider", name: "Visits per provider", category: "operations_clinical", unit: "count", group: "Operations", derived: true, formula: "Total visits / Provider count" },
  { key: "visits_per_location", name: "Visits per location", category: "operations_clinical", unit: "count", group: "Operations", derived: true, formula: "Total visits / Location count" },
  { key: "provider_facing_hours", name: "Provider-facing hours", category: "operations_clinical", unit: "count", group: "Operations" },
  { key: "staffing_model", name: "Staffing model by location", category: "operations_clinical", unit: "text", group: "Operations" },
  { key: "staff_to_provider_ratio", name: "Staff-to-provider ratio", category: "operations_clinical", unit: "ratio", group: "Operations", derived: true, formula: "Staff count / Provider count" },
  { key: "equipment_inventory_status", name: "Equipment inventory status", category: "operations_clinical", unit: "text", group: "Operations" },
  { key: "ancillary_utilization", name: "Ancillary utilization", category: "operations_clinical", unit: "text", group: "Operations" },
  { key: "referral_patterns", name: "Referral patterns", category: "operations_clinical", unit: "text", group: "Operations" },
  { key: "scheduling_capacity", name: "Scheduling capacity", category: "operations_clinical", unit: "text", group: "Operations" },

  // ── HR / Payroll ──
  { key: "total_employees", name: "Total employees", category: "hr_payroll", unit: "count", group: "HR" },
  { key: "full_time_employees", name: "Full-time employees", category: "hr_payroll", unit: "count", group: "HR" },
  { key: "part_time_employees", name: "Part-time employees", category: "hr_payroll", unit: "count", group: "HR" },
  { key: "salary_employees", name: "Salary employees", category: "hr_payroll", unit: "count", group: "HR" },
  { key: "hourly_employees", name: "Hourly employees", category: "hr_payroll", unit: "count", group: "HR" },
  { key: "payroll_by_month", name: "Payroll by month", category: "hr_payroll", unit: "USD", group: "HR" },
  { key: "payroll_by_position", name: "Payroll by position", category: "hr_payroll", unit: "USD", group: "HR" },
  { key: "benefit_cost", name: "Benefit cost", category: "hr_payroll", unit: "USD", group: "HR" },
  { key: "pto_liability", name: "PTO liability", category: "hr_payroll", unit: "USD", group: "HR", higherIsBetter: false },
  { key: "plan_401k", name: "401k plan details", category: "hr_payroll", unit: "text", group: "HR" },
  { key: "key_role_dependency", name: "Key role dependency", category: "hr_payroll", unit: "text", group: "HR" },
  { key: "org_chart_completion", name: "Org chart completion", category: "hr_payroll", unit: "percent", group: "HR", higherIsBetter: true },
  { key: "payroll_vendor", name: "Payroll vendor", category: "hr_payroll", unit: "text", group: "HR" },
  { key: "hr_transition_risk", name: "HR transition risk", category: "hr_payroll", unit: "text", group: "HR" },

  // ── IT / Systems ──
  { key: "emr_identified", name: "EMR identified", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "billing_system_identified", name: "Billing system identified", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "reporting_tools_identified", name: "Reporting tools identified", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "employee_count_by_site", name: "Employee count by site", category: "it_emr_systems", unit: "count", group: "IT" },
  { key: "hardware_inventory_completion", name: "Hardware inventory completion", category: "it_emr_systems", unit: "percent", group: "IT", higherIsBetter: true },
  { key: "email_account_completion", name: "Email account list completion", category: "it_emr_systems", unit: "percent", group: "IT", higherIsBetter: true },
  { key: "phone_fax_transition_status", name: "Phone/fax transition status", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "go_live_dependencies", name: "Go-live dependencies", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "historical_data_access_status", name: "Historical data access status", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "it_vendor_risk", name: "IT vendor risk", category: "it_emr_systems", unit: "text", group: "IT" },
  { key: "data_migration_readiness", name: "Data migration readiness", category: "it_emr_systems", unit: "text", group: "IT" },

  // ── Legal / Business ──
  { key: "tax_id_received", name: "Tax ID received", category: "legal_contracts_business", unit: "boolean", group: "Legal" },
  { key: "w9_received", name: "W-9 received", category: "legal_contracts_business", unit: "boolean", group: "Legal" },
  { key: "irs_letter_received", name: "IRS letter received", category: "legal_contracts_business", unit: "boolean", group: "Legal" },
  { key: "clia_status", name: "CLIA status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "licensure_status", name: "Licensure status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "insurance_status", name: "Insurance status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "payer_enrollment_status", name: "Payer enrollment status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "vendor_contract_status", name: "Vendor contract status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "location_list_completion", name: "Location/address list completion", category: "legal_contracts_business", unit: "percent", group: "Legal", higherIsBetter: true },
  { key: "lease_agreement_status", name: "Lease agreement status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "loan_agreement_status", name: "Loan agreement status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "compliance_document_status", name: "Compliance document status", category: "legal_contracts_business", unit: "text", group: "Legal" },
  { key: "contract_risk_flags", name: "Contract risk flags", category: "legal_contracts_business", unit: "count", group: "Legal", higherIsBetter: false },
];

export const KPI_GROUPS = [
  "Financial",
  "Revenue Cycle",
  "Provider",
  "Operations",
  "HR",
  "IT",
  "Legal",
] as const;

export function kpiByKey(key: string): KpiDefinition | undefined {
  return KPI_DEFINITIONS.find((k) => k.key === key);
}

export function kpisForGroup(group: KpiDefinition["group"]): KpiDefinition[] {
  return KPI_DEFINITIONS.filter((k) => k.group === group);
}
