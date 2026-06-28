"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardHeader, DealScoreBadge, InfoDot, PageHeader } from "@/components/ui";
import { useData, useRepoData } from "@/lib/data/DataProvider";
import { getTransactionSummariesWith } from "@/lib/selectors";
import { metricLookup } from "@/lib/domain/analytics";
import { TERMINAL_STAGES } from "@/lib/domain/types";
import { formatUSD, formatPercent } from "@/lib/format";
import { SourceBadge, txHref, ViewLoading } from "./shared";

type SortKey =
  | "score"
  | "t12_revenue"
  | "ebitda"
  | "ebitda_margin"
  | "days_in_ar"
  | "denial_rate"
  | "practice";

// label, and whether a higher value sorts "better" (so default desc puts best first).
const SORTS: { key: SortKey; label: string; higherBetter: boolean }[] = [
  { key: "score", label: "Deal score", higherBetter: true },
  { key: "t12_revenue", label: "T12 revenue", higherBetter: true },
  { key: "ebitda", label: "EBITDA", higherBetter: true },
  { key: "ebitda_margin", label: "EBITDA margin", higherBetter: true },
  { key: "days_in_ar", label: "Days in AR", higherBetter: false },
  { key: "denial_rate", label: "Denial rate", higherBetter: false },
  { key: "practice", label: "Practice name", higherBetter: false },
];

export function KpisView() {
  const { pipelineStages, awaitingLive } = useData();
  const { data, loading, source } = useRepoData(async (repo) => {
    const summaries = await getTransactionSummariesWith(repo);
    const metricSets = await Promise.all(summaries.map((s) => repo.metrics(s.transaction.id)));
    return { summaries, metricSets };
  });

  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [fPractice, setFPractice] = useState("");
  const [fRisk, setFRisk] = useState("");
  const [onlyFinancials, setOnlyFinancials] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const terminalSet = useMemo(
    () => new Set<string>([...pipelineStages.filter((s) => s.isTerminal).map((s) => s.label), ...TERMINAL_STAGES]),
    [pipelineStages],
  );

  const cards = useMemo(() => {
    if (!data) return [];
    const built = data.summaries.map((s, idx) => {
      const ml = metricLookup(data.metricSets[idx]);
      return {
        s,
        ml,
        hasFinancials: data.metricSets[idx].length > 0,
        t12: ml.num("t12_revenue"),
        ebitda: ml.num("ebitda"),
        margin: ml.num("ebitda_margin"),
        payrollPct: ml.num("payroll_pct_revenue"),
        daysAr: ml.num("days_in_ar"),
        denial: ml.num("denial_rate"),
      };
    });

    let list = built;
    if (!includeCompleted) list = list.filter((c) => !terminalSet.has(c.s.transaction.stage));
    if (onlyFinancials) list = list.filter((c) => c.hasFinancials);
    if (fPractice.trim()) {
      const q = fPractice.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.s.transaction.practiceName.toLowerCase().includes(q) ||
          (c.s.transaction.specialty ?? "").toLowerCase().includes(q) ||
          (c.s.transaction.state ?? "").toLowerCase().includes(q),
      );
    }
    if (fRisk) list = list.filter((c) => c.s.transaction.riskLevel === fRisk);

    const dir = sortDir === "asc" ? 1 : -1;
    const metric = (c: (typeof built)[number]): number | string | undefined => {
      switch (sortKey) {
        case "score": return c.s.deal.numericScore;
        case "t12_revenue": return c.t12;
        case "ebitda": return c.ebitda;
        case "ebitda_margin": return c.margin;
        case "days_in_ar": return c.daysAr;
        case "denial_rate": return c.denial;
        case "practice": return c.s.transaction.practiceName.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const av = metric(a);
      const bv = metric(b);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir;
      }
      // Push missing values to the bottom regardless of direction.
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (av - bv) * dir;
    });
  }, [data, sortKey, sortDir, fPractice, fRisk, onlyFinancials, includeCompleted, terminalSet]);

  return (
    <>
      <PageHeader title="KPI Dashboards" subtitle="Headline financial KPIs across the pipeline — every value is document-sourced" />
      <div className="mb-3 flex items-center justify-between">
        <SourceBadge source={source} />
        {data && <span className="text-xs text-ink-400">{cards.length} practice(s)</span>}
      </div>

      {!data || loading || awaitingLive ? (
        <ViewLoading label="Loading KPIs…" />
      ) : (
        <>
          {/* Sort + filter controls */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="section-eyebrow mr-1">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-8 rounded-lg border border-ink-200 bg-panel px-2 text-xs text-ink-700"
              >
                {SORTS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-ink-200 bg-panel px-2 text-xs text-ink-600 hover:border-ink-900 hover:text-ink-900"
                title={sortDir === "asc" ? "Ascending" : "Descending"}
              >
                {sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                {sortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>

            <input
              value={fPractice}
              onChange={(e) => setFPractice(e.target.value)}
              placeholder="Filter practice…"
              className="h-8 w-52 rounded-lg border border-ink-200 bg-panel px-2.5 text-xs outline-none focus:border-ink-900"
            />
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
            <label className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <input type="checkbox" checked={onlyFinancials} onChange={(e) => setOnlyFinancials(e.target.checked)} />
              Has financials
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
              Include completed
            </label>
          </div>

          {cards.length === 0 ? (
            <Card><div className="px-5 py-8 text-center text-sm text-ink-400">No practices match these filters.</div></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {cards.map((c) => (
                <Card key={c.s.transaction.id}>
                  <CardHeader
                    title={<Link href={txHref(c.s.transaction.id)} className="hover:text-brand-700">{c.s.transaction.practiceName}</Link>}
                    subtitle={`${c.s.transaction.specialty || "—"} · ${c.s.transaction.stage}`}
                    action={<DealScoreBadge score={c.s.deal.score} />}
                  />
                  <div className="grid grid-cols-3 gap-px bg-ink-100">
                    <Metric label="T12 revenue" info={KPI_INFO.t12} value={c.t12 !== undefined ? formatUSD(c.t12, { compact: true }) : "—"} />
                    <Metric label="EBITDA" info={KPI_INFO.ebitda} value={c.ebitda !== undefined ? formatUSD(c.ebitda, { compact: true }) : "—"} />
                    <Metric label="EBITDA margin" info={KPI_INFO.margin} value={c.margin !== undefined ? formatPercent(c.margin) : "—"} />
                    <Metric label="Payroll % rev" info={KPI_INFO.payroll} value={c.payrollPct !== undefined ? formatPercent(c.payrollPct) : "—"} />
                    <Metric label="Days in AR" info={KPI_INFO.daysAr} value={c.daysAr !== undefined ? `${Math.round(c.daysAr)}d` : "—"} />
                    <Metric label="Denial rate" info={KPI_INFO.denial} value={c.denial !== undefined ? formatPercent(c.denial) : "—"} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

const KPI_INFO = {
  t12: "Trailing-twelve-month net revenue (collections) — the practice's run-rate top line, read from its most recent P&L / income statement.",
  ebitda: "Earnings before interest, taxes, depreciation & amortization — operating profit read from the P&L.",
  margin: "EBITDA ÷ net revenue. Benchmark: strong ≥ 22%, weak ≤ 8%.",
  payroll: "Total payroll expense ÷ net revenue. Benchmark: healthy ≤ 30%, elevated ≥ 45% (very low often means the figure is partial — flag for clarification).",
  daysAr: "Total accounts-receivable balance ÷ (trailing revenue ÷ 365) — average days to collect. Benchmark: healthy ≤ 35, concerning ≥ 65.",
  denial: "Denied claims ÷ total claims submitted. Benchmark: healthy ≤ 5%, concerning ≥ 12%.",
} as const;

function Metric({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
        {label}
        {info && <InfoDot text={info} />}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}
