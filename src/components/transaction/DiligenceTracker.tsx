"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { StatusChip, ReviewStatusChip, TimelineBadge } from "@/components/ui";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/domain/diligence-template";
import { DILIGENCE_STATUSES } from "@/lib/domain/types";
import type { CategoryKey, DiligenceRequestItem } from "@/lib/domain/types";
import { cn } from "@/lib/ui";
import { formatDate } from "@/lib/format";

type Quick = "overdue" | "missing" | "uploaded_not_reviewed" | "review_complete";

export function DiligenceTracker({
  items,
  nowIso,
  reviewerNames,
  contactNames,
}: {
  items: DiligenceRequestItem[];
  nowIso: string;
  reviewerNames: Record<string, string>;
  contactNames: Record<string, string>;
}) {
  const now = new Date(nowIso).getTime();
  const [timeline, setTimeline] = useState<"all" | "Pre Signing" | "Post Signing">("all");
  const [category, setCategory] = useState<"all" | CategoryKey>("all");
  const [status, setStatus] = useState<"all" | string>("all");
  const [quick, setQuick] = useState<Set<Quick>>(new Set());
  const [query, setQuery] = useState("");

  const isOverdue = (i: DiligenceRequestItem) =>
    i.status !== "Received" &&
    i.status !== "Not Applicable" &&
    !!i.dueDate &&
    new Date(i.dueDate).getTime() < now;
  const uploadedNotReviewed = (i: DiligenceRequestItem) =>
    i.documents.length > 0 &&
    i.internalReviewStatus !== "Internal Review Complete" &&
    i.internalReviewStatus !== "Accepted";

  const toggleQuick = (q: Quick) =>
    setQuick((prev) => {
      const next = new Set(prev);
      next.has(q) ? next.delete(q) : next.add(q);
      return next;
    });

  const filtered = useMemo(() => {
    const order = (c: CategoryKey) => CATEGORY_ORDER.indexOf(c);
    return items
      .filter((i) => (timeline === "all" ? true : i.neededTimeline === timeline))
      .filter((i) => (category === "all" ? true : i.category === category))
      .filter((i) => (status === "all" ? true : i.status === status))
      .filter((i) => (quick.has("overdue") ? isOverdue(i) : true))
      .filter((i) => (quick.has("missing") ? i.status === "Pending" : true))
      .filter((i) => (quick.has("uploaded_not_reviewed") ? uploadedNotReviewed(i) : true))
      .filter((i) =>
        quick.has("review_complete") ? i.internalReviewStatus === "Internal Review Complete" : true,
      )
      .filter((i) => (query ? i.name.toLowerCase().includes(query.toLowerCase()) : true))
      .sort((a, b) => order(a.category) - order(b.category) || a.templateItemKey.localeCompare(b.templateItemKey));
  }, [items, timeline, category, status, quick, query, now]);

  const quickDefs: { key: Quick; label: string }[] = [
    { key: "overdue", label: "Overdue" },
    { key: "missing", label: "Missing" },
    { key: "uploaded_not_reviewed", label: "Uploaded · not reviewed" },
    { key: "review_complete", label: "Review complete" },
  ];

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5">
          <Search size={15} className="text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items"
            className="w-40 bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
        </div>

        <Select value={timeline} onChange={(v) => setTimeline(v as typeof timeline)}>
          <option value="all">All timelines</option>
          <option value="Pre Signing">Pre Signing</option>
          <option value="Post Signing">Post Signing</option>
        </Select>

        <Select value={category} onChange={(v) => setCategory(v as typeof category)}>
          <option value="all">All categories</option>
          {CATEGORY_ORDER.filter((c) => c !== "other" && c !== "unclassified_review_queue").map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </Select>

        <Select value={status} onChange={(v) => setStatus(v)}>
          <option value="all">All statuses</option>
          {DILIGENCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <span className="mx-1 hidden h-5 w-px bg-ink-200 sm:block" />
        <Filter size={14} className="text-ink-400" />
        {quickDefs.map((q) => (
          <button
            key={q.key}
            onClick={() => toggleQuick(q.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              quick.has(q.key)
                ? "bg-brand-600 text-white ring-brand-600"
                : "bg-panel text-ink-600 ring-ink-200 hover:bg-ink-50",
            )}
          >
            {q.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-400">
          {filtered.length} of {items.length} items
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-panel">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium">Timeline</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Review</th>
              <th className="px-3 py-2.5 font-medium">Due</th>
              <th className="px-3 py-2.5 font-medium">Reviewer</th>
              <th className="px-3 py-2.5 text-center font-medium">Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((i) => {
              const overdue = isOverdue(i);
              return (
                <tr key={i.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-800">{i.name}</span>
                      {i.criticalPreSigning ? (
                        <span className="rounded bg-rust-50 px-1 text-[10px] font-semibold text-rust-600">
                          critical
                        </span>
                      ) : null}
                      {i.sensitive ? (
                        <span className="rounded bg-ink-100 px-1 text-[10px] font-semibold text-ink-500">
                          sensitive
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-ink-400">{CATEGORY_META[i.category].label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <TimelineBadge timeline={i.neededTimeline} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={i.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ReviewStatusChip status={i.internalReviewStatus} />
                  </td>
                  <td className={cn("px-3 py-2.5 text-xs", overdue ? "font-semibold text-rust-600" : "text-ink-500")}>
                    {i.dueDate ? formatDate(i.dueDate) : "—"}
                    {overdue ? " · overdue" : ""}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-600">
                    {i.assignedInternalReviewerId ? reviewerNames[i.assignedInternalReviewerId] ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs tabular-nums text-ink-600">
                    {i.documents.length || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5 text-sm text-ink-700 outline-none focus:border-brand-400"
    >
      {children}
    </select>
  );
}
