/**
 * Seller-portal transport for the live `data` Edge Function.
 *
 * Unlike `snapshot-client.ts` (which sends the team `appKey`), seller calls are
 * authorized ONLY by an opaque per-deal token carried in the portal URL. The
 * function validates the token against `seller_portal_users` and serves a
 * strictly transaction-scoped, seller-safe view — never the team passcode, never
 * another deal, never internal notes/KPIs/valuation.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface SellerThreadMessage {
  id: string;
  direction: "to_seller" | "from_seller";
  subject: string | null;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface SellerContext {
  practiceName: string;
  sellerName: string;
  thread: SellerThreadMessage[];
}

/** True when the build is wired to a live Supabase backend. */
export function sellerBackendReady(): boolean {
  return !!SUPABASE_URL && !!ANON_KEY;
}

async function call<T>(action: string, args: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error("This portal is not available right now.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...args }),
  });

  let json: { ok?: boolean; result?: unknown; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Request failed (${res.status})`);
  }
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json.result as T;
}

export const sellerApi = {
  context: (token: string) => call<SellerContext>("sellerContext", { sellerToken: token }),
  reply: (token: string, body: string) =>
    call<{ message: unknown }>("sellerReply", { sellerToken: token, body }),
};
