import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Share2 } from "lucide-react";
import { DealScoreBadge, RiskBadge, ProgressBar } from "@/components/ui";
import { Tabs, type TabDef } from "@/components/Tabs";
import { DiligenceTracker } from "@/components/transaction/DiligenceTracker";
import { AiAssistant } from "@/components/transaction/AiAssistant";
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
import { getRepository } from "@/lib/data/repository";
import { getTransactionView } from "@/lib/selectors";
import { NOW } from "@/lib/data/seed";

export const dynamicParams = false;

export async function generateStaticParams() {
  const repo = getRepository();
  const transactions = await repo.transactions();
  return transactions.map((t) => ({ id: t.id }));
}

export default async function TransactionDetailPage({ params }: { params: { id: string } }) {
  const view = await getTransactionView(params.id);
  if (!view) notFound();

  const repo = getRepository();
  const [users, sellerPortalUsers] = await Promise.all([repo.users(), repo.sellerPortalUsers()]);
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

      {/* Header */}
      <div className="mb-6 rounded-xl border border-ink-200 bg-panel p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-ink-900">{tx.practiceName}</h1>
              <DealScoreBadge score={view.deal.score} />
              <RiskBadge level={tx.riskLevel} />
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {tx.name} · {tx.specialty} · {tx.locationsCount} location(s) · {tx.providersCount} provider(s) · {tx.state}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">Stage: {tx.stage}</p>
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
