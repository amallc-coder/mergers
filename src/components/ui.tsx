import Link from "next/link";
import {
  cn,
  DEAL_SCORE_STYLES,
  progressColor,
  REVIEW_STATUS_STYLES,
  RISK_STYLES,
  STATUS_STYLES,
} from "@/lib/ui";
import type {
  DealHealthScore,
  DiligenceStatus,
  InternalReviewStatus,
  RiskLevel,
} from "@/lib/domain/types";

// ─────────────────────────── Card ───────────────────────────

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={cn("rounded-xl border border-ink-200 bg-white shadow-card", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-ink-400">{icon}</div> : null}
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ─────────────────────────── Badges & chips ───────────────────────────

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusChip({ status }: { status: DiligenceStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{status}</Badge>;
}

export function ReviewStatusChip({ status }: { status?: InternalReviewStatus }) {
  if (!status) return <span className="text-xs text-ink-400">—</span>;
  return <Badge className={REVIEW_STATUS_STYLES[status]}>{status}</Badge>;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge className={RISK_STYLES[level]}>{level} risk</Badge>;
}

export function DealScoreBadge({ score }: { score: DealHealthScore }) {
  return <Badge className={cn(DEAL_SCORE_STYLES[score], "font-semibold")}>{score}</Badge>;
}

export function TimelineBadge({ timeline }: { timeline: "Pre Signing" | "Post Signing" }) {
  return (
    <Badge
      className={
        timeline === "Pre Signing"
          ? "bg-brand-50 text-brand-700 ring-brand-600/20"
          : "bg-ink-100 text-ink-600 ring-ink-500/20"
      }
    >
      {timeline}
    </Badge>
  );
}

// ─────────────────────────── Progress ───────────────────────────

export function ProgressBar({
  pct,
  className,
  showLabel = false,
}: {
  pct: number;
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn("h-full rounded-full transition-all", progressColor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel ? (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-ink-600">
          {clamped}%
        </span>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Stat / KPI cards ───────────────────────────

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-rose-600"
          : "text-ink-900";
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </Card>
  );
}

export function KpiCard({
  label,
  value,
  citation,
  confidence,
  needsReview,
}: {
  label: string;
  value: React.ReactNode;
  citation?: string;
  confidence?: number;
  needsReview?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {confidence !== undefined ? (
          <span
            className={cn(
              "rounded px-1 text-[10px] font-semibold tabular-nums",
              confidence >= 0.85
                ? "bg-emerald-50 text-emerald-600"
                : confidence >= 0.7
                  ? "bg-amber-50 text-amber-600"
                  : "bg-rose-50 text-rose-600",
            )}
            title="AI extraction confidence"
          >
            {Math.round(confidence * 100)}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{value}</p>
      {citation ? (
        <p className="mt-0.5 truncate text-[10px] text-ink-400" title={citation}>
          ↳ {citation}
        </p>
      ) : null}
      {needsReview ? (
        <p className="mt-0.5 text-[10px] font-medium text-amber-600">Needs human review</p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Misc ───────────────────────────

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="text-ink-300">{icon}</div> : null}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-rose-600"
          : "text-ink-900";
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{children}</h2>
      {action}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        variant === "primary"
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
      )}
    >
      {children}
    </Link>
  );
}
