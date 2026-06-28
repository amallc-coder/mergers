"use client";

/**
 * Deal pipeline cards, rendered from the runtime data source (live Supabase when
 * unlocked, seed otherwise). Replaces the former build-time server render so the
 * list reflects the real practices the moment the access passcode is entered.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderTree, ExternalLink, Loader2, Database, Cloud } from "lucide-react";
import { Card, ProgressBar } from "@/components/ui";
import { useData } from "@/lib/data/DataProvider";
import { getTransactionSummariesWith, type TransactionSummary } from "@/lib/selectors";
import { txHref } from "@/components/views/shared";

export function DealPipeline() {
  const { repo, source, status, error } = useData();
  const [summaries, setSummaries] = useState<TransactionSummary[] | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await getTransactionSummariesWith(repo);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      await Promise.all(
        rows.map(async (r) => {
          counts[r.transaction.id] = (await repo.documents(r.transaction.id)).length;
        }),
      );
      if (cancelled) return;
      setSummaries(rows);
      setDocCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs">
        {source === "live" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
            <Cloud size={13} /> Live data
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-500">
            <Database size={13} /> Sample data
          </span>
        )}
        {status === "loading" && (
          <span className="inline-flex items-center gap-1.5 text-ink-400">
            <Loader2 size={13} className="animate-spin" /> Loading live deals…
          </span>
        )}
        {status === "error" && (
          <span className="text-amber-600">Live load failed ({error}); showing sample.</span>
        )}
        {summaries && (
          <span className="text-ink-400">
            {summaries.length} deal{summaries.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!summaries ? (
        <div className="flex items-center gap-2 py-10 text-ink-400">
          <Loader2 size={16} className="animate-spin" /> Loading deals…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((s) => (
            <Card key={s.transaction.id} className="p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FolderTree size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{s.transaction.practiceName}</p>
                    <p className="text-xs text-ink-400">
                      {s.transaction.specialty || s.transaction.stage}
                    </p>
                  </div>
                </div>
                {s.transaction.sharePointFolderUrl ? (
                  <a
                    href={s.transaction.sharePointFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-300 hover:text-brand-600"
                  >
                    <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>
              <div className="space-y-2.5">
                <Labeled label="Pre-signing">
                  <ProgressBar pct={s.preStats.completionPct} showLabel />
                </Labeled>
                <Labeled label="Post-signing">
                  <ProgressBar pct={s.postStats.completionPct} showLabel />
                </Labeled>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
                <span>{docCounts[s.transaction.id] ?? 0} document(s)</span>
                <div className="flex items-center gap-3">
                  {s.transaction.sharePointFolderUrl ? (
                    <a
                      href={s.transaction.sharePointFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-400 hover:text-brand-600"
                    >
                      SharePoint ↗
                    </a>
                  ) : null}
                  <Link
                    href={txHref(s.transaction.id)}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Open data room →
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-500">{label}</p>
      {children}
    </div>
  );
}
