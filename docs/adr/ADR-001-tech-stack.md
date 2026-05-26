# ADR-001 — Tech Stack

**Status:** Accepted
**Date:** 2026-05-26
**Authored by:** Tomas + GigaRico
**Companion:** ADR-002 (locked product decisions)

## Context

AGB CRM is an internal-tool track project for a 2-Founder team (Tomas + cofounder). Internal-tool reqs differ from B2C marketplaces: minimal ops, low cognitive overhead, fast iteration over polish. The HLR specifies 63 FRs across 10 capability areas with a 8-12 week v1 target. Two adjacent projects in the AGB portfolio provide reusable stack patterns:

- **VAV / VZ Tourism** — Next.js 16 + Supabase + TypeScript + shadcn/ui
- **CaneyCloud PMS** — Python/FastAPI backend + Next.js 14 frontend + PostgreSQL + Alembic

## Decision

Adopt the **VAV stack** end-to-end. Single language (TypeScript), single deploy target (Vercel), single data provider (Supabase). Lift CaneyCloud's UI component patterns (shadcn) and observability config (Sentry).

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 16 App Router | Reuse VAV; full-stack TS via Route Handlers; Server Components reduce client JS |
| Database | Supabase Postgres | One provider for DB + Auth + Storage; reuse VAV pattern; RLS for owner-scoping |
| ORM | Drizzle | TS-native schema; lighter than Prisma; matches farmers-marketplace |
| Auth | Supabase Auth (passwordless magic-link) | Built-in 2FA; no password storage; reuse VAV |
| UI | shadcn/ui + Tailwind 4 | Component lift from CaneyCloud frontend; Tailwind 4 native to Next.js 16 |
| LLM | Anthropic Claude via Vercel AI Gateway | Reuse VAV itinerary engine patterns; Gateway gives fallback + observability |
| Voice | OpenAI Whisper API (cloud) | Per ADR-002 D-09 |
| WhatsApp | Meta WhatsApp Cloud API | Already approved per ADR-002 D-04 |
| Hosting | Vercel Fluid Compute | Same as VAV; preview deploys per PR |
| Observability | Sentry + Vercel Analytics | Lift CaneyCloud Sentry config |
| Background jobs | Vercel Queues (Inngest fallback) | For Weekly Briefing, transcription, watchdog evaluation |
| Email send | Resend | Reuse VAV |
| Email intake | Postmark inbound | Lightweight webhook |
| Obsidian sync | Per-Founder filesystem daemon | Net-new; per ADR-002 D-10 |

## Rejected Alternatives

- **CaneyCloud stack (Python/FastAPI + Next.js)** — Two-language split adds cognitive overhead. Justified for CaneyCloud (heavy domain logic in Python); not justified for a 2-Founder CRM.
- **Prisma over Drizzle** — Heavier runtime; Drizzle's TS-first schema matches our preference.
- **Custom auth** — Wasted effort when Supabase Auth covers magic-link + 2FA out of the box.
- **Inngest as primary background queue** — Vercel Queues is newer but native; reduces vendor count. Inngest remains a fallback if Queues hits scaling issues.

## Consequences

**Positive**
- Reuse compresses Phase 0-3 build time by ~30-50% (see HLR-V2 §12)
- Single language, single deploy, single provider — minimal ops for 2-Founder team
- Type safety end-to-end (Drizzle schema → Server Components → Client Components)

**Negative**
- Supabase vendor lock-in for auth + storage (mitigated by using vanilla Postgres for app data via Drizzle, portable if needed)
- Vercel Queues is newer than alternatives (Inngest, Trigger.dev) — minor risk

**Neutral**
- Obsidian sync daemon is net-new code with no reuse — accepted as core differentiation
