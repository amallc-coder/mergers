import Link from "next/link";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { getRepository } from "@/lib/data/repository";

export default async function ContactsPage() {
  const repo = getRepository();
  const transactions = await repo.transactions();
  const contactLists = await Promise.all(transactions.map((t) => repo.contacts(t.id)));
  const txName = Object.fromEntries(transactions.map((t) => [t.id, t.practiceName]));
  const all = contactLists.flat();
  const external = all.filter((c) => c.type === "external");
  const internal = all.filter((c) => c.type === "internal");

  return (
    <>
      <PageHeader title="Contacts" subtitle={`${all.length} contact(s) across ${transactions.length} transactions`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContactCard title="Seller / External" contacts={external} txName={txName} />
        <ContactCard title="Internal deal team" contacts={internal} txName={txName} />
      </div>
    </>
  );
}

function ContactCard({
  title,
  contacts,
  txName,
}: {
  title: string;
  contacts: Awaited<ReturnType<ReturnType<typeof getRepository>["contacts"]>>;
  txName: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${contacts.length} contact(s)`} />
      <div className="divide-y divide-ink-100">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={c.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
                {c.primary ? <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">Primary</Badge> : null}
              </div>
              <p className="truncate text-xs text-ink-400">{c.role} · {c.email}</p>
            </div>
            <Link href={`/transactions/${c.transactionId}`} className="shrink-0 text-xs text-brand-600 hover:text-brand-700">
              {txName[c.transactionId]}
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
