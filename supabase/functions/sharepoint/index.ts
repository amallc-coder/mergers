// Supabase Edge Function: SharePoint (Microsoft Graph) integration for clinilytics M&A.
//
// App-only (client-credentials) Graph access. The Azure client secret lives ONLY in
// this function's secrets — never in the browser. Supabase verifies the caller's JWT
// by default, so only authenticated app users can invoke it.
//
// Target site: the dedicated "Merger & Acquisition" SharePoint site
//   https://amadmins.sharepoint.com/sites/MergerAcquisition
// The drive (document library) is resolved at runtime from SHAREPOINT_SITE_ID, so the
// integration keeps working even if the library is rebuilt. Set
// SHAREPOINT_DRIVE_ID_OVERRIDE only if you must pin a specific library.
//
// Deploy:  supabase functions deploy sharepoint
// Secrets: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
// Optional: SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID_OVERRIDE, SHAREPOINT_ROOT_FOLDER

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;

// Default to the dedicated Merger & Acquisition site (Nish is site admin here).
const SITE_ID =
  Deno.env.get("SHAREPOINT_SITE_ID") ??
  "amadmins.sharepoint.com,1996d83e-3c65-4084-a5ed-c7c14230a6a4,46c4d59a-e9d2-4937-8418-d96fb37aafd6";

// Only honour an EXPLICIT override. We intentionally do NOT fall back to the legacy
// SHAREPOINT_DRIVE_ID secret, which points at the old root site's library.
const DRIVE_ID_OVERRIDE = Deno.env.get("SHAREPOINT_DRIVE_ID_OVERRIDE") ?? "";

// Empty string => operate at the document library root (the dedicated site IS the M&A
// area, so data rooms live at the top of the library). Set a name to nest them.
const ROOT_FOLDER = Deno.env.get("SHAREPOINT_ROOT_FOLDER") ?? "";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Anthropic (Claude) — content-based document classification engine.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Lightweight access gate. Because the frontend is a public static site, the
// Supabase anon key is visible in the JS bundle and would otherwise let anyone
// invoke this function. Callers must include an `appKey` in the request body whose
// SHA-256 matches this digest. The passcode itself is entered by the user in the app
// (kept in localStorage, never compiled into the bundle) — only its hash lives here.
// Override per-deploy with the APP_ACCESS_KEY_SHA256 secret if desired.
const APP_KEY_SHA256 =
  Deno.env.get("APP_ACCESS_KEY_SHA256") ??
  "56b8ece9360067ca09c394436679972a0c52d69acd6252c1713391a8b79b2eaa";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The 10 data-room category folders, matching the app's CATEGORY_META.
const CATEGORY_FOLDERS = [
  "01. Logins Passwords",
  "02. Finance Accounting",
  "03. Revenue Cycle Billing",
  "04. Providers Credentialing",
  "05. Operations Clinical",
  "06. HR Payroll",
  "07. IT EMR Systems",
  "08. Legal Contracts Business",
  "09. Other",
  "10. Unclassified Review Queue",
];

const REVIEW_FOLDER = "10. Unclassified Review Queue";

// Files about AMA (the acquirer / parent company) rather than the practice go here,
// a subfolder created alongside the 10 diligence categories inside each data room.
const AMA_FOLDER = "AMA Data Room";

// Sellers upload here; the auto-organizer classifies and files anything dropped in.
const INTAKE_FOLDER = "Intake";

// The folder under which organized data rooms live (so the intake auto-organizer
// knows where to look). Matches where the batch organize filed everything.
const INTAKE_HOME = Deno.env.get("SHAREPOINT_INTAKE_HOME") ?? "M&A Diligence";

// Shared secret echoed by Microsoft Graph change-notification calls (clientState).
// Graph webhooks can't send the app passcode, so notifications are verified by this.
const WEBHOOK_STATE = Deno.env.get("GRAPH_WEBHOOK_STATE") ?? APP_KEY_SHA256.slice(0, 24);

// Guidance the classifier sees for each diligence category.
const CATEGORY_GUIDE = [
  "01. Logins Passwords — login credentials, portal access, usernames/passwords, account/login screenshots",
  "02. Finance Accounting — P&L, balance sheets, tax returns, bank/credit-card statements, general ledger, QuickBooks files",
  "03. Revenue Cycle Billing — AR aging, claims, EOBs/remittances, fee schedules, payer mix, denials, billing/collections reports",
  "04. Providers Credentialing — medical licenses, DEA, board certifications, CVs, malpractice/insurance, provider rosters, credentialing",
  "05. Operations Clinical — clinical workflows, schedules, service lines, equipment, supplies, clinical/quality reports",
  "06. HR Payroll — employee rosters, payroll registers, W-2s/W-4s, benefits, PTO, employment/contractor agreements, org charts",
  "07. IT EMR Systems — IT systems, EMR/PM software, network/hardware inventory, software licenses, IT vendors",
  "08. Legal Contracts Business — leases, contracts, formation docs, NDAs, operating agreements, business licenses, insurance policies",
  "09. Other — identifiable but does not fit the categories above",
  "10. Unclassified Review Queue — unreadable, ambiguous, or low-confidence; needs a human to place it",
].join("\n");

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "confidence", "documentType", "reasoning", "amaRelated"],
  properties: {
    category: { type: "string", enum: CATEGORY_FOLDERS },
    confidence: { type: "number" },
    documentType: { type: "string" },
    reasoning: { type: "string" },
    // True when the file concerns AMA (American Medical Administrators / the acquiring
    // or parent company) rather than the practice being acquired. Such files are filed
    // into the "AMA Data Room" subfolder instead of a diligence category.
    amaRelated: { type: "boolean" },
  },
};

// Forced tool use is the most reliable way to get structured output from Claude:
// tool_choice pins this tool and strict:true guarantees the input validates against
// the schema, which avoids the degenerate "placeholder" stubs that output_config can
// occasionally emit.
const CLASSIFY_TOOL = {
  name: "classify_document",
  description: "Record the diligence category and metadata for the data-room file, grounded in its actual content.",
  strict: true,
  input_schema: CLASSIFY_SCHEMA,
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Supabase (service role) — write synced documents into the live DB ──────────
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected into every edge
// function. The service role bypasses RLS; it never leaves this function.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function dbGet(pathAndQuery: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db get ${pathAndQuery} (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function dbUpsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) throw new Error(`db upsert ${table} (${res.status}): ${await res.text()}`);
}

// Data-room category folder → the app's category_key enum. AMA files are filed
// under "other"; Intake (un-triaged uploads) is skipped.
const FOLDER_TO_CATEGORY: Record<string, string> = {
  "01. Logins Passwords": "logins_passwords",
  "02. Finance Accounting": "finance_accounting",
  "03. Revenue Cycle Billing": "revenue_cycle_billing",
  "04. Providers Credentialing": "providers_credentialing",
  "05. Operations Clinical": "operations_clinical",
  "06. HR Payroll": "hr_payroll",
  "07. IT EMR Systems": "it_emr_systems",
  "08. Legal Contracts Business": "legal_contracts_business",
  "09. Other": "other",
  "10. Unclassified Review Queue": "unclassified_review_queue",
  "AMA Data Room": "other",
};

// ── Graph helpers ───────────────────────────────────────────────

async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function graph(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`graph ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? {} : await res.json();
}

/** Resolve the document library (drive) for the configured site, once per request. */
async function resolveDriveId(token: string): Promise<string> {
  if (DRIVE_ID_OVERRIDE) return DRIVE_ID_OVERRIDE;
  const d = await graph(token, `/sites/${SITE_ID}/drive?$select=id,name,webUrl`);
  if (!d?.id) throw new Error(`could not resolve default drive for site ${SITE_ID}`);
  return d.id as string;
}

function drivePath(driveId: string, p: string) {
  const enc = p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return enc ? `/drives/${driveId}/root:/${enc}` : `/drives/${driveId}/root`;
}

/** Get a drive item by path under the library root, or null if missing. */
function getByPath(token: string, driveId: string, path: string) {
  return graph(token, drivePath(driveId, path));
}

/** Ensure a child folder exists under parentId; returns the folder item. */
async function ensureChildFolder(token: string, driveId: string, parentId: string, name: string, fullPath: string) {
  const existing = await getByPath(token, driveId, fullPath);
  if (existing) return existing;
  return await graph(token, `/drives/${driveId}/items/${parentId}/children`, {
    method: "POST",
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
}

/** The item under which data rooms are created: the library root, or `folder` if set. */
async function ensureRootItem(token: string, driveId: string, folder: string = ROOT_FOLDER) {
  if (!folder) return await graph(token, `/drives/${driveId}/root`);
  const existing = await getByPath(token, driveId, folder);
  if (existing) return existing;
  const root = await graph(token, `/drives/${driveId}/root`);
  return await ensureChildFolder(token, driveId, root.id, folder, folder);
}

const joinPath = (base: string, name: string) => (base ? `${base}/${name}` : name);
const dataRoomPath = (name: string) => joinPath(ROOT_FOLDER, name);

// ── Actions ─────────────────────────────────────────────────────

/**
 * Create (idempotently) the data-room folder + the 10 category subfolders.
 * `baseFolder` is the parent under which the data room is created (defaults to the
 * configured ROOT_FOLDER); pass it to file organized rooms into a specific home,
 * e.g. the permanent "M&A Diligence" folder.
 */
async function ensureDataRoom(token: string, driveId: string, practiceName: string, baseFolder: string = ROOT_FOLDER) {
  const root = await ensureRootItem(token, driveId, baseFolder);
  const dataRoomName = `Data Room - ${practiceName}`;
  const drPath = joinPath(baseFolder, dataRoomName);
  const dataRoom = await ensureChildFolder(token, driveId, root.id, dataRoomName, drPath);

  const folders: Record<string, { id: string; webUrl: string }> = {};
  for (const cat of CATEGORY_FOLDERS) {
    const f = await ensureChildFolder(token, driveId, dataRoom.id, cat, `${drPath}/${cat}`);
    folders[cat] = { id: f.id, webUrl: f.webUrl };
  }
  // The AMA (acquirer) subfolder for files that belong to the parent company.
  const ama = await ensureChildFolder(token, driveId, dataRoom.id, AMA_FOLDER, `${drPath}/${AMA_FOLDER}`);
  folders[AMA_FOLDER] = { id: ama.id, webUrl: ama.webUrl };
  // The seller upload folder; the auto-organizer files anything dropped here.
  const intake = await ensureChildFolder(token, driveId, dataRoom.id, INTAKE_FOLDER, `${drPath}/${INTAKE_FOLDER}`);
  folders[INTAKE_FOLDER] = { id: intake.id, webUrl: intake.webUrl };
  return { dataRoom: { id: dataRoom.id, name: dataRoomName, webUrl: dataRoom.webUrl }, folders };
}

/** List all files under a data room (recursively), returning metadata. */
async function listDocuments(token: string, driveId: string, practiceName: string) {
  const dataRoomName = `Data Room - ${practiceName}`;
  const root = await getByPath(token, driveId, dataRoomPath(dataRoomName));
  if (!root) return { files: [] };

  const files: unknown[] = [];
  async function walk(itemId: string, categoryFolder: string) {
    let next: string | null = `/drives/${driveId}/items/${itemId}/children?$top=200`;
    while (next) {
      const page = await graph(token, next);
      for (const child of page.value ?? []) {
        if (child.folder) {
          await walk(child.id, categoryFolder || child.name);
        } else if (child.file) {
          files.push({
            id: child.id,
            name: child.name,
            sizeBytes: child.size,
            webUrl: child.webUrl,
            eTag: child.eTag,
            mimeType: child.file.mimeType,
            lastModified: child.lastModifiedDateTime,
            categoryFolder,
          });
        }
      }
      next = page["@odata.nextLink"] ?? null;
    }
  }
  await walk(root.id, "");
  return { dataRoomId: root.id, files };
}

/** Move a file to a different folder (re-categorize / organize). */
async function moveDocument(token: string, driveId: string, itemId: string, targetFolderId: string, newName?: string) {
  const body: Record<string, unknown> = { parentReference: { id: targetFolderId } };
  if (newName) body.name = newName;
  const updated = await graph(token, `/drives/${driveId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return { id: updated.id, name: updated.name, webUrl: updated.webUrl, parentId: targetFolderId };
}

/** Delete a drive item (used to clean up scratch folders). */
async function deleteItem(token: string, driveId: string, itemId: string) {
  await graph(token, `/drives/${driveId}/items/${itemId}`, { method: "DELETE" });
  return { deleted: true, id: itemId };
}

// ── Generic tree reading (source compilations, arbitrary folders) ──────────────

/** Encode a SharePoint/OneDrive sharing URL into a Graph share id. */
function shareIdFromUrl(url: string): string {
  const b64 = btoa(url).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return "u!" + b64;
}

/** Recursively list every folder + file under an item, with relative paths. */
async function walkTree(
  token: string,
  driveId: string,
  itemId: string,
  relPath: string,
  entries: Record<string, unknown>[],
) {
  let next: string | null =
    `/drives/${driveId}/items/${itemId}/children?$top=200&$select=id,name,size,file,folder,webUrl,lastModifiedDateTime`;
  while (next) {
    const page = await graph(token, next);
    for (const c of page.value ?? []) {
      const rel = relPath ? `${relPath}/${c.name}` : c.name;
      if (c.folder) {
        entries.push({ type: "folder", id: c.id, name: c.name, relPath: rel, childCount: c.folder.childCount ?? 0 });
        await walkTree(token, driveId, c.id, rel, entries);
      } else if (c.file) {
        entries.push({
          type: "file",
          id: c.id,
          name: c.name,
          relPath: rel,
          sizeBytes: c.size ?? 0,
          mimeType: c.file.mimeType,
          webUrl: c.webUrl,
          lastModified: c.lastModifiedDateTime,
        });
      }
    }
    next = page["@odata.nextLink"] ?? null;
  }
}

/** Resolve a sharing link to its driveItem and list everything beneath it. */
async function resolveShare(token: string, shareUrl: string) {
  const shareId = shareIdFromUrl(shareUrl);
  const item = await graph(
    token,
    `/shares/${shareId}/driveItem?$select=id,name,webUrl,parentReference,folder,file`,
  );
  if (!item) return { found: false };
  const driveId = item.parentReference?.driveId as string | undefined;
  const entries: Record<string, unknown>[] = [];
  if (item.folder && driveId) await walkTree(token, driveId, item.id, "", entries);
  return {
    found: true,
    root: { id: item.id, name: item.name, driveId, webUrl: item.webUrl, isFolder: !!item.folder },
    count: entries.length,
    entries,
  };
}

/** List everything beneath a path in the configured library (path "" = root). */
async function listTree(token: string, driveId: string, path: string) {
  const root = await getByPath(token, driveId, path || "");
  if (!root) return { found: false, path };
  const entries: Record<string, unknown>[] = [];
  await walkTree(token, driveId, root.id, "", entries);
  return { found: true, root: { id: root.id, name: root.name, webUrl: root.webUrl }, count: entries.length, entries };
}

/**
 * List the top-level "Data Room - <Practice>" folders. This drives the app's live
 * deal pipeline so confidential practice names never have to be baked into the
 * public frontend bundle — they're fetched at runtime by passcode-gated callers.
 */
async function listDataRooms(token: string, driveId: string) {
  const rootItem = ROOT_FOLDER
    ? await getByPath(token, driveId, ROOT_FOLDER)
    : await graph(token, `/drives/${driveId}/root`);
  if (!rootItem) return { dataRooms: [] };

  const dataRooms: Record<string, unknown>[] = [];
  let next: string | null =
    `/drives/${driveId}/items/${rootItem.id}/children?$top=200&$select=id,name,webUrl,folder,lastModifiedDateTime`;
  while (next) {
    const page = await graph(token, next);
    for (const c of page.value ?? []) {
      if (!c.folder) continue;
      if (!/^Data Room\s*-\s*/i.test(c.name)) continue;
      dataRooms.push({
        id: c.id,
        name: c.name,
        practiceName: c.name.replace(/^Data Room\s*-\s*/i, "").trim(),
        webUrl: c.webUrl,
        childCount: c.folder.childCount ?? 0,
        lastModified: c.lastModifiedDateTime,
      });
    }
    next = page["@odata.nextLink"] ?? null;
  }
  dataRooms.sort((a, b) => String(a.practiceName).localeCompare(String(b.practiceName)));
  return { rootFolder: ROOT_FOLDER || "(library root)", count: dataRooms.length, dataRooms };
}

/**
 * Walk each data room's category folders and upsert one `documents` row per file
 * into the live DB (service role), so the app's Data Room tabs, document counts,
 * and recent-uploads feed reflect what's actually in SharePoint. Idempotent —
 * keyed on the SharePoint item id.
 */
async function syncDocuments(token: string, driveId: string, opts: { practiceName?: string } = {}) {
  const txRows = await dbGet("transactions?select=id,practice_name");
  const txMap: Record<string, string> = {};
  for (const t of txRows) txMap[String(t.practice_name)] = String(t.id);

  const listed = await listDataRooms(token, driveId);
  const dataRooms = (listed.dataRooms ?? []) as Record<string, unknown>[];
  const targets = dataRooms.filter((d) => !opts.practiceName || d.practiceName === opts.practiceName);

  let totalDocuments = 0;
  const rooms: Record<string, unknown>[] = [];
  for (const room of targets) {
    const txId = txMap[String(room.practiceName)];
    if (!txId) {
      rooms.push({ practice: room.practiceName, skipped: "no matching transaction" });
      continue;
    }
    const entries: Record<string, unknown>[] = [];
    await walkTree(token, driveId, String(room.id), "", entries);
    const rows: Record<string, unknown>[] = [];
    for (const e of entries) {
      if (e.type !== "file") continue;
      const top = String(e.relPath).split("/")[0];
      const category = FOLDER_TO_CATEGORY[top];
      if (!category) continue; // Intake / unknown top-level → skip
      rows.push({
        transaction_id: txId,
        category,
        file_name: e.name,
        mime_type: e.mimeType ?? null,
        size_bytes: e.sizeBytes ?? null,
        uploaded_by: "SharePoint",
        uploaded_by_type: "external",
        uploaded_at: e.lastModified ?? null,
        sharepoint_file_id: e.id,
        sharepoint_url: e.webUrl ?? null,
        sharepoint_sync_status: "synced",
      });
    }
    await dbUpsert("documents", rows, "sharepoint_file_id");
    totalDocuments += rows.length;
    rooms.push({ practice: room.practiceName, documents: rows.length });
  }
  return { processedRooms: targets.length, totalDocuments, rooms };
}

// ── AI classification (Claude Opus 4.8) ─────────────────────────

function extFor(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

// Office formats Microsoft Graph can render to PDF on the fly (?format=pdf), letting
// us actually READ spreadsheets/word docs/decks instead of guessing from the name.
const OFFICE_EXTS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);

function mediaKind(ext: string): { kind: "pdf" | "image" | "text" | "office" | "none"; mediaType: string } {
  if (ext === "pdf") return { kind: "pdf", mediaType: "application/pdf" };
  if (ext === "png") return { kind: "image", mediaType: "image/png" };
  if (ext === "jpg" || ext === "jpeg") return { kind: "image", mediaType: "image/jpeg" };
  if (ext === "gif") return { kind: "image", mediaType: "image/gif" };
  if (ext === "webp") return { kind: "image", mediaType: "image/webp" };
  if (ext === "txt" || ext === "csv") return { kind: "text", mediaType: "text/plain" };
  if (OFFICE_EXTS.has(ext)) return { kind: "office", mediaType: "application/pdf" };
  return { kind: "none", mediaType: "" };
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function downloadBytes(token: string, driveId: string, itemId: string, maxBytes: number): Promise<Uint8Array | null> {
  // Method 1: pre-authenticated downloadUrl from the FULL item (no $select — $select
  // strips the @microsoft.graph.downloadUrl annotation).
  try {
    const meta = await graph(token, `/drives/${driveId}/items/${itemId}`);
    if (typeof meta?.size === "number" && meta.size > maxBytes) return null;
    const url = meta?.["@microsoft.graph.downloadUrl"] as string | undefined;
    if (url) {
      const dl = await fetch(url);
      if (dl.ok) {
        const buf = new Uint8Array(await dl.arrayBuffer());
        if (buf.length <= maxBytes) return buf;
      }
    }
  } catch (_e) { /* fall through to method 2 */ }
  // Method 2: /content but follow the 302 ourselves (the pre-signed Location needs no auth).
  try {
    const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    const dl = loc ? await fetch(loc) : res;
    if (dl.ok) {
      const buf = new Uint8Array(await dl.arrayBuffer());
      if (buf.length <= maxBytes) return buf;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

/**
 * Download an Office file rendered to PDF via Graph's on-the-fly conversion
 * (?format=pdf). This lets the classifier read the actual contents of .xlsx/.docx/
 * .pptx etc. The endpoint 302-redirects to a pre-signed URL we follow ourselves.
 * Returns null if conversion fails or the rendered PDF exceeds maxBytes.
 */
async function downloadConverted(token: string, driveId: string, itemId: string, maxBytes: number): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/content?format=pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    const dl = loc ? await fetch(loc) : res;
    if (dl.ok) {
      const buf = new Uint8Array(await dl.arrayBuffer());
      if (buf.length <= maxBytes) return buf;
    }
  } catch (_e) { /* conversion unavailable for this file → caller falls back to name */ }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return out;
}

function classifyPrompt(name: string, parentName: string, readable: boolean, ext: string, textPreview: string): string {
  const lines = [
    "Classify this medical-practice acquisition data-room file into exactly ONE diligence category.",
    "",
    `File name: ${JSON.stringify(name)}`,
    `Current folder: ${JSON.stringify(parentName)}`,
  ];
  if (readable && textPreview) lines.push("", "File text (first part):", textPreview);
  else if (readable) {
    lines.push("", "The file content is attached above. Classify from what it ACTUALLY contains — the filename may be wrong or generic (e.g. image1.png).");
  } else {
    lines.push("", `The content could not be read (file type: ${ext}). Classify from the name, folder, and file type.`);
  }
  lines.push(
    "",
    "Categories:",
    CATEGORY_GUIDE,
    "",
    `This data room belongs to the practice: ${JSON.stringify(parentName)} — but files are routed by the practice being organized, so treat the practice as the acquisition target.`,
    'Rules:',
    '- Decide from content first. "confidence" is 0 to 1. "documentType" is a short label of what the file actually is (e.g. "Bank statement", "Payroll register", "Driver\'s license").',
    '- Anything about charges, payments & adjustments, CPT procedure codes, or ICD diagnosis codes belongs in "03. Revenue Cycle Billing".',
    '- Set "amaRelated" to true ONLY when the file primarily concerns AMA (American Medical Administrators) or the acquiring/parent company itself — e.g. an AMA capitalization table, AMA formation/corporate documents, or AMA-level financials — rather than the practice being acquired. Otherwise set it false. (Still fill in the best "category" either way.)',
    '- If the file is genuinely ambiguous, unreadable, or could fit multiple categories, choose "10. Unclassified Review Queue" and explain why.',
  );
  return lines.join("\n");
}

// Per-kind read caps. Edge functions are memory-constrained (~256MB) and base64
// inflates bytes ~33%, so reading several large files concurrently can OOM. Keep the
// caps modest: files above the cap fall back to name-based classification (large
// billing/coding PDFs have descriptive names and classify correctly that way).
const READ_CAP = { pdf: 10_000_000, image: 8_000_000, text: 8_000_000, office: 10_000_000, none: 0 } as const;

// Anthropic statuses worth retrying (rate limit / overloaded / transient gateway).
const RETRYABLE = new Set([429, 500, 502, 503, 529]);

/** One Claude classification call over the given content blocks, retrying transient errors. */
async function callClaude(
  blocks: Record<string, unknown>[],
): Promise<{ ok: boolean; status: number; json?: Record<string, unknown>; text?: string }> {
  let status = 0;
  let text = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: "classify_document" },
        messages: [{ role: "user", content: blocks }],
      }),
    });
    if (res.ok) return { ok: true, status: res.status, json: await res.json() };
    status = res.status;
    text = await res.text();
    if (!RETRYABLE.has(status)) break; // 400/413 etc. are not transient — bail to the caller's fallback
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return { ok: false, status, text };
}

/** Parse a successful Claude response (forced tool_use) into the classification fields. */
function parseClaude(json: Record<string, unknown>) {
  if (json.stop_reason === "refusal") {
    return { category: REVIEW_FOLDER, confidence: 0, documentType: "(refusal)", reasoning: "model declined to classify", amaRelated: false, error: "refusal" as string | undefined };
  }
  const toolUse = ((json.content as Record<string, unknown>[]) ?? []).find(
    (b) => b.type === "tool_use" && b.name === "classify_document",
  );
  const parsed = ((toolUse?.input as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return {
    category: CATEGORY_FOLDERS.includes(parsed.category as string) ? (parsed.category as string) : REVIEW_FOLDER,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    documentType: String(parsed.documentType ?? ""),
    reasoning: String(parsed.reasoning ?? ""),
    amaRelated: parsed.amaRelated === true,
    error: toolUse ? undefined : ("no_tool_use" as string | undefined),
  };
}

/** Classify a single file by its actual content via Claude. */
async function classifyOne(token: string, driveId: string, item: { id: string; name: string; size: number; parentName: string }) {
  const ext = extFor(item.name);
  const media = mediaKind(ext);
  const cap = READ_CAP[media.kind];
  let attachment: Record<string, unknown> | null = null;
  let readable = false;
  let textPreview = "";
  let downloadFailed = false;
  let oversized = false;

  if (media.kind === "office") {
    // Render the Office file to PDF via Graph, then read it like any PDF. Source size
    // doesn't predict the rendered PDF size, so we just cap the converted output.
    const bytes = await downloadConverted(token, driveId, item.id, cap);
    if (bytes) {
      attachment = { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToB64(bytes) } };
      readable = true;
    } else {
      downloadFailed = true; // conversion unavailable / too big → classify from name
    }
  } else if (media.kind !== "none") {
    if (item.size > cap) {
      oversized = true; // too big to send; classify from name (see fallback below)
    } else {
      const bytes = await downloadBytes(token, driveId, item.id, cap);
      if (bytes) {
        if (media.kind === "pdf") {
          attachment = { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToB64(bytes) } };
          readable = true;
        } else if (media.kind === "image") {
          attachment = { type: "image", source: { type: "base64", media_type: media.mediaType, data: bytesToB64(bytes) } };
          readable = true;
        } else if (media.kind === "text") {
          textPreview = new TextDecoder().decode(bytes.slice(0, 20000));
          readable = true;
        }
      } else {
        downloadFailed = true;
      }
    }
  }

  async function run(withAttachment: boolean) {
    const blocks: Record<string, unknown>[] = [];
    if (withAttachment && attachment) blocks.push(attachment);
    blocks.push({
      type: "text",
      text: classifyPrompt(item.name, item.parentName, withAttachment && readable, ext, withAttachment ? textPreview : ""),
    });
    return await callClaude(blocks);
  }

  try {
    let useAttachment = true;
    let parsed: { category: string; confidence: number; documentType: string; reasoning: string; amaRelated: boolean; error: string | undefined } = {
      category: REVIEW_FOLDER, confidence: 0, documentType: "", reasoning: "", amaRelated: false, error: undefined,
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      let resp = await run(useAttachment);
      // If the attachment itself was rejected (PDF too large / too many pages → 400/413),
      // drop it and retry name-only so a clearly-named file isn't dumped into review.
      if (!resp.ok && useAttachment && attachment && (resp.status === 400 || resp.status === 413)) {
        oversized = true;
        readable = false;
        useAttachment = false;
        resp = await run(false);
      }
      if (!resp.ok) {
        return { category: REVIEW_FOLDER, confidence: 0, documentType: "(error)", reasoning: `claude ${resp.status}: ${String(resp.text).slice(0, 300)}`, readable, downloadFailed, oversized, amaRelated: false, error: `claude_${resp.status}` };
      }
      parsed = parseClaude(resp.json!);
      // Belt-and-suspenders: retry if the model still returns a degenerate stub
      // (confidence 0 with an empty/"placeholder" documentType) instead of engaging.
      const degenerate = !parsed.error && (parsed.confidence ?? 0) === 0 &&
        (!parsed.documentType || parsed.documentType === "placeholder");
      if (degenerate && attempt < 2) continue;
      break;
    }
    return { ...parsed, readable, downloadFailed, oversized };
  } catch (e) {
    return { category: REVIEW_FOLDER, confidence: 0, documentType: "(error)", reasoning: String(e).slice(0, 300), readable, downloadFailed, oversized, amaRelated: false, error: "exception" };
  }
}

/**
 * Classify (and optionally move) the loose files in a data room by their actual
 * content. dryRun=true classifies without moving (for review). Process in slices
 * via offset/limit to stay within request time limits.
 */
async function classifyDataRoom(
  token: string,
  driveId: string,
  practiceName: string,
  opts: { dryRun?: boolean; offset?: number; limit?: number; sourcePath?: string; destRoot?: string },
) {
  if (!ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY is not set" };
  const dryRun = opts.dryRun ?? false;
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 8;

  // Read loose files from `sourcePath` (e.g. a staging dump) but file them into the
  // destination data room under `destRoot` (the permanent home, e.g. "M&A Diligence").
  // destRoot defaults to ROOT_FOLDER; sourcePath defaults to the destination (in-place).
  const destBase = opts.destRoot ?? ROOT_FOLDER;
  const dataRoomName = `Data Room - ${practiceName}`;
  const destPath = joinPath(destBase, dataRoomName);
  const srcPath = opts.sourcePath ?? destPath;
  const root = await getByPath(token, driveId, srcPath);
  if (!root) return { found: false, practiceName, sourcePath: srcPath };

  const catSet = new Set([...CATEGORY_FOLDERS, AMA_FOLDER, INTAKE_FOLDER].map((c) => c.toLowerCase()));

  // Collect loose files (anything not already inside a category folder).
  const loose: { id: string; name: string; size: number; parentName: string }[] = [];
  async function walk(itemId: string, parentName: string) {
    let next: string | null = `/drives/${driveId}/items/${itemId}/children?$top=200&$select=id,name,size,file,folder`;
    while (next) {
      const page = await graph(token, next);
      for (const c of page.value ?? []) {
        if (c.folder) {
          if (catSet.has(String(c.name).toLowerCase())) continue;
          await walk(c.id, c.name);
        } else if (c.file) {
          loose.push({ id: c.id, name: c.name, size: c.size ?? 0, parentName });
        }
      }
      next = page["@odata.nextLink"] ?? null;
    }
  }
  await walk(root.id, dataRoomName);
  loose.sort((a, b) => a.name.localeCompare(b.name));

  const total = loose.length;
  const slice = loose.slice(offset, offset + limit);

  // For real runs, ensure the DESTINATION data room (under ROOT_FOLDER) + its 10
  // category folders exist, then move classified files into them.
  const catId: Record<string, string> = {};
  if (!dryRun && slice.length > 0) {
    const dr = await ensureDataRoom(token, driveId, practiceName, destBase);
    for (const cat of CATEGORY_FOLDERS) catId[cat] = dr.folders[cat].id;
    catId[AMA_FOLDER] = dr.folders[AMA_FOLDER].id;
  }

  // A file is forced into Revenue Cycle Billing if its name or detected type is about
  // CPT / ICD / charges (underscore counts as a word boundary; avoids matching "discharge").
  const BILLING = "03. Revenue Cycle Billing";
  const billingRe = /(^|[^a-z0-9])(cpt|icd|charges?)([^a-z0-9]|$)/i;

  // Concurrency 2 keeps peak memory low (each in-flight file holds its bytes + base64).
  const results = await mapLimit(slice, 2, async (f) => {
    const c = await classifyOne(token, driveId, f);
    const ama = (c as Record<string, unknown>).amaRelated === true;
    const billingHint = billingRe.test(f.name) || billingRe.test(c.documentType ?? "");
    const lowConfOrError = c.category === REVIEW_FOLDER || (c.confidence ?? 0) < 0.6 || !!(c as Record<string, unknown>).error;

    // Routing: AMA files → AMA Data Room; a CPT/ICD/charges file that would otherwise be
    // unsure → Revenue Cycle Billing (the rule); else the model category, or review.
    let target: string;
    if (ama) target = AMA_FOLDER;
    else if (lowConfOrError && billingHint) target = BILLING;
    else if (lowConfOrError) target = REVIEW_FOLDER;
    else target = c.category;
    const needsReview = target === REVIEW_FOLDER;

    let moved = false;
    if (!dryRun && catId[target]) {
      try {
        await moveDocument(token, driveId, f.id, catId[target]);
        moved = true;
      } catch (_e) {
        moved = false;
      }
    }
    return {
      name: f.name,
      folder: f.parentName,
      sizeBytes: f.size,
      readable: c.readable,
      downloadFailed: (c as Record<string, unknown>).downloadFailed,
      oversized: (c as Record<string, unknown>).oversized,
      documentType: c.documentType,
      category: c.category,
      amaRelated: ama,
      confidence: c.confidence,
      needsReview,
      target,
      moved,
      reasoning: c.reasoning,
      error: (c as Record<string, unknown>).error,
    };
  });

  return { found: true, practiceName, sourcePath: srcPath, destPath, total, offset, limit, done: offset + limit >= total, dryRun, results };
}

/** List the "Data Room - <Practice>" folders directly under a base path. */
async function listDataRoomItems(token: string, driveId: string, base: string) {
  const rootItem = base ? await getByPath(token, driveId, base) : await graph(token, `/drives/${driveId}/root`);
  if (!rootItem) return [] as { id: string; name: string; practiceName: string }[];
  const rooms: { id: string; name: string; practiceName: string }[] = [];
  let next: string | null = `/drives/${driveId}/items/${rootItem.id}/children?$top=200&$select=id,name,folder`;
  while (next) {
    const page = await graph(token, next);
    for (const c of page.value ?? []) {
      if (c.folder && /^Data Room\s*-\s*/i.test(c.name)) {
        rooms.push({ id: c.id, name: c.name, practiceName: c.name.replace(/^Data Room\s*-\s*/i, "").trim() });
      }
    }
    next = page["@odata.nextLink"] ?? null;
  }
  return rooms;
}

/**
 * Auto-organize: for every data room under `destBase`, classify and file anything a
 * seller dropped in its Intake folder into the right category. Skips empty intakes.
 * This is what the upload webhook (and a manual trigger) call.
 */
async function organizeIntakes(token: string, driveId: string, destBase: string = INTAKE_HOME, limit = 25) {
  const rooms = await listDataRoomItems(token, driveId, destBase);
  const out: Record<string, unknown>[] = [];
  for (const room of rooms) {
    const intakePath = joinPath(destBase, `${room.name}/${INTAKE_FOLDER}`);
    const intake = await getByPath(token, driveId, intakePath);
    if (!intake) continue;
    const ch = await graph(token, `/drives/${driveId}/items/${intake.id}/children?$top=1&$select=id,file`);
    const hasFile = (ch?.value ?? []).some((c: Record<string, unknown>) => !!c.file || !!c.folder);
    if (!hasFile) continue;
    const res = await classifyDataRoom(token, driveId, room.practiceName, {
      dryRun: false, offset: 0, limit, sourcePath: intakePath, destRoot: destBase,
    });
    out.push({ practiceName: room.practiceName, ...(res as Record<string, unknown>) });
  }
  return { home: destBase, processedRooms: out.length, rooms: out };
}

/** Create a Microsoft Graph change-notification subscription on the drive root. */
async function subscribeWebhook(token: string, driveId: string, notificationUrl: string) {
  const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2); // ~2 days; renew before then
  const body = {
    changeType: "updated",
    notificationUrl,
    resource: `/drives/${driveId}/root`,
    expirationDateTime: expiry.toISOString(),
    clientState: WEBHOOK_STATE,
  };
  return await graph(token, `/subscriptions`, { method: "POST", body: JSON.stringify(body) });
}

/** Extend an existing subscription's expiration. */
async function renewWebhook(token: string, subscriptionId: string) {
  const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2);
  return await graph(token, `/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime: expiry.toISOString() }),
  });
}

/** List active subscriptions (for diagnostics / renewal). */
async function listSubscriptions(token: string) {
  const r = await graph(token, `/subscriptions`);
  return { subscriptions: r?.value ?? [] };
}

/** Incremental change feed for the whole library. Pass the prior deltaToken to get only changes. */
async function deltaSync(token: string, driveId: string, deltaLink?: string) {
  const start = deltaLink ?? `/drives/${driveId}/root/delta`;
  const changes: unknown[] = [];
  let next: string | null = start;
  let nextDelta: string | null = null;
  while (next) {
    const page = await graph(token, next);
    for (const item of page.value ?? []) {
      changes.push({
        id: item.id,
        name: item.name,
        deleted: !!item.deleted,
        isFolder: !!item.folder,
        webUrl: item.webUrl,
        eTag: item.eTag,
        lastModified: item.lastModifiedDateTime,
        parentPath: item.parentReference?.path,
      });
    }
    if (page["@odata.nextLink"]) next = page["@odata.nextLink"];
    else {
      nextDelta = page["@odata.deltaLink"] ?? null;
      next = null;
    }
  }
  return { changes, deltaLink: nextDelta };
}

/** Verify the connection works and we can see the drive. */
async function status(token: string, driveId: string) {
  const drive = await graph(token, `/drives/${driveId}?$select=id,name,webUrl`);
  const root = ROOT_FOLDER ? await getByPath(token, driveId, ROOT_FOLDER) : drive;
  return {
    connected: !!drive,
    siteId: SITE_ID,
    driveId,
    driveName: drive?.name,
    driveWebUrl: drive?.webUrl,
    rootFolder: ROOT_FOLDER || "(library root)",
    rootFolderExists: !!root,
  };
}

/** Decode the app-only JWT payload (no signature check — diagnostics only). */
function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  const pad = part.length % 4 ? 4 - (part.length % 4) : 0;
  const b64 = (part + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

/** Diagnostics: what identity/roles does our app token carry, and can it see the drive? */
async function whoami(token: string) {
  let claims: Record<string, unknown> = {};
  try {
    claims = decodeJwt(token);
  } catch (e) {
    claims = { decodeError: String(e) };
  }
  let resolvedDriveId: string | null = null;
  let driveName: string | null = null;
  let driveError: string | null = null;
  try {
    const d = await graph(token, `/sites/${SITE_ID}/drive?$select=id,name,webUrl`);
    resolvedDriveId = (d?.id as string) ?? null;
    driveName = (d?.name as string) ?? null;
  } catch (e) {
    driveError = String(e);
  }
  return {
    appid: claims.appid ?? claims.azp ?? null,
    appDisplayName: claims.app_displayname ?? null,
    roles: claims.roles ?? [],
    tenant: claims.tid ?? null,
    audience: claims.aud ?? null,
    siteId: SITE_ID,
    resolvedDriveId,
    driveName,
    driveError,
  };
}

// ── HTTP entry ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1) Microsoft Graph subscription-validation handshake: echo the validationToken.
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    payload = {};
  }

  // 2) Graph change notification: body has a `value` array. Verify the shared
  // clientState (Graph can't send the app passcode), ack fast, organize in background.
  if (Array.isArray(payload.value)) {
    const notes = payload.value as Record<string, unknown>[];
    const ok = notes.length > 0 && notes.every((n) => n.clientState === WEBHOOK_STATE);
    if (ok) {
      const work = (async () => {
        try {
          const t = await getToken();
          const d = await resolveDriveId(t);
          await organizeIntakes(t, d);
        } catch (_e) { /* best effort */ }
      })();
      try { (globalThis as Record<string, unknown> as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(work); } catch (_e) { /* ignore */ }
    }
    return new Response(JSON.stringify({ ok }), { status: 202, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    // deno-lint-ignore no-explicit-any
    const { action, ...args } = payload as any;

    // Access gate — reject anyone without the shared passcode (see APP_KEY_SHA256).
    const provided = typeof args.appKey === "string" ? args.appKey : "";
    if (!provided || (await sha256Hex(provided)) !== APP_KEY_SHA256) {
      return new Response(
        JSON.stringify({ ok: false, error: "unauthorized: missing or invalid access key" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const token = await getToken();

    // whoami doesn't need a resolved drive (it reports drive resolution itself).
    if (action === "whoami") {
      const result = await whoami(token);
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // resolveShare carries its own driveId (from the share), so it runs before
    // the configured-library drive is resolved.
    if (action === "resolveShare") {
      const result = await resolveShare(token, args.shareUrl);
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const driveId = await resolveDriveId(token);

    let result: unknown;
    switch (action) {
      case "status":
        result = await status(token, driveId);
        break;
      case "ensureDataRoom":
        result = await ensureDataRoom(token, driveId, args.practiceName, args.destRoot);
        break;
      case "listDocuments":
        result = await listDocuments(token, driveId, args.practiceName);
        break;
      case "listTree":
        result = await listTree(token, driveId, args.path ?? "");
        break;
      case "listDataRooms":
        result = await listDataRooms(token, driveId);
        break;
      case "classifyDataRoom":
        result = await classifyDataRoom(token, driveId, args.practiceName, {
          dryRun: args.dryRun ?? false,
          offset: args.offset ?? 0,
          limit: args.limit ?? 8,
          sourcePath: args.sourcePath,
          destRoot: args.destRoot,
        });
        break;
      case "moveDocument":
        result = await moveDocument(token, driveId, args.itemId, args.targetFolderId, args.newName);
        break;
      case "deleteItem":
        result = await deleteItem(token, driveId, args.itemId);
        break;
      case "organizeIntakes":
        result = await organizeIntakes(token, driveId, args.destRoot ?? INTAKE_HOME, args.limit ?? 25);
        break;
      case "syncDocuments":
        result = await syncDocuments(token, driveId, { practiceName: args.practiceName });
        break;
      case "subscribe":
        result = await subscribeWebhook(token, driveId, args.notificationUrl);
        break;
      case "renewSub":
        result = await renewWebhook(token, args.subscriptionId);
        break;
      case "listSubscriptions":
        result = await listSubscriptions(token);
        break;
      case "deltaSync":
        result = await deltaSync(token, driveId, args.deltaLink);
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown action: ${action}` }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
