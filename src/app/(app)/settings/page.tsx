import {
  Bell,
  Cloud,
  FileStack,
  Mail,
  Settings as SettingsIcon,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { getRepository } from "@/lib/data/repository";
import { ROLE_LABELS } from "@/lib/domain/rbac";
import { AMA_DILIGENCE_TEMPLATE } from "@/lib/domain/diligence-template";

export default async function SettingsPage() {
  const repo = getRepository();
  const users = await repo.users();
  const internal = users.filter((u) => u.role !== "seller");

  const integrations = [
    { name: "Microsoft Entra ID (SSO + MFA)", icon: Cloud, status: "Configurable", detail: "AZURE_TENANT_ID / AZURE_CLIENT_ID" },
    { name: "SharePoint (Microsoft Graph)", icon: Cloud, status: "Configurable", detail: "Data-room sync · Phase 2" },
    { name: "Outlook / Microsoft 365", icon: Mail, status: "Configurable", detail: "Calendar + email · Phase 2" },
    { name: "Azure OpenAI + Document Intelligence", icon: Sparkles, status: "Configurable", detail: "Classification + extraction · Phase 3" },
    { name: "Supabase Postgres", icon: FileStack, status: "Schema ready", detail: "DATA_BACKEND=supabase" },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Users, templates, integrations, and automation" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Users */}
        <Card>
          <CardHeader title="User management" subtitle={`${internal.length} internal user(s)`} icon={<Users size={18} />} />
          <div className="divide-y divide-ink-100">
            {internal.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{u.name}</p>
                  <p className="truncate text-xs text-ink-400">{u.email}</p>
                </div>
                <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{ROLE_LABELS[u.role]}</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader title="Integrations" subtitle="Microsoft 365 + AI services" icon={<SettingsIcon size={18} />} />
          <div className="divide-y divide-ink-100">
            {integrations.map((i) => {
              const Icon = i.icon;
              return (
                <div key={i.name} className="flex items-center gap-3 px-5 py-3">
                  <Icon size={18} className="shrink-0 text-ink-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{i.name}</p>
                    <p className="truncate text-xs text-ink-400">{i.detail}</p>
                  </div>
                  <Badge className="bg-ink-100 text-ink-600 ring-ink-500/20">{i.status}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Diligence template */}
        <Card>
          <CardHeader title="Diligence templates" subtitle="Reusable, admin-editable" icon={<FileStack size={18} />} />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">{AMA_DILIGENCE_TEMPLATE.name}</p>
                <p className="text-xs text-ink-400">Version {AMA_DILIGENCE_TEMPLATE.version} · {AMA_DILIGENCE_TEMPLATE.items.length} items · 8 categories</p>
              </div>
              <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">Default</Badge>
            </div>
            <p className="mt-3 text-xs text-ink-500">{AMA_DILIGENCE_TEMPLATE.description}</p>
          </div>
        </Card>

        {/* Notifications + reminders */}
        <Card>
          <CardHeader title="Notifications & reminders" icon={<Bell size={18} />} />
          <div className="space-y-3 px-5 py-4 text-sm text-ink-600">
            <ToggleRow icon={<Bell size={15} />} label="In-app notifications" on />
            <ToggleRow icon={<Mail size={15} />} label="Email notifications" on />
            <ToggleRow icon={<Cloud size={15} />} label="Microsoft Teams notifications" />
            <ToggleRow icon={<Timer size={15} />} label="Daily digest" on />
            <ToggleRow icon={<Timer size={15} />} label="Weekly leadership summary" on />
            <ToggleRow icon={<Timer size={15} />} label="Pre-due / due-date / overdue reminders" on />
          </div>
        </Card>
      </div>
    </>
  );
}

function ToggleRow({ icon, label, on = false }: { icon: React.ReactNode; label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink-700">{icon} {label}</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full ${on ? "bg-brand-600" : "bg-ink-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-panel transition ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </div>
  );
}
