"use client";

import { useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { BrandMark } from "@/components/Brand";
import { ROLE_LABELS } from "@/lib/domain/rbac";
import { cn } from "@/lib/ui";
import { setAppKey } from "@/lib/sharepoint/client";
import { isLiveBackend } from "@/lib/data/snapshot-client";

export function LoginScreen() {
  const { config, login, loginAs } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // With a live backend, the password IS the access passcode that unlocks the
  // database — set it on sign-in so the app loads live data immediately (and keeps
  // doing so after a cache clear), instead of ever falling back to demo data.
  const live = isLiveBackend();
  const activeUsers = config.users.filter((u) => u.active);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed.");
      return;
    }
    if (live && password.trim()) setAppKey(password.trim());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark size={40} />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight text-ink-900">clinilytics</p>
            <p className="label-micro text-ink-400">M&amp;A · Healthcare Diligence</p>
          </div>
        </div>

        <div className="rounded-xl border border-ink-200 bg-panel p-6 shadow-card">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-ink-800">Sign in</h1>
          <p className="mt-1 text-xs text-ink-500">
            {live
              ? "Sign in with your work email and the team access passcode to load live data."
              : "Access is role-based. Sign in to continue."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <Field label="Work email">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="npatel@amadministrators.com"
                className="input"
                required
              />
            </Field>
            <Field label={live ? "Access passcode" : "Password"}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required={live}
              />
            </Field>
            {error ? <p className="text-xs font-medium text-rust-600">{error}</p> : null}
            <button type="submit" className="btn btn-primary w-full">
              <LogIn size={15} /> Sign in
            </button>
          </form>

          {/* Demo-account shortcuts bypass the passcode, so they'd show sample data.
              Only offer them when no live backend is configured (local/demo builds). */}
          {!live && (
            <div className="mt-5 border-t border-ink-200/70 pt-4">
              <p className="label-micro mb-2 text-ink-400">Demo accounts — click to sign in</p>
              <div className="flex flex-col gap-1.5">
                {activeUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => loginAs(u.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border border-ink-200 bg-canvas px-3 py-1.5 text-left text-xs transition-colors hover:border-brand-300 hover:bg-brand-50",
                    )}
                  >
                    <span className="font-medium text-ink-800">{u.name}</span>
                    <span className="text-ink-500">{ROLE_LABELS[u.role]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-400">
          <ShieldCheck size={12} />{" "}
          {live
            ? "Your passcode unlocks live data on this device and is stored only in your browser."
            : "Demo auth (any password). Production uses Supabase / Microsoft Entra ID with MFA."}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-micro mb-1 block text-ink-400">{label}</span>
      {children}
    </label>
  );
}
