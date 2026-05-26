# AGB CRM — High-Level Requirements (HLR v1)

**Project:** Arevalo Gutierrez Bajares CRM (`arevalogutierrezbajares-spec/--CRM---`)
**Authored:** 2026-05-25 by GigaRico
**Source brainstorm:** `/Users/tomas/_bmad-output/brainstorming/brainstorming-session-2026-05-25-2147-agb-crm.md`
**Target audience:** 2-person team (Tomas + cofounder) building production-grade internal tool
**Status:** Drafted — 10 DECISIONS-NEEDED block validation gate

---

## §1 — Vision & Problem

AGB operates multiple ventures (CaneyCloud PMS, CaneyCloud Restaurant, VAV/Vamos A Venezuela, future BD initiatives) on top of a friend/warm network that is the actual competitive moat. Standard CRMs (Salesforce, HubSpot, Pipedrive) treat the database as a passive filing cabinet and ignore the social graph entirely. AGB needs a tool that **acts like a chief of staff** — pushing the next action to the operator rather than waiting to be queried — and that treats the friend network as a first-class asset alongside the deal pipeline.

**Job to be done:** Keep AGB's relationships warm, surface the right action at the right time, and never let a project slip because someone forgot a follow-up. Across every venture, from one graph.

**Non-goals (v1):** Multi-tenant SaaS. External-user access. Email-client replacement. CRM data import. Native mobile apps. RUTA Security workflows (deferred to v1.5+).

---

## §2 — Actors

| Actor | Description | v1? |
|-------|-------------|-----|
| **Founder** | Tomas or cofounder — full access to all data | ✅ |
| **Active Brain** | The system itself, when pushing notifications, briefings, or AI-generated drafts to a Founder | ✅ |
| **Contact** | A person/org tracked in the CRM. Never logs in. Has no agency in the system. | ✅ |

Single user role in v1. No external users, no clients, no admins.

---

## §3 — Capability Areas

Nine capability areas, derived from the 5 brainstorm clusters + 4 cross-cutting concerns.

| ID | Capability Area | Cluster | FR Count |
|----|----------------|---------|---------|
| CON | Contact Management | Network as Capital | 8 |
| PRJ | Project & Timeline Management | Deals as Projects | 9 |
| BRN | Active Brain (Notifications & AI) | The Active Brain | 11 |
| CAP | Capture & Intake | Capture Without Friction | 6 |
| GRD | Dynamic Grid & Filtering | Platform & Surfaces | 7 |
| NET | Network Graph | Network as Capital | 5 |
| OBS | Obsidian Bridge | Capture Without Friction | 4 |
| WSP | Workspace & Multi-Venture Tagging | Platform & Surfaces | 3 |
| TEAM | Team & Ownership | Platform & Surfaces | 3 |

**Total FRs:** 56 · **MUST:** 38 · **SHOULD:** 12 · **COULD:** 6
**NFRs:** 16

---

## §4 — Functional Requirements

### CON — Contact Management

Purpose: Persistent identity for every person/org AGB engages with — friend, lead, partner, or prospect — in one graph with multi-venture tagging.

- **FR-CON-1** *(MUST)* — A Founder can create a Contact with at minimum a display name and a relationship type (friend / lead / partner / prospect). Source: Brainstorm Cat#13 (Friend ≠ Lead, same graph). Acceptance: Contact persists, appears in grid view, no implicit pipeline-stage assignment.
- **FR-CON-2** *(MUST)* — A Founder can attach one or more communication channels (email, phone, WhatsApp, Instagram handle, organization domain) to a Contact. Source: brainstorm §Phase 4 entity model.
- **FR-CON-3** *(MUST)* — A Founder can apply one or more venture tags (`caney`, `vav`, `bd`, `friend`, plus custom) to a Contact. A Contact may belong to multiple ventures simultaneously. Source: Cat#36 (One Graph + Venture Tags).
- **FR-CON-4** *(MUST)* — A Founder can record an intro-chain pointer on a Contact identifying who introduced them. The pointer can reference another Contact or a free-text source ("conference 2026-Q1"). Source: Cat#12 (Intro Chain as DAG).
- **FR-CON-5** *(MUST)* — A Founder can change a Contact's relationship type at any time (e.g., friend → lead) without losing prior touches, intro chain, or notes. Source: Cat#13.
- **FR-CON-6** *(MUST)* — A Founder can view a Contact-detail surface showing all touches in reverse-chronological order, all linked projects, the intro chain (1+ hop), and free-form notes. Source: brainstorm §Phase 4.
- **FR-CON-7** *(MUST)* — A Founder can mark a Contact as archived. Archived Contacts are excluded from default grid, watchdogs, and briefings, but remain queryable. Source: implicit completeness requirement.
- **FR-CON-8** *(SHOULD)* — A Founder can merge two Contact records (deduplication). Touches, projects, intro-chain, and tags from both are preserved on the survivor. Source: implicit completeness requirement.

### PRJ — Project & Timeline Management

Purpose: Every deal in motion is a project with template-driven milestones, an explicit pipeline stage, and a status. Replaces "deal pipeline" + "task tracker" with one model.

- **FR-PRJ-1** *(MUST)* — A Founder can create a Project linked to one or more Contacts, with a title, an owner, a status (`active` / `waiting` / `done` / `lost`), and a template type (`caney-posada-onboarding` / `vav-creator-campaign` / `bd-courtship` / custom). Source: Cat#14 (Every Deal IS a Project).
- **FR-PRJ-2** *(MUST)* — Creating a Project from a template auto-instantiates the template's milestone list with default due-date offsets relative to creation. Source: Cat#15 (Project Templates per Vertical).
- **FR-PRJ-3** *(MUST)* — A Founder can author Milestones on a Project with a title, due date, owner, status (`pending` / `done` / `blocked`), and an optional blocker description. Source: Cat#14.
- **FR-PRJ-4** *(MUST)* — Each Project carries a pipeline-stage value drawn from the stages defined by its template. A Founder can advance the Project through stages explicitly or via drag-and-drop in the Kanban view. Source: brainstorm §Phase 3 user override (pipeline kanban yes).
- **FR-PRJ-5** *(MUST)* — A Founder can view a Pipeline Kanban surface showing all active Projects grouped by current pipeline stage, filterable by venture tag and template type. Source: Phase 3 override.
- **FR-PRJ-6** *(MUST)* — The system computes a Project's health color (`green` / `amber` / `red`) as a derived attribute based on (a) milestone on-time ratio, (b) recency of last touch on linked Contacts, (c) age of the oldest active blocker. Health color is visible in the grid, Kanban, and This-Week views. Source: Cat#28 (Project Health Color).
- **FR-PRJ-7** *(MUST)* — A Founder can mark a Project as `waiting` and specify what or whom it is waiting on, with an expected unblock date. Source: Cat#17 (Waiting-On Tracker).
- **FR-PRJ-8** *(SHOULD)* — When a Milestone is created without an explicit owner, the system assigns the Project's creator as owner by default. Source: Cat#26 (Owner-by-Default).
- **FR-PRJ-9** *(SHOULD)* — A Founder can ship the system with a Restaurant project template once the CaneyCloud Restaurant vertical hits production. Source: brainstorm §MoSCoW SHOULD.

### BRN — Active Brain (Notifications, AI Assistant)

Purpose: The CRM *pushes* the next action to the Founder rather than waiting to be queried. Mix of deterministic rules and LLM-driven assistance.

- **FR-BRN-1** *(MUST)* — The system surfaces a "stale" warning on any Project whose linked Contacts have had no Touch within a configurable threshold (default 21 days; tunable per relationship type). Source: Cat#6 (Stale-Deal Watchdog).
- **FR-BRN-2** *(MUST)* — The system surfaces a Project as "blocker-overdue" when a `waiting` status has not changed by the expected unblock date. Source: Cat#17.
- **FR-BRN-3** *(MUST)* — A Founder can view a This-Week landing surface showing: items due this week, items currently blocked, and items currently stale — ranked by health color (red → amber → green) and venture tag. Source: Cat#16 (This-Week View).
- **FR-BRN-4** *(MUST)* — The system delivers a Weekly Briefing to each Founder every Monday at 07:00 local time, containing exactly five prioritized actions for the week. Each action includes the relevant Contact/Project and a one-line context. Source: Cat#31 (Weekly Briefing Generator).
- **FR-BRN-5** *(MUST)* — A Founder can request an on-demand Re-Intro draft for any Contact whose last touch is older than 30 days. The system returns a 2-3 sentence message draft suitable for WhatsApp, referencing the most recent conversation context. Source: Cat#20 (Re-Intro Generator).
- **FR-BRN-6** *(MUST)* — The system maintains a rolling "state of relationship" summary for each Contact (≤3 bullets) updated from recent Touches. The summary is surfaced on the Contact-detail page and used to seed Re-Intro drafts. Source: Cat#33 (Conversation Memory).
- **FR-BRN-7** *(MUST)* — A Founder can opt into a Pre-Meeting Card delivered N hours before a calendar event with a participant matched to a Contact, summarizing the relationship state and surfacing the top 3 talking points. Source: Phase 3 user override (calendar hook approved for this single use).
- **FR-BRN-8** *(MUST)* — The Active Brain never blocks Founder action — all AI-generated content (drafts, summaries, briefings) is editable before sending and clearly marked as machine-generated. Source: SCAMPER decision (suggestions augmentative, never authoritative).
- **FR-BRN-9** *(MUST)* — The system suppresses notifications and briefing items for Projects whose status is `done`, `lost`, or `archived`. Source: brainstorm HMW#6 (silence rule).
- **FR-BRN-10** *(SHOULD)* — A Founder can mark any Active Brain suggestion as "not useful" with one click; the system records the rejection for future tuning. Source: implicit feedback-loop requirement.
- **FR-BRN-11** *(COULD)* — The system parses inbound emails forwarded by a Founder, identifies the contact and intent (request / FYI / intro), drafts a reply, and creates a follow-up task if needed. Source: Cat#32 (Inbound-Triage AI) — deferred to v1.5.

### CAP — Capture & Intake

Purpose: Getting data into the system without forcing the Founder to open a web app and type.

- **FR-CAP-1** *(MUST)* — A Founder can submit a voice memo (audio recording) through the WhatsApp bot or the web app; the system transcribes it and creates a structured Touch attached to the relevant Contact. Source: Cat#11 (Voice-Memo Capture).
- **FR-CAP-2** *(MUST)* — A Founder can forward an email to a dedicated address; the system parses the sender, identifies or creates the Contact, and records a Touch with the email body and timestamp. Source: brainstorm §Phase 4 MUST list.
- **FR-CAP-3** *(MUST)* — A Founder can issue commands through a WhatsApp bot, including: add contact, log touch with [contact], "what's due today", "draft re-intro to [contact]". Source: Cat#34 (WhatsApp as Primary UI), Phase 3 override (v1, not deferred).
- **FR-CAP-4** *(MUST)* — The WhatsApp bot can proactively message a Founder when a watchdog or blocker-overdue rule fires. Source: Cat#34 + Cat#6.
- **FR-CAP-5** *(MUST)* — A Founder can manually create or edit any Contact, Project, Touch, or Milestone via the web app, with form validation and saved-on-blur semantics. Source: standard CRUD requirement.
- **FR-CAP-6** *(SHOULD)* — When the voice transcription confidence is below a threshold, the system flags the Touch for manual review rather than silently storing low-quality text. Source: implicit data-quality requirement.

### GRD — Dynamic Grid & Filtering

Purpose: The "classic CRM tab" view — a power-user surface where everything can be seen, filtered, sorted, and grouped, complementing the AI/bot push channels.

- **FR-GRD-1** *(MUST)* — A Founder can view all Contacts in a grid surface with configurable column visibility, ordering, and width. Source: Cat#49 (Dynamic Grid + Filter View).
- **FR-GRD-2** *(MUST)* — A Founder can view all Projects in a grid surface with configurable columns separate from the Contact grid. Source: Cat#49.
- **FR-GRD-3** *(MUST)* — A Founder can filter any grid by multiple criteria simultaneously (multi-select on tag, venture, status, owner, relationship type; date-range on touch recency and due date; free-text search). Filters compose with AND semantics. Source: Cat#49 + user explicit "dynamic filtering" requirement.
- **FR-GRD-4** *(MUST)* — A Founder can save a filtered grid configuration as a named View, recall it later, and share it with the cofounder. Source: Cat#49.
- **FR-GRD-5** *(MUST)* — A Founder can sort any grid by any visible column, ascending or descending. Source: Cat#49.
- **FR-GRD-6** *(MUST)* — A Founder can group rows in any grid by a chosen column (venture, status, owner, relationship type) and see counts per group. Source: Cat#49 + SCAMPER decision (grid doubles as analytics surface).
- **FR-GRD-7** *(SHOULD)* — A Founder can export the current grid view (with active filters applied) to CSV. Source: implicit reporting requirement.

### NET — Network Graph

Purpose: Treat the friend/warm-network graph as a first-class asset, not a Rolodex.

- **FR-NET-1** *(MUST)* — A Founder can view the intro chain for any Contact as a tree, showing who introduced whom, traversable 1+ hops. Source: Cat#12 (Intro Chain DAG).
- **FR-NET-2** *(MUST)* — A Founder can toggle the network view between "Friend lens" (showing only friend-type contacts and their introductions) and "All lens" (entire graph). Source: Cat#13 (Friend ≠ Lead, same graph, different lens).
- **FR-NET-3** *(SHOULD)* — Given a new Contact, the system can surface 2nd-degree connections from existing Contacts (warm-path suggestions). Source: Cat#7 (Warm-Path Finder).
- **FR-NET-4** *(SHOULD)* — A Founder can record explicit favors-given and favors-received against any Contact and view a per-Contact reciprocity balance. Source: Cat#21 (Reciprocity Ledger).
- **FR-NET-5** *(SHOULD)* — A Founder can view a network density visualization indicating which geographic/venture clusters of the network are dense vs sparse. Source: Cat#22 (Mutual-Friend Density Heatmap).

### OBS — Obsidian Bridge

Purpose: Treat the Founder's Obsidian vault as the source of truth for free-form notes; the CRM owns structured/transactional state. Bidirectional sync, last-write-wins per field.

- **FR-OBS-1** *(MUST)* — For every Contact in the CRM, the system maintains a corresponding markdown file in the Founder's Obsidian vault under a configurable folder path (default `crm/contacts/`). Source: Cat#43 (Obsidian ↔ CRM Bi-Sync).
- **FR-OBS-2** *(MUST)* — Structured Contact fields (relationship type, venture tags, owner, intro-chain pointer, last touch timestamp) live in the markdown file's YAML frontmatter; free-form notes live in the body. Source: Cat#43.
- **FR-OBS-3** *(MUST)* — When the same field is modified in both Obsidian and the CRM, the most recent write wins (per-field, not per-file). Source: Cat#43 (explicit user decision).
- **FR-OBS-4** *(MUST)* — A Founder can disable Obsidian sync globally without affecting CRM operation. Source: implicit dependency-isolation requirement.

### WSP — Workspace & Multi-Venture Tagging

Purpose: Let the Founder filter the entire UI to a single venture's context, without separating data into different databases.

- **FR-WSP-1** *(MUST)* — A Founder can switch the active workspace context via a top-bar pill selector with values: `All` (default), `Caney`, `VAV`, `BD`, plus any custom venture tags. Source: SCAMPER decision (workspace switcher = pill bar).
- **FR-WSP-2** *(MUST)* — When a non-`All` workspace is active, the grid, Kanban, This-Week, and Briefing surfaces show only Contacts and Projects matching the active venture tag. Source: Cat#36 + SCAMPER.
- **FR-WSP-3** *(MUST)* — A Founder can author new venture tags. Tag creation does not migrate existing Contacts; venture tagging is explicit per Contact. Source: implicit completeness.

### TEAM — Team & Ownership

Purpose: 2-founder team, everything shared, owner field for primary-relationship attribution.

- **FR-TEAM-1** *(MUST)* — The system supports exactly two Founder accounts in v1, each with full read/write access to all data. Source: brainstorm §Session Setup (cofounder constraint).
- **FR-TEAM-2** *(MUST)* — Every Contact and every Project carries an `owner` field referencing one of the two Founders. Owner is mutable. Source: brainstorm §Phase 4 entity model.
- **FR-TEAM-3** *(SHOULD)* — A Founder can filter any grid by owner (`mine` / `theirs` / `all`) without changing the workspace context. Source: implicit team-collab requirement.

---

## §5 — Won't Have (v1 — explicit exclusions)

| Out of Scope | Reason |
|--------------|--------|
| Multi-tenant or external-user access | 2-founder internal tool, not SaaS |
| Email-client replacement / full IMAP integration | Forward-to-address intake is sufficient |
| Public API / Zapier integration | No external consumers in v1 |
| CRM data import (HubSpot/Salesforce/Pipedrive) | No legacy data to migrate |
| Native mobile apps | Web-responsive + WhatsApp bot is the mobile story |
| BI/reporting dashboard beyond in-grid group-by | Grid + briefing covers v1 reporting need |
| RUTA Security workflows | Descoped to v1.5+ phase |
| Milestone dependencies (DAG with cascade) | Lightweight PM by design |
| Decay scoring on contacts | Watchdog handles the active case |
| Template improvement loop (auto-evolving templates) | Static templates in v1; v1.5+ |
| Deal-value tracking and revenue attribution | Out of scope for relationship-first v1 |

---

## §6 — Non-Functional Requirements

| ID | Category | Requirement | Priority |
|----|----------|-------------|---------|
| **NFR-PERF-1** | Performance | The This-Week landing surface renders fully (interactive, no spinners) within 1.5 seconds at the 95th percentile under normal load (≤10,000 Contacts, ≤500 active Projects). | MUST |
| **NFR-PERF-2** | Performance | Grid views with up to 10,000 rows must remain interactive (scroll, filter, sort) without freezing the UI thread for more than 100 ms in any interaction. | MUST |
| **NFR-PERF-3** | Performance | Weekly Briefing generation completes within 30 seconds end-to-end for the configured user cohort. | MUST |
| **NFR-PERF-4** | Performance | Voice transcription returns a draft Touch within 10 seconds for audio clips of ≤2 minutes. | SHOULD |
| **NFR-SEC-1** | Security | All Contact data (PII) is encrypted at rest and in transit (TLS 1.3 minimum on the wire). | MUST |
| **NFR-SEC-2** | Security | Founder accounts authenticate via passwordless or strong second factor. No password-only auth. | MUST |
| **NFR-SEC-3** | Security | The system does not transmit Contact PII or Touch content to external LLM providers without explicit Founder opt-in per content category (briefing, re-intro, conversation memory). | MUST |
| **NFR-REL-1** | Reliability | Inbound capture channels (email-forward, WhatsApp bot) are idempotent — receiving the same logical message twice produces exactly one Touch. | MUST |
| **NFR-REL-2** | Reliability | Obsidian sync conflicts never silently lose data — when last-write-wins discards a value, the discarded value is retained in a `.crm-history.md` log per Contact. | MUST |
| **NFR-REL-3** | Reliability | The system performs a daily backup of all transactional state (Contacts, Projects, Touches, Milestones, Tags). Backups retained for 30 days minimum. | MUST |
| **NFR-AI-1** | AI cost & latency | LLM-driven features (briefing, re-intro draft, conversation memory) operate within a configurable monthly cost ceiling. Exceeding the ceiling degrades gracefully (skip LLM, fall back to rule-based summary). | SHOULD |
| **NFR-AI-2** | AI quality | Re-Intro drafts and conversation summaries cite the source Touches they were generated from, so the Founder can verify the underlying context. | MUST |
| **NFR-OBS-1** | Observability | The system logs every Active Brain notification with its trigger rule, target Founder, and Founder action (clicked / dismissed / "not useful"). | SHOULD |
| **NFR-USE-1** | Usability | Capture-without-friction surfaces (voice memo, WhatsApp bot, email forward) require zero context-switching: a Founder must be able to add a new Contact end-to-end without leaving the channel they're in. | MUST |
| **NFR-USE-2** | Usability | Every AI-generated piece of content (draft, summary, briefing) is visibly marked as machine-generated and editable before the Founder acts on it. | MUST |
| **NFR-INTEG-1** | Integration | Calendar integration is read-only and scoped exclusively to Pre-Meeting Card delivery (FR-BRN-7); no calendar writes, no general scheduling integration. | MUST |

---

## §7 — Open Decisions (BLOCKING Validation Gate)

Per the 2026-05-25 owner-chat-agent learning ("two-stage authoring eliminates 90% of FR ambiguity"), these 10 decisions must be resolved before this HLR can be validated and converted into epics/stories. The 8 HMW questions from the brainstorm are surfaced here verbatim, plus 2 GigaRico added during FR writing.

| # | Decision | Affected FRs | Recommendation |
|---|---------|--------------|----------------|
| **D-01** | Conversation memory storage privacy: local LLM, hosted LLM with redaction, or self-hosted? | FR-BRN-5, FR-BRN-6, NFR-SEC-3, NFR-AI-1 | Hybrid: rule-based summary by default; hosted LLM only with explicit opt-in per Contact (tag `ai-ok`) |
| **D-02** | Intro-chain DAG seeding: prompt at every contact create, infer from forwarded emails, or both? | FR-CON-4, FR-NET-1 | Both: optional prompt on create + heuristic inference from forwarded email "introduced you to" patterns |
| **D-03** | Pipeline-stage definitions per template: needs Founder + cofounder interview to nail the actual Caney / VAV / BD workflows. | FR-PRJ-2, FR-PRJ-4, FR-PRJ-5 | **BLOCKER** — schedule joint working session before any template implementation begins |
| **D-04** | WhatsApp bot identity: one shared business number, or each Founder gets their own bot pairing? | FR-CAP-3, FR-CAP-4 | Per-Founder pairing — each Founder's bot recognizes their own number, so log-touch attribution is unambiguous |
| **D-05** | Primary relationship owner without permissions: both see everything, but who is the canonical owner for notifications? | FR-CON-1, FR-TEAM-2, FR-BRN-4 | Creator-by-default; reassignable at any time; both Founders get briefings on their owned items |
| **D-06** | Active Brain silence rule: when must the system NOT surface something? | FR-BRN-9, FR-BRN-10 | Suppress: archived contacts, `done`/`lost` projects, Contacts tagged `personal-only`, items rejected as "not useful" twice |
| **D-07** | Bilingual content (ES/EN) — both, or pick one for v1 internal tool? | All Founder-facing surfaces | English for v1 internal tool; Spanish defer to v1.5 only if external usage emerges |
| **D-08** | Usage instrumentation: what proves the CRM is being used? | NFR-OBS-1 | Track: contacts created by capture channel (target ≥80% non-manual), briefing → action conversion, 7-day DAU per Founder |
| **D-09** *(GigaRico)* | Voice transcription provider with PII handling: hosted (OpenAI Whisper API) or local (Whisper.cpp)? | FR-CAP-1, NFR-SEC-3 | Default local for privacy; hosted as opt-in fallback when local fails |
| **D-10** *(GigaRico)* | Obsidian vault location for the cofounder: separate vault or shared vault via Git/Syncthing? | FR-OBS-1, FR-OBS-2 | Each Founder syncs to their own vault; CRM is the cross-Founder source of truth; vault is a read-augmented mirror, not a sync hub |

---

## §8 — Phase-to-FR Traceability Matrix (for `/goal` and sprint planning)

Build order from brainstorm §Phase 2 priority ranking. Each phase must complete before the next begins; within a phase, FRs may run in parallel.

### Phase 0 — Foundation (no shippable user value, prerequisite)
- Tech stack ADR · Repo scaffolding · Auth (NFR-SEC-2) · Database schema · 2-Founder account creation

### Phase 1 — Deals as Projects (architectural keystone)
FR-CON-1, FR-CON-2, FR-CON-3, FR-CON-5, FR-CON-6, FR-CON-7
FR-PRJ-1, FR-PRJ-2, FR-PRJ-3, FR-PRJ-4, FR-PRJ-7
FR-TEAM-1, FR-TEAM-2
FR-WSP-1, FR-WSP-2, FR-WSP-3
FR-CAP-5 (manual web CRUD only)
NFR-PERF-2, NFR-SEC-1, NFR-REL-3

**Exit criteria:** Both Founders can create Contacts, create Projects from at least one template, switch workspace context, and see everything in basic grids. No AI, no bot, no Obsidian yet.

### Phase 2 — Platform & Surfaces (the "I can see everything" layer)
FR-GRD-1, FR-GRD-2, FR-GRD-3, FR-GRD-4, FR-GRD-5, FR-GRD-6
FR-PRJ-5, FR-PRJ-6
FR-BRN-3 (This-Week landing)
NFR-PERF-1

**Exit criteria:** Dynamic grids and Kanban operational. This-Week view is the default landing. Health colors computed.

### Phase 3 — Capture Without Friction
FR-CAP-1, FR-CAP-2, FR-CAP-3, FR-CAP-4
FR-OBS-1, FR-OBS-2, FR-OBS-3, FR-OBS-4
NFR-REL-1, NFR-REL-2, NFR-USE-1
*Depends on D-04, D-09, D-10 resolution.*

**Exit criteria:** ≥80% of new Contacts created via non-web channel (voice / email-forward / WhatsApp).

### Phase 4 — Active Brain (rule-based + LLM)
FR-BRN-1, FR-BRN-2, FR-BRN-4, FR-BRN-5, FR-BRN-6, FR-BRN-7, FR-BRN-8, FR-BRN-9
NFR-AI-1, NFR-AI-2, NFR-USE-2, NFR-INTEG-1
*Depends on D-01, D-06 resolution.*

**Exit criteria:** Weekly Briefing emails arriving Monday 7am. Watchdogs firing. Re-intro drafts requestable on demand.

### Phase 5 — Network Graph (the moat)
FR-CON-4, FR-CON-8
FR-NET-1, FR-NET-2

**Exit criteria:** Intro chain visible per Contact. Friend lens / All lens toggle operational.

### Phase 6 — SHOULDs (post-v1.0 fast-follow)
FR-PRJ-8, FR-PRJ-9
FR-NET-3, FR-NET-4, FR-NET-5
FR-CAP-6, FR-GRD-7, FR-BRN-10, FR-TEAM-3
NFR-PERF-4, NFR-AI-1, NFR-OBS-1

### Phase 7 — COULDs (v1.5 — re-evaluate post-launch)
FR-BRN-11 (Inbound-Triage AI) and other deferred items per brainstorm MoSCoW.

---

## §9 — Assumptions (Implementation-Mechanism Quarantine)

Per the 2026-05-14 leakage learning, technology and mechanism choices that *would otherwise creep into FR text* live here instead. FRs above are capability-only.

| Topic | Assumption | Rationale |
|-------|------------|-----------|
| Active Brain LLM | Hosted LLM (e.g., Claude, GPT-4 class) for briefing, re-intro, conversation memory. Deterministic rule engine for watchdog + waiting-on. Per D-01. | Cost + privacy + latency tradeoff |
| Voice transcription | Whisper-class model, default local per D-09 | Privacy-first default |
| WhatsApp transport | WhatsApp Business API (Meta) | Only sanctioned channel for programmatic WhatsApp |
| Obsidian sync mechanism | Filesystem watcher on the vault + a sync daemon (per-Founder) | Last-write-wins per field per FR-OBS-3 |
| Persistence | Relational store for Contact/Project/Touch/Milestone/Tag entities; queue/job system for async work (capture, transcription, briefing) | Inferred from §4 entity-volume model |
| Calendar | Read-only OAuth scope, narrowly limited to FR-BRN-7's needs (per NFR-INTEG-1) | Minimizes attack surface; honors prior "no calendar integration" stance except for the one earned use |

---

## §10 — Quality Self-Assessment

Per GigaRico SMART criteria:

| Dimension | Score | Evidence |
|-----------|-------|----------|
| Density | 9/10 | Capability-format throughout, no filler |
| Implementation-free | 8/10 | Mechanism quarantined to §9; one residual reference to "YAML frontmatter" in FR-OBS-2 (intentional — it's a file-format contract with the user's existing tool, not internal tech) |
| Traceability | 9/10 | Every FR cites a brainstorm Cat# or §Phase decision |
| Measurability | 8/10 | Most FRs are directly testable; some Active Brain FRs depend on D-01/D-06 resolution to be fully testable |
| SMART quality | 8/10 | Acceptance criteria present on MUSTs; SHOULDs lighter |
| Completeness | 8/10 | Cofounder collaboration depth deferred (user rejected Cat#46-48 explicitly); flagged as design intent, not gap |
| Actor coverage | 9/10 | Founder + Active Brain + Contact, all represented |
| Independence | 9/10 | Each FR self-contained; cross-references only to entity model + Phase numbers |

**Composite: 8.5 / 10 — GOOD.** Validation gate is OPEN once D-01 through D-10 are resolved.

---

## §11 — Recommended Next Steps

1. **Resolve D-01 through D-10** in a 60-90 min Founder + cofounder working session
2. Re-run GigaRico `validate agb-crm` to lock the quality score post-decisions
3. `/gigapaul` portfolio entry + sprint plan for Phase 0 (foundation)
4. Decompose Phase 1 FRs into epics + stories
5. Coordinate with GigaChad to generate test-coverage stubs from MUST FRs
6. Stub the `--CRM---` GitHub repo with this HLR + decisions log + tech-stack ADR
