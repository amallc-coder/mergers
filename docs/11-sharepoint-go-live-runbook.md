# SharePoint Go-Live Runbook (clinilytics M&A)

This is the step-by-step to make the platform **actually** read from and write to your
SharePoint M&A Diligence library — pulling documents, auto-creating the category
folders per deal, and moving/organizing files.

## Your environment (already discovered)

| Thing | Value |
| --- | --- |
| Microsoft tenant | `amadministrators.com` |
| **Tenant ID** | `f73a517c-4c95-4e9b-a1f1-75682a29db48` |
| SharePoint host | `amadmins.sharepoint.com` |
| Library path | `Shared Documents / M&A Diligence` |
| **Drive ID** (M&A Diligence lib) | `b!Cj5_yGQ_ZkORjWITXqQBVzRmobB3fBpMikLZPJHC1qo5ppUh7DCvQLmnnLS6mI9S` |
| **Site ID** (for `Sites.Selected` grant) | `amadmins.sharepoint.com,c87f3e0a-3f64-4366-918d-62135ea40157,b0a16634-7c77-4c1a-8a42-d93c91c2d6aa` |
| Existing deal folders | 29 × `Data Room - <Practice>` |
| Supabase org | `AMA` (`elytgawkyqjwrqoacyoc`) |

## Provisioned (already done)

- **Supabase project:** `clinilytics-ma` — ref `gyligrsjpvniupfvczqb`, region `us-east-1`
- **API URL:** `https://gyligrsjpvniupfvczqb.supabase.co`
- **Migrations applied:** `0001_schema`, `0002_rls`, `0003_sharepoint_connection`, `0004_seed_reference_data`
- **Edge Function deployed:** `sharepoint` (JWT-protected) →
  `https://gyligrsjpvniupfvczqb.supabase.co/functions/v1/sharepoint`

Remaining: the Entra app + admin consent + site grant, then set the function secrets below.

## Architecture

```
Browser (clinilytics, Supabase Auth login)
        │  authenticated fetch
        ▼
Supabase Edge Function  "sharepoint"   ← holds the Azure client secret (never in the browser)
        │  app-only Microsoft Graph (client credentials)
        ▼
Microsoft Graph  →  SharePoint  (amadmins.sharepoint.com / M&A Diligence)
        │
        └─ writes file + folder metadata back into Supabase Postgres
```

The secret lives only in the Edge Function. The browser never sees Azure credentials.

---

## Step 1 — Register an Entra (Azure AD) application

Do this at **https://entra.microsoft.com** → *Applications → App registrations → New registration*.

- **Name:** `clinilytics M&A — SharePoint sync`
- **Supported account types:** *Single tenant*
- **Redirect URI:** leave blank (this is a daemon / app-only integration)
- Click **Register**. Copy the **Application (client) ID** and the **Directory (tenant) ID**
  (tenant ID should match `f73a517c-4c95-4e9b-a1f1-75682a29db48`).

Then create a secret: *Certificates & secrets → New client secret* → copy the **Value**
immediately (you can't see it again). This is `AZURE_CLIENT_SECRET`.

## Step 2 — Add Microsoft Graph permissions (least privilege)

*API permissions → Add a permission → Microsoft Graph → **Application permissions***:

| Permission | Why |
| --- | --- |
| `Sites.Selected` | App can act **only on sites you explicitly grant** (not the whole tenant). Recommended. |
| `Files.ReadWrite.All` | Read/create/move files within granted sites. |

> Prefer `Sites.Selected` over `Sites.ReadWrite.All`. With `Sites.Selected` the app has **zero**
> access until you grant it the single M&A Diligence site (Step 4), which is the secure default.

## Step 3 — Get admin consent  ← *your blocker; here's how*

Application permissions always require a **one-time admin consent** by a Global Administrator
(or Privileged Role / Cloud Application Administrator). Three ways, easiest first:

**A. If you ARE an admin:** on the app's *API permissions* page click **“Grant admin consent for
American Medical Administrators.”** Done.

**B. If you're NOT an admin — send your admin a consent link.** After Step 1 you have the client
ID; send this URL to whoever administers your Microsoft 365 — they sign in once and click *Accept*:

```
https://login.microsoftonline.com/f73a517c-4c95-4e9b-a1f1-75682a29db48/adminconsent?client_id=<YOUR_CLIENT_ID>
```

**C. Don't know who the admin is?** Find them at **https://admin.microsoft.com** → *Roles → Role
assignments → Global Administrator* (shows who holds it). For a company your size it's often the
person who set up Microsoft 365 / your outsourced IT (MSP). Forward them the link from option B
plus this runbook.

> How to tell if it's you: open the app's API permissions page — if the **“Grant admin consent”**
> button is enabled (not greyed out) and succeeds, you're an admin. If it errors with
> "you do not have permission," you're not, so use option B/C.

## Step 4 — Grant the app access to just the M&A Diligence site (`Sites.Selected`)

After consent, the app still needs to be granted the specific site. An admin runs this once
(Graph Explorer at https://developer.microsoft.com/graph/graph-explorer, or we expose a one-click
button in **Settings → Integrations**):

```http
POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
{
  "roles": ["write"],
  "grantedToIdentities": [{ "application": { "id": "<YOUR_CLIENT_ID>", "displayName": "clinilytics M&A" } }]
}
```

Get `{siteId}` with: `GET https://graph.microsoft.com/v1.0/sites/amadmins.sharepoint.com:/`
→ use the returned `id` (looks like `amadmins.sharepoint.com,<guid>,<guid>`).

## Step 5 — Create the Supabase project + set secrets

1. Create a project in the **AMA** org (or let me create it for you): name `clinilytics-ma`,
   region `us-east-1`.
2. Apply the SQL migrations from `/supabase/migrations` (schema + RLS + the new
   `0003_sharepoint_connection.sql`).
3. Set Edge Function secrets (Project → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set \
  AZURE_TENANT_ID=f73a517c-4c95-4e9b-a1f1-75682a29db48 \
  AZURE_CLIENT_ID=<YOUR_CLIENT_ID> \
  AZURE_CLIENT_SECRET=<YOUR_CLIENT_SECRET> \
  SHAREPOINT_DRIVE_ID=b!Cj5_yGQ_ZkORjWITXqQBVzRmobB3fBpMikLZPJHC1qo5ppUh7DCvQLmnnLS6mI9S \
  SHAREPOINT_SITE_ID=<from Step 4> \
  SHAREPOINT_ROOT_FOLDER="M&A Diligence"
```

4. Deploy the function: `supabase functions deploy sharepoint`

## Step 6 — Point the app at Supabase

Set in the frontend env (`.env`):

```
DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

The app's **Settings → Integrations → SharePoint** page then shows **Connected**, and:
- Creating a transaction calls `sharepoint:ensureDataRoom` → creates `Data Room - <name>` + the 10
  category subfolders.
- The Data Room tab calls `sharepoint:listDocuments` → pulls files + metadata.
- Drag-to-recategorize calls `sharepoint:moveDocument` → moves the file in SharePoint.
- A scheduled `sharepoint:deltaSync` keeps metadata current.

---

## What needs you vs. what's already built

| Step | Who | Status |
| --- | --- | --- |
| Edge Function `sharepoint` (Graph: ensure folders, list, move, delta) | **built** | `supabase/functions/sharepoint/` |
| SQL: connection/config + document/folder tables | **built** | `supabase/migrations/` |
| Frontend client wiring | **built** | `src/lib/sharepoint/client.ts` |
| Entra app registration + secret | you | Step 1 |
| **Admin consent** | you / your admin | Step 3 ← the long pole |
| Grant `Sites.Selected` to the M&A site | admin | Step 4 |
| Supabase project + secrets + deploy | you (or I can create the project) | Step 5 |

**Recommended order:** start Step 3 (admin consent) today — it's the only step with a human
dependency outside your control. Everything else takes minutes once consent lands.
