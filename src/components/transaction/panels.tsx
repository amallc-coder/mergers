import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileText,
  FolderOpen,
  Lightbulb,
  ListChecks,
  Lock,
  MessageSquare,
  RefreshCw,
  Target,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  DealScoreBadge,
  EmptyState,
  KpiCard,
  ProgressBar,
  RiskBadge,
  StatPill,
} from "@/components/ui";
import { CATEGORY_META } from "@/lib/domain/diligence-template";
import { KPI_GROUPS, kpiByKey } from "@/lib/domain/kpi-definitions";
import type { MetricUnit } from "@/lib/domain/kpi-definitions";
import type { ExtractedMetric } from "@/lib/domain/types";
import type { TransactionView } from "@/lib/selectors";
import { cn } from "@/lib/ui";
import { formatDate, formatDateTime, formatMetricValue, relativeTime } from "@/lib/format";

type Names = Record<string, string>;

// ─────────────────────────── Overview ───────────────────────────

export function OverviewPanel({
  view,
  userNames,
  contactNames,
  nowIso,
}: {
  view: TransactionView;
  userNames: Names;
  contactNames: Names;
  nowIso: string;
}) {
  const { transaction: tx, deal, preStats, postStats, allStats, missing, execSummary } = view;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Snapshot */}
        <Card>
          <CardHeader title="Transaction overview" icon={<Target size={18} />} />
          <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
            <StatPill label="Practice" value={tx.practiceName} />
            <StatPill label="Specialty" value={tx.specialty} />
            <StatPill label="State" value={tx.state} />
            <StatPill label="Locations" value={tx.locationsCount} />
            <StatPill label="Providers" value={tx.providersCount} />
            <StatPill label="Stage" value={tx.stage} />
            <StatPill label="Coordinator" value={userNames[tx.assignedCoordinatorId] ?? "—"} />
            <StatPill label="Deal owner" value={userNames[tx.internalDealOwnerId] ?? "—"} />
            <StatPill
              label="Primary contact"
              value={tx.externalPrimaryContactId ? contactNames[tx.externalPrimaryContactId] ?? "—" : "—"}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 border-t border-ink-100 px-5 py-4 sm:grid-cols-3">
            <CompletionBlock label="Pre-signing" pct={preStats.completionPct} sub={`${preStats.received}/${preStats.total}`} />
            <CompletionBlock label="Post-signing" pct={postStats.completionPct} sub={`${postStats.received}/${postStats.total}`} />
            <CompletionBlock label="Overall" pct={allStats.completionPct} sub={`${allStats.received + allStats.notApplicable}/${allStats.total}`} />
          </div>
        </Card>

        {/* Deal health */}
        <Card>
          <CardHeader
            title="AI deal health score"
            subtitle="Computed from completion, financials, revenue cycle, and risk"
            action={<DealScoreBadge score={deal.score} />}
          />
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums text-ink-900">{deal.numericScore}</span>
              <span className="text-sm text-ink-400">/ 100</span>
              <RiskBadge level={deal.riskLevel} />
            </div>
            <p className="mb-4 text-sm text-ink-600">{deal.rationale}</p>
            <div className="space-y-2">
              {deal.factors.slice(0, 6).map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-xs text-ink-600" title={f.detail}>
                    {f.label}
                  </span>
                  <ProgressBar pct={f.contribution} className="flex-1" />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-400">{f.contribution}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Right rail: next action + missing */}
      <div className="space-y-6">
        <Card className="border-brand-200 bg-brand-50/40">
          <CardHeader title="Recommended next action" icon={<Lightbulb size={18} />} />
          <ul className="space-y-2 px-5 py-4">
            {execSummary.recommendedNextSteps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-700">
                <CircleDashed size={16} className="mt-0.5 shrink-0 text-brand-500" />
                {step}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Critical pre-signing gaps" icon={<AlertTriangle size={18} />} />
          {missing.criticalPreSigningGaps.length === 0 ? (
            <EmptyState title="None outstanding" hint="All critical pre-signing items received." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {missing.criticalPreSigningGaps.map((i) => (
                <li key={i.id} className="px-5 py-2.5 text-sm">
                  <span className="font-medium text-ink-800">{i.name}</span>
                  <span className="block text-xs text-ink-400">{CATEGORY_META[i.category].label}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function CompletionBlock({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className="text-xs tabular-nums text-ink-400">{sub}</span>
      </div>
      <ProgressBar pct={pct} showLabel />
    </div>
  );
}

// ─────────────────────────── Contacts ───────────────────────────

export function ContactsPanel({ view }: { view: TransactionView }) {
  const internal = view.contacts.filter((c) => c.type === "internal");
  const external = view.contacts.filter((c) => c.type === "external");
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ContactList title="External (Seller)" contacts={external} tone="external" />
      <ContactList title="Internal (Deal team)" contacts={internal} tone="internal" />
    </div>
  );
}

function ContactList({
  title,
  contacts,
  tone,
}: {
  title: string;
  contacts: TransactionView["contacts"];
  tone: "internal" | "external";
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${contacts.length} contact(s)`} />
      <div className="divide-y divide-ink-100">
        {contacts.length === 0 ? (
          <EmptyState title="No contacts" />
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
                  {c.primary ? (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">Primary</Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-ink-400">
                  {c.role} · {c.email}
                </p>
              </div>
              {c.phone ? <span className="text-xs text-ink-400">{c.phone}</span> : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────── Data room ───────────────────────────

export function DataRoomPanel({ view }: { view: TransactionView }) {
  const { folders, documents, transaction } = view;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader
            title="Data room folders"
            subtitle="Auto-generated structure"
            icon={<FolderOpen size={18} />}
            action={
              transaction.sharePointFolderUrl ? (
                <a
                  href={transaction.sharePointFolderUrl}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in SharePoint →
                </a>
              ) : null
            }
          />
          <div className="divide-y divide-ink-100">
            {folders.map((f) => {
              const total = f.preSigningCount + f.postSigningCount;
              return (
                <div key={f.category} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                      {CATEGORY_META[f.category].sensitive ? <Lock size={13} className="text-ink-400" /> : null}
                      {f.folderName}
                    </span>
                    <SyncDot status={f.sharePointSyncStatus} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-400">
                    <span>{total} items</span>
                    <span className="text-brand-600">{f.receivedCount} received</span>
                    <span className="text-ochre-600">{f.pendingCount} pending</span>
                    {f.deniedCount > 0 ? <span className="text-rust-600">{f.deniedCount} denied</span> : null}
                    {f.notApplicableCount > 0 ? <span>{f.notApplicableCount} N/A</span> : null}
                    {f.overdueCount > 0 ? <span className="text-rust-600">{f.overdueCount} overdue</span> : null}
                    {f.lastUploadDate ? <span>last upload {relativeTime(f.lastUploadDate)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card>
          <CardHeader title="Documents" subtitle={`${documents.length} file(s)`} icon={<FileText size={18} />} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">AI type</th>
                  <th className="px-3 py-2 font-medium">Conf.</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                  <th className="px-3 py-2 font-medium">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-2.5">
                      <a
                        href={d.sharePointUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-ink-800 hover:text-brand-600"
                      >
                        {d.fileName}
                      </a>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
                        <span>v{d.version}</span>
                        <span>· {CATEGORY_META[d.category].label}</span>
                        {(d.aiFlags ?? []).map((flag) => (
                          <span key={flag} className="rounded bg-rust-50 px-1 font-semibold text-rust-500">
                            {flag.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-600">{d.aiDocumentType ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-ink-600">
                      {d.aiConfidence !== undefined ? `${Math.round(d.aiConfidence * 100)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-600">{d.reviewStatus ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <SyncDot status={d.sharePointSyncStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SyncDot({ status }: { status: TransactionView["folders"][number]["sharePointSyncStatus"] }) {
  const map = {
    synced: { c: "bg-brand-500", t: "Synced" },
    pending: { c: "bg-ochre-500", t: "Pending" },
    error: { c: "bg-rust-500", t: "Error" },
    not_connected: { c: "bg-ink-300", t: "Not synced" },
  } as const;
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
      <span className={cn("h-2 w-2 rounded-full", m.c)} /> {m.t}
    </span>
  );
}

// ─────────────────────────── AI summary ───────────────────────────

export function AiSummaryPanel({ view }: { view: TransactionView }) {
  const s = view.execSummary;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader
            title="Executive summary"
            subtitle={`Auto-generated · ${formatDateTime(s.generatedAt)}`}
            icon={<FileText size={18} />}
          />
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-700">{s.practiceOverview}</p>
            {s.sections.map((sec) => (
              <div key={sec.heading}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{sec.heading}</h4>
                <p className="mt-1 text-sm leading-relaxed text-ink-700">{sec.body}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <ListCard title="Missing documents" icon={<ListChecks size={18} />} items={s.missingDocuments} tone="warn" empty="Nothing missing" />
        <ListCard title="Risk flags" icon={<AlertTriangle size={18} />} items={s.riskFlags} tone="bad" empty="No risks flagged" />
        <ListCard title="Opportunities" icon={<Lightbulb size={18} />} items={s.opportunities} tone="good" empty="—" />
        <ListCard title="Recommended next steps" icon={<Target size={18} />} items={s.recommendedNextSteps} tone="brand" empty="—" />
      </div>
    </div>
  );
}

function ListCard({
  title,
  icon,
  items,
  tone,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "warn" | "bad" | "good" | "brand";
  empty: string;
}) {
  const dot =
    tone === "bad" ? "text-rust-500" : tone === "warn" ? "text-ochre-500" : tone === "good" ? "text-brand-500" : "text-brand-500";
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="space-y-2 px-5 py-4">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-700">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current", dot)} />
              {it}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─────────────────────────── KPI dashboard ───────────────────────────

function dedupeMetrics(metrics: ExtractedMetric[]): ExtractedMetric[] {
  const byKey = new Map<string, ExtractedMetric>();
  for (const m of metrics) {
    const existing = byKey.get(m.metricKey);
    if (!existing || (existing.source === "ai" && m.source === "human")) byKey.set(m.metricKey, m);
  }
  return [...byKey.values()];
}

export function KpiDashboardPanel({ view }: { view: TransactionView }) {
  const metrics = dedupeMetrics(view.metrics);
  const byGroup = new Map<string, ExtractedMetric[]>();
  for (const m of metrics) {
    const def = kpiByKey(m.metricKey);
    const group = def?.group ?? "Financial";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(m);
  }

  const groupsWithData = KPI_GROUPS.filter((g) => byGroup.has(g));
  if (groupsWithData.length === 0) {
    return <EmptyState title="No KPIs extracted yet" hint="Upload financial and revenue-cycle documents to populate the dashboard." />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-ink-200 bg-panel px-4 py-2.5 text-xs text-ink-500">
        <span className="font-medium text-ink-700">{metrics.length}</span> metrics extracted ·{" "}
        <span className="text-brand-600">{metrics.filter((m) => m.source === "human").length}</span> human-reviewed ·{" "}
        <span className="text-ochre-600">{metrics.filter((m) => m.requiresHumanReview).length}</span> need review. Every value cites a source document.
      </div>
      {groupsWithData.map((group) => (
        <div key={group}>
          <h3 className="mb-2 text-sm font-semibold text-ink-700">{group} KPIs</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {byGroup.get(group)!.map((m) => {
              const def = kpiByKey(m.metricKey);
              const unit = (def?.unit ?? (m.metricUnit as MetricUnit)) as MetricUnit;
              return (
                <KpiCard
                  key={m.id}
                  label={`${def?.name ?? m.metricName}${m.period ? ` · ${m.period}` : ""}`}
                  value={formatMetricValue(m.metricValue, unit)}
                  citation={m.sourceDocumentName}
                  confidence={m.source === "human" ? undefined : m.confidenceScore}
                  needsReview={m.requiresHumanReview}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Tasks ───────────────────────────

export function TasksPanel({ view, userNames }: { view: TransactionView; userNames: Names }) {
  const order = { in_progress: 0, open: 1, blocked: 2, done: 3 } as const;
  const tasks = [...view.tasks].sort((a, b) => order[a.status] - order[b.status]);
  const icon = {
    open: <CircleDashed size={16} className="text-ink-400" />,
    in_progress: <RefreshCw size={16} className="text-brand-500" />,
    blocked: <XCircle size={16} className="text-rust-500" />,
    done: <CheckCircle2 size={16} className="text-brand-500" />,
  };
  return (
    <Card>
      <CardHeader title="Tasks" subtitle={`${tasks.length} task(s)`} icon={<ListChecks size={18} />} />
      {tasks.length === 0 ? (
        <EmptyState title="No tasks" />
      ) : (
        <div className="divide-y divide-ink-100">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-5 py-3">
              {icon[t.status]}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", t.status === "done" ? "text-ink-400 line-through" : "text-ink-800")}>
                  {t.title}
                </p>
                {t.description ? <p className="text-xs text-ink-400">{t.description}</p> : null}
              </div>
              <div className="shrink-0 text-right">
                {t.assigneeId ? <p className="text-xs text-ink-600">{userNames[t.assigneeId] ?? "—"}</p> : null}
                {t.dueDate ? <p className="text-[11px] text-ink-400">due {formatDate(t.dueDate)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── Meetings ───────────────────────────

export function MeetingsPanel({ view, contactNames }: { view: TransactionView; contactNames: Names }) {
  const meetings = [...view.meetings].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return (
    <Card>
      <CardHeader title="Meetings" subtitle="Outlook-synced" icon={<CalendarClock size={18} />} />
      {meetings.length === 0 ? (
        <EmptyState title="No meetings scheduled" />
      ) : (
        <div className="divide-y divide-ink-100">
          {meetings.map((m) => (
            <div key={m.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink-900">{m.title}</p>
                <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{m.type}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">
                {formatDateTime(m.start)}
                {m.attendeeContactIds.length
                  ? ` · ${m.attendeeContactIds.map((id) => contactNames[id] ?? "Internal").join(", ")}`
                  : ""}
              </p>
              {m.agenda.length ? (
                <ul className="mt-2 space-y-0.5">
                  {m.agenda.map((a, i) => (
                    <li key={i} className="text-xs text-ink-500">
                      • {a}
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.onlineMeetingUrl ? (
                <a href={m.onlineMeetingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                  Join Teams meeting →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── Activity ───────────────────────────

export function ActivityPanel({ view }: { view: TransactionView }) {
  return (
    <Card>
      <CardHeader title="Activity timeline" icon={<RefreshCw size={18} />} />
      <ol className="relative px-5 py-4">
        {view.activity.map((a, idx) => (
          <li key={a.id} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-400" />
              {idx < view.activity.length - 1 ? <span className="w-px flex-1 bg-ink-200" /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm text-ink-800">{a.summary}</p>
              <p className="text-xs text-ink-400">
                {a.actorName} · {formatDateTime(a.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─────────────────────────── Internal notes ───────────────────────────

export function InternalNotesPanel({ view, userNames }: { view: TransactionView; userNames: Names }) {
  const internal = view.comments.filter((c) => c.visibility === "internal");
  const sellerFacing = view.comments.filter((c) => c.visibility === "seller_facing");
  const itemNotes = view.requestItems
    .filter((i) => i.internalNotes.length > 0)
    .flatMap((i) => i.internalNotes.map((n) => ({ item: i.name, note: n })));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Internal notes & comments" subtitle="Never visible to the seller" icon={<Lock size={18} />} />
        <div className="divide-y divide-ink-100">
          {internal.length === 0 && itemNotes.length === 0 ? (
            <EmptyState title="No internal notes" />
          ) : (
            <>
              {internal.map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <p className="text-sm text-ink-800">{c.body}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {c.authorName} · {formatDateTime(c.createdAt)}
                  </p>
                </div>
              ))}
              {itemNotes.map((n, i) => (
                <div key={`n-${i}`} className="px-5 py-3">
                  <p className="text-sm text-ink-700">{n.note}</p>
                  <p className="mt-0.5 text-xs text-ink-400">on “{n.item}”</p>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Seller-facing thread" subtitle="Shared with the seller" icon={<MessageSquare size={18} />} />
        <div className="divide-y divide-ink-100">
          {sellerFacing.length === 0 ? (
            <EmptyState title="No seller-facing messages" />
          ) : (
            sellerFacing.map((c) => (
              <div key={c.id} className="px-5 py-3">
                <p className="text-sm text-ink-800">{c.body}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {c.authorName} ({c.authorType}) · {formatDateTime(c.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────── Risk log ───────────────────────────

export function RiskLogPanel({ view }: { view: TransactionView }) {
  return (
    <Card>
      <CardHeader title="Risk log" subtitle={`${view.riskFlags.length} flag(s)`} icon={<AlertTriangle size={18} />} />
      {view.riskFlags.length === 0 ? (
        <EmptyState title="No risks flagged" />
      ) : (
        <div className="divide-y divide-ink-100">
          {view.riskFlags.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
              <RiskBadge level={r.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{r.title}</p>
                <p className="text-xs text-ink-500">{r.detail}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">{CATEGORY_META[r.category].label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── SharePoint sync log ───────────────────────────

export function SharePointSyncPanel({ view }: { view: TransactionView }) {
  return (
    <Card>
      <CardHeader
        title="SharePoint sync log"
        subtitle="Document ↔ Microsoft Graph driveItem mapping"
        icon={<RefreshCw size={18} />}
        action={
          view.transaction.sharePointFolderUrl ? (
            <a href={view.transaction.sharePointFolderUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Open site →
            </a>
          ) : null
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">driveItem ID</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {view.documents.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5 text-ink-800">{d.fileName}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-500">{d.sharePointFileId ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <SyncDot status={d.sharePointSyncStatus} />
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-400">{relativeTime(d.uploadedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
