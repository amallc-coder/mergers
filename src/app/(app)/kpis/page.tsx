import Link from "next/link";
import { Card, CardHeader, DealScoreBadge, PageHeader } from "@/components/ui";
import { getRepository } from "@/lib/data/repository";
import { getTransactionSummaries } from "@/lib/selectors";
import { metricLookup } from "@/lib/domain/analytics";
import { formatUSD, formatPercent } from "@/lib/format";

export default async function KpiOverviewPage() {
  const repo = getRepository();
  const summaries = await getTransactionSummaries();
  const metricSets = await Promise.all(summaries.map((s) => repo.metrics(s.transaction.id)));

  return (
    <>
      <PageHeader title="KPI Dashboards" subtitle="Headline financial KPIs across the pipeline — every value is document-sourced" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summaries.map((s, idx) => {
          const ml = metricLookup(metricSets[idx]);
          const t12 = ml.num("t12_revenue");
          const ebitda = ml.num("ebitda");
          const margin = ml.num("ebitda_margin");
          const payrollPct = ml.num("payroll_pct_revenue");
          const daysAr = ml.num("days_in_ar");
          const denial = ml.num("denial_rate");
          return (
            <Card key={s.transaction.id}>
              <CardHeader
                title={<Link href={`/transactions/${s.transaction.id}`} className="hover:text-brand-700">{s.transaction.practiceName}</Link>}
                subtitle={`${s.transaction.specialty} · ${s.transaction.stage}`}
                action={<DealScoreBadge score={s.deal.score} />}
              />
              <div className="grid grid-cols-3 gap-px bg-ink-100">
                <Metric label="T12 revenue" value={t12 !== undefined ? formatUSD(t12, { compact: true }) : "—"} />
                <Metric label="EBITDA" value={ebitda !== undefined ? formatUSD(ebitda, { compact: true }) : "—"} />
                <Metric label="EBITDA margin" value={margin !== undefined ? formatPercent(margin) : "—"} />
                <Metric label="Payroll % rev" value={payrollPct !== undefined ? formatPercent(payrollPct) : "—"} />
                <Metric label="Days in AR" value={daysAr !== undefined ? `${Math.round(daysAr)}d` : "—"} />
                <Metric label="Denial rate" value={denial !== undefined ? formatPercent(denial) : "—"} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}
