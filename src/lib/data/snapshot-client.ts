/**
 * Client transport for the live application backend (`data` Edge Function).
 *
 * Mirrors the SharePoint client's auth model: the Supabase anon key authenticates
 * to the Edge platform, and the team access passcode (kept in localStorage, sent
 * as `appKey`) is required by the function. The service role + database access
 * live only inside the function — never in the browser bundle.
 *
 * Enabled when NEXT_PUBLIC_DATA_BACKEND=supabase and the Supabase env is present.
 */
import { getAppKey } from "../sharepoint/client";
import type { Snapshot } from "./snapshot";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BACKEND = process.env.NEXT_PUBLIC_DATA_BACKEND;

/** True when the build is configured to read live data from Supabase. */
export function isLiveBackend(): boolean {
  return BACKEND === "supabase" && !!SUPABASE_URL && !!ANON_KEY;
}

async function call<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("Live backend is not configured.");
  const appKey = getAppKey();
  if (!appKey) throw new Error("Locked: enter the access passcode to load live data.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action, appKey, ...args }),
  });

  let json: { ok?: boolean; result?: unknown; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Live data ${action} failed (${res.status})`);
  }
  if (res.status === 401) throw new Error("Access passcode rejected.");
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Live data ${action} failed (${res.status})`);
  return json.result as T;
}

export const dataApi = {
  snapshot: () => call<Snapshot>("snapshot"),
  patchRequestItem: (id: string, patch: Record<string, unknown>) =>
    call<unknown>("patchRequestItem", { id, ...patch }),
  upsertTask: (task: Record<string, unknown>) => call<unknown>("upsertTask", { task }),
  setStage: (transactionId: string, stage: string, actorName?: string, note?: string) =>
    call<{ id: string; stage: string; enteredAt: string }>("setStage", {
      transactionId,
      stage,
      actorName,
      note,
    }),
  createTransaction: (input: {
    practiceName: string;
    name?: string;
    specialty?: string;
    state?: string;
    stage?: string;
    actorName?: string;
  }) => call<{ id: string }>("createTransaction", input),
  patchTransaction: (transactionId: string, patch: Record<string, unknown>) =>
    call<unknown>("patchTransaction", { transactionId, ...patch }),
  addContact: (input: {
    transactionId?: string;
    type?: string;
    name: string;
    email: string;
    phone?: string;
    role?: string;
    isPrimary?: boolean;
    functionalRoles?: string[];
  }) => call<{ id: string }>("addContact", input),
  updateContact: (contactId: string, patch: Record<string, unknown>) =>
    call<unknown>("updateContact", { contactId, ...patch }),
  linkContact: (contactId: string, transactionId: string, role?: string, isPrimary?: boolean) =>
    call<unknown>("linkContact", { contactId, transactionId, role, isPrimary }),
  unlinkContact: (contactId: string, transactionId: string) =>
    call<unknown>("unlinkContact", { contactId, transactionId }),
  setAlertRouting: (category: string, roles: string[]) =>
    call<unknown>("setAlertRouting", { category, roles }),
  sendMail: (input: {
    transactionId?: string;
    contactId?: string;
    toEmail: string;
    toName?: string;
    subject: string;
    body: string;
    templateKey?: string;
    actorName?: string;
  }) => call<{ status: string; error: string | null }>("sendMail", input),
  postMessage: (input: {
    transactionId: string;
    body: string;
    direction?: "internal" | "to_seller" | "from_seller";
    subject?: string;
    authorName?: string;
    authorType?: string;
    relatedMetricKey?: string;
    relatedTaskId?: string;
    toEmail?: string;
    toName?: string;
    contactId?: string;
  }) => call<{ status: string; error: string | null }>("postMessage", input),
  raiseClarification: (input: {
    transactionId: string;
    question: string;
    title?: string;
    metricKey?: string;
    category?: string;
    actorName?: string;
    toEmail?: string;
    toName?: string;
    contactId?: string;
    dueDate?: string;
  }) => call<{ taskId: string | null; status: string }>("raiseClarification", input),
  markMessagesRead: (transactionId: string) =>
    call<{ readAt: string }>("markMessagesRead", { transactionId }),
  mintSellerLink: (input: { transactionId: string; email: string; name?: string; contactId?: string }) =>
    call<{ token: string; url: string }>("mintSellerLink", input),
  scheduleMeeting: (input: {
    transactionId: string;
    title: string;
    start: string;
    end: string;
    type?: string;
    location?: string;
    online?: boolean;
    body?: string;
    agenda?: string[];
    attendeeEmails?: string[];
    attendeeContactIds?: string[];
    actorName?: string;
  }) => call<{ meeting: unknown; invited: boolean; joinUrl: string | null }>("scheduleMeeting", input),
};
