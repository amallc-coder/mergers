/**
 * Server-side selectors: compose repository data with the analytics engine into
 * the view models the pages render. Keeps pages thin and logic testable.
 */

import {
  assessDealHealth,
  buildFolderMeta,
  buildMissingItemReport,
  completionForTimeline,
  computeCompletionStats,
  isOverdue,
} from "./domain/analytics";
import { generateExecutiveSummary } from "./domain/summary";
import { getRepository, type DiligenceRepository, type TransactionBundle } from "./data/repository";
import { NOW } from "./data/seed";
import type {
  CompletionStats,
  DealHealthAssessment,
  ExecutiveSummary,
  FolderMeta,
  MissingItemReport,
  Transaction,
} from "./domain/types";

export interface TransactionView extends TransactionBundle {
  preStats: CompletionStats;
  postStats: CompletionStats;
  allStats: CompletionStats;
  deal: DealHealthAssessment;
  missing: MissingItemReport;
  folders: FolderMeta[];
  execSummary: ExecutiveSummary;
}

export async function getTransactionViewWith(
  repo: DiligenceRepository,
  id: string,
): Promise<TransactionView | undefined> {
  const bundle = await repo.bundle(id);
  if (!bundle) return undefined;
  return decorate(bundle);
}

export async function getTransactionView(id: string): Promise<TransactionView | undefined> {
  return getTransactionViewWith(getRepository(), id);
}

function decorate(bundle: TransactionBundle): TransactionView {
  const { transaction, requestItems, documents, metrics, riskFlags } = bundle;
  return {
    ...bundle,
    preStats: completionForTimeline(requestItems, "Pre Signing", NOW),
    postStats: completionForTimeline(requestItems, "Post Signing", NOW),
    allStats: computeCompletionStats(requestItems, NOW),
    deal: assessDealHealth(transaction, requestItems, metrics, NOW),
    missing: buildMissingItemReport(requestItems, documents, NOW),
    folders: buildFolderMeta(requestItems, documents, NOW),
    execSummary: generateExecutiveSummary(transaction, requestItems, documents, metrics, riskFlags, NOW),
  };
}

export interface TransactionSummary {
  transaction: Transaction;
  preStats: CompletionStats;
  postStats: CompletionStats;
  allStats: CompletionStats;
  deal: DealHealthAssessment;
  criticalGaps: number;
  overdue: number;
  recentUploads: number;
}

export async function getTransactionSummariesWith(
  repo: DiligenceRepository,
): Promise<TransactionSummary[]> {
  const transactions = await repo.transactions();
  return Promise.all(
    transactions.map(async (transaction) => {
      const [requestItems, metrics, documents] = await Promise.all([
        repo.requestItems(transaction.id),
        repo.metrics(transaction.id),
        repo.documents(transaction.id),
      ]);
      const preStats = completionForTimeline(requestItems, "Pre Signing", NOW);
      const recentCutoff = new Date(NOW.getTime() - 7 * 86_400_000);
      return {
        transaction,
        preStats,
        postStats: completionForTimeline(requestItems, "Post Signing", NOW),
        allStats: computeCompletionStats(requestItems, NOW),
        deal: assessDealHealth(transaction, requestItems, metrics, NOW),
        criticalGaps: requestItems.filter(
          (i) => i.criticalPreSigning && i.neededTimeline === "Pre Signing" && i.status === "Pending",
        ).length,
        overdue: requestItems.filter((i) => isOverdue(i, NOW)).length,
        recentUploads: documents.filter((d) => new Date(d.uploadedAt) >= recentCutoff).length,
      };
    }),
  );
}

export async function getTransactionSummaries(): Promise<TransactionSummary[]> {
  return getTransactionSummariesWith(getRepository());
}

export async function getGlobalOverdueCount(): Promise<number> {
  const summaries = await getTransactionSummaries();
  return summaries.reduce((s, t) => s + t.overdue, 0);
}
