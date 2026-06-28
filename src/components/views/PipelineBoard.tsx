"use client";

/**
 * Feature 4 — deal pipeline Kanban. Columns are the configurable pipeline stages;
 * cards are deals. Drag a card to another column (or use the per-card menu) to
 * move the deal between stages; the change is persisted via setStage (which also
 * writes the audit log + stage history) and the board refreshes. Shows
 * time-in-stage on each card. Live backend only — seed mode is read-only.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { GripVertical, Loader2 } from "lucide-react";
import { RiskBadge } from "@/components/ui";
import { useData } from "@/lib/data/DataProvider";
import type { Transaction } from "@/lib/domain/types";
import { txHref } from "./shared";

function daysInStage(enteredAt?: string): string {
  if (!enteredAt) return "—";
  const ms = Date.now() - new Date(enteredAt).getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days === 0) return "today";
  return `${days}d in stage`;
}

export function PipelineBoard() {
  const { repo, pipelineStages, source, setStage } = useData();
  const [deals, setDeals] = useState<Transaction[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void repo.transactions().then((t) => {
      if (!cancelled) setDeals(t);
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const stages = [...pipelineStages].sort((a, b) => a.sortOrder - b.sortOrder);
  const live = source === "live";

  async function move(id: string, stageLabel: string, current: string) {
    if (stageLabel === current) return;
    if (!live) {
      setErr("Unlock the live backend (enter the access passcode) to move deals.");
      return;
    }
    setErr(null);
    setMoving(id);
    try {
      await setStage(id, stageLabel);
      // setStage refreshes the snapshot → repo changes → effect reloads deals.
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMoving(null);
    }
  }

  if (!deals) {
    return (
      <div className="flex items-center gap-2 py-10 text-ink-400">
        <Loader2 size={16} className="animate-spin" /> Loading pipeline…
      </div>
    );
  }

  return (
    <div>
      {err && <p className="mb-3 text-xs text-amber-600">{err}</p>}
      {!live && (
        <p className="mb-3 text-xs text-ink-400">Read-only in sample mode — unlock the live backend to move deals.</p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((st) => {
          const inStage = deals.filter((d) => d.stage === st.label);
          return (
            <div
              key={st.key}
              onDragOver={(e) => {
                if (live) e.preventDefault();
              }}
              onDrop={() => {
                if (dragId) {
                  const d = deals.find((x) => x.id === dragId);
                  if (d) void move(dragId, st.label, d.stage);
                }
                setDragId(null);
              }}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-ink-200 bg-ink-50/50"
            >
              <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
                <span className={`text-xs font-semibold ${st.isTerminal ? "text-ink-400" : "text-ink-700"}`}>
                  {st.label}
                </span>
                <span className="rounded-full bg-ink-200 px-1.5 text-[10px] font-semibold text-ink-600">
                  {inStage.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {inStage.map((d) => (
                  <div
                    key={d.id}
                    draggable={live}
                    onDragStart={() => setDragId(d.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`group rounded-lg border border-ink-200 bg-panel p-2.5 shadow-sm ${
                      live ? "cursor-grab active:cursor-grabbing" : ""
                    } ${moving === d.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      {live && <GripVertical size={13} className="mt-0.5 shrink-0 text-ink-300" />}
                      <div className="min-w-0 flex-1">
                        <Link href={txHref(d.id)} className="block truncate text-sm font-medium text-ink-900 hover:text-brand-700">
                          {d.practiceName}
                        </Link>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] text-ink-400">
                            {d.specialty || d.state || "—"}
                          </span>
                          <RiskBadge level={d.riskLevel} />
                        </div>
                        <p className="mt-1 text-[10px] text-ink-400">{daysInStage(d.stageEnteredAt)}</p>
                        {live && (
                          <select
                            aria-label="Move to stage"
                            value={d.stage}
                            onChange={(e) => void move(d.id, e.target.value, d.stage)}
                            className="mt-1.5 w-full rounded border border-ink-200 bg-ink-50 px-1 py-0.5 text-[11px] text-ink-600"
                          >
                            {stages.map((s) => (
                              <option key={s.key} value={s.label}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {inStage.length === 0 && (
                  <p className="px-1 py-3 text-center text-[11px] text-ink-300">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
