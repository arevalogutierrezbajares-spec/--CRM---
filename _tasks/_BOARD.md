# AGB CRM — Task Board

**Updated:** 2026-05-26
**Workflow:** [`_WORKFLOW.md`](./_WORKFLOW.md)
**Source of truth for ACs:** [`docs/requirements/FR-MATRIX.md`](../docs/requirements/FR-MATRIX.md)

## At a glance

| Phase | Tasks | Open | Claimed | In Progress | Review | Merged |
|-------|-------|------|---------|-------------|--------|--------|
| Phase 0 — Foundation | 2 | 2 | 0 | 0 | 0 | 0* |
| Phase 1 — Deals as Projects | 12 | 12 | 0 | 0 | 0 | 0 |
| Phase 2 — Platform & Surfaces | 8 | 8 | 0 | 0 | 0 | 0 |
| Phase 3 — Capture | 10 | 10 | 0 | 0 | 0 | 0 |
| Phase 4 — Active Brain | 8 | 8 | 0 | 0 | 0 | 0 |
| Phase 5 — Network Graph | 2 | 2 | 0 | 0 | 0 | 0 |
| Phase 6 — SHOULDs | 7 | 7 | 0 | 0 | 0 | 0 |
| Phase 7 — COULDs / v1.5 | 1 | 1 | 0 | 0 | 0 | 0 |
| **TOTAL** | **50** | **50** | **0** | **0** | **0** | **0** |

*Phase 0 scaffold (commits b3139da + cbfb3fa) shipped before the Overlord board existed — Phase 0 closeout tasks AGB-000-* track the remaining manual steps.

## Phase 0 — Foundation (closeout)

| ID | Title | Pri | Pts | FRs | Owner | Status |
|----|-------|-----|-----|-----|-------|--------|
| [AGB-000A](TASK-AGB-000A-apply-schema-and-seed.md) | Apply schema + seed to Supabase | P0 | 1 | FR-TEAM-1 | — | open |
| [AGB-000B](TASK-AGB-000B-cofounder-account.md) | Capture cofounder identity + create account | P1 | 2 | FR-TEAM-1 | — | open |

## Phase 1 — Deals as Projects (current focus)

| ID | Title | Pri | Pts | FRs | Owner | Status |
|----|-------|-----|-----|-----|-------|--------|
| [AGB-001](TASK-AGB-001-contact-crud.md) | Contact CRUD (form, list, server actions) | P0 | 5 | FR-CON-1/2/3/5/7, FR-CAP-5 | — | open |
| [AGB-002](TASK-AGB-002-project-crud-templates.md) | Project CRUD + template instantiation | P0 | 8 | FR-PRJ-1/2/3/4/7 | — | open |
| [AGB-003](TASK-AGB-003-tag-system-pill-bar.md) | Tag system + venture pill bar | P0 | 3 | FR-WSP-1/2/3, FR-CON-3 | — | open |
| [AGB-004](TASK-AGB-004-owner-field-rls.md) | Owner field on Contact + Project + RLS basics | P0 | 3 | FR-TEAM-1/2, NFR-SEC-1 | — | open |
| [AGB-005](TASK-AGB-005-contact-detail-page.md) | Contact detail page (touches + projects + intro chain) | P1 | 5 | FR-CON-6, FR-MTG-6 | — | open |
| [AGB-006](TASK-AGB-006-project-detail-page.md) | Project detail page (milestones + touches + meetings) | P1 | 5 | FR-PRJ-1, FR-MTG-6 | — | open |
| [AGB-007](TASK-AGB-007-milestone-crud.md) | Milestone CRUD on Projects | P0 | 3 | FR-PRJ-3 | — | open |
| [AGB-008](TASK-AGB-008-touch-entity-basic.md) | Touch entity manual create + list | P0 | 3 | FR-CAP-5 (Touch) | — | open |
| [AGB-009](TASK-AGB-009-meetings-mtg.md) | Meeting CRUD + Action Items → Milestones | P1 | 5 | FR-MTG-1/2/3/6 | — | open |
| [AGB-010](TASK-AGB-010-shadcn-base.md) | Install shadcn/ui base + theme | P0 | 2 | (UI prereq) | — | open |
| [AGB-011](TASK-AGB-011-layout-nav.md) | Root layout + nav + sign-out | P0 | 2 | (UI prereq) | — | open |
| [AGB-012](TASK-AGB-012-founder-profile.md) | Founder profile page (timezone, display name) | P1 | 2 | FR-TEAM-1 | — | open |

**Phase 1 total:** 46 pts (~ 2-3 weeks of focused 2-person work)

## Phase 2 — Platform & Surfaces

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-100](TASK-AGB-100-pipeline-kanban.md) | Pipeline Kanban surface | P0 | 8 | FR-PRJ-5 | open |
| [AGB-101](TASK-AGB-101-project-health-color.md) | Project health color computation | P0 | 5 | FR-PRJ-6 | open |
| [AGB-102](TASK-AGB-102-waiting-on-ui.md) | Waiting-on UI + expected unblock | P1 | 2 | FR-PRJ-7 | open |
| [AGB-103](TASK-AGB-103-this-week-landing.md) | This-Week landing (Due/Blocked/Stale) | P0 | 5 | FR-BRN-3 | open |
| [AGB-104](TASK-AGB-104-contact-grid.md) | Contact grid + sort | P0 | 5 | FR-GRD-1/5 | open |
| [AGB-105](TASK-AGB-105-project-grid.md) | Project grid + sort | P0 | 5 | FR-GRD-2/5 | open |
| [AGB-106](TASK-AGB-106-multi-filter.md) | Multi-filter for grids | P0 | 5 | FR-GRD-3 | open |
| [AGB-107](TASK-AGB-107-saved-views.md) | Saved views (per Founder + share) | P1 | 3 | FR-GRD-4 | open |
| [AGB-108](TASK-AGB-108-group-by.md) | Group-by + counts | P1 | 3 | FR-GRD-6 | open |

## Phase 3 — Capture (NEEDS deferred inputs)

| ID | Title | Pri | Pts | FRs | Status | Blocker |
|----|-------|-----|-----|-----|--------|---------|
| [AGB-300](TASK-AGB-300-voice-memo-capture.md) | Voice memo capture (Whisper) | P0 | 5 | FR-CAP-1 | open | OpenAI key |
| [AGB-301](TASK-AGB-301-batch-encounter.md) | Batch encounter capture | P1 | 3 | FR-MTG-5 | open | depends 300 |
| [AGB-302](TASK-AGB-302-30sec-contact-voice.md) | 30-sec Contact-on-the-fly | P1 | 5 | FR-MTG-7 | open | depends 300 |
| [AGB-303](TASK-AGB-303-email-intake.md) | Email-forward intake (Postmark) | P0 | 5 | FR-CAP-2 | open | intake addr + Postmark |
| [AGB-304](TASK-AGB-304-whatsapp-bot.md) | WhatsApp bot commands | P0 | 8 | FR-CAP-3 | open | WhatsApp phone IDs |
| [AGB-305](TASK-AGB-305-whatsapp-push.md) | WhatsApp proactive push | P1 | 3 | FR-CAP-4 | open | depends 304 |
| [AGB-306](TASK-AGB-306-low-conf-flag.md) | Low-confidence transcription flag | P1 | 2 | FR-CAP-6 | open | depends 300 |
| [AGB-307](TASK-AGB-307-obsidian-sync.md) | Obsidian markdown + YAML sync | P0 | 8 | FR-OBS-1/2 | open | vault path |
| [AGB-308](TASK-AGB-308-obsidian-conflict.md) | Obsidian last-write-wins per field | P0 | 5 | FR-OBS-3 | open | depends 307 |
| [AGB-309](TASK-AGB-309-obsidian-kill.md) | Obsidian sync kill switch | P1 | 1 | FR-OBS-4 | open | depends 307 |

## Phase 4 — Active Brain (LLM)

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-400](TASK-AGB-400-watchdogs.md) | Stale + blocker-overdue watchdogs | P0 | 5 | FR-BRN-1/2 | open |
| [AGB-401](TASK-AGB-401-post-meeting-card.md) | Post-Meeting Card prompt | P1 | 3 | FR-MTG-4 | open |
| [AGB-402](TASK-AGB-402-weekly-briefing.md) | Weekly Briefing generator + email | P0 | 8 | FR-BRN-4 | open |
| [AGB-403](TASK-AGB-403-reintro-generator.md) | Re-Intro Generator + UI | P0 | 5 | FR-BRN-5/8 | open |
| [AGB-404](TASK-AGB-404-conversation-memory.md) | Conversation Memory rolling summary | P0 | 5 | FR-BRN-6 | open |
| [AGB-405](TASK-AGB-405-pre-meeting-card.md) | Pre-Meeting Card via calendar | P1 | 5 | FR-BRN-7 | open |
| [AGB-406](TASK-AGB-406-silence-rules.md) | Silence rules enforcement | P0 | 3 | FR-BRN-9 | open |
| [AGB-407](TASK-AGB-407-not-useful-feedback.md) | "Not useful" feedback button | P1 | 2 | FR-BRN-10 | open |

## Phase 5 — Network Graph

| ID | Title | Pri | Pts | FRs | Status |
|----|-------|-----|-----|-----|--------|
| [AGB-500](TASK-AGB-500-intro-chain-view.md) | Intro chain tree view | P0 | 5 | FR-NET-1 | open |
| [AGB-501](TASK-AGB-501-network-lens-toggle.md) | Friend / All lens toggle | P0 | 3 | FR-NET-2 | open |

## Phase 6 — SHOULDs (post-v1)

| ID | Title | Pts | FRs | Status |
|----|-------|-----|-----|--------|
| AGB-201 | Owner-by-default for unassigned milestones | 2 | FR-PRJ-8 | open |
| AGB-202 | Restaurant template | 2 | FR-PRJ-9 | open |
| AGB-203 | CSV export | 3 | FR-GRD-7 | open |
| AGB-204 | Warm-Path Finder | 8 | FR-NET-3 | open |
| AGB-205 | Reciprocity Ledger | 5 | FR-NET-4 | open |
| AGB-206 | Density heatmap | 5 | FR-NET-5 | open |
| AGB-207 | Owner filter on grids | 1 | FR-TEAM-3 | open |

## Phase 7 — COULDs / v1.5

| ID | Title | Pts | FRs | Status |
|----|-------|-----|-----|--------|
| AGB-700 | Inbound-Triage AI | 8 | FR-BRN-11 | open |

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
