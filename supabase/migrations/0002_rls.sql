-- ============================================================================
-- Row Level Security — reviewer scoping + strict seller isolation
--
-- Enforces the permission model in /docs/02-roles-permissions-matrix.md at the
-- database layer. Sellers can only ever reach their own transaction and never
-- see internal notes, AI deal scores, valuation, KPIs, or risk data.
-- ============================================================================

-- ─────────────────────────── Helper functions ───────────────────────────

-- The application user row for the current authenticated principal.
create or replace function app_user_id() returns uuid
language sql stable as $$
  select u.id from users u where u.auth_user_id = auth.uid()
$$;

create or replace function app_role() returns role
language sql stable as $$
  select u.role from users u where u.auth_user_id = auth.uid()
$$;

create or replace function is_internal() returns boolean
language sql stable as $$
  select coalesce(app_role() <> 'seller', false)
$$;

create or replace function is_privileged() returns boolean
language sql stable as $$
  select app_role() in ('admin', 'ma_coordinator', 'executive_leadership')
$$;

-- Transactions a seller principal is entitled to (matched by verified email).
create or replace function seller_transaction_ids() returns setof uuid
language sql stable as $$
  select sp.transaction_id
  from seller_portal_users sp
  where sp.active
    and lower(sp.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (sp.expires_at is null or sp.expires_at > now())
$$;

-- Reviewer scoping: privileged roles see all; reviewers limited to assigned
-- transactions when any scope rows exist for them (otherwise org-wide read).
create or replace function internal_can_access(tx uuid) returns boolean
language sql stable as $$
  select is_privileged()
    or (
      is_internal()
      and (
        not exists (select 1 from transaction_user_scopes s where s.user_id = app_user_id())
        or exists (
          select 1 from transaction_user_scopes s
          where s.user_id = app_user_id() and s.transaction_id = tx
        )
      )
    )
$$;

create or replace function can_access_transaction(tx uuid) returns boolean
language sql stable as $$
  select internal_can_access(tx)
    or tx in (select seller_transaction_ids())
$$;

-- ─────────────────────────── Enable RLS ───────────────────────────

alter table transactions              enable row level security;
alter table transaction_contacts      enable row level security;
alter table transaction_stages        enable row level security;
alter table diligence_request_items   enable row level security;
alter table request_item_notes        enable row level security;
alter table documents                 enable row level security;
alter table comments                  enable row level security;
alter table ai_extracted_metrics      enable row level security;
alter table ai_classifications        enable row level security;
alter table kpi_snapshots             enable row level security;
alter table risk_flags                enable row level security;
alter table tasks                     enable row level security;
alter table meetings                  enable row level security;
alter table seller_portal_users       enable row level security;
alter table activity_events           enable row level security;
alter table audit_logs                enable row level security;

-- ─────────────────────────── Transactions ───────────────────────────

create policy tx_select on transactions
  for select using (can_access_transaction(id));

create policy tx_write on transactions
  for all using (is_privileged()) with check (is_privileged());

-- ─────────────────────────── Contacts ───────────────────────────

create policy contacts_select on transaction_contacts
  for select using (can_access_transaction(transaction_id));

create policy contacts_write on transaction_contacts
  for all using (is_privileged()) with check (is_privileged());

-- ─────────────────────────── Stages (internal only) ───────────────────────────

create policy stages_internal on transaction_stages
  for select using (internal_can_access(transaction_id));

-- ─────────────────────────── Diligence request items ───────────────────────────

create policy items_select on diligence_request_items
  for select using (can_access_transaction(transaction_id));

-- Internal staff may update items; sellers may only flag an item Not Applicable.
create policy items_internal_write on diligence_request_items
  for all using (internal_can_access(transaction_id))
  with check (internal_can_access(transaction_id));

create policy items_seller_mark_na on diligence_request_items
  for update
  using (transaction_id in (select seller_transaction_ids()))
  with check (status = 'Not Applicable');

-- ─────────────────────────── Item notes (audience split) ───────────────────────────

-- Internal notes: internal only. Seller-facing notes: visible to the seller.
create policy item_notes_internal on request_item_notes
  for select using (
    exists (
      select 1 from diligence_request_items i
      where i.id = request_item_id and internal_can_access(i.transaction_id)
    )
  );

create policy item_notes_seller on request_item_notes
  for select using (
    visibility = 'seller_facing'
    and exists (
      select 1 from diligence_request_items i
      where i.id = request_item_id
        and i.transaction_id in (select seller_transaction_ids())
    )
  );

-- ─────────────────────────── Documents ───────────────────────────

create policy documents_select on documents
  for select using (can_access_transaction(transaction_id));

create policy documents_insert on documents
  for insert with check (can_access_transaction(transaction_id));

create policy documents_internal_modify on documents
  for update using (internal_can_access(transaction_id))
  with check (internal_can_access(transaction_id));

-- ─────────────────────────── Comments (strict audience separation) ───────────────────────────

create policy comments_internal_select on comments
  for select using (internal_can_access(transaction_id));

create policy comments_seller_select on comments
  for select using (
    visibility = 'seller_facing'
    and transaction_id in (select seller_transaction_ids())
  );

create policy comments_insert on comments
  for insert with check (
    -- internal can post anything; sellers can only post seller_facing on their tx
    (internal_can_access(transaction_id))
    or (visibility = 'seller_facing' and transaction_id in (select seller_transaction_ids()))
  );

-- ─────────────────────────── Internal-only analytics ───────────────────────────
-- AI metrics, classifications, KPI snapshots, risk flags, tasks: NO seller access.

create policy metrics_internal on ai_extracted_metrics
  for select using (internal_can_access(transaction_id));

create policy classifications_internal on ai_classifications
  for select using (
    exists (select 1 from documents d where d.id = document_id and internal_can_access(d.transaction_id))
  );

create policy kpi_internal on kpi_snapshots
  for select using (internal_can_access(transaction_id));

create policy risk_internal on risk_flags
  for select using (internal_can_access(transaction_id));

create policy tasks_internal on tasks
  for all using (internal_can_access(transaction_id))
  with check (internal_can_access(transaction_id));

-- ─────────────────────────── Meetings ───────────────────────────

create policy meetings_select on meetings
  for select using (can_access_transaction(transaction_id));

create policy meetings_write on meetings
  for all using (internal_can_access(transaction_id))
  with check (internal_can_access(transaction_id));

-- ─────────────────────────── Seller portal users ───────────────────────────

create policy seller_portal_internal on seller_portal_users
  for all using (is_privileged()) with check (is_privileged());

create policy seller_portal_self on seller_portal_users
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ─────────────────────────── Activity & audit (internal only, append-only) ───────────────────────────

create policy activity_internal on activity_events
  for select using (internal_can_access(transaction_id));

create policy activity_insert on activity_events
  for insert with check (is_internal());

create policy audit_select on audit_logs
  for select using (is_privileged());

create policy audit_insert on audit_logs
  for insert with check (true);   -- any authenticated action may write its own audit row
