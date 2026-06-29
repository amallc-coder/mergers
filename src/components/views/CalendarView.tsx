"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { useData, useRepoData } from "@/lib/data/DataProvider";
import { dataApi } from "@/lib/data/snapshot-client";
import { NOW } from "@/lib/data/seed";
import { formatDateTime } from "@/lib/format";
import { SourceBadge, txHref, ViewLoading } from "./shared";

const MEETING_TYPES = ["Management Call", "Site Visit", "QoE Review", "Closing", "Other"];

export function CalendarView() {
  const { source, refresh } = useData();
  const { data, loading } = useRepoData(async (repo) => {
    const [meetings, transactions] = await Promise.all([repo.meetings(), repo.transactions()]);
    return { meetings, transactions };
  });
  const live = source === "live";
  const [showForm, setShowForm] = useState(false);

  const txName = data ? Object.fromEntries(data.transactions.map((t) => [t.id, t.practiceName])) : {};
  const sorted = data ? [...data.meetings].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()) : [];
  const upcoming = sorted.filter((m) => new Date(m.start) >= NOW);
  const past = sorted.filter((m) => new Date(m.start) < NOW);

  return (
    <>
      <PageHeader title="Calendar" subtitle="Outlook-synced diligence meetings across transactions" />
      <div className="mb-3 flex items-center justify-between">
        <SourceBadge source={source} />
        {live && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-800"
          >
            <CalendarPlus size={14} /> Schedule meeting
          </button>
        )}
      </div>

      {live && showForm && data && (
        <div className="mb-6">
          <ScheduleMeetingForm
            transactions={data.transactions.map((t) => ({ id: t.id, name: t.practiceName }))}
            onDone={() => {
              setShowForm(false);
              refresh();
            }}
          />
        </div>
      )}

      {!data || loading ? (
        <ViewLoading label="Loading calendar…" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Upcoming" icon={<CalendarClock size={18} />} subtitle={`${upcoming.length} meeting(s)`} />
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled" />
            ) : (
              <div className="divide-y divide-ink-100">
                {upcoming.map((m) => (
                  <div key={m.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink-900">{m.title}</p>
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{m.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(m.start)}</p>
                    <div className="flex items-center gap-2">
                      <Link href={txHref(m.transactionId)} className="text-xs text-brand-600 hover:text-brand-700">
                        {txName[m.transactionId]}
                      </Link>
                      {m.onlineMeetingUrl && (
                        <a
                          href={m.onlineMeetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-600 hover:text-brand-700"
                        >
                          · Join
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Past" subtitle={`${past.length} meeting(s)`} />
            {past.length === 0 ? (
              <EmptyState title="No past meetings" />
            ) : (
              <div className="divide-y divide-ink-100">
                {past.map((m) => (
                  <div key={m.id} className="px-5 py-3">
                    <p className="text-sm text-ink-700">{m.title}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(m.start)} · {txName[m.transactionId]}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function ScheduleMeetingForm({
  transactions,
  onDone,
}: {
  transactions: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [transactionId, setTransactionId] = useState(transactions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState(MEETING_TYPES[0]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [attendees, setAttendees] = useState("");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputCls = "w-full rounded-lg border border-ink-200 bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-brand-400";

  async function submit() {
    setErr(null);
    if (!transactionId || !title.trim() || !start || !end) {
      setErr("Practice, title, start and end are required.");
      return;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setErr("End time must be after the start time.");
      return;
    }
    setBusy(true);
    try {
      const res = await dataApi.scheduleMeeting({
        transactionId,
        title: title.trim(),
        type,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        online,
        attendeeEmails: attendees
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (!res.invited) {
        // Stored, but Outlook invite couldn't be sent (e.g. mailbox not configured).
        setErr("Meeting saved, but the Outlook invite could not be sent yet.");
        setTimeout(onDone, 1200);
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Schedule a meeting" icon={<CalendarPlus size={18} />} subtitle="Sends Outlook invites to attendees" />
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink-500">
          Practice
          <select value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className={`mt-1 ${inputCls}`}>
            {transactions.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-500">
          Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 ${inputCls}`}>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-500 sm:col-span-2">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Management call — Q3 financials" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-medium text-ink-500">
          Start
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-medium text-ink-500">
          End
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs font-medium text-ink-500 sm:col-span-2">
          Attendee emails (comma or space separated)
          <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="seller@example.com, analyst@ammservice.com" className={`mt-1 ${inputCls}`} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-500">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          Add Microsoft Teams online meeting
        </label>
      </div>
      {err && <p className="px-5 pb-2 text-xs text-rust-600">{err}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
        <button onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-50">
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-800 disabled:opacity-50"
        >
          <CalendarPlus size={13} /> {busy ? "Scheduling…" : "Schedule & send invites"}
        </button>
      </div>
    </Card>
  );
}
