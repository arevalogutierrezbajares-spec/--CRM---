# VAV ↔ CaneyCloud ↔ AGB-CRM — Integration Sync Status

**Status as of 2026-06-15.** Single source of truth for how the three systems integrate,
what is genuinely in sync, and where they have drifted. Compiled from a read-only
audit of all three repos. Update this doc when any integration point changes state.

> **Headline:** The integration is **contract-aligned by design** and largely **built on
> both sides**, but it is **dark-launched and not live**, and the CaneyCloud side has a
> real **code ↔ DB ↔ branch divergence** (plus an RLS security gap) that blocks go-live.
> Because both sides are flag-gated **off**, none of the drift is currently user-visible.

## The three systems

| System | Repo | Role | Identity store |
|---|---|---|---|
| **CaneyCloud / TOUR PMS** | `--TOURISM--` (FastAPI + Next.js) | **Source of truth** — tenants, properties, rooms, rates, experiences, bookings | Postgres `User`/`Tenant`/`Membership` (Supabase `wwssfrsmuytbxvcvssav`) |
| **VAV (Vamos A Venezuela)** | `VZ_Tourism_Project` (Next.js + Supabase + Inngest) | Marketplace; **read-model mirror** of CaneyCloud + **booking originator** + invite/CRM tables | Supabase Auth + `providers` |
| **AGB-CRM** | `--CRM---` (Next.js + Drizzle) | Internal sales CRM; **platform monitor**; posada onboarding capture | own Supabase |

CaneyCloud is the hub. VAV mirrors CaneyCloud (one-way, read-only) and originates bookings
back into it. AGB-CRM observes both and feeds new posadas into CaneyCloud.

## Shared identity contract (the linchpin)

These cross-reference keys are what keep the systems addressable across the boundary. They
exist on both sides today — the *flow* that populates them is what's partly unwired.

| Concept | CaneyCloud key | VAV key |
|---|---|---|
| Tenant / provider | `Tenant.id` | `providers.pms_tenant_id` (TEXT), `providers.source='caneyclouds'` |
| Property | `Property.id` | `pms_properties.pms_property_id` (TEXT), `providers.pms_property_id` |
| Room type | room-type id | `pms_room_types.pms_room_type_id` |
| Rate plan | rate-plan id | `pms_rate_plans.pms_rate_plan_id` |
| Experience | `experiences.experience_id` | `pms_experiences.experience_id` |
| Reservation | reservation id | `guest_bookings.pms_reservation_id`, `pms_holds.pms_reservation_id` |
| Provider tier | `tenants.tier` (T1/T2/T3) | `providers.provider_tier` |

## Transport contracts

- **Webhooks (CaneyCloud ↔ VAV):** HMAC-SHA256, header `X-CaneyCloud-Signature: t=<unix>,v1=<hmac>`,
  `X-CaneyCloud-Event-Id` for idempotency, 300s freshness window. **Finalized + on `main` on
  both sides.** CaneyCloud delivers via a transactional outbox.
- **PMS adapter (VAV → CaneyCloud):** signed HTTP API for booking hold/confirm/cancel/modify,
  idempotent on `booking_id`; durable retries (VAV Inngest).
- **Reconcile (CaneyCloud ↔ VAV):** CaneyCloud exposes a digest-snapshot endpoint
  (`/api/partner/reconcile`, PP-004); VAV polls and repairs field-level drift by re-pulling.
- **AGB-CRM ↔ VAV:** **raw Supabase service-role SQL** (no API, no schema version).
- **AGB-CRM → CaneyCloud:** the posada onboarding intake API + health pings.

### Events
- **CaneyCloud → VAV:** `property.created`, `property.vav_enabled`, `room_type.updated`,
  `availability.updated`, `rate.updated`, `restriction.updated`, `experience.published`,
  `provider.profile.updated`, `reservation.{created,modified,confirmed,cancelled,no_show}`, `ari.delta`.
- **VAV → CaneyCloud:** `holds.created`, `booking.confirm`, `booking.cancel`, `booking.modify`.

## Dark-launch flags (why nothing is live yet)
- **`VAV_GLOBAL_ENABLED`** (CaneyCloud, default **false**) — gates ALL CaneyCloud→VAV publishing
  and provider/experience mirroring. While false: no events emitted, mirror tables stay empty.
- **`FF_ONBOARDING`** (CaneyCloud, default **off**) — gates the onboarding intake API the
  AGB-CRM wizard targets.

## Sync status matrix

| Integration point | CaneyCloud side | VAV side | In sync? |
|---|---|---|---|
| Webhook signing (HMAC) | ✅ on main | ✅ on main | ✅ aligned |
| VAV channel auto-provision + platform API config | ✅ on main (gated off) | n/a | ✅ |
| Property / room-type / availability mirror | ✅ built (gated off) | ✅ built (gated off) | ✅ built, not live |
| Booking hold → confirm → cancel → modify | ✅ adapter | ✅ Inngest durable flows | ✅ built |
| Reservation echo events | ✅ | ✅ | ✅ built |
| **`experience.published` fan-out** | ❌ PP-010 **not on main** | ⚠️ table ready (mig 088), **handler not hooked** | ❌ **unwired both sides** |
| **`provider.profile.updated` mirror** | ❌ PP-003 not shipped | ❌ mig 086 author-only, not shipped | ❌ **not shipped** |
| Provider tiers (T1/T2/T3) | ❌ PP-001 not on main | ⚠️ column exists, no gating logic | ❌ partial |
| Storefront request / notify | ❌ PP-020/021 not on main | ❌ 0% built | ❌ |
| Drift reconcile (PP-004) | ❌ not on main | ⚠️ polls if enabled | ❌ |
| AGB-CRM ↔ VAV (invites/CRM) | n/a | ✅ tables exist | ⚠️ CRM reads counts live; write-back planned/minimal |
| AGB-CRM → CaneyCloud onboarding | ⚠️ intake API **unmerged + dark** | n/a | ⚠️ CRM half live, CaneyCloud target not |

## Drift register (prioritized)

### 🔴 P0 — CaneyCloud code ↔ DB ↔ branch divergence + RLS gap  *(owner: CaneyCloud / operator-gated)*
- Live shared Supabase is at migration **rev 111** (the Provider-Platform chain was applied to
  the DB), but `origin/main` code is at **rev 113**, and the PP-* features live on the
  `provider-platform-integration` branch, **not on `main`**.
- Tangled in the same ORCH-135 migration-ID collision: **RLS-108 was never applied**, leaving
  `tenant_pms_credentials` (other tenants' PMS tokens) **unprotected**.
- **Remediation:** execute the ORCH-135 reconciliation in
  `--TOURISM--/docs/INCIDENT-2026-06-14-migration-108-collision.md`, land RLS-113 on the live DB,
  then renumber + merge the PP chain. **Migrations/RLS — do not do solo; operator-driven.**

### 🟠 P1 — VAV mirror wiring gaps  *(owner: CaneyCloud + VAV, coordinated)*
- `experience.published`: CaneyCloud fan-out (PP-010) unmerged; VAV ingest handler not wired to
  its webhook router (mig 088 table exists). Neither side can move experiences yet.
- `provider.profile.updated` mirror shipped on neither side.
- **Remediation:** after P0, merge PP-003/010 on CaneyCloud, hook the VAV handler, and confirm
  VAV's counterpart PR is production-ready and contract-matched.

### 🟡 P2 — AGB-CRM ↔ VAV raw cross-Supabase SQL  *(owner: AGB-CRM)*
- AGB-CRM reaches into VAV's Supabase with a service-role key, no API contract, no schema version.
  Today it's mostly read-only invite-count monitoring (`lib/platforms/status.server.ts`), so the
  blast radius is small — but the planned CRM write-back (`crm_activities`/`crm_tasks`/`providers.crm_*`)
  would deepen the coupling.
- **Remediation:** add a typed contract + schema-presence guard around the VAV access so a column
  rename fails loud, not silent, **before** expanding the write integration.

## Where the posada onboarding wizard fits
Front of the funnel: **AGB-CRM wizard (live on `main`)** → **CaneyCloud onboarding intake
(UNMERGED, dark behind `FF_ONBOARDING`)** → CaneyCloud tenant/property → *(when `VAV_GLOBAL_ENABLED`)*
CaneyCloud webhooks mirror it into VAV. The CRM half is shipped; its CaneyCloud target is not, so
the wizard degrades gracefully ("Onboarding no está habilitado…") until the pipeline lands.

## Sequenced remediation (operator-gated)
1. **Security first:** ORCH-135 reconciliation → RLS-113 to the live DB (closes `tenant_pms_credentials`).
2. **Unblock features:** renumber the PP chain onto main's head, make idempotent, merge to CaneyCloud `main`.
3. **Wire experiences:** ship PP-003/010 + hook VAV's `experience.published` handler; reconcile contracts with the VAV PR.
4. **Land onboarding:** merge the CaneyCloud onboarding pipeline + flip `FF_ONBOARDING` (activates the wizard's target).
5. **Pilot go-live:** flip `VAV_GLOBAL_ENABLED` for one tenant; verify the reconcile loop before fleet-wide.
6. **Harden the CRM seam:** typed contract around AGB-CRM↔VAV before expanding CRM writes.

## Key reference files
- **AGB-CRM:** `lib/platforms/status.server.ts` (VAV + Caney health), `lib/platforms/config.ts`,
  `app/(app)/posada-onboarding/*`, `lib/onboarding/intake-contract.ts`, `docs/posada-onboarding.md`.
- **CaneyCloud (`--TOURISM--`):** `APP/backend/channel/vav_auto_provision.py`, `webhook_signing.py`,
  `integrations/vav_platform.py`, `channel/vav_reconcile.py` (PP-004, off main), `channel/outbound/fan_out.py`,
  `experiences/service.py`, `docs/INCIDENT-2026-06-14-migration-108-collision.md`, `docs/ONBOARDING-PIPELINE-FRS.md`.
- **VAV (`VZ_Tourism_Project`):** `lib/pms/caneyclouds/webhook.ts`, `lib/inngest/functions/process-pms-webhook.ts`,
  `lib/pms/listings-mirror.ts`, `lib/inngest/functions/confirm-to-pms.ts`, `supabase/migrations/086_*`, `088_*`,
  `docs/VAV-CaneyCloud-Provider-Architecture.md`.
