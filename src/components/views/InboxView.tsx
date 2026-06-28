"use client";

/** Inbox — every transaction's message thread in one place. Left: deals with
 *  activity (unread first); right: the selected deal's thread + composer. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useData, useRepoData } from "@/lib/data/DataProvider";
import { DealMessages } from "@/components/messaging/DealMessages";
import { formatDateTime } from "@/lib/format";
import type { Transaction } from "@/lib/domain/types";
import { SourceBadge, txHref, ViewLoading } from "./shared";

export function InboxView() {
  const { source, messages, awaitingLive } = useData();
  const { data: txs, loading } = useRepoData((repo) => repo.transactions());
  const [selected, setSelected] = useState<string | null>(null);

  const txById = useMemo(() => Object.fromEntries((txs ?? []).map((t) => [t.id, t])), [txs]);

  // One row per transaction that has messages, newest activity first.
  const threads = useMemo(() => {
    const byTx = new Map<string, { last: string; count: number; unread: number }>();
    for (const m of messages) {
      const e = byTx.get(m.transactionId) ?? { last: m.createdAt, count: 0, unread: 0 };
      e.count += 1;
      if (m.createdAt > e.last) e.last = m.createdAt;
      if (m.direction === "from_seller" && !m.readAt) e.unread += 1;
      byTx.set(m.transactionId, e);
    }
    return [...byTx.entries()]
      .map(([transactionId, v]) => ({ transactionId, ...v, tx: txById[transactionId] as Transaction | undefined }))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [messages, txById]);

  useEffect(() => {
    if (!selected && threads.length) setSelected(threads[0].transactionId);
  }, [threads, selected]);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  if (!txs || loading || awaitingLive) {
    return (
      <>
        <PageHeader title="Inbox" subtitle="Clarifications and seller correspondence across all deals" />
        <ViewLoading label="Loading inbox…" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={`${threads.length} active thread(s)${totalUnread ? ` · ${totalUnread} unread` : ""}`}
      />
      <div className="mb-3"><SourceBadge source={source} /></div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <Card className="h-fit overflow-hidden">
          {threads.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-400">
              No messages yet. Open a deal and raise a clarification to start a thread.
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {threads.map((t) => (
                <button
                  key={t.transactionId}
                  onClick={() => setSelected(t.transactionId)}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-ink-50 ${selected === t.transactionId ? "bg-ink-50" : ""}`}
                >
                  <Mail size={14} className="shrink-0 text-ink-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{t.tx?.practiceName ?? "Deal"}</p>
                    <p className="text-[11px] text-ink-400">{t.count} message(s) · {formatDateTime(t.last)}</p>
                  </div>
                  {t.unread > 0 && <span className="count-badge">{t.unread}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Selected thread */}
        <Card className="p-4">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink-900">{txById[selected]?.practiceName ?? "Deal"}</h2>
                <Link href={txHref(selected)} className="text-xs font-medium text-brand-700 hover:text-brand-800">
                  Open deal →
                </Link>
              </div>
              <DealMessages transactionId={selected} practiceName={txById[selected]?.practiceName} />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-ink-400">Select a thread.</p>
          )}
        </Card>
      </div>
    </>
  );
}
