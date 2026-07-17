---
brain_node: crm
type: reference
system: crm
title: Authenticated walkthrough evidence
summary: Creator portal + admin dogfood paths; demo vs real auth; cookie-sync for full sessions.
---

# Authenticated walkthrough evidence (VAV + CaneyCloud)

**Date:** 2026-07-17 · **Mode:** public probes + code map (no operator cookie session in this run)

## 1. Public probes (unauthenticated)

| URL | Code | Notes |
|-----|------|-------|
| https://vamosavenezuela.com/ | 200 | Consumer home |
| https://vamosavenezuela.com/login | 200 | Tourist/provider auth |
| https://vamosavenezuela.com/register | (follow redirects) | Self-serve tourist |
| https://vamosavenezuela.com/provider-register | live route | Provider funnel |
| https://vamosavenezuela.com/creator | 307 | → login/invite gate |
| https://vamosavenezuela.com/demo | live | Demo mode UI |
| https://vamosavenezuela.com/api/internal/ping | 401 | Route up; needs platform key |
| https://www.caneycloud.com/login | live | Operator login |
| https://www.caneycloud.com/register | live | Operator signup (pending approval) |

## 2. Creator portal route map (code)

```
app/creator/
  invite/                 # claim invite
  (portal)/
    layout.tsx
    dashboard/
    codes/
    earnings/
    itineraries/
    onboarding/
    settings/
  [username]/             # public profile
```

Admin creators: `app/(admin)/admin/creators`, `admin/creator-invites`.  
APIs: `app/api/creator/*`, `app/api/admin/creator-invites`.

## 3. What you can dogfood without cookies

| Action | Works? |
|--------|--------|
| Browse VAV marketplace, destinations, public content | Yes |
| Open login / register / provider-register forms | Yes |
| Hit creator portal deep links | Redirects to auth |
| Internal platform ping | 401 (expected) |
| CaneyCloud marketing + login page | Yes |
| CaneyCloud API health | Via Cloud Run `/health` (see API health runbook) |

## 4. Demo path (provider PMS mock)

| Item | Value |
|------|-------|
| Email | `luismendez@posadalaspalmeras.com` |
| Password | `Choroni2018!` (seed / `lib/pms/demo-data.ts`) |
| Seed | `npx tsx scripts/seed-demo.ts` in VAV |
| Flag | `NEXT_PUBLIC_DEMO_MODE=true` serves mock PMS data |

**Caveat (audits):** pure client Zustand “demo login” (`demo@vzexplorer.com`) does **not** create a Supabase session → many authenticated APIs return 401. Prefer the seeded Supabase demo user for real demos.

E2E: `e2e/demo-login.spec.ts`, `e2e/creator-flows.spec.ts`, fixtures in `e2e/helpers/fixtures.ts`.

## 5. Full admin / creator session (operator)

Agents cannot use your production password unless you provide a session:

1. **Browser yourself** — log into VAV admin + creator in Chrome.  
2. **Cookie-sync** (gstack skill `cookie-sync` / Browserbase) — import cookies for `vamosavenezuela.com` so headless browse can act as you.  
3. **Local dev** — `DEV_SKIP_AUTH` / project-specific flags only when documented in VAV config skill; never enable in prod.

CaneyCloud operator: log into `www.caneycloud.com` with staff-approved account; channels UI at `/channels`.

## 6. CRM Platforms as operator cockpit

With CRM auth (`AGB_DEV_FAKE_USER=1` locally):

1. Open `/platforms`  
2. Confirm VAV Site + invite badges  
3. Confirm Caney Site + Backend API (`/health` · ok)  
4. Confirm **Live connection** partner-room chips for Ucaima (when linkage columns filled)  
5. Jump out via quick links (new tab, platform-native login)

## 7. Prod pre-launch countdown (important)

As of 2026-07-17 public probes:

- **Landing countdown** still active on prod (target date around **2026-10-14** in live; repo `LAUNCH_DATE` may differ).
- **Allowlisted without full unlock:** `/login`, some admin/creator entry shells (then auth), `/discover`, `/itineraries`.
- **Often blocked by countdown until team unlock:** `/demo`, `/register`, many tourist surfaces, public `/creator/[username]`.
- Client “Try Demo Account” (`demo@vamosavenezuela.com`) is **Zustand only** — no Supabase cookies; does **not** unlock admin/creator.

## 8. Gaps recorded this run

- No cookie-synced browser session for full creator/admin click-through.  
- `api.caneycloud.com` still dead alias (does not block CRM if `CANEY_PMS_API_URL` is Cloud Run).  
- Hold→confirm E2E still needs inventory ARI + shared webhook secret alignment (see F1/F2/F3 notes + Ucaima checklist).  
- No committed Playwright `storageState` for authenticated admin/creator projects.
