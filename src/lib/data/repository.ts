/**
 * Data-access layer.
 *
 * The UI depends only on the `DiligenceRepository` interface — never on the seed
 * arrays directly. The MVP ships a `SeedRepository` (in-memory, deterministic) so
 * the app runs with zero external services. A `SupabaseRepository` implementing
 * the same interface is the Phase-1 production drop-in (selected via DATA_BACKEND);
 * its query methods map 1:1 to the tables in /supabase/migrations.
 */

import type {
  ActivityEvent,
  Comment,
  DiligenceRequestItem,
  Document,
  ExtractedMetric,
  Meeting,
  Organization,
  RiskFlag,
  SellerPortalUser,
  Task,
  Transaction,
  TransactionContact,
  User,
} from "../domain/types";
import { sellerTokenValid } from "../domain/analytics";
import * as seed from "./seed";

export interface TransactionBundle {
  transaction: Transaction;
  contacts: TransactionContact[];
  requestItems: DiligenceRequestItem[];
  documents: Document[];
  metrics: ExtractedMetric[];
  riskFlags: RiskFlag[];
  tasks: Task[];
  meetings: Meeting[];
  comments: Comment[];
  activity: ActivityEvent[];
}

export interface DiligenceRepository {
  organization(): Promise<Organization>;
  users(): Promise<User[]>;
  user(id: string): Promise<User | undefined>;
  currentUser(): Promise<User>;

  transactions(): Promise<Transaction[]>;
  transaction(id: string): Promise<Transaction | undefined>;
  bundle(id: string): Promise<TransactionBundle | undefined>;

  contacts(transactionId: string): Promise<TransactionContact[]>;
  requestItems(transactionId: string): Promise<DiligenceRequestItem[]>;
  documents(transactionId: string): Promise<Document[]>;
  metrics(transactionId: string): Promise<ExtractedMetric[]>;
  riskFlags(transactionId: string): Promise<RiskFlag[]>;
  tasks(transactionId?: string): Promise<Task[]>;
  meetings(transactionId?: string): Promise<Meeting[]>;
  comments(transactionId: string): Promise<Comment[]>;
  activity(transactionId?: string): Promise<ActivityEvent[]>;

  sellerByToken(token: string): Promise<SellerPortalUser | undefined>;
  sellerPortalUsers(): Promise<SellerPortalUser[]>;
}

class SeedRepository implements DiligenceRepository {
  async organization() {
    return seed.ORG;
  }
  async users() {
    return seed.USERS;
  }
  async user(id: string) {
    return seed.USERS.find((u) => u.id === id);
  }
  async currentUser() {
    return seed.USERS.find((u) => u.id === seed.CURRENT_USER_ID)!;
  }
  async transactions() {
    return [...seed.TRANSACTIONS].sort(
      (a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime(),
    );
  }
  async transaction(id: string) {
    return seed.TRANSACTIONS.find((t) => t.id === id);
  }
  async contacts(transactionId: string) {
    return seed.CONTACTS.filter((c) => c.transactionId === transactionId);
  }
  async requestItems(transactionId: string) {
    return seed.REQUEST_ITEMS.filter((i) => i.transactionId === transactionId);
  }
  async documents(transactionId: string) {
    return seed.DOCUMENTS.filter((d) => d.transactionId === transactionId);
  }
  async metrics(transactionId: string) {
    return seed.METRICS.filter((m) => m.transactionId === transactionId);
  }
  async riskFlags(transactionId: string) {
    return seed.RISK_FLAGS.filter((r) => r.transactionId === transactionId);
  }
  async tasks(transactionId?: string) {
    return transactionId ? seed.TASKS.filter((t) => t.transactionId === transactionId) : seed.TASKS;
  }
  async meetings(transactionId?: string) {
    return transactionId
      ? seed.MEETINGS.filter((m) => m.transactionId === transactionId)
      : seed.MEETINGS;
  }
  async comments(transactionId: string) {
    return seed.COMMENTS.filter((c) => c.transactionId === transactionId);
  }
  async activity(transactionId?: string) {
    const rows = transactionId
      ? seed.ACTIVITY.filter((a) => a.transactionId === transactionId)
      : seed.ACTIVITY;
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async sellerByToken(token: string) {
    return seed.SELLER_PORTAL_USERS.find((s) => s.accessToken === token && sellerTokenValid(s));
  }
  async sellerPortalUsers() {
    return seed.SELLER_PORTAL_USERS;
  }
  async bundle(id: string): Promise<TransactionBundle | undefined> {
    const transaction = await this.transaction(id);
    if (!transaction) return undefined;
    const [contacts, requestItems, documents, metrics, riskFlags, tasks, meetings, comments, activity] =
      await Promise.all([
        this.contacts(id),
        this.requestItems(id),
        this.documents(id),
        this.metrics(id),
        this.riskFlags(id),
        this.tasks(id),
        this.meetings(id),
        this.comments(id),
        this.activity(id),
      ]);
    return { transaction, contacts, requestItems, documents, metrics, riskFlags, tasks, meetings, comments, activity };
  }
}

let _repo: DiligenceRepository | null = null;

export function getRepository(): DiligenceRepository {
  if (_repo) return _repo;
  // DATA_BACKEND=supabase would select the SupabaseRepository here in production.
  _repo = new SeedRepository();
  return _repo;
}
