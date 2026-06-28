import { getRepository } from "@/lib/data/repository";
import { TransactionDetailView } from "@/components/views/TransactionDetailView";

// Static export pre-renders one page per seed transaction id. Live deals (DB
// UUIDs) are reached through /transactions/detail?id=… instead, since their ids
// aren't known at build time. The body is the same client view either way.
export const dynamicParams = false;

export async function generateStaticParams() {
  const repo = getRepository();
  const transactions = await repo.transactions();
  return transactions.map((t) => ({ id: t.id }));
}

export default function TransactionDetailPage({ params }: { params: { id: string } }) {
  return <TransactionDetailView id={params.id} />;
}
