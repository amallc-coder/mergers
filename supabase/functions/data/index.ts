/**
 * `data` Edge Function — the live application backend for the static site.
 *
 * The deployed app is a static export (GitHub Pages) with no server of its own,
 * so it cannot hold service credentials or talk to Postgres directly. This
 * function is that server: it runs inside Supabase with the auto-injected service
 * role, is gated by the same team access passcode as the `sharepoint` function,
 * and exposes a tiny RPC surface the browser client (ApiRepository) calls at
 * runtime.
 *
 *   action: "snapshot"  → returns the entire dataset (org, users, transactions,
 *                          request items, documents, …) as domain-shaped JSON,
 *                          produced by the SECURITY DEFINER `app_snapshot()` fn.
 *   action: "patchRequestItem" → update a diligence request item's status fields.
 *   action: "upsertTask"       → create/update a task.
 *
 * Security: callers must include `appKey` whose SHA-256 matches APP_KEY_SHA256
 * (only the hash lives here; the passcode is entered in the app and kept in
 * localStorage). The service role key never leaves this function, and
 * `app_snapshot()` is granted to service_role only — never anon — so the public
 * anon key in the bundle cannot read the database directly.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_KEY_SHA256 =
  Deno.env.get("APP_ACCESS_KEY_SHA256") ??
  "56b8ece9360067ca09c394436679972a0c52d69acd6252c1713391a8b79b2eaa";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Call a Postgres function via PostgREST RPC using the service role. */
async function rpc(fn: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

/** PATCH rows in a table via PostgREST using the service role; returns the rows. */
async function patch(
  table: string,
  match: Record<string, string>,
  body: Record<string, unknown>,
): Promise<unknown> {
  const qs = Object.entries(match)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`patch ${table} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Upsert a row via PostgREST; returns the row. */
async function upsert(table: string, row: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upsert ${table} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Plain insert (no upsert) via PostgREST. */
async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert ${table} failed (${res.status}): ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let args: Record<string, unknown>;
  try {
    args = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  // Access gate — same shared passcode as the sharepoint function.
  const provided = typeof args.appKey === "string" ? args.appKey : "";
  if (!provided || (await sha256Hex(provided)) !== APP_KEY_SHA256) {
    return json({ ok: false, error: "Locked: invalid or missing access passcode." }, 401);
  }

  const action = typeof args.action === "string" ? args.action : "";
  try {
    switch (action) {
      case "snapshot": {
        const result = await rpc("app_snapshot");
        return json({ ok: true, result });
      }
      case "patchRequestItem": {
        const id = String(args.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        const body: Record<string, unknown> = { last_updated: new Date().toISOString() };
        if (args.status !== undefined) body.status = args.status;
        if (args.internalReviewStatus !== undefined)
          body.internal_review_status = args.internalReviewStatus;
        if (args.assignedInternalReviewerId !== undefined)
          body.assigned_internal_reviewer_id = args.assignedInternalReviewerId;
        if (args.dueDate !== undefined) body.due_date = args.dueDate;
        const rows = await patch("diligence_request_items", { id }, body);
        return json({ ok: true, result: rows });
      }
      case "upsertTask": {
        const row = (args.task ?? {}) as Record<string, unknown>;
        const result = await upsert("tasks", row);
        return json({ ok: true, result });
      }
      case "setStage": {
        // Feature 4: move a deal to a new pipeline stage, recording the change in
        // the stage history (for time-in-stage) and the audit log.
        const id = String(args.transactionId ?? "");
        const stage = String(args.stage ?? "");
        if (!id || !stage) return json({ ok: false, error: "transactionId and stage required" }, 400);
        const now = new Date().toISOString();
        const actorName = typeof args.actorName === "string" ? args.actorName : "System";
        await patch("transactions", { id }, { stage, last_activity_date: now });
        await insertRow("transaction_stages", {
          transaction_id: id,
          stage,
          entered_at: now,
          notes: typeof args.note === "string" ? args.note : null,
        });
        await insertRow("audit_logs", {
          transaction_id: id,
          actor_name: actorName,
          action: "stage_changed",
          target: stage,
          metadata: { via: "app" },
        });
        await insertRow("activity_events", {
          transaction_id: id,
          type: "stage_changed",
          actor_name: actorName,
          summary: `Stage changed to ${stage}`,
        });
        return json({ ok: true, result: { id, stage, enteredAt: now } });
      }
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
