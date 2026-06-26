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

const TONE_TEXT = {
  default: "text-ink-900",
  good: "text-brand-600",
  warn: "text-ochre-600",
  bad: "text-rust-600",
} as const;
type Tone = keyof typeof TONE_TEXT;

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
    <Tag className={cn("rounded-xl border border-ink-200 bg-panel shadow-card", className)}>
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
    <div className="flex items-start justify-between gap-4 border-b border-ink-200/70 px-5 py-3.5">
      <div className="flex items-start gap-2.5">
        {icon ? <div className="mt-0.5 text-ink-400">{icon}</div> : null}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-800">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ─────────────────────────── Badges & chips ───────────────────────────

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset",
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
          ? "bg-brand-100 text-brand-700 ring-brand-600/20"
          : "bg-ink-100 text-ink-600 ring-ink-400/25"
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
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-ink-200/60">
        <div className={cn("h-full transition-all", progressColor(clamped))} style={{ width: `${clamped}%` }} />
      </div>
      {showLabel ? (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-ink-600">{clamped}%</span>
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
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-panel px-4 py-3 shadow-card">
      <p className="label-micro font-medium text-ink-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
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
    <div className="rounded-lg border border-ink-200 bg-panel px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {confidence !== undefined ? (
          <span
            className={cn(
              "rounded px-1 text-[10px] font-semibold tabular-nums",
              confidence >= 0.85
                ? "bg-brand-100 text-brand-700"
                : confidence >= 0.7
                  ? "bg-ochre-50 text-ochre-600"
                  : "bg-rust-50 text-rust-600",
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
      {needsReview ? <p className="mt-0.5 text-[10px] font-medium text-ochre-600">Needs human review</p> : null}
    </div>
  );
}

// ─────────────────────────── Misc ───────────────────────────

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
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
      className="inline-flex shrink-0 items-center justify-center rounded bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
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
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col">
      <span className="label-micro font-medium text-ink-400">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</span>
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
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="label-micro font-semibold text-ink-500">{children}</h2>
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
          ? "bg-brand-700 text-canvas hover:bg-brand-800"
          : "border border-ink-200 bg-panel text-ink-700 hover:bg-ink-100/50",
      )}
    >
      {children}
    </Link>
  );
}
