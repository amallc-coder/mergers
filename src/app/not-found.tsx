import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center">
      <p className="text-5xl font-semibold text-ink-300">404</p>
      <h1 className="text-lg font-semibold text-ink-800">Not found</h1>
      <p className="max-w-sm text-sm text-ink-500">
        This transaction, document, or portal link doesn’t exist or you don’t have access to it.
      </p>
      <Link href="/" className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Back to dashboard
      </Link>
    </div>
  );
}
