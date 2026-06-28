/**
 * Assembles the in-memory seed arrays into a single `Snapshot`, so the seed and
 * live backends share one repository implementation (`snapshotRepository`).
 */
import type { Snapshot } from "./snapshot";
import { DEFAULT_PIPELINE_STAGES, type Person, type ContactLink } from "../domain/types";
import * as seed from "./seed";

// Derive the global-contact model from the per-deal seed contacts so the rebuilt
// Contacts tab works in sample mode too.
function seedPeople(): { people: Person[]; links: ContactLink[] } {
  const byEmail = new Map<string, Person>();
  const links: ContactLink[] = [];
  for (const c of seed.CONTACTS) {
    const key = `${c.email}|${c.type}`;
    let p = byEmail.get(key);
    if (!p) {
      p = { id: c.id, type: c.type, name: c.name, email: c.email, phone: c.phone, functionalRoles: [], createdAt: seed.NOW.toISOString() };
      byEmail.set(key, p);
    }
    links.push({ contactId: p.id, transactionId: c.transactionId, isPrimary: !!c.primary, roleOnDeal: c.role });
  }
  return { people: [...byEmail.values()], links };
}

export function seedSnapshot(): Snapshot {
  const { people, links } = seedPeople();
  return {
    org: seed.ORG,
    pipelineStages: DEFAULT_PIPELINE_STAGES,
    people,
    contactLinks: links,
    communications: [],
    alertRouting: [],
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
