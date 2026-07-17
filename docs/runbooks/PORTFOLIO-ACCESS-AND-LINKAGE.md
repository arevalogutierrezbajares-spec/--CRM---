---
brain_node: crm
type: howto
system: crm
title: Portfolio access & CaneyCloud↔VAV linkage runbook
summary: Signup matrix, demo accounts, pilot IDs, env checklist, and probe commands for CRM · CaneyCloud · VAV.
---

# Portfolio access & linkage runbook

**Audience:** Tomas + agents · **Updated:** 2026-07-17  
**Related:** `docs/VAV-CaneyCloud-CRM-sync-status.md`, `docs/checklists/INTEGRATION-CLOSE-LOOP-CRM-CC-VAV.md`, `docs/runbooks/CANEYCLOUD-API-HEALTH.md`, `docs/runbooks/AUTHENTICATED-WALKTHROUGH-EVIDENCE.md`

---

## 1. Canonical repos (local)

| System | Path | Remote | Brain root |
|--------|------|--------|------------|
| **AGB-CRM** | `/Users/tomas/AGB-CRM` | `--CRM---` | `REPO_ROOTS.crm` |
| **CaneyCloud / TOUR** | `/Users/tomas/--TOURISM--` | `--TOURISM--` | `REPO_ROOTS.caney` (default) |
| **VAV** | `/Users/tomas/VZ_Tourism_Project` | `VZ_Tourism_Project` | `REPO_ROOTS.vav` |
| **Restaurants** | `/Users/tomas/caneycloud-restaurant` | `caneycloud-restaurant` | `REPO_ROOTS.restaurants` |
| **Academy curriculum** | `/Users/tomas/vz-avitourism-curriculum` | — | `REPO_ROOTS.academyCurriculum` |

Override Brain roots with `BRAIN_ROOT_CANEY`, `BRAIN_ROOT_VAV`, etc.  
Worktrees (`tourism-wt-*`, `tour-pms-*`) are disposable; remotes above are SoT.

**Megaoverlord map:** `~/.megaoverlord/projects.yaml`

---

## 2. Production URLs

| Surface | URL | Expected |
|---------|-----|----------|
| VAV consumer | https://vamosavenezuela.com | 200 |
| VAV login | https://vamosavenezuela.com/login | 200 |
| VAV creator entry | https://vamosavenezuela.com/creator | 307 → auth |
| VAV internal ping | https://vamosavenezuela.com/api/internal/ping | 401 without key |
| CaneyCloud web | https://www.caneycloud.com | 200 |
| CaneyCloud API (wrong alias) | https://api.caneycloud.com | **404** Vercel not found |
| CaneyCloud API (**real**) | `https://tour-pms-backend-ch43bweaoq-rj.a.run.app` | `/health` → 200 |

CRM Platforms hub: `/platforms` (authenticated).

---

## 3. Signup matrix

### VAV (`vamosavenezuela.com`)

| Persona | Entry | Notes |
|---------|-------|-------|
| Tourist | `/register`, `/login` | Supabase Auth |
| Provider self-serve | `/provider-register` | Legacy; product target = funnel → CaneyCloud |
| Provider invite | `/provider/invite/...` | IG / seeded claim |
| Creator | `/creator/invite` → `/creator/(portal)/*` | Invite-gated |
| Agent | `/become-an-agent` | Travel agent marketplace |
| Demo | `/demo` + `NEXT_PUBLIC_DEMO_MODE` | Mock PMS; weak real-API auth |
| Storefront | `/p/[slug]` | Bookable shell |

### CaneyCloud (`www.caneycloud.com`)

| Persona | Entry | Notes |
|---------|-------|-------|
| Operator | `/register` | Pending until staff approve |
| Login | `/login`, `/tenant-select` | JWT / Postgres |
| Onboarding | `/onboarding`, `/admin/onboarding` | PMS |
| Guest portal | `/portal/login`, `/portal/auto-login` | Guest |

### AGB-CRM

| Persona | Entry | Notes |
|---------|-------|-------|
| Team | CRM auth / `AGB_DEV_FAKE_USER` | Internal |
| Posada intake | `/posada-onboarding` | Needs PMS session + import token |

---

## 4. Demo accounts (code-seeded)

| Email | Password | Source | Use |
|-------|----------|--------|-----|
| `luismendez@posadalaspalmeras.com` | `Choroni2018!` | VAV `scripts/seed-demo.ts`, `lib/pms/demo-data.ts` | Provider demo (Palmeras / Cayo Azul) |
| `demo@vzexplorer.com` | (client fixtures) | E2E / AuthModal placeholder | Often **client-only** — APIs may 401 |

```bash
cd /Users/tomas/VZ_Tourism_Project
# requires SUPABASE_SERVICE_ROLE_KEY
npx tsx scripts/seed-demo.ts
```

CaneyCloud QA: `TOUR_TEST_PASSWORD` / env-specific — not committed.

---

## 5. Pilot IDs (Campamento Ucaima)

| System | Key | Value |
|--------|-----|-------|
| CaneyCloud tenant | `tenants.id` | `35b05635-902e-4a47-a8c6-e614b605a037` |
| CaneyCloud property | `properties.id` | `fd0e8ceb-3534-4e50-88c5-4278b1351428` |
| CRM partner room | `partner_rooms.id` | `e353cbfd-3d16-4703-840b-c6d1e943b518` |
| VAV listing (bound) | marketplace | `pms-1cdd4cac-campamento-ucaima` |

Full close-loop: `docs/checklists/INTEGRATION-CLOSE-LOOP-CRM-CC-VAV.md`.

---

## 6. How CaneyCloud ↔ VAV link

```
CaneyCloud (SoT) --channel code=vav / HMAC webhooks--> VAV read-model
                 <--hold/confirm partner API----------
```

- **Identity:** separate (no shared signup).
- **Inventory/bookings:** channel + mirror; fleet flag historically `VAV_GLOBAL_ENABLED=false`.
- **CRM:** partner_rooms linkage columns + Platforms live view + posada wizard (intake still dark if FF off).

---

## 7. Env checklist (CRM)

```bash
# Platforms + health
PLATFORM_VAV_URL=https://vamosavenezuela.com   # optional override
PLATFORM_CANEY_URL=https://www.caneycloud.com  # optional
VAV_SUPABASE_URL=
VAV_SUPABASE_SERVICE_ROLE_KEY=
# Real Cloud Run backend — NOT api.caneycloud.com
CANEY_PMS_API_URL=https://tour-pms-backend-ch43bweaoq-rj.a.run.app
```

Brain (optional):

```bash
BRAIN_ROOT_CANEY=/Users/tomas/--TOURISM--
BRAIN_ROOT_VAV=/Users/tomas/VZ_Tourism_Project
```

---

## 8. Probe commands

```bash
# VAV
curl -sS -o /dev/null -w '%{http_code}\n' https://vamosavenezuela.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://vamosavenezuela.com/api/internal/ping

# CaneyCloud web
curl -sS -o /dev/null -w '%{http_code}\n' https://www.caneycloud.com/

# CaneyCloud API (correct)
curl -sS https://tour-pms-backend-ch43bweaoq-rj.a.run.app/health
# → {"status":"ok","service":"tour-pms-api"}

# CaneyCloud API (broken alias — expect 404)
curl -sS -o /dev/null -w '%{http_code}\n' https://api.caneycloud.com/health

# CRM local
cd /Users/tomas/AGB-CRM && AGB_DEV_FAKE_USER=1 pnpm dev
# open http://localhost:3000/platforms
```

---

## 9. Live connection view

1. CRM → **Platforms** (`/platforms`)  
   - Site + API health badges for VAV + CaneyCloud  
   - **Live connection (partner rooms)** chips (Caney / VAV mirror / channel / listing)  
2. CRM → partner room → **Platform linkage** form  
3. CaneyCloud → `/channels`  
4. VAV admin → providers / listings  

---

## 10. Agent tooling (Brain)

```
brain_search → brain_neighborhood → brain_doc_get → brain_rca_pack
```

Protocol: `AGENTS.md` Investigation mode · skills `docs/skills/investigate.md` · `docs/skills/remediate.md`.
