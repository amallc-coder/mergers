import { notFound } from "next/navigation";
import { SellerChecklist, type SellerItem } from "@/components/portal/SellerChecklist";
import { getRepository } from "@/lib/data/repository";
import { isOverdue } from "@/lib/domain/analytics";
import { NOW } from "@/lib/data/seed";

export const dynamicParams = false;

export async function generateStaticParams() {
  const repo = getRepository();
  const sellers = await repo.sellerPortalUsers();
  return sellers.map((s) => ({ token: s.accessToken }));
}

export default async function SellerPortalPage({ params }: { params: { token: string } }) {
  const repo = getRepository();
  const seller = await repo.sellerByToken(params.token);
  if (!seller) notFound();

  const transaction = await repo.transaction(seller.transactionId);
  if (!transaction) notFound();

  const [items, comments] = await Promise.all([
    repo.requestItems(transaction.id),
    repo.comments(transaction.id),
  ]);

  // STRICT ISOLATION: project only seller-safe fields. Internal notes, AI
  // confidence/score, reviewer assignments, KPIs, valuation, and risk data are
  // never included in what is sent to the seller's browser.
  const sellerItems: SellerItem[] = items.map((i) => ({
    id: i.id,
    category: i.category,
    name: i.name,
    neededTimeline: i.neededTimeline,
    sensitive: i.sensitive,
    status: i.status,
    dueDate: i.dueDate,
    documentNames: i.documents.map((d) => d.fileName),
    sellerFacingNotes: i.sellerFacingNotes,
    thread: comments
      .filter((c) => c.requestItemId === i.id && c.visibility === "seller_facing")
      .map((c) => ({ author: c.authorName, body: c.body, at: c.createdAt })),
    overdue: isOverdue(i, NOW),
  }));

  const completed = sellerItems.filter((i) => i.status === "Received" || i.status === "Not Applicable").length;
  const outstanding = sellerItems.filter((i) => i.status === "Pending" || i.status === "Denied").length;
  const overdue = sellerItems.filter((i) => i.overdue).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900">{transaction.practiceName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          Welcome, {seller.name}. Please upload the requested documents below. Items marked “Pre Signing” are
          our priority.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <PortalStat label="Completed" value={completed} tone="good" />
        <PortalStat label="Still needed" value={outstanding} tone={outstanding > 0 ? "warn" : "good"} />
        <PortalStat label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "good"} />
      </div>

      <SellerChecklist items={sellerItems} />
    </>
  );
}

function PortalStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
}) {
  const toneClass = tone === "good" ? "text-brand-600" : tone === "warn" ? "text-ochre-600" : "text-rust-600";
  return (
    <div className="rounded-xl border border-ink-200 bg-panel px-4 py-3 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
