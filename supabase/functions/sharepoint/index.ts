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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

/** The item under which data rooms are created: the library root, or ROOT_FOLDER if set. */
async function ensureRootItem(token: string, driveId: string) {
  if (!ROOT_FOLDER) return await graph(token, `/drives/${driveId}/root`);
  const existing = await getByPath(token, driveId, ROOT_FOLDER);
  if (existing) return existing;
  const root = await graph(token, `/drives/${driveId}/root`);
  return await ensureChildFolder(token, driveId, root.id, ROOT_FOLDER, ROOT_FOLDER);
}

const dataRoomPath = (name: string) => (ROOT_FOLDER ? `${ROOT_FOLDER}/${name}` : name);

// ── Actions ─────────────────────────────────────────────────────

/** Create (idempotently) the data-room folder + the 10 category subfolders. */
async function ensureDataRoom(token: string, driveId: string, practiceName: string) {
  const root = await ensureRootItem(token, driveId);
  const dataRoomName = `Data Room - ${practiceName}`;
  const dataRoom = await ensureChildFolder(token, driveId, root.id, dataRoomName, dataRoomPath(dataRoomName));

  const folders: Record<string, { id: string; webUrl: string }> = {};
  for (const cat of CATEGORY_FOLDERS) {
    const f = await ensureChildFolder(token, driveId, dataRoom.id, cat, `${dataRoomPath(dataRoomName)}/${cat}`);
    folders[cat] = { id: f.id, webUrl: f.webUrl };
  }
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
  try {
    const { action, ...args } = await req.json();

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
        result = await ensureDataRoom(token, driveId, args.practiceName);
        break;
      case "listDocuments":
        result = await listDocuments(token, driveId, args.practiceName);
        break;
      case "listTree":
        result = await listTree(token, driveId, args.path ?? "");
        break;
      case "moveDocument":
        result = await moveDocument(token, driveId, args.itemId, args.targetFolderId, args.newName);
        break;
      case "deleteItem":
        result = await deleteItem(token, driveId, args.itemId);
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
