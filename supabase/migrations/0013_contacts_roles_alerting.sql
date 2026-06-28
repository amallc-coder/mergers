-- Feature 3: global contacts (people) with a many-to-many link to transactions,
-- functional roles for internal contacts, and configurable role->category alert
-- routing. The existing per-deal transaction_contacts rows are migrated in.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'external',          -- internal | external | seller
  name text not null,
  email text not null,
  phone text,
  title text,
  functional_roles text[] not null default '{}',  -- Finance, Operations, Legal, HR, Executive Leadership, M&A Coordinator
  created_at timestamptz not null default now(),
  unique (email, type)
);
create index if not exists contacts_type_idx on public.contacts (type);

create table if not exists public.contact_links (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  is_primary boolean not null default false,
  role_on_deal text,
  created_at timestamptz not null default now(),
  primary key (contact_id, transaction_id)
);
create index if not exists contact_links_tx_idx on public.contact_links (transaction_id);

create table if not exists public.alert_routing (
  category text primary key,
  roles text[] not null default '{}'
);

insert into public.alert_routing (category, roles) values
  ('finance_accounting',      array['Finance','M&A Coordinator']),
  ('revenue_cycle_billing',   array['Finance','M&A Coordinator']),
  ('providers_credentialing', array['Operations','M&A Coordinator']),
  ('operations_clinical',     array['Operations','M&A Coordinator']),
  ('hr_payroll',              array['HR','M&A Coordinator']),
  ('it_emr_systems',          array['Operations','M&A Coordinator']),
  ('legal_contracts_business',array['Legal','M&A Coordinator']),
  ('logins_passwords',        array['M&A Coordinator']),
  ('other',                   array['M&A Coordinator']),
  ('unclassified_review_queue', array['M&A Coordinator'])
on conflict (category) do nothing;

-- Migrate existing per-deal contacts into the global model (enum -> text casts).
insert into public.contacts (type, name, email, phone, functional_roles)
select distinct on (lower(c.email), c.type::text)
  c.type::text, c.name, c.email, c.phone, '{}'::text[]
from public.transaction_contacts c
where c.email is not null and c.email <> ''
on conflict (email, type) do nothing;

insert into public.contact_links (contact_id, transaction_id, is_primary, role_on_deal)
select g.id, c.transaction_id, c.is_primary, c.role
from public.transaction_contacts c
join public.contacts g on g.email = c.email and g.type = c.type::text
on conflict (contact_id, transaction_id) do nothing;

alter table public.contacts enable row level security;
alter table public.contact_links enable row level security;
alter table public.alert_routing enable row level security;
