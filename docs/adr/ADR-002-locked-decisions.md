---
type: adr
system: crm
brain_node: crm
title: ADR 002 locked decisions
summary: Architecture decision record for AGB-CRM (ADR-002-locked-decisions).
---

# ADR-002 — AGB CRM Locked Decisions

**Status:** Accepted (partial — see Deferred section)
**Date:** 2026-05-25
**Authored by:** Tomas + GigaRico (recommendations) + GigaPaul (handoff)
**Supersedes:** Open decisions in HLR V1 §7
**Companion docs:** HLR V2 (`requirements-agb-crm-v2.md`), Session Agenda (`agb-crm-decision-session-agenda.md`)

---

## Founder 1 — Identity

| Field | Value |
|-------|-------|
| Name | Tomas Gutierrez |
| Email | tomas.gutierrez.2000@icloud.com |
| GitHub | tomasgutierrez2000-eng |
| WhatsApp (E.164) | +19545317093 |
| Timezone | America/New_York (EST/EDT) |
| Obsidian vault | **DEFERRED** — choose between `/Users/tomas/Documents/Obsidian Vault/AGB-CRM/` (subfolder of personal) OR new dedicated `/Users/tomas/agb-crm-vault/` |

---

## Tech Stack (ADR-001 also captures)

| Layer | Locked Choice |
|-------|---------------|
| Framework | Next.js 16 App Router |
| Database | Supabase Postgres |
| ORM | Drizzle |
| Auth | Supabase Auth (passwordless magic-link + WebAuthn 2FA option) |
| UI | shadcn/ui + Tailwind 4 |
| LLM | Anthropic Claude via Vercel AI Gateway |
| Voice transcription | OpenAI Whisper API (cloud) |
| Hosting | Vercel (Fluid Compute) |
| Observability | Sentry + Vercel Analytics |
| Background jobs | Vercel Queues (Inngest fallback) |
| Email send | Resend |
| Email intake | Postmark inbound |
| WhatsApp transport | Meta WhatsApp Cloud API (✅ approved) |

---

## The 10 HLR Decisions

| ID | Decision | Locked Answer |
|----|----------|---------------|
| D-01 | LLM privacy mode | Hybrid — rule-based default; LLM only for Contacts tagged `ai-ok` |
| D-02 | Intro-chain seeding | Both — optional prompt at create + heuristic from forwarded email patterns |
| D-03 | Pipeline-stage definitions per template | LOCKED (3 templates × 12/10/5 stages — see below) |
| D-04 | WhatsApp bot identity | Per-Founder pairing (each Founder's number recognized) |
| D-05 | Primary relationship owner | Creator-by-default, mutable; both see all; only owner gets briefing items |
| D-06 | Active Brain silence rules | Suppress: archived/done/lost + `personal-only` tag + 2× "not useful" in 30 days |
| D-07 | Bilingual (ES/EN) | English-only for v1; ES defer to v1.5 |
| D-08 | Usage instrumentation | Capture-channel ratio ≥80% + briefing→action rate ≥3/wk + 7-day DAU per Founder ≥5/wk |
| D-09 | Voice transcription provider | OpenAI Whisper API (cloud) for v1; local Whisper.cpp as fallback if data classification escalates |
| D-10 | Cofounder Obsidian vault topology | Per-Founder private vaults; CRM is cross-Founder source of truth; per-Founder sync daemon |

---

## D-03 Content — Pipeline Stages (LOCKED)

### Caney posada onboarding (12 stages)

| # | Stage | SLA (days) | Default Owner | Done criterion |
|---|-------|------------|---------------|----------------|
| 1 | First contact | 3 | Tomas | Initial outreach/inbound logged |
| 2 | Discovery call | 7 | Tomas | 30-min intro call held |
| 3 | Demo | 5 | Tomas | PMS demo delivered, decision-maker present |
| 4 | Pricing proposal | 3 | Tomas | Written pricing + tier proposal sent |
| 5 | Contract sent | 5 | Cofounder | Service agreement drafted + sent |
| 6 | Contract signed | 10 | Cofounder | Counter-signed contract returned |
| 7 | Property data intake | 7 | either | Inventory + rates + photos imported |
| 8 | WhatsApp setup | 3 | either | Posada's WhatsApp number connected to bot |
| 9 | First 5 listings live | 7 | either | 5+ rooms/units published with availability |
| 10 | First booking received | 14 | either | First real customer booking processed |
| 11 | 30-day check-in | 30 | Tomas | Operator interview + issue log review |
| 12 | 90-day expansion review | 60 | either | Upsell discussion / referral ask |

### VAV creator campaign (10 stages)

| # | Stage | SLA (days) | Default Owner | Done criterion |
|---|-------|------------|---------------|----------------|
| 1 | Outreach | 5 | Tomas | DM/email sent |
| 2 | Pitched | 7 | Tomas | Pitch deck/proposal delivered |
| 3 | Interest confirmed | 5 | either | Creator verbally/written in |
| 4 | Trip dates agreed | 10 | either | Calendar locked |
| 5 | Trip logistics booked | 7 | Cofounder | Flights / posada / transport all booked |
| 6 | Trip executed | varies | either | Trip happened |
| 7 | Content shot | 14 | either | Raw footage confirmed received |
| 8 | Content posted | 21 | either | All deliverables live on creator's channels |
| 9 | Engagement reviewed | 14 | Tomas | Performance pulled (reach/clicks/conversions) |
| 10 | Paid out | 7 | Cofounder | Final payment processed + receipts filed |

### BD courtship (5 stages)

| # | Stage | SLA (days) | Default Owner | Done criterion |
|---|-------|------------|---------------|----------------|
| 1 | Intro / warm meeting | 7 | Tomas | First meeting held |
| 2 | Discovery (need identified) | 14 | Tomas | Clear need/opportunity articulated |
| 3 | Proposal sent | 10 | Tomas | Written proposal delivered |
| 4 | Decision pending | 21 | either | Their decision window |
| 5 | Closed (won / lost / parked) | — | either | Outcome captured + relationship preserved |

---

## Scope Addition — MTG (Meeting & Encounter Capture)

User-elevated capability after Round 3. New entity + 7 new FRs added to HLR-V2.

| ID | FR | Priority |
|----|-----|----------|
| FR-MTG-1 | Founder can create a Meeting with title, date, attendees, agenda, location, type | MUST |
| FR-MTG-2 | Founder can capture meeting minutes + explicit Action Items per Meeting | MUST |
| FR-MTG-3 | Action Items auto-promote to Project Milestones (or stand-alone) | MUST |
| FR-MTG-4 | Post-Meeting Card — system prompts for 60-sec capture after meeting ends | MUST |
| FR-MTG-5 | Batch-capture multiple Contacts from a single encounter with shared `met_at` tag | MUST |
| FR-MTG-6 | Meetings appear on Contact-detail (per attendee) + Project-detail (if linked) | MUST |
| FR-MTG-7 | <30 sec voice-capture of new Contact at moment of meeting (auto-parses intro chain + venue) | MUST |

**Total FR count:** 56 → **63** (38 MUST + 7 MTG MUST = 45 MUST). 16 NFRs unchanged.

---

## Deferred Items (NOT blocking Phase 0 — must resolve before later phases)

| Item | Blocks | Re-prompt point |
|------|--------|-----------------|
| Founder 2 (cofounder) identity — 6 fields | Phase 0 story AGB-S0-05 (their account creation) | Before AGB-S0-05 starts |
| Tomas's Obsidian vault path choice | Phase 3 (Obsidian sync, FR-OBS-1..4) | Before Phase 3 |
| Weekly Briefing day/time + channel | Phase 4 (FR-BRN-4) | Before Phase 4 |
| Re-intro voice sample (3-line example) | Phase 4 (FR-BRN-5) — system will use generic LLM prompt until provided | Before Phase 4, ideally |
| Domain name (default `crm.caneycloud.com`) | Deploy story AGB-S0-06 | Before AGB-S0-06 |
| Email intake address (default `crm-intake@caneycloud.com`) | Phase 3 (FR-CAP-2) | Before Phase 3 |
| Custom venture tags | None — accepted defaults `Caney/VAV/BD/Friend` | — |
| Seed Contacts CSV | None — none to import | — |

**Verdict on `/goal` readiness:** Phase 0 + Phase 1 + Phase 2 can run end-to-end with current locked decisions. Phase 3 onwards re-prompts for the deferred items.

---

## Sign-off

| Role | Name | Confirmed |
|------|------|-----------|
| Founder 1 | Tomas Gutierrez | ✅ 2026-05-25 |
| Founder 2 | Cofounder (TBD) | ⚠ deferred |
| Requirements architect | GigaRico | ✅ 2026-05-25 |
| PMO | GigaPaul | ✅ 2026-05-25 |
