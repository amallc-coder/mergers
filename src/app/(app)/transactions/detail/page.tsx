"use client";

// Query-param detail route. On a static export this single page handles any
// transaction id (seed or live DB UUID) — the id comes from ?id= at runtime, so
// no per-id pre-render is needed. useSearchParams requires a Suspense boundary.

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TransactionDetailView } from "@/components/views/TransactionDetailView";
import { ViewLoading } from "@/components/views/shared";

function DetailInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  if (!id) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-ink-500">No transaction selected.</p>
        <Link href="/transactions" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          ← All transactions
        </Link>
      </div>
    );
  }
  return <TransactionDetailView id={id} />;
}

export default function TransactionDetailQueryPage() {
  return (
    <Suspense fallback={<ViewLoading label="Loading transaction…" />}>
      <DetailInner />
    </Suspense>
  );
}
