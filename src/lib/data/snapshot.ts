/**
 * Snapshot-backed repository.
 *
 * A `Snapshot` is the entire dataset in one object — the exact shape the live
 * backend's `app_snapshot()` returns and the seed module exposes. Both the
 * in-memory seed and the live Supabase path build a `Snapshot` and hand it to
 * `snapshotRepository()`, which implements the `DiligenceRepository` interface
 * by filtering it. This keeps one query implementation for both data sources.
 */

import type {
  ActivityEvent,
  AlertRoute,
  Comment,
  Communication,
  ContactLink,
  DiligenceRequestItem,
  Document,
  ExtractedMetric,
  Meeting,
  Organization,
  Person,
  PipelineStage,
  RiskFlag,
  SellerPortalUser,
  Task,
  Transaction,
  TransactionContact,
  User,
} from "../domain/types";
import type { DiligenceRepository, TransactionBundle } from "./repository";

export interface Snapshot {
  org: Organization;
  pipelineStages?: PipelineStage[];
  people?: Person[];
  contactLinks?: ContactLink[];
  communications?: Communication[];
  alertRouting?: AlertRoute[];
  users: User[];
  transactions: Transaction[];
  contacts: TransactionContact[];
  requestItems: DiligenceRequestItem[];
  documents: Document[];
  metrics: ExtractedMetric[];
  riskFlags: RiskFlag[];
  tasks: Task[];
  meetings: Meeting[];
  comments: Comment[];
  activity: ActivityEvent[];
  sellerPortalUsers: SellerPortalUser[];
}

/** Build a repository over an arbitrary snapshot (seed or live). */
export function snapshotRepository(s: Snapshot): DiligenceRepository {
  const pickCurrentUser = () =>
    s.users.find((u) => u.role === "admin") ?? s.users[0];

  return {
    async organization() {
      return s.org;
    },
    async users() {
      return s.users;
    },
    async user(id: string) {
      return s.users.find((u) => u.id === id);
    },
    async currentUser() {
      return pickCurrentUser();
    },
    async transactions() {
      return [...s.transactions].sort(
        (a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime(),
      );
    },
    async transaction(id: string) {
      return s.transactions.find((t) => t.id === id);
    },
    async contacts(transactionId: string) {
      return s.contacts.filter((c) => c.transactionId === transactionId);
    },
    async requestItems(transactionId: string) {
      return s.requestItems.filter((i) => i.transactionId === transactionId);
    },
    async documents(transactionId: string) {
      return s.documents.filter((d) => d.transactionId === transactionId);
    },
    async metrics(transactionId: string) {
      return s.metrics.filter((m) => m.transactionId === transactionId);
    },
    async riskFlags(transactionId: string) {
      return s.riskFlags.filter((r) => r.transactionId === transactionId);
    },
    async tasks(transactionId?: string) {
      return transactionId ? s.tasks.filter((t) => t.transactionId === transactionId) : s.tasks;
    },
    async meetings(transactionId?: string) {
      return transactionId
        ? s.meetings.filter((m) => m.transactionId === transactionId)
        : s.meetings;
    },
    async comments(transactionId: string) {
      return s.comments.filter((c) => c.transactionId === transactionId);
    },
    async activity(transactionId?: string) {
      const rows = transactionId
        ? s.activity.filter((a) => a.transactionId === transactionId)
        : s.activity;
      return [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
    async sellerByToken(token: string) {
      return s.sellerPortalUsers.find((u) => u.accessToken === token && u.active);
    },
    async sellerPortalUsers() {
      return s.sellerPortalUsers;
    },
    async bundle(id: string): Promise<TransactionBundle | undefined> {
      const transaction = s.transactions.find((t) => t.id === id);
      if (!transaction) return undefined;
      return {
        transaction,
        contacts: s.contacts.filter((c) => c.transactionId === id),
        requestItems: s.requestItems.filter((i) => i.transactionId === id),
        documents: s.documents.filter((d) => d.transactionId === id),
        metrics: s.metrics.filter((m) => m.transactionId === id),
        riskFlags: s.riskFlags.filter((r) => r.transactionId === id),
        tasks: s.tasks.filter((t) => t.transactionId === id),
        meetings: s.meetings.filter((m) => m.transactionId === id),
        comments: s.comments.filter((c) => c.transactionId === id),
        activity: [...s.activity.filter((a) => a.transactionId === id)].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      };
    },
  };
}
