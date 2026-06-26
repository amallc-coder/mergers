import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { getTransactionSummaries } from "@/lib/selectors";

export default async function DiligenceOverviewPage() {
  const summaries = await getTransactionSummaries();
  const totalCritical = summaries.reduce((s, t) => s + t.criticalGaps, 0);
  const totalOverdue = summaries.reduce((s, t) => s + t.overdue, 0);
  const totalPending = summaries.reduce((s, t) => s + t.preStats.pending + t.postStats.pending, 0);

  return (
    <>
      <PageHeader title="Diligence Requests" subtitle="Request completion and gaps across all transactions" />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Open transactions" value={summaries.length} />
        <StatCard label="Pending items" value={totalPending} tone="warn" />
        <StatCard label="Critical gaps" value={totalCritical} tone={totalCritical ? "bad" : "good"} />
        <StatCard label="Overdue" value={totalOverdue} tone={totalOverdue ? "bad" : "good"} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-5 py-3 font-medium">Transaction</th>
                <th className="w-44 px-3 py-3 font-medium">Pre-signing</th>
                <th className="w-44 px-3 py-3 font-medium">Post-signing</th>
                <th className="px-3 py-3 text-center font-medium">Critical gaps</th>
                <th className="px-3 py-3 text-center font-medium">Overdue</th>
                <th className="px-3 py-3 text-center font-medium">Pending</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {summaries.map((s) => (
                <tr key={s.transaction.id} className="hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink-900">{s.transaction.practiceName}</p>
                    <p className="text-xs text-ink-400">{s.transaction.stage}</p>
                  </td>
                  <td className="px-3 py-3"><ProgressBar pct={s.preStats.completionPct} showLabel /></td>
                  <td className="px-3 py-3"><ProgressBar pct={s.postStats.completionPct} showLabel /></td>
                  <td className="px-3 py-3 text-center">
                    {s.criticalGaps > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600">
                        <AlertTriangle size={12} /> {s.criticalGaps}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs tabular-nums">
                    {s.overdue > 0 ? <span className="font-semibold text-rose-600">{s.overdue}</span> : <span className="text-ink-300">0</span>}
                  </td>
                  <td className="px-3 py-3 text-center text-xs tabular-nums text-ink-600">
                    {s.preStats.pending + s.postStats.pending}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/transactions/${s.transaction.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      Open tracker →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
