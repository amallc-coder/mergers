import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { getRepository } from "@/lib/data/repository";
import { NOW } from "@/lib/data/seed";
import { formatDateTime } from "@/lib/format";

export default async function CalendarPage() {
  const repo = getRepository();
  const [meetings, transactions] = await Promise.all([repo.meetings(), repo.transactions()]);
  const txName = Object.fromEntries(transactions.map((t) => [t.id, t.practiceName]));

  const sorted = [...meetings].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const upcoming = sorted.filter((m) => new Date(m.start) >= NOW);
  const past = sorted.filter((m) => new Date(m.start) < NOW);

  return (
    <>
      <PageHeader title="Calendar" subtitle="Outlook-synced diligence meetings across transactions" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming" icon={<CalendarClock size={18} />} subtitle={`${upcoming.length} meeting(s)`} />
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" />
          ) : (
            <div className="divide-y divide-ink-100">
              {upcoming.map((m) => (
                <div key={m.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">{m.title}</p>
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{m.type}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(m.start)}</p>
                  <Link href={`/transactions/${m.transactionId}`} className="text-xs text-brand-600 hover:text-brand-700">
                    {txName[m.transactionId]}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Past" subtitle={`${past.length} meeting(s)`} />
          {past.length === 0 ? (
            <EmptyState title="No past meetings" />
          ) : (
            <div className="divide-y divide-ink-100">
              {past.map((m) => (
                <div key={m.id} className="px-5 py-3">
                  <p className="text-sm text-ink-700">{m.title}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(m.start)} · {txName[m.transactionId]}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
