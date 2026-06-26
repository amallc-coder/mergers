"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { PORTFOLIO, type Facility, type ScatterPoint } from "@/lib/finance/portfolio";
import { cn } from "@/lib/ui";

// ─────────────── formatting ───────────────
const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;
const signed = (n: number) => (n >= 0 ? "+" : "−") + money(Math.abs(n));
const num = (n: number) => n.toLocaleString("en-US");

// chart palette
const C = {
  green: "#647a4c",
  greenLt: "#86a06a",
  tan: "#c3b79b",
  rust: "#b05a3f",
  paid: "#5e7a48",
  contractual: "#e0a98f",
  ar: "#a94a2c",
};
const bandHex = (k: string) => (k === "green" ? C.greenLt : k === "tan" ? C.tan : C.rust);
const barBand = (collPct: number) => (collPct >= 30 ? C.greenLt : collPct >= 15 ? C.tan : C.rust);

const SUBTABS = ["Overview", "Velocity", "P&L", "Cash forecast", "Denials & A/R", "Underpayments", "Demographics"];
const PERIODS = ["YTD", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Last 4 wks"];

export function FinancialDashboard() {
  const d = PORTFOLIO;
  const { org } = d;
  const [subtab, setSubtab] = useState("Overview");
  const [period, setPeriod] = useState("YTD");
  const [basis, setBasis] = useState<"Cash" | "Accrual">("Accrual");
  const [topGroup, setTopGroup] = useState("Facility");
  const [scoreView, setScoreView] = useState<"Clinics" | "Facility Group">("Clinics");
  const [trend, setTrend] = useState<"COLLECTED" | "CHARGES">("COLLECTED");

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              t === subtab ? "bg-ink-900 text-canvas" : "bg-panel text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-100/60",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Title + meta */}
      <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Financial (37.08)</h1>
          <p className="mt-1 text-sm text-ink-700">
            <b className="font-semibold">{money(org.billed)}</b> billed · <b className="font-semibold">{money(org.paid)}</b> paid ·{" "}
            {num(org.claims)} claims <span className="text-ink-400">(post-filter)</span>
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Provider-grade visibility across <b className="font-medium text-ink-700">{org.clinicsCount}</b> clinics and{" "}
            <b className="font-medium text-ink-700">{org.providersTotal}</b> providers. Click any number to drill in or export.
          </p>
        </div>
        <div className="space-y-0.5 text-right text-[11px] text-ink-400">
          <MetaRow k="Range" v="2026-01-01 → 2026-06-23" />
          <MetaRow k="Synced" v="18 hr ago" />
          <MetaRow k="Variants" v="main" extra="(missing time, payer, status)" />
          <MetaRow k="Period" v="Jan 1, 2026 → Jun 24, 2026" />
          <MetaRow k="Generated" v="Jun 23, 2026" />
        </div>
      </div>

      {/* Controls */}
      <Panel>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="label-micro text-ink-400">Period</span>
            <div className="flex flex-wrap gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium",
                    p === period ? "bg-ink-900 text-canvas" : "text-ink-600 hover:bg-ink-100",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-[260px] flex-1 items-center gap-3">
            <span className="label-micro text-ink-400">Range</span>
            <div className="flex-1">
              <RangeSlider />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-200/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="label-micro text-ink-400">Type</span>
            {["MD", "NP", "PA"].map((t) => (
              <span key={t} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {t}
              </span>
            ))}
            <span className="rounded bg-ink-900 px-2 py-0.5 text-[11px] font-medium text-canvas">Show in data</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200/60 px-4 py-2.5">
          <Filter label="Region" value="All regions (4)" />
          <Filter label="Facility Group" value="All" />
          <Filter label="Clinic" value="All" />
          <Filter label="Payer" value="All" />
          <Filter label="Service Line" value="All" />
          <Filter label="Claim Status" value="All" />
          <button className="ml-auto flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
            <ChevronDown size={13} /> More filters
          </button>
        </div>
      </Panel>

      {/* Banners */}
      <Banner tone="warn" tag="WARN">
        <b className="font-semibold">Partial load:</b> 3 of 4 variant CSVs failed to load (time, payer, status) — some
        charts will render with reduced data. Re-run from Admin → Sync Schedules → 37.08 → Run now.
      </Banner>
      <Banner tone="info" tag="INFO">
        <b className="font-semibold">Scope:</b> 6 months selected. KPI totals above reflect the post-filter view.
      </Banner>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Billed" value={money(org.billed)} sub={`${num(org.claims)} claims · ${num(org.patients)} patients`} />
        <Kpi label="Paid" value={money(org.paid)} sub={`${money(org.paid / org.claims)} per claim`} />
        <Kpi label="Expected Reimb." value={money(org.expectedReimb)} sub="Billed × 0.333 (est.)" />
        <Kpi label="Collectible A/R" value={money(org.collectibleAR)} sub="Expected − collected" />
        <Kpi label="Collection %" value={`${org.collectionPct}%`} sub={`Contractual burn ${org.contractualBurnPct}%`} />
        <Kpi label="A/R Change" value={signed(org.arChange)} sub="Net change in receivables over the period" tone="rust" />
        <Kpi label="Gross Revenue / Claim" value={`$${org.grossRevPerClaim}`} sub={`$${org.patientYield} patient yield`} />
      </div>

      {/* Sub-strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-ink-500">
        <div className="flex flex-wrap gap-x-4">
          <span>PROVIDERS IN SCOPE <b className="text-ink-800">{org.providersInScope}</b></span>
          <span>FACILITIES (EXCL. ZZZ) <b className="text-ink-800">{org.facilitiesCount}</b></span>
          <span>PAYERS <b className="text-ink-800">{org.payersCount}</b></span>
          <span>CONTRACTUAL <b className="text-rust-600">{money(org.contractual)}</b></span>
        </div>
        <span className="flex items-center gap-1 font-medium text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-rust-500" /> POST-FILTER TOTALS
        </span>
      </div>

      {/* Revenue recognition */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Revenue recognition — cash vs accrual</h3>
            <p className="text-xs text-ink-400">2026-01-01 → 2026-06-24 · org-wide</p>
          </div>
          <Toggle options={["Cash", "Accrual"]} value={basis} onChange={(v) => setBasis(v as "Cash" | "Accrual")} />
        </div>
        <div className="grid grid-cols-1 gap-px border-t border-ink-200/60 bg-ink-200/40 sm:grid-cols-3">
          <BigStat label="Earned (Billed)" value={money(org.billed)} sub="Same on both bases" />
          <BigStat
            label={`Collected · ${basis}`}
            value={money(basis === "Cash" ? org.paid : org.collectedAccrual)}
            sub={basis === "Cash" ? "Cash received in the window" : "Matched to this period's claims"}
          />
          <BigStat label="Realization %" value={`${org.realizationPct}%`} sub="Collected ÷ earned" />
        </div>
        <p className="px-5 py-2.5 text-[11px] text-ink-400">
          Cash collected <b className="text-ink-600">{money(org.paid)}</b> · Accrual collected{" "}
          <b className="text-ink-600">{money(org.collectedAccrual)}</b> · Cash = money received in the window; Accrual =
          collections matched to claims with a claim date in the window (revenue recognition).
        </p>
      </Panel>

      {/* Where the billed dollar went + Top 10 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Where the Billed dollar went" tag="POST-FILTER" />
          <div className="px-5 py-4">
            <p className="label-micro text-center text-ink-400">Billed (source)</p>
            <p className="mb-3 text-center text-xl font-semibold text-ink-900">{money(org.billed)}</p>
            <div className="flex h-9 overflow-hidden rounded">
              <Seg w={org.paidPct} color={C.paid} label="Paid" />
              <Seg w={org.contractualPct} color={C.contractual} label="Contractual" dark />
              <Seg w={100 - org.paidPct - org.contractualPct} color={C.ar} label="A/R ⚠" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniCard label="Paid" value={money(org.paid)} sub={`${org.paidPct}% of billed`} />
              <MiniCard label="Contractual" value={money(org.contractual)} sub={`${org.contractualPct}% of billed`} />
              <MiniCard label="Writeoff" value={money(org.writeoff)} sub={`${org.writeoffPct}% of billed`} />
              <MiniCard label="A/R Δ" value={money(org.arChange)} sub={`${signed(org.arChange)} delta`} />
            </div>
            <p className="mt-3 text-[11px] text-ink-400">
              Bar widths are normalized to 100% of the segments shown — small slivers (Refund, Writeoff) are clipped to a
              minimum 12px so their labels remain legible. Hover for exact amounts.
            </p>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Top 10 by Billed</h3>
              <p className="label-micro text-ink-400">Click a bar to filter</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {["Facility Group", "Facility", "Provider", "Payer", "Service Line", "CPT"].map((g) => (
                <button
                  key={g}
                  onClick={() => setTopGroup(g)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium",
                    g === topGroup ? "bg-ink-900 text-canvas" : "text-ink-600 hover:bg-ink-100",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="px-5 pb-4">
            <div className="mb-2 flex gap-1">
              {["10", "5", "10", "20", "All 220"].map((n, i) => (
                <span key={i} className={cn("rounded px-1.5 py-0.5 text-[10px]", i === 2 ? "bg-ink-900 text-canvas" : "bg-ink-100 text-ink-500")}>
                  {n}
                </span>
              ))}
            </div>
            <TopBars items={d.topByBilled} />
            <p className="mt-3 text-[11px] text-ink-400">
              Bar color = collection %:{" "}
              <Legend color={C.greenLt} t="≥ 30%" /> <Legend color={C.tan} t="15–30%" /> <Legend color={C.rust} t="< 15%" />
            </p>
          </div>
        </Panel>
      </div>

      {/* Scatters */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHead title="CPT Quadrant" tag="BUBBLE = CLAIM COUNT · CLICK TO FILTER" />
          <div className="px-3 py-3">
            <Scatter
              points={d.cptPoints}
              colorOf={(p) => bandHex(p.colorKey)}
              xMin={100_000}
              xMax={15_000_000}
              yMin={0}
              yMax={100}
              xTicks={[100_000, 500_000, 1_000_000, 5_000_000, 15_000_000]}
              yTicks={[0, 20, 40, 60, 80, 100]}
              xLabel="Billed ($, log)"
              yLabel="Collection %"
              fmtX={(v) => money(v)}
              fmtY={(v) => `${v}%`}
            />
            <p className="px-2 text-[11px] text-ink-400">
              Top-right: high-billed, high-collection codes (cash-cows). Bottom-right: high-billed, low-collection codes
              (revenue at risk). Bubble size = claim count; x-axis is log to keep the long tail legible.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Provider Revenue Scatter" tag="BUBBLE = CLAIM COUNT · COLOR = FACILITY GROUP" />
          <div className="px-3 py-3">
            <Scatter
              points={d.providerPoints}
              colorOf={(p) => PORTFOLIO.providerGroups.find((g) => g.key === p.colorKey)?.color ?? C.tan}
              xMin={80_000}
              xMax={4_500_000}
              yMin={0}
              yMax={250}
              xTicks={[100_000, 200_000, 400_000, 1_000_000, 4_000_000]}
              yTicks={[0, 50, 100, 150, 200, 250]}
              xLabel="Billed ($, log)"
              yLabel="Gross Revenue / Claim"
              fmtX={(v) => money(v)}
              fmtY={(v) => `$${v}`}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1">
              {PORTFOLIO.providerGroups.map((g) => (
                <span key={g.key} className="flex items-center gap-1 text-[10px] text-ink-500">
                  <span className="h-2 w-2 rounded-sm" style={{ background: g.color }} /> {g.label}
                </span>
              ))}
            </div>
            <p className="px-2 pt-2 text-[11px] text-ink-400">
              High-x, low-y providers may be over-coding (lots of billed but low net per claim) — drill via the Provider
              filter to confirm with CPT mix.
            </p>
          </div>
        </Panel>
      </div>

      {/* Facility scorecard */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Facility Scorecard</h3>
            <p className="label-micro text-ink-400">Click a row to filter</p>
          </div>
          <Toggle options={["Clinics", "Facility Group"]} value={scoreView} onChange={(v) => setScoreView(v as typeof scoreView)} />
        </div>
        <Scorecard view={scoreView} facilities={d.facilities} />
        <div className="flex items-center justify-between border-t border-ink-200/60 px-5 py-2.5 text-[11px] text-ink-400">
          <span>
            <span className="text-rust-600">Red</span> = collection &lt; 15% &nbsp;{" "}
            <span className="text-ochre-600">Orange</span> = A/R Δ &gt; 10% of billed
          </span>
          <span>{org.facilitiesCount} facilities</span>
        </div>
      </Panel>

      {/* Monthly trend */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Monthly Trend</h3>
            <p className="label-micro text-ink-400">Bars = collected · line = charges · dotted = A/R Δ · click to filter</p>
          </div>
          <Toggle options={["COLLECTED", "CHARGES"]} value={trend} onChange={(v) => setTrend(v as typeof trend)} />
        </div>
        <div className="px-3 py-4">
          <MonthlyTrend data={d.monthly} primary={trend} />
        </div>
        <p className="border-t border-ink-200/60 px-5 py-2.5 text-[11px] text-ink-400">
          Bars show collected by month; the line is charges. When the dotted A/R Δ spikes while collected trails charges,
          the bottleneck is collection, not volume.
        </p>
      </Panel>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200/70 pt-4 text-[11px] text-ink-400">
        <span>© 2026 Mergers · for American Medical Administrators</span>
        <span>Sources · 13.87 Visits · 5.10 Orders · Last sync · 1 hr ago</span>
      </div>
    </div>
  );
}

// ─────────────── small building blocks ───────────────

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-ink-200 bg-panel shadow-card">{children}</div>;
}

function PanelHead({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 px-5 py-3">
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <span className="label-micro text-ink-400">{tag}</span>
    </div>
  );
}

function MetaRow({ k, v, extra }: { k: string; v: string; extra?: string }) {
  return (
    <p>
      <span className="text-ink-400">{k} · </span>
      <span className="text-ink-600">{v}</span>
      {extra ? <span className="text-rust-500"> {extra}</span> : null}
    </p>
  );
}

function Filter({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="label-micro text-ink-400">{label}</span>
      <span className="flex items-center gap-1 rounded border border-ink-200 bg-canvas px-2 py-1 text-[11px] text-ink-700">
        {value} <ChevronDown size={11} className="text-ink-400" />
      </span>
    </label>
  );
}

function Banner({ tone, tag, children }: { tone: "warn" | "info"; tag: string; children: React.ReactNode }) {
  const styles =
    tone === "warn" ? "border-rust-200 bg-rust-50 text-ink-700" : "border-ink-200 bg-ink-100/50 text-ink-600";
  const tagStyle = tone === "warn" ? "text-rust-600" : "text-ink-400";
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-4 py-2.5 text-xs", styles)}>
      <span className="flex items-center gap-1">
        {tone === "warn" ? <AlertTriangle size={13} className="text-rust-500" /> : <Info size={13} className="text-ink-400" />}
        <span className={cn("label-micro font-semibold", tagStyle)}>{tag}</span>
      </span>
      <span>{children}</span>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "rust" }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-panel px-4 py-3 shadow-card">
      <p className="label-micro font-medium text-ink-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "rust" ? "text-rust-600" : "text-ink-900")}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-ink-400">{sub}</p>
    </div>
  );
}

function Toggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-ink-200 bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium",
            o === value ? "bg-ink-900 text-canvas" : "text-ink-500 hover:text-ink-800",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-panel px-5 py-4">
      <p className="label-micro text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="mt-0.5 text-xs text-ink-400">{sub}</p>
    </div>
  );
}

function MiniCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-canvas px-3 py-2">
      <p className="label-micro text-ink-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="text-[10px] text-ink-400">{sub}</p>
    </div>
  );
}

function Seg({ w, color, label, dark }: { w: number; color: string; label: string; dark?: boolean }) {
  return (
    <div
      className={cn("flex items-center justify-center text-[11px] font-medium", dark ? "text-ink-800" : "text-canvas")}
      style={{ width: `${w}%`, background: color, minWidth: 40 }}
      title={`${label} · ${w}%`}
    >
      {label}
    </div>
  );
}

function Legend({ color, t }: { color: string; t: string }) {
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} /> {t}
    </span>
  );
}

function RangeSlider() {
  return (
    <div className="relative">
      <div className="flex items-center justify-between text-[10px] text-ink-400">
        <span>Jan 1, 2026</span>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-500">175 days</span>
        <span>Jun 24, 2026</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-ink-200">
        <div className="absolute inset-y-0 left-0 rounded-full bg-rust-300" style={{ width: "48%" }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-rust-400 bg-panel" style={{ left: "47%" }} />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-ink-300">
        {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Top-10 horizontal bars ───────────────

function TopBars({ items }: { items: Facility[] }) {
  const max = Math.max(...items.map((i) => i.billed));
  const ticks = [0, 1e6, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6];
  return (
    <div>
      <div className="space-y-1">
        {items.map((f) => (
          <div key={f.name} className="flex items-center gap-2">
            <span className="w-44 shrink-0 truncate text-right text-[11px] text-ink-600" title={f.name}>
              {f.name}
            </span>
            <div className="relative h-4 flex-1">
              <div className="absolute inset-0 rounded-sm bg-ink-100/60" />
              <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(f.billed / max) * 100}%`, background: barBand(f.collPct) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 pl-[12rem] text-[9px] text-ink-300">
        {ticks.map((t) => (
          <span key={t} className="flex-1">{t === 0 ? "$0" : `$${t / 1e6}M`}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Scatter (SVG, log-x) ───────────────

function Scatter({
  points,
  colorOf,
  xMin,
  xMax,
  yMin,
  yMax,
  xTicks,
  yTicks,
  xLabel,
  yLabel,
  fmtX,
  fmtY,
}: {
  points: ScatterPoint[];
  colorOf: (p: ScatterPoint) => string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  xLabel: string;
  yLabel: string;
  fmtX: (v: number) => string;
  fmtY: (v: number) => string;
}) {
  const W = 540;
  const H = 300;
  const pad = { l: 48, r: 12, t: 12, b: 44 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const lx = (v: number) => pad.l + ((Math.log(v) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin))) * pw;
  const ly = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
  const maxSize = Math.max(...points.map((p) => p.size));
  const r = (s: number) => 2 + (Math.sqrt(s) / Math.sqrt(maxSize)) * 13;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} vs ${xLabel}`}>
      {/* gridlines + y ticks */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.l} x2={W - pad.r} y1={ly(t)} y2={ly(t)} stroke="#e3dccb" strokeWidth={1} />
          <text x={pad.l - 6} y={ly(t) + 3} textAnchor="end" fontSize={9} fill="#9c9079">{fmtY(t)}</text>
        </g>
      ))}
      {/* x ticks */}
      {xTicks.map((t) => (
        <text key={`x${t}`} x={lx(t)} y={H - pad.b + 14} textAnchor="middle" fontSize={9} fill="#9c9079">
          {fmtX(t)}
        </text>
      ))}
      {/* axis labels */}
      <text x={pad.l + pw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="#7b7160">{xLabel}</text>
      <text x={12} y={pad.t + ph / 2} textAnchor="middle" fontSize={9} fill="#7b7160" transform={`rotate(-90 12 ${pad.t + ph / 2})`}>
        {yLabel}
      </text>
      {/* points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={lx(p.x)}
          cy={ly(p.y)}
          r={r(p.size)}
          fill={colorOf(p)}
          fillOpacity={0.62}
          stroke={colorOf(p)}
          strokeOpacity={0.9}
          strokeWidth={0.6}
        >
          <title>{`${p.label} · ${fmtX(p.x)} · ${fmtY(Math.round(p.y))} · ${p.size.toLocaleString()} claims`}</title>
        </circle>
      ))}
    </svg>
  );
}

// ─────────────── Facility scorecard ───────────────

function Scorecard({ view, facilities }: { view: "Clinics" | "Facility Group"; facilities: Facility[] }) {
  const rows = useMemo(() => {
    if (view === "Clinics") return [...facilities].sort((a, b) => b.billed - a.billed);
    const map = new Map<string, Facility>();
    for (const f of facilities) {
      const g = map.get(f.group);
      if (!g) {
        map.set(f.group, { ...f, name: f.group });
      } else {
        g.billed += f.billed;
        g.paid += f.paid;
        g.arDelta += f.arDelta;
        g.claims += f.claims;
        g.collPct = Math.round((g.paid / g.billed) * 100);
        g.grPerClaim = Math.round((g.paid / g.claims) * 1) || g.grPerClaim;
      }
    }
    return [...map.values()].sort((a, b) => b.billed - a.billed);
  }, [view, facilities]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-y border-ink-200/60 bg-ink-100/40 text-[10px] uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-5 py-2 font-medium">{view === "Clinics" ? "Facility" : "Group"}</th>
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 text-right font-medium">Billed ↓</th>
            <th className="px-3 py-2 text-right font-medium">Paid</th>
            <th className="px-3 py-2 text-right font-medium">Coll %</th>
            <th className="px-3 py-2 text-right font-medium">A/R Δ</th>
            <th className="px-3 py-2 text-right font-medium">GR / Claim</th>
            <th className="px-3 py-2 text-right font-medium">Claims</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200/50">
          {rows.map((f) => {
            const lowColl = f.collPct < 15;
            const highAr = f.arDelta > 0.1 * f.billed;
            return (
              <tr key={f.name} className="hover:bg-ink-100/30">
                <td className={cn("px-5 py-2 font-medium", lowColl ? "text-rust-600" : highAr ? "text-ochre-600" : "text-ink-900")}>
                  {f.name}
                </td>
                <td className="px-3 py-2 text-xs text-ink-500">{view === "Clinics" ? f.group : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-800">{money(f.billed)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{money(f.paid)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", lowColl ? "text-rust-600" : "text-ink-700")}>{f.collPct}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-brand-600">{signed(f.arDelta)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">${f.grPerClaim}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-500">{num(f.claims)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────── Monthly trend (SVG bars + lines) ───────────────

function MonthlyTrend({ data, primary }: { data: { month: string; collected: number; charges: number; arDelta: number }[]; primary: "COLLECTED" | "CHARGES" }) {
  const W = 920;
  const H = 240;
  const pad = { l: 52, r: 16, t: 14, b: 28 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const maxV = Math.max(...data.map((d) => Math.max(d.charges, d.collected)));
  const x = (i: number) => pad.l + (i + 0.5) * (pw / data.length);
  const y = (v: number) => pad.t + (1 - v / maxV) * ph;
  const barW = (pw / data.length) * 0.5;
  const bars = data.map((d) => (primary === "COLLECTED" ? d.collected : d.charges));
  const line = data.map((d) => (primary === "COLLECTED" ? d.charges : d.collected));
  const yticks = [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly collected vs charges">
      {yticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3dccb" strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#9c9079">${(t / 1e6).toFixed(1)}M</text>
        </g>
      ))}
      {data.map((d, i) => (
        <rect key={d.month} x={x(i) - barW / 2} y={y(bars[i])} width={barW} height={y(0) - y(bars[i])} fill={C.green} fillOpacity={0.85} rx={1} />
      ))}
      {/* charges/collected line */}
      <polyline fill="none" stroke={C.ar} strokeWidth={2} points={data.map((_, i) => `${x(i)},${y(line[i])}`).join(" ")} />
      {data.map((_, i) => (
        <circle key={i} cx={x(i)} cy={y(line[i])} r={2.5} fill={C.ar} />
      ))}
      {/* A/R delta dotted */}
      <polyline fill="none" stroke={C.contractual} strokeWidth={1.5} strokeDasharray="3 3" points={data.map((d, i) => `${x(i)},${y(d.arDelta)}`).join(" ")} />
      {/* x labels */}
      {data.map((d, i) => (
        <text key={d.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#7b7160">{d.month}</text>
      ))}
    </svg>
  );
}
