"use client";

/** Feature 1 — create a transaction and provision its SharePoint data room.
 *  The deal saves even if SharePoint provisioning fails (clear error + retry). */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useData } from "@/lib/data/DataProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { txHref } from "./shared";

export function NewTransactionModal({ onClose }: { onClose: () => void }) {
  const { source, pipelineStages, createTransaction, provisionDataRoom } = useData();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [practiceName, setPracticeName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [state, setState] = useState("");
  const [stage, setStage] = useState(pipelineStages[0]?.label ?? "Prospect / Sourced");
  const [sellerName, setSellerName] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");

  const [phase, setPhase] = useState<"form" | "working" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; provisioningError?: string } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const live = source === "live";
  const canSubmit = live && practiceName.trim().length > 1 && phase === "form";

  async function submit() {
    setError(null);
    setPhase("working");
    try {
      const r = await createTransaction({
        practiceName: practiceName.trim(),
        specialty: specialty.trim() || undefined,
        state: state.trim() || undefined,
        stage,
        actorName: currentUser?.name,
        sellerName: sellerName.trim() || undefined,
        sellerEmail: sellerEmail.trim() || undefined,
      });
      setResult({ id: r.id, provisioningError: r.provisioningError });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("form");
    }
  }

  async function retryProvision() {
    if (!result) return;
    setRetrying(true);
    try {
      await provisionDataRoom(result.id, practiceName.trim());
      setResult({ id: result.id, provisioningError: undefined });
    } catch (e) {
      setResult({ id: result.id, provisioningError: e instanceof Error ? e.message : String(e) });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-ink-200 bg-panel shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-900">New transaction</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={18} />
          </button>
        </div>

        {!live ? (
          <div className="px-5 py-6 text-sm text-ink-500">
            Creating deals writes to the live backend. Enter the SharePoint access passcode on the Data Rooms
            page to unlock, then try again.
          </div>
        ) : phase === "done" && result ? (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={18} /> Transaction created.
            </div>
            {result.provisioningError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="mb-1 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={14} /> SharePoint provisioning failed
                </div>
                <p className="mb-2">{result.provisioningError}</p>
                <button
                  onClick={() => void retryProvision()}
                  disabled={retrying}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {retrying ? <Loader2 size={13} className="animate-spin" /> : null} Retry provisioning
                </button>
              </div>
            ) : (
              <p className="text-xs text-ink-500">The SharePoint data room was provisioned.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50">
                Close
              </button>
              <button
                onClick={() => router.push(txHref(result.id))}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Open data room →
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
            {error && <p className="text-xs text-amber-600">{error}</p>}
            <Field label="Target practice name *">
              <input autoFocus value={practiceName} onChange={(e) => setPracticeName(e.target.value)} className={inputCls} placeholder="e.g. Dr. Smith Family Medicine" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Specialty">
                <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls} placeholder="Family Medicine" />
              </Field>
              <Field label="State">
                <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} placeholder="TX" />
              </Field>
            </div>
            <Field label="Initial stage">
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
                {[...pipelineStages].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => (
                  <option key={s.key} value={s.label}>{s.label}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Seller name (optional)">
                <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className={inputCls} placeholder="Dr. Smith" />
              </Field>
              <Field label="Seller email (optional)">
                <input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} className={inputCls} placeholder="smith@practice.com" />
              </Field>
            </div>
            <p className="text-[11px] text-ink-400">
              Creates the deal with its full diligence checklist and provisions the standard SharePoint data
              room (10 categories + AMA + Intake) under M&amp;A Diligence.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50">
                Cancel
              </button>
              <button
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === "working" ? <Loader2 size={14} className="animate-spin" /> : null}
                {phase === "working" ? "Creating + provisioning…" : "Create transaction"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5 text-sm text-ink-800 focus:border-brand-400 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}
