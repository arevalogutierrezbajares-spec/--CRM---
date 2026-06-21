Perfect! Now I have comprehensive information. Let me create the surface map.

## SURFACE MAP: CaneyCloud (Tour PMS)

**Repository:** `/Users/tomas/tour-pms-main`  
**Backend:** FastAPI (Python) at `APP/backend/`  
**Frontend:** Next.js at `APP/frontend/`  
**OpenAPI Contract:** `/Users/tomas/tour-pms-main/APP/backend/api/openapi.yaml` (v1.0.3)  
**Migrations:** Alembic at `/Users/tomas/tour-pms-main/APP/backend/alembic/versions/` (136 versions across 20260419–20260509)

---

### L1 DOMAINS (9 coherent modules → graph nodes)

#### 1. **Booking Core** (`bookings`, `holds`)
   - **Description:** Transactional core — place soft holds on inventory (15-min Redis locks), confirm bookings, cancel, move, fetch.
   - **Primary Function:** Booking/Commerce
   - **OpenAPI Endpoints:** 7 on `/bookings/*` + 3 internal equivalents  
     - `POST /bookings/hold` (createHold, idempotent)  
     - `POST /bookings/confirm` (confirmBooking, from-hold or direct)  
     - `POST /bookings/{id}/cancel` (cancelBooking)  
     - `POST /bookings/{id}/move` (moveBooking, distributed lock)  
     - `GET /bookings/{id}` (getBooking)  
     - `GET /bookings` (listBookings, cursor-paginated)  
   - **DB Tables:** `bookings`, `booking_lines`, `holds`, `availability` (~4 key tables)  
   - **Cross-System Edges:**  
     - **→ Pricing:** holds query quote prices  
     - **→ Availability:** atomic decrement on confirm  
     - **→ Event Bus:** emits `booking.confirmed`, `booking.cancelled`, `booking.moved`  
     - **→ Messaging:** agent receives booking confirmation signal  
     - **← WhatsApp/Instagram:** chat-driven bookings land here via messaging bridge

#### 2. **Availability & Inventory** (`availability`, `inventory`)
   - **Description:** Per-room, per-date availability cells with Redis caching (`t:{tenant}:avail:*`). Manual blocks (maintenance, owner-stay, off-market).
   - **Primary Function:** Booking/Commerce
   - **OpenAPI Endpoints:** 2 on `/availability` + 1 internal  
     - `GET /availability?from=YYYY-MM-DD&to=YYYY-MM-DD&property_id=...` (listAvailability, 90-day capped, cached)  
     - `POST /availability/block` (blockAvailability, operator-only, idempotent)  
     - `POST /internal/availability/check` (internalAvailabilityCheck, rich multi-room context)  
   - **DB Tables:** `availability`, `rooms`, `room_types`, `availability_metadata` (~4)  
   - **Cache Key Pattern:** `t:{tenant}:avail:{property}:{date_range}`  
   - **Cross-System Edges:**  
     - **← Booking:** queries at hold/confirm time  
     - **← Channel Manager:** SiteMinder adapter syncs here  
     - **← Pricing:** calculates occupancy-based rates

#### 3. **Pricing & Quotes** (`pricing`, `quotes`)
   - **Description:** Compute prices for a stay (never stored, always re-derived). Rate plans, pricing rules, seasonal adjustments, promo codes. Outputs are binding for 5 minutes.
   - **Primary Function:** Booking/Commerce
   - **OpenAPI Endpoints:** 2 on `/quotes` + 1 internal  
     - `POST /quotes` (computeQuote, pure read, returns quote_id + expiry)  
     - `POST /internal/quotes/compute` (internal mirror for messaging service)  
   - **DB Tables:** `pricing_rules`, `rate_plans`, `seasons`, `season_ranges`, `occupancy_rates`, `exchange_rates`, `discount_rules` (~12 tables)  
   - **Key Models:** `Money` (amount + currency), `QuoteLine` (per-day breakdown with adjustments)  
   - **Cross-System Edges:**  
     - **← Booking:** quote_id locked at hold/confirm  
     - **← Agent/Messaging:** computes prices for chat negotiation  
     - **→ Accounting:** pricing rules feed posting templates

#### 4. **Properties & Rooms** (`properties`, `portal`)
   - **Description:** Property configuration, room setup, rate plans per property, features, metadata. Operator self-serve portal for management.
   - **Primary Function:** Ops/Intelligence
   - **OpenAPI Endpoints:** ~8 on `/admin` (properties, rooms, rate-plans, policies)  
     - `GET/POST /admin/properties`  
     - `GET/POST /admin/properties/{id}/rooms`  
     - `GET/POST /admin/policies` (cancellation, rate restriction rules)  
   - **DB Tables:** `properties`, `rooms`, `room_types`, `rate_plans`, `policy_rules`, `cancellation_rules` (~6)  
   - **Cross-System Edges:**  
     - **← Channel Manager:** property credentials, config synced from SiteMinder  
     - **→ VAV Platform:** property-creation callback webhook for inbound booking routing  
     - **→ Portal:** powers operator dashboard

#### 5. **Messaging & Communications** (`messaging`, `comms`, `notifications`)
   - **Description:** WhatsApp + Instagram conversation ingress (Supabase Edge Functions → HMAC-signed bridge), message persistence, comms templates, notification scheduler.
   - **Primary Function:** Messaging/Comms
   - **OpenAPI Endpoints:**  
     - `POST /api/internal/messaging/ingest` (HMAC-authed bridge from Supabase agent)  
     - `POST /comms/send-email`, `POST /comms/send-sms`  
     - `GET/POST /notifications`  
     - `GET/POST /notification-settings`  
   - **DB Tables:** `conversations`, `messages`, `notification_settings`, `comms_template` (~4)  
   - **Key Integration:** Supabase AI agent hosts WhatsApp/IG connectors; bridge endpoint at `/api/internal/messaging/ingest` (HMAC-SHA256 + idempotency).  
   - **Cross-System Edges:**  
     - **← VAV Platform:** Supabase agent uses VAV's SMS/email delivery for fallback  
     - **← WhatsApp API / Meta Business Account:** raw WA/IG messages → Supabase agent → PMS bridge  
     - **→ Booking Core:** triggers booking.confirmed signal on agent close  
     - **→ Local Payments:** payment link generation inside chat (Stripe / Pago Móvil)

#### 6. **Payments & Finance** (`finance`, `local_payments`, `refunds`, `invoices`, `folios`)
   - **Description:** Payment collection (Stripe card USD + local rails: Pago Móvil, Zelle, bank transfer VES), invoice generation (SENIAT-compliant), folio/charge tracking.
   - **Primary Function:** Payments/Money
   - **OpenAPI Endpoints:**  
     - `POST /internal/payment-links` (issue Stripe Checkout or local instructions)  
     - `GET/POST /admin/invoices` (SENIAT número de control format)  
     - `GET/POST /admin/folios` (charge batches)  
     - `POST /webhooks/stripe` (handled by webhook middleware)  
     - `POST /webhooks/bdv` (Banco Digital Venezolano Pago Móvil ACK)  
   - **DB Tables:** `payments`, `invoices`, `invoice_line_items`, `folios`, `folio_charges`, `invoice_control_sequence` (~6)  
   - **External APIs:** Stripe (production; session creation via `checkout_url`), Pago Móvil PSP (pending M10.5), Zelle (pending).  
   - **Cross-System Edges:**  
     - **← Booking:** payment_links issued after hold acquired  
     - **← Agent/Messaging:** payment close inside chat  
     - **← Webhook Middleware:** Stripe charge.completed → payment.recorded  
     - **→ Accounting:** payment events feed journal entries

#### 7. **Accounting & Reporting** (`accounting/`, `accounting` OpenAPI tag)
   - **Description:** Accountant workspace — chart of accounts, source event ingestion, posting templates, journal entry ledger, period close + reopen, export profiles (Konek compatibility).
   - **Primary Function:** Ops/Intelligence
   - **OpenAPI Endpoints:** 20+ (all return 501 — contracts declared, handlers ship in TASK-ACC-* queue)  
     - `GET /accounting/dashboard`  
     - `GET/POST /accounting/source-events`  
     - `GET /accounting/exceptions`, `POST /accounting/exceptions/{id}/waive`  
     - `GET/POST /accounting/chart`, `/accounting/mapping`, `/accounting/posting-templates`  
     - `GET /accounting/journal-entries`, `GET /accounting/periods`  
     - `POST /accounting/periods/{id}/close`, `/accounting/periods/{id}/reopen`  
     - `GET/POST /accounting/export-profiles`, `POST /accounting/exports`  
     - `GET/POST /accounting/accountant-access-tokens`  
   - **DB Tables:** `accounting_source_events`, `accounting_exceptions`, `accounting_chart`, `accounting_mapping`, `accounting_posting_templates`, `accounting_journal_entries`, `accounting_periods` (~7, part of 32-table `accounting/` module)  
   - **Cross-System Edges:**  
     - **← Finance:** payment events ingested as source events  
     - **← Booking:** booking lifecycle events (created, confirmed, cancelled) → postings  
     - **← POS (future):** POS item sales → inventory postings

#### 8. **Channels & Distribution** (`channels`, `channel_reservations`, `channel/outbound`)
   - **Description:** Channel manager adapter (SiteMinder v1), per-property OTA config management, atomic allocation (inventory sync + conflict resolution), channel inventory outbound sync.
   - **Primary Function:** Ops/Intelligence
   - **OpenAPI Endpoints:**  
     - `GET/POST /admin/channels` (OTA credentials, pause gates)  
     - `POST /api/v1/channel/...` (v1 channel-specific endpoints, tag: `channel-v1`)  
     - `POST /api/internal/channel-outbox/drain` (batch sync to SiteMinder)  
   - **DB Tables:** `channels`, `platform_ota_config`, `channel_room_type_mapping`, `channel_outbox` (~4)  
   - **Channel Manager:** SiteMinder (XMLv3 + Availability API for M2 pull-based sync).  
   - **Cross-System Edges:**  
     - **← Availability:** pulls current state for sync  
     - **← Booking:** moves + cancels trigger re-sync to SiteMinder  
     - **→ Availability:** inbound OTA updates from SiteMinder (M4)  
     - **↔ VAV Platform:** per-property webhook callback for inbound bookings from VAV channel

#### 9. **Authentication, Authorization & Access** (`auth`, `permissions`, `staff`)
   - **Description:** JWT-based multi-tenant auth (Tenant claim scope + JWT `tenants` array), RLS policies, staff roles (operator, accountant, manager, support), password reset, onboarding tokens, invited user workflows.
   - **Primary Function:** Identity/Access
   - **OpenAPI Endpoints:**  
     - `POST /auth/login` (email + password → JWT)  
     - `POST /auth/refresh` (refresh token rotation)  
     - `POST /auth/logout`  
     - `GET/POST /api/v1/permissions` (role-based, tenant-scoped)  
     - `GET/POST /admin/staff` (invite, activate, deactivate)  
   - **DB Tables:** `tenants`, `users`, `memberships`, `auth_refresh_sessions`, `password_reset_tokens`, `invitations`, `onboarding_sessions` (~7)  
   - **Key Contract:** JWT format (RS256), tenant_id extracted at gateway, `SET LOCAL app.current_tenant = ?` per-request for RLS.  
   - **Cross-System Edges:**  
     - **← All domains:** token validation on every request  
     - **→ GCP Secret Manager:** JWT keypair (public + private) rotation managed here

---

### MACHINE-READABLE CONTRACTS

#### A. OpenAPI Path & Endpoint Count

**File:** `/Users/tomas/tour-pms-main/APP/backend/api/openapi.yaml`  
**Versioning:** `/api/v1/` (external), `/api/internal/` (internal service-to-service)  
**Total Endpoints:** ~60+ documented (multiple routers included in main.py)

**By Tag (top-level domains)**
| Tag | Endpoint Count | Example Paths |
|---|---|---|
| `availability` | 2 external + 1 internal | `GET /availability`, `POST /availability/block`, `POST /internal/availability/check` |
| `quotes` | 2 | `POST /quotes`, `POST /internal/quotes/compute` |
| `bookings` | 6 external + 2 internal | `POST /bookings/hold`, `POST /bookings/confirm`, `GET /bookings`, `POST /bookings/{id}/cancel`, `POST /bookings/{id}/move` |
| `internal` | 3 | `/internal/availability/check`, `/internal/holds`, `/internal/bookings/confirm`, `/internal/payment-links` |
| `accounting` | 20 (all 501 stubs) | `/accounting/dashboard`, `/accounting/source-events`, `/accounting/periods`, etc. |
| `admin-*` | ~15 (properties, pricing, channels, folios, invoices, finance, guests) | `/admin/properties`, `/admin/pricing-grid`, `/admin/channels` |
| `auth` | 4 | `/auth/login`, `/auth/refresh`, `/auth/logout`, password reset |
| `comms` | 3 | `/comms/send-email`, `/comms/send-sms` |
| `notifications` | 3 | `GET/POST /notifications`, notification settings |
| `instagram`, `whatsapp`, `channel-v1` | ~10 combined | `/instagram/webhooks`, `/whatsapp/webhooks`, `/api/v1/channel/*` |
| **Other** (experiences, portal, folios, invoices, finance, discount-codes, subscriptions, partner, policies, pulso, staff_ai_agent, tracking) | ~20 | See `/admin/*` and public surfaces |

#### B. Alembic Migrations

**Directory:** `/Users/tomas/tour-pms-main/APP/backend/alembic/versions/`  
**Count:** 136 migrations (v001 → v027+, across 20260419–20260509)  
**Key Schema Tables (from models.py):**

| Category | Tables | Count |
|---|---|---|
| **Tenancy & Auth** | `tenants`, `users`, `memberships`, `auth_refresh_sessions`, `invitations`, `onboarding_sessions` | 6 |
| **Core Booking** | `bookings`, `booking_lines`, `holds`, `guests`, `guest_notes` | 5 |
| **Availability & Inventory** | `availability`, `rooms`, `room_types`, `availability_metadata` | 4 |
| **Pricing** | `pricing_rules`, `rate_plans`, `seasons`, `season_ranges`, `occupancy_rates`, `discount_rules`, `exchange_rates` | 7 |
| **Finance & Payments** | `payments`, `invoices`, `invoice_line_items`, `folios`, `folio_charges`, `invoice_control_sequence`, `invoice_audit_log`, `finance_expenses` | 8 |
| **Channels** | `channels`, `platform_ota_config`, `channel_room_type_mapping`, `channel_outbox` | 4 |
| **Communications** | `conversations`, `messages`, `notification_settings`, `comms_template` | 4 |
| **Accounting Module** | `event_outbox`, `accounting_source_events`, `accounting_exceptions`, `accounting_chart`, `accounting_mapping`, `accounting_posting_templates`, `accounting_journal_entries`, `accounting_periods` (+ 24 more in `/accounting/bindings/`) | 32 |
| **Configuration** | `properties`, `policy_rules`, `cancellation_rules`, `exchange_rate_sources`, `client_types` | 5 |
| **Audit** | `audit_events`, `event` (event log for messaging) | 2 |
| **Other** | `experiences`, `packages`, `package_bookings`, `review_decisions`, `subscriptions` | 5 |
| **TOTAL** | | ~82 tables |

---

### CROSS-SYSTEM INTEGRATION POINTS (INTERCHANGE EDGES)

#### External APIs & Webhooks

| System | Edge Type | Purpose | Direction | Contract |
|---|---|---|---|---|
| **VAV Platform** (`vamosavenezuela.com`) | API call + webhook callback | Property onboarding + inbound booking routing | **→ VAV** (create property), **← VAV** (POST booking callback to PMS channel) | `/api/internal/...` receives booking_created event; PMS calls VAV `/api/internal/property-sync` with credentials |
| **Supabase (AI Agent)** | HMAC-signed bridge | WhatsApp + Instagram ingest | **← Supabase** (POST to `/api/internal/messaging/ingest`) | Signature: HMAC-SHA256(request_body, BRIDGE_SECRET); idempotency via `(tenant_id, message_id)` |
| **Stripe** | Webhook + session creation | Payment collection (USD card) | **← Stripe** (charge.completed → `/webhooks/stripe`); **→ Stripe** (create checkout session) | Stripe webhook secret in `STRIPE_WEBHOOK_SECRET`; session_id returned in payment_link response |
| **SiteMinder** | XML-RPC / REST adapter (v1) | Channel manager sync | **→ SiteMinder** (atomic allocate + availability push); **← SiteMinder** (inbound updates pending M4) | `/channel/outbound/adapter.py` dispatches to SiteMinder XML-RPC; atomic allocation mutex held during sync |
| **Pago Móvil PSP** (BDV) | Webhook + payment instructions | Local VES payment rail | **← BDV** (POST `/webhooks/bdv` with payment confirmation); **→ BDV** (generate payment reference) | Signature verification via `webhook_signing.py`; reference format: `<property>-<booking>-<timestamp>` |
| **Google Cloud Secret Manager** | Secret injection | JWT keypair + credential management | **← GCP** (Cloud Run pulls JWT private/public keys + DB URL) | Service account `tour-pms-backend@tour-pms-staging.iam.gserviceaccount.com` reads secret versions |
| **Supabase (Database)** | Shared PostgreSQL + session pooler | System-of-record | **↔** (All domains query) | Connection: `aws-1-sa-east-1.pooler.supabase.com:5432`; RLS policies enforce tenant isolation |
| **Redis (on-demand, Dec 2026)** | Cache + soft holds | Hot-path caching + distributed locks | **↔** (Availability, pricing, holds) | Key patterns: `t:{tenant}:avail:*`, `hold:{tenant}:{room}:{dates}` |

#### Host-Mount / Module Hosting

**Caney Restaurants POS (hosted module status):**
The task board and codebase indicate a **planned future integration** but **NOT currently active** in the surface map. References exist:
- `APP/backend/accounting/pos_folio.py` — POS folio integration stub
- Milestone M10 (POS v2) schema contracts pending
- No active webhooks or API consumers for POS yet

**Actual cross-module hosting:**
- Messaging bridge: Supabase hosts AI agent; PMS hosts ingestion endpoint
- Channel adapter: PMS hosts SiteMinder XML-RPC dispatcher; SiteMinder hosts inventory service

#### Git Branch & CI/CD Signals

| Signal | Path | Liveness |
|---|---|---|
| **Deploy to Staging** | `.github/workflows/deploy-staging.yml` | Triggers on push to `main`; gates: CI pass (via branch protection) + migration integrity check + Supabase schema apply |
| **CI Pipeline** | `.github/workflows/ci.yml` | Runs on PRs + pushes to `main`; lint + unit tests |
| **Health Check** | `GET /health` (backend) | 200 when app boots; always OK (no deps) |
| **Readiness Check** | `GET /health/ready` (backend) | 200 if DB + Redis reachable; 503 if DB fails; "disabled" if Redis fails (fail-open) |
| **Vercel Deploy** | `.vercel/project.json` (GitHub integration) | Auto-deploys `APP/frontend/` on push to `main` → `caneycloud.com` |
| **Working Branch** | Multiple feature branches (e.g. `feature/TASK-WA-020`, `feature/TASK-INF-004`) | Local development branches; pushed for team visibility |
| **Staging URLs** | Backend: `https://tour-pms-backend-ch43bweaoq-rj.a.run.app` | Cloud Run auto-updated on staging deploy |
| | Frontend: `https://caneycloud.com` | Vercel auto-updated on main push |

---

### PER-DOMAIN FUNCTION MAPPING

| Domain | L1 Node | Primary Function | Secondary Functions | Risk Level |
|---|---|---|---|---|
| Booking Core | Booking/holds/move | **Booking/Commerce** | Ops/Intelligence (inventory state) | 🔴 Critical (overselling hazard) |
| Availability & Inventory | Avail/rooms | **Booking/Commerce** | Ops/Intelligence (capacity reporting) | 🔴 Critical (race conditions) |
| Pricing & Quotes | Pricing/quotes | **Booking/Commerce** | Ops/Intelligence (rate analysis) | 🟡 High (price lock) |
| Properties & Rooms | Portal/properties | **Ops/Intelligence** | Identity/Access (staff config) | 🟡 Medium |
| Messaging & Comms | Bridge/convos | **Messaging/Comms** | Booking/Commerce (agent integration) | 🟡 High (at-least-once guarantee needed) |
| Payments & Finance | Finance/invoices | **Payments/Money** | Ops/Intelligence (reconciliation) | 🔴 Critical (double-charge hazard) |
| Accounting & Reporting | Chart/journals | **Ops/Intelligence** | Payments/Money (audit trail) | 🟡 Medium (contract-declared, 501 stubs) |
| Channels & Distribution | SiteMinder/VAV | **Ops/Intelligence** | Booking/Commerce (inventory sync) | 🔴 Critical (oversell via OTA) |
| Auth & Access | JWT/tenants | **Identity/Access** | Ops/Intelligence (audit) | 🔴 Critical (multi-tenant isolation) |

---

### CONTRACTS & STABILITY NOTES

- **OpenAPI as source of truth:** `/Users/tomas/tour-pms-main/APP/backend/api/openapi.yaml` v1.0.3 (minor bumps for additive changes; breaking changes file CONTRACT-CHANGE tasks)
- **Transactional outbox:** Critical events (booking.confirmed, booking.cancelled) follow publish-or-outbox pattern (TASK-OUTBOX-01); failure falls back to `event_outbox` table drain
- **Idempotency:** All booking/payment/admin mutations require `Idempotency-Key` header (24h window, per-tenant)
- **RLS enforcement:** `SET LOCAL app.current_tenant = ?` fires on every request (Postgres per-session variable)
- **Currency duality:** USD internal, VES display (exchange_rate captured at booking time)
- **Pagination:** Cursor-based (opaque, default 50 items, max 200)

---

**Summary:** CaneyCloud is a **9-domain modular monolith** with clear L1 nodes, strong Booking/Commerce focus (critical-path: availability → pricing → bookings → payments → accounting), and **tight external coupling to VAV platform + Supabase messaging agent + SiteMinder channel manager**. The 136-migration schema supports 82+ core tables across auth, inventory, finance, and accounting. Deployment is **on-demand Cloud Run + Supabase free tier**, with auto-deploy gates on migration integrity + CI green + schema application.