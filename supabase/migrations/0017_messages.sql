-- Internal messaging: a per-transaction thread for clarification questions and
-- back-and-forth between the deal team (buyer) and the seller/provider. Outbound
-- messages are queued for email when Mail.Send is granted; the seller can also
-- reply from their portal. Messages surface in the transaction's activity so the
-- AI assistant/summary can read them.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  direction text not null default 'internal',   -- internal | to_seller | from_seller
  subject text,
  body text not null,
  related_metric_key text,                       -- the KPI a clarification is about
  related_task_id uuid,
  author_id uuid,
  author_name text,
  author_type text not null default 'internal',  -- internal | seller | ai
  status text not null default 'sent',           -- draft | queued | sent | delivered | read
  read_at timestamptz,
  created_by text,                                -- actor display name (like communications.created_by)
  created_at timestamptz not null default now()
);
create index if not exists messages_tx_idx on public.messages (transaction_id, created_at desc);
create index if not exists messages_unread_idx on public.messages (transaction_id) where read_at is null;
alter table public.messages enable row level security;
