# `sharepoint` edge function — deploy status & instructions

## ⚠️ Current state (action required before re-extraction)

| Function | Deployed version | Matches committed source? |
|----------|------------------|---------------------------|
| `data` | **v9** | ✅ yes |
| `sharepoint` | **v28** | ❌ **no — behind committed** |

The **committed** `sharepoint/index.ts` contains accountant-audit consolidation
fixes that the **deployed v28 does not have yet**:

- `isPartialPeriod()` + completeness-tiered `periodRank()` (annualization / T12
  preference; partial YTD periods rank below full FY).
- Projection/forecast exclusion in `consolidate()` (a valuation memo's future-year
  figures can never become the headline ACTUAL).
- EBITDA-from-components (`ebitdaFromDoc`) with partial-period D&A skipped.
- The `reconsolidate` action (rebuilds consolidated rows from existing readings
  using the corrected logic, without re-reading documents).

The live numbers were corrected directly via SQL, so **what the app shows today is
correct.** The risk is purely latent:

> 🚫 **Do NOT run `extractMetrics` / `classifyDataRoom` / `reconsolidate` against
> `sharepoint` v28.** The old (v28) consolidation logic would overwrite the
> SQL-corrected headline metrics with pre-fix values. Deploy v29 (below) first.

Once v29 is deployed, running `reconsolidate` is the way to re-derive headline
KPIs with the corrected logic if needed.

## Why this wasn't deployed from the agent session

The Supabase MCP deploy tool requires the full function inline; at ~1,766 lines of
dense, nested-quote AI-prompt strings, hand-reproducing the **financial-extraction
engine** byte-exact is too risky (a silent transcription error → wrong numbers),
and there is no non-destructive way to verify it through that channel. The Supabase
**CLI** deploys the exact committed bytes — but this environment's egress policy
blocks `api.supabase.com` (proxy returns 403), so the CLI can't reach Supabase from
here. Deploy from an environment that can reach `api.supabase.com`.

## Deploy v29 (Supabase CLI — exact committed source)

From the repo root, in an environment whose network policy allows
`api.supabase.com`:

```bash
# 1) Authenticate (generate a token at Dashboard → Account → Access Tokens; revoke after).
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 2) Deploy. --use-api bundles server-side (no Docker needed).
#    --no-verify-jwt matches the current function (it is passcode-gated in-body, not by JWT).
supabase functions deploy sharepoint \
  --project-ref gyligrsjpvniupfvczqb \
  --no-verify-jwt \
  --use-api
```

Required secrets (already set on the project — do not need re-setting):
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. Optional:
`ANTHROPIC_API_KEY` (for classification/extraction), `SHAREPOINT_SITE_ID`,
`SHAREPOINT_DRIVE_ID_OVERRIDE`, `SHAREPOINT_ROOT_FOLDER`, `SHAREPOINT_INTAKE_HOME`,
`APP_ACCESS_KEY_SHA256`, `GRAPH_WEBHOOK_STATE`.

## Verify after deploy

```bash
# Confirms the function bundled and can see the SharePoint drive (read-only).
curl -sS https://gyligrsjpvniupfvczqb.supabase.co/functions/v1/sharepoint \
  -H 'Content-Type: application/json' \
  -d '{"appKey":"<team passcode>","action":"status"}'
```

Expect `connected: true` and the drive details. Then, if you want to re-derive
KPIs with the corrected logic:

```bash
curl -sS https://gyligrsjpvniupfvczqb.supabase.co/functions/v1/sharepoint \
  -H 'Content-Type: application/json' \
  -d '{"appKey":"<team passcode>","action":"reconsolidate"}'
```

Spot-check a few practices (e.g. Siwek, Govil, Stein, Rojas) afterward to confirm
the headline EBITDA / revenue match the expected corrected values.
