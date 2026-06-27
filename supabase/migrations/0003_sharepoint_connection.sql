-- ============================================================================
-- SharePoint connection state for the Microsoft Graph integration.
-- The Azure credentials live in Edge Function secrets, NOT here. This table
-- tracks which drive/site is connected and the incremental sync cursor.
-- ============================================================================

create table if not exists sharepoint_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  site_id text,                       -- amadmins.sharepoint.com,<guid>,<guid>
  drive_id text not null,             -- M&A Diligence document library
  root_folder text not null default 'M&A Diligence',
  delta_link text,                    -- cursor for /delta incremental sync
  status text not null default 'pending',  -- pending | connected | error
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Map each transaction's data room to its SharePoint folder ids.
alter table transactions
  add column if not exists sharepoint_data_room_item_id text;

alter table folders
  add column if not exists sharepoint_item_id text;

-- Only Admins manage the connection; everyone authenticated may read status.
alter table sharepoint_connections enable row level security;

create policy sp_conn_read on sharepoint_connections
  for select using (is_internal());

create policy sp_conn_admin on sharepoint_connections
  for all using (is_privileged()) with check (is_privileged());
