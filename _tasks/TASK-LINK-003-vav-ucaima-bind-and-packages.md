# TASK-LINK-003 — VAV: schema fix + rate plan replay + day rules

**Status:** done (quote→hold smoke green 2026-07-14)  
**Repo:** `VZ_Tourism_Project` + CaneyCloud ops (no TOURISM TikTok code commits)

## Done
1. ✅ Applied `093_pms_packages_pricing.sql` on VAV prod (linked supabase)
2. ✅ Re-fired CC initial sync → 4× `rate_plan.created` **processed**
3. ✅ 4× Tarifa base rate plans on VAV with `arrival_included=false`
4. ✅ Provider `caneyclouds` + listing `pms-1cdd4cac-campamento-ucaima` **published**
5. ✅ Stay pattern columns + Ucaima backfill `[3,6]` / `[3,6]`
6. ✅ Code **deployed via PR #60**: stay pattern enforce + flat `ari.delta` normalize
7. ✅ Migration file `101_pms_stay_pattern.sql` recorded in repo
8. ✅ **CC inventory open (Ucaima only):** 21 rooms × 90 nights = **1890** `available` cells
9. ✅ **ARI push:** 360 `ari.delta` (4 RT × 90d) → outbox **published** → VAV webhook **360 processed**
10. ✅ **VAV `pms_availability`:** **360** cells with units + rates + CTA (Thu/Sun open)

### Rates mirrored (per-person compartida / fallback)
| Room type | rate_cents | units (sample) |
|---|---|---|
| Estándar | 14000 | 4 |
| Superior | 15000 | 5 |
| Royal | 17000 | 6 |
| Salto Ángel | 20000 | 6 |

### Ops notes (concurrency-safe)
- Did **not** edit `--TOURISM--` TikTok WIP or map docs from other sessions
- Hung `write_cell` job killed; bulk SQL open used instead
- Pending envelopes reshaped to prod `cells[]` + `pms_room_type_id` shape before drain
- Only pending outbox drained was this channel’s 360 ari.delta

## Shipped after inventory (same day)
11. ✅ **PR #60** merged: stay-pattern enforce + flat `ari.delta` + pilot quote/hold allowlist under countdown
12. ✅ **Mig 101** applied on VAV prod; Ucaima `allowed_arrival/departure_days = [3,6]`
13. ✅ **Pre-launch 307 fixed for pilot APIs only** (`/api/quotes`, `/api/holds/*`, listing availability) — storefront UI still gated to Oct 14 2026
14. ✅ **Vercel PMS auth:** `PMS_SERVICE_TOKEN` + `PMS_API_URL` + `PMS_PARTNER_ID` + fleet `PMS_WEBHOOK_SECRET` set for Ucaima channel
15. ✅ **CC hotfix:** created missing `rate_limit_log` table (blocked holds with 500)
16. ✅ **Smoke quote→hold:**
    - Quote Thu→Sun Estándar: `$575.40` (3×$140 + taxes/fees)
    - Wed arrival → `ARRIVAL_DAY_NOT_ALLOWED`
    - Fri departure → `DEPARTURE_DAY_NOT_ALLOWED`
    - Hold `be97b4a9-…` / PMS res `053d2552-…` **HTTP 200**, then **released**

## Remaining
- Packages stay WA-only (product decision) — no channel package mapping
- Note: `pms_room_types.listing_id` stores **slug** (`pms-1cdd4cac-campamento-ucaima`), not UUID

## Listing
| Field | Value |
|---|---|
| slug | `pms-1cdd4cac-campamento-ucaima` |
| id | `f43eafc5-9ef3-4fb5-b2d4-bbbfb91c8a20` |
| published | true |
| room types | 4 linked |
