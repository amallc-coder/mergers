"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, FileType, Loader2, Presentation } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { useData } from "@/lib/data/DataProvider";
import { getTransactionViewWith, type TransactionView } from "@/lib/selectors";
import { REPORT_CATALOG, buildReport } from "@/lib/reports/build";
import { exportReport } from "@/lib/reports/export";
import type { ReportFormat } from "@/lib/reports/types";
import { SourceBadge, ViewLoading } from "./shared";

const FORMATS: { key: ReportFormat; label: string; Icon: typeof FileText }[] = [
  { key: "pdf", label: "PDF", Icon: FileText },
  { key: "excel", label: "Excel", Icon: FileSpreadsheet },
  { key: "word", label: "Word", Icon: FileType },
  { key: "pptx", label: "PPTX", Icon: Presentation },
];

export function ReportsView() {
  const { repo, source } = useData();
  const [txs, setTxs] = useState<{ id: string; practiceName: string }[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<TransactionView | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void repo.transactions().then((t) => {
      if (c) return;
      setTxs(t.map((x) => ({ id: x.id, practiceName: x.practiceName })));
      setSelectedId((prev) => prev || t[0]?.id || "");
    });
    return () => {
      c = true;
    };
  }, [repo]);

  useEffect(() => {
    if (!selectedId) {
      setView(null);
      return;
    }
    let c = false;
    setLoadingView(true);
    void getTransactionViewWith(repo, selectedId).then((v) => {
      if (c) return;
      setView(v ?? null);
      setLoadingView(false);
    });
    return () => {
      c = true;
    };
  }, [repo, selectedId]);

  async function gen(reportKey: string, format: ReportFormat) {
    if (!view) return;
    setErr(null);
    setBusy(`${reportKey}:${format}`);
    try {
      await exportReport(buildReport(reportKey, view), format);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Generate and export diligence reports for leadership and the investment committee"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SourceBadge source={source} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-500">Deal:</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5 text-sm font-medium text-ink-800"
          >
            {(txs ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.practiceName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && <p className="mb-3 text-xs text-amber-600">Export failed: {err}</p>}

      {!txs ? (
        <ViewLoading label="Loading deals…" />
      ) : (
        <Card>
          <CardHeader
            title="Report catalog"
            subtitle={
              loadingView
                ? "Loading deal data…"
                : `Select a report, then export to PDF, Excel, Word, or PowerPoint for ${view?.transaction.practiceName ?? "the selected deal"}`
            }
          />
          <div className="divide-y divide-ink-100">
            {REPORT_CATALOG.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                  <FileText size={16} className="text-ink-400" /> {r.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {FORMATS.map((f) => {
                    const id = `${r.key}:${f.key}`;
                    const isBusy = busy === id;
                    return (
                      <button
                        key={f.key}
                        disabled={!view || loadingView || isBusy}
                        onClick={() => void gen(r.key, f.key)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-panel px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <f.Icon size={13} />} {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-400">
        Reports are generated in-browser from the selected deal&apos;s live data, with the organization&apos;s
        brand standards (navy / cyan, Calibri, confidential footer with page numbers).
      </p>
    </>
  );
}
