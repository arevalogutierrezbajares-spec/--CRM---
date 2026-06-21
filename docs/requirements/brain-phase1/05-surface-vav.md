Excellent! Now I have enough information. Let me compile the comprehensive surface map:

---

## SURFACE MAP: VAV (VZ Tourism Marketplace) System

**Repository**: `/Users/tomas/VZ_Tourism_Project`  
**Stack**: Next.js 16, Supabase PostgreSQL, Vercel, Inngest  
**Git Remotes**: `https://github.com/arevalogutierrezbajares-spec/VZ_Tourism_Project.git`

---

### (a) TOP-LEVEL DOMAINS / L1 NODES

| Domain | Module Prefix | Description | Primary Function |
|--------|---------------|-------------|-----------------|
| **Marketplace Core** | `/app/api/listings`, `/app/api/packages`, `/app/(tourist)` | Discovery, search, listing catalog, itineraries | Content/Catalog |
| **Booking Pipeline** | `/app/api/bookings`, `/app/api/quotes`, `/app/api/holds` | Quote freezing (5 min), hold creation/release, booking lifecycle | Booking/Commerce |
| **PMS Integration** | `/app/api/pms/*`, `/lib/pms/*` | CaneyCloud mirror sync, ARI webhooks, availability, room mapping | Booking/Commerce |
| **Identity & Access** | `/app/(auth)`, `/lib/auth/*`, `/app/(provider)`, `/app/(admin)` | Auth flows, provider/agent/creator/admin roles, Supabase row-level security | Identity/Access |
| **Payments & Money** | `/app/api/stripe/*`, `/app/api/payouts`, `/lib/stripe/*` | Stripe checkout, payment webhooks, escrow, payout cycles, commission tracking | Payments/Money |
| **Messaging & CRM** | `/app/api/whatsapp/*`, `/lib/whatsapp/*`, `/lib/crm/*` | WhatsApp messaging, escalations, agent messaging, CRM activities | Messaging/Comms |
| **Operator Features** | `/app/api/cron/*`, `/app/(admin)/pms`, `/app/(admin)/analytics` | PMS health checks, parity audits, drift reconciliation, admin dashboards | Ops/Intelligence |
| **Growth & Affiliates** | `/app/api/discount-codes`, `/app/api/affiliate*`, `/lib/affiliates` | Referral links, affiliate commissions, discount codes, creator programs | Booking/Commerce |
| **Ruta Rides** | `/app/(ruta)`, `/app/api/ruta/*` | Ride-sharing, driver/vehicle management, ride tracking & pricing | Booking/Commerce |
| **Specialized Content** | `/app/api/experience-products`, `/app/api/discover`, `/lib/birding`, `/lib/food/*` | Experiences (activities), POI, food trails, guides | Content/Catalog |

**Total: 10 coherent domains** mapping to ~5-7 business functions

---

### (b) MACHINE-READABLE CONTRACTS

#### **OpenAPI Specification**
- **Path**: `/Users/tomas/VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml`
- **Endpoints**: 9 documented
- **Tags/Domains in OpenAPI**:
  - `POST /api/pms/webhook/caneyclouds` — HMAC-SHA256 signed webhook receiver
  - `GET /api/listings/{slug}/availability` — VAV mirror (fast, local)
  - `GET /api/listings/{slug}/pms-availability` — Live PMS passthrough (200-800 ms)
  - `POST /api/quotes` — Price freeze (5 min TTL)
  - `POST /api/holds` — Hold creation (PMS + VAV state)
  - `GET /api/holds/{id}` — Hold state read (countdown sync)
  - `DELETE /api/holds/{id}` — Release hold
  - `POST /api/holds/{id}/extend` — TTL extension to 30 min (Stripe checkout trigger)
  - `GET /api/pms/health` — Admin-only metrics (lag, error rate, hold success rate)
  - `POST /api/admin/pms/webhook/replay/{eventId}` — Idempotent event replay

**Total public surface: 10 endpoints across Booking/PMS domains**

#### **Database Migrations**
- **Path**: `/Users/tomas/VZ_Tourism_Project/supabase/migrations/`
- **Total migrations**: 94 (001–094, with rollbacks)
- **Key PMS/Booking Tables** (141 tables total):

| Table | Purpose | Domain |
|-------|---------|--------|
| `pms_properties` | CaneyClouds properties mirror | PMS Integration |
| `pms_room_types` | Sellable units per property | PMS Integration |
| `pms_rate_plans` | Rate plans + cancellation policy | PMS Integration |
| `pms_availability` | Per-date inventory/pricing (ARI cells) | PMS Integration |
| `pms_holds` | VAV-side hold lifecycle (active→released→converted) | Booking Pipeline |
| `pms_webhook_events` | Inbound event store for idempotency + replay | PMS Integration |
| `pms_sync_cursor` | Per-resource watermark for nightly snapshots | PMS Integration |
| `pms_drift_log` | Reconciliation discrepancies | Ops/Intelligence |
| `pms_reconcile_state` | Hold success/fail/echo state tracking | Ops/Intelligence |
| `pms_external_id_map` | Listing ↔ PMS room_type mapping | PMS Integration |
| `pms_addon_links`, `pms_addons` | Package line items (rides, extras) | PMS Integration |
| `quotes` | Price freezes (listing, room, dates, total_usd_cents, 5 min expiry) | Booking Pipeline |
| `guest_bookings` | Guest-facing bookings (PMS reservation link + status) | Booking Pipeline |
| `pms_experiences` | CaneyCloud activities mirror | Booking Pipeline |
| `stripe_webhook_events` | Stripe payment webhooks | Payments/Money |
| `pms_rate_cells` | Per-date rate matrix | PMS Integration |

**Migration files** referencing PMS/Booking:
- `053_pms_ari_and_holds.sql` (foundation: properties, room_types, rate_plans, availability, holds, webhook store)
- `054_guest_bookings_pms.sql` (links bookings → PMS reservations)
- `056_quotes.sql` (price freezing: listing_id, room_type, check_in/out, total_usd_cents, 5 min expiry)
- `057_pms_echo_tables.sql` (echo state tracking)
- `058_pms_drift_log.sql` (parity audit trail)
- `087_pms_reconcile_state.sql` (hold success rate tracking)

**Database size**: 141 tables across users, providers, listings, bookings, PMS mirror, payments, CRM, WhatsApp, Ruta

---

### (c) CROSS-SYSTEM INTEGRATION POINTS / EDGES

| Edge | Source → Target | Type | Mechanism |
|------|-----------------|------|-----------|
| **CaneyCloud PMS** | VAV ← PMS | Webhook + polling | `POST /api/pms/webhook/caneyclouds` (HMAC-SHA256); nightly ARI snapshot via `/api/cron/pms-reconcile` |
| **Stripe Payments** | VAV ↔ Stripe | Webhook + API | `POST /api/stripe/webhooks` (signed); `POST /api/stripe/checkout` creates session; holds extended on checkout open |
| **Inngest Async Queues** | VAV → Inngest | HTTP + Event Flow | `/api/inngest/route` entry; functions: `process-pms-webhook`, `modify-to-pms`, `compensate-booking`, `process-ari-snapshot`, `handle-message` |
| **Supabase Auth** | VAV ↔ Supabase | OAuth + JWT | Supabase clients (`@supabase/supabase-js`, `@supabase/ssr`); RLS policies on all tables |
| **WhatsApp Business** | VAV → WhatsApp | API + Webhook | `POST /api/whatsapp/webhook`; library `/whatsapp-concierge/pipeline/webhook-handler.ts` |
| **Mapbox (Maps)** | VAV ↔ Mapbox | Server token + API | Server-side token in `/api` routes for tiling, geocoding; client token for UI |
| **S3/Upload Service** | VAV → Storage | Multipart upload | `POST /api/upload` (listing photos, proof docs) |
| **Vercel Deployment** | Git push → Vercel | CI/CD | Project ID: `prj_U1DRAKgaCQpyH4ZVgu0BzEq26Uh0` org: `team_ElfL1ocqUEHpfaIv17vNEp4a`; cron jobs in `vercel.json` |

**Key Shared Resources**:
- **Supabase PostgreSQL**: Single database; all auth, listings, bookings, PMS mirror, payments share schema
- **Inngest Event Bus**: Async workflow orchestration for PMS webhooks, booking state transitions, payment events

---

### (d) DEPLOY / LIVENESS SIGNALS

| Signal | Source | Type | Interval |
|--------|--------|------|----------|
| **Git Branch** | `git branch -a` | Version control | On demand |
| **Main Deployment Branch** | `feat/PP-003-readmodel-sync-vav` (active feature) | Feature branch | Tracked |
| **Vercel Deployments** | Production: `https://www.vamosavenezuela.com`; Staging: `https://staging.vamosavenezuela.com` | Live endpoints | Auto on push |
| **Cron Jobs** (Vercel) | See `vercel.json` crons | Health checks | Scheduled |
| **Cron Liveness Checks** | `/api/cron/pms-watchdog` | PMS health | Every 5 minutes |
| **Parity Audit** | `/api/cron/parity-audit` | VAV ↔ PMS correctness | Weekly (Mondays 9 AM) |
| **Stale Hold Release** | `/api/cron/release-stale-holds` | Inventory cleanup | Every minute |
| **PMS Reconcile** | `/api/cron/pms-reconcile` | Drift correction | Hourly |
| **Database Migrations** | `/supabase/migrations/` | Schema versioning | Applied per environment |

**Current Version**: `0.9.1.0` (from `package.json`)  
**Last Verified Commit**: `f8529baf6` (PMS guest shape + CaneyCloud v1 ride packages)

---

### (e) DOMAIN SUMMARIES + FUNCTION MAPPING

| Domain | One-Line Description | Primary Function |
|--------|----------------------|-----------------|
| **Marketplace Core** | Search, discover, view listings and create itineraries with real-time availability | Content/Catalog |
| **Booking Pipeline** | Freeze prices (quotes), create/extend/release holds, transition bookings through state machine | Booking/Commerce |
| **PMS Integration (CaneyCloud)** | Mirror CaneyClouds inventory (ARI cells, room types, rate plans), sync via HMAC webhooks + nightly snapshots, reconcile drift | Booking/Commerce |
| **Identity & Access** | Authenticate users, differentiate roles (guest, provider, agent, creator, admin), enforce row-level security per tenant | Identity/Access |
| **Payments & Money** | Collect payment via Stripe, manage escrow, settle payouts to providers/affiliates, track commissions | Payments/Money |
| **Messaging & CRM** | Route WhatsApp conversations to agents, log activities, escalate issues, track touch history | Messaging/Comms |
| **Operator Features** | Monitor PMS lag, audit parity, replay failed webhooks, reconcile state, surface drift alerts | Ops/Intelligence |
| **Growth & Affiliates** | Generate and track affiliate links, apply discount codes, manage creator tier programs | Booking/Commerce |
| **Ruta Rides** | Book rides, assign drivers/vehicles, track in real-time, price dynamically by zone/class | Booking/Commerce |
| **Specialized Content** | Curate experiences (activities), points of interest, food trails, birding guides, educational content | Content/Catalog |

---

### SUMMARY: Data Flow & Integration Topology

```
CaneyCloud (PMS)
    ↓ (HMAC webhook + nightly snapshot)
    ├→ pms_availability, pms_properties, pms_room_types, pms_rate_plans
    └→ Inngest: process-pms-webhook → pms_holds, quotes reconcile

Guest on UI
    ↓ (Browse listings)
    ├→ GET /api/listings/{slug}/availability (fast, local mirror)
    └→ POST /api/quotes (freeze price 5 min)

Guest Checking Out
    ↓ (Create hold)
    ├→ POST /api/holds (VAV + PMS reservation)
    └→ Hold TTL: 5 min default; extended to 30 min on Stripe checkout open

Stripe Payment
    ↓ (Webhook)
    ├→ POST /api/stripe/webhooks (signed)
    └→ Inngest: compensate-booking or modify-to-pms

Admin Monitoring
    ↓ (Health check)
    ├→ GET /api/pms/health (lag, error rate, hold success %)
    └→ Cron: parity-audit weekly, pms-reconcile hourly, pms-watchdog every 5 min

Deployment
    ↓ (Git push)
    ├→ Vercel CI/CD (prj_U1DRAKgaCQpyH4ZVgu0BzEq26Uh0)
    └→ Production/Staging URLs + scheduled cron functions
```

---

**File Paths (Absolute, Real)**:
- OpenAPI: `/Users/tomas/VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml` ✓
- Migrations: `/Users/tomas/VZ_Tourism_Project/supabase/migrations/` (94 files) ✓
- API Routes: `/Users/tomas/VZ_Tourism_Project/app/api/{pms,bookings,quotes,holds,stripe,whatsapp}/*` ✓
- PMS Logic: `/Users/tomas/VZ_Tourism_Project/lib/pms/*` ✓
- Inngest: `/Users/tomas/VZ_Tourism_Project/lib/inngest/functions/*` ✓
- Vercel Config: `/Users/tomas/VZ_Tourism_Project/vercel.json` ✓