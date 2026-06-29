"use client";

/**
 * Live seller reply portal — /portal/reply/?t=<token>.
 *
 * A single statically-exported page that hydrates at runtime: it reads the
 * opaque token from the URL, loads the seller-safe clarification thread from the
 * `data` function, and lets the seller reply straight back into it. No team
 * passcode, no other deal, no internal data — the token alone scopes everything.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { sellerApi, sellerBackendReady, type SellerContext } from "@/lib/data/seller-client";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SellerReply() {
  const token = useSearchParams().get("t") ?? "";
  const [ctx, setCtx] = useState<SellerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token) {
      setErr("This link is missing its access token.");
      setLoading(false);
      return;
    }
    if (!sellerBackendReady()) {
      setErr("This portal is not available right now.");
      setLoading(false);
      return;
    }
    try {
      setCtx(await sellerApi.context(token));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ctx?.thread.length]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await sellerApi.reply(token, body);
      setDraft("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-ink-400">Loading your messages…</p>;
  }

  if (err && !ctx) {
    return (
      <div className="rounded-xl border border-rust-200 bg-rust-50 px-4 py-6 text-center">
        <p className="text-sm font-medium text-rust-700">{err}</p>
        <p className="mt-1 text-xs text-rust-500">
          If you believe this is a mistake, please reply to the email you received from the deal team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{ctx?.practiceName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          Welcome{ctx?.sellerName ? `, ${ctx.sellerName}` : ""}. Below are the questions from the deal team —
          reply to any of them right here.
        </p>
      </div>

      <div className="space-y-2">
        {ctx && ctx.thread.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-400">No messages yet.</p>
        ) : (
          ctx?.thread.map((m) => {
            const fromSeller = m.direction === "from_seller";
            return (
              <div key={m.id} className={`flex ${fromSeller ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl border px-3.5 py-2.5 ${
                    fromSeller ? "border-ink-200 bg-panel" : "border-brand-200 bg-brand-50"
                  }`}
                >
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                    {fromSeller ? "You" : "Deal team"}
                  </p>
                  {m.subject && <p className="text-xs font-semibold text-ink-800">{m.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm text-ink-800">{m.body}</p>
                  <p className="mt-1 text-[10px] text-ink-300">{formatWhen(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {err && ctx && <p className="text-xs text-rust-600">{err}</p>}

      <div className="rounded-xl border border-ink-200 bg-panel p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Type your reply to the deal team…"
          className="w-full resize-none rounded-lg border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-400"
        />
        <div className="flex items-center justify-end border-t border-ink-100 pt-2">
          <button
            onClick={() => void send()}
            disabled={busy || draft.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-800 disabled:opacity-50"
          >
            <Send size={13} /> {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SellerReplyPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-ink-400">Loading…</p>}>
      <SellerReply />
    </Suspense>
  );
}
