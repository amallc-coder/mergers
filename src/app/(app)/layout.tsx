import { AppShell } from "@/components/auth/AppShell";
import type { AdminUser } from "@/components/auth/AuthProvider";
import { getRepository } from "@/lib/data/repository";
import { getGlobalOverdueCount } from "@/lib/selectors";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const repo = getRepository();
  const [users, overdueCount] = await Promise.all([repo.users(), getGlobalOverdueCount()]);

  // Internal users seed the login + admin roster. Sellers use the token portal.
  const initialUsers: AdminUser[] = users
    .filter((u) => u.role !== "seller")
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: true }));

  return (
    <AppShell initialUsers={initialUsers} overdueCount={overdueCount}>
      {children}
    </AppShell>
  );
}
