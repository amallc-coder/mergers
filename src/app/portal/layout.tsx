import { ShieldCheck } from "lucide-react";
import "../globals.css";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-panel">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <ShieldCheck size={18} />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink-900">Secure Seller Portal</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">clinilytics M&amp;A</p>
            </div>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
            Encrypted · Access-controlled
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-xs text-ink-400 sm:px-6">
        This portal shows only documents requested from you for this transaction. Your data is confidential
        and is not shared with other parties.
      </footer>
    </div>
  );
}
