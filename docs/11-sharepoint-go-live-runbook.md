# SharePoint Go-Live Runbook (clinilytics M&A)

This makes the platform **actually** read from and write to your SharePoint — pulling
documents, auto-creating the category folders per deal, and moving/organizing files.

> **Target site (decided):** the dedicated **Merger & Acquisition** site,
> `https://amadmins.sharepoint.com/sites/MergerAcquisition`, where **Nish is a site
> admin**. We point here (not the tenant root site) precisely because the per-site
> permission grant in Step 4 can be approved by a site admin — you don't have to wait on
> a tenant Global Admin.

## Environment (confirmed)

| Thing | Value |
| --- | --- |
| Microsoft tenant | `amadministrators.com` |
| **Tenant ID** | `f73a517c-4c95-4e9b-a1f1-75682a29db48` |
| SharePoint host | `amadmins.sharepoint.com` |
| **Target site** | `Merger & Acquisition` — `/sites/MergerAcquisition` |
| **Site ID** (for the Step 4 grant) | `amadmins.sharepoint.com,1996d83e-3c65-4084-a5ed-c7c14230a6a4,46c4d59a-e9d2-4937-8418-d96fb37aafd6` |
| **Drive ID** (default document library) | `b!PtiWGWU8hECl7cfBQjCmpJrVxEbS6TdJhBjZb7N6r9YUnFaSuQLRQLoYOMc_JcN6` |
| Entra app (client) ID | `632f1c4a-7a7b-4800-a39d-51e4f26a8c81` (display name "Clinilytics MA") |
| Client secret **ID** (not the value) | `5c8a0df6-49d9-422b-be46-9967e6f5f092` |
| Supabase org | `AMA` (`elytgawkyqjwrqoacyoc`) |
| Supabase project | `clinilytics-ma` — ref `gyligrsjpvniupfvczqb`, region `us-east-1` |
| Edge Function URL | `https://gyligrsjpvniupfvczqb.supabase.co/functions/v1/sharepoint` |

## Status

| Step | Owner | State |
| --- | --- | --- |
| Entra app registered + client secret created | IT admin | ✅ done |
| Graph permission `Sites.Selected` (Application) **admin-consented** | IT admin | ✅ done — the app token carries `roles: ["Sites.Selected"]` |
| Azure secrets set in Supabase (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) | Nish | ✅ done |
| Edge Function `sharepoint` deployed | Nish | ✅ **v10 live** — runtime drive resolution, access-passcode gate, plus `resolveShare`/`listTree`/`deleteItem` for reading source folders and cleanup |
| **Per-site `write` grant for the app on the M&A site** | IT admin | ✅ **done** — the app reads and writes the M&A library |
| End-to-end verified (`whoami` → `status` → `ensureDataRoom` → `listDocuments`) | — | ✅ **done 2026-06-27** |
| Frontend wired (live console on Data Rooms + status on Settings) | — | ✅ **done** — anon-key auth + passcode in request body |
| Access gate (passcode SHA-256 in function, passcode in app localStorage) | — | ✅ **done** — wrong/missing passcode → 401 |

**The integration is LIVE.** The app authenticates app-only to Microsoft Graph, the
`Sites.Selected` grant on the Merger & Acquisition site is in place, and a test data room
(`Data Room - Dr. Stein`) with all 10 category folders was created in
`/sites/MergerAcquisition/Shared Documents/M&A Diligence/` and read back successfully.

> **Verification note:** from this environment, outbound egress to `*.supabase.co` is blocked
> by policy, so the function is exercised server-side via the database's `pg_net` extension
> (`select net.http_post(... '/functions/v1/sharepoint' ...)`, then read `net._http_response`).
> Use `timeout_milliseconds := 30000` for `ensureDataRoom` — creating 12 folders exceeds the
> 5 s default. A normal client (the app, or `curl` from a normal network) calls the same
> endpoint directly.

## Architecture

```
Browser (clinilytics, Supabase Auth login)
        │  authenticated fetch
        ▼
Supabase Edge Function  "sharepoint"   ← holds the Azure client secret (never in the browser)
        │  app-only Microsoft Graph (client credentials)
        ▼
Microsoft Graph  →  SharePoint  (/sites/MergerAcquisition, default document library)
```

The Azure secret lives only in the Edge Function. The browser never sees it.

---

## Step 4 — Grant the app `write` on the Merger & Acquisition site  ✅ DONE

> The IT admin applied this grant on 2026-06-27; the app now reads and writes the site.
> Kept here as the record of how it was done / how to re-apply if the app is ever re-registered.

`Sites.Selected` gives the app **zero** access until a specific site is granted to it.
Someone whose identity carries the `Sites.FullControl.All` application permission (your IT
admin, who registered the app and granted consent) runs this **once**:

**Option A — Graph Explorer** (https://developer.microsoft.com/graph/graph-explorer), signed
in as that admin:

```http
POST https://graph.microsoft.com/v1.0/sites/amadmins.sharepoint.com,1996d83e-3c65-4084-a5ed-c7c14230a6a4,46c4d59a-e9d2-4937-8418-d96fb37aafd6/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "632f1c4a-7a7b-4800-a39d-51e4f26a8c81", "displayName": "Clinilytics MA" } }
  ]
}
```

A `201 Created` response means the grant is live. (Use `"roles": ["fullcontrol"]` instead
of `["write"]` only if you also want the app to manage permissions; `write` is enough to
read, create folders, upload, and move.)

**Option B — PnP PowerShell**, which a **site-collection admin** can run for their own site:

```powershell
Connect-PnPOnline -Url https://amadmins.sharepoint.com/sites/MergerAcquisition -Interactive
Grant-PnPAzureADAppSitePermission `
  -AppId 632f1c4a-7a7b-4800-a39d-51e4f26a8c81 `
  -DisplayName "Clinilytics MA" `
  -Site https://amadmins.sharepoint.com/sites/MergerAcquisition `
  -Permissions Write
```

(First-time PnP use may prompt `Register-PnPManagementShellAccess`, a one-time tenant consent
for the PnP shell app.)

## Step 5 — Deploy the site-aware Edge Function  ✅ DONE (v8)

The repo's `supabase/functions/sharepoint/index.ts` resolves the document library at runtime
from the site ID, so it needs no drive ID hardcoded. Deploy it:

```bash
supabase functions deploy sharepoint --project-ref gyligrsjpvniupfvczqb
```

Function env (Project → Edge Functions → Secrets). Only the three Azure values are required;
the site defaults to Merger & Acquisition in code:

```bash
AZURE_TENANT_ID=f73a517c-4c95-4e9b-a1f1-75682a29db48
AZURE_CLIENT_ID=632f1c4a-7a7b-4800-a39d-51e4f26a8c81
AZURE_CLIENT_SECRET=<the secret VALUE — set directly in Supabase, never paste it in chat>
# Optional overrides:
# SHAREPOINT_SITE_ID=<override the default M&A site>
# SHAREPOINT_ROOT_FOLDER=<nest data rooms under a folder; default = library root>
```

> **No-redeploy fallback** if you can't deploy right now: the live v7 function reads
> `SHAREPOINT_DRIVE_ID` + `SHAREPOINT_ROOT_FOLDER` from secrets. Set
> `SHAREPOINT_DRIVE_ID=b!PtiWGWU8hECl7cfBQjCmpJrVxEbS6TdJhBjZb7N6r9YUnFaSuQLRQLoYOMc_JcN6`,
> set `SHAREPOINT_ROOT_FOLDER=M&A Diligence`, and create one empty folder named
> `M&A Diligence` in this site's **Documents** library. v7 will then operate inside it.
> The repo version is cleaner (auto-creates folders, works at the library root) — prefer
> deploying it when you can.

## Step 6 — Verify end to end

After Step 4, confirm the app can see the site (the `whoami` action decodes the app token and
tries to resolve this site's drive):

```bash
curl -sS https://gyligrsjpvniupfvczqb.supabase.co/functions/v1/sharepoint \
  -H "Authorization: Bearer <SUPABASE_ANON_OR_USER_JWT>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action":"whoami"}'
```

- `roles` should include `Sites.Selected` (consent) and `resolvedDriveId` should be non-null
  with no `driveError` (the Step 4 grant worked).
- Then `{"action":"status"}` → `connected: true`.
- Then `{"action":"ensureDataRoom","practiceName":"Dr. Stein"}` → creates
  `Data Room - Dr. Stein` + the 10 category subfolders in the library.
- Then `{"action":"listDocuments","practiceName":"Dr. Stein"}` → returns the files.

## Step 7 — Point the app at Supabase

Frontend env (`.env`):

```
DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://gyligrsjpvniupfvczqb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Then **Settings → Integrations → SharePoint** shows **Connected**, creating a transaction
auto-provisions its data room, the Data Room tab lists live files, and drag-to-recategorize
moves the file in SharePoint.

---

## Note on the 29 existing data rooms

The 29 `Data Room - <Practice>` folders discovered earlier live on the **tenant root site's**
`M&A Diligence` library — a different site from this one. Pointing the app at
`/sites/MergerAcquisition` means it won't see those existing folders until they're either
(a) moved/copied into this site's library, or (b) the app is *also* granted on the root site
(which needs a Global Admin — the path that was blocked). Decide per your preference; the
integration itself works the same against whichever site is granted in Step 4.
