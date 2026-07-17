---
brain_node: crm
type: howto
system: crm
title: CaneyCloud API health
summary: Real Cloud Run health endpoint vs broken api.caneycloud.com alias; CRM CANEY_PMS_API_URL guidance.
---

# CaneyCloud API health

**Date:** 2026-07-17 · **Status:** Live Cloud Run healthy; `api.caneycloud.com` is a dead Vercel alias.

## Findings

| URL | Probe | Result |
|-----|-------|--------|
| `https://tour-pms-backend-ch43bweaoq-rj.a.run.app/health` | GET | **200** `{"status":"ok","service":"tour-pms-api"}` |
| `…/health/ready` | GET | **200** (db ok; redis may show disabled) |
| `…/api/v1/ping`, `…/api/docs`, `…/api/openapi.json` | GET | **200** |
| `…/api/v1/health` | GET | 404 Not Found (wrong path) |
| `www.caneycloud.com/api/backend/v1/ping` | GET | **200** (frontend proxy) |
| `https://api.caneycloud.com/health` | GET | **404** `DEPLOYMENT_NOT_FOUND` (Vercel iad1) |
| `https://canary---tour-pms-backend-ch43bweaoq-rj.a.run.app/health` | GET | 404 |
| `https://www.caneycloud.com` | GET | 200 (frontend) |

**Root cause of “API down” confusion:** operators / docs sometimes use `api.caneycloud.com`, which is **not** wired to Cloud Run. The PMS API is the **Cloud Run** service `tour-pms-backend-ch43bweaoq-rj` (region suffix `-rj` = southamerica-east1).

**Health path:** FastAPI exposes **`/health`**, not `/api/v1/health`.

## CRM configuration

```bash
# Correct
CANEY_PMS_API_URL=https://tour-pms-backend-ch43bweaoq-rj.a.run.app

# Wrong
CANEY_PMS_API_URL=https://api.caneycloud.com
```

Used by:

- `/platforms` health badge (`lib/platforms/status.server.ts` → tries `/health`, then fallbacks)
- Posada onboarding intake proxy (`CANEY_PMS_API_URL` + `/api/v1/onboarding/...`)

As of 2026-07-17, local CRM `.env.local` already targets the working Cloud Run host.

## Operator actions (if health goes red)

1. `curl -sS "$CANEY_PMS_API_URL/health"` — expect 200 + `tour-pms-api`.
2. If timeout: Cloud Run scale-from-zero (CRM allows 8s); re-probe.
3. If 5xx: check Cloud Run logs / Cloud SQL / deploy pipeline in `--TOURISM--`.
4. Do **not** “fix” by pointing at `api.caneycloud.com` until a custom domain is mapped in GCP/Vercel intentionally.
5. Optional hardening: map `api.caneycloud.com` → Cloud Run (DNS + load balancer) — **operator infra**, not CRM code.

## Related

- Concierge (separate): `https://tour-pms-concierge-ch43bweaoq-rj.a.run.app`
- Channel sync runbook: `--TOURISM--/APP/infra/runbooks/11-channel-sync-down.md`
