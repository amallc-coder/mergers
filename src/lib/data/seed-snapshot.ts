/**
 * Assembles the in-memory seed arrays into a single `Snapshot`, so the seed and
 * live backends share one repository implementation (`snapshotRepository`).
 */
import type { Snapshot } from "./snapshot";
import * as seed from "./seed";

export function seedSnapshot(): Snapshot {
  return {
    org: seed.ORG,
    users: seed.USERS,
    transactions: seed.TRANSACTIONS,
    contacts: seed.CONTACTS,
    requestItems: seed.REQUEST_ITEMS,
    documents: seed.DOCUMENTS,
    metrics: seed.METRICS,
    riskFlags: seed.RISK_FLAGS,
    tasks: seed.TASKS,
    meetings: seed.MEETINGS,
    comments: seed.COMMENTS,
    activity: seed.ACTIVITY,
    sellerPortalUsers: seed.SELLER_PORTAL_USERS,
  };
}
