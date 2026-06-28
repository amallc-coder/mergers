/**
 * Frontend client for the SharePoint Edge Function.
 *
 * Calls the Supabase Edge Function `sharepoint` (which holds the Azure secret and
 * talks to Microsoft Graph). No Microsoft credentials ever reach the browser.
 *
 * Auth model (static public site, no Supabase Auth):
 *  - The Supabase anon key authenticates the request to the Edge platform
 *    (`verify_jwt` accepts it). It is publishable and compiled into the bundle.
 *  - A team **access passcode** is additionally required by the function. The user
 *    enters it once in the app; it is kept in localStorage and sent in the request
 *    body as `appKey`. Only its SHA-256 lives in the function — never the bundle.
 *
 * Configure via env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const APP_KEY_STORAGE = "mergers.sharepoint.appkey.v1";

export interface SharePointStatus {
  connected: boolean;
  siteId: string;
  driveId: string;
  driveName?: string;
  driveWebUrl?: string;
  rootFolder: string;
  rootFolderExists: boolean;
}

export interface WhoAmI {
  appid: string | null;
  appDisplayName: string | null;
  roles: string[];
  tenant: string | null;
  audience: string | null;
  siteId: string;
  resolvedDriveId: string | null;
  driveName: string | null;
  driveError: string | null;
}

export interface SharePointFile {
  id: string;
  name: string;
  sizeBytes: number;
  webUrl: string;
  eTag: string;
  mimeType: string;
  lastModified: string;
  categoryFolder: string;
}

export interface EnsureDataRoomResult {
  dataRoom: { id: string; name: string; webUrl: string };
  folders: Record<string, { id: string; webUrl: string }>;
}

export interface DeltaChange {
  id: string;
  name: string;
  deleted: boolean;
  isFolder: boolean;
  webUrl: string;
  eTag: string;
  lastModified: string;
  parentPath?: string;
}

export interface TreeEntry {
  type: "folder" | "file";
  id: string;
  name: string;
  relPath: string;
  sizeBytes?: number;
  mimeType?: string;
  webUrl?: string;
  childCount?: number;
  lastModified?: string;
}

export interface TreeResult {
  found: boolean;
  root?: { id: string; name: string; webUrl: string };
  count?: number;
  entries?: TreeEntry[];
}

export interface IntakeResult {
  home: string;
  processedRooms: number;
  rooms: { practiceName: string; total?: number; results?: unknown[] }[];
}

/** True when the Supabase env is present (the build was given the URL + anon key). */
export function isSharePointConfigured(): boolean {
  return !!SUPABASE_URL && !!ANON_KEY;
}

// ── Access passcode (kept in localStorage, never in the bundle) ──────────────

export function getAppKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(APP_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAppKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_KEY_STORAGE, key.trim());
  } catch {
    /* ignore */
  }
}

export function clearAppKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(APP_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function hasAppKey(): boolean {
  return getAppKey().length > 0;
}

// ── Transport ────────────────────────────────────────────────────────────────

async function call<T>(action: string, args: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("SharePoint is not configured (missing NEXT_PUBLIC_SUPABASE_* env).");
  }
  const appKey = getAppKey();
  if (!appKey) throw new Error("Locked: enter the SharePoint access passcode to continue.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sharepoint`, {
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
    throw new Error(`SharePoint ${action} failed (${res.status})`);
  }
  if (res.status === 401) throw new Error("Access passcode rejected. Re-enter it to unlock.");
  if (!res.ok || !json.ok) throw new Error(json.error ?? `SharePoint ${action} failed (${res.status})`);
  return json.result as T;
}

export const sharePoint = {
  whoami: () => call<WhoAmI>("whoami", {}),
  status: () => call<SharePointStatus>("status", {}),
  ensureDataRoom: (practiceName: string, destRoot?: string) =>
    call<EnsureDataRoomResult>("ensureDataRoom", { practiceName, destRoot }),
  listDocuments: (practiceName: string) =>
    call<{ dataRoomId?: string; files: SharePointFile[] }>("listDocuments", { practiceName }),
  moveDocument: (itemId: string, targetFolderId: string, newName?: string) =>
    call<{ id: string; name: string; webUrl: string; parentId: string }>("moveDocument", {
      itemId,
      targetFolderId,
      newName,
    }),
  deltaSync: (deltaLink?: string) =>
    call<{ changes: DeltaChange[]; deltaLink: string | null }>("deltaSync", { deltaLink }),
  /** Walk a folder path in the library (e.g. "M&A Diligence") and return every folder + file. */
  listTree: (path: string) => call<TreeResult>("listTree", { path }),
  /** Manually organize anything sitting in every data room's Intake folder. */
  organizeIntakes: () => call<IntakeResult>("organizeIntakes", {}),
};

/** Where the organized data rooms live in the library (matches the backend default). */
export const INTAKE_HOME = "M&A Diligence";
