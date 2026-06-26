-- ============================================================================
-- Reference-data seed for the production schema.
--
-- Loads the 10 data-room categories and the default diligence template header.
-- The 116 template items and the role→permission grants are single-sourced in
-- TypeScript (src/lib/domain/diligence-template.ts and src/lib/domain/rbac.ts)
-- and loaded by the application bootstrap to avoid drift between code and DB.
-- ============================================================================

insert into diligence_categories (key, ordinal, label, folder_name, sensitive, description) values
  ('logins_passwords',          '01', 'Logins / Passwords',          '01. Logins Passwords',          true,  'Sensitive system credentials — secure credential workflow only.'),
  ('finance_accounting',        '02', 'Finance / Accounting',        '02. Finance Accounting',        false, 'Financial statements, tax, GL, AP, debt, leases.'),
  ('revenue_cycle_billing',     '03', 'Revenue Cycle / Billing',     '03. Revenue Cycle Billing',     false, 'AR, denials, collections, payer mix, claims, visits.'),
  ('providers_credentialing',   '04', 'Providers / Credentialing',   '04. Providers Credentialing',   false, 'Provider roster, NPI, licensure, DEA, malpractice.'),
  ('operations_clinical',       '05', 'Operations / Clinical',       '05. Operations Clinical',       false, 'Service lines, scheduling, staffing, equipment, referrals.'),
  ('hr_payroll',                '06', 'HR / Payroll',                '06. HR Payroll',                false, 'Employee roster, compensation, benefits, PTO, org chart.'),
  ('it_emr_systems',            '07', 'IT / EMR / Systems',          '07. IT EMR Systems',            false, 'EMR, billing, reporting, hardware, telecom, domains.'),
  ('legal_contracts_business',  '08', 'Legal / Contracts / Business','08. Legal Contracts Business',  false, 'Entity, tax, CLIA, insurance, enrollment, vendors.'),
  ('other',                     '09', 'Other',                       '09. Other',                     false, 'Miscellaneous documents.'),
  ('unclassified_review_queue', '10', 'Unclassified Review Queue',   '10. Unclassified Review Queue', false, 'Low-confidence documents awaiting human review.')
on conflict (key) do nothing;

insert into diligence_templates (id, name, version, description, is_default) values
  ('00000000-0000-0000-0000-0000000a1a01', 'Standard AMA Healthcare Diligence List', 1,
   'Default, reusable diligence request list for healthcare practice acquisitions.', true)
on conflict (id) do nothing;
