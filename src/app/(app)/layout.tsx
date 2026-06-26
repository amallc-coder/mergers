import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { getRepository } from "@/lib/data/repository";
import { getGlobalOverdueCount } from "@/lib/selectors";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const repo = getRepository();
  const [user, overdueCount] = await Promise.all([repo.currentUser(), getGlobalOverdueCount()]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} overdueCount={overdueCount} />
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
