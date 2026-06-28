-- Upsert a global contact (by email+type) and link it to a transaction. Returns
-- the contact id. Used by the New Transaction flow and the Contacts tab.
create or replace function public.app_add_contact(
  p_transaction_id uuid,
  p_type text,
  p_name text,
  p_email text,
  p_phone text default null,
  p_role text default null,
  p_is_primary boolean default false,
  p_functional_roles text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into contacts (type, name, email, phone, functional_roles)
  values (coalesce(nullif(p_type,''),'external'), p_name, p_email, nullif(p_phone,''), coalesce(p_functional_roles,'{}'))
  on conflict (email, type) do update
    set name = excluded.name,
        phone = coalesce(excluded.phone, contacts.phone),
        functional_roles = case when array_length(excluded.functional_roles,1) is not null
                                then excluded.functional_roles else contacts.functional_roles end
  returning id into v_id;

  if p_transaction_id is not null then
    insert into contact_links (contact_id, transaction_id, is_primary, role_on_deal)
    values (v_id, p_transaction_id, coalesce(p_is_primary,false), nullif(p_role,''))
    on conflict (contact_id, transaction_id) do update
      set is_primary = excluded.is_primary, role_on_deal = coalesce(excluded.role_on_deal, contact_links.role_on_deal);
  end if;
  return v_id;
end; $$;

revoke all on function public.app_add_contact(uuid,text,text,text,text,text,boolean,text[]) from public, anon, authenticated;
grant execute on function public.app_add_contact(uuid,text,text,text,text,text,boolean,text[]) to service_role;
