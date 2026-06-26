-- ============================================================================
-- Healthcare M&A Diligence Platform — Core schema (Phase 1)
--
-- Production Postgres schema for Supabase. Mirrors the application domain model
-- in src/lib/domain/types.ts. The MVP app runs on the seed-backed data layer;
-- set DATA_BACKEND=supabase and point at a project with this schema applied to
-- persist for real. See /docs/03-database-schema.md for the full design notes.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
-- create extension if not exists vector;   -- pgvector for AI RAG (Phase 3)

-- ─────────────────────────────── Enums ───────────────────────────────

create type role as enum (
  'admin', 'ma_coordinator', 'executive_leadership', 'finance_reviewer',
  'operations_reviewer', 'legal_compliance_reviewer', 'hr_reviewer', 'seller'
);

create type transaction_stage as enum (
  'Lead identified', 'Initial outreach', 'NDA sent', 'NDA executed',
  'Data room created', 'Initial diligence request sent', 'Pre-signing diligence in progress',
  'Financial review', 'Operational review', 'Legal review', 'Valuation review',
  'LOI drafted', 'LOI sent', 'LOI executed', 'Post-signing diligence in progress',
  'Definitive agreement diligence', 'Closing preparation', 'Closed', 'Paused', 'Declined'
);

create type diligence_status as enum ('Received', 'Pending', 'Not Applicable', 'Denied');

create type internal_review_status as enum (
  'Uploaded', 'Under Review', 'Accepted', 'Rejected',
  'Needs Clarification', 'Overdue', 'Internal Review Complete'
);

create type needed_timeline as enum ('Pre Signing', 'Post Signing');

create type risk_level as enum ('Low', 'Moderate', 'Elevated', 'High');

create type deal_health_score as enum (
  'Strong', 'Moderate', 'Needs Review', 'High Risk', 'Insufficient Data'
);

create type category_key as enum (
  'logins_passwords', 'finance_accounting', 'revenue_cycle_billing',
  'providers_credentialing', 'operations_clinical', 'hr_payroll',
  'it_emr_systems', 'legal_contracts_business', 'other', 'unclassified_review_queue'
);

create type contact_type as enum ('internal', 'external');
create type sharepoint_sync_status as enum ('synced', 'pending', 'error', 'not_connected');
create type metric_source as enum ('ai', 'human');
create type comment_visibility as enum ('internal', 'seller_facing');
create type task_status as enum ('open', 'in_progress', 'blocked', 'done');

-- ─────────────────────────── Identity & RBAC ───────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acquiring_entity boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  auth_user_id uuid unique,                       -- maps to auth.users (Supabase Auth / Entra ID)
  name text not null,
  email text not null unique,
  role role not null,
  title text,
  created_at timestamptz not null default now()
);
create index on users (organization_id);
create index on users (role);

-- Permission catalog & role grants (mirrors src/lib/domain/rbac.ts)
create table role_permissions (
  role role not null,
  permission text not null,
  primary key (role, permission)
);

-- Reviewer-to-transaction scoping (reviewers limited to assigned deals)
create table transaction_user_scopes (
  transaction_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  primary key (transaction_id, user_id)
);

-- ─────────────────────────── Diligence templates ───────────────────────────

create table diligence_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table diligence_categories (
  key category_key primary key,
  ordinal text not null,
  label text not null,
  folder_name text not null,
  sensitive boolean not null default false,
  description text,
  ai_extraction_targets jsonb not null default '[]'::jsonb
);

create table diligence_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references diligence_templates(id) on delete cascade,
  item_key text not null,                          -- e.g. 'B.03'
  category category_key not null references diligence_categories(key),
  name text not null,
  needed_timeline needed_timeline not null,
  sensitive boolean not null default false,
  critical_pre_signing boolean not null default false,
  seller_guidance text,
  sort_order int not null default 0,
  unique (template_id, item_key)
);
create index on diligence_template_items (template_id);

-- ─────────────────────────── Transactions ───────────────────────────

create table transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  practice_name text not null,
  specialty text,
  state text,
  locations_count int not null default 0,
  providers_count int not null default 0,
  stage transaction_stage not null default 'Lead identified',
  assigned_coordinator_id uuid references users(id),
  internal_deal_owner_id uuid references users(id),
  external_primary_contact_id uuid,                -- FK added after transaction_contacts
  sharepoint_folder_url text,
  last_activity_date timestamptz not null default now(),
  risk_level risk_level not null default 'Moderate',
  template_id uuid references diligence_templates(id),
  created_at timestamptz not null default now()
);
create index on transactions (organization_id);
create index on transactions (stage);

create table transaction_contacts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  type contact_type not null,
  name text not null,
  email text not null,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on transaction_contacts (transaction_id);

alter table transactions
  add constraint transactions_primary_contact_fk
  foreign key (external_primary_contact_id) references transaction_contacts(id) on delete set null;

create table transaction_stages (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  stage transaction_stage not null,
  owner_id uuid references users(id),
  due_date date,
  entered_at timestamptz,
  notes text,
  ai_stage_summary text
);
create index on transaction_stages (transaction_id);

-- ─────────────────────────── Diligence request items ───────────────────────────

create table diligence_request_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  template_item_key text not null,
  category category_key not null references diligence_categories(key),
  name text not null,
  needed_timeline needed_timeline not null,
  sensitive boolean not null default false,
  critical_pre_signing boolean not null default false,
  status diligence_status not null default 'Pending',
  internal_review_status internal_review_status,
  assigned_external_contact_id uuid references transaction_contacts(id) on delete set null,
  assigned_internal_reviewer_id uuid references users(id) on delete set null,
  due_date date,
  ai_classification text,
  ai_confidence numeric(4,3),
  human_review_required boolean not null default false,
  last_updated timestamptz not null default now()
);
create index on diligence_request_items (transaction_id);
create index on diligence_request_items (transaction_id, category);
create index on diligence_request_items (transaction_id, needed_timeline, status);

create table request_item_status_history (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references diligence_request_items(id) on delete cascade,
  from_status diligence_status,
  to_status diligence_status not null,
  changed_by uuid references users(id),
  changed_at timestamptz not null default now()
);
create index on request_item_status_history (request_item_id);

create table request_assignments (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references diligence_request_items(id) on delete cascade,
  user_id uuid references users(id),
  contact_id uuid references transaction_contacts(id),
  assigned_at timestamptz not null default now()
);

-- Item-level notes split by audience (internal vs seller-facing).
create table request_item_notes (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references diligence_request_items(id) on delete cascade,
  visibility comment_visibility not null,
  author_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index on request_item_notes (request_item_id);

-- ─────────────────────────── Seller portal & upload links ───────────────────────────

create table seller_portal_users (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  contact_id uuid references transaction_contacts(id) on delete set null,
  email text not null,
  name text not null,
  access_token text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now()
);
create index on seller_portal_users (transaction_id);
create index on seller_portal_users (access_token);

create table upload_links (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references diligence_request_items(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  max_uploads int,
  created_at timestamptz not null default now()
);

-- ─────────────────────────── Data room, folders, documents ───────────────────────────

create table data_rooms (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  sharepoint_folder_url text,
  created_at timestamptz not null default now()
);

create table folders (
  id uuid primary key default gen_random_uuid(),
  data_room_id uuid not null references data_rooms(id) on delete cascade,
  category category_key not null references diligence_categories(key),
  folder_name text not null,
  sharepoint_folder_id text,
  sharepoint_sync_status sharepoint_sync_status not null default 'not_connected',
  last_upload_date timestamptz
);
create index on folders (data_room_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  request_item_id uuid references diligence_request_items(id) on delete set null,
  category category_key not null references diligence_categories(key),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  uploaded_by text,
  uploaded_by_type contact_type,
  uploaded_at timestamptz not null default now(),
  sharepoint_file_id text,
  sharepoint_url text,
  sharepoint_sync_status sharepoint_sync_status not null default 'not_connected',
  review_status internal_review_status,
  created_at timestamptz not null default now()
);
create index on documents (transaction_id);
create index on documents (request_item_id);
create index on documents (category);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version int not null,
  file_name text not null,
  size_bytes bigint,
  sharepoint_file_id text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index on document_versions (document_id);

create table sharepoint_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  drive_id text not null,
  drive_item_id text not null,
  etag text,
  web_url text,
  last_synced_at timestamptz,
  unique (drive_id, drive_item_id)
);

-- ─────────────────────────── AI layer ───────────────────────────

create table ai_classifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  document_type text,
  category category_key references diligence_categories(key),
  matched_request_item_id uuid references diligence_request_items(id),
  needed_timeline needed_timeline,
  date_range_start date,
  date_range_end date,
  entity text,
  confidence numeric(4,3),
  flags text[] not null default '{}',
  requires_human_review boolean not null default false,
  created_at timestamptz not null default now()
);
create index on ai_classifications (document_id);

-- AI-extracted and human-reviewed metrics share one table, distinguished by
-- `source`. Human review rows reference the AI row they override.
create table ai_extracted_metrics (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  metric_key text not null,
  metric_name text not null,
  category category_key references diligence_categories(key),
  metric_value_numeric numeric,
  metric_value_text text,
  metric_unit text,
  period text,
  source_document_id uuid references documents(id) on delete set null,
  source_document_name text,
  source_page int,
  confidence_score numeric(4,3),
  requires_human_review boolean not null default false,
  source metric_source not null default 'ai',
  overridden_from_value numeric,
  overridden_by uuid references users(id),
  last_updated timestamptz not null default now()
);
create index on ai_extracted_metrics (transaction_id);
create index on ai_extracted_metrics (transaction_id, metric_key);

create table kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  payload jsonb not null,                          -- rolled-up KPI values for the dashboard
  deal_health_score deal_health_score,
  numeric_score int
);
create index on kpi_snapshots (transaction_id);

create table risk_flags (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  category category_key references diligence_categories(key),
  severity risk_level not null,
  title text not null,
  detail text,
  source_metric_keys text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on risk_flags (transaction_id);

-- ─────────────────────────── Collaboration ───────────────────────────

create table tasks (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'open',
  assignee_id uuid references users(id),
  due_date date,
  category category_key references diligence_categories(key),
  created_at timestamptz not null default now()
);
create index on tasks (transaction_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  request_item_id uuid references diligence_request_items(id) on delete cascade,
  author_id uuid references users(id),
  author_name text,
  author_type contact_type,
  visibility comment_visibility not null default 'internal',
  body text not null,
  created_at timestamptz not null default now()
);
create index on comments (transaction_id);
create index on comments (request_item_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  type text not null,
  summary text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read);

create table reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid references diligence_request_items(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  cadence text not null default 'before_due,on_due,overdue',
  paused boolean not null default false,
  last_sent_at timestamptz,
  escalate_after int not null default 3
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  type text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  attendee_contact_ids uuid[] not null default '{}',
  agenda jsonb not null default '[]'::jsonb,
  outlook_event_id text,
  location text,
  online_meeting_url text,
  created_at timestamptz not null default now()
);
create index on meetings (transaction_id);

-- ─────────────────────────── External sync logs ───────────────────────────

create table sharepoint_sync_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  event text not null,                             -- created/updated/renamed/deleted/version
  drive_item_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on sharepoint_sync_logs (transaction_id);

create table outlook_sync_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete set null,
  event text not null,                             -- created/updated/cancelled/response
  outlook_event_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on outlook_sync_logs (transaction_id);

-- ─────────────────────────── Audit & activity (append-only) ───────────────────────────

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  type text not null,
  actor_id uuid references users(id),
  actor_name text,
  summary text not null,
  detail text,
  category category_key,
  created_at timestamptz not null default now()
);
create index on activity_events (transaction_id, created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete set null,
  actor_id uuid references users(id),
  actor_name text,
  action text not null,                            -- login/file_upload/file_view/.../stage_changed
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (transaction_id, created_at desc);
create index on audit_logs (action);

create table permission_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  subject_user_id uuid references users(id),
  change text not null,
  created_at timestamptz not null default now()
);

-- Append-only guard: block updates/deletes on audit tables.
create or replace function deny_mutation() returns trigger as $$
begin
  raise exception 'append-only table: % not permitted', tg_op;
end;
$$ language plpgsql;

create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function deny_mutation();

create trigger permission_logs_append_only
  before update or delete on permission_logs
  for each row execute function deny_mutation();
