/**
 * THE BRAIN — canonical domain taxonomy (the real surface maps, distilled).
 *
 * Single source of truth for the FULL canonical domain set of every system,
 * transcribed from docs/requirements/brain-phase1/05..09-surface-*.md. Domain
 * ids are the canonical `<system>.<slug>` keys that MUST exist in FN_MAP
 * (lib/brain/functions.ts) so By-Function works.
 *
 * The OpenAPI / route / migration extractors are deliberately thin (specs lag
 * the code). domain-cluster.mjs uses this map to GUARANTEE every system renders
 * its complete domain set even where the machine-readable contract is sparse.
 * Surface extractors layer real route/path detail ON TOP of these.
 *
 * Each domain carries:
 *   - id        canonical slug (FN_MAP key)
 *   - label     display label
 *   - state     "done" | "doing" | "needed" (overridable by state-overlay)
 *   - surfaces  representative route/path strings (≤6) for the L3 nodes + count
 *   - keywords  tokens used to bucket OpenAPI paths / routes into this domain
 */

/* ── VAV (live) — 10 domains, from 05-surface-vav.md ── */
export const VAV_DOMAINS = [
  { id: "vav.marketplace", label: "Marketplace Core", state: "done",
    surfaces: ["/app/api/listings", "/app/api/packages", "/app/(tourist)", "GET /api/listings/{slug}/availability"],
    keywords: ["listing", "listings", "package", "packages", "discover", "tourist", "search", "itinerary"] },
  { id: "vav.booking", label: "Booking Pipeline", state: "done",
    surfaces: ["POST /api/quotes", "POST /api/holds", "GET /api/holds/{id}", "DELETE /api/holds/{id}", "POST /api/holds/{id}/extend"],
    keywords: ["booking", "bookings", "quote", "quotes", "hold", "holds", "checkout"] },
  { id: "vav.pms-integration", label: "PMS Integration", state: "done",
    surfaces: ["POST /api/pms/webhook/caneyclouds", "GET /api/listings/{slug}/pms-availability", "GET /api/pms/health", "POST /api/admin/pms/webhook/replay/{eventId}"],
    keywords: ["pms", "webhook", "caneyclouds", "caneycloud", "availability", "ari", "reconcile"] },
  { id: "vav.identity", label: "Identity & Access", state: "done",
    surfaces: ["/app/(auth)", "/lib/auth", "/app/(provider)", "/app/(admin)"],
    keywords: ["auth", "login", "provider", "admin", "agent", "creator", "rls", "session"] },
  { id: "vav.payments", label: "Payments & Money", state: "done",
    surfaces: ["POST /api/stripe/checkout", "POST /api/stripe/webhooks", "/api/payouts", "/lib/stripe"],
    keywords: ["stripe", "payout", "payouts", "payment", "payments", "escrow", "commission"] },
  { id: "vav.messaging-crm", label: "Messaging & CRM", state: "done",
    surfaces: ["POST /api/whatsapp/webhook", "/lib/whatsapp", "/lib/crm"],
    keywords: ["whatsapp", "message", "messaging", "crm", "escalation", "activity"] },
  { id: "vav.operator", label: "Operator Features", state: "done",
    surfaces: ["/api/cron/pms-watchdog", "/api/cron/parity-audit", "/app/(admin)/pms", "/app/(admin)/analytics"],
    keywords: ["cron", "watchdog", "parity", "audit", "analytics", "drift", "reconcile", "health"] },
  { id: "vav.growth-affiliates", label: "Growth & Affiliates", state: "done",
    surfaces: ["/api/discount-codes", "/api/affiliate", "/lib/affiliates"],
    keywords: ["affiliate", "affiliates", "discount", "referral", "creator", "growth"] },
  { id: "vav.ruta-rides", label: "Ruta Rides", state: "doing",
    surfaces: ["/app/(ruta)", "/app/api/ruta"],
    keywords: ["ruta", "ride", "rides", "driver", "vehicle"] },
  { id: "vav.specialized-content", label: "Specialized Content", state: "done",
    surfaces: ["/api/experience-products", "/api/discover", "/lib/birding", "/lib/food"],
    keywords: ["experience", "experiences", "birding", "food", "poi", "guide", "activity", "activities"] },
];

/* ── CaneyCloud (live) — 9 domains, from 06-surface-caneycloud.md ── */
export const CANEY_DOMAINS = [
  { id: "caney.booking-core", label: "Booking Core", state: "done",
    surfaces: ["POST /bookings/hold", "POST /bookings/confirm", "POST /bookings/{id}/cancel", "POST /bookings/{id}/move", "GET /bookings/{id}", "GET /bookings"],
    keywords: ["booking", "bookings", "hold", "holds"] },
  { id: "caney.availability", label: "Availability & Inventory", state: "done",
    surfaces: ["GET /availability", "POST /availability/block", "POST /internal/availability/check"],
    keywords: ["availability", "inventory", "room", "rooms"] },
  { id: "caney.pricing", label: "Pricing & Quotes", state: "done",
    surfaces: ["POST /quotes", "POST /internal/quotes/compute"],
    keywords: ["quote", "quotes", "pricing", "rate", "rates", "season"] },
  { id: "caney.properties", label: "Properties & Rooms", state: "done",
    surfaces: ["GET/POST /admin/properties", "GET/POST /admin/properties/{id}/rooms", "GET/POST /admin/policies"],
    keywords: ["property", "properties", "portal", "policy", "policies", "rate-plan"] },
  { id: "caney.channels", label: "Channels & Distribution", state: "done",
    surfaces: ["GET/POST /admin/channels", "POST /api/v1/channel/...", "POST /api/internal/channel-outbox/drain"],
    keywords: ["channel", "channels", "siteminder", "outbox", "ota", "distribution"] },
  { id: "caney.messaging", label: "Messaging & Communications", state: "done",
    surfaces: ["POST /api/internal/messaging/ingest", "POST /comms/send-email", "POST /comms/send-sms", "GET/POST /notifications"],
    keywords: ["messaging", "comms", "notification", "notifications", "instagram", "whatsapp", "ingest"] },
  { id: "caney.payments", label: "Payments & Finance", state: "done",
    surfaces: ["POST /internal/payment-links", "GET/POST /admin/invoices", "GET/POST /admin/folios", "POST /webhooks/stripe", "POST /webhooks/bdv"],
    keywords: ["payment", "payments", "finance", "invoice", "invoices", "folio", "folios", "refund", "stripe", "bdv"] },
  { id: "caney.accounting", label: "Accounting & Reporting", state: "doing",
    surfaces: ["GET /accounting/dashboard", "GET/POST /accounting/source-events", "GET /accounting/journal-entries", "GET /accounting/periods", "POST /accounting/periods/{id}/close", "GET/POST /accounting/export-profiles"],
    keywords: ["accounting", "journal", "chart", "posting", "period", "ledger", "export-profile"] },
  { id: "caney.auth", label: "Auth & Access", state: "done",
    surfaces: ["POST /auth/login", "POST /auth/refresh", "POST /auth/logout", "GET/POST /api/v1/permissions", "GET/POST /admin/staff"],
    keywords: ["auth", "login", "logout", "refresh", "permission", "permissions", "staff", "tenant"] },
];

/* ── AGB-CRM (live) — 12 domains, from 09-surface-agbcrm.md ── */
export const CRM_DOMAINS = [
  { id: "crm.contacts", label: "Contacts & Network", state: "done",
    surfaces: ["/api/capture/members", "/api/capture/sessions", "/api/contact-logo"],
    keywords: ["contact", "contacts", "member", "members", "network", "logo", "tag", "tags"] },
  { id: "crm.projects", label: "Projects & Portfolio", state: "done",
    surfaces: ["/api/export/projects", "/api/materials/{id}/view", "/api/room-items"],
    keywords: ["project", "projects", "portfolio", "material", "materials", "milestone", "okr", "lob"] },
  { id: "crm.meetings", label: "Meetings & Touches", state: "done",
    surfaces: ["/api/meetings", "/api/voice/transcribe", "/api/capture/notes"],
    keywords: ["meeting", "meetings", "touch", "touches", "attendee", "recording"] },
  { id: "crm.research", label: "Research & Intelligence", state: "done",
    surfaces: ["POST /api/research/sync", "GET /api/research/{id}"],
    keywords: ["research", "sync", "note", "notes", "brain-roots"] },
  { id: "crm.treasury", label: "Treasury & Finance", state: "done",
    surfaces: ["/api/equity/advisor"],
    keywords: ["treasury", "equity", "finance", "account", "transaction", "budget", "fx", "subscription"] },
  { id: "crm.email", label: "Email", state: "done",
    surfaces: ["/api/email", "/api/postmark/inbound", "/api/cron/email-sync"],
    keywords: ["email", "postmark", "mailbox", "thread", "draft", "send"] },
  { id: "crm.partner-rooms", label: "Partner Rooms & Access", state: "done",
    surfaces: ["/api/access/{token}", "/api/partner-uploads", "/api/room-items"],
    keywords: ["partner", "access", "room", "rooms", "upload", "uploads", "share", "signature", "next-step"] },
  { id: "crm.overlord", label: "Overlord & Work Mgmt", state: "done",
    surfaces: ["POST /api/overlord/sync"],
    keywords: ["overlord", "sync", "initiative", "sprint", "theme", "action-item", "work"] },
  { id: "crm.capture", label: "Voice & Capture", state: "done",
    surfaces: ["/api/voice/call", "/api/voice/live-token", "/api/capture", "/api/whatsapp/webhook", "/api/agent/transcribe"],
    keywords: ["voice", "capture", "transcribe", "session", "token", "post", "quick-contact", "agent"] },
  { id: "crm.pitch-feedback", label: "Pitch Feedback", state: "done",
    surfaces: ["/app/presentations", "pitch_feedback_campaigns"],
    keywords: ["pitch", "feedback", "campaign", "invite", "presentation", "response"] },
  { id: "crm.reminders", label: "Reminders & Nudges", state: "done",
    surfaces: ["POST /api/cron/reminders", "POST /api/cron/nudges"],
    keywords: ["reminder", "reminders", "nudge", "nudges"] },
  { id: "crm.intelligence", label: "Intelligence & AI", state: "done",
    surfaces: ["POST /api/dashboard/ai-actions", "POST /api/brain/feedback", "POST /api/mcp"],
    keywords: ["dashboard", "ai-actions", "brain", "mcp", "feedback", "intelligence", "oauth"] },
];

/* ── Caney Restaurants (host-mounted in caney; release_mode dark ⇒ "doing") ──
 * From 07-surface-restaurants.md. system:"restaurants", hosted_by:"caney",
 * source:"host_mount". 13 domains mapped to restaurants.* FN_MAP slugs. */
export const RESTAURANT_DOMAINS = [
  { id: "restaurants.floor-ops", label: "Floor Operations & Seating", module: "M02",
    surfaces: ["/api/v1/m02/seating", "/api/v1/m02/layout", "/api/v1/m02/waitlist", "/api/v1/m02/reservations"],
    keywords: ["seating", "floor", "waitlist", "reservation", "table"] },
  { id: "restaurants.pos", label: "Order Management & Fulfillment", module: "M02",
    surfaces: ["/api/v1/m02/orders", "/api/v1/m02/checkout", "/api/v1/m02/courses", "/api/v1/m02/bill-preview", "/api/v1/m02/expo"],
    keywords: ["order", "orders", "checkout", "expo", "bill", "pos"] },
  { id: "restaurants.kds", label: "Kitchen Display & Routing", module: "M_KDS",
    surfaces: ["/api/v1/m_kds/stream", "/api/v1/m_kds/state"],
    keywords: ["kds", "kitchen", "station", "routing", "ticket"] },
  { id: "restaurants.inventory", label: "Inventory & Recipes", module: "M_INV",
    surfaces: ["/api/v1/m_inv/deliveries", "/api/v1/m_inv/recipes", "/api/v1/m_inv/reorder", "/api/v1/m_inv/stock-counts"],
    keywords: ["inventory", "recipe", "stock", "delivery", "reorder", "pantry", "prep", "spoilage"] },
  { id: "restaurants.operator-console", label: "Platform Integration & Operator Console", module: "M17",
    surfaces: ["/api/v1/operator/overview", "/api/v1/operator/kpi", "/api/v1/operator/diagnostics", "/api/v1/platform/release-mode"],
    keywords: ["operator", "console", "kpi", "tenant", "webhook", "governance", "diagnostics", "platform"] },
  { id: "restaurants.diner-web", label: "Diner Web & Self-Service", module: "M02",
    surfaces: ["diner-web SPA (127.0.0.1:5173)", "/api/v1/m02/diner-journey", "/api/v1/m02/self-order"],
    keywords: ["diner", "self-order", "guest-journey", "diner-web"] },
  { id: "restaurants.menu", label: "Menu & Catalog", module: "M02",
    surfaces: ["/api/v1/m02/menu-availability", "/api/v1/m02/courses", "/api/v1/m02/kitchen-lines"],
    keywords: ["menu", "menus", "catalog", "item", "items", "kitchen-line"] },
  { id: "restaurants.guest-crm", label: "Guest Intelligence & CRM", module: "M02",
    surfaces: ["/api/v1/m02/guest-segment", "/api/v1/m02/campaign-segments", "/api/v1/m02/crm-outreach", "/api/v1/m02/revenue-offers"],
    keywords: ["guest", "segment", "churn", "campaign", "outreach", "loyalty", "crm-outreach"] },
  { id: "restaurants.payments", label: "Payment & Settlement", module: "M01",
    surfaces: ["/api/v1/m01/payment-sessions", "/api/v1/m01/acquirer", "/api/v1/m01/operator-payment-actions"],
    keywords: ["payment", "payments", "acquirer", "tip", "split", "rail", "settlement", "vpay"] },
  { id: "restaurants.fiscal", label: "Fiscal & Tax Compliance", module: "M_FISCAL",
    surfaces: ["/api/v1/m_fiscal/control-numbers", "/api/v1/m_fiscal/documents", "/api/v1/m_fiscal/contingencies"],
    keywords: ["fiscal", "tax", "seniat", "printer", "contingency", "control-number"] },
  { id: "restaurants.accounting", label: "Finance & Export", module: "M12",
    surfaces: ["/api/v1/m12/payroll-export", "/api/v1/m12/accounting-export", "/api/v1/m12/audit-export", "/api/v1/m12/finance-mapping"],
    keywords: ["payroll", "accounting", "audit", "export", "finance-mapping", "m12"] },
  { id: "restaurants.onboarding", label: "Referral & Onboarding", module: "M05",
    surfaces: ["/api/v1/restaurants/referral-suggestions", "/api/v1/restaurants/onboarding", "/api/v1/restaurants/instagram"],
    keywords: ["referral", "onboarding", "instagram", "suggestion", "ghost"] },
  { id: "restaurants.identity", label: "Identity & Access Control", module: "shared",
    surfaces: ["/api/v1/auth/ops", "/api/v1/auth/password", "/api/v1/auth/otp", "/api/v1/auth/step-up"],
    keywords: ["auth", "jwt", "role", "permission", "otp", "step-up", "identity"] },
];

/* ── Caney Academy (planned-from-manifest; source:"manifest" ⇒ state:"needed") ──
 * From 08-surface-academy.md + lms-integration-plan.md. system:"academy".
 * Mapped to academy.* FN_MAP slugs (all → education). */
export const ACADEMY_DOMAINS = [
  { id: "academy.curriculum", label: "Curriculum Content Architecture",
    surfaces: ["PUT /courses/{slug}", "GET /courses/{slug}"],
    docs_ref: "vz-avitourism-curriculum/CURRICULUM.md" },
  { id: "academy.species-ref", label: "Species Reference & Quiz Bank",
    surfaces: ["GET /species", "GET /species/{id}", "POST /quizzes/generate", "GET /species/{id}/cards/pdf"],
    docs_ref: "vz-avitourism-curriculum/data/endemic-species-catalog.md" },
  { id: "academy.hotspots", label: "Regional Hotspots & Logistics",
    surfaces: ["GET /regions", "GET /regions/{slug}", "GET /hotspots/{region}", "POST /permits/lookup"],
    docs_ref: "vz-avitourism-curriculum/data/regional-hotspots.md" },
  { id: "academy.localization", label: "Localization & Bilingual Framework",
    surfaces: ["author_avitourism.py (i18n es/en)"],
    docs_ref: "modules/lms-integration-plan.md#7" },
  { id: "academy.assessment", label: "Assessment & Submissions",
    surfaces: ["POST /assessments/submit", "GET /assessments/{user_id}/portfolio"],
    docs_ref: "modules/lms-integration-plan.md#6" },
  { id: "academy.certification", label: "Certification (Blended)",
    surfaces: ["POST /certificates/request", "PUT /certificates/{id}/mentor-sign-off", "GET /certificates/{id}"],
    docs_ref: "modules/lms-integration-plan.md#6" },
  { id: "academy.enrollment", label: "Course Authoring & Enrollment",
    surfaces: ["POST /trails", "POST /courses (author script)"],
    docs_ref: "modules/lms-integration-plan.md#3" },
];

/** Bucket a path/route string into the best-matching domain by keyword hit. */
export function bucketByKeyword(text, domains) {
  const t = String(text).toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const d of domains) {
    let score = 0;
    for (const kw of d.keywords ?? []) {
      if (t.includes(kw)) score += kw.length; // longer keyword = stronger signal
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore > 0 ? best : null;
}
