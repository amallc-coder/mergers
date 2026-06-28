-- Security lockdown: enable RLS on the tables that had it disabled, so the
-- public anon key (compiled into the static bundle) can no longer read or write
-- them directly via PostgREST. The app never queries tables with the anon key —
-- all database access goes through the passcode-gated edge functions using the
-- service role, which bypasses RLS — so this has no effect on the app. With RLS
-- enabled and no policies, anon/authenticated are denied by default.

alter table public.organizations            enable row level security;
alter table public.users                    enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.transaction_user_scopes  enable row level security;
alter table public.diligence_templates      enable row level security;
alter table public.diligence_categories     enable row level security;
alter table public.diligence_template_items enable row level security;
alter table public.request_item_status_history enable row level security;
alter table public.request_assignments      enable row level security;
alter table public.upload_links             enable row level security;
alter table public.data_rooms               enable row level security;
alter table public.folders                  enable row level security;
alter table public.document_versions        enable row level security;
alter table public.sharepoint_files         enable row level security;
alter table public.notifications            enable row level security;
alter table public.reminder_schedules       enable row level security;
alter table public.sharepoint_sync_logs     enable row level security;
alter table public.outlook_sync_logs        enable row level security;
alter table public.permission_logs          enable row level security;
