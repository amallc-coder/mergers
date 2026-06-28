-- Email / communications log. Every outbound message is recorded here, whether
-- sent immediately or queued (when Mail.Send isn't granted yet / no sender
-- mailbox configured). A later flushOutbox pass sends the queued ones once the
-- Microsoft 365 Mail.Send permission is in place.
create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  contact_id uuid references public.transaction_contacts(id) on delete set null,
  channel text not null default 'email',
  direction text not null default 'outbound',
  to_email text,
  to_name text,
  subject text,
  body text,
  template_key text,
  -- queued | sent | failed | skipped
  status text not null default 'queued',
  error text,
  provider_message_id text,
  sent_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists communications_tx_idx on public.communications (transaction_id, created_at desc);
create index if not exists communications_status_idx on public.communications (status);

-- Gated through the edge function (service role) only.
alter table public.communications enable row level security;
