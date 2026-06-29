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

// Microsoft Graph (shared app registration). Email send requires the Mail.Send
// application permission + a sender mailbox; until those are in place, sends are
// recorded as "queued" and a later flushOutbox pass delivers them.
const AZURE_TENANT = Deno.env.get("AZURE_TENANT_ID") ?? "";
const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID") ?? "";
const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET") ?? "";
const SENDER_MAILBOX = Deno.env.get("GRAPH_SENDER_MAILBOX") ?? "";
// Delegated (ROPC) sign-in for the sender mailbox: when a login + password are
// configured we authenticate AS this user and send on its behalf, so email works
// without an application Mail.Send grant. Credentials come from env (never committed).
const SENDER_USER = Deno.env.get("GRAPH_SENDER_USER") ?? "";
const SENDER_PASSWORD = Deno.env.get("GRAPH_SENDER_PASSWORD") ?? "";

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

async function dbSelect(pathAndQuery: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`select ${pathAndQuery} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function del(table: string, match: Record<string, string>): Promise<void> {
  const qs = Object.entries(match)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`delete ${table} failed (${res.status}): ${await res.text()}`);
}

/** App-only Graph token (client credentials). */
async function graphToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`graph token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

/** Delegated (ROPC) token — sign in AS the sender mailbox using its login, so we can
 *  send on its behalf with only a delegated Mail.Send grant (no application permission).
 *  NOTE: ROPC must request the ".default" scope, not the granular "Mail.Send" scope.
 *  A granular resource scope routes the request through Azure AD's *dynamic* consent
 *  path, which ROPC cannot satisfy interactively → AADSTS65001 even when admin consent
 *  is already granted. ".default" uses the statically admin-consented permission set,
 *  which includes Mail.Send once consent is in place. */
async function delegatedToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    grant_type: "password",
    username: SENDER_USER,
    password: SENDER_PASSWORD,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`delegated token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token as string;
}

/**
 * Attempt to deliver one email via Graph sendMail. Returns the resulting status:
 * - "sent"   on success
 * - "queued" when delivery isn't possible yet (no Mail.Send grant / no sender
 *            mailbox / token issue) — the row stays retryable for flushOutbox
 * - "failed" on a hard, non-permission error
 */
async function deliverEmail(
  token: string | null,
  toEmail: string,
  toName: string | undefined,
  subject: string,
  body: string,
  // Optional alternate "From" mailbox. Only honored when the authenticated sender
  // has Exchange "Send As" rights on that mailbox; otherwise Graph returns
  // ErrorSendAsDenied (403) and we report it rather than silently sending as the login.
  fromEmail?: string,
): Promise<{ status: "sent" | "queued" | "failed"; error: string | null }> {
  // Prefer the delegated login (sign in AS the mailbox) when credentials are set;
  // otherwise fall back to app-only send from the configured sender mailbox.
  const useDelegated = !!(SENDER_USER && SENDER_PASSWORD);
  if (!useDelegated && !SENDER_MAILBOX) return { status: "queued", error: "Sender mailbox not configured yet." };
  if (!toEmail) return { status: "failed", error: "No recipient address." };
  try {
    const t = useDelegated ? await delegatedToken() : (token ?? (await graphToken()));
    const endpoint = useDelegated
      ? `https://graph.microsoft.com/v1.0/me/sendMail`
      : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`;
    const message: Record<string, unknown> = {
      subject,
      body: { contentType: "HTML", content: body },
      toRecipients: [{ emailAddress: { address: toEmail, name: toName } }],
    };
    if (fromEmail) message.from = { emailAddress: { address: fromEmail } };
    const res = await fetch(
      endpoint,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );
    if (res.ok || res.status === 202) return { status: "sent", error: null };
    const errText = await res.text();
    // 401/403 → Mail.Send not granted yet (or Send-As denied for the From mailbox):
    // keep it queued for a later flush and surface the Graph error verbatim.
    if (res.status === 401 || res.status === 403) {
      return { status: "queued", error: `send blocked (${res.status}): ${errText.slice(0, 240)}` };
    }
    return { status: "failed", error: `sendMail ${res.status}: ${errText.slice(0, 300)}` };
  } catch (e) {
    return { status: "queued", error: `send unavailable: ${String(e).slice(0, 200)}` };
  }
}

// Public base URL of the deployed seller portal (origin + basePath), e.g.
// "https://amallc-coder.github.io/mergers". When set, outbound clarification
// emails include a one-click reply link; when empty, the link is omitted.
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ?? "";

type Seller = {
  id: string;
  transaction_id: string;
  contact_id: string | null;
  name: string;
  email: string;
};

/** Resolve a seller portal token to its (active, unexpired) record, bumping
 *  last_access_at. Returns null for unknown/inactive/expired tokens. This is the
 *  ONLY gate for the seller-facing actions — they never accept the team appKey. */
async function resolveSeller(token: string): Promise<Seller | null> {
  if (!token || token.length < 16) return null;
  const rows = await dbSelect(
    `seller_portal_users?access_token=eq.${encodeURIComponent(token)}&active=is.true` +
      `&select=id,transaction_id,contact_id,name,email,expires_at&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) return null;
  // Best-effort access stamp; never block the read on it.
  patch("seller_portal_users", { id: String(row.id) }, { last_access_at: new Date().toISOString() }).catch(
    () => {},
  );
  return {
    id: String(row.id),
    transaction_id: String(row.transaction_id),
    contact_id: row.contact_id ? String(row.contact_id) : null,
    name: String(row.name ?? "Seller"),
    email: String(row.email ?? ""),
  };
}

/** Find or create an active seller portal token for one (transaction, contact).
 *  Idempotent: reuses an existing active, unexpired token so repeated emails to
 *  the same seller share one link. Returns the token string. */
async function ensureSellerToken(
  transactionId: string,
  contactId: string | null,
  name: string,
  email: string,
): Promise<string> {
  const filter = contactId
    ? `contact_id=eq.${encodeURIComponent(contactId)}`
    : `email=eq.${encodeURIComponent(email)}`;
  const existing = await dbSelect(
    `seller_portal_users?transaction_id=eq.${encodeURIComponent(transactionId)}&${filter}` +
      `&active=is.true&select=access_token,expires_at&limit=1`,
  );
  const cur = existing[0];
  if (cur && (!cur.expires_at || new Date(String(cur.expires_at)).getTime() > Date.now())) {
    return String(cur.access_token);
  }
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
  await insertRow("seller_portal_users", {
    transaction_id: transactionId,
    contact_id: contactId,
    name: name || "Seller",
    email: email || "",
    access_token: token,
    active: true,
    expires_at: expires,
  });
  return token;
}

/** The seller-facing reply URL for a token, or "" when no portal base is set. */
function sellerReplyLink(token: string): string {
  if (!PORTAL_BASE_URL || !token) return "";
  return `${PORTAL_BASE_URL.replace(/\/$/, "")}/portal/reply/?t=${encodeURIComponent(token)}`;
}

/** Append a "reply to this securely" footer to an outbound seller email body. */
function withReplyFooter(html: string, link: string): string {
  if (!link) return html;
  return (
    `${html}<hr style="margin:18px 0;border:none;border-top:1px solid #e5e7eb"/>` +
    `<p style="font-size:13px;color:#6b7280">You can reply securely in your seller portal: ` +
    `<a href="${link}">${link}</a></p>`
  );
}

/** Mark all unread messages on a transaction as read (newest-first inbox view). */
async function markRead(transactionId: string): Promise<string> {
  const now = new Date().toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?transaction_id=eq.${encodeURIComponent(transactionId)}&read_at=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ read_at: now }),
    },
  );
  if (!res.ok) throw new Error(`mark read failed (${res.status}): ${await res.text()}`);
  return now;
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

  const action = typeof args.action === "string" ? args.action : "";

  // --- Seller-facing actions: gated by an opaque per-deal token, NOT the team
  // passcode. Strictly isolated to one transaction's seller↔buyer thread; no
  // internal notes, KPIs, valuation, or other deals are ever reachable here. ---
  if (action === "sellerContext" || action === "sellerReply") {
    try {
      const seller = await resolveSeller(String(args.sellerToken ?? ""));
      if (!seller) return json({ ok: false, error: "This link is invalid or has expired." }, 401);
      const txRows = await dbSelect(
        `transactions?id=eq.${encodeURIComponent(seller.transaction_id)}&select=practice_name,name&limit=1`,
      );
      const practiceName = String(txRows[0]?.practice_name ?? txRows[0]?.name ?? "Your practice");

      if (action === "sellerReply") {
        const body = String(args.body ?? "").trim();
        if (!body) return json({ ok: false, error: "Message body required" }, 400);
        const now = new Date().toISOString();
        const inserted = await upsert("messages", {
          transaction_id: seller.transaction_id,
          direction: "from_seller",
          subject: typeof args.subject === "string" ? args.subject : null,
          body,
          related_metric_key: null,
          related_task_id: typeof args.relatedTaskId === "string" ? args.relatedTaskId : null,
          author_name: seller.name,
          author_type: "seller",
          status: "sent",
          read_at: null, // unread for the deal team
          created_by: seller.name,
          created_at: now,
        });
        await insertRow("activity_events", {
          transaction_id: seller.transaction_id,
          type: "message",
          actor_name: seller.name,
          summary: "Seller replied via portal",
          detail: body.slice(0, 280),
        });
        return json({ ok: true, result: { message: inserted } });
      }

      // sellerContext — return the seller-safe thread (their side of the convo only).
      const rows = await dbSelect(
        `messages?transaction_id=eq.${encodeURIComponent(seller.transaction_id)}` +
          `&direction=in.(to_seller,from_seller)` +
          `&select=id,direction,subject,body,author_name,created_at&order=created_at.asc`,
      );
      const thread = rows.map((m) => ({
        id: String(m.id),
        direction: String(m.direction),
        subject: (m.subject as string) ?? null,
        body: String(m.body ?? ""),
        authorName: (m.author_name as string) ?? null,
        createdAt: String(m.created_at),
      }));
      return json({ ok: true, result: { practiceName, sellerName: seller.name, thread } });
    } catch (err) {
      return json({ ok: false, error: String(err) }, 500);
    }
  }

  // Access gate — same shared passcode as the sharepoint function.
  const provided = typeof args.appKey === "string" ? args.appKey : "";
  if (!provided || (await sha256Hex(provided)) !== APP_KEY_SHA256) {
    return json({ ok: false, error: "Locked: invalid or missing access passcode." }, 401);
  }

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
      case "createTransaction": {
        // Feature 1: create a deal + its checklist atomically; returns the id.
        // SharePoint provisioning is a separate client step (graceful failure).
        const practice = String(args.practiceName ?? "").trim();
        if (!practice) return json({ ok: false, error: "practiceName required" }, 400);
        const id = await rpc("app_create_transaction", {
          p_name: typeof args.name === "string" && args.name.trim() ? args.name.trim() : practice,
          p_practice: practice,
          p_specialty: args.specialty ?? null,
          p_state: args.state ?? null,
          p_stage: args.stage ?? "Prospect / Sourced",
          p_actor: typeof args.actorName === "string" ? args.actorName : "System",
        });
        return json({ ok: true, result: { id } });
      }
      case "patchTransaction": {
        const id = String(args.transactionId ?? "");
        if (!id) return json({ ok: false, error: "transactionId required" }, 400);
        const body: Record<string, unknown> = { last_activity_date: new Date().toISOString() };
        if (args.sharePointFolderUrl !== undefined) body.sharepoint_folder_url = args.sharePointFolderUrl;
        if (args.specialty !== undefined) body.specialty = args.specialty;
        if (args.state !== undefined) body.state = args.state;
        if (args.riskLevel !== undefined) body.risk_level = args.riskLevel;
        if (args.locationsCount !== undefined) body.locations_count = args.locationsCount;
        if (args.providersCount !== undefined) body.providers_count = args.providersCount;
        const rows = await patch("transactions", { id }, body);
        return json({ ok: true, result: rows });
      }
      case "addContact": {
        // Upsert a global contact and (optionally) link it to a transaction.
        const id = await rpc("app_add_contact", {
          p_transaction_id: args.transactionId ?? null,
          p_type: args.type ?? "external",
          p_name: args.name ?? "",
          p_email: args.email ?? "",
          p_phone: args.phone ?? null,
          p_role: args.role ?? null,
          p_is_primary: args.isPrimary === true,
          p_functional_roles: args.functionalRoles ?? [],
        });
        return json({ ok: true, result: { id } });
      }
      case "updateContact": {
        const id = String(args.contactId ?? "");
        if (!id) return json({ ok: false, error: "contactId required" }, 400);
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.email !== undefined) body.email = args.email;
        if (args.phone !== undefined) body.phone = args.phone;
        if (args.title !== undefined) body.title = args.title;
        if (args.functionalRoles !== undefined) body.functional_roles = args.functionalRoles;
        const rows = await patch("contacts", { id }, body);
        return json({ ok: true, result: rows });
      }
      case "linkContact": {
        const contactId = String(args.contactId ?? "");
        const transactionId = String(args.transactionId ?? "");
        if (!contactId || !transactionId) return json({ ok: false, error: "contactId and transactionId required" }, 400);
        const result = await upsert("contact_links", {
          contact_id: contactId,
          transaction_id: transactionId,
          is_primary: args.isPrimary === true,
          role_on_deal: args.role ?? null,
        });
        return json({ ok: true, result });
      }
      case "unlinkContact": {
        const contactId = String(args.contactId ?? "");
        const transactionId = String(args.transactionId ?? "");
        if (!contactId || !transactionId) return json({ ok: false, error: "contactId and transactionId required" }, 400);
        await del("contact_links", { contact_id: contactId, transaction_id: transactionId });
        return json({ ok: true, result: { unlinked: true } });
      }
      case "setAlertRouting": {
        const category = String(args.category ?? "");
        if (!category) return json({ ok: false, error: "category required" }, 400);
        const result = await upsert("alert_routing", { category, roles: args.roles ?? [] });
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
      case "postMessage": {
        const transactionId = String(args.transactionId ?? "");
        const body = String(args.body ?? "").trim();
        if (!transactionId || !body) return json({ ok: false, error: "transactionId and body required" }, 400);
        const direction = ["internal", "to_seller", "from_seller"].includes(String(args.direction))
          ? String(args.direction)
          : "internal";
        const authorType = direction === "from_seller" ? "seller" : String(args.authorType ?? "internal");
        const authorName = typeof args.authorName === "string" && args.authorName
          ? args.authorName
          : authorType === "seller" ? "Seller" : "Deal team";
        const subject = typeof args.subject === "string" ? args.subject : null;
        const now = new Date().toISOString();
        let status = direction === "to_seller" ? "queued" : "sent";
        let emailError: string | null = null;
        if (direction === "to_seller" && args.toEmail) {
          // Give the seller a one-click secure reply link back into this thread.
          let emailBody = body;
          if (PORTAL_BASE_URL) {
            const token = await ensureSellerToken(
              transactionId, typeof args.contactId === "string" ? args.contactId : null,
              typeof args.toName === "string" ? args.toName : "Seller", String(args.toEmail),
            ).catch(() => "");
            emailBody = withReplyFooter(body, sellerReplyLink(token));
          }
          const r = await deliverEmail(null, String(args.toEmail), typeof args.toName === "string" ? args.toName : undefined, subject ?? "Message from the deal team", emailBody);
          status = r.status === "sent" ? "sent" : "queued";
          emailError = r.error;
          await insertRow("communications", {
            transaction_id: transactionId, contact_id: args.contactId ?? null,
            to_email: String(args.toEmail), to_name: typeof args.toName === "string" ? args.toName : null,
            subject: subject ?? "Message from the deal team", body, template_key: "message",
            status: r.status, error: r.error, sent_at: r.status === "sent" ? now : null, created_by: authorName,
          });
        }
        const inserted = await upsert("messages", {
          transaction_id: transactionId, direction, subject, body,
          related_metric_key: args.relatedMetricKey ?? null, related_task_id: args.relatedTaskId ?? null,
          author_name: authorName, author_type: authorType, status,
          read_at: direction === "from_seller" ? null : now,
          created_by: authorName, created_at: now,
        });
        await insertRow("activity_events", {
          transaction_id: transactionId, type: "message", actor_name: authorName,
          summary: direction === "to_seller"
            ? `Message sent to seller${status === "queued" ? " (queued for email)" : ""}`
            : direction === "from_seller" ? "Seller replied" : "Internal note added",
          detail: body.slice(0, 280),
        });
        return json({ ok: true, result: { message: inserted, status, error: emailError } });
      }
      case "raiseClarification": {
        const transactionId = String(args.transactionId ?? "");
        const question = String(args.question ?? args.body ?? "").trim();
        if (!transactionId || !question) return json({ ok: false, error: "transactionId and question required" }, 400);
        const metricKey = (args.metricKey ?? args.relatedMetricKey ?? null) as string | null;
        const actorName = typeof args.actorName === "string" ? args.actorName : "Deal team";
        const title = String(args.title ?? "Clarification needed").slice(0, 200);
        const category = typeof args.category === "string" ? args.category : "other";
        const now = new Date().toISOString();
        const taskRows = (await upsert("tasks", {
          transaction_id: transactionId, title, description: question,
          status: "open", category, due_date: args.dueDate ?? null,
        })) as Record<string, unknown>[];
        const taskId = Array.isArray(taskRows) && taskRows[0] ? String(taskRows[0].id) : null;
        let status = "queued";
        if (args.toEmail) {
          // Include a secure reply link so the seller can answer the clarification.
          let emailBody = question;
          if (PORTAL_BASE_URL) {
            const token = await ensureSellerToken(
              transactionId, typeof args.contactId === "string" ? args.contactId : null,
              typeof args.toName === "string" ? args.toName : "Seller", String(args.toEmail),
            ).catch(() => "");
            emailBody = withReplyFooter(question, sellerReplyLink(token));
          }
          const r = await deliverEmail(null, String(args.toEmail), typeof args.toName === "string" ? args.toName : undefined, title, emailBody);
          status = r.status === "sent" ? "sent" : "queued";
          await insertRow("communications", {
            transaction_id: transactionId, contact_id: args.contactId ?? null,
            to_email: String(args.toEmail), to_name: typeof args.toName === "string" ? args.toName : null,
            subject: title, body: question, template_key: "clarification",
            status: r.status, error: r.error, sent_at: r.status === "sent" ? now : null, created_by: actorName,
          });
        }
        const msg = await upsert("messages", {
          transaction_id: transactionId, direction: "to_seller", subject: title, body: question,
          related_metric_key: metricKey, related_task_id: taskId,
          author_name: actorName, author_type: "internal", status, read_at: now,
          created_by: actorName, created_at: now,
        });
        await insertRow("activity_events", {
          transaction_id: transactionId, type: "clarification_raised", actor_name: actorName,
          summary: `Clarification raised${metricKey ? ` re: ${metricKey}` : ""}${status === "queued" ? " (queued for email)" : ""}`,
          detail: question.slice(0, 280),
        });
        await insertRow("audit_logs", {
          transaction_id: transactionId, actor_name: actorName, action: "clarification_raised",
          target: String(metricKey ?? title), metadata: { taskId, status },
        });
        return json({ ok: true, result: { taskId, message: msg, status } });
      }
      case "markMessagesRead": {
        const transactionId = String(args.transactionId ?? "");
        if (!transactionId) return json({ ok: false, error: "transactionId required" }, 400);
        const readAt = await markRead(transactionId);
        return json({ ok: true, result: { readAt } });
      }
      case "mintSellerLink": {
        // Team action: get (or create) the secure reply link for a seller contact.
        const transactionId = String(args.transactionId ?? "");
        const email = String(args.email ?? "");
        if (!transactionId || !email) return json({ ok: false, error: "transactionId and email required" }, 400);
        const token = await ensureSellerToken(
          transactionId,
          typeof args.contactId === "string" ? args.contactId : null,
          typeof args.name === "string" ? args.name : "Seller",
          email,
        );
        return json({ ok: true, result: { token, url: sellerReplyLink(token) } });
      }
      case "sendMail": {
        // Compose + send (or queue) one email, logging it to communications.
        const toEmail = String(args.toEmail ?? "");
        const subject = String(args.subject ?? "");
        const body = String(args.body ?? "");
        if (!toEmail || !subject) return json({ ok: false, error: "toEmail and subject required" }, 400);
        const toName = typeof args.toName === "string" ? args.toName : undefined;
        const fromEmail = typeof args.fromEmail === "string" && args.fromEmail ? args.fromEmail : undefined;
        const { status, error } = await deliverEmail(null, toEmail, toName, subject, body, fromEmail);
        const row = {
          transaction_id: args.transactionId ?? null,
          contact_id: args.contactId ?? null,
          to_email: toEmail,
          to_name: toName ?? null,
          subject,
          body,
          template_key: args.templateKey ?? null,
          status,
          error,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          created_by: typeof args.actorName === "string" ? args.actorName : "System",
        };
        await insertRow("communications", row);
        if (args.transactionId) {
          await insertRow("audit_logs", {
            transaction_id: args.transactionId,
            actor_name: row.created_by,
            action: "reminder_sent",
            target: toEmail,
            metadata: { subject, status, channel: "email" },
          });
        }
        return json({ ok: true, result: { status, error } });
      }
      case "flushOutbox": {
        // Retry every queued email — used after Mail.Send is granted (and can be
        // wired to pg_cron). No-op (0 sent) until then.
        const queued = await dbSelect(
          "communications?status=eq.queued&select=id,to_email,to_name,subject,body&limit=100",
        );
        let token: string | null = null;
        try {
          token = SENDER_MAILBOX ? await graphToken() : null;
        } catch {
          token = null;
        }
        let sent = 0;
        for (const m of queued) {
          const { status, error } = await deliverEmail(
            token,
            String(m.to_email ?? ""),
            (m.to_name as string) ?? undefined,
            String(m.subject ?? ""),
            String(m.body ?? ""),
          );
          await patch("communications", { id: String(m.id) }, {
            status,
            error,
            sent_at: status === "sent" ? new Date().toISOString() : null,
          });
          if (status === "sent") sent++;
        }
        return json({ ok: true, result: { considered: queued.length, sent } });
      }
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
