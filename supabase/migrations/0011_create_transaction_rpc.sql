-- Feature 1: atomic transaction creation. Inserts the deal, generates its
-- diligence checklist from the default template, creates the data_room row +
-- initial stage history, and writes audit + activity. Returns the new id.
-- SharePoint provisioning is done separately by the client (so a Graph failure
-- doesn't roll back the saved transaction); the folder URL is stored after.
create or replace function public.app_create_transaction(
  p_name text,
  p_practice text,
  p_specialty text default null,
  p_state text default null,
  p_stage text default 'Prospect / Sourced',
  p_actor text default 'System'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_tmpl uuid;
  v_id uuid;
begin
  select id into v_org from organizations order by created_at limit 1;
  select id into v_tmpl from diligence_templates where is_default limit 1;

  insert into transactions
    (organization_id, name, practice_name, specialty, state, stage, template_id, last_activity_date)
  values
    (v_org, coalesce(nullif(p_name, ''), p_practice), p_practice,
     nullif(p_specialty, ''), nullif(p_state, ''),
     coalesce(nullif(p_stage, ''), 'Prospect / Sourced'), v_tmpl, now())
  returning id into v_id;

  insert into diligence_request_items
    (transaction_id, template_item_key, category, name, needed_timeline, sensitive, critical_pre_signing, status)
  select v_id, ti.item_key, ti.category, ti.name, ti.needed_timeline, ti.sensitive, ti.critical_pre_signing, 'Pending'::diligence_status
  from diligence_template_items ti
  where ti.template_id = v_tmpl;

  insert into data_rooms (transaction_id) values (v_id) on conflict (transaction_id) do nothing;

  insert into transaction_stages (transaction_id, stage, entered_at)
  values (v_id, coalesce(nullif(p_stage, ''), 'Prospect / Sourced'), now());

  insert into audit_logs (transaction_id, actor_name, action, target, metadata)
  values (v_id, p_actor, 'transaction_created', p_practice, jsonb_build_object('stage', p_stage));

  insert into activity_events (transaction_id, type, actor_name, summary)
  values (v_id, 'transaction_created', p_actor, 'Transaction created: ' || p_practice);

  return v_id;
end;
$$;

revoke all on function public.app_create_transaction(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.app_create_transaction(text, text, text, text, text, text)
  to service_role;
