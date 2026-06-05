# AGB CRM — Task Board

**Updated:** 2026-05-27 (late session)
**Workflow:** [`_WORKFLOW.md`](./_WORKFLOW.md)
**Source of truth for ACs:** [`docs/requirements/FR-MATRIX.md`](../docs/requirements/FR-MATRIX.md)
**Tests:** 202 unit + 23 E2E smoke + 18-scenario WA bench — `npx vitest run` + `env -u DATABASE_URL npx tsx scripts/smoke-all-tools.ts` + `env -u DATABASE_URL AGB_WA_DAILY_TOKEN_CAP=10000000 npx tsx scripts/bench-agent.ts`
**Score:** ~9.3/10 — login is invite-gated and live in prod; WA bot verified end-to-end on real phone; token diet shipped (-57% input tokens)
**Hot path:** Text the WA bot at the live Cloud number; 20-tool agent routes through regex intent classifier → dynamic tool gating (3 tools avg per call) → Haiku 4.5 for routine intents, Sonnet 4.6 for reasoning. Mention pre-resolver injects contact IDs + org + rel before the LLM, eliminating most second-turn lookups. Outbound send failures now write `error` rows to `wa_activity` so an expired WA token can't silently break the bot again.

**Index of this doc:** _What shipped this session_ → _At a glance_ → _Phase tables (0-7 + Wave D + Wave E)_ → _CoS-Bot Backlog_ (tactical polish) → _Brainstorm_ (strategic / multi-system, NOT committed: BR-1 RAG, BR-2 creator program, BR-3 partner portal, BR-4 in-CRM agent UI) → _Recommended pick-up order_

## What shipped this session (2026-05-27 late)

Out-of-band work past the 50-task plan. None of these have task IDs because
they were reactive to live testing/UX feedback, not scoped up front.

| Area | What | Where |
|------|------|-------|
| **Login UX** | X . JEAV . TIGR Caney landing replaces plain magic-link form. Full-bleed B/W tent photo; invisible hotspot over the book the man reads; cyan glowing cursor; 80-cell pixel-shatter on click; platform-native form rises behind blurred photo. | `app/login/caney-landing.tsx`, `app/login/page.tsx`, `public/caney.png` |
| **Invite-only auth** | Magic link now gated on existing `users.email`. Strangers get "not on the invite list" instead of a magic link. | `app/actions/auth.ts` (server action `requestSignInLink`) |
| **Vercel deploy** | Production live at `https://agb-crm.vercel.app`. Custom domain `x.vamosavenezuela.com` attached to project. `NEXT_PUBLIC_SITE_URL` set. Build green. | deploy `dpl_FkTYHMkXPGFLyTgC5Hc5KJn13BA8` |
| **Treasury client/server split** | `lib/fx.ts` (client-safe formatters) + `lib/fx.server.ts` (DB-touching `toUsdCents`/`setRate`). Fixes prod build error from postgres driver bundling into client component. | commit `e895fa3` |
| **WA bot, real end-to-end** | Tomas's WA phone wired to user record; ngrok tunnel verified; expired access token caught + replaced; outbound send failures now logged. Bot replies correctly from `/api/whatsapp/webhook`. | `app/api/whatsapp/webhook/route.ts` |
| **WA agent token diet** | Dynamic tool gating (per-intent allowedTools filter) + Haiku 4.5 routing for routine intents + mention pre-resolver carrying org/rel + supplement-per-turn fix. **Result: -57% input tokens, -64% Sonnet usage**, 17/18 intent accuracy, cleaner replies. | commits `1934914` + `6e4a930` + `9db8e9d` |
| **WA bench harness** | 18-scenario `scripts/bench-agent.ts` fires through `handleMessage()` directly (no real WA delivery), measures tokens + intent accuracy + reply quality. Reusable for any future agent-loop change. | `scripts/bench-agent.ts` |
| **Persona consistency** | Tomas's `whatsapp_persona` set so bot uses "Tomas" / "TG" consistently instead of cycling through "Top G" / "TIGER" / "Master Tomas". | DB row update |
| **Outbound observability** | Webhook now inspects `sendWhatsAppText` results and writes `direction='error'` `wa_activity` rows on any failure. Fixes the silent-failure mode where an expired token looked like "agent alive but no reply". | commit `9db8e9d` |
| **"Focus" intent** | "what should I focus on / what's next / my priorities" now classify as `todo_query` (was `unknown`). EN + ES patterns. 5 new unit tests. | `lib/wa-agent/intent/classify.ts` |

Test count: 197 → **202** (5 new todo_query priority phrasings). All passing.

## At a glance

| Phase | Tasks | Open | Claimed | In Progress | Review | Merged |
|-------|-------|------|---------|-------------|--------|--------|
| Phase 0 — Foundation | 2 | 2 | 0 | 0 | 0 | 0* |
| Phase 1 — Deals as Projects | 12 | 0 | 0 | 0 | 12 | 0 |
| Phase 2 — Platform & Surfaces | 8 | 0 | 0 | 0 | 9* | 0 |
| Phase 3 — Capture | 10 | 0 | 0 | 0 | 10 | 0 |
| Phase 4 — Active Brain | 8 | 0 | 0 | 0 | 8 | 0 |
| Phase 5 — Network Graph | 2 | 0 | 0 | 0 | 2 | 0 |
| Phase 6 — SHOULDs | 7 | 0 | 0 | 0 | 7 | 0 |
| Phase 7 — COULDs / v1.5 | 1 | 0 | 0 | 0 | 1 | 0 |
| **Wave D — WA Media** | **4** | **4** | **0** | **0** | **0** | **0** |
| **Wave E — Domain Launch** | **3** | **3** | **0** | **0** | **0** | **0** |
| **TOTAL** | **57** | **9** | **0** | **0** | **48** | **0** |

(*Phase 2 row count is 9 because AGB-108 group-by is delivered as part of the
grid framework alongside AGB-100..107. The 2 remaining `open` items are
AGB-000A and AGB-000B — both require user action that the agent can't
autonomously complete.)

## Hardening pass (2026-05-26 batch 7) — out-of-band

These items aren't on the 50-task board but materially raised the
production-readiness score from 5/10 → 8.5/10.

| Slug | What | Where |
|------|------|-------|
| TEST-INFRA | Vitest + Playwright wired; `pnpm test:db` spins local Postgres 18; `pnpm test:integration` runs 21 integration tests against real schema + seed | `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, `scripts/test-db.sh` |
| TEST-UNIT | 69 unit tests covering health, grid-state, csv, whatsapp parser, validation, silence rules, utils, recorder | `__tests__/unit/*.test.ts` |
| TEST-INT | 21 integration tests: contacts, projects+template instantiation, touches, brain re-intro w/ mocked Anthropic, Postmark + WhatsApp webhooks w/ real DB side-effect assertions | `__tests__/integration/*.test.ts` |
| TEST-E2E | 12 e2e tests across desktop+mobile: nav, contact form, grid state, saved views, mobile drawer | `__tests__/e2e/*.spec.ts` |
| UX-BTN-LOADING | `<Button loading>` variant with spinner; 4 forms refactored | `components/ui/button.tsx` |
| UX-STICKY-FORMS | Cancel/Save row pins to viewport bottom on `<sm` | 3 form components |
| UX-DARK-MODE | `<ThemeProvider>` light/dark/system + no-flash inline script + 3-button toggle in user menu | `components/theme/theme-provider.tsx`, `app/layout.tsx`, `components/layout/user-menu.tsx` |
| OBS-INSTRUMENT | `lib/instrument.ts` — Sentry-compatible `captureError` / `withErrorCapture`; wired into 4 webhook+cron routes; degrades to structured `console.error` when `SENTRY_DSN` missing | `lib/instrument.ts` + 4 route files |
| OPS-VERIFY | `pnpm verify` walks all 9 env-gated surfaces and reports `active / paused / broken` with one-line diagnostics | `scripts/verify.ts` |
| DX-COFOUNDER-DOC | `docs/GETTING-STARTED.md` — install, env vars, schema seed, first sign-in, 5 day-one workflows, graceful-degradation behavior | `docs/GETTING-STARTED.md` |
| UX-CRITIQUE | End-to-end UX audit doc with 12 P0/P1 fixes implemented + 24 screenshots referenced | `docs/UX-REVIEW-2026-05-26.md` |

Bugs caught by the test pass (and fixed):
- `lib/grid-state.ts` — descending sort moved nulls to the top instead of the bottom
- `lib/recorder.ts` — `typeof window` guard prevented the function from working in any test env
- `lib/whatsapp.ts` — `parseCommand()` was collapsing newlines in the body
- `components/grid/saved-views.tsx` — `e.preventDefault()` on Save menu item left the dropdown trapped open after the dialog closed
- `components/layout/mobile-nav.tsx` — drawer didn't toggle `aria-modal` / `aria-hidden` / `inert` based on open state

**2026-05-26 autonomous build (OVL-AGB-Claude) — three batches:**

*Batch 1 — Phase 1:* AGB-010, AGB-011, AGB-001, AGB-002, AGB-003, AGB-005, AGB-006,
AGB-007, AGB-008, AGB-012 wired end-to-end. App shell + Contact CRUD + Project CRUD
with template instantiation + Milestone CRUD + Touch capture + Tag mgmt + Profile.

*Batch 2 — Phase 2:* AGB-100 Kanban (per-template, click-to-advance via
`advanceProjectStage` action), AGB-101 health computation (`lib/health.ts`,
green/amber/red from milestones + waiting state), AGB-102 waiting-on surface
(banner on project detail + filterable in grid), AGB-103 This-Week landing
(Due/Blocked/Stale buckets), AGB-104/105 contact + project grids,
AGB-106 multi-filter (URL-stateful `?filter=col=val;`), AGB-107 saved views
(localStorage), AGB-108 group-by + counts. Open: none in Phase 2 work batch — see
Open Items below.

*Batch 3 — Phase 3 scaffolds:* AGB-300 voice memo capture
(`/api/voice/transcribe` + `<VoiceRecorder>`, OpenAI Whisper), AGB-303 Postmark
inbound (`/api/postmark/inbound`, contact matching by email + domain),
AGB-304/305 WhatsApp webhook (`/api/whatsapp/webhook` with `/log /find /help /note`
command parser + send helper), AGB-306 low-conf transcription flag (TouchList
badge), AGB-307/308/309 Obsidian sync CLI (`pnpm obsidian:sync`, last-write-wins,
kill switch via `OBSIDIAN_SYNC_DISABLED=1`). All env-gated — activate when keys/
addresses land.

Open in Phase 1: AGB-004 (RLS — needs applied schema), AGB-009 (Meetings).
Open in Phase 2: none specific to Phase 2 — AGB-107 done via localStorage,
                 AGB-108 done via group-by.
Open in Phase 3: AGB-301 batch encounter (depends Meetings), AGB-302 30-sec
                 contact-on-the-fly (depends voice + Meetings).

Build: 21 routes, `next build` green, `tsc --noEmit` green.

*Batch 4 — AGB-009 + Phase 4-5 + RLS:* AGB-009 Meetings CRUD with attendee
multiselect, batch-encounter on save (AGB-301 unblocked), `[ ]` action-item
parser → Milestones on save and via a "Spawn N milestones" button on the
meeting detail page. AGB-500/501 Network forest with intro chain pruning +
Friend/All lens. AGB-400 daily watchdog cron route (`/api/cron/watchdogs`)
that summarizes overdue+stale and pings WhatsApp if configured. AGB-402
weekly briefing cron (`/api/cron/weekly-briefing`) — Claude-drafted +
Resend-sent. AGB-403 re-intro generator with UI button on contact detail
(Claude or deterministic fallback). AGB-401 post-meeting card draft.
AGB-404 conversation rolling summary. AGB-405 pre-meeting card stub
endpoint (501 until calendar integration). AGB-406 silence rules
(`lib/silence-rules.ts` with `personal-only` tag + kill switch +
quiet-hours). AGB-407 "Not useful" feedback (`/api/brain/feedback`
appending JSONL). AGB-004 RLS policies as a ready-to-apply
`supabase/migrations/20260526120000_rls_owner_policies.sql`.

Open: AGB-302 30-sec contact-on-the-fly (UX polish over the voice memo flow
that creates a Contact + initial Touch from a single recording), AGB-000A
(your Supabase wiring step), AGB-000B (cofounder account).

Build: 29 routes, `next build` green, `tsc --noEmit` green.

*Phase 0 scaffold (commits b3139da + cbfb3fa) shipped before the Overlord board existed — Phase 0 closeout tasks AGB-000-* track the remaining manual steps.

## Phase 0 — Foundation (closeout)

| ID | Title | Pri | Pts | FRs | Owner | Status |
|----|-------|-----|-----|-----|-------|--------|
| [AGB-000A](TASK-AGB-000A-apply-schema-and-seed.md) | Apply schema + seed to Supabase | P0 | 1 | FR-TEAM-1 | — | open |
| [AGB-000B](TASK-AGB-000B-cofounder-account.md) | Capture cofounder identity + create account | P1 | 2 | FR-TEAM-1 | — | open |

## Phase 1 — Deals as Projects (current focus)

| ID | Title | Pri | Pts | FRs | Owner | Status |
|----|-------|-----|-----|-----|-------|--------|
| [AGB-001](TASK-AGB-001-contact-crud.md) | Contact CRUD (form, list, server actions) | P0 | 5 | FR-CON-1/2/3/5/7, FR-CAP-5 | OVL-AGB-Claude | review |
| [AGB-002](TASK-AGB-002-project-crud-templates.md) | Project CRUD + template instantiation | P0 | 8 | FR-PRJ-1/2/3/4/7 | OVL-AGB-Claude | review |
| [AGB-003](TASK-AGB-003-tag-system-pill-bar.md) | Tag system + venture pill bar | P0 | 3 | FR-WSP-1/2/3, FR-CON-3 | OVL-AGB-Claude | review |
| [AGB-004](TASK-AGB-004-owner-field-rls.md) | Owner field on Contact + Project + RLS basics | P0 | 3 | FR-TEAM-1/2, NFR-SEC-1 | OVL-AGB-Claude | review (SQL ready in supabase/migrations/) |
| [AGB-005](TASK-AGB-005-contact-detail-page.md) | Contact detail page (touches + projects + intro chain) | P1 | 5 | FR-CON-6, FR-MTG-6 | OVL-AGB-Claude | review |
| [AGB-006](TASK-AGB-006-project-detail-page.md) | Project detail page (milestones + touches + meetings) | P1 | 5 | FR-PRJ-1, FR-MTG-6 | OVL-AGB-Claude | review |
| [AGB-007](TASK-AGB-007-milestone-crud.md) | Milestone CRUD on Projects | P0 | 3 | FR-PRJ-3 | OVL-AGB-Claude | review |
| [AGB-008](TASK-AGB-008-touch-entity-basic.md) | Touch entity manual create + list | P0 | 3 | FR-CAP-5 (Touch) | OVL-AGB-Claude | review |
| [AGB-009](TASK-AGB-009-meetings-mtg.md) | Meeting CRUD + Action Items → Milestones | P1 | 5 | FR-MTG-1/2/3/6 | OVL-AGB-Claude | review |
| [AGB-010](TASK-AGB-010-shadcn-base.md) | Install shadcn/ui base + theme | P0 | 2 | (UI prereq) | OVL-AGB-Claude | review |
| [AGB-011](TASK-AGB-011-layout-nav.md) | Root layout + nav + sign-out | P0 | 2 | (UI prereq) | OVL-AGB-Claude | review |
| [AGB-012](TASK-AGB-012-founder-profile.md) | Founder profile page (timezone, display name) | P1 | 2 | FR-TEAM-1 | OVL-AGB-Claude | review |

**Phase 1 total:** 46 pts (~ 2-3 weeks of focused 2-person work)

## Phase 2 — Platform & Surfaces

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-100](TASK-AGB-100-pipeline-kanban.md) | Pipeline Kanban surface | P0 | 8 | FR-PRJ-5 | review |
| [AGB-101](TASK-AGB-101-project-health-color.md) | Project health color computation | P0 | 5 | FR-PRJ-6 | review |
| [AGB-102](TASK-AGB-102-waiting-on-ui.md) | Waiting-on UI + expected unblock | P1 | 2 | FR-PRJ-7 | review |
| [AGB-103](TASK-AGB-103-this-week-landing.md) | This-Week landing (Due/Blocked/Stale) | P0 | 5 | FR-BRN-3 | review |
| [AGB-104](TASK-AGB-104-contact-grid.md) | Contact grid + sort | P0 | 5 | FR-GRD-1/5 | review |
| [AGB-105](TASK-AGB-105-project-grid.md) | Project grid + sort | P0 | 5 | FR-GRD-2/5 | review |
| [AGB-106](TASK-AGB-106-multi-filter.md) | Multi-filter for grids | P0 | 5 | FR-GRD-3 | review |
| [AGB-107](TASK-AGB-107-saved-views.md) | Saved views (per Founder + share) | P1 | 3 | FR-GRD-4 | review (localStorage; share is a follow-up) |
| [AGB-108](TASK-AGB-108-group-by.md) | Group-by + counts | P1 | 3 | FR-GRD-6 | review |

## Phase 3 — Capture (NEEDS deferred inputs)

| ID | Title | Pri | Pts | FRs | Status | Blocker |
|----|-------|-----|-----|-----|--------|---------|
| [AGB-300](TASK-AGB-300-voice-memo-capture.md) | Voice memo capture (Whisper) | P0 | 5 | FR-CAP-1 | review | activates with `OPENAI_API_KEY` |
| [AGB-301](TASK-AGB-301-batch-encounter.md) | Batch encounter capture | P1 | 3 | FR-MTG-5 | review | wired into meeting create (one Touch per attendee) |
| [AGB-302](TASK-AGB-302-30sec-contact-voice.md) | 30-sec Contact-on-the-fly | P1 | 5 | FR-MTG-7 | review | `/contacts/quick` + `/api/voice/quick-contact`; Whisper → Claude extract → Contact + first Touch |
| [AGB-303](TASK-AGB-303-email-intake.md) | Email-forward intake (Postmark) | P0 | 5 | FR-CAP-2 | review | activates with `POSTMARK_INBOUND_SECRET` + `AGB_INBOUND_OWNER_USER_ID` |
| [AGB-304](TASK-AGB-304-whatsapp-bot.md) | WhatsApp bot commands | P0 | 8 | FR-CAP-3 | review | activates with `WA_*` env vars |
| [AGB-305](TASK-AGB-305-whatsapp-push.md) | WhatsApp proactive push | P1 | 3 | FR-CAP-4 | review | `sendWhatsAppText()` helper ready |
| [AGB-306](TASK-AGB-306-low-conf-flag.md) | Low-confidence transcription flag | P1 | 2 | FR-CAP-6 | review | inline marker + UI badge |
| [AGB-307](TASK-AGB-307-obsidian-sync.md) | Obsidian markdown + YAML sync | P0 | 8 | FR-OBS-1/2 | review | activates with `OBSIDIAN_VAULT` + `OBSIDIAN_OWNER_USER_ID` |
| [AGB-308](TASK-AGB-308-obsidian-conflict.md) | Obsidian last-write-wins per field | P0 | 5 | FR-OBS-3 | review | mtime-compared upsert in sync script |
| [AGB-309](TASK-AGB-309-obsidian-kill.md) | Obsidian sync kill switch | P1 | 1 | FR-OBS-4 | review | `OBSIDIAN_SYNC_DISABLED=1` |

## Phase 4 — Active Brain (LLM)

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-400](TASK-AGB-400-watchdogs.md) | Stale + blocker-overdue watchdogs | P0 | 5 | FR-BRN-1/2 | review (`/api/cron/watchdogs`, daily) |
| [AGB-401](TASK-AGB-401-post-meeting-card.md) | Post-Meeting Card prompt | P1 | 3 | FR-MTG-4 | review (`postMeetingDraft`) |
| [AGB-402](TASK-AGB-402-weekly-briefing.md) | Weekly Briefing generator + email | P0 | 8 | FR-BRN-4 | review (`/api/cron/weekly-briefing`, MON) |
| [AGB-403](TASK-AGB-403-reintro-generator.md) | Re-Intro Generator + UI | P0 | 5 | FR-BRN-5/8 | review (button on contact detail) |
| [AGB-404](TASK-AGB-404-conversation-memory.md) | Conversation Memory rolling summary | P0 | 5 | FR-BRN-6 | review (`conversationSummary`) |
| [AGB-405](TASK-AGB-405-pre-meeting-card.md) | Pre-Meeting Card via calendar | P1 | 5 | FR-BRN-7 | review (endpoint stub, awaits Cal integration) |
| [AGB-406](TASK-AGB-406-silence-rules.md) | Silence rules enforcement | P0 | 3 | FR-BRN-9 | review (`lib/silence-rules.ts`) |
| [AGB-407](TASK-AGB-407-not-useful-feedback.md) | "Not useful" feedback button | P1 | 2 | FR-BRN-10 | review (`/api/brain/feedback` JSONL log) |

## Phase 5 — Network Graph

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-500](TASK-AGB-500-intro-chain-view.md) | Intro chain tree view | P0 | 5 | FR-NET-1 | review |
| [AGB-501](TASK-AGB-501-network-lens-toggle.md) | Friend / All lens toggle | P0 | 3 | FR-NET-2 | review |

## Phase 6 — SHOULDs (post-v1)

| ID | Title | Pts | FRs | Status |
|----|-------|-----|-----|--------|
| AGB-201 | Owner-by-default for unassigned milestones | 2 | FR-PRJ-8 | review (template `default_owner=cofounder` falls back to current user pre-AGB-000B; `reassignMilestone` action available) |
| AGB-202 | Restaurant template | 2 | FR-PRJ-9 | review (`restaurant-discovery` added to `db/seed.ts`) |
| AGB-203 | CSV export | 3 | FR-GRD-7 | review (`/api/export/contacts`, `/api/export/projects` + `<ExportButton>` on both grids; respects current URL filter/sort/group state) |
| AGB-204 | Warm-Path Finder | 8 | FR-NET-3 | review (`findWarmPath` via intro-chain walk + `<WarmPath>` on contact detail) |
| AGB-205 | Reciprocity Ledger | 5 | FR-NET-4 | review (`reciprocityFor` + `<ReciprocityCard>` on contact detail; heuristic until `touches.direction` lands) |
| AGB-206 | Density heatmap | 5 | FR-NET-5 | review (`touchDensity` + `<Heatmap>` on This-Week) |
| AGB-207 | Owner filter on grids | 1 | FR-TEAM-3 | review (`db/queries/users.ts` foundation; degenerate single-user filter until AGB-000B cofounder account) |

## Phase 7 — COULDs / v1.5

| ID | Title | Pts | FRs | Status |
|----|-------|-----|-----|--------|
| AGB-700 | Inbound-Triage AI | 8 | FR-BRN-11 | review (`lib/inbound-triage.ts` wired into Postmark handler; verdicts log to `INBOUND_TRIAGE_LOG_PATH` JSONL) |

---

## Wave E — Domain Launch (2026-05-27)

Login page rebranded to **X . JEAV . TIGR**. **Production deploy is LIVE** at
https://agb-crm.vercel.app/login with invite-only auth gating, real Caney
photo, working pixel-shatter reveal, holographic→platform-native form. The
custom domain `x.vamosavenezuela.com` is attached to the Vercel project and
`NEXT_PUBLIC_SITE_URL` is set. Two manual steps remain to flip the custom
domain live + one agent verification:

| ID | Title | Who | Pri | Pts | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-DOM-001](TASK-AGB-DOM-001-godaddy-dns-record.md) | Add A record at GoDaddy (`x` → `76.76.21.21`) | **You** | P0 | 1 | open |
| [AGB-DOM-002](TASK-AGB-DOM-002-supabase-redirect-url.md) | Whitelist callback URL in Supabase Auth | **You** | P0 | 1 | open |
| [AGB-DOM-003](TASK-AGB-DOM-003-e2e-verify-domain.md) | E2E verify the live login flow | Agent | P0 | 2 | open (blocked) |

**Order:** AGB-DOM-001 + AGB-DOM-002 can be done in parallel (~5 min combined).
DNS propagation takes 5–30 min. Then AGB-DOM-003 unblocks for the agent to run.

**Already done (no task ID — done in-session):**
- ✅ Login rebrand (X . JEAV . TIGR with Caney landing + shatter reveal)
- ✅ Invite-only gating (allowlist against `users.email`)
- ✅ Vercel domain attached (`x.vamosavenezuela.com` → `agb-crm` project)
- ✅ Production deploy green (after fixing treasury client/server bundle split)
- ✅ `NEXT_PUBLIC_SITE_URL=https://x.vamosavenezuela.com` in production env

---

## Wave D — WA Media (2026-05-27)

Shipped Wave A (6 new CRM tools), Wave B (media pipeline scaffolds in
`lib/wa-agent/media/`), Wave C (202 unit tests + 23 E2E smoke + 18-scenario
bench). Three items left to close the media loop:

| ID | Title | Who | Pri | Pts | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-WA-001](TASK-AGB-WA-001-webhook-media-dispatcher.md) | Wire media dispatcher into webhook | Agent | P0 | 5 | open |
| [AGB-WA-002](TASK-AGB-WA-002-media-storage-setup.md) | Create agb-media bucket + env vars | **You** | P0 | 1 | open |
| [AGB-WA-003](TASK-AGB-WA-003-activity-admin-page.md) | /wa-activity admin page (cost tracking) | Agent | P1 | 3 | open |
| [AGB-WA-004](TASK-AGB-WA-004-ai-tech-spend-dashboard.md) | Show AI + tech spend on dashboard + treasury link | You | P1 | 3 | open |

**Do AGB-WA-002 first** (5 minutes, your action) — it unblocks AGB-WA-001.
Then claim AGB-WA-001 + AGB-WA-003 in the same agent session.

**Done in-session (no separate task ID needed):**
- ✅ Outbound silent-send failure observability (done inline in commit `9db8e9d`)
- ✅ Bot persona consistency (Tomas/TG instead of nickname jumble)
- ✅ "focus / priorities" intent classification
- ✅ Token diet (Sonnet at the limit went from ~7,800 → ~2,800 tokens/msg)

---

## CoS-Bot Backlog (low priority — only invest when you hit them)

Identified during bench review. None are blocking; all are quality-of-life
or cost-of-life polish on top of an already-working bot.

| Idea | Trigger | Effort |
|------|---------|--------|
| Proactive context after writes (e.g. "you haven't touched X in 14d — set a reminder?") | When you start missing nudges you should be getting | 2pt |
| Multi-contact log_touch ("talked to marcos AND anabella") | If group meetings become common | 1pt |
| "All clear" reply when nothing is overdue (instead of empty list) | Polish; only worth it if you regularly ask when there are zero items | 1pt |
| Conversation summarization when history > 10 turns | Only matters for very long single sessions | 2pt |
| Prompt caching (Anthropic ephemeral cache) | When system+tools naturally grow ≥ 1024 tokens for Sonnet (currently below threshold) | 3pt |
| Smart create-on-the-fly with project tagging | If you regularly add contacts via touch with implied project context | 2pt |
| Daily digest as proactive WA push (not just on-demand) | When the daily nudge cron isn't quite hitting the mark | 2pt |

---

## Brainstorm — strategic / multi-system ideas (NOT committed)

These are larger ideas worth shaping before they get a task ID. Each is
cross-system (touches AGB-CRM + at least one other project/repo) and needs
a scoping conversation before implementation. Listed here so they don't get
lost between sessions.

### BR-1 — RAG knowledge base for VAV + workspace data

**What:** Retrieval-augmented generation layer that lets the WA bot (and
eventually VAV's own surfaces) answer questions grounded in actual content,
not just structured CRM rows.

**Corpus candidates (need to decide which):**
- VAV/Venezuela tourism content (posadas, routes, regions, regs, safety
  bulletins) — currently lives across `--TOURISM--`, `VZ_Tourism_Project`,
  `caneycloud-restaurant`, and assorted PDFs/markdown
- Workspace memory: full text of touches + meeting minutes + obsidian notes
  (richer than what `contact_summary` returns today)
- Creator briefs / past campaign docs from the VAV creator program
- Public knowledge: SENIAT regs, Venezuelan tourism stats, OFAC compliance

**Where the bot fits:**
- New tool: `search_knowledge(query, corpus?)` returning ranked chunks with
  citations
- Augment `contact_summary` / `meeting_brief` to pull semantic matches in
  addition to the structured DB rows
- Enable questions like "what did Anabella say about Margarita logistics
  last month?" — currently the bot can list touches but can't search them
  semantically

**Open questions:**
- Vector store: pgvector in our existing Supabase (cheapest) vs a managed
  service (Pinecone/Turbopuffer)? Supabase is already the data plane.
- Embedding model: Voyage-3 (best for retrieval) vs OpenAI's text-embedding-3
  (cheaper, already have key)? Cost difference is meaningful at scale.
- Ingestion: one-time bulk vs continuous (every new touch indexed
  automatically vs nightly batch)?
- Scope: just AGB workspace data first, or include VAV public corpus?
- Shared with VAV repo: same Supabase project + table, or separate vector
  DB that both apps query?

**Why now signals:** When someone asks "remember what we discussed about X"
and the bot can only list touches without surfacing the actual content,
that friction will compound as the touch log grows.

---

### BR-2 — Creator / affiliate structure

**What:** Data model + operational tooling to manage the VAV creator program
end-to-end (and any affiliate/referral program that grows out of it).

**The current state:** AGB-CRM has a `vav-creator-campaign` pipeline template
(seeded in `db/seed.ts`) with 10 stages from outreach → paid out. But there's
no first-class concept of a "creator" entity — they're just contacts with a
tag, and campaigns are projects. Payouts, deliverables, performance tracking
all live in someone's head.

**Possible scope:**
- **Creator entity**: extends Contact with creator-specific fields (handles,
  followers, niche, rate sheet, contract terms, prior campaigns, payout
  preferences)
- **Campaign entity**: deliverables (counts/types), budget, dates, status,
  metrics (reach/clicks/conversions), payout state
- **Affiliate codes**: unique short codes / referral URLs per creator,
  tracked back to bookings/leads
- **Reconciliation flow**: from "content posted" → "engagement reviewed" →
  "paid out", with a real ledger
- **Discovery surface**: which creators match an upcoming trip type? Filter
  by niche + recent performance + availability

**Open questions:**
- Lives in AGB-CRM or in VAV repo? CRM is BD-flavored, VAV is consumer-
  flavored — creator program straddles both. Could live in CRM if AGB is
  the BD source-of-truth and VAV reads via API.
- Affiliate link tracking: do we build redirect+tracking, or pipe through
  an existing service (Rewardful, Tapfiliate, Tolt)?
- Payouts: track in CRM (treasury module just shipped) or route through a
  third party (Tipalti, Wise Bulk)?
- Connection to existing 10-stage pipeline — extend or replace?

**Why now signals:** Once you start running more than ~3 creator campaigns
in parallel, the spreadsheet-in-head approach breaks. Multi-campaign
attribution and payout reconciliation are the first things to fall over.

---

### BR-3 — Partner Portal + document-share tracking

**What:** External-facing portal where partners (posada owners, VAV creators,
BD clients, contract counterparties) log in to see *their own slice* of the
CRM — content/functionality decided by the admin on a per-contact basis,
controlled from the Customers/Contacts surface. Plus a substrate for
tracking which documents have been shared with whom (independent of whether
the full portal exists yet).

**The 2-stage scoping (do them in this order):**

#### Stage 1 — document-share tracking (no portal yet, ~3-5pt)
Internal feature, ships fast, captures the immediate pain. New tables:
- `documents` — file blob (Supabase Storage path) or external link, title,
  uploaded_by, uploaded_at, mime_type, doc_type (NDA / contract / brief /
  deck / spec / other)
- `document_shares` — `(document_id, contact_id, shared_by, shared_at,
  channel='email'|'whatsapp'|'link', message_id?, revoked_at?, viewed_at?)`

UI: on a contact detail page, a "Shared with this contact" panel listing
every document, when it was sent, the channel, and (if we can track it)
when they opened/downloaded. New WA agent tool: `share_document(contact_id,
doc_id, channel)` so the bot can ship a doc + log the share in one step.

This alone is valuable even without the portal — it kills the "did I send
Anabella the deck?" mental ledger.

#### Stage 2 — partner portal (8-13pt depending on auth model)
External login at e.g. `partners.agbox.com` or a `/portal` route. Each
partner sees only what their contact record has been configured to expose.

**Per-contact config (set by you from Contacts tab):**
- `portal_enabled: boolean` — gates everything
- `portal_surfaces: string[]` — which sections they see, e.g.:
  - `documents` — list of docs you've shared with them
  - `project_status` — milestones for projects where they're a stakeholder
  - `meetings` — past meetings + minutes they attended
  - `payments` — invoices/payouts (ties into treasury)
  - `messages` — async thread for back-and-forth
- `portal_welcome_message` — custom intro shown on their landing
- Optional: `portal_branding` — different sub-brand per audience type
  (creators see VAV branding, posada owners see CaneyCloud)

**Auth model — needs a call:**
- **Magic link to email-on-file** — cheap, reuses Supabase Auth, but partners
  don't get a password they can remember
- **One-time signed tokens** — each share-event includes a unique URL token,
  no persistent login. Good for one-off doc handoffs, bad for ongoing portal
- **Full account with password** — partners self-register, you approve.
  Most "portal-like" but most overhead.

**Open questions:**
- "Customers tab" — does this exist today or are we adding it? Today the
  CRM has a generic Contacts table with `relationship_type: friend/lead/
  partner/prospect`. "Customers" could be a filtered Contacts view OR a
  new top-level entity (recommend filtered view to start).
- Multi-tenant data isolation: same Supabase project, partner-portal queries
  ride on new RLS policies keyed off the auth.users.id ↔ contact_id link.
- One portal per workspace, or one global portal that detects which
  workspace each partner belongs to? (Important once you have multiple AGB
  workspaces — today you don't.)
- File storage: same `agb-media` bucket as voice notes (Wave D), or a
  separate `agb-docs` bucket for sharing semantics?
- View tracking: is "viewed_at" tied to portal access, document download,
  or both? Compliance question if any of these are contracts.

**Natural overlap with other brainstorm items:**
- **BR-2 (creator/affiliate structure)** — creators ARE partners; their
  portal surface is mostly Stage-2 with creator-specific tabs (deliverable
  checklist, payout history, affiliate stats). Either build BR-3 first and
  let creators be one configuration of it, or vice versa.
- **BR-1 (RAG)** — partners could ask the bot "what did we agree on for
  Q3?" and get answers from THEIR slice of the corpus. The RAG layer would
  need contact-scoped retrieval.

**Why now signals:**
- "Did I send X the Y document?" being a recurring question in your head
- A creator/posada owner asking "where do I see my campaign status / payout
  history?" and you not having a clean answer
- A counterparty asking for a paper trail of what was shared when

**Smallest valuable slice to ship first:** Stage 1, with just `documents`
+ `document_shares` + the contact-detail panel. No portal, no auth changes,
no new permissions model. Tests the demand without committing to the
external-portal complexity.

---

### BR-4 — In-CRM Agent UI (text + voice chat panel using the WA agent loop)

**What:** A chat-style panel inside the CRM web app where you can type or
speak the same things you'd text the WhatsApp bot — "what should I focus on
today", "logged a call with Anabella", "remind me Friday to send Oscar the
deck" — and get the same answers, but without needing to open WhatsApp on
your phone.

**Why this is small:** The entire agent loop already exists in
`lib/wa-agent/`. The WhatsApp transport is one input source; this just adds
a second one. We don't need new tools, new classifier, new architecture —
we need an HTTP entry point + a UI.

**The reuse map:**

| Component | Status | What changes for web |
|-----------|--------|-----|
| `handleMessage()` in `lib/wa-agent/loop.ts` | Reuse | Needs a "sender" that isn't a phone — derive from session user instead |
| `classifyIntent()` | Reuse as-is | No change |
| `WORKFLOWS` registry | Reuse as-is | No change |
| `TOOL_DEFINITIONS` (all 20) | Reuse as-is | No change |
| `wa_conversations` state table | Reuse with new sender key format | Web sessions stored with `senderPhone = "web:<userId>"` so they don't collide with WA threads |
| `wa_activity` audit | Reuse with `source` discriminator | Add `source: 'web' \| 'whatsapp'` to the payload |
| Outbound — `sendWhatsAppText` | Skip | Web replies render directly in the chat UI |
| Voice ingestion (Wave B `transcribe.ts`) | Already coded | Just wire to a new browser MediaRecorder upload |

#### Smallest valuable slice (Stage 1)

1. New page `app/(app)/agent/page.tsx` — chat-style UI: scrollable message
   list, text input at the bottom, send button. Mobile-responsive.
2. Server action `requestAgentTurn(text)` in `app/actions/agent.ts` that:
   - Resolves session user via `getCurrentUser()`
   - Calls a web-flavor of `handleMessage` (extract a `handleMessageForUser({ userId, workspaceId, body })` shared core)
   - Returns the reply + tool calls + token usage
3. Reply bubble rendered with the same persona consistency the WA bot got.
4. Conversation history persisted in `wa_conversations` under
   `senderPhone = "web:<userId>"` so the web thread is per-user but
   distinct from WhatsApp.
5. Same workspace + tool gating + intent classifier — zero change.

Total scope: ~3-5pt, half a day of work.

#### Stage 2 — voice input

- Browser MediaRecorder records on press-and-hold, uploads webm/opus to
  `POST /api/agent/transcribe`
- Server-side: `transcribeVoice(buffer)` from `lib/wa-agent/media/transcribe.ts`
  (already coded — uses OpenAI Whisper, handles EN + ES)
- Transcript is shown as the user's chat bubble, then fired through the
  same `requestAgentTurn(text)` path
- Same "I heard: '…' — " confirmation gate pattern as WhatsApp voice notes

Stage 2 ships ~1-2pt on top of Stage 1.

#### Stage 3 — UX polish

- Threading: shift+enter for newline, enter to send
- Token + cost meter in a corner so you can see usage in real time
- "Clear conversation" button → wipes the `wa_conversations` row for the
  web sender, fresh start without affecting WhatsApp
- Streaming replies (Anthropic streaming API) so long replies feel snappy
- Optional: split view — chat on the right, the contact/project the agent
  just touched on the left

Stage 3 is incremental; don't block Stage 1 on it.

#### Open questions

- **Single conversation across WA + web, or separate?** Recommendation:
  **separate** (using `web:<userId>` sender key). The two transports have
  different latency expectations; mixing them creates "wait, did I tell
  the bot that in WhatsApp or in the web?" confusion. Keeps the WA bench
  results regression-safe too.
- **Voice in Stage 1 or Stage 2?** Recommendation: **Stage 2**. Voice
  needs MediaRecorder + Whisper plumbing + a record-button UX; text-only
  validates the loop in an afternoon.
- **Mobile?** The CRM is already responsive. The agent panel should be
  too — many real uses ("just got off a call with…") happen on the phone
  with the CRM open in mobile Safari. Stage 1 should test this.
- **Rate limit shared with WA?** Same `wa_activity` token budget applies
  per workspace. Probably fine; if web traffic spikes it'll cut into your
  WA budget, but that's a single workspace-level limit anyway.

#### What I need from you to start

Just a yes/no on Stage 1 scope. If you want me to start now, I can have
the chat page + server action + reply rendering live on localhost in ~30
minutes. Voice in another ~20 minutes after that.

---

### How to use this section

When one of these starts feeling urgent: turn it into a proper task file
(`TASK-AGB-BR-1-rag-knowledge-base.md`), pick the smallest valuable slice
(e.g., "index this week's touches into pgvector + add `search_touches`
tool"), write ACs, claim it. Don't try to build the full vision in one go.

---

## Recommended pick-up order for tomorrow

If your cofounder is picking up cold, the suggested first claims:

1. **AGB-010** (shadcn install, 2pts) — prereq for any UI work
2. **AGB-011** (root layout + nav, 2pts) — prereq for navigation
3. **AGB-004** (owner field + RLS, 3pts) — security foundation
4. **AGB-001** (Contact CRUD, 5pts) — first real feature

After those 4 land, AGB-002 / AGB-003 / AGB-007 / AGB-009 open up in parallel.

## Critical path for Phase 1 → Phase 2

```
AGB-010 (shadcn)
   ↓
AGB-011 (layout)
   ↓
AGB-003 (tag system) ─┐
AGB-004 (RLS)         ├→ AGB-001 (Contact CRUD)
                      │     ↓
                      └→ AGB-002 (Project CRUD) ─┐
                            ↓                    │
                         AGB-007 (Milestones)    │
                            ↓                    │
                         AGB-009 (Meetings)      │
                                                 ↓
                                       AGB-005/006 (detail pages)
                                                 ↓
                                       Phase 2 grids/kanban/this-week
```
