"use client";

/** The seller↔buyer message thread for one transaction: detected KPI anomalies
 *  (with one-click "raise clarification"), the conversation, and a composer.
 *  Used both in the Inbox and on the transaction detail. */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Send, Sparkles } from "lucide-react";
import { useData } from "@/lib/data/DataProvider";
import { detectKpiAnomalies, type KpiAnomaly } from "@/lib/domain/analytics";
import type { ExtractedMetric } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

export function DealMessages({ transactionId, practiceName }: { transactionId: string; practiceName?: string }) {
  const { source, messages, people, contactLinks, repo, postMessage, raiseClarification, markMessagesRead } = useData();
  const live = source === "live";
  const [metrics, setMetrics] = useState<ExtractedMetric[] | null>(null);
  const [draft, setDraft] = useState("");
  const [toSeller, setToSeller] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void repo.metrics(transactionId).then((m) => !c && setMetrics(m));
    return () => { c = true; };
  }, [repo, transactionId]);

  // Mark the thread read on open (live only).
  useEffect(() => {
    const hasUnread = messages.some((m) => m.transactionId === transactionId && m.direction === "from_seller" && !m.readAt);
    if (live && hasUnread) void markMessagesRead(transactionId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  const thread = useMemo(
    () => messages.filter((m) => m.transactionId === transactionId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, transactionId],
  );
  const anomalies = useMemo(() => (metrics ? detectKpiAnomalies(metrics) : []), [metrics]);

  // The seller/external contact to address clarifications to.
  const seller = useMemo(() => {
    const linkIds = contactLinks.filter((l) => l.transactionId === transactionId).map((l) => l.contactId);
    const linked = people.filter((p) => linkIds.includes(p.id));
    return linked.find((p) => p.type === "seller") ?? linked.find((p) => p.type === "external") ?? linked[0];
  }, [people, contactLinks, transactionId]);

  async function run(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    await run(async () => {
      await postMessage({
        transactionId, body,
        direction: toSeller ? "to_seller" : "internal",
        toEmail: toSeller ? seller?.email : undefined,
        toName: toSeller ? seller?.name : undefined,
        contactId: toSeller ? seller?.id : undefined,
      });
      setDraft("");
    });
  }

  async function raise(a: KpiAnomaly) {
    await run(() =>
      raiseClarification({
        transactionId,
        question: a.suggestedQuestion,
        title: `Clarify: ${a.label}`,
        metricKey: a.metricKey,
        category: a.category,
        toEmail: seller?.email,
        toName: seller?.name,
        contactId: seller?.id,
      }),
    );
  }

  return (
    <div className="space-y-4">
      {/* Anomalies → clarification */}
      {anomalies.length > 0 && (
        <div className="rounded-panel border border-ochre-200 bg-ochre-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ochre-600">
            <Sparkles size={13} /> {anomalies.length} figure(s) look off-market — dig in before relying on them
          </p>
          <div className="space-y-2">
            {anomalies.map((a) => (
              <div key={a.metricKey} className="flex flex-wrap items-start gap-2 rounded-lg border border-ochre-200 bg-panel px-3 py-2">
                <AlertTriangle size={13} className={a.severity === "warn" ? "mt-0.5 text-rust-500" : "mt-0.5 text-ochre-500"} />
                <p className="min-w-0 flex-1 text-xs text-ink-700">{a.message}</p>
                {live && (
                  <button
                    onClick={() => void raise(a)}
                    disabled={busy}
                    className="shrink-0 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-paper hover:bg-ink-800 disabled:opacity-50"
                  >
                    Raise clarification
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thread */}
      <div className="space-y-2">
        {thread.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-400">No messages yet{practiceName ? ` with ${practiceName}` : ""}.</p>
        ) : (
          thread.map((m) => {
            const fromUs = m.direction !== "from_seller";
            return (
              <div key={m.id} className={`flex ${fromUs ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-panel border px-3 py-2 ${fromUs ? "border-ink-200 bg-panel" : "border-brand-200 bg-brand-50"}`}>
                  <p className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                    {m.direction === "to_seller" ? "To seller" : m.direction === "from_seller" ? "Seller" : "Internal note"}
                    {m.status === "queued" && <span className="rounded bg-ochre-100 px-1 text-ochre-600">queued</span>}
                    {m.relatedMetricKey && <span className="text-clay-600">· re: {m.relatedMetricKey}</span>}
                  </p>
                  {m.subject && <p className="text-xs font-semibold text-ink-800">{m.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm text-ink-800">{m.body}</p>
                  <p className="mt-1 text-[10px] text-ink-300">{m.authorName ?? ""} · {formatDateTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {err && <p className="text-xs text-rust-600">{err}</p>}

      {/* Composer */}
      {live ? (
        <div className="rounded-panel border border-ink-200 bg-panel p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={toSeller ? `Message to ${seller?.name ?? "the seller"}…` : "Internal note…"}
            className="w-full resize-none rounded-lg border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-400"
          />
          <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
              <input type="checkbox" checked={toSeller} onChange={(e) => setToSeller(e.target.checked)} />
              Send to seller{toSeller && !seller?.email ? " (no email on file — will queue)" : ""}
            </label>
            <button
              onClick={() => void send()}
              disabled={busy || draft.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-800 disabled:opacity-50"
            >
              <Send size={13} /> {toSeller ? "Send" : "Add note"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-400">Unlock the live backend to message the seller.</p>
      )}
    </div>
  );
}
