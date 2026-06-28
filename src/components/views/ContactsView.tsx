"use client";

/** Feature 3 — Contacts. Global people (internal / external / seller) with their
 *  deal associations, functional roles, and communication history. Sellers can be
 *  attached to multiple deals (many-to-many). */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Plus, UserPlus, X } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { useData } from "@/lib/data/DataProvider";
import { FUNCTIONAL_ROLES } from "@/lib/domain/types";
import type { Transaction } from "@/lib/domain/types";
import { SourceBadge, txHref, ViewLoading } from "./shared";

const TYPES = [
  { key: "internal", label: "Internal deal team" },
  { key: "seller", label: "Sellers" },
  { key: "external", label: "Other external" },
];

export function ContactsView() {
  const { repo, source, people, contactLinks, communications, addContact, linkContact, unlinkContact } = useData();
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void repo.transactions().then((t) => !c && setTxs(t));
    return () => {
      c = true;
    };
  }, [repo]);

  const txName = useMemo(() => Object.fromEntries((txs ?? []).map((t) => [t.id, t.practiceName])), [txs]);
  const live = source === "live";

  if (!txs) {
    return (
      <>
        <PageHeader title="Contacts" subtitle="Internal team, sellers, and external contacts across all deals" />
        <ViewLoading label="Loading contacts…" />
      </>
    );
  }

  async function run(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={`${people.length} contact(s) across ${txs.length} deals`}
        action={
          <button
            onClick={() => setAdding((v) => !v)}
            disabled={!live}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={16} /> Add contact
          </button>
        }
      />

      <div className="mb-3">
        <SourceBadge source={source} />
      </div>
      {err && <p className="mb-3 text-xs text-amber-600">{err}</p>}
      {!live && <p className="mb-3 text-xs text-ink-400">Read-only in sample mode — unlock the live backend to add or edit contacts.</p>}

      {adding && live && (
        <AddContactForm
          transactions={txs}
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            await run(() => addContact(input));
            setAdding(false);
          }}
        />
      )}

      <div className="space-y-6">
        {TYPES.map((group) => {
          const list = people.filter((p) => p.type === group.key);
          return (
            <Card key={group.key}>
              <CardHeader title={group.label} subtitle={`${list.length} contact(s)`} />
              {list.length === 0 ? (
                <div className="px-5 py-4 text-sm text-ink-400">None yet.</div>
              ) : (
                <div className="divide-y divide-ink-100">
                  {list.map((p) => {
                    const links = contactLinks.filter((l) => l.contactId === p.id);
                    const comms = communications.filter((c) => c.contactId === p.id);
                    const lastComm = comms[0];
                    return (
                      <div key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                        <Avatar name={p.name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-900">{p.name}</p>
                          <p className="truncate text-xs text-ink-400">
                            {[p.title, p.email, p.phone].filter(Boolean).join(" · ")}
                          </p>
                          {p.functionalRoles.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.functionalRoles.map((r) => (
                                <Badge key={r} className="bg-brand-50 text-brand-700 ring-brand-600/20">{r}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {links.map((l) => (
                              <span key={l.transactionId} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                                <Link href={txHref(l.transactionId)} className="hover:text-brand-700">
                                  {txName[l.transactionId] ?? "deal"}
                                </Link>
                                {l.isPrimary ? <span className="text-brand-600">★</span> : null}
                                {live && (
                                  <button onClick={() => void run(() => unlinkContact(p.id, l.transactionId))} className="text-ink-300 hover:text-rust-600">
                                    <X size={11} />
                                  </button>
                                )}
                              </span>
                            ))}
                            {live && (
                              <AttachDeal
                                transactions={txs}
                                exclude={links.map((l) => l.transactionId)}
                                onAttach={(txId) => void run(() => linkContact(p.id, txId))}
                              />
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-ink-400">
                          {comms.length > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail size={12} /> {comms.length} sent
                              {lastComm?.status ? ` · ${lastComm.status}` : ""}
                            </span>
                          ) : (
                            <span className="text-ink-300">No emails</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function AttachDeal({
  transactions,
  exclude,
  onAttach,
}: {
  transactions: Transaction[];
  exclude: string[];
  onAttach: (txId: string) => void;
}) {
  const options = transactions.filter((t) => !exclude.includes(t.id));
  if (options.length === 0) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onAttach(e.target.value)}
      className="rounded-full border border-dashed border-ink-300 bg-panel px-2 py-0.5 text-[11px] text-ink-500"
    >
      <option value="">+ attach to deal</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>{t.practiceName}</option>
      ))}
    </select>
  );
}

function AddContactForm({
  transactions,
  onCancel,
  onSubmit,
}: {
  transactions: Transaction[];
  onCancel: () => void;
  onSubmit: (input: {
    transactionId?: string;
    type?: string;
    name: string;
    email: string;
    phone?: string;
    role?: string;
    functionalRoles?: string[];
  }) => Promise<void>;
}) {
  const [type, setType] = useState("internal");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [dealId, setDealId] = useState("");
  const [busy, setBusy] = useState(false);

  const inputCls = "w-full rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5 text-sm";

  return (
    <Card className="mb-5">
      <CardHeader title={<span className="flex items-center gap-2"><UserPlus size={15} /> New contact</span>} />
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option value="internal">Internal</option>
            <option value="seller">Seller</option>
            <option value="external">External</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Email *</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </label>
        {type === "internal" && (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-500">Functional roles</span>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONAL_ROLES.map((r) => (
                <label key={r} className="inline-flex items-center gap-1 text-xs text-ink-600">
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={(e) => setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-ink-500">Attach to deal (optional)</span>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={inputCls}>
            <option value="">— none —</option>
            {transactions.map((t) => (
              <option key={t.id} value={t.id}>{t.practiceName}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
        <button onClick={onCancel} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50">Cancel</button>
        <button
          disabled={busy || name.trim().length < 1 || email.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            await onSubmit({
              transactionId: dealId || undefined,
              type,
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              functionalRoles: type === "internal" ? roles : undefined,
              role: type === "seller" ? "Seller" : undefined,
            });
            setBusy(false);
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add contact
        </button>
      </div>
    </Card>
  );
}
