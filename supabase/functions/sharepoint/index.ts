// Supabase Edge Function: SharePoint (Microsoft Graph) integration for clinilytics M&A.
//
// App-only (client-credentials) Graph access. The Azure client secret lives ONLY in
// this function's secrets — never in the browser. Supabase verifies the caller's JWT
// by default, so only authenticated app users can invoke it.
//
// Deploy:  supabase functions deploy sharepoint
// Secrets: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//          SHAREPOINT_DRIVE_ID, SHAREPOINT_ROOT_FOLDER  (e.g. "M&A Diligence")

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const DRIVE_ID = Deno.env.get("SHAREPOINT_DRIVE_ID")!;
const ROOT_FOLDER = Deno.env.get("SHAREPOINT_ROOT_FOLDER") ?? "M&A Diligence";

const GRAPH = "https://graph.microsoft.com/v1.0";

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

const drivePath = (p: string) => `/drives/${DRIVE_ID}/root:/${p.split("/").map(encodeURIComponent).join("/")}`;

/** Get a drive item by path under the library root, or null if missing. */
function getByPath(token: string, path: string) {
  return graph(token, drivePath(path));
}

/** Ensure a child folder exists under parentId; returns the folder item. */
async function ensureChildFolder(token: string, parentId: string, name: string, fullPath: string) {
  const existing = await getByPath(token, fullPath);
  if (existing) return existing;
  return await graph(token, `/drives/${DRIVE_ID}/items/${parentId}/children`, {
    method: "POST",
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
}

// ── Actions ─────────────────────────────────────────────────────

/** Create (idempotently) the data-room folder + the 10 category subfolders. */
async function ensureDataRoom(token: string, practiceName: string) {
  const root = await getByPath(token, ROOT_FOLDER);
  if (!root) throw new Error(`Root folder "${ROOT_FOLDER}" not found in drive`);
  const dataRoomName = `Data Room - ${practiceName}`;
  const dataRoom = await ensureChildFolder(token, root.id, dataRoomName, `${ROOT_FOLDER}/${dataRoomName}`);

  const folders: Record<string, { id: string; webUrl: string }> = {};
  for (const cat of CATEGORY_FOLDERS) {
    const f = await ensureChildFolder(token, dataRoom.id, cat, `${ROOT_FOLDER}/${dataRoomName}/${cat}`);
    folders[cat] = { id: f.id, webUrl: f.webUrl };
  }
  return { dataRoom: { id: dataRoom.id, name: dataRoomName, webUrl: dataRoom.webUrl }, folders };
}

/** List all files under a data room (recursively), returning metadata. */
async function listDocuments(token: string, practiceName: string) {
  const dataRoomName = `Data Room - ${practiceName}`;
  const root = await getByPath(token, `${ROOT_FOLDER}/${dataRoomName}`);
  if (!root) return { files: [] };

  const files: unknown[] = [];
  async function walk(itemId: string, categoryFolder: string) {
    let next: string | null = `/drives/${DRIVE_ID}/items/${itemId}/children?$top=200`;
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
async function moveDocument(token: string, itemId: string, targetFolderId: string, newName?: string) {
  const body: Record<string, unknown> = { parentReference: { id: targetFolderId } };
  if (newName) body.name = newName;
  const updated = await graph(token, `/drives/${DRIVE_ID}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return { id: updated.id, name: updated.name, webUrl: updated.webUrl, parentId: targetFolderId };
}

/** Incremental change feed for the whole library. Pass the prior deltaToken to get only changes. */
async function deltaSync(token: string, deltaLink?: string) {
  const start = deltaLink ?? `/drives/${DRIVE_ID}/root/delta`;
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
async function status(token: string) {
  const drive = await graph(token, `/drives/${DRIVE_ID}`);
  const root = await getByPath(token, ROOT_FOLDER);
  return {
    connected: !!drive,
    driveName: drive?.name,
    rootFolder: ROOT_FOLDER,
    rootFolderExists: !!root,
  };
}

// ── HTTP entry ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { action, ...args } = await req.json();
    const token = await getToken();

    let result: unknown;
    switch (action) {
      case "status":
        result = await status(token);
        break;
      case "ensureDataRoom":
        result = await ensureDataRoom(token, args.practiceName);
        break;
      case "listDocuments":
        result = await listDocuments(token, args.practiceName);
        break;
      case "moveDocument":
        result = await moveDocument(token, args.itemId, args.targetFolderId, args.newName);
        break;
      case "deltaSync":
        result = await deltaSync(token, args.deltaLink);
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
