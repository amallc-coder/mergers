import Link from "next/link";
import { FolderTree, ExternalLink } from "lucide-react";
import { Card, PageHeader, ProgressBar } from "@/components/ui";
import { SharePointPanel } from "@/components/sharepoint/SharePointPanel";
import { getRepository } from "@/lib/data/repository";
import { getTransactionSummaries } from "@/lib/selectors";

export default async function DataRoomsPage() {
  const repo = getRepository();
  const summaries = await getTransactionSummaries();
  const docCounts = await Promise.all(
    summaries.map(async (s) => (await repo.documents(s.transaction.id)).length),
  );

  return (
    <>
      <PageHeader title="Data Rooms" subtitle="Auto-generated, SharePoint-synced data rooms per transaction" />

      {/* Live SharePoint: create/sync data rooms and browse real files. */}
      <div className="mb-6">
        <SharePointPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s, idx) => (
          <Card key={s.transaction.id} className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FolderTree size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{s.transaction.practiceName}</p>
                  <p className="text-xs text-ink-400">{s.transaction.specialty}</p>
                </div>
              </div>
              {s.transaction.sharePointFolderUrl ? (
                <a href={s.transaction.sharePointFolderUrl} target="_blank" rel="noreferrer" className="text-ink-300 hover:text-brand-600">
                  <ExternalLink size={16} />
                </a>
              ) : null}
            </div>
            <div className="space-y-2.5">
              <Labeled label="Pre-signing"><ProgressBar pct={s.preStats.completionPct} showLabel /></Labeled>
              <Labeled label="Post-signing"><ProgressBar pct={s.postStats.completionPct} showLabel /></Labeled>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
              <span>{docCounts[idx]} document(s)</span>
              <Link href={`/transactions/${s.transaction.id}`} className="font-medium text-brand-600 hover:text-brand-700">
                Open data room →
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-500">{label}</p>
      {children}
    </div>
  );
}
