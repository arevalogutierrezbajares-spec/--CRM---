# AGB CRM — HLR V2 (Decisions Pre-Filled + Code Reuse Map)

**Project:** Arevalo Gutierrez Bajares CRM (`arevalogutierrezbajares-spec/--CRM---`)
**Version:** V2 — 2026-05-25 by GigaRico
**Supersedes:** HLR V1 (`requirements-agb-crm.md`) — V2 adds locked recommendations, code reuse map, and updated assumptions reflecting (a) Meta WhatsApp approval already obtained, (b) reuse strategy from CaneyCloud + VAV/VZ Tourism.

**Validation status:** ⚠ Recommendations pre-filled but await Founder+cofounder confirmation. Run decision session per `agb-crm-decision-session-agenda.md`, then commit ADR-002, then re-validate.

---

## What Changed from V1

| Topic | V1 | V2 |
|-------|----|----|
| Open decisions | 10 unresolved | 10 pre-filled with GigaRico recommendations (subject to session confirmation) |
| Meta WhatsApp | Treated as 5-8 week external blocker | ✅ **Already approved** — Phase 3 unblocks immediately |
| Tech stack | TBD | Locked recommendation: VAV/VZ Tourism stack (Next.js 16 + Supabase + TS + shadcn) |
| Code provenance | Build from scratch | **§12 Code Reuse Map** added — what to lift from Caney + VAV |
| Phase 0 timeline | 2 weeks | ~1 week (reuse compresses scaffolding) |
| Phase 3 timeline | 4-6 weeks (WhatsApp BM wait) | 2-3 weeks (Meta approved + reuse Caney webhook patterns) |

---

## §1 — Vision & Problem

*(Unchanged from V1)*

AGB operates multiple ventures (CaneyCloud PMS, CaneyCloud Restaurant, VAV, future BD initiatives) on top of a friend/warm network that is the actual competitive moat. Standard CRMs ignore the social graph and act as passive filing cabinets. AGB needs a **chief-of-staff tool** that pushes the next action to the operator and treats the friend network as a first-class asset alongside the deal pipeline.

---

## §2 — Actors

*(Unchanged from V1)*

| Actor | Description | v1? |
|-------|-------------|-----|
| Founder | Tomas or cofounder — full access to all data | ✅ |
| Active Brain | The system itself, when pushing notifications, briefings, or AI-generated drafts | ✅ |
| Contact | A person/org tracked in the CRM. Never logs in. | ✅ |

---

## §3 — Capability Areas

*(Unchanged from V1 — see V1 §3 for full table)*

9 areas: CON, PRJ, BRN, CAP, GRD, NET, OBS, WSP, TEAM. **56 FRs total** (38 MUST, 12 SHOULD, 6 COULD). **16 NFRs.**

---

## §4 — Functional Requirements

*(Unchanged from V1 — 56 FRs reference HLR V1 §4 directly. V2 does not alter individual FR text.)*

---

## §5 — Won't Have (v1)

*(Unchanged from V1)*

---

## §6 — Non-Functional Requirements

*(Unchanged from V1)*

---

## §7 — Locked Decisions (was V1's "Open Decisions")

All 10 decisions now have a recommended answer. **Status changes from `blocked-on-decisions` to `recommendations-await-confirmation`.** The Founder+cofounder session confirms or overrides each.

| # | Decision | Locked Recommendation | Override Risk |
|---|---------|----------------------|---------------|
| **D-01** | LLM privacy mode | **Hybrid** — rule-based default; LLM only for contacts tagged `ai-ok`. Hosted Claude via Vercel AI Gateway. No fine-tuning. | LOW — easy to flip default later |
| **D-02** | Intro-chain seeding | **Both** — optional prompt at create + heuristic from forwarded email "introduced X to Y" patterns | LOW |
| **D-03** | Pipeline stages per template | **NEEDS CONTENT IN SESSION** — see agenda §D-03 starter prompts (Caney 12, VAV 10, BD 5 stages). HARD blocker until filled. | HIGH if guessed |
| **D-04** | WhatsApp bot identity | **Per-Founder pairing** — each Founder's number recognized; touch attribution unambiguous. **Meta BM already approved.** | LOW |
| **D-05** | Primary relationship owner | **Creator-by-default, mutable.** Both Founders see all; only named owner gets briefing on that item. | LOW |
| **D-06** | Active Brain silence rules | Suppress: archived/done/lost + `personal-only` tag + 2× "not useful" in 30d | LOW |
| **D-07** | Bilingual ES/EN | **English-only for v1.** ES defer to v1.5. | LOW (small audience, can flip) |
| **D-08** | Usage instrumentation | 3 metrics: capture-channel ratio (≥80%) + briefing→action rate (≥3/wk) + 7-day DAU per Founder (≥5/wk). Vercel Analytics + Sentry. | LOW |
| **D-09** | Voice transcription provider | **OpenAI Whisper API** (cloud) for v1; local Whisper.cpp fallback if data classification escalates | MEDIUM — privacy tradeoff |
| **D-10** | Cofounder Obsidian vault topology | **Per-Founder private vaults.** CRM is cross-Founder source of truth; each vault is a read-augmented mirror via per-Founder sync daemon. Private notes don't propagate. | MEDIUM — sync model is bespoke |

---

## §8 — Phase-to-FR Traceability Matrix *(Updated)*

Build order **revised** given Meta approval + code reuse compression.

### Phase 0 — Foundation *(was 2 weeks, now ~1 week)*

Same FRs as V1 §8, but timeline collapsed because:
- Auth lifts from VAV (Supabase Auth)
- Schema scaffolding lifts from Caney migration patterns
- Deploy pipeline already a one-liner with VAV stack on Vercel

### Phase 1 — Deals as Projects *(unchanged — 2-3 weeks)*

Blocked on **D-03 content** (the actual stage lists). All else decision-independent.

### Phase 2 — Platform & Surfaces *(unchanged — 2-3 weeks)*

Grid + Kanban + This-Week. Net-new code; no direct reuse.

### Phase 3 — Capture Without Friction *(was 4-6 weeks, now 2-3 weeks)*

**Major compression** because:
- ✅ Meta WhatsApp approved (eliminates 5-8 week wait)
- 🔁 Reuse Caney's webhook handler + Meta signature verification + intent routing patterns
- 🔁 Reuse VAV's WhatsApp webhook proxy pattern (`caneycloud.com → vamosavenezuela.com` rewrite)
- 🔁 Reuse VAV's Resend integration for email send
- ✏ Postmark inbound is net new but small

### Phase 4 — Active Brain *(unchanged — 2-3 weeks)*

LLM features. Reuse VAV's Claude client + prompt patterns from itinerary engine.

### Phase 5 — Network Graph *(unchanged — 1-2 weeks)*

Intro chain DAG + lens toggle. Net-new code (CRM-specific).

### Phase 6 — SHOULDs *(post-v1.0)*

### Phase 7 — COULDs *(v1.5)*

**Revised v1 estimate:** ~8-12 weeks total (was 12-18 weeks in V1).

---

## §9 — Assumptions (Locked Tech Stack)

| Topic | Locked Choice | Rationale |
|-------|---------------|-----------|
| Framework | **Next.js 16 App Router** | Reuse VAV/VZ Tourism; full-stack TS; AGB CRM's 2-person team needs minimal cognitive overhead |
| Database | **Supabase Postgres** | Reuse VAV; built-in auth + storage; RLS already familiar |
| ORM | **Drizzle** | TS-native, light; matches farmers-marketplace stack |
| Auth | **Supabase Auth** (passwordless magic-link + WebAuthn 2FA option) | Reuses VAV pattern; satisfies NFR-SEC-2 |
| UI | **shadcn/ui + Tailwind 4** | Lift components from Caney frontend (`--TOURISM-- APP/frontend`) |
| LLM client | **Anthropic Claude via Vercel AI Gateway** | Reuse VAV itinerary engine patterns; AI Gateway gives fallback + observability |
| Voice transcription | **OpenAI Whisper API** | Per D-09; cloud for v1 |
| WhatsApp Business API | **Meta WhatsApp Cloud API** — Tomas has approval | Reuse Caney's webhook handler + signature verification |
| Hosting | **Vercel (Fluid Compute)** | Reuse VAV deploy patterns; preview URLs per PR |
| Observability | **Sentry + Vercel Analytics** | Lift Caney's Sentry config |
| Background jobs | **Vercel Queues** (or Inngest if not available) | For Weekly Briefing generation, transcription jobs, watchdog evaluation |
| Email send | **Resend** | Reuse VAV |
| Email intake | **Postmark inbound** (or Mailgun) | Lightweight inbound webhook |
| Persistence pattern | One Postgres schema, Drizzle migrations, RLS for owner-field scoping | Adapt Caney RLS patterns |
| Calendar integration | **Google Calendar OAuth (read-only)** — scoped only to FR-BRN-7 pre-meeting card | Honors NFR-INTEG-1 |
| Obsidian sync | Filesystem watcher per Founder + sync daemon process | Net new; D-10 topology |

---

## §10 — Quality Self-Assessment

*(V2 estimate, pending session)*

| Dimension | V1 | V2 |
|-----------|-----|-----|
| Density | 9 | 9 |
| Implementation-free (FR text) | 8 | 8 |
| Traceability | 9 | 9 |
| Measurability | 8 | 9 (decisions locked) |
| SMART quality | 8 | 8.5 |
| Completeness | 8 | 9 (code reuse map closes the "how do we build this fast?" gap) |
| Actor coverage | 9 | 9 |
| Independence | 9 | 9 |

**Composite V2: 8.8 / 10 — GOOD-to-EXCELLENT.** Validation gate opens to FULL OPEN after Founder+cofounder confirms decisions in session.

---

## §11 — Recommended Next Steps

1. Read `agb-crm-decision-session-agenda.md`
2. Schedule 90-min Founder+cofounder session
3. During session: confirm/override §7 recommendations + fill D-03 content + capture cofounder identity + complete provisioning checklist
4. Commit `docs/adr/ADR-002-locked-decisions.md` to `--CRM---` repo
5. Run `gigarico validate agb-crm` to lock 9.0+ score
6. Run `/goal agb-crm` for end-to-end build

---

## §12 — Code Reuse Map (NEW in V2)

This is the leverage. Rather than build AGB CRM from zero, lift battle-tested code from CaneyCloud (`/Users/tomas/--TOURISM--`) and VAV/VZ Tourism (`/Users/tomas/VZ_Tourism_Project`). Three categories: **lift-and-shift** (copy with minor adaptation), **adapt** (use as reference pattern), **net-new** (CRM-specific, no reuse possible).

### 12.1 — Lift-and-Shift (copy with minor adaptation)

| Source | Component | Target in AGB CRM | Adaptation |
|--------|-----------|-------------------|------------|
| **VAV** | `app/api/whatsapp/webhook/route.ts` + signature verification + `proxy.ts` whitelist pattern | AGB CRM WhatsApp webhook (FR-CAP-3/4) | Strip VAV-specific intent routing; replace with AGB CRM intents (add-contact, log-touch, what's-due, draft-reintro) |
| **CaneyCloud** | `APP/frontend/components/ui/*` shadcn components + `tailwind.config.ts` + theme tokens | AGB CRM `components/ui/*` | Direct copy. Confirm shadcn version match. |
| **VAV** | `lib/itineraryPrompt.ts` + Claude API client patterns + JSON parsing + fallback handling | AGB CRM `lib/llm.ts` — used by FR-BRN-4 (briefing), FR-BRN-5 (re-intro), FR-BRN-6 (conversation memory) | Replace itinerary-specific prompts with CRM-specific prompts |
| **CaneyCloud** | Sentry init config (`sentry.client.config.ts` + `sentry.server.config.ts`) | AGB CRM Sentry setup | Direct copy; change project DSN |
| **VAV** | Resend client wrapper + email template patterns from `app/api/contact/route.ts` | AGB CRM Weekly Briefing email send (FR-BRN-4) | Replace contact-form template with briefing template |
| **VAV** | Supabase client setup (`lib/supabase/server.ts` + `lib/supabase/client.ts`) | AGB CRM Supabase wiring | Direct copy; new project URL |
| **CaneyCloud** | RS256 JWT verification pattern + RLS policy templates | AGB CRM RLS for owner-field scoping (FR-TEAM-1/2) | Adapt: AGB CRM uses Supabase Auth so JWT lives in Supabase; lift RLS pattern shape |
| **CaneyCloud** | Alembic-style numbered migrations + naming conventions | AGB CRM Drizzle migration structure | Adapt to Drizzle (Alembic is Python; Drizzle is TS) but keep numbering + naming discipline |

### 12.2 — Adapt (use as reference, not copy)

| Source | Pattern | Target Application |
|--------|---------|---------------------|
| **CaneyCloud** | Multi-tenant RLS (every table has `tenant_id`, every query scoped) | AGB CRM uses `owner_id` not tenant — same shape, single-tenant though |
| **CaneyCloud** | Event bus (20 events) for cross-module communication | AGB CRM watchdog rules + LLM trigger jobs — same pattern, smaller event surface |
| **CaneyCloud WhatsApp Concierge** (Deno edge function `wwssfrsmuytbxvcvssav`) | Per-user conversation memory pattern | FR-BRN-6 conversation memory implementation reference (NOT lifted directly — different runtime) |
| **VAV** | RAG knowledge layer (pgvector + Vertex, recently shipped) | If AGB CRM ever needs semantic search across Touches — reference for v1.5+ |
| **VAV** | Deterministic itinerary engine | FR-PRJ-2 template instantiation — same shape (template + variables → instance) |
| **VAV** | Photo migration to Supabase Storage | If AGB CRM needs avatar storage — reference for Phase 6 |
| **CaneyCloud** | Accounting double-entry book pattern (ACC-061 inventory binding) | Reciprocity Ledger (FR-NET-4, SHOULD) — same debit/credit shape |
| **farmers-marketplace** | Drizzle + Hono + Turborepo monorepo structure | AGB CRM single-package layout sufficient (no monorepo needed for 2-person team) |

### 12.3 — Net-New (no reuse possible — pure AGB CRM)

| Capability | Why net-new |
|------------|-------------|
| Obsidian bi-sync (FR-OBS-1/2/3/4) | No existing project uses Obsidian as a backing store |
| Pipeline Kanban view (FR-PRJ-5) | Caney has a board-like _BOARD.md for Operation Overlord but it's filesystem-based, not a CRM Kanban |
| Dynamic grid + multi-filter (FR-GRD-1/2/3) | None of the existing projects has an Attio/Airtable-style grid |
| Network graph + intro-chain DAG visualization (FR-NET-1/2) | New visualization layer |
| Pre-Meeting talking-points card (FR-BRN-7) | New surface |
| Re-Intro Generator (FR-BRN-5) prompt template | New prompt shape, though Claude client itself is reused |
| Weekly Briefing prompt + ranking algorithm (FR-BRN-4) | New |
| Stale-Deal Watchdog rule engine (FR-BRN-1) | New deterministic rule engine — could borrow Caney event-bus shape but logic is CRM-specific |

### 12.4 — Reuse Effort Estimate

| Phase | Reuse % (rough) | Time saved vs from-scratch |
|-------|-----------------|----------------------------|
| Phase 0 (Foundation) | ~70% | -50% time (1wk vs 2wk) |
| Phase 1 (Deals as Projects) | ~30% | -20% time |
| Phase 2 (Platform & Surfaces) | ~20% (only shadcn lift) | -10% time |
| Phase 3 (Capture) | ~60% (WhatsApp webhook + Resend + Supabase Auth) | -50% time (2-3wk vs 4-6wk) |
| Phase 4 (Active Brain) | ~40% (Claude client + email send) | -30% time |
| Phase 5 (Network Graph) | ~10% | -5% time |

**Net effect:** v1 ships in **~8-12 weeks** (was 12-18 weeks in V1).

### 12.5 — Reuse Risk: License & Cross-Repo Hygiene

- All source repos (`--TOURISM--`, `VZ_Tourism_Project`) are private and AGB-owned — no license issues
- `--TOURISM--` is co-owned with JEAV — per the partner-safety memory, no rebase/revert/force-push of their work without confirmation
- **Reuse strategy:** copy files into AGB CRM repo, do NOT depend on the source repos as git submodules or external packages
- Track origin: every lifted file gets a header comment `// Adapted from CaneyCloud/<path>@<commit>` or `// Adapted from VAV/<path>@<commit>` for future traceability

---

## §13 — `/goal`-Readiness Checklist

This HLR-V2 + ADR-002 (post-session) + provisioning checklist (per agenda Part 4) makes the project `/goal`-ready.

| Item | Status | Source |
|------|--------|--------|
| FRs locked, measurable, traceable | ✅ V1 + V2 | This document |
| All 10 decisions answered | 🟡 recommendations pre-filled; awaits session | §7 |
| Tech stack locked | ✅ | §9 |
| Code reuse map | ✅ | §12 |
| Cofounder identity captured | ⚠ session item | Agenda Item 1 |
| External services provisioned | ⚠ session item | Agenda Part 4 |
| Repo cloned locally | ⚠ Phase 0 story | Sprint AGB-S0-03 |
| Domain decided | ⚠ session item | Agenda Item 15 |
| Seed content decided (templates, briefing voice, intro draft style) | ⚠ session item | Agenda Items 11-14 |

**When all rows are ✅:** `/goal agb-crm` can run end-to-end.
