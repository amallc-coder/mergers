/**
 * Frontend client for the SharePoint Edge Function.
 *
 * Calls the Supabase Edge Function `sharepoint` (which holds the Azure secret and
 * talks to Microsoft Graph). The browser sends the user's Supabase access token;
 * Supabase verifies it before the function runs. No Microsoft credentials ever
 * reach the browser.
 *
 * Configure via env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface SharePointStatus {
  connected: boolean;
  driveName?: string;
  rootFolder: string;
  rootFolderExists: boolean;
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

export function isSharePointConfigured(): boolean {
  return !!SUPABASE_URL && !!ANON_KEY;
}

async function call<T>(action: string, args: Record<string, unknown>, accessToken: string): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("SharePoint not configured (set NEXT_PUBLIC_SUPABASE_* env)");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sharepoint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, ...args }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? `sharepoint ${action} failed (${res.status})`);
  return json.result as T;
}

export const sharePoint = {
  status: (token: string) => call<SharePointStatus>("status", {}, token),
  ensureDataRoom: (practiceName: string, token: string) =>
    call<EnsureDataRoomResult>("ensureDataRoom", { practiceName }, token),
  listDocuments: (practiceName: string, token: string) =>
    call<{ dataRoomId?: string; files: SharePointFile[] }>("listDocuments", { practiceName }, token),
  moveDocument: (itemId: string, targetFolderId: string, token: string, newName?: string) =>
    call<{ id: string; name: string; webUrl: string; parentId: string }>(
      "moveDocument",
      { itemId, targetFolderId, newName },
      token,
    ),
  deltaSync: (token: string, deltaLink?: string) =>
    call<{ changes: DeltaChange[]; deltaLink: string | null }>("deltaSync", { deltaLink }, token),
};
