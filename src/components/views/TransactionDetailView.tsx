"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Share2 } from "lucide-react";
import { DealScoreBadge, RiskBadge, ProgressBar } from "@/components/ui";
import { Tabs, type TabDef } from "@/components/Tabs";
import { DiligenceTracker } from "@/components/transaction/DiligenceTracker";
import { AiAssistant } from "@/components/transaction/AiAssistant";
import { DealMessages } from "@/components/messaging/DealMessages";
import {
  ActivityPanel,
  AiSummaryPanel,
  ContactsPanel,
  DataRoomPanel,
  InternalNotesPanel,
  KpiDashboardPanel,
  MeetingsPanel,
  OverviewPanel,
  RiskLogPanel,
  SharePointSyncPanel,
  TasksPanel,
} from "@/components/transaction/panels";
import { useState } from "react";
import { useData, useRepoData } from "@/lib/data/DataProvider";
import { getTransactionViewWith } from "@/lib/selectors";
import { NOW } from "@/lib/data/seed";
import { ViewLoading } from "./shared";

export function TransactionDetailView({ id }: { id: string }) {
  const { data, loading } = useRepoData(async (repo) => {
    const view = await getTransactionViewWith(repo, id);
    if (!view) return null;
    const [users, sellerPortalUsers] = await Promise.all([repo.users(), repo.sellerPortalUsers()]);
    return { view, users, sellerPortalUsers };
  });

  if (loading) return <ViewLoading label="Loading transaction…" />;

  if (!data || !data.view) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-ink-500">Transaction not found.</p>
        <Link href="/transactions" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          ← All transactions
        </Link>
      </div>
    );
  }

  const { view, users, sellerPortalUsers } = data;
  const userNames: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const contactNames: Record<string, string> = Object.fromEntries(view.contacts.map((c) => [c.id, c.name]));
  const sellerLink = sellerPortalUsers.find((s) => s.transactionId === view.transaction.id);

  const riskNarrative =
    view.riskFlags.map((r) => `${r.title}: ${r.detail}`).join(" ") + " " + view.missing.narrative;

  const nowIso = NOW.toISOString();
  const tx = view.transaction;

  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", content: <OverviewPanel view={view} userNames={userNames} contactNames={contactNames} nowIso={nowIso} /> },
    { key: "contacts", label: "Contacts", badge: view.contacts.length, content: <ContactsPanel view={view} /> },
    { key: "dataroom", label: "Data Room", badge: view.documents.length, content: <DataRoomPanel view={view} /> },
    {
      key: "diligence",
      label: "Diligence Tracker",
      badge: view.missing.pendingPreSigning.length,
      content: (
        <DiligenceTracker
          items={view.requestItems}
          nowIso={nowIso}
          reviewerNames={userNames}
          contactNames={contactNames}
        />
      ),
    },
    { key: "summary", label: "AI Summary", content: <AiSummaryPanel view={view} /> },
    { key: "kpi", label: "KPI Dashboard", badge: view.metrics.length, content: <KpiDashboardPanel view={view} /> },
    {
      key: "assistant",
      label: "AI Assistant",
      content: (
        <AiAssistant
          transaction={tx}
          items={view.requestItems}
          documents={view.documents}
          metrics={view.metrics}
          riskNarrative={riskNarrative}
          nowIso={nowIso}
        />
      ),
    },
    {
      key: "messages",
      label: "Messages",
      content: (
        <div className="rounded-panel border border-ink-100 bg-paper p-4">
          <DealMessages transactionId={tx.id} practiceName={tx.practiceName} />
        </div>
      ),
    },
    { key: "tasks", label: "Tasks", badge: view.tasks.filter((t) => t.status !== "done").length, content: <TasksPanel view={view} userNames={userNames} /> },
    { key: "meetings", label: "Meetings", badge: view.meetings.length, content: <MeetingsPanel view={view} contactNames={contactNames} /> },
    { key: "activity", label: "Activity Timeline", content: <ActivityPanel view={view} /> },
    { key: "notes", label: "Internal Notes", content: <InternalNotesPanel view={view} userNames={userNames} /> },
    { key: "risk", label: "Risk Log", badge: view.riskFlags.length, content: <RiskLogPanel view={view} /> },
    { key: "sharepoint", label: "SharePoint Sync", content: <SharePointSyncPanel view={view} /> },
  ];

  return (
    <>
      <Link
        href="/transactions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft size={16} /> All transactions
      </Link>

      <div className="mb-6 rounded-xl border border-ink-200 bg-panel p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-ink-900">{tx.practiceName}</h1>
              <DealScoreBadge score={view.deal.score} />
              <RiskBadge level={tx.riskLevel} />
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {[tx.name, tx.specialty, tx.locationsCount ? `${tx.locationsCount} location(s)` : null, tx.providersCount ? `${tx.providersCount} provider(s)` : null, tx.state]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <StageControl transactionId={tx.id} stage={tx.stage} stageEnteredAt={tx.stageEnteredAt} />
          </div>
          <div className="flex items-center gap-2">
            {sellerLink ? (
              <Link
                href={`/portal/${sellerLink.accessToken}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                <Share2 size={15} /> Seller portal
              </Link>
            ) : null}
            {tx.sharePointFolderUrl ? (
              <a
                href={tx.sharePointFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                <ExternalLink size={15} /> SharePoint
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <HeaderProgress label="Pre-signing" pct={view.preStats.completionPct} />
          <HeaderProgress label="Post-signing" pct={view.postStats.completionPct} />
          <HeaderProgress label="Overall" pct={view.allStats.completionPct} />
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}

/** Stage selector + time-in-stage. Editable on the live backend; read-only in
 *  sample mode. Persists via setStage (audit log + stage history). */
function StageControl({
  transactionId,
  stage,
  stageEnteredAt,
}: {
  transactionId: string;
  stage: string;
  stageEnteredAt?: string;
}) {
  const { pipelineStages, source, setStage } = useData();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = source === "live";

  const days = stageEnteredAt
    ? Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000))
    : null;
  const inStage = days === null ? null : days === 0 ? "today" : `${days}d in stage`;

  async function onChange(next: string) {
    setErr(null);
    setSaving(true);
    try {
      await setStage(transactionId, next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-400">Stage:</span>
      {live ? (
        <select
          value={stage}
          disabled={saving}
          onChange={(e) => void onChange(e.target.value)}
          className="rounded-lg border border-ink-200 bg-panel px-2 py-1 text-xs font-medium text-ink-700"
        >
          {[...pipelineStages]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => (
              <option key={s.key} value={s.label}>
                {s.label}
              </option>
            ))}
        </select>
      ) : (
        <span className="text-xs font-medium text-ink-700">{stage}</span>
      )}
      {inStage && <span className="text-xs text-ink-400">· {inStage}</span>}
      {saving && <span className="text-xs text-ink-400">saving…</span>}
      {err && <span className="text-xs text-amber-600">{err}</span>}
    </div>
  );
}

function HeaderProgress({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-500">{label}</span>
        <span className="tabular-nums text-ink-400">{pct}%</span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}
