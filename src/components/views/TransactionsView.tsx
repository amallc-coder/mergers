"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  KanbanSquare,
  Plus,
  RotateCcw,
  Table2,
} from "lucide-react";
import { Card, DealScoreBadge, InfoDot, PageHeader, ProgressBar, RiskBadge } from "@/components/ui";
import { useData, useRepoData } from "@/lib/data/DataProvider";
import { getTransactionSummariesWith, type TransactionSummary } from "@/lib/selectors";
import { TERMINAL_STAGES } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { PipelineBoard } from "./PipelineBoard";
import { NewTransactionModal } from "./NewTransactionModal";
import { SourceBadge, txHref, ViewLoading } from "./shared";

type SortKey =
  | "practice"
  | "stage"
  | "score"
  | "risk"
  | "presigning"
  | "gaps"
  | "overdue"
  | "activity";

const RISK_RANK: Record<string, number> = { Low: 0, Moderate: 1, Elevated: 2, High: 3 };

export function TransactionsView() {
  const [view, setView] = useState<"table" | "pipeline">("table");
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [fPractice, setFPractice] = useState("");
  const [fStage, setFStage] = useState("");
  const [fRisk, setFRisk] = useState("");

  const { source, pipelineStages, awaitingLive, setStage } = useData();
  const { data: summaries, loading } = useRepoData((repo) => getTransactionSummariesWith(repo));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const live = source === "live";

  // Stage ordering + terminal lookup, from the live pipeline config (or the seed default).
  const stageOrder = useMemo(
    () => Object.fromEntries(pipelineStages.map((s) => [s.label, s.sortOrder])),
    [pipelineStages],
  );
  const terminalSet = useMemo(() => {
    const fromConfig = pipelineStages.filter((s) => s.isTerminal).map((s) => s.label);
    return new Set<string>([...fromConfig, ...TERMINAL_STAGES]);
  }, [pipelineStages]);
  const isTerminal = (stage: string) => terminalSet.has(stage);

  // A sensible target stage for the quick Complete / Reopen actions.
  const completeStage =
    pipelineStages.find((s) => s.isTerminal && /clos/i.test(s.label))?.label ??
    pipelineStages.find((s) => s.isTerminal)?.label ??
    "Signed / Closed";
  const reopenStage =
    pipelineStages.find((s) => !s.isTerminal && /diligence/i.test(s.label))?.label ??
    pipelineStages.find((s) => !s.isTerminal)?.label ??
    "Diligence In Progress";

  const all = summaries ?? [];
  const activeCount = all.filter((s) => !isTerminal(s.transaction.stage)).length;
  const completedCount = all.length - activeCount;

  // Stages present in the current tab, for the stage filter dropdown.
  const stageOptions = useMemo(() => {
    const inTab = all.filter((s) => (tab === "completed") === isTerminal(s.transaction.stage));
    return [...new Set(inTab.map((s) => s.transaction.stage))].sort(
      (a, b) => (stageOrder[a] ?? 99) - (stageOrder[b] ?? 99),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, stageOrder]);

  const rows = useMemo(() => {
    let list = all.filter((s) => (tab === "completed") === isTerminal(s.transaction.stage));
    if (fPractice.trim()) {
      const q = fPractice.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.transaction.practiceName.toLowerCase().includes(q) ||
          (s.transaction.state ?? "").toLowerCase().includes(q) ||
          (s.transaction.specialty ?? "").toLowerCase().includes(q),
      );
    }
    if (fStage) list = list.filter((s) => s.transaction.stage === fStage);
    if (fRisk) list = list.filter((s) => s.transaction.riskLevel === fRisk);

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (s: TransactionSummary): number | string => {
      switch (sortKey) {
        case "practice": return s.transaction.practiceName.toLowerCase();
        case "stage": return stageOrder[s.transaction.stage] ?? 99;
        case "score": return s.deal.numericScore;
        case "risk": return RISK_RANK[s.transaction.riskLevel] ?? 0;
        case "presigning": return s.preStats.completionPct;
        case "gaps": return s.criticalGaps;
        case "overdue": return s.overdue;
        case "activity": return new Date(s.transaction.lastActivityDate ?? 0).getTime();
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, fPractice, fStage, fRisk, sortKey, sortDir, stageOrder]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "practice" || key === "stage" ? "asc" : "desc");
    }
  }

  async function setStageTo(id: string, stage: string) {
    if (!live) {
      setErr("Unlock the live backend to change a deal's status.");
      return;
    }
    setErr(null);
    setBusy(id);
    try {
      await setStage(id, stage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const Th = ({ label, k, align = "left", className = "", info }: { label: string; k: SortKey; align?: "left" | "center" | "right"; className?: string; info?: string }) => (
    <th className={`px-3 py-3 font-medium ${className}`}>
      <span className={`inline-flex items-center gap-1 ${align === "center" ? "justify-center" : ""}`}>
        <button
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-ink-800 ${sortKey === k ? "text-ink-800" : ""}`}
        >
          {label}
          {sortKey === k ? (
            sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
          ) : (
            <ArrowUpDown size={11} className="text-ink-300" />
          )}
        </button>
        {info && <InfoDot text={info} />}
      </span>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={summaries ? `${activeCount} active · ${completedCount} completed` : "Loading…"}
        action={
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} /> New transaction
          </button>
        }
      />

      {showNew && <NewTransactionModal onClose={() => setShowNew(false)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SourceBadge source={source} />
          {/* Active / Completed segmented toggle */}
          <div className="inline-flex rounded-lg border border-ink-200 bg-panel p-0.5 text-xs">
            <button
              onClick={() => { setTab("active"); setFStage(""); }}
              className={`rounded-md px-2.5 py-1 font-medium ${tab === "active" ? "bg-ink-900 text-paper" : "text-ink-500 hover:text-ink-800"}`}
            >
              Active <span className="ml-1 tabular-nums opacity-70">{activeCount}</span>
            </button>
            <button
              onClick={() => { setTab("completed"); setFStage(""); }}
              className={`rounded-md px-2.5 py-1 font-medium ${tab === "completed" ? "bg-ink-900 text-paper" : "text-ink-500 hover:text-ink-800"}`}
            >
              Completed <span className="ml-1 tabular-nums opacity-70">{completedCount}</span>
            </button>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-ink-200 bg-panel p-0.5 text-xs">
          <button
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${view === "table" ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-800"}`}
          >
            <Table2 size={14} /> Table
          </button>
          <button
            onClick={() => setView("pipeline")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${view === "pipeline" ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-800"}`}
          >
            <KanbanSquare size={14} /> Pipeline
          </button>
        </div>
      </div>

      {err && <p className="mb-3 text-xs text-rust-600">{err}</p>}

      {view === "pipeline" ? (
        <PipelineBoard />
      ) : !summaries || loading || awaitingLive ? (
        <ViewLoading label="Loading transactions…" />
      ) : (
        <Card>
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
            <input
              value={fPractice}
              onChange={(e) => setFPractice(e.target.value)}
              placeholder="Filter practice / state / specialty…"
              className="h-8 w-64 rounded-lg border border-ink-200 bg-panel px-2.5 text-xs outline-none focus:border-ink-900"
            />
            <select
              value={fStage}
              onChange={(e) => setFStage(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-panel px-2 text-xs text-ink-600"
            >
              <option value="">All stages</option>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={fRisk}
              onChange={(e) => setFRisk(e.target.value)}
              className="h-8 rounded-lg border border-ink-200 bg-panel px-2 text-xs text-ink-600"
            >
              <option value="">All risk</option>
              {["Low", "Moderate", "Elevated", "High"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {(fPractice || fStage || fRisk) && (
              <button
                onClick={() => { setFPractice(""); setFStage(""); setFRisk(""); }}
                className="text-xs text-ink-400 hover:text-ink-700"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-ink-400">{rows.length} shown</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <Th label="Practice" k="practice" info="The acquisition-target practice, with its specialty, state, and location/provider counts." />
                  <Th label="Stage" k="stage" info="Current pipeline stage. Terminal stages (Signed/Closed, On Hold, Passed/Dead) move the deal to the Completed tab." />
                  <Th label="Deal score" k="score" info="AI deal-health score (0–100) blending pre-signing completion, financial KPIs, risk flags, and critical gaps." />
                  <Th label="Risk" k="risk" info="Overall risk level derived from the deal-health assessment (Low / Moderate / Elevated / High)." />
                  <Th label="Pre-signing" k="presigning" info="Share of pre-signing diligence items received (received + N/A ÷ applicable)." />
                  <Th label="Gaps" k="gaps" className="text-center" align="center" info="Critical pre-signing documents still outstanding." />
                  <Th label="Overdue" k="overdue" className="text-center" align="center" info="Diligence requests past their due date." />
                  <Th label="Last activity" k="activity" info="Most recent recorded activity on this deal." />
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-ink-400">
                      {tab === "completed" ? "No completed deals yet." : "No transactions match these filters."}
                    </td>
                  </tr>
                ) : (
                  rows.map((s) => (
                    <tr key={s.transaction.id} className="group hover:bg-ink-50/60">
                      <td className="px-3 py-3 pl-5">
                        <Link href={txHref(s.transaction.id)} className="block">
                          <span className="font-medium text-ink-900 group-hover:text-brand-700">
                            {s.transaction.practiceName}
                          </span>
                          <span className="block text-xs text-ink-400">
                            {[s.transaction.specialty, s.transaction.state, s.transaction.locationsCount ? `${s.transaction.locationsCount} loc` : null, s.transaction.providersCount ? `${s.transaction.providersCount} prov` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-600">{s.transaction.stage}</td>
                      <td className="px-3 py-3"><DealScoreBadge score={s.deal.score} /></td>
                      <td className="px-3 py-3"><RiskBadge level={s.transaction.riskLevel} /></td>
                      <td className="px-3 py-3"><ProgressBar pct={s.preStats.completionPct} showLabel /></td>
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
                      <td className="px-3 py-3 text-right">
                        {live && (
                          tab === "active" ? (
                            <button
                              onClick={() => setStageTo(s.transaction.id, completeStage)}
                              disabled={busy === s.transaction.id}
                              title={`Mark completed (${completeStage})`}
                              className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] text-ink-500 opacity-0 transition-opacity hover:border-ink-900 hover:text-ink-900 group-hover:opacity-100 disabled:opacity-50"
                            >
                              <Check size={12} /> Complete
                            </button>
                          ) : (
                            <button
                              onClick={() => setStageTo(s.transaction.id, reopenStage)}
                              disabled={busy === s.transaction.id}
                              title={`Reopen (${reopenStage})`}
                              className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] text-ink-500 opacity-0 transition-opacity hover:border-ink-900 hover:text-ink-900 group-hover:opacity-100 disabled:opacity-50"
                            >
                              <RotateCcw size={12} /> Reopen
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
