"use client";

import { useState } from "react";
import { Check, Minus, Plus, RotateCcw, ShieldCheck, ShieldX, Trash2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/domain/rbac";
import { ROLES, type Role } from "@/lib/domain/types";
import { cn } from "@/lib/ui";

export function AdminConsole() {
  const {
    currentUser,
    can,
    config,
    allPermissions,
    setUserRole,
    toggleUserActive,
    addUser,
    removeUser,
    toggleRolePermission,
    resetConfig,
  } = useAuth();

  if (!can("user:manage")) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldX size={28} />}
          title="Access restricted"
          hint="Only Admins can manage users and permissions. Sign in as an Admin to edit access."
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Manage users and role-based access. Changes are saved to this browser."
        action={
          <button
            onClick={resetConfig}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100/50"
          >
            <RotateCcw size={14} /> Reset to defaults
          </button>
        }
      />

      <div className="space-y-6">
        <UsersPanel
          users={config.users}
          currentUserId={currentUser?.id}
          onRole={setUserRole}
          onToggleActive={toggleUserActive}
          onAdd={addUser}
          onRemove={removeUser}
        />
        <PermissionsMatrix
          rolePermissions={config.rolePermissions}
          permissions={allPermissions}
          onToggle={toggleRolePermission}
        />
      </div>
    </>
  );
}

function UsersPanel({
  users,
  currentUserId,
  onRole,
  onToggleActive,
  onAdd,
  onRemove,
}: {
  users: ReturnType<typeof useAuth>["config"]["users"];
  currentUserId?: string;
  onRole: (id: string, role: Role) => void;
  onToggleActive: (id: string) => void;
  onAdd: (u: { name: string; email: string; role: Role; active: boolean }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("finance_reviewer");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onAdd({ name: name.trim(), email: email.trim(), role, active: true });
    setName("");
    setEmail("");
  };

  return (
    <Card>
      <CardHeader title="Users" subtitle={`${users.length} account(s)`} icon={<ShieldCheck size={18} />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-ink-200/70 bg-ink-100/40 text-[11px] uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-ink-100/30">
                <td className="px-5 py-2.5 font-medium text-ink-900">
                  {u.name}
                  {u.id === currentUserId ? (
                    <Badge className="ml-2 bg-brand-100 text-brand-700 ring-brand-600/20">you</Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-500">{u.email}</td>
                <td className="px-3 py-2.5">
                  <select
                    value={u.role}
                    onChange={(e) => onRole(u.id, e.target.value as Role)}
                    className="rounded-lg border border-ink-200 bg-canvas px-2 py-1 text-xs text-ink-700 outline-none focus:border-brand-400"
                  >
                    {ROLES.filter((r) => r !== "seller").map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onToggleActive(u.id)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset",
                      u.active
                        ? "bg-brand-100 text-brand-700 ring-brand-600/20"
                        : "bg-ink-100 text-ink-500 ring-ink-400/25",
                    )}
                  >
                    {u.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => onRemove(u.id)}
                    className="text-ink-400 hover:text-rust-600"
                    title="Remove user"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add user */}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-ink-200/70 px-5 py-3">
        <label className="flex-1">
          <span className="label-micro mb-1 block text-ink-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Lee"
            className="w-full rounded-lg border border-ink-200 bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </label>
        <label className="flex-1">
          <span className="label-micro mb-1 block text-ink-400">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jlee@amadministrators.com"
            className="w-full rounded-lg border border-ink-200 bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </label>
        <label>
          <span className="label-micro mb-1 block text-ink-400">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-ink-200 bg-canvas px-2.5 py-1.5 text-sm text-ink-700 outline-none focus:border-brand-400"
          >
            {ROLES.filter((r) => r !== "seller").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-canvas hover:bg-brand-800"
        >
          <Plus size={15} /> Add user
        </button>
      </form>
    </Card>
  );
}

function PermissionsMatrix({
  rolePermissions,
  permissions,
  onToggle,
}: {
  rolePermissions: ReturnType<typeof useAuth>["config"]["rolePermissions"];
  permissions: readonly string[];
  onToggle: (role: Role, permission: never) => void;
}) {
  const roles = ROLES as readonly Role[];
  return (
    <Card>
      <CardHeader
        title="Permissions matrix"
        subtitle={`${permissions.length} permissions × ${roles.length} roles — click a cell to toggle`}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-ink-200/70 bg-ink-100/40 text-[11px] text-ink-400">
            <tr>
              <th className="sticky left-0 bg-ink-100/40 px-4 py-2 font-medium">Permission</th>
              {roles.map((r) => (
                <th key={r} className="px-2 py-2 text-center font-medium">
                  <span className="block w-16 truncate" title={ROLE_LABELS[r]}>
                    {ROLE_LABELS[r].split(" ")[0]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60">
            {permissions.map((p) => (
              <tr key={p} className="hover:bg-ink-100/30">
                <td className="sticky left-0 bg-panel px-4 py-1.5 text-xs text-ink-700">{p}</td>
                {roles.map((r) => {
                  const has = rolePermissions[r]?.includes(p as never) ?? false;
                  const isSeller = r === "seller";
                  return (
                    <td key={r} className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => onToggle(r, p as never)}
                        disabled={isSeller}
                        className={cn(
                          "mx-auto flex h-5 w-5 items-center justify-center rounded transition-colors",
                          has ? "bg-brand-100 text-brand-700 hover:bg-brand-200" : "text-ink-300 hover:bg-ink-100",
                          isSeller ? "cursor-not-allowed opacity-60" : "",
                        )}
                        title={isSeller ? "Seller role is locked (external isolation)" : has ? "Granted — click to revoke" : "Denied — click to grant"}
                      >
                        {has ? <Check size={13} /> : <Minus size={12} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-200/70 px-5 py-3 text-[11px] text-ink-400">
        The <span className="font-medium text-ink-600">Seller</span> role is locked to enforce external isolation —
        sellers can never gain access to internal notes, KPIs, deal scores, or other transactions.
      </p>
    </Card>
  );
}
