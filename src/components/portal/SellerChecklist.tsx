"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, MessageSquarePlus, Upload, FileCheck2 } from "lucide-react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/domain/diligence-template";
import type { CategoryKey } from "@/lib/domain/types";
import { cn } from "@/lib/ui";
import { formatDate } from "@/lib/format";

/** The strictly seller-safe projection of a request item (no internal fields). */
export interface SellerItem {
  id: string;
  category: CategoryKey;
  name: string;
  neededTimeline: "Pre Signing" | "Post Signing";
  sensitive: boolean;
  status: "Received" | "Pending" | "Not Applicable" | "Denied";
  dueDate?: string;
  documentNames: string[];
  sellerFacingNotes: string[];
  thread: { author: string; body: string; at: string }[];
  overdue: boolean;
}

export function SellerChecklist({ items: initial }: { items: SellerItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "outstanding" | "completed">("outstanding");
  const [open, setOpen] = useState<string | null>(null);

  const markNA = (id: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: i.status === "Not Applicable" ? "Pending" : "Not Applicable" } : i)),
    );

  const visible = useMemo(() => {
    const f = items.filter((i) =>
      filter === "all"
        ? true
        : filter === "completed"
          ? i.status === "Received" || i.status === "Not Applicable"
          : i.status === "Pending" || i.status === "Denied",
    );
    const order = (c: CategoryKey) => CATEGORY_ORDER.indexOf(c);
    return f.sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name));
  }, [items, filter]);

  const grouped = useMemo(() => {
    const map = new Map<CategoryKey, SellerItem[]>();
    for (const i of visible) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["outstanding", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium capitalize ring-1 ring-inset transition-colors",
              filter === f ? "bg-brand-600 text-white ring-brand-600" : "bg-panel text-ink-600 ring-ink-200 hover:bg-ink-50",
            )}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-400">{visible.length} item(s)</span>
      </div>

      <div className="space-y-6">
        {grouped.map(([cat, catItems]) => (
          <div key={cat}>
            <h3 className="mb-2 text-sm font-semibold text-ink-700">{CATEGORY_META[cat].label}</h3>
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-panel">
              {catItems.map((i) => (
                <div key={i.id} className="border-b border-ink-100 last:border-b-0">
                  <button
                    onClick={() => setOpen(open === i.id ? null : i.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50/60"
                  >
                    <StatusIcon status={i.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-800">
                        {i.name}
                        {i.sensitive ? (
                          <span className="ml-2 rounded bg-ink-100 px-1 text-[10px] font-semibold text-ink-500">
                            secure request
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-400">
                        {i.neededTimeline}
                        {i.dueDate ? ` · due ${formatDate(i.dueDate)}` : ""}
                        {i.overdue ? <span className="font-semibold text-rust-500"> · overdue</span> : ""}
                      </p>
                    </div>
                    <SellerStatusBadge status={i.status} />
                    <ChevronDown
                      size={16}
                      className={cn("shrink-0 text-ink-300 transition-transform", open === i.id ? "rotate-180" : "")}
                    />
                  </button>

                  {open === i.id ? (
                    <div className="space-y-3 border-t border-ink-100 bg-ink-50/40 px-4 py-3">
                      {/* Upload */}
                      {i.sensitive ? (
                        <div className="rounded-lg border border-ochre-200 bg-ochre-50 px-3 py-2 text-xs text-ochre-600">
                          This is a secure credential request. Do not enter passwords here — you’ll receive a
                          separate encrypted link to submit access securely.
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink-200 bg-panel px-4 py-6 text-center">
                          <Upload size={20} className="text-ink-300" />
                          <p className="text-sm font-medium text-ink-600">Drag &amp; drop files here</p>
                          <p className="text-xs text-ink-400">or click to browse · multiple files allowed</p>
                        </div>
                      )}

                      {/* Uploaded files */}
                      {i.documentNames.length > 0 ? (
                        <div className="space-y-1">
                          {i.documentNames.map((d) => (
                            <div key={d} className="flex items-center gap-2 rounded-md bg-panel px-3 py-1.5 text-sm text-ink-700 ring-1 ring-ink-100">
                              <FileCheck2 size={14} className="text-brand-500" /> {d}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Seller-facing notes */}
                      {i.sellerFacingNotes.map((n, idx) => (
                        <p key={idx} className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-700">
                          {n}
                        </p>
                      ))}

                      {/* Thread */}
                      {i.thread.length > 0 ? (
                        <div className="space-y-1.5">
                          {i.thread.map((m, idx) => (
                            <div key={idx} className="rounded-md bg-panel px-3 py-2 text-sm ring-1 ring-ink-100">
                              <p className="text-ink-700">{m.body}</p>
                              <p className="mt-0.5 text-[11px] text-ink-400">
                                {m.author} · {formatDate(m.at)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <button className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50">
                          <MessageSquarePlus size={14} /> Ask a question
                        </button>
                        <button
                          onClick={() => markNA(i.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
                            i.status === "Not Applicable"
                              ? "bg-ink-100 text-ink-600 ring-ink-200"
                              : "bg-panel text-ink-600 ring-ink-200 hover:bg-ink-50",
                          )}
                        >
                          {i.status === "Not Applicable" ? "Marked N/A — undo" : "Mark not applicable"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: SellerItem["status"] }) {
  if (status === "Received") return <CheckCircle2 size={18} className="shrink-0 text-brand-500" />;
  if (status === "Not Applicable") return <CheckCircle2 size={18} className="shrink-0 text-ink-300" />;
  return <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-ink-300" />;
}

function SellerStatusBadge({ status }: { status: SellerItem["status"] }) {
  const styles: Record<SellerItem["status"], string> = {
    Received: "bg-brand-50 text-brand-700 ring-brand-600/20",
    Pending: "bg-ochre-50 text-ochre-600 ring-ochre-600/20",
    "Not Applicable": "bg-ink-100 text-ink-600 ring-ink-500/20",
    Denied: "bg-rust-50 text-rust-700 ring-rust-600/20",
  };
  return (
    <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset sm:inline", styles[status])}>
      {status}
    </span>
  );
}
