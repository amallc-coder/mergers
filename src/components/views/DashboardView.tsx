"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  FileUp,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardHeader,
  DealScoreBadge,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { useRepoData } from "@/lib/data/DataProvider";
import { getTransactionSummariesWith } from "@/lib/selectors";
import { NOW } from "@/lib/data/seed";
import { TERMINAL_STAGES } from "@/lib/domain/types";
import { formatDateTime, relativeTime } from "@/lib/format";
import { SourceBadge, txHref, ViewLoading } from "./shared";

export function DashboardView() {
  const { data, loading, source } = useRepoData(async (repo) => {
    const [summaries, meetings, activity, transactions] = await Promise.all([
      getTransactionSummariesWith(repo),
      repo.meetings(),
      repo.activity(),
      repo.transactions(),
    ]);
    const docArrays = await Promise.all(transactions.map((t) => repo.documents(t.id)));
    return { summaries, meetings, activity, transactions, documents: docArrays.flat() };
  });

  if (!data || loading) {
    return (
      <>
        <PageHeader title="Global Dashboard" subtitle="Pipeline health across all active healthcare acquisition transactions." />
        <ViewLoading label="Loading dashboard…" />
      </>
    );
  }

  const { summaries, meetings, activity, transactions, documents } = data;
  const active = summaries.filter((s) => !TERMINAL_STAGES.includes(s.transaction.stage));
  const avgPre =
    active.length > 0
      ? Math.round(active.reduce((s, t) => s + t.preStats.completionPct, 0) / active.length)
      : 0;
  const totalOverdue = summaries.reduce((s, t) => s + t.overdue, 0);
  const highRisk = summaries.filter(
    (s) => s.deal.score === "High Risk" || s.deal.riskLevel === "High" || s.deal.riskLevel === "Elevated",
  );
  const upcomingMeetings = meetings
    .filter((m) => new Date(m.start) >= NOW)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const aiUpdates = activity
    .filter((a) => ["ai_summary_updated", "kpi_updated", "high_risk_detected"].includes(a.type))
    .slice(0, 6);
  const recentUploads = [...documents]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);
  const stageCounts = new Map<string, number>();
  for (const s of active) stageCounts.set(s.transaction.stage, (stageCounts.get(s.transaction.stage) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Global Dashboard"
        subtitle="Pipeline health across all active healthcare acquisition transactions."
      />

      <div className="mb-3">
        <SourceBadge source={source} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Active deals" value={active.length} sub={`${transactions.length} total`} />
        <StatCard label="Avg pre-signing" value={`${avgPre}%`} tone={avgPre >= 60 ? "good" : "warn"} />
        <StatCard label="Overdue items" value={totalOverdue} tone={totalOverdue > 0 ? "bad" : "good"} />
        <StatCard label="High-risk deals" value={highRisk.length} tone={highRisk.length > 0 ? "warn" : "good"} />
        <StatCard label="Upcoming meetings" value={upcomingMeetings.length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Transaction pipeline"
              subtitle="Pre-signing completion and deal health by transaction"
              icon={<TrendingUp size={18} />}
              action={
                <Link href="/transactions" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View all →
                </Link>
              }
            />
            <div className="divide-y divide-ink-100">
              {summaries.map((s) => (
                <Link
                  key={s.transaction.id}
                  href={txHref(s.transaction.id)}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink-900">{s.transaction.practiceName}</p>
                      {s.criticalGaps > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-rust-50 px-1.5 py-0.5 text-[10px] font-semibold text-rust-600">
                          <AlertTriangle size={10} /> {s.criticalGaps} critical
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-ink-400">
                      {[s.transaction.specialty, s.transaction.locationsCount ? `${s.transaction.locationsCount} loc` : null, s.transaction.stage]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <ProgressBar pct={s.preStats.completionPct} showLabel />
                  </div>
                  <DealScoreBadge score={s.deal.score} />
                  <ArrowUpRight size={16} className="text-ink-300" />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader title="Active deals by stage" />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {[...stageCounts.entries()].map(([stage, count]) => (
                <span
                  key={stage}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-700"
                >
                  {stage}
                  <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Leadership digest" subtitle="Recent AI updates" icon={<Sparkles size={18} />} />
            <div className="divide-y divide-ink-100">
              {aiUpdates.length === 0 ? (
                <EmptyState title="No AI updates yet" />
              ) : (
                aiUpdates.map((a) => (
                  <div key={a.id} className="px-5 py-3">
                    <p className="text-sm text-ink-800">{a.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {a.actorName} · {relativeTime(a.createdAt, NOW)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming meetings" icon={<CalendarClock size={18} />} />
            <div className="divide-y divide-ink-100">
              {upcomingMeetings.length === 0 ? (
                <EmptyState title="Nothing scheduled" />
              ) : (
                upcomingMeetings.map((m) => (
                  <div key={m.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-ink-800">{m.type}</p>
                    <p className="truncate text-xs text-ink-500">{m.title}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(m.start)}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent uploads" icon={<FileUp size={18} />} />
            <div className="divide-y divide-ink-100">
              {recentUploads.length === 0 ? (
                <EmptyState title="No uploads yet" />
              ) : (
                recentUploads.map((d) => (
                  <div key={d.id} className="px-5 py-2.5">
                    <p className="truncate text-sm text-ink-800">{d.fileName}</p>
                    <p className="text-xs text-ink-400">
                      {d.uploadedBy} · {relativeTime(d.uploadedAt, NOW)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
