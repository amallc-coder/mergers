/**
 * One-off generator: emits compact SQL to populate the live Supabase backend
 * with the canonical reference data the app defines in TypeScript — the internal
 * user roster, the 116 diligence template items, and the per-transaction request
 * items (fanned out in-DB via a CROSS JOIN). Run: `npx tsx scripts/gen-seed-sql.ts`.
 *
 * Idempotent via ON CONFLICT / WHERE NOT EXISTS. Org/template ids resolved by
 * subquery so the SQL is environment-portable.
 */
import { AMA_DILIGENCE_ITEMS } from "../src/lib/domain/diligence-template";
import { USERS } from "../src/lib/data/seed";

const q = (s: string | undefined | null) =>
  s === undefined || s === null ? "null" : `'${s.replace(/'/g, "''")}'`;
const b = (v: unknown) => (v ? "true" : "false");

const out: string[] = [];

// ── users ──────────────────────────────────────────────────────────────────
const userRows = USERS.filter((u) => u.role !== "seller")
  .map((u) => `(${q(u.name)}, ${q(u.email)}, ${q(u.role)}::role, ${q(u.title)})`)
  .join(",\n  ");
out.push(`insert into public.users (organization_id, name, email, role, title)
select (select id from public.organizations limit 1), v.name, v.email, v.role, v.title
from (values
  ${userRows}
) as v(name, email, role, title)
on conflict (email) do nothing;`);

// ── diligence_template_items ─────────────────────────────────────────────────
const itemRows = AMA_DILIGENCE_ITEMS.map(
  (it, i) =>
    `(${q(it.key)}, ${q(it.category)}::category_key, ${q(it.name)}, ${q(it.neededTimeline)}::needed_timeline, ${b(it.sensitive)}, ${b(it.criticalPreSigning)}, ${i})`,
).join(",\n  ");
out.push(`insert into public.diligence_template_items
  (template_id, item_key, category, name, needed_timeline, sensitive, critical_pre_signing, sort_order)
select (select id from public.diligence_templates where is_default limit 1),
       v.item_key, v.category, v.name, v.needed_timeline, v.sensitive, v.critical_pre_signing, v.sort_order
from (values
  ${itemRows}
) as v(item_key, category, name, needed_timeline, sensitive, critical_pre_signing, sort_order)
on conflict (template_id, item_key) do nothing;`);

// ── per-transaction request items (fan out: transactions × template_items) ───
out.push(`insert into public.diligence_request_items
  (transaction_id, template_item_key, category, name, needed_timeline, sensitive, critical_pre_signing, status)
select t.id, ti.item_key, ti.category, ti.name, ti.needed_timeline, ti.sensitive, ti.critical_pre_signing, 'Pending'::diligence_status
from public.transactions t
cross join public.diligence_template_items ti
where ti.template_id = (select id from public.diligence_templates where is_default limit 1)
  and not exists (
    select 1 from public.diligence_request_items r
    where r.transaction_id = t.id and r.template_item_key = ti.item_key
  );`);

console.log(out.join("\n\n"));
