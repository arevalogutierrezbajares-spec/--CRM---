# AGB CRM — Decision Session Agenda

**Purpose:** Resolve all 10 HLR open decisions + lock tech stack + capture cofounder identity. After this session, `/goal agb-crm` can run end-to-end.

**Participants:** Tomas, Cofounder
**Duration:** 90 minutes (60 if focused)
**Pre-read:** HLR-V2 at `/Users/tomas/_bmad-output/planning-artifacts/requirements-agb-crm-v2.md`
**Format:** Each item has a recommended answer pre-filled. Confirm, override, or skip. No item should consume >10 min.

**Output:** A "Decisions Log" Markdown file committed to the `--CRM---` repo at `/docs/adr/ADR-002-locked-decisions.md`.

---

## PART 1 — Identity & Stack (10 min)

### Item 1: Cofounder Identity Capture *(5 min)*

| Field | Value |
|-------|-------|
| Full name | _____________________________ |
| Email | _____________________________ |
| GitHub handle | _____________________________ |
| WhatsApp number (E.164) | _____________________________ |
| Obsidian vault path (their machine) | _____________________________ |
| Preferred timezone | _____________________________ |

### Item 2: Tech Stack ADR *(5 min)*

**Recommendation:** VAV/VZ Tourism stack (not Caney's split Python+Next).

| Layer | Recommended | Rationale |
|-------|-------------|-----------|
| Framework | Next.js 16 App Router (full-stack, API routes) | Reuse VAV patterns; single-language TS; 2-person team can maintain |
| Database | Supabase (Postgres + Auth + Storage) | Reuse VAV; one provider for DB+auth+files |
| ORM | Drizzle | TS-native; lighter than Prisma; matches farmers-marketplace |
| Auth | Supabase Auth (passwordless magic-link) | Built-in 2FA support; reuses VAV pattern |
| UI | shadcn/ui + Tailwind 4 | Lift components from Caney frontend |
| LLM client | Anthropic Claude (via AI Gateway) | Reuse VAV itinerary engine patterns |
| Voice transcription | OpenAI Whisper API (with local Whisper.cpp fallback) | Per D-09 |
| Hosting | Vercel (Fluid Compute) | Same as VAV; deploy from PRs |
| Observability | Sentry + Vercel Analytics | Lift Sentry config from Caney |
| Background jobs | Vercel Queues (or Inngest) | For weekly briefings, transcription jobs |
| Email send | Resend | Reuse VAV |
| Email intake | Postmark inbound (or Mailgun) | Lightweight inbound webhook |

**Confirm or override?**

---

## PART 2 — The 10 HLR Decisions (40 min)

### D-01: LLM privacy mode for Active Brain *(4 min)*

**Affects:** FR-BRN-5/6, NFR-SEC-3, NFR-AI-1

**Recommendation:** Hybrid
- Default: rule-based summary (no LLM) for every contact
- Opt-in: tag a contact `ai-ok` to enable LLM-powered conversation memory + re-intro drafts for that contact only
- Transport: hosted LLM (Claude via Vercel AI Gateway), no fine-tuning, no retention on provider side

**Question for the session:** Accept hybrid? Or do you want LLM-on by default with a `no-ai` opt-out instead?

---

### D-02: Intro-chain DAG seeding *(2 min)*

**Affects:** FR-CON-4, FR-NET-1

**Recommendation:** Both
- Optional "who introduced you?" prompt on every Contact create (skippable)
- Heuristic inference from forwarded emails matching `introduced (?:you )?to` patterns

**Question for the session:** Accept both? Or simpler: prompt only, no inference?

---

### D-03 ⭐ HARD BLOCKER: Pipeline-stage definitions per template *(15 min — the longest item)*

**Affects:** FR-PRJ-2/4/5 — without stage content, no template can instantiate.

**Three templates ship in v1:** `caney-posada-onboarding`, `vav-creator-campaign`, `bd-courtship`.

For each: name the stages in order, with an SLA (days expected in this stage).

#### Caney posada onboarding *(12 milestones target — adjust as needed)*

| # | Stage name | SLA (days) | Owner default | Done criterion |
|---|------------|-----------|---------------|----------------|
| 1 | _____________________________ | __ | __ | _____________________________ |
| 2 | _____________________________ | __ | __ | _____________________________ |
| 3 | _____________________________ | __ | __ | _____________________________ |
| 4 | _____________________________ | __ | __ | _____________________________ |
| 5 | _____________________________ | __ | __ | _____________________________ |
| 6 | _____________________________ | __ | __ | _____________________________ |
| 7 | _____________________________ | __ | __ | _____________________________ |
| 8 | _____________________________ | __ | __ | _____________________________ |
| 9 | _____________________________ | __ | __ | _____________________________ |
| 10 | _____________________________ | __ | __ | _____________________________ |
| 11 | _____________________________ | __ | __ | _____________________________ |
| 12 | _____________________________ | __ | __ | _____________________________ |

**Starter prompt (Caney):** First contact → Discovery call → Demo → Pricing proposal → Contract sent → Contract signed → Property data intake → WhatsApp setup → First 5 listings → First booking → 30-day check-in → 90-day expansion

#### VAV creator campaign *(10 milestones target)*

| # | Stage name | SLA (days) | Owner default | Done criterion |
|---|------------|-----------|---------------|----------------|
| 1 | _____________________________ | __ | __ | _____________________________ |
| 2 | _____________________________ | __ | __ | _____________________________ |
| 3 | _____________________________ | __ | __ | _____________________________ |
| 4 | _____________________________ | __ | __ | _____________________________ |
| 5 | _____________________________ | __ | __ | _____________________________ |
| 6 | _____________________________ | __ | __ | _____________________________ |
| 7 | _____________________________ | __ | __ | _____________________________ |
| 8 | _____________________________ | __ | __ | _____________________________ |
| 9 | _____________________________ | __ | __ | _____________________________ |
| 10 | _____________________________ | __ | __ | _____________________________ |

**Starter prompt (VAV):** Outreach → Pitched → Interest confirmed → Trip dates agreed → Trip booked (logistics) → Trip executed → Content shot → Content posted → Engagement reviewed → Paid out

#### BD courtship *(5 milestones target)*

| # | Stage name | SLA (days) | Owner default | Done criterion |
|---|------------|-----------|---------------|----------------|
| 1 | _____________________________ | __ | __ | _____________________________ |
| 2 | _____________________________ | __ | __ | _____________________________ |
| 3 | _____________________________ | __ | __ | _____________________________ |
| 4 | _____________________________ | __ | __ | _____________________________ |
| 5 | _____________________________ | __ | __ | _____________________________ |

**Starter prompt (BD):** Intro / warm meeting → Discovery (need identified) → Proposal sent → Decision pending → Closed (won/lost/parked)

---

### D-04: WhatsApp bot identity *(4 min)*

**Affects:** FR-CAP-3/4

**Recommendation:** Per-Founder pairing (each Founder's personal WhatsApp number recognized by the bot; touch attribution is unambiguous).

**Implementation note:** Meta WhatsApp Business already approved (per Tomas). Confirm: one Meta business account, two numbers? Or one shared number with sender phone identifying which Founder?

**Question for the session:** Per-Founder numbers or shared number with sender-phone routing?

---

### D-05: Primary relationship owner without permissions *(2 min)*

**Affects:** FR-CON-1, FR-TEAM-2, FR-BRN-4

**Recommendation:** Creator-by-default, mutable. Both Founders see all data; only the named owner gets briefings on that item.

**Question for the session:** Accept? Or do you want both Founders to get every briefing item regardless of owner?

---

### D-06: Active Brain silence rules *(3 min)*

**Affects:** FR-BRN-9, FR-BRN-10

**Recommendation:** Suppress notifications for items that match any of:
- Status `done`, `lost`, `archived`
- Contact has tag `personal-only`
- The item has been marked "not useful" by either Founder **2× or more** in the last 30 days

**Question for the session:** Accept? Any other suppression rules?

---

### D-07: Bilingual content (ES / EN) *(1 min)*

**Affects:** All Founder-facing surfaces.

**Recommendation:** **English-only for v1.** Spanish defer to v1.5 only if external usage emerges.

**Question for the session:** Confirm English-only?

---

### D-08: Usage instrumentation *(3 min)*

**Affects:** NFR-OBS-1

**Recommendation:** Track these 3 metrics:
1. **Capture-channel ratio** — % of new Contacts created via WhatsApp / voice / email / Obsidian (non-web) — target ≥80%
2. **Briefing → action rate** — # of items clicked / acted on from the Weekly Briefing per week (target ≥3)
3. **7-day DAU per Founder** — days/week each Founder opens the app or interacts with the bot (target ≥5)

Send to: Vercel Analytics + Sentry (lift Caney config).

**Question for the session:** Accept these 3? Any additional metrics?

---

### D-09: Voice transcription provider *(2 min)*

**Affects:** FR-CAP-1, NFR-SEC-3

**Recommendation:** OpenAI Whisper API (cloud) for v1 — fast, accurate, low ops overhead. Local Whisper.cpp as fallback only if user data classification escalates.

**Tradeoff:** Cloud Whisper means voice audio + transcript transit OpenAI infrastructure (no retention by default but still off-prem).

**Question for the session:** Cloud (faster shipping) or local (full privacy, ops overhead)?

---

### D-10: Cofounder Obsidian vault topology *(4 min)*

**Affects:** FR-OBS-1/2/3

**Recommendation:** Each Founder syncs to their own private vault. CRM is the cross-Founder source of truth (the database). Each vault is a personalized read-augmented mirror — not synced between Founders directly.

**Implementation:**
- CRM writes shared contact data to *both* Founders' vaults via per-Founder Obsidian Sync daemon
- Each Founder can add private notes to their own vault; private notes do NOT propagate to the CRM or the cofounder's vault
- Per-field last-write-wins on shared fields

**Question for the session:** Accept per-Founder vaults? Or shared vault via Git/Syncthing?

---

## PART 3 — Content-Level Questions (15 min)

These don't have GigaRico defaults — they need your taste.

### Item 11: Workspace tags beyond Caney/VAV/BD/Friend *(2 min)*

Any custom venture tags from day one? (e.g. `restaurant`, `holding-admin`, `family-office`)

List: _____________________________

### Item 12: Weekly Briefing voice & timing *(3 min)*

| Field | Default | Override? |
|-------|---------|-----------|
| Tone | Terse, action-oriented | ☐ |
| Signature | "AGB CRM" | ☐ |
| Day | Monday | ☐ |
| Time | 07:00 | ☐ |
| Timezone | Caracas (VET) | ☐ |
| Channel | Email + WhatsApp ping | ☐ |
| Length cap | 5 bullets | ☐ |

### Item 13: Re-Intro draft style — example *(3 min)*

Write a 3-line example of a re-intro you'd consider "good" — the LLM will mimic this voice. Spanish-Venezuelan idiom OK if that's the natural register.

```
[Your example draft here]
```

### Item 14: Seed Contacts to import *(3 min)*

Any existing CSV / spreadsheet / vCard export to seed the database? If yes:
- File location: _____________________________
- Approximate # of contacts: _____________________________
- Already tagged by venture? ☐ Y ☐ N

### Item 15: Domain name *(2 min)*

Where will the CRM live?

- ☐ Subdomain of an existing domain (suggest: `crm.arevalogutierrezbajares.com` or `crm.caneycloud.com`)
- ☐ New domain (e.g. `agbcrm.com`) — needs purchase
- ☐ Vercel-provided URL (good for v1, swap later)

### Item 16: Email-forward intake address *(2 min)*

Suggested: `intake@agbcrm.com` or `crm@caneycloud.com` (subdomain reuse).

Decision: _____________________________

---

## PART 4 — Provisioning Checklist (15 min)

Before `/goal` can run, these external services need to be ready. Mark each:

| # | Service | Status | Action |
|---|---------|--------|--------|
| 1 | GitHub repo cloned locally | ☐ pending | `git clone github.com/arevalogutierrezbajares-spec/--CRM--- ~/AGB-CRM` |
| 2 | Supabase project created | ☐ pending | Create new project; capture URL + anon key |
| 3 | Vercel project linked | ☐ pending | `vercel link` to new project |
| 4 | Domain pointed (if not Vercel default) | ☐ pending | Add to Vercel |
| 5 | Anthropic API key (with Vercel AI Gateway) | ☐ pending | Provision + add to env |
| 6 | OpenAI API key (Whisper) | ☐ pending | Provision + add to env |
| 7 | Resend API key | ☐ pending | Reuse VAV key or new project |
| 8 | Postmark inbound (or Mailgun) for email intake | ☐ pending | Configure webhook URL |
| 9 | WhatsApp Business — number(s) assigned | ✅ approved (Tomas confirmed) | Confirm number assignment per D-04 |
| 10 | Sentry project | ☐ pending | Create new project; copy Caney config |
| 11 | Cofounder added to GitHub repo + Vercel team | ☐ pending | Invite |
| 12 | Both Obsidian vaults exist at agreed paths | ☐ pending | Confirm per D-10 |

---

## PART 5 — Output & Next Steps (10 min)

### Capture decisions in ADR

Right after the session, commit `docs/adr/ADR-002-locked-decisions.md` to the `--CRM---` repo containing:
- D-01 to D-10 final answers
- Tech stack from Item 2
- Cofounder identity from Item 1
- Content from Items 11–16
- Provisioning checklist status

### Run `/goal`

Once the ADR is committed and items 1–8 of the provisioning checklist are ✅, execute:

```
/goal agb-crm
```

Expected behavior: scaffolds repo, runs Phase 0-1 stories from sprint AGB-S0, prompts inline for any remaining content (e.g., Re-Intro example refinement, seed Contact mapping).

### Re-validate via GigaRico

Run `gigarico validate agb-crm` to confirm the HLR-V2 quality score moves from 8.5 → 9.0+ with all decisions locked.

---

## Session Facilitator Notes

- **Time-box ruthlessly.** D-03 will try to eat the whole hour. If it does, that's fine — it's the most valuable 30 min you'll spend on this project. Other items have strong defaults.
- **Skip items where the default works.** Don't debate D-02 if "both" sounds right.
- **D-03 trick:** start with the *Caney* template (closest to existing PMS work). The pattern transfers to VAV and BD with minimal repetition.
- **No-go signal:** if D-03 can't be completed in 30 min, schedule a *separate* working session for D-03 alone. Don't ship Phase 1 with guessed stages.
