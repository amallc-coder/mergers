"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  FolderPlus,
  Loader2,
  Lock,
  RefreshCw,
  Unlock,
} from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import {
  clearAppKey,
  hasAppKey,
  isSharePointConfigured,
  setAppKey,
  sharePoint,
  type SharePointFile,
  type SharePointStatus,
} from "@/lib/sharepoint/client";

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type Async = "idle" | "loading" | "ok" | "error";

export function SharePointPanel({ variant = "full" }: { variant?: "full" | "status" }) {
  const configured = isSharePointConfigured();

  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");

  const [statusState, setStatusState] = useState<Async>("idle");
  const [status, setStatus] = useState<SharePointStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusState("loading");
    setStatusError(null);
    try {
      const s = await sharePoint.status();
      setStatus(s);
      setStatusState("ok");
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
      setStatusState("error");
    }
  }, []);

  // localStorage is client-only; read it after mount to avoid hydration mismatch.
  useEffect(() => {
    setMounted(true);
    if (configured && hasAppKey()) {
      setUnlocked(true);
      void loadStatus();
    }
  }, [configured, loadStatus]);

  const unlock = useCallback(() => {
    if (!passInput.trim()) return;
    setAppKey(passInput);
    setPassInput("");
    setUnlocked(true);
    void loadStatus();
  }, [passInput, loadStatus]);

  const lock = useCallback(() => {
    clearAppKey();
    setUnlocked(false);
    setStatus(null);
    setStatusState("idle");
    setStatusError(null);
  }, []);

  // ── Not configured ────────────────────────────────────────────────
  if (!configured) {
    return (
      <Card>
        <CardHeader title="SharePoint" subtitle="Microsoft Graph integration" icon={<Cloud size={18} />} />
        <div className="px-5 py-4">
          <Badge className="badge badge-neutral">Not configured</Badge>
          <p className="mt-2 text-sm text-ink-500">
            This build has no Supabase connection. Set <code className="text-ink-700">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and <code className="text-ink-700">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> at build time to enable live
            SharePoint.
          </p>
        </div>
      </Card>
    );
  }

  // Avoid flashing the locked state during hydration.
  if (!mounted) {
    return (
      <Card>
        <CardHeader title="SharePoint" subtitle="Microsoft Graph integration" icon={<Cloud size={18} />} />
        <div className="px-5 py-6 text-sm text-ink-400">
          <Loader2 size={16} className="mr-2 inline animate-spin" /> Loading…
        </div>
      </Card>
    );
  }

  // ── Locked (needs passcode) ───────────────────────────────────────
  if (!unlocked) {
    return (
      <Card>
        <CardHeader title="SharePoint" subtitle="Enter the team access passcode" icon={<Lock size={18} />} />
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-ink-500">
            SharePoint actions are protected by a shared passcode so the public app can&apos;t be used by anyone
            outside your team. Enter it once on this device to unlock.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              className="input"
              placeholder="Access passcode"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
            />
            <button className="btn btn-primary shrink-0" onClick={unlock} disabled={!passInput.trim()}>
              <Unlock size={15} /> Unlock
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const connected = statusState === "ok" && status?.connected;

  return (
    <Card>
      <CardHeader
        title="SharePoint"
        subtitle="Merger & Acquisition site · live"
        icon={<Cloud size={18} />}
        action={
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={loadStatus} title="Re-check connection">
              <RefreshCw size={14} className={statusState === "loading" ? "animate-spin" : ""} /> Re-check
            </button>
            <button className="btn btn-ghost" onClick={lock} title="Lock (clear passcode on this device)">
              <Lock size={14} /> Lock
            </button>
          </div>
        }
      />

      {/* Connection banner */}
      <div className="border-b border-ink-100 px-5 py-3">
        {statusState === "loading" && (
          <span className="inline-flex items-center gap-2 text-sm text-ink-500">
            <Loader2 size={15} className="animate-spin" /> Checking connection…
          </span>
        )}
        {statusState === "error" && (
          <div className="flex items-start gap-2 text-sm text-rust-600">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}
        {statusState === "ok" && status && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge className={`badge ${connected ? "badge-sage" : "badge-rust"}`}>
              {connected ? (
                <>
                  <CheckCircle2 size={12} /> Connected
                </>
              ) : (
                <>
                  <AlertTriangle size={12} /> Not connected
                </>
              )}
            </Badge>
            {status.driveName && <span className="text-ink-600">Library: {status.driveName}</span>}
            <span className="text-ink-400">·</span>
            <span className="text-ink-500">Root: {status.rootFolder}</span>
            {status.driveWebUrl && (
              <a
                href={status.driveWebUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
              >
                Open in SharePoint <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}
      </div>

      {variant === "full" && connected && <FullControls />}
    </Card>
  );
}

// ── Provision + browse (full variant) ────────────────────────────────

function FullControls() {
  const [practice, setPractice] = useState("");

  const [provState, setProvState] = useState<Async>("idle");
  const [provMsg, setProvMsg] = useState<string | null>(null);

  const [listState, setListState] = useState<Async>("idle");
  const [files, setFiles] = useState<SharePointFile[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listedPractice, setListedPractice] = useState("");

  const provision = useCallback(async () => {
    if (!practice.trim()) return;
    setProvState("loading");
    setProvMsg(null);
    try {
      const r = await sharePoint.ensureDataRoom(practice.trim());
      const count = Object.keys(r.folders).length;
      setProvMsg(`Ready: “${r.dataRoom.name}” with ${count} category folders.`);
      setProvState("ok");
    } catch (e) {
      setProvMsg(e instanceof Error ? e.message : String(e));
      setProvState("error");
    }
  }, [practice]);

  const loadDocs = useCallback(async () => {
    if (!practice.trim()) return;
    setListState("loading");
    setListError(null);
    try {
      const r = await sharePoint.listDocuments(practice.trim());
      setFiles(r.files);
      setListedPractice(practice.trim());
      setListState("ok");
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setListState("error");
    }
  }, [practice]);

  const grouped = (files ?? []).reduce<Record<string, SharePointFile[]>>((acc, f) => {
    const key = f.categoryFolder || "Uncategorized";
    (acc[key] ??= []).push(f);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="space-y-5 px-5 py-4">
      <div>
        <label className="stat-label">Practice / deal name</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            placeholder="e.g. Dr. Stein"
            value={practice}
            onChange={(e) => setPractice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && provision()}
          />
          <button className="btn btn-primary" onClick={provision} disabled={!practice.trim() || provState === "loading"}>
            {provState === "loading" ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />}
            Create / sync data room
          </button>
          <button
            className="btn btn-secondary"
            onClick={loadDocs}
            disabled={!practice.trim() || listState === "loading"}
          >
            {listState === "loading" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Load documents
          </button>
        </div>
        {provMsg && (
          <p className={`mt-2 text-sm ${provState === "error" ? "text-rust-600" : "text-brand-700"}`}>{provMsg}</p>
        )}
      </div>

      {/* Documents */}
      {listState === "error" && (
        <div className="flex items-start gap-2 text-sm text-rust-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {listError}
        </div>
      )}
      {listState === "ok" && files && (
        <div>
          <p className="mb-2 text-xs text-ink-500">
            <span className="font-medium text-ink-700">{files.length}</span> file(s) in{" "}
            <span className="font-medium text-ink-700">Data Room - {listedPractice}</span>
          </p>
          {files.length === 0 ? (
            <EmptyState
              title="No documents yet"
              hint="Upload files into this data room in SharePoint, then re-load."
            />
          ) : (
            <div className="space-y-4">
              {groupKeys.map((cat) => (
                <div key={cat}>
                  <p className="mb-1 text-xs font-semibold text-ink-700">{cat}</p>
                  <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                    {grouped[cat].map((f) => (
                      <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                        <FileText size={15} className="shrink-0 text-ink-400" />
                        <a
                          href={f.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-sm text-ink-800 hover:text-brand-600"
                        >
                          {f.name}
                        </a>
                        <span className="shrink-0 text-xs tabular-nums text-ink-400">{formatBytes(f.sizeBytes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
