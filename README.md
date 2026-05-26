# AGB CRM

Internal CRM for **Arevalo Gutierrez Bajares (AGB)** — chief-of-staff tool spanning CaneyCloud + VAV + BD warm network + project tracking.

**Status:** Phase 0 — Foundation (scaffolded, schema authored, not yet deployed)
**Team:** 2 Founders (Tomas + cofounder)
**Repo:** `arevalogutierrezbajares-spec/--CRM---`
**Source:** Brainstorm 2026-05-25 → HLR V1 → HLR V2 (decisions locked) → this scaffold

## Quick Start

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase, Claude, etc.
pnpm db:push                       # apply schema to Supabase
pnpm db:seed                       # seed 3 pipeline templates + tags
pnpm dev                           # http://localhost:3000
```

## Architecture

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router |
| Database | Supabase Postgres (12 tables) |
| ORM | Drizzle |
| Auth | Supabase Auth (passwordless magic-link) |
| UI | shadcn/ui + Tailwind 4 |
| LLM | Anthropic Claude via Vercel AI Gateway |
| Voice | OpenAI Whisper API |
| Hosting | Vercel Fluid Compute |

See [`docs/adr/ADR-001-tech-stack.md`](./docs/adr/ADR-001-tech-stack.md).

## Capability Areas (10)

| ID | Area | Status |
|----|------|--------|
| CON | Contact Management | schema ✅ |
| PRJ | Project & Timeline Management | schema ✅, templates seeded ✅ |
| MTG | Meeting & Encounter Capture | schema ✅ |
| BRN | Active Brain (Notifications + AI) | Phase 4 |
| CAP | Capture & Intake (voice / WhatsApp / email-forward) | Phase 3 |
| GRD | Dynamic Grid & Filtering | Phase 2 |
| NET | Network Graph (intro chain DAG) | Phase 5 |
| OBS | Obsidian Bi-Sync | Phase 3 |
| WSP | Workspace & Venture Tagging | Phase 1 |
| TEAM | Team & Ownership | scaffolded |

## Documentation

- **HLR V2** — [`docs/requirements/HLR-V2.md`](./docs/requirements/HLR-V2.md) — 63 FRs, 16 NFRs, code reuse map
- **ADR-001** — [`docs/adr/ADR-001-tech-stack.md`](./docs/adr/ADR-001-tech-stack.md)
- **ADR-002** — [`docs/adr/ADR-002-locked-decisions.md`](./docs/adr/ADR-002-locked-decisions.md) — 10 D-XX decisions resolved
- **Brainstorm** — [`docs/brainstorm-2026-05-25.md`](./docs/brainstorm-2026-05-25.md) — 49 ideas, 21 validated, 5 clusters
- **Decision Session Agenda** — [`docs/decision-session-agenda.md`](./docs/decision-session-agenda.md)

## Build Phases (from HLR-V2 §8)

- [x] **Phase 0** Foundation — scaffold, schema, auth, deploy
- [ ] **Phase 1** Deals as Projects — Contact/Project CRUD, templates, workspace tags
- [ ] **Phase 2** Platform & Surfaces — dynamic grid, Kanban, This-Week landing
- [ ] **Phase 3** Capture Without Friction — voice, WhatsApp, email-forward, Obsidian sync
- [ ] **Phase 4** Active Brain — Weekly Briefing, Re-Intro Generator, Conversation Memory
- [ ] **Phase 5** Network Graph — intro chain DAG, lens toggle
- [ ] **Phase 6** SHOULDs (post-v1.0)
- [ ] **Phase 7** COULDs (v1.5)

## Deferred Items (Phase 3+ blockers)

- Founder 2 (cofounder) identity
- Tomas's Obsidian vault path
- Weekly Briefing day/time/channel
- Re-intro voice sample
- Domain name (default: `crm.caneycloud.com`)
- Email intake address (default: `crm-intake@caneycloud.com`)
