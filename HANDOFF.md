# AGB CRM — Handoff (2026-05-26)

**Status as of EOD 2026-05-26:** Phase 0 (Foundation) shipped + Overlord task board live + 14 Phase 1 tasks fully specified. Phase 1 is ready to start.

**Pick this up tomorrow morning by:** reading this doc, then `_tasks/_BOARD.md`, then claiming the first task.

---

## Where we are

**What's live:**
- Repo: `/Users/tomas/AGB-CRM` (cloned from `arevalogutierrezbajares-spec/--CRM---`)
- GitHub: `https://github.com/arevalogutierrezbajares-spec/--CRM---` (main branch)
- Production: `https://agb-box9gd92z-arevalogutierrezbajares-8739s-projects.vercel.app` (Vercel Auth-gated, correct for internal tool)
- Supabase project: `bbrhvedzmzjbhjpjmhab` linked (West US Oregon)
- Tech stack: Next.js 16 + Tailwind 4 + Drizzle ORM + Supabase Auth (magic-link) + TypeScript strict + shadcn-ready

**What's NOT live yet (Phase 0 closeout — 2 tasks):**
- DB schema applied to Supabase → blocks everything (Founder 1 task: provide DB password) — see [`_tasks/TASK-AGB-000A`](_tasks/TASK-AGB-000A-apply-schema-and-seed.md)
- Cofounder account created → blocks 2-Founder collab — see [`_tasks/TASK-AGB-000B`](_tasks/TASK-AGB-000B-cofounder-account.md)

---

## What shipped today (2026-05-26)

### Code (commits `b3139da` + `cbfb3fa` on main)

1. **Scaffold** — Next.js 16 App Router, Tailwind 4, TypeScript strict, ESLint
2. **Drizzle schema** — 12 tables across 10 capability areas including the **MTG** (Meeting & Encounter Capture) entity elevated mid-session
3. **Seed script** — 3 pipeline templates + 27 stages + 6 default tags (`db/seed.ts`)
4. **Supabase Auth scaffold** — magic-link login at `/login`, callback route, server/client/proxy helpers
5. **proxy.ts** (Next.js 16 convention) gates all routes except `/login`, `/auth/callback`, `/api/health`
6. **Health endpoint** at `/api/health`
7. **Build verified** — `next build` + `tsc --noEmit` both clean
8. **Production deploy** — `READY` on Vercel

### Documentation (planning + handoff)

| Doc | Purpose |
|-----|---------|
| [`docs/requirements/HLR-V2.md`](docs/requirements/HLR-V2.md) | 63 FRs · 16 NFRs · code reuse map · open decisions resolved |
| [`docs/requirements/FR-MATRIX.md`](docs/requirements/FR-MATRIX.md) | **GigaRico-validated** — every FR with explicit Given/When/Then ACs · 9.3/10 quality |
| [`docs/adr/ADR-001-tech-stack.md`](docs/adr/ADR-001-tech-stack.md) | VAV stack rationale |
| [`docs/adr/ADR-002-locked-decisions.md`](docs/adr/ADR-002-locked-decisions.md) | 10 D-XX decisions + cofounder placeholder |
| [`docs/brainstorm-2026-05-25.md`](docs/brainstorm-2026-05-25.md) | Original brainstorm (49 ideas, 21 validated) |
| [`docs/decision-session-agenda.md`](docs/decision-session-agenda.md) | Session structure used to resolve decisions |
| [`_tasks/_BOARD.md`](_tasks/_BOARD.md) | Master task list — 50 tasks across 8 phases |
| [`_tasks/_WORKFLOW.md`](_tasks/_WORKFLOW.md) | Overlord claim/work/PR/merge process |

### Overlord task board

50 tasks across 8 phases. **14 task files written in full detail** (Phase 0 closeout + Phase 1):

| Phase 0 closeout | Phase 1 |
|------------------|---------|
| AGB-000A · Apply schema + seed | AGB-001 · Contact CRUD |
| AGB-000B · Cofounder account | AGB-002 · Project CRUD + templates |
| | AGB-003 · Tag system + pill bar |
| | AGB-004 · Owner field + RLS |
| | AGB-005 · Contact detail page |
| | AGB-006 · Project detail page |
| | AGB-007 · Milestone CRUD |
| | AGB-008 · Touch entity |
| | AGB-009 · Meetings + Action Items (MTG) |
| | AGB-010 · shadcn install |
| | AGB-011 · Layout + nav |
| | AGB-012 · Founder profile |

Phase 2-7 tasks listed in `_BOARD.md` with FR mapping — full task files created on claim using [`_tasks/_TEMPLATE.md`](_tasks/_TEMPLATE.md).

---

## What to do tomorrow

### Suggested order (in priority)

**Founder 1 (Tomas) — 30-60 min, mostly clicks:**

1. **AGB-000A** (apply schema) — get DB password from Supabase dashboard, paste into `.env.local`, run `pnpm db:push` + `pnpm db:seed`, add `DATABASE_URL` to Vercel env vars, redeploy → ~30 min
2. **AGB-000B** (cofounder) — ping cofounder for the 6 identity fields, invite via Supabase Auth, add to GitHub + Vercel → ~30 min

**Either Founder (or AI agent) — first dev work:**

3. **AGB-010** (shadcn install) — 2 pts, ~30 min
4. **AGB-011** (layout + nav) — 2 pts, ~1 hour
5. **AGB-004** (owner field + RLS) — 3 pts, ~3 hours
6. **AGB-003** (tag system + pill bar) — 3 pts, ~3 hours

Once 010 + 011 land, **AGB-001** and **AGB-007** can run in parallel.

### Pipeline (critical path for Phase 1 → Phase 2)

```
AGB-000A (schema) ─→ AGB-004 (RLS)
       ↓                  ↓
AGB-010 (shadcn) ──→ AGB-011 (layout) ──→ AGB-003 (tags)
                          ↓                    ↓
                    AGB-001 (Contact CRUD) ──→ AGB-002 (Project CRUD)
                          ↓                        ↓
                    AGB-008 (Touch) ──→ AGB-007 (Milestone) ──→ AGB-009 (Meeting)
                                                ↓
                                          AGB-005 + AGB-006 (detail pages)
                                                ↓
                                       Phase 2: grid/Kanban/This-Week
```

---

## How to claim & work a task

Read [`_tasks/_WORKFLOW.md`](_tasks/_WORKFLOW.md) for the full process. TL;DR:

```bash
cd ~/AGB-CRM

# 1. Pick a task from _tasks/_BOARD.md (open + P0)
# 2. Edit its file: status → claimed, owner → <your-id>
# 3. Commit the claim BEFORE writing code:
git checkout main && git pull
git add _tasks/TASK-AGB-XXX-*.md
git commit -m "chore(tasks): claim AGB-XXX (<your-id>)"
git push

# 4. Create the branch and work:
git checkout -b task/AGB-XXX-short-slug
# ... write code, satisfy each AC ...
git push -u origin task/AGB-XXX-short-slug

# 5. Open PR with title "feat(AGB-XXX): <title>"; status → review
# 6. After merge, status → merged
```

---

## How Tomas + Cofounder split work

**Tomas's lane (after AGB-000A/B):**
- Architecture-level tasks: AGB-004 (RLS), AGB-100 (Kanban — Phase 2), AGB-402 (Weekly Briefing — Phase 4)
- Anything touching the LLM prompts (AGB-403 re-intro, AGB-404 conversation memory)
- WhatsApp integration (AGB-304/305 — Phase 3)

**Cofounder's lane (good first-week tasks):**
- AGB-010 (shadcn install) — gentle entry, doesn't require deep context
- AGB-011 (layout + nav) — UX-shaped
- AGB-012 (founder profile) — small + standalone
- AGB-007 (Milestone CRUD) — well-scoped after AGB-002

**Either lane:**
- AGB-001 (Contact CRUD) — first real feature
- AGB-005 / AGB-006 (detail pages)
- AGB-104 / AGB-105 (grids — Phase 2)

**AI agents (Claude / Codex / Hermes):**
- Best at standalone tasks with clear ACs — e.g. AGB-010, AGB-011, AGB-008, AGB-012
- Less reliable on RLS / security tasks (AGB-004) — have a Founder review carefully
- Always claim the task in `_BOARD.md` before they start

---

## Manual user actions still required

These are blocking actions that ONLY a human Founder can do (not an AI agent):

| Action | Blocks | Where |
|--------|--------|-------|
| Get Supabase DB password + set DATABASE_URL | Everything DB-related | Supabase Dashboard → bbrhvedzmzjbhjpjmhab → Settings → Database |
| Provision Anthropic API key (Claude) | Phase 4 (Active Brain) | console.anthropic.com |
| Provision OpenAI API key (Whisper) | Phase 3 (voice capture) | platform.openai.com |
| Provision Resend API key | Phase 4 (Weekly Briefing email) | resend.com |
| Provision Postmark inbound + DNS | Phase 3 (email-forward) | postmarkapp.com |
| Configure WhatsApp Business numbers (Meta — already approved per ADR-002) | Phase 3 (WhatsApp bot) | Meta Business Suite |
| Decide briefing day/time/channel | Phase 4 (FR-BRN-4) | Add to ADR-002 |
| Decide custom domain (e.g. `crm.caneycloud.com`) | Polish (post-deploy) | Vercel + DNS provider |
| Provide re-intro voice sample | Phase 4 (FR-BRN-5 quality) | Add to ADR-002 |

---

## Deferred items (snapshot)

From ADR-002 deferred section — these all have GigaRico-recommended defaults; just need user confirmation when the phase activates:

| Item | Re-prompt at | Default if unchanged |
|------|--------------|----------------------|
| Cofounder identity (name/email/GH/WhatsApp/vault/TZ) | Phase 0 close (NOW) | None |
| Tomas's Obsidian vault path | Phase 3 start | `/Users/tomas/Documents/Obsidian Vault/AGB-CRM/` |
| Briefing day/time/channel | Phase 4 start | Mon 07:00 ET · Email + WhatsApp |
| Re-intro voice sample | Phase 4 start | LLM uses generic prompt |
| Domain name | Phase 0 deploy polish | `crm.caneycloud.com` |
| Email intake address | Phase 3 start | `crm-intake@caneycloud.com` |

---

## Quality bar (already enforced)

- ✅ FR matrix validated at **9.3 / 10 (EXCELLENT)** by GigaRico
- ✅ Every FR has Given/When/Then acceptance criteria
- ✅ Every task file lists which FRs it satisfies + the literal ACs
- ✅ Build verified clean (next build + tsc strict)
- ✅ Tech stack rationale documented (ADR-001)
- ✅ Locked decisions documented (ADR-002)
- ✅ No implementation leakage in FR text (mechanisms quarantined to Assumptions)

## What's NOT in scope (explicit won't-haves)

Per HLR-V2 §5:
- Multi-tenant SaaS / external user access
- Email-client replacement
- Public API / Zapier
- CRM data import (HubSpot/Salesforce)
- Native mobile apps (web-responsive only)
- BI / reporting beyond in-grid group-by
- RUTA Security workflows (separate scope, v1.5+)
- Milestone dependencies (DAG cascade)
- Decay scoring on contacts
- Template improvement loop (templates static in v1)
- Deal-value tracking + revenue attribution

---

## Open questions for the cofounder

When they come online:

1. Confirm identity fields (AGB-000B captures these)
2. Review HLR-V2 §4 (the 63 FRs) — flag anything that doesn't match their understanding
3. Confirm the 3 pipeline templates (Caney 12 / VAV 10 / BD 5) match the actual workflows they run — if not, edit `db/seed.ts` BEFORE schema is applied
4. Briefing prefs (timezone in particular — they may not be ET)
5. Their Obsidian vault path

---

## Where to find things

| What | Where |
|------|-------|
| All FRs with ACs | [`docs/requirements/FR-MATRIX.md`](docs/requirements/FR-MATRIX.md) |
| Why we chose this stack | [`docs/adr/ADR-001-tech-stack.md`](docs/adr/ADR-001-tech-stack.md) |
| Locked decisions | [`docs/adr/ADR-002-locked-decisions.md`](docs/adr/ADR-002-locked-decisions.md) |
| All tasks | [`_tasks/_BOARD.md`](_tasks/_BOARD.md) |
| Task workflow | [`_tasks/_WORKFLOW.md`](_tasks/_WORKFLOW.md) |
| Brainstorm origin story | [`docs/brainstorm-2026-05-25.md`](docs/brainstorm-2026-05-25.md) |
| Production app | https://agb-box9gd92z-arevalogutierrezbajares-8739s-projects.vercel.app |
| GitHub | https://github.com/arevalogutierrezbajares-spec/--CRM--- |
| Vercel project | https://vercel.com/arevalogutierrezbajares-8739s-projects/agb-crm |
| Supabase project | https://supabase.com/dashboard/project/bbrhvedzmzjbhjpjmhab |

---

**Good luck. The plan is tight, the FRs are testable, the cofounder can pick up cold from this doc.**
