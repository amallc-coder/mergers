import Link from "next/link";
import { CheckCircle2, CircleDashed, RefreshCw, XCircle } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { getRepository } from "@/lib/data/repository";
import { formatDate } from "@/lib/format";

export default async function TasksPage() {
  const repo = getRepository();
  const [tasks, transactions, users] = await Promise.all([
    repo.tasks(),
    repo.transactions(),
    repo.users(),
  ]);
  const txName = Object.fromEntries(transactions.map((t) => [t.id, t.practiceName]));
  const userName = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const groups: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "in_progress", label: "In progress", icon: <RefreshCw size={15} className="text-brand-500" /> },
    { key: "open", label: "Open", icon: <CircleDashed size={15} className="text-ink-400" /> },
    { key: "blocked", label: "Blocked", icon: <XCircle size={15} className="text-rose-500" /> },
    { key: "done", label: "Done", icon: <CheckCircle2 size={15} className="text-emerald-500" /> },
  ];

  return (
    <>
      <PageHeader title="Tasks" subtitle="Internal diligence tasks across all transactions" />
      <div className="space-y-6">
        {groups.map((g) => {
          const rows = tasks.filter((t) => t.status === g.key);
          return (
            <Card key={g.key}>
              <CardHeader title={<span className="flex items-center gap-2">{g.icon} {g.label}</span>} subtitle={`${rows.length} task(s)`} />
              {rows.length === 0 ? (
                <EmptyState title="Nothing here" />
              ) : (
                <div className="divide-y divide-ink-100">
                  {rows.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-800">{t.title}</p>
                        <Link href={`/transactions/${t.transactionId}`} className="text-xs text-brand-600 hover:text-brand-700">
                          {txName[t.transactionId]}
                        </Link>
                      </div>
                      {t.assigneeId ? <span className="text-xs text-ink-500">{userName[t.assigneeId]}</span> : null}
                      {t.dueDate ? <span className="text-[11px] text-ink-400">due {formatDate(t.dueDate)}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
