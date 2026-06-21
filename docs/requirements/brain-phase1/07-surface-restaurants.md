Perfect! Now I have enough information. Let me create a comprehensive SURFACE MAP document:

---

## SURFACE MAP: Caney Restaurants Module

**System:** Caney Restaurants (Restaurant Operations Platform)  
**Repo:** `/Users/tomas/caneycloud-restaurant`  
**Host Integration:** CaneyCloud (Brownfield PMS extension, AR18 module layout)  
**Host Mount Contract:** `/Users/tomas/caneycloud-restaurant/MODULE-INTEGRATION.md`

---

### A. TOP-LEVEL DOMAINS (L1 Nodes)

| Domain | Module(s) | Key Tables | Endpoints | Primary Function |
|--------|-----------|-----------|-----------|-----------------|
| **Floor Operations & Seating** | M02 | floor_plans, floor_plan_tables, seating_requests, reservations, m02_waitlist_entries | 13 routes (seating, layout, waitlist, reservations) | Booking/Commerce |
| **Order Management & Fulfillment** | M02 | orders, kitchen_display, order_adjustments, m02_order_adjustment_resolution | 18 routes (orders, checkout, courses, bill-preview, expo, bulk-status) | Booking/Commerce |
| **Workforce & Attendance** | M02 | staff, staff_shift, attendance_events, m02_attendance_correction, m02_staff_permission_grant | 5 routes (attendance, corrections, permissions, staff-clock) | Ops/Intelligence |
| **Menu & Catalog** | M02 | menus, menu_items, m02_kitchen_line_state | 4 routes (menu-availability, courses, kitchen-lines) | Content/Catalog |
| **Guest Intelligence & CRM** | M02 | m02_diner_visit_fact, m02_churn_alert, m02_campaign_segments, m02_crm_outreach, m02_guest_note, m02_revenue_offers, m02_offer_redemptions | 6 routes (guest-segment, campaign-segments, guest-notes, crm-outreach, revenue-offers) | Ops/Intelligence |
| **Payment & Settlement** | M01 + M_VPAY | m01_payment_sessions, m01_tip_recordings, m01_split_records, m01_rail_selections | 6 routes (payment-sessions, acquirer, operator-payment-actions) | Payments/Money |
| **Inventory & Recipes** | M_INV | m_inv_deliveries, m_inv_prep, m_inv_recipes, m_inv_reorder, m_inv_shared_pantry, m_inv_shrink, m_inv_spoilage, m_inv_stock_counts | 11 migrations, 10 services | Content/Catalog |
| **Kitchen Display & Routing** | M_KDS | (in-memory) | SSE stream + routing service | Ops/Intelligence |
| **Fiscal & Tax Compliance** | M_FISCAL | m_fiscal_control_numbers, m_fiscal_documents, m_fiscal_contingencies | 5 routes + SENIAT adapter | Payments/Money |
| **Finance & Export** | M12 | m12_payroll_export, m12_accounting_export, m12_audit_export, m12_finance_mapping | 7 routes, 4 services | Payments/Money |
| **Platform Integration & Operator Console** | M17 | (durable tenant config, webhooks, operator state) | 54 routes (operator workspace, KPI, diagnostics, data governance, tenant mgmt) | Ops/Intelligence |
| **Identity & Access Control** | shared + M17 | users, tenants, m_managed_secrets, permission_grants | 9 routes (auth: /ops, /password, /whatsapp, /otp, /step-up) | Identity/Access |
| **Referral & Onboarding** | M05 | (ghost listings, instagram imports) | 6 routes (referral-suggestions, onboarding, instagram) | Content/Catalog |

---

### B. MACHINE-READABLE CONTRACTS

#### **B.1 OpenAPI/Route Surface**

No formal OpenAPI spec file exists; FastAPI auto-generates at `/docs` per runtime.  
**Canonical inspection path:** `/Users/tomas/caneycloud-restaurant/modules/app/app.py` (line 1–1738)

**Endpoint Summary by API Namespace:**

| API Namespace | Path | Endpoints | Contract File | Mounted By |
|---|---|---|---|---|
| M02 Ops | `/api/v1/m02/*` | 91 (26 routers) | `/modules/M02/routes/` (33 files) | `_wire_m02()` line 765 |
| M02 Operator Analytics | `/api/v1/operator/m02/*` | 10 (analytics, flash report) | `/modules/M02/routes/analytics.py`, `end_of_day_report.py` | `_wire_m02()` |
| M01 Payment | `/api/v1/m01/*` | 6 | `/modules/M01/routes/vpay.py`, `operator_payment_actions.py` | `_wire_m01()` line 1541 |
| M_INV Inventory | `/api/v1/m_inv/*` | ~8 (read-only HTTP surface) | `/modules/M_INV/routes/surface.py` | `_wire_m_inv()` line 1249 |
| M_KDS Display | `/api/v1/m_kds/*` | SSE stream + state | `/modules/M_KDS/routes/` | `_wire_m_kds()` line 1445 |
| M_FISCAL Printer | `/api/v1/m_fiscal/*` | 8–12 | `/modules/M_FISCAL/routes/` | `_wire_m_fiscal()` line 1646 |
| M12 Finance | `/api/v1/m12/*` | 7 | `/modules/M12/routes/finance_export.py` | `_wire_m12()` line 555 |
| M05 Referral | `/api/v1/restaurants/*` | 6 | `/modules/M05/routes/` | `modules.M17.app` (base) |
| M17 Operator | `/api/v1/operator/*` | 54 | `/modules/M17/routes/` (11 files) | `modules.M17.app` (base) |
| Shared Auth | `/api/v1/auth/*` | 9 | `/modules/shared/routes/v1.py` | `_wire_auth()` line 624 |
| Platform | `/api/v1/platform/*` | 3 (health, metrics, release-mode) | `/modules/shared/routes/`, `/modules/app/health.py` | app root + `build_health_router()` |

**Key endpoint for host integration:**
- `GET /api/v1/platform/release-mode` — tenant-scoped feature gate + frontend flag resolver
  - **Headers:** `X-Restaurant-Id` (optional), `X-User-Id` (optional)
  - **Response:** `{release_mode, go_live_enabled, darktest_enabled, ui_preset, tenant_access, frontend_flags}`
  - **Location:** `/modules/M17/app.py:754`

#### **B.2 Database Migrations Path & Tables**

**Migration Discovery Root:** `/Users/tomas/caneycloud-restaurant/modules/*/migrations/`  
**Migration Chain Stitcher:** `modules.shared.migrations_chain.discover_revisions()` + `wire_auth_root()`  
**Alembic Revision Naming:** Prefix-enforced (AR11/AR17) — `{module}_{seq}_{name}` (e.g., `m02_002_create_menu`)

**Key Migrations by Module:**

| Module | Migration Count | Key Tables | Path |
|--------|---|---|---|
| **M02** | 20 | menus, menu_items, orders, floor_plans, floor_plan_tables, staff, staff_shift, reservations, m02_waitlist_entries, m02_kitchen_line_state, m02_campaign_segments, m02_crm_outreach, m02_revenue_offers, m02_cash_drawer_closes, m02_churn_alert, m02_occupancy_prediction, m02_order_adjustments, m02_order_adjustment_resolution, m02_approval_requests, m02_shift_swap_requests, m02_sync_state, m02_staff_permission_grant | `/modules/M02/migrations/` |
| **M12** | 13 | m12_payroll_export, m12_accounting_export, m12_audit_export, m12_finance_mapping | `/modules/M12/migrations/` |
| **M_INV** | 11 | m_inv_deliveries, m_inv_recipes, m_inv_prep, m_inv_reorder, m_inv_shared_pantry, m_inv_shrink, m_inv_spoilage, m_inv_stock_counts | `/modules/M_INV/migrations/` |
| **M17** | 9 | m17_operator_state_snapshot, m17_tenant_config, m17_webhook_registry, m17_data_governance_policy | `/modules/M17/migrations/` |
| **M_FISCAL** | 5 | m_fiscal_control_numbers, m_fiscal_documents, m_fiscal_contingencies | `/modules/M_FISCAL/migrations/` |
| **M01** | 9 | m01_payment_sessions, m01_tip_recordings, m01_split_records | `/modules/M01/migrations/` |
| **M05** | 9 | m05_referral_suggestions, m05_instagram_imports | `/modules/M05/migrations/` |
| **M_KDS** | 1 | (in-memory only) | `/modules/M_KDS/migrations/` |
| **shared** | 9 | users, tenants, m_managed_secrets, permission_grants (RST-1.1/RST-1.3/RST-1.4) | `/modules/shared/migrations/` |

**RLS Scope Enforcement:** Each table tagged `[TENANT]` (per-restaurant isolation) or `[PLATFORM]` (cross-tenant reads).  
**Foreign Key Policy:** AR17 — NO literal `REFERENCES` clauses in DDL; references by VALUE; service layer enforces links.

---

### C. CROSS-SYSTEM INTEGRATION & EDGES

#### **C.1 Host Mount Contract (CaneyCloud → Restaurants)**

**Mount Type:** `host_mount`  
**Direction:** CaneyCloud (host) ← Restaurants (mounted guest module)  
**Integration Contract:** `/Users/tomas/caneycloud-restaurant/MODULE-INTEGRATION.md`

**Mount Points:**
- Backend base: `http://127.0.0.1:8017` (M17 standalone) or `http://127.0.0.1:8000` (assembled/production)
- Diner frontend: `http://127.0.0.1:5173`
- Operator frontend: `http://127.0.0.1:5174`

**Host Provides (Via Headers):**
- `X-Restaurant-Id` — tenant ID for scoped access behavior (required for accurate scoping)
- `X-User-Id` — optional; preserved for future per-user flagging
- Existing CaneyCloud session/JWT context (RST-1.1 token verification in live mode)

**Module Exposes (Features/Visibility Gate):**
- **Canonical switch endpoint:** `GET /api/v1/platform/release-mode` (line 754 in `/modules/M17/app.py`)
- **Output:** 
  ```json
  {
    "release_mode": "dark|live",
    "go_live_enabled": boolean,
    "darktest_enabled": boolean,
    "ui_preset": "caneycloud",
    "tenant_access": ["referrals", "operator", "darktest"],
    "frontend_flags": {
      "module_shell_enabled": boolean,
      "diner_journey_enabled": boolean,
      "operator_workspace_enabled": boolean,
      "diagnostics_enabled": boolean,
      "legacy_controls_enabled": boolean
    }
  }
  ```

**Host-Side Binding:**
1. Add `Restaurant` nav item that routes to diner or operator module based on user role/context
2. Set `RESTAURANT_UI_PRESET=caneycloud` in deployed runtime
3. Align shared package typography (`Hanken Grotesk` sans/display, `JetBrains Mono` mono) to CaneyCloud tokens
4. Set `RESTAURANT_RELEASE_MODE=live` only when human gate is approved; scope live tenants via `RESTAURANT_LIVE_TENANT_IDS` or `RESTAURANT_LIVE_ALLOW_ALL=true`
5. Keep `RESTAURANT_RELEASE_MODE=dark` for synthetic-only validation lanes

**Configuration Externalization (W5-D4):**
- Environment variables (no secrets baked in): `RESTAURANT_RELEASE_MODE`, `RESTAURANT_LIVE_TENANT_IDS`, `RESTAURANT_LIVE_ALLOW_ALL`, `RESTAURANT_UI_PRESET`, `RESTAURANT_CORS_ALLOWED_ORIGINS`, `REPOSITORY_BACKEND`, `AUTH_JWT_PRIVATE_KEY`, `RESTAURANT_KDS_ADAPTER`, `RESTAURANT_FISCAL_ADAPTER`, `RESTAURANT_FISCAL_PRINTER_SERIAL`
- See `/Users/tomas/caneycloud-restaurant/.env.example` for full list

#### **C.2 Event Bus & Outbox Relay**

**Pattern:** RST-1.4 transactional outbox (W5-C4)  
**Running Relay:** `modules.app.relay_runner.RunningOutboxRelay` (started on app `startup` in live mode)  
**Outbox Instance:** `app.state.event_outbox` + `app.state.event_bus` (InMemoryEventBus)  
**Location:** `/modules/app/app.py:481–496`

**Event Consumers (Projections):**
- M_INV menu catalog projection subscribes to M02's `menu.updated` events (RST-4b.1 consumer pact)
- M17's apagon-ready daily-snapshot service (W9-BF FU-3)

#### **C.3 Shared Packages (Frontend Dependencies)**

**Location:** `/Users/tomas/caneycloud-restaurant/packages/`

| Package | Consumers | Key Exports | Path |
|---|---|---|---|
| `@caneycloud/ui` | diner-web, operator-web, foh-web, kds-display | Shared component lib, CaneyCloud design tokens (Hanken Grotesk) | `/packages/ui/` |
| `@caneycloud/api-client` | all frontends | Auto-generated API client from FastAPI routes | `/packages/api-client/` |
| `@caneycloud/offline` | diner-web, foh-web | Offline-first sync layer (Apagón conflict resolution) | `/packages/offline/` |

#### **C.4 Durable Repository Backend Selection**

**Selector:** `modules.shared.db.repository_backend()` — environment-driven (default in-memory, durable Pg on `REPOSITORY_BACKEND=postgres`)  
**Factories by Module:**
- M02: `modules.M02.repositories.*_repo()`
- M12: `modules.M12.repositories.*_repo()`
- M_INV: `modules.M_INV.repositories.*_repo()`
- M17: `modules.M17.repositories.*_repo()`
- Shared: `modules.shared.repositories.postgres.Pg*Repo`

**Connection Pool:** Env-configured; passed at factory time; `None` for in-memory default.

#### **C.5 Authentication & JWT Sharing**

**RST-1.1 Token Service Singleton:** `modules.M17.app._live_token_service()`  
**Shared by:** Login (`AuthService` in `modules.shared.services.auth_service`) and protected-route verifier (`Rst11SessionClaimsProvider`)  
**Signing Algorithm:** RS256  
**Key Management:** `AUTH_JWT_PRIVATE_KEY` / `AUTH_JWT_PRIVATE_KEY_FILE` env var (W5-D4 externalized; ephemeral self-marked if unset)  
**Location:** `/modules/app/app.py:684` (reused by both sign-in and verification)

#### **C.6 Permission Grants Service**

**Singleton:** `app.state.permission_service` (PermissionGrantService from M17)  
**Consumers:** 
- M02 routes (all mount `Depends(require_subrole(...))` directly)
- M12 routes (gated by `require_subrole(ACCOUNTANT, ADMIN)`)
- M_FISCAL routes (every route gates on `require_subrole(ACCOUNTANT, ADMIN)`)

**Claims Provider Bridge:** `_request_scoped_claims_provider()` resolves from W5-C2 middleware's ContextVar (never duplicated, verified once per request)  
**Location:** `/modules/app/app.py:736–762`

#### **C.7 Adapter Seams (Operator-Bound Integration Points)**

| Adapter | Default | Production | Env Flag | Module |
|---|---|---|---|---|
| **WhatsApp OTP Transport** | `MockWhatsAppTransport` | Meta Business API adapter (operator-bound) | — | shared auth |
| **Payment Acquirer** | `StubAcquirerAdapter` (decline on $999.99) | `MercantilAcquirerAdapter` | `DECISION-VPAY-001` | M01/M_VPAY |
| **Fiscal Printer** | `StubFiscalPrinterAdapter` | `TheFactoryHkaAdapter` (SENIAT) | `RESTAURANT_FISCAL_ADAPTER=the_factory_hka` | M_FISCAL |
| **KDS Display** | `NativeKdsAppAdapter` | `LegacyPosKdsAdapter` (legacy POS shim) | `RESTAURANT_KDS_ADAPTER=legacy` | M_KDS |
| **LaCentral Draft** | `InMemoryLaCentralDraftPort` | Real API connector | — | M_INV |
| **PrecioJusto Index** | `InMemoryPrecioJustoIndex` | Real HTTP market API | — | M_INV |
| **Inventory Transfer Settlement** | `InMemoryInventoryTransferSettlementPort` | Real settlement service | — | M_INV |
| **Ledger Read (M02 CRM)** | `_EmptyLedgerReadPort` (returns []) | `M01LedgerReadAdapter` (settlement data) | — | M02 |

---

### D. DEPLOY & LIVENESS SIGNALS

#### **D.1 Git Metadata**

**Repository:** `https://github.com/arevalogutierrezbajares-spec/caneycloud-restaurant.git`  
**Main Branch:** `main`  
**Active Feature Branches:**
- `harden/operator-ux-sprint-1` (50+ commits ahead; operator UX + pilot hardening)
- `impeccable/W17-salon-critique` (hardened critique)
- `feat/m05-ig-onboarding-http-surfaces` (current active branch)

**Deployment Readiness Docs:**
- `/docs/E2E-REVIEW-PLAN.md` — e2e test tracks (functional + UX/UI), 10 parallel agents, 12 gates
- `/docs/PRD-PRODUCTION-READY-V2.md` — production readiness V2

#### **D.2 CI/CD Pipelines**

**GitHub Actions Workflow Configs:**
- `/infra/.github/workflows/module-identity-core.yml` — shared identity (M17/auth) tests
- `/infra/.github/workflows/module-ordering.yml` — M02 order ops tests
- `/infra/.github/workflows/module-shared.yml` — shared services tests
- `/infra/.github/workflows/pull-request-pipeline.yml` — full pre-merge gate
- `/infra/.github/workflows/migration-check.yml` — RST-1.5 chain validation

**Health Probes:**
- `GET /healthz` — returns `{"ok": true, "module": "M17"}` (public, always live)
- `GET /readiness` — reports `outbox_relay` running status (built via `build_health_router()` in `/modules/app/health.py`)
- `GET /metrics` — `/api/v1/platform/metrics` — structured telemetry

#### **D.3 Deployment Artifact**

**Image:** OCI-compliant, vendor-agnostic (runs on Cloud Run, ECS, Kubernetes, Fly, bare Docker)  
**Build:** `infra/build/build.sh` (deterministic, pinned Python 3.12, dependencies from `pyproject.toml`)  
**Dockerfile:** `/Dockerfile` (two-stage: builder venv → slim runtime)  
**Runtime Entry:** `uvicorn modules.app:app --host 0.0.0.0 --port 8000` (assembled app) or `modules.M17.app:app --port 8017` (M17 standalone)

**Config Externalization (W5-D4):**  
Every env var documented in `/.env.example`; none baked into image.

#### **D.4 Deployment Checks**

**Pre-Deploy:**
- `infra/deploy/chain_guard_check.py` — validates RST-1.5 migration chain integrity (no cross-module FK violations, no orphaned revisions)
- `infra/deploy/rls_guard_check.py` — asserts all tables registered in RST-1.3 RLS policy registry
- `modules.shared.deploy_context.assert_release_mode_consistent()` — production-context fail-closed gate (app REFUSES to start if prod deploy + not live mode)

**Post-Deploy:**
- `infra/deploy/smoke_check.py` — `/healthz`, `/readiness`, `/metrics`, `/api/v1/platform/release-mode` smoke tests
- `infra/deploy/migrate.py` — runs Alembic chain up; validates via `chain_guard_check` + `rls_guard_check`
- `infra/deploy/rollback.py` — reverses migrations (manual gate required for each step)

---

### E. DOMAIN DESCRIPTIONS & FUNCTION MAPPING

| L1 Domain | One-Line Description | Function | Tags |
|---|---|---|---|
| **Floor Operations & Seating** | Manages restaurant floor plan, table state, seating assignments, reservation + waitlist queues | Booking/Commerce | `seating`, `reservations`, `floor_plan`, `tables` |
| **Order Management & Fulfillment** | Captures guest orders (items, qty, customization), routes to kitchen, tracks fulfillment state, handles handoff | Booking/Commerce | `orders`, `kitchen`, `expo`, `checkout` |
| **Workforce & Attendance** | Tracks staff identity, shift schedules, clock-in/out events, permission grants (subroles), labor compliance | Ops/Intelligence | `staff`, `attendance`, `permissions`, `shifts` |
| **Menu & Catalog** | Owner-managed menu (items, prices USD, descriptions, photos, availability flags), feeds consumer/WhatsApp | Content/Catalog | `menus`, `items`, `prices`, `availability` |
| **Guest Intelligence & CRM** | Diner visit history, churn signals, segmentation for campaigns, outreach tracking, revenue offers, loyalty | Ops/Intelligence | `crm`, `segments`, `churn`, `campaigns`, `loyalty` |
| **Payment & Settlement** | Payment session lifecycle, acquirer integration, tip/split recording, rail selection, audit trail | Payments/Money | `payments`, `acquirer`, `tips`, `splits`, `settlement` |
| **Inventory & Recipes** | Stock tracking (on-hand, reorders), recipe flexibility, shared pantry transfers, prep tracking, spoilage ledger | Content/Catalog | `inventory`, `recipes`, `stock`, `delivery`, `reorder` |
| **Kitchen Display & Routing** | Real-time KDS (native or legacy POS shim) with station routing (hot/cold lines), recall service, ticket lifecycle | Ops/Intelligence | `kds`, `stations`, `routing`, `tickets`, `recall` |
| **Fiscal & Tax Compliance** | SENIAT e-invoice integration, control-number chain (gap detection), fiscal printer adapter, contingency fallback | Payments/Money | `fiscal`, `tax`, `seniat`, `printer`, `contingency` |
| **Finance & Export** | Payroll export, accounting export, audit report export, finance-mapping reconciliation for M12 backends | Payments/Money | `payroll`, `accounting`, `audit`, `export`, `finance` |
| **Platform Integration & Operator Console** | Operator workspace (overview KPIs, invites, activations), tenant config, webhooks, data governance, diagnostics | Ops/Intelligence | `operator`, `console`, `kpi`, `tenant`, `webhooks`, `governance` |
| **Identity & Access Control** | User/tenant identity (RST-1.1 JWT), session management, role-based access (subroles), step-up elevation, OTP | Identity/Access | `auth`, `jwt`, `roles`, `permissions`, `otp` |
| **Referral & Onboarding** | Ghost listing referral suggestions (diner lookup), Instagram import, restaurant onboarding workflows | Content/Catalog | `referrals`, `suggestions`, `instagram`, `onboarding` |

---

### F. ASSEMBLY LAYERS (W5-C* Architecture)

| Layer | Purpose | Code Location | Key Components |
|---|---|---|---|
| **W5-B1 Base** | Release-mode + claims-provider wiring, M05 + M17 + observability | `modules.M17.app.create_app()` | Synthetic vs RST-1.1 JWT selection, TokenService singleton |
| **W5-C1 Assembly** | Mount every module's HTTP surface under `/api/v1` | `modules.app.app.create_app()` | Includes M02 (26 routers), M05 (referral), M17 (operator) |
| **W5-C2 Auth Middleware** | Resolve identity + tenant + subrole ahead of EVERY protected route | `AuthContextMiddleware` in `/modules/app/middleware.py` | Reuses W5-B1 claims provider; ContextVar for request-scoped claims |
| **W5-C4 Outbox Relay** | Poll RST-1.4 transactional outbox continuously; deliver events to bus | `RunningOutboxRelay` in `/modules/app/relay_runner.py` | Transactional UoW pattern; started on `startup` in live mode |
| **W5-C5 M12 Finance Surface** | Finance/export HTTP routes + service binding | `_wire_m12()` line 555 | 4 export services (payroll, accounting, audit, finance-mapping) |
| **W5-C6 Health/Metrics** | Public `/health`, `/readiness`, `/metrics` endpoints | `/modules/app/health.py` | No auth required; relay + repo health signals |
| **W5-C7 Structured Logging** | Emit one log record per request with correlation ID, secret-free | `StructuredRequestLogMiddleware` in `/modules/app/middleware.py` | Outermost layer (runs first on request entry) |
| **W5-C9 M02 Service Binding** | Construct + bind every M02 service to route modules | `_wire_m02()` line 765 | 25+ services; fail-closed 500 until bound |
| **W5-C10 Auth Surface** | Construct + bind RST-1.1 auth routes (sign-in, step-up, OTP) | `_wire_auth()` line 624 | AuthService, StepUpService, OtpService; shared TokenService instance |
| **W5-D4 Config Externalization** | All secrets/deploy-specific values via env vars, not baked in | `.env.example`, Dockerfile | Release mode, live tenants, JWT keys, adapter choices |
| **W5-D5 Production Fail-Closed** | App REFUSES to start if prod context + not live mode | `assert_release_mode_consistent()` in `modules.shared.deploy_context` | Catches forgotten release-mode flag before binding socket |

---

### G. DEPLOYMENT & MOUNT CONTEXT SUMMARY

**System Class:** Brownfield restaurant operations micromodule (17 epics, 145 FRs, ~145K LOC)  
**Mounting Strategy:** Embedded as guest inside CaneyCloud host via host_mount edge  
**Assembly Size:** Monolithic Python backend (27+ modules, 20+ routers, 91+ M02 endpoints, 54+ M17 endpoints, 130+ domain services)  
**Frontend Consumption:** Separate-origin SPAs (diner-web, operator-web, operator-web-next, foh-web, kds-display) calling `/api/v1/*` via CORS-gated API  
**Data Isolation:** Tenant-scoped ([TENANT] RLS everywhere except [PLATFORM] identity/config)  
**Transactions:** Durable Postgres (opt-in via `REPOSITORY_BACKEND=postgres`) or in-memory default  
**Events:** RST-1.4 transactional outbox + InMemoryEventBus with running relay (W5-C4)  
**Auth:** RST-1.1 JWT (production) or synthetic headers (dark-test mode)  
**Deployment:** OCI image (vendor-agnostic), deterministic build, config externaliz (W5-D4), production fail-closed (W5-D5)  
**Readiness:** Wave 5 productionization COMPLETE (main @ cb7812a), Wave 6 D4 features on feature branches (22,686 LOC aggregate: FOH, VPAY, Apagón offline, KDS, SENIAT fiscal)

---

**END OF SURFACE MAP**