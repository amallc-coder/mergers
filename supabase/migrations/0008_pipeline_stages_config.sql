-- Feature 4: configurable deal pipeline stages.
-- Move stage off the fixed enum onto a config table so the stage set is editable
-- in one place, and seed it with the agreed healthcare-deal lifecycle.

create table if not exists public.pipeline_stages (
  key text primary key,
  label text not null unique,
  sort_order int not null,
  is_terminal boolean not null default false,
  -- configurable, non-mandatory automations fired on entering the stage,
  -- e.g. [{"action":"send_nda"},{"action":"request_documents"}]
  automations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.pipeline_stages (key, label, sort_order, is_terminal, automations) values
  ('prospect_sourced',     'Prospect / Sourced',                    1,  false, '[]'),
  ('nda_sent',             'NDA Sent',                              2,  false, '[{"action":"send_nda"},{"action":"schedule_followup"}]'),
  ('nda_executed',         'NDA Executed',                          3,  false, '[]'),
  ('data_requested',       'Data Requested / Waiting on Data',      4,  false, '[{"action":"request_documents"}]'),
  ('diligence_in_progress','Diligence In Progress',                 5,  false, '[]'),
  ('loi_drafted',          'LOI Drafted',                           6,  false, '[]'),
  ('loi_sent',             'LOI Sent',                              7,  false, '[{"action":"schedule_followup"}]'),
  ('loi_executed',         'LOI Executed',                          8,  false, '[]'),
  ('definitive_agreement', 'Definitive Agreement / Final Contracting', 9, false, '[]'),
  ('signed_closed',        'Signed / Closed',                       10, true,  '[]'),
  ('on_hold',              'On Hold',                               11, true,  '[]'),
  ('passed_dead',          'Passed / Dead',                         12, true,  '[]')
on conflict (key) do nothing;

-- Convert stage columns from the fixed enum to text (config-driven values).
alter table public.transactions      alter column stage drop default;
alter table public.transactions      alter column stage type text using stage::text;
alter table public.transaction_stages alter column stage type text using stage::text;

-- Migrate existing deals: they all have provisioned data rooms + generated
-- checklists, i.e. they're awaiting seller data.
update public.transactions
set stage = 'Data Requested / Waiting on Data'
where stage not in (select label from public.pipeline_stages);

alter table public.transactions alter column stage set default 'Prospect / Sourced';

-- Seed a current-stage history row per transaction so time-in-stage has a start.
insert into public.transaction_stages (transaction_id, stage, entered_at)
select t.id, t.stage, t.created_at
from public.transactions t
where not exists (
  select 1 from public.transaction_stages s where s.transaction_id = t.id
);
