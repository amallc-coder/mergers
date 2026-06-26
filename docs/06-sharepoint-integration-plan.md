# 06 — SharePoint Integration Plan

**Platform:** Healthcare Mergers & Acquisitions Diligence Workflow Platform
**Audience:** Engineering, Platform/Infra, Security/Compliance, Microsoft 365 administrators
**Status:** Implementation-grade specification
**Integration surface:** Microsoft Graph API (`https://graph.microsoft.com/v1.0`)
**Last reviewed:** 2026-06-26

---

## 1. Purpose & Scope

This document specifies how the platform integrates with **SharePoint Online** as the **primary document repository (system of record for file bytes)** via the **Microsoft Graph API**. It covers Entra ID app registration, least-privilege Graph permissions, authentication flows, tenant/site/drive resolution, automatic data-room folder provisioning, two-way synchronization (push-out and inbound delta + webhooks), the database metadata mirror, conflict resolution, idempotency, throttling/backoff, deep links, and the operational `sync_log` schema.

### 1.1 Non-negotiable invariants

These mirror the data-model invariants in `03-database-schema.md` and govern every decision below.

1. **SharePoint holds the bytes; Postgres holds the metadata.** We never copy file content into the database. The DB stores Graph identifiers (`drive_id`, `item_id`, `eTag`, `web_url`, version id) and our workflow state. SharePoint is authoritative for the *file*; the DB is authoritative for *workflow, access control, and classification*.
2. **The DB is the read model, SharePoint is the write-through store.** Every byte mutation is performed against Graph first, then reflected into the DB. If the DB write fails after a successful Graph write, reconciliation (delta) repairs it — never the reverse.
3. **Least privilege at the site boundary.** The app is granted `Sites.Selected` and is provisioned write access **only** to the specific SharePoint site(s) that host M&A data rooms. It has zero tenant-wide file access.
4. **Idempotent, replayable sync.** Every sync operation is keyed so it can be retried or replayed without creating duplicates or corrupting version history.
5. **No PHI leaves the BAA boundary.** SharePoint Online and Microsoft Graph operate under the customer's Microsoft 365 BAA. We do not stage diligence files in any third-party store.

### 1.2 What this integration is *not*

- It is not a generic SharePoint sync engine. It tracks only the drives/folders the platform provisions inside the configured M&A site.
- It does not grant the Seller (external role) any SharePoint access. Sellers interact only with the app; the app brokers all Graph calls server-side. Internal users *may* deep-link into SharePoint when their role allows.

---

## 2. Architecture Overview

```
            ┌──────────────────────────── Next.js App (server) ───────────────────────────┐
            │  Route Handlers / Server Actions      Background workers (queue consumers)    │
            │  - upload orchestration               - delta-sync worker                     │
            │  - "Open in SharePoint" link mint     - subscription-renewal cron             │
            │  - webhook receiver (/api/graph/...)  - reconciliation / drift repair         │
            └───────────────┬───────────────────────────────────┬──────────────────────────┘
                            │  Graph SDK (client credentials)    │  Postgres (Supabase)
                            ▼                                     ▼
                  ┌───────────────────┐                ┌────────────────────────────┐
                  │  Microsoft Graph   │  webhooks ───▶ │ data_rooms / folders         │
                  │  (SharePoint site, │  (change       │ documents / document_versions│
                  │   scoped drive)    │   notifications)│ sharepoint_files             │
                  └───────────────────┘                │ sharepoint_subscriptions     │
                                                       │ sharepoint_delta_cursors     │
                                                       │ sync_log                     │
                                                       └────────────────────────────┘
```

**Component responsibilities**

| Component | Responsibility |
|---|---|
| **Graph client (`lib/graph`)** | Single typed wrapper around Microsoft Graph: auth/token cache, request signing, retry/backoff, throttling, idempotency keys. All Graph traffic flows through it. |
| **Provisioner** | Creates the data-room root folder + 10 category folders on transaction creation; persists `sharepoint_item_id`s. |
| **Upload orchestrator** | Server-side: streams app uploads into the correct SharePoint folder, then writes/advances `documents`/`document_versions`/`sharepoint_files`. |
| **Webhook receiver** | Public HTTPS endpoint that validates and enqueues Graph change notifications. Does *no* heavy work inline. |
| **Delta-sync worker** | Pulls `/delta` for each provisioned drive, diffs against the DB, applies inserts/updates/renames/moves/deletes, advances the delta cursor. |
| **Subscription manager** | Creates and renews Graph subscriptions before expiry; recovers from missed renewals via full delta. |
| **Reconciler** | Scheduled deep scan to repair drift the delta/webhook path missed (defense in depth). |

---

## 3. Entra ID App Registration

A **single multi-tenant-capable, single-tenant-deployed** application registration (confidential client) backs all server-to-Graph traffic. No delegated browser tokens are used for file operations — the browser never talks to Graph directly for diligence content.

### 3.1 Registration steps (one-time, by an M365 admin)

| Step | Action | Result captured |
|---|---|---|
| 1 | Register app `HC M&A Diligence Platform` in **Entra ID → App registrations** (single tenant). | `Application (client) ID` → `AZURE_CLIENT_ID`; `Directory (tenant) ID` → `AZURE_TENANT_ID`. |
| 2 | Create a **client secret** (or, preferred, a **certificate**). Set 12–24 mo expiry; calendar a rotation. | `AZURE_CLIENT_SECRET` (or cert thumbprint) → secret store / Key Vault. |
| 3 | Under **API permissions**, add Microsoft Graph **Application** permissions (§4). | Admin-consented permissions. |
| 4 | Click **Grant admin consent** for the tenant. | Consent recorded. |
| 5 | Register the webhook notification URL (validated at subscription-creation time, not here). | Used by §8. |
| 6 | (Recommended) Use a **certificate credential** stored in Azure Key Vault with managed-identity access from the host. | Removes long-lived secrets from env. |

### 3.2 Credential strategy

- **Production:** certificate credential (or Key Vault-backed secret) loaded at runtime via managed identity. No secret in the repo or in plaintext env on disk.
- **Lower environments / demo:** client secret in the host's secret manager (Vercel/Azure env). The codebase reads `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` exactly as declared in `.env.example`.
- **Rotation:** secrets/certs rotated via overlap (two valid credentials during cutover). Token cache is credential-agnostic.

---

## 4. Least-Privilege Graph Permissions

The platform requests the **minimum** Graph application permissions, anchored on `Sites.Selected` so file access is constrained to a single, explicitly authorized SharePoint site rather than the whole tenant.

### 4.1 Application permissions (admin consent)

| Permission | Type | Why it is needed | Scope effect |
|---|---|---|---|
| `Sites.Selected` | Application | Gate that lets an admin grant the app access to **only the specific site(s)** hosting M&A data rooms. Without this, file access would require tenant-wide scopes. | App has **no** site access until explicitly granted per-site (§4.2). |
| `Files.ReadWrite.All` *(effective scope reduced to the granted site)* | Application | Read/write driveItems inside the scoped site (create folders, upload, version, rename, delete). | Even though the catalog name is `.All`, with `Sites.Selected` the effective surface is **only** the granted site's drives. |

> **Design note.** `Sites.Selected` is the keystone. We deliberately avoid `Sites.ReadWrite.All`, `Files.ReadWrite.All` granted tenant-wide, or `Sites.FullControl.All`. The app's reachable surface equals "the M&A site(s) an admin chose," nothing more. The per-site grant is `write` (read+write driveItems) and is applied with the permission grant in §4.2.

### 4.2 Granting the app access to the specific site (per-site, by admin)

After admin consent to `Sites.Selected`, an admin grants the app `write` on the chosen site via Graph:

```http
POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "{AZURE_CLIENT_ID}", "displayName": "HC M&A Diligence Platform" } }
  ]
}
```

- This produces a **site-scoped permission** that is the *only* thing standing between the app and the data. Removing this grant instantly and completely revokes all file access, independent of app consent.
- We request **`write`**, not `owner`/`fullcontrol`. The app creates folders/files and versions but does not manage site settings, permissions of others, or membership.

### 4.3 Explicitly **not** requested

| Not requested | Reason |
|---|---|
| `Sites.ReadWrite.All`, `Sites.Manage.All`, `Sites.FullControl.All` | Tenant-wide or site-management scope; violates least privilege. |
| `User.Read.All`, `Directory.*` | We resolve internal users via our own `users` table + Entra sign-in; no directory enumeration needed for file sync. |
| `Mail.*` here | Outlook integration is a separate registration concern (see Outlook plan), kept decoupled. |

---

## 5. Authentication & Token Acquisition

### 5.1 Primary flow — Client Credentials (app-only)

All folder provisioning, uploads, delta sync, and subscription management use the **OAuth 2.0 client credentials grant** (app-only, no user context). This is correct because:

- The work is performed by **background workers** and **server route handlers**, not on behalf of an interactive user session.
- Access is already constrained by `Sites.Selected` to the M&A site; we do not need per-user delegated scoping at the Graph layer (our own RLS + RBAC enforce who can see what in the app).

```
POST https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token
grant_type=client_credentials
client_id={AZURE_CLIENT_ID}
scope=https://graph.microsoft.com/.default
client_assertion / client_secret=...
```

- **Token cache:** in-memory per-process with a small persistent fallback (encrypted) so cold starts don't stampede the token endpoint. Tokens are cached until `expires_in − 300s`.
- **`.default` scope** is required for app-only; it returns the union of admin-consented application permissions.

### 5.2 Secondary flow — On-Behalf-Of (OBO), narrowly used

We use **OBO** *only* for a small set of interactive, user-attributed actions where we want SharePoint to record the **actual internal user** as the actor (e.g., an internal reviewer choosing "Edit in SharePoint" / "Open in Office"). In those cases:

1. The browser holds a delegated Entra token for the app (Supabase Auth / Entra ID SSO).
2. The server exchanges it via OBO for a Graph token carrying the user's identity.
3. The action (e.g., minting an edit link) is performed as the user, so SharePoint's own audit log attributes it correctly.

| Action class | Flow | Actor recorded in SharePoint |
|---|---|---|
| Provision folders, server uploads, delta sync, subscriptions, deletes | **Client credentials (app-only)** | the app's service principal |
| Internal "Open/Edit in SharePoint" interactive handoff (optional, role-gated) | **OBO** | the signed-in internal user |
| Seller upload | **Client credentials** (server brokers; seller never touches Graph) | the app's service principal (app-side audit attributes the seller contact) |

> Sellers are **never** issued Graph tokens. Their uploads go to our server (scoped upload link), and the server writes to SharePoint app-only. Attribution to the seller contact is preserved in our `documents.uploaded_by_contact_id` and audit log.

---

## 6. Connecting to Tenant / Site / Drive

### 6.1 Resolution order

The platform resolves a stable **site id** and **drive id** once per environment and caches them; per-data-room folders live beneath that drive.

| Target | Graph call | Stored as |
|---|---|---|
| Site (by host + path) | `GET /sites/{hostname}:/sites/{site-path}` | `SHAREPOINT_SITE_ID` (env) and on each `data_rooms.sharepoint_site_id` |
| Default document library drive | `GET /sites/{siteId}/drive` (or `/drives` to choose a named library) | `SHAREPOINT_DRIVE_ID` (env) and `data_rooms.sharepoint_drive_id` |
| Root data-room folder for the platform | `GET /drives/{driveId}/root:/{SHAREPOINT_ROOT_FOLDER}` | conceptual root (e.g., `M&A Data Rooms`) |

- The configured constants `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID`, and `SHAREPOINT_ROOT_FOLDER` (default `M&A Data Rooms`) match `.env.example`.
- We persist `sharepoint_site_id` / `sharepoint_drive_id` on **`data_rooms`** so a deal stays bound to its drive even if the tenant later changes the default library, and so multi-site expansion (a second M&A site) is possible without code changes.

### 6.2 Addressing model

Graph driveItems can be addressed two ways; we use both deliberately:

- **By id** (`/drives/{driveId}/items/{itemId}`) — the canonical, rename-safe address. We always store and prefer `item_id`.
- **By path** (`/drives/{driveId}/root:/A/B/C:`) — used only at *creation* time and for human-readable provisioning; never trusted long-term because renames/moves invalidate paths.

---

## 7. Data-Room & Folder Auto-Provisioning

### 7.1 Trigger

When a transaction is created (or its data room is first opened), the **Provisioner** creates the deal's folder tree under `…/{SHAREPOINT_ROOT_FOLDER}/{deal-slug}/` and records every Graph folder id into our `folders` table (`sharepoint_item_id`).

### 7.2 Folder layout (fixed 10-folder taxonomy)

The 10 numbered folders map 1:1 to the diligence categories A–H, plus a credentials folder (Category A is sensitive and Post-Signing by default) and an unclassified queue. Numbering forces a stable sort order in SharePoint.

| # | SharePoint folder name | Maps to category | Notes |
|---|---|---|---|
| 01 | `01 Logins Passwords` | A. Logins/Passwords | Sensitive; restricted; default Post-Signing. Files here are rare — credentials use the secure vault flow, not document upload. |
| 02 | `02 Finance Accounting` | B. Finance/Accounting | |
| 03 | `03 Revenue Cycle Billing` | C. Revenue Cycle/Billing | |
| 04 | `04 Providers Credentialing` | D. Providers/Credentialing | |
| 05 | `05 Operations Clinical` | E. Operations/Clinical | |
| 06 | `06 HR Payroll` | F. HR/Payroll | |
| 07 | `07 IT EMR Systems` | G. IT/EMR/Systems | |
| 08 | `08 Legal Contracts Business` | H. Legal/Contracts/Business | |
| 09 | `09 Executed Documents` | (cross-category) | Signed agreements, final deliverables, closing binder. |
| 10 | `10 Unclassified Review Queue` | none | Landing zone for files SharePoint users drop without category, and for low-confidence AI classifications awaiting human routing. |

### 7.3 Creation algorithm (idempotent)

```
provisionDataRoom(transaction):
  ensure data_rooms row (site_id, drive_id) exists
  rootItem = ensureFolder(driveId, "{ROOT}/{dealSlug}")   # conflictBehavior=fail→fetch on 409
  upsert data_rooms.sharepoint_item path
  for (num, name, categoryId) in TEN_FOLDERS:
      child = ensureFolder(driveId, rootItem.id, name)
      upsert folders row:
          name, path, category_id=categoryId,
          sharepoint_item_id=child.id, parent_folder_id=rootItem.folderId
  registerSubscription(driveId, rootItem.id)   # §8
  primeDeltaCursor(driveId)                     # capture baseline delta link
```

`ensureFolder` (create-or-get) call:

```http
POST https://graph.microsoft.com/v1.0/drives/{driveId}/items/{parentId}/children
Content-Type: application/json

{ "name": "02 Finance Accounting", "folder": {}, "@microsoft.graph.conflictBehavior": "fail" }
```

- `conflictBehavior: "fail"` → on HTTP 409 we **GET the existing child** by path and reuse its id. This makes provisioning **idempotent** and safe to re-run (e.g., after a partial failure), and tolerant of folders an admin pre-created.
- Each successful create/get **upserts** the `folders` row keyed by `UNIQUE(data_room_id, path)` so a replay never duplicates rows.

### 7.4 Sensitive-folder hardening

`01 Logins Passwords` is provisioned but its app-side visibility is restricted to roles permitted Category A; the platform's RBAC (see `02-roles-permissions-matrix.md`) — not SharePoint ACLs — governs in-app visibility. Where the M365 admin wishes, an additional SharePoint-level permission break can be applied to that folder; the integration does not depend on it.

---

## 8. Two-Way Sync — Design

Sync is **bidirectional** but **asymmetric**:

- **Outbound (app → SharePoint):** synchronous, write-through. The app is the initiator; we write bytes to Graph, then mirror metadata.
- **Inbound (SharePoint → app):** event-driven + reconciliation. Graph **change notifications (webhooks)** wake the worker; the worker pulls **`/delta`** to learn exactly what changed; a periodic **reconciler** catches anything missed.

### 8.1 Outbound: push app uploads into the correct folder

1. Resolve target `folder.sharepoint_item_id` from the diligence item's category (or `10 Unclassified Review Queue` if uncategorized).
2. **Upload bytes to Graph:**
   - Small files (≤ 4 MB): `PUT /drives/{driveId}/items/{parentId}:/{filename}:/content`.
   - Large files: **resumable upload session** `POST …/createUploadSession`, then chunked `PUT` with `Content-Range`. Used for big EMR exports, scanned binders, etc.
   - New version of an existing logical document: upload to the **same driveItem path/id**, which makes SharePoint create a **new file version** automatically (preserving version history). We then read the new `eTag` + version id.
3. **Mirror to DB (single transaction):**
   - Upsert `sharepoint_files` (`drive_id`, `item_id`, `etag`, `web_url`, `graph_version_id`).
   - Create/advance `document_versions` (`version_number`, `sharepoint_file_id`, `size_bytes`, `sha256`).
   - Point `documents.current_version_id` at the new version.
4. Write an `audit_logs` entry and a `sync_log` row (`direction='outbound'`).

> **Ordering rule:** Graph first, DB second. If step 3 fails after step 2 succeeds, the file exists in SharePoint and the next inbound delta will reconcile it into the DB — so we never lose a byte, at worst we briefly under-report. We mark the `sync_log` row `partial` and the reconciler/delta closes the gap.

### 8.2 Inbound: detect SharePoint-side changes

Two complementary mechanisms:

| Mechanism | Role | Latency | Reliability |
|---|---|---|---|
| **Change notifications (webhooks / subscriptions)** | "Something changed in this drive" nudge. Carries little detail (Graph drive notifications are coarse). | Seconds | Best-effort; can be missed/delayed → must not be sole source of truth. |
| **Delta query (`/delta`)** | Authoritative enumeration of *what* changed since our cursor. | On-demand (triggered by webhook or schedule) | Exactly-tracks adds/updates/renames/moves/deletes via cursor. |
| **Reconciler (scheduled deep scan)** | Defense in depth: full or wide delta sweep to repair anything both above missed (e.g., long outage). | Minutes–hourly | Eventual-consistency backstop. |

#### 8.2.1 Subscriptions (webhooks)

Create one subscription per provisioned drive (resource is the drive root; Graph delivers coarse drive-level notifications):

```http
POST https://graph.microsoft.com/v1.0/subscriptions
{
  "changeType": "updated",
  "notificationUrl": "https://{app-host}/api/graph/notifications",
  "resource": "/drives/{driveId}/root",
  "expirationDateTime": "2026-06-29T00:00:00Z",   // ~ now + max allowed (drive items: up to ~30 days; we renew well before)
  "clientState": "{opaque-random-per-subscription-secret}"
}
```

- **Validation handshake:** on creation, Graph POSTs a `validationToken`; our endpoint must echo it as `text/plain` 200 within 10 s. The receiver handles this before any auth/business logic.
- **`clientState`:** a random per-subscription secret stored in `sharepoint_subscriptions`. Every inbound notification is rejected unless its `clientState` matches — this authenticates the webhook.
- **Receiver behavior:** validate `clientState`, ack **202** immediately, enqueue a `delta-sync` job for that `driveId`. **No heavy work inline** (Graph requires a fast ack and will retry/disable slow endpoints).

#### 8.2.2 Subscription renewal

Subscriptions expire. A **cron worker** renews each subscription well before `expirationDateTime`:

```
renewSubscriptions (every 6h):
  for sub in sharepoint_subscriptions where expires_at < now + RENEW_WINDOW(24h):
     PATCH /subscriptions/{sub.graph_id} { expirationDateTime: now + MAX }
     on 404 (already expired/lost):  recreate subscription
                                     then run FULL delta for that drive (catch missed events)
     update sharepoint_subscriptions.expires_at
```

- If a renewal is missed (worker outage), recreation is followed by a **full delta** so no SharePoint-side change is lost during the gap.

#### 8.2.3 Delta query

```http
# First call (baseline at provisioning): returns a deltaLink, no/early changes
GET https://graph.microsoft.com/v1.0/drives/{driveId}/root/delta

# Subsequent calls: use the stored deltaLink (it embeds the cursor token)
GET {stored deltaLink}
```

- Response is a page of changed `driveItem`s (+ `@odata.nextLink` for paging, `@odata.deltaLink` at the end).
- We **persist the final `deltaLink`** per drive in `sharepoint_delta_cursors` and resume from it next time → only changes since last sync are returned.
- Each returned item tells us its current state; we classify it (see §8.3) and apply to the DB.

### 8.3 Interpreting delta items → DB actions

For each `driveItem` in a delta page:

| Observed in delta | Detection | DB action |
|---|---|---|
| **New file** (unknown `item_id`) in a known folder | `item_id` not in `sharepoint_files` | Create `sharepoint_files` + `documents` + `document_versions`; route to category by parent folder; enqueue AI classification; if folder = `10 Unclassified Review Queue`, flag for human routing. |
| **Updated content** (new version) | `item_id` known, `eTag`/version id changed, size/hash differ | Upsert `sharepoint_files` (new version id, new eTag); add a new `document_versions` row; advance `documents.current_version_id`. |
| **Renamed** | `item_id` known, `name` changed | Update `documents.title`/`original_filename`, `folders.name` if a folder; **no new version**. |
| **Moved** (different parent) | `item_id` known, `parentReference.id` changed | Update `documents.folder_id` (re-map category if moved between category folders); update `folders.parent_folder_id`/`path` for folders. |
| **Deleted** | item carries `deleted` facet | Soft-delete: set `documents.deleted_at`; keep `sharepoint_files` row marked `deleted`; never hard-delete metadata (audit/compliance). |
| **New folder** | folder facet, unknown id | Insert `folders` row (best-effort category inference from name; else null). |
| **Restored** (deleted item reappears) | previously deleted `item_id` returns without `deleted` facet | Clear `documents.deleted_at`; mark `sharepoint_files` active. |

### 8.4 Metadata sync mapping

The mapping between SharePoint and our model is explicit and stored, never inferred at read time.

| SharePoint object | DB entity | Mapping key | Mapping field(s) |
|---|---|---|---|
| Site | `data_rooms.sharepoint_site_id` | site id | one M&A site (or several) |
| Document library (drive) | `data_rooms.sharepoint_drive_id` | drive id | per-deal drive binding |
| Category folder (01–10) | `folders` row | `sharepoint_item_id` ↔ `folders.id` | `folders.category_id` ↔ diligence category (A–H / queue) |
| driveItem (file) | `documents` (+ current `document_versions`) | `sharepoint_files.item_id` ↔ `document_versions.sharepoint_file_id` | `documents.folder_id` ↔ folder; `documents.request_item_id` ↔ diligence item (via AI/human routing) |
| File version | `document_versions` | `sharepoint_files.graph_version_id` + `version_number` | immutable per-version row |
| eTag / web_url | `sharepoint_files.etag` / `.web_url` | item id | change detection + deep links |

- **Folder ↔ category** is fixed at provisioning (§7.2). If a SharePoint user moves a file between numbered category folders, the inbound delta re-maps `documents.folder_id` and we re-derive the category (and re-trigger classification/routing if the category changed).
- **File ↔ document** identity is the Graph `item_id` (stable across rename/move), stored in `sharepoint_files.item_id`, which `document_versions.sharepoint_file_id` references.

---

## 9. "Open in SharePoint" Deep Links

Internal users (role-permitted) get direct links into SharePoint; sellers never do.

| Link type | Source | Behavior |
|---|---|---|
| **Open (view)** | `sharepoint_files.web_url` (persisted from Graph `webUrl`) | Opens the file in the SharePoint/Office web viewer. Cheapest — no Graph call at click time. |
| **Open folder** | `folders.sharepoint_item_id` → resolve folder `webUrl` (cached) | Opens the category folder in SharePoint. |
| **Edit (interactive, OBO)** | Minted server-side via OBO so SharePoint attributes the edit to the actual internal user | Used for "Edit in Office" handoff; role-gated. |
| **Fresh download** | `GET /drives/{driveId}/items/{itemId}` → `@microsoft.graph.downloadUrl` | Short-lived pre-authenticated URL; cached in `sharepoint_files.download_url_cached` with `download_url_expires_at`; **never** persisted long-term or shown after expiry. |

- We **persist `web_url`** at write/delta time so the common "Open in SharePoint" action requires no live Graph call.
- Download URLs are **ephemeral** — refreshed on demand and never trusted past `download_url_expires_at`.
- Deep links respect app RBAC: the UI only renders a link if the user's role grants access to that category/document; the link itself still lands on SharePoint's own auth, which is the second gate.

---

## 10. Conflict Resolution

Because both the app and SharePoint users can change files, conflicts are inevitable. SharePoint is the **source of truth for bytes**; the DB defers to it.

### 10.1 Concurrency control with eTags

- Every Graph mutation we perform sends **`If-Match: {etag}`** when we intend to update a known item.
- A **412 Precondition Failed** means SharePoint changed underneath us → we **abort the optimistic write**, pull `/delta` (or GET the item), reconcile our `sharepoint_files`/`document_versions`, then retry the user's intent against the fresh state (or surface a "changed in SharePoint, review and retry" prompt for interactive edits).

### 10.2 Conflict matrix

| Scenario | Resolution |
|---|---|
| App uploads a new version while a SharePoint user also edited | eTag mismatch (412) on our write → reconcile first. SharePoint's edit becomes a version; the app's upload becomes the next version on top (no data loss; version history preserved). |
| File renamed in SharePoint and in app near-simultaneously | Last-writer per field, but **SharePoint wins for the filename** (it owns the byte object). Inbound delta overwrites `documents.title`. App-side display name can diverge via a separate `documents.title` only if product chooses; default = mirror SharePoint name. |
| File deleted in SharePoint, app still references it | Inbound delta soft-deletes `documents`; app marks the diligence item's document as "removed in SharePoint" and notifies the assigned reviewer; the request item reverts toward `Pending` if it has no other satisfying document. |
| File moved between two category folders in SharePoint | `documents.folder_id` re-mapped; category re-derived; if the new category differs, re-classify and re-route; audit the move. |
| Duplicate upload (same content) | `sha256` match within the same logical document → treated as no-op new version; across documents → flagged as potential duplicate for reviewer, not auto-merged. |

### 10.3 Tie-break principle

> When the DB and SharePoint disagree about a **file**, SharePoint wins and the DB is corrected. When they disagree about **workflow state** (status, assignment, classification, notes), the **DB wins** — SharePoint has no opinion on workflow.

---

## 11. Idempotency, Retry, Backoff & Throttling

### 11.1 Idempotency

- **Outbound uploads** carry a deterministic **idempotency key** = `hash(transaction_id, document_id|request_item_id, sha256, target_folder_item_id)`. If a retry replays an upload whose key already produced a `document_versions` row with the same `sha256` against the same item, we **skip** the second write.
- **Folder provisioning** is idempotent via `conflictBehavior:"fail"` + GET-on-409 and `UNIQUE(data_room_id, path)` upserts (§7.3).
- **Inbound delta** is idempotent by construction: applying the same delta item twice yields the same DB state (upserts keyed on `item_id`/`graph_version_id`). Reprocessing a page after a crash is safe.
- **Webhook notifications** are idempotent: a notification only *enqueues* a delta job; duplicate notifications collapse into a single in-flight delta run per drive (a per-drive job lock).

### 11.2 Throttling (HTTP 429) & service errors

Microsoft Graph throttles aggressively and returns `429 Too Many Requests` (and sometimes `503`) with a **`Retry-After`** header. The Graph client wrapper enforces:

| Rule | Behavior |
|---|---|
| Honor `Retry-After` | On 429/503, sleep exactly `Retry-After` seconds before the next attempt — never sooner. |
| Exponential backoff w/ jitter | When no `Retry-After`, back off `base * 2^attempt` + random jitter (cap ~60 s). |
| Bounded retries | Max 5 attempts for idempotent ops; non-idempotent ops retried only when safe (eTag-guarded). |
| Concurrency caps | Per-drive serialization for writes; a global concurrency limiter to stay under tenant Graph limits. |
| Batching | Use Graph **`$batch`** for many small reads (e.g., resolving several folder `webUrl`s) to reduce request count. |
| Circuit breaker | After repeated 429/5xx, open the breaker for a drive, defer its jobs, alert ops. |
| Retry classes | Retryable: 429, 503, 504, 509, transient network. Non-retryable: 400/401/403/404 (these are bugs/permission/identity issues → log + alert, no blind retry). |

### 11.3 Failure isolation

- A failing drive/subscription does not block others (per-drive jobs, per-drive cursors).
- Poison jobs (repeated non-retryable failures) move to a dead-letter state on the `sync_log` row (`status='failed'`) with the full error payload for triage.

---

## 12. Database Tables Owned by This Integration

The core mirror tables (`data_rooms`, `folders`, `documents`, `document_versions`, `sharepoint_files`) are defined authoritatively in `03-database-schema.md`. This integration **adds the operational tables** below. (The existing `sharepoint_sync_logs` summary table in the schema doc is the per-run rollup; the `sync_log` here is the granular, per-operation event log — see §13.)

### 12.1 `sharepoint_subscriptions`

Tracks each Graph change-notification subscription so we can renew before expiry and authenticate notifications.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `data_room_id` | `uuid` FK → `data_rooms.id` | scope |
| `drive_id` | `text` NOT NULL | subscribed drive |
| `resource` | `text` NOT NULL | e.g. `/drives/{id}/root` |
| `graph_subscription_id` | `text` NOT NULL UNIQUE | id returned by Graph |
| `change_type` | `text` NOT NULL | `updated` |
| `client_state` | `text` NOT NULL | per-sub secret; validates inbound notifications |
| `notification_url` | `text` NOT NULL | our receiver |
| `expires_at` | `timestamptz` NOT NULL | renewal deadline |
| `last_renewed_at` | `timestamptz` NULL | |
| `status` | `text` NOT NULL DEFAULT `active` | `active` / `expired` / `failed` |
| `created_at` / `updated_at` | `timestamptz` | |

- **Index:** `idx_spsub_expiry (expires_at)`, `idx_spsub_drive (drive_id)`.

### 12.2 `sharepoint_delta_cursors`

One durable cursor per drive — the resume point for incremental delta.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `drive_id` | `text` NOT NULL UNIQUE | one cursor per drive |
| `data_room_id` | `uuid` FK → `data_rooms.id` NULL | |
| `delta_link` | `text` NOT NULL | last `@odata.deltaLink` (embeds token) |
| `last_synced_at` | `timestamptz` NULL | |
| `last_status` | `text` NULL | `ok` / `partial` / `failed` |
| `created_at` / `updated_at` | `timestamptz` | |

- **Unique:** `UNIQUE(drive_id)`.

---

## 13. `sync_log` Schema

Granular, append-style operational log: **one row per sync operation** (each outbound write, each inbound delta-item application, each subscription action). It is the forensic trail for reconciliation, idempotency checks, and incident triage. It complements (does not replace) the per-run `sharepoint_sync_logs` rollup and the legal `audit_logs`.

```sql
CREATE TYPE sync_direction AS ENUM ('outbound', 'inbound', 'subscription', 'reconcile');
CREATE TYPE sync_operation AS ENUM (
  'create', 'update_version', 'rename', 'move', 'delete', 'restore',
  'provision_folder', 'subscribe', 'renew', 'validate', 'noop'
);
CREATE TYPE sync_outcome AS ENUM ('success', 'partial', 'skipped_idempotent', 'conflict', 'throttled', 'failed');

CREATE TABLE sync_log (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at         timestamptz NOT NULL DEFAULT now(),

  -- scope
  transaction_id      uuid REFERENCES transactions(id),
  data_room_id        uuid REFERENCES data_rooms(id),
  drive_id            text,

  -- what happened
  direction           sync_direction NOT NULL,
  operation           sync_operation NOT NULL,
  outcome             sync_outcome   NOT NULL,

  -- SharePoint / Graph identifiers
  sharepoint_item_id  text,                 -- driveItem id (file or folder)
  etag                text,                 -- eTag observed
  graph_version_id    text,                 -- file version id
  parent_item_id      text,                 -- for moves

  -- DB linkage (what we touched)
  document_id         uuid REFERENCES documents(id),
  document_version_id uuid REFERENCES document_versions(id),
  folder_id           uuid REFERENCES folders(id),
  sharepoint_file_id  uuid REFERENCES sharepoint_files(id),

  -- correlation & idempotency
  idempotency_key     text,                 -- dedupe outbound replays
  delta_token_before  text,                 -- cursor in
  delta_token_after   text,                 -- cursor out
  graph_request_id    text,                 -- Graph 'request-id' header for MS support
  trigger             text,                 -- 'webhook' | 'cron' | 'user' | 'provision' | 'reconcile'

  -- throttling / retry telemetry
  http_status         int,
  retry_count         int NOT NULL DEFAULT 0,
  retry_after_ms      int,

  -- detail
  message             text,
  error               jsonb,                -- structured error payload on failure
  duration_ms         int,

  actor_user_id       uuid REFERENCES users(id)   -- null = system/worker
);

CREATE INDEX idx_synclog_time        ON sync_log (occurred_at DESC);
CREATE INDEX idx_synclog_item        ON sync_log (drive_id, sharepoint_item_id);
CREATE INDEX idx_synclog_txn         ON sync_log (transaction_id, occurred_at DESC);
CREATE INDEX idx_synclog_outcome     ON sync_log (outcome, occurred_at DESC);
CREATE UNIQUE INDEX uq_synclog_idem  ON sync_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND outcome IN ('success','skipped_idempotent');
```

- The **partial unique index on `idempotency_key`** is the database-level enforcement of outbound idempotency: a replayed upload that already succeeded cannot create a second successful operation row.
- `graph_request_id` is captured from every Graph response header so failures can be escalated to Microsoft support with a precise correlation id.
- `delta_token_before/after` let us reconstruct exactly which cursor produced which DB mutations.

---

## 14. Sequence Diagrams

### 14.1 Upload-and-sync (outbound: app → SharePoint → DB)

```mermaid
sequenceDiagram
    autonumber
    participant U as User / Seller (via app)
    participant API as Next.js Server (Upload Orchestrator)
    participant GC as Graph Client (auth+retry)
    participant SP as Microsoft Graph / SharePoint
    participant DB as Postgres

    U->>API: Upload file for diligence item X
    API->>DB: Resolve target folder (category → folders.sharepoint_item_id)
    API->>API: Compute sha256 + idempotency_key
    API->>DB: Check idempotency_key (already succeeded?)
    alt Already uploaded (replay)
        DB-->>API: hit
        API-->>U: 200 (no-op, skipped_idempotent)
    else New upload
        API->>GC: PUT /content (or createUploadSession for large file)
        GC->>SP: Upload bytes (If-Match for new version)
        alt 429 / 503 throttled
            SP-->>GC: 429 Retry-After
            GC->>GC: Wait Retry-After, backoff+jitter
            GC->>SP: Retry upload
        end
        SP-->>GC: 201/200 driveItem {id, eTag, webUrl, versionId}
        GC-->>API: driveItem
        API->>DB: BEGIN
        API->>DB: upsert sharepoint_files (item_id, etag, web_url, graph_version_id)
        API->>DB: insert document_versions (n+1, sha256, size)
        API->>DB: advance documents.current_version_id
        API->>DB: insert sync_log (outbound, success, idempotency_key)
        API->>DB: insert audit_logs
        API->>DB: COMMIT
        API->>API: enqueue AI classification (async)
        API-->>U: 200 (uploaded; webUrl available)
    end
```

### 14.2 Inbound delta sync (SharePoint change → webhook → delta → DB)

```mermaid
sequenceDiagram
    autonumber
    participant SPU as SharePoint User
    participant SP as Microsoft Graph / SharePoint
    participant WH as Webhook Receiver (/api/graph/notifications)
    participant Q as Job Queue
    participant W as Delta-Sync Worker
    participant GC as Graph Client
    participant DB as Postgres

    SPU->>SP: Add / edit / rename / move / delete file in folder
    SP->>WH: POST change notification {clientState, resource=driveId}
    WH->>WH: Validate clientState (reject if mismatch)
    WH-->>SP: 202 Accepted (fast ack)
    WH->>Q: Enqueue delta job for driveId (collapse duplicates)
    Q->>W: Dispatch (per-drive lock)
    W->>DB: Load delta_link from sharepoint_delta_cursors[driveId]
    loop Until no @odata.nextLink
        W->>GC: GET {deltaLink or nextLink}
        GC->>SP: /drives/{driveId}/root/delta
        SP-->>GC: page of changed driveItems
        GC-->>W: items[]
        loop Each driveItem
            W->>W: Classify (new / version / rename / move / delete / restore)
            alt New file
                W->>DB: insert sharepoint_files + documents + document_versions
                W->>W: enqueue AI classification; route by parent folder
            else New version
                W->>DB: upsert sharepoint_files; add document_versions; advance current_version_id
            else Rename / Move
                W->>DB: update documents/folders (title/folder_id/path)
            else Delete
                W->>DB: soft-delete documents; mark sharepoint_files deleted
            else Restore
                W->>DB: clear deleted_at; mark active
            end
            W->>DB: insert sync_log (inbound, <op>, outcome)
        end
    end
    W->>DB: persist @odata.deltaLink → sharepoint_delta_cursors[driveId]
    W->>DB: insert sharepoint_sync_logs (run rollup: processed/changed)
```

---

## 15. Error & Edge-Case Handling

| # | Scenario | Detection | Handling | Resulting state |
|---|---|---|---|---|
| 1 | **429 throttling** on upload/delta | HTTP 429 + `Retry-After` | Honor `Retry-After`, then backoff+jitter; per-drive serialize; `$batch` reads | `sync_log.outcome='throttled'` → retried to `success` |
| 2 | **Token expired mid-batch** | 401 from Graph | Refresh app token, retry once; if still 401 → alert (consent/secret issue) | Transparent on transient; alert on persistent |
| 3 | **Subscription expired / missed renewal** | 404 on PATCH renew, or `clientState` for unknown sub | Recreate subscription, then run **full delta** for the drive to catch gap | No lost changes; cursor advanced |
| 4 | **Webhook validation handshake** | Initial POST carries `validationToken` | Echo token as `text/plain` 200 within 10 s, before any logic | Subscription created |
| 5 | **Spoofed / replayed notification** | `clientState` mismatch | Reject (no enqueue), log security event | No action taken |
| 6 | **Duplicate notifications** | Multiple POSTs for same drive | Collapse into single in-flight delta job (per-drive lock) | One delta run |
| 7 | **eTag conflict (412)** on app write | 412 Precondition Failed | Abort optimistic write, reconcile via delta/GET, retry intent or prompt user | SharePoint version preserved; no data loss |
| 8 | **File deleted in SharePoint** while referenced | `deleted` facet in delta | Soft-delete `documents`; notify assigned reviewer; revert item status if unsatisfied | `documents.deleted_at` set; metadata retained |
| 9 | **File moved between category folders** | `parentReference.id` changed | Re-map `documents.folder_id`; re-derive category; re-classify if category changed | Category corrected; move audited |
| 10 | **Renamed file/folder** | `name` changed, same `item_id` | Update name fields; no new version | Names mirrored |
| 11 | **Large file upload interrupted** | Upload session error/timeout | Resume session from last `nextExpectedRanges`; if session lost, restart (idempotency_key dedupes) | Completed once; single version |
| 12 | **Partial outbound (Graph ok, DB write failed)** | Exception after Graph 201 | Mark `sync_log.outcome='partial'`; next delta reconciles file into DB | Self-heals via inbound delta |
| 13 | **Delta token invalid/expired (410 Gone / resync)** | Graph returns 410 or `@odata.context` resync signal | Discard cursor, perform **full re-enumeration** (initial delta), diff against DB | Cursor rebaselined; no duplicates (upserts) |
| 14 | **Provisioning folder already exists** | 409 on create | GET existing child, reuse id; upsert `folders` | Idempotent provisioning |
| 15 | **Site permission revoked** (`Sites.Selected` grant removed) | 403 on all Graph calls for the drive | Open circuit breaker for drive; alert admins; surface "SharePoint access lost" banner; no data loss in SharePoint | Sync paused until re-granted |
| 16 | **Secret/cert expired** | 401 `invalid_client` at token endpoint | Page on-call; failover to alternate (overlapping) credential during rotation | Restored on rotation |
| 17 | **Duplicate content (same sha256)** | Hash match | Same document → no-op version; different document → flag potential duplicate for reviewer | No silent merge |
| 18 | **Clock/expiry on download URL** | `download_url_expires_at` passed | Never serve stale URL; re-fetch `@microsoft.graph.downloadUrl` on demand | Always fresh, short-lived URL |
| 19 | **Out-of-order events** (delta vs webhook race) | Version id / eTag comparison | Apply only if incoming version ≥ stored; ignore stale | Monotonic version history |
| 20 | **File created directly in `10 Unclassified Review Queue`** | New file, parent = queue folder | Create document with null category; flag `requires_human_review`; surface in routing queue | Awaits human routing |

---

## 16. Security & Compliance Notes

- **Least privilege:** `Sites.Selected` + per-site `write` grant means the app's blast radius is exactly one (or a few explicitly chosen) M&A site(s). Revoking the site grant is an instant, complete kill-switch.
- **Webhook authenticity:** every notification is validated against the per-subscription `client_state` secret; mismatches are rejected and security-logged.
- **No bytes in DB; no plaintext credentials:** consistent with `03-database-schema.md`. Category A (`01 Logins Passwords`) folder exists for parity but the credential workflow uses the secure vault, not file upload.
- **Attribution:** server-brokered seller uploads are attributed to the seller contact in the app's `documents`/`audit_logs`; OBO is used where SharePoint-side attribution to a specific internal user matters.
- **BAA boundary:** all file content remains within SharePoint Online / Microsoft Graph under the M365 BAA; nothing is staged in non-BAA third-party storage.
- **Auditability:** `sync_log` (operational), `sharepoint_sync_logs` (per-run rollup), and `audit_logs` (legal) together give a complete, replayable record of every byte movement and metadata change.

---

## 17. Configuration Reference

| Env var (`.env.example`) | Purpose |
|---|---|
| `AZURE_TENANT_ID` | Entra tenant (token authority) |
| `AZURE_CLIENT_ID` | App registration client id |
| `AZURE_CLIENT_SECRET` | Client secret (prod prefers Key Vault cert) |
| `SHAREPOINT_SITE_ID` | Resolved M&A site id |
| `SHAREPOINT_DRIVE_ID` | Document library drive id |
| `SHAREPOINT_ROOT_FOLDER` | Root container (default `M&A Data Rooms`) |

---

## 18. Open Items / Phase-2 Candidates

1. **Multi-site sharding** — route different deal portfolios to different M&A sites for storage governance; the per-`data_room` site/drive binding already supports it.
2. **SharePoint metadata columns** — push diligence status/category into SharePoint library columns for users who live in SharePoint (one-way, app → SP).
3. **Retention labels / holds** — apply M365 retention labels to `09 Executed Documents` for legal hold automation.
4. **Bulk import** — onboarding an existing deal whose files already live in SharePoint via a one-shot full delta + AI classification sweep.
5. **Co-authoring awareness** — surface "locked/being edited in SharePoint" state in the app to pre-empt eTag conflicts.

---

*End of Document 06 — SharePoint Integration Plan.*
