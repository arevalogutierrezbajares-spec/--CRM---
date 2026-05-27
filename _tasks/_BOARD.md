# AGB CRM — Task Board

**Updated:** 2026-05-27
**Workflow:** [`_WORKFLOW.md`](./_WORKFLOW.md)
**Source of truth for ACs:** [`docs/requirements/FR-MATRIX.md`](../docs/requirements/FR-MATRIX.md)
**Tests:** 197 unit + 23 E2E smoke — `npx vitest run` + `env -u DATABASE_URL npx tsx scripts/smoke-all-tools.ts`
**Score:** ~9.0/10
**Hot path:** Text the WhatsApp bot in natural language; 20-tool agent loop routes through intent classifier → tool gating → Claude. Voice notes, images, links, vCards handled by media pipeline. Reminders + nudges crons proactively ping.

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
| **Wave D — WA Media** | **3** | **3** | **0** | **0** | **0** | **0** |
| **TOTAL** | **53** | **5** | **0** | **0** | **48** | **0** |

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

## Wave D — WA Media (2026-05-27)

Shipped Wave A (6 new CRM tools), Wave B (media pipeline), Wave C (197 unit tests + 23 E2E smoke).
Three items left to close the loop:

| ID | Title | Who | Pri | Pts | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-WA-001](TASK-AGB-WA-001-webhook-media-dispatcher.md) | Wire media dispatcher into webhook | Agent | P0 | 5 | open |
| [AGB-WA-002](TASK-AGB-WA-002-media-storage-setup.md) | Create agb-media bucket + env vars | **You** | P0 | 1 | open |
| [AGB-WA-003](TASK-AGB-WA-003-activity-admin-page.md) | /wa-activity admin page (cost tracking) | Agent | P1 | 3 | open |

**Do AGB-WA-002 first** (5 minutes, your action) — it unblocks AGB-WA-001.
Then claim AGB-WA-001 + AGB-WA-003 in the same agent session.

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
