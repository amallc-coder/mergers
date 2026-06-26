import { Check, Minus, ShieldCheck } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/domain/rbac";
import { ROLES, type Role } from "@/lib/domain/types";

export default function AdminPage() {
  const roles = ROLES as readonly Role[];

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Role-based access control — the live permissions matrix enforced across the platform"
      />

      <Card className="mb-6">
        <CardHeader
          title="Seller isolation invariant"
          icon={<ShieldCheck size={18} />}
          subtitle="External sellers are scoped to a single transaction and can never see internal data"
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {[
            "Own transaction only",
            "No internal notes",
            "No AI deal score",
            "No valuation",
            "No KPI dashboard",
            "No other transactions",
            "Revocable access",
            "Expiring links",
          ].map((t) => (
            <Badge key={t} className="bg-rose-50 text-rose-700 ring-rose-600/20">
              {t}
            </Badge>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Permissions matrix" subtitle={`${PERMISSIONS.length} permissions × ${roles.length} roles`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-xs text-ink-400">
              <tr>
                <th className="sticky left-0 bg-ink-50 px-4 py-2 font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r} className="px-2 py-2 text-center font-medium">
                    <span className="block w-16 truncate" title={ROLE_LABELS[r]}>
                      {ROLE_LABELS[r].split(" ")[0]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {PERMISSIONS.map((p) => (
                <tr key={p} className="hover:bg-ink-50/60">
                  <td className="sticky left-0 bg-white px-4 py-1.5 font-mono text-xs text-ink-700">{p}</td>
                  {roles.map((r) => {
                    const has = ROLE_PERMISSIONS[r].includes(p);
                    return (
                      <td key={r} className="px-2 py-1.5 text-center">
                        {has ? (
                          <Check size={15} className="mx-auto text-emerald-500" />
                        ) : (
                          <Minus size={14} className="mx-auto text-ink-200" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
