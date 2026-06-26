import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { Card, DealScoreBadge, PageHeader, ProgressBar, RiskBadge } from "@/components/ui";
import { getTransactionSummaries } from "@/lib/selectors";
import { formatDate } from "@/lib/format";

export default async function TransactionsPage() {
  const summaries = await getTransactionSummaries();

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${summaries.length} acquisition candidate(s)`}
        action={
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            <Plus size={16} /> New transaction
          </button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-5 py-3 font-medium">Practice</th>
                <th className="px-3 py-3 font-medium">Stage</th>
                <th className="px-3 py-3 font-medium">Deal score</th>
                <th className="px-3 py-3 font-medium">Risk</th>
                <th className="w-44 px-3 py-3 font-medium">Pre-signing</th>
                <th className="px-3 py-3 text-center font-medium">Gaps</th>
                <th className="px-3 py-3 text-center font-medium">Overdue</th>
                <th className="px-3 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {summaries.map((s) => (
                <tr key={s.transaction.id} className="group hover:bg-ink-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/transactions/${s.transaction.id}`} className="block">
                      <span className="font-medium text-ink-900 group-hover:text-brand-700">
                        {s.transaction.practiceName}
                      </span>
                      <span className="block text-xs text-ink-400">
                        {s.transaction.specialty} · {s.transaction.state} · {s.transaction.locationsCount} loc · {s.transaction.providersCount} prov
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-600">{s.transaction.stage}</td>
                  <td className="px-3 py-3">
                    <DealScoreBadge score={s.deal.score} />
                  </td>
                  <td className="px-3 py-3">
                    <RiskBadge level={s.transaction.riskLevel} />
                  </td>
                  <td className="px-3 py-3">
                    <ProgressBar pct={s.preStats.completionPct} showLabel />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {s.criticalGaps > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rust-600">
                        <AlertTriangle size={12} /> {s.criticalGaps}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs tabular-nums text-ink-600">
                    {s.overdue > 0 ? <span className="font-semibold text-rust-600">{s.overdue}</span> : "0"}
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-400">{formatDate(s.transaction.lastActivityDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
