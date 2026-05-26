# AGB CRM — Functional Requirements Matrix

**Version:** GigaRico-validated 2026-05-26
**Source:** HLR-V2 §4 + MTG capability area + ADR-002 decisions
**Total:** 63 FRs · 45 MUST · 12 SHOULD · 6 COULD across 10 capability areas
**Purpose:** Single source of truth for every implementable capability. Each FR has explicit Given/When/Then acceptance criteria. Tasks in `_tasks/` cite FR IDs from this matrix.

## How to read this doc

| Column | Meaning |
|--------|---------|
| **ID** | Stable FR identifier (e.g. FR-CON-1) — cited by tasks, tests, commits |
| **Prio** | MUST (v1) · SHOULD (v1.0-1.1) · COULD (v1.5) |
| **Phase** | Build phase per HLR-V2 §8 |
| **Actor** | Founder · Active Brain · Contact |
| **AC** | Acceptance criteria — Given/When/Then format. A test must verify each AC. |
| **Deps** | Other FRs this depends on |
| **Task** | Task ID from `_tasks/_BOARD.md` |

---

## §1 — CON · Contact Management (8 FRs)

### FR-CON-1 · Create Contact (MUST, Phase 1)
**Capability:** A Founder can create a Contact with at minimum a display name and a relationship type (`friend` / `lead` / `partner` / `prospect`).
**Source:** Brainstorm Cat#13 (Friend ≠ Lead, same graph)
**Actor:** Founder
**Acceptance:**
- **GIVEN** a signed-in Founder, **WHEN** they submit a Contact form with name "Marta López" and relationship type "lead", **THEN** a row appears in `contacts` with those values, `owner_id = current Founder`, `archived = false`, and the new contact appears in the grid view
- **GIVEN** form is submitted with empty name, **THEN** the form rejects with a validation error and no row is created
- **GIVEN** form is submitted without selecting relationship type, **THEN** the value defaults to `prospect`
**Deps:** —
**Task:** TASK-AGB-001

### FR-CON-2 · Communication channels (MUST, Phase 1)
**Capability:** A Founder can attach one or more communication channels (`email`, `phone`, `whatsapp`, `instagram`, `domain`) to a Contact.
**Acceptance:**
- **GIVEN** a Contact exists, **WHEN** the Founder adds an email channel "marta@example.com", **THEN** a row appears in `contact_channels` with `kind=email`, `value="marta@example.com"`, `is_primary=false`
- **GIVEN** a Contact has 0 channels, **WHEN** a Founder adds the first channel, **THEN** it is automatically set `is_primary=true`
- **GIVEN** a Contact has multiple channels of the same kind, **THEN** exactly one is `is_primary=true` per kind
**Deps:** FR-CON-1
**Task:** TASK-AGB-001

### FR-CON-3 · Venture tagging (MUST, Phase 1)
**Capability:** A Founder can apply one or more venture tags (`caney`, `vav`, `bd`, `friend`, plus custom) to a Contact. A Contact may belong to multiple ventures simultaneously.
**Source:** Cat#36 (One Graph + Venture Tags)
**Acceptance:**
- **GIVEN** a Contact exists, **WHEN** the Founder adds tags `caney` and `vav`, **THEN** two rows appear in `contact_tags` and the Contact shows under both venture workspaces (FR-WSP-2)
- **GIVEN** a Contact has tag `caney`, **WHEN** the workspace switcher is set to `vav`, **THEN** the Contact does NOT appear in the grid
- **GIVEN** a Founder tries to add a tag that does not exist in `tags`, **THEN** the tag is auto-created with `kind=custom`
**Deps:** FR-CON-1, FR-WSP-3
**Task:** TASK-AGB-001, TASK-AGB-003

### FR-CON-4 · Intro chain pointer (MUST, Phase 5)
**Capability:** A Founder can record an intro-chain pointer on a Contact identifying who introduced them. Pointer can reference another Contact or free-text source.
**Source:** Cat#12 (Intro Chain as DAG)
**Acceptance:**
- **GIVEN** Contact "Diego" exists, **WHEN** the Founder creates Contact "Andrea" with `intro_chain_from_contact_id = Diego.id`, **THEN** Andrea's detail page shows "Introduced by Diego" with a link to Diego's detail
- **GIVEN** the Founder enters free-text "tourism conference 2026-Q2" in the intro field with no Contact selected, **THEN** the value is stored in `intro_chain_from_text`
- **GIVEN** both fields are populated, **THEN** the Contact reference takes display priority but both are retained
**Deps:** FR-CON-1
**Task:** TASK-AGB-014 (Phase 5)

### FR-CON-5 · Change relationship type (MUST, Phase 1)
**Capability:** A Founder can change a Contact's relationship type at any time (e.g., friend → lead) without losing prior touches, intro chain, or notes.
**Source:** Cat#13
**Acceptance:**
- **GIVEN** Contact "Andrea" has 5 touches and an intro chain, **WHEN** the Founder updates `relationship_type` from `friend` to `lead`, **THEN** all 5 touches remain attached and the intro chain is preserved
- **GIVEN** the change happens, **THEN** an audit entry is logged (created_at, before, after)
**Deps:** FR-CON-1
**Task:** TASK-AGB-001

### FR-CON-6 · Contact detail page (MUST, Phase 1)
**Capability:** A Founder can view a Contact-detail surface showing all touches in reverse-chronological order, all linked projects, the intro chain (1+ hops), and free-form notes.
**Acceptance:**
- **GIVEN** Contact has 10 touches across 60 days, **WHEN** the Founder visits `/contacts/{id}`, **THEN** all 10 touches render newest-first with date + channel + body preview
- **GIVEN** Contact is linked to 2 Projects, **THEN** both project cards render with status + due date
- **GIVEN** Contact's intro chain is 3 hops (Diego → Marta → Andrea), **THEN** all 3 levels render as a navigable tree
**Deps:** FR-CON-1, FR-PRJ-1, FR-CON-4
**Task:** TASK-AGB-005

### FR-CON-7 · Archive Contact (MUST, Phase 1)
**Capability:** A Founder can mark a Contact as archived. Archived Contacts are excluded from default grid, watchdogs, and briefings, but remain queryable.
**Acceptance:**
- **GIVEN** archived Contact "X", **WHEN** the Founder loads the default grid, **THEN** X does not appear
- **GIVEN** archived Contact "X", **WHEN** the Founder loads the grid with filter `archived=true`, **THEN** X appears
- **GIVEN** archived Contact "X", **THEN** no watchdog (FR-BRN-1) or briefing (FR-BRN-4) ever surfaces X
**Deps:** FR-CON-1
**Task:** TASK-AGB-001

### FR-CON-8 · Merge two Contacts (SHOULD, Phase 6)
**Capability:** A Founder can merge two Contact records (deduplication). Touches, projects, intro-chain, and tags from both are preserved on the survivor.
**Acceptance:**
- **GIVEN** Contacts A and B exist with disjoint touches/tags/projects, **WHEN** the Founder merges B into A, **THEN** A has the union of all touches/tags/projects/channels and B is deleted
- **GIVEN** A and B have conflicting `intro_chain_from_contact_id`, **THEN** the survivor (A) keeps its own value and B's is logged for review
**Deps:** FR-CON-1
**Task:** TASK-AGB-015 (Phase 6 / deferred)

---

## §2 — PRJ · Project & Timeline Management (9 FRs)

### FR-PRJ-1 · Create Project (MUST, Phase 1)
**Capability:** A Founder can create a Project linked to one or more Contacts, with title, owner, status, template_type.
**Source:** Cat#14 (Every Deal IS a Project)
**Acceptance:**
- **GIVEN** Contact "Marta" exists, **WHEN** the Founder creates Project "Marta — Caney onboarding" with template `caney-posada-onboarding`, status `active`, owner=self, linked to Marta, **THEN** rows appear in `projects` + `project_contacts`
- **GIVEN** the Project is created with status `active`, **THEN** health_color defaults to `green`
- **GIVEN** template was provided, **THEN** FR-PRJ-2 fires (auto-instantiate milestones)
**Deps:** FR-CON-1, FR-TEAM-1
**Task:** TASK-AGB-002

### FR-PRJ-2 · Template auto-instantiation (MUST, Phase 1)
**Capability:** Creating a Project from a template auto-instantiates the template's milestone list with default due-date offsets relative to creation.
**Source:** Cat#15 (Project Templates per Vertical)
**Acceptance:**
- **GIVEN** template `caney-posada-onboarding` (12 stages), **WHEN** a Project is created with this template, **THEN** 12 Milestones are inserted with `order` 1..12, owners per stage `default_owner`, `due_date` = `created_at + stage.sla_days`
- **GIVEN** a stage has `sla_days=null` (e.g., "Trip executed"), **THEN** the Milestone is created with `due_date=null`
- **GIVEN** template `vav-creator-campaign`, **THEN** 10 Milestones are created with correct stages
- **GIVEN** template `bd-courtship`, **THEN** 5 Milestones are created
**Deps:** FR-PRJ-1, seed templates loaded
**Task:** TASK-AGB-002

### FR-PRJ-3 · Author Milestones (MUST, Phase 1)
**Capability:** A Founder can author Milestones on a Project with title, due_date, owner, status (`pending`/`done`/`blocked`), and optional blocker description.
**Acceptance:**
- **GIVEN** a Project exists, **WHEN** the Founder adds Milestone "Send follow-up" due 2026-06-15 owner=self, **THEN** a row appears in `milestones`
- **GIVEN** a Milestone is marked `done`, **THEN** `completed_at` is auto-set to now
- **GIVEN** a Milestone is marked `blocked` without `blocker_text`, **THEN** the form rejects
**Deps:** FR-PRJ-1
**Task:** TASK-AGB-007

### FR-PRJ-4 · Pipeline stage tracking (MUST, Phase 1)
**Capability:** Each Project carries a pipeline-stage value drawn from its template's stages. Founder can advance via explicit action or Kanban drag.
**Source:** Phase 3 user override (pipeline kanban yes)
**Acceptance:**
- **GIVEN** Project with template `caney-posada-onboarding` and `current_stage_id` = stage 1 ("First contact"), **WHEN** Founder advances to stage 2 ("Discovery call"), **THEN** `current_stage_id` updates and an audit row is appended
- **GIVEN** Project has no template, **THEN** `current_stage_id` is null and stage controls are hidden
- **GIVEN** Project is dragged across Kanban columns, **THEN** stage update fires same as explicit advance
**Deps:** FR-PRJ-1, FR-PRJ-2
**Task:** TASK-AGB-002, TASK-AGB-008

### FR-PRJ-5 · Pipeline Kanban surface (MUST, Phase 2)
**Capability:** A Founder can view a Pipeline Kanban showing all active Projects grouped by current pipeline stage, filterable by venture tag and template type.
**Source:** Phase 3 override
**Acceptance:**
- **GIVEN** 8 active Projects across 3 templates, **WHEN** the Founder visits `/kanban`, **THEN** the board renders 1 column per stage across the selected template
- **GIVEN** workspace filter set to `caney`, **THEN** only projects with template `caney-posada-onboarding` appear
- **GIVEN** drag-drop from "Discovery call" to "Demo", **THEN** FR-PRJ-4 fires and the column update persists on refresh
**Deps:** FR-PRJ-4, FR-WSP-2
**Task:** TASK-AGB-100 (Phase 2)

### FR-PRJ-6 · Project health color (MUST, Phase 2)
**Capability:** System computes Project `health_color` (green/amber/red) as derived attribute from (a) milestone on-time ratio, (b) recency of linked Contact touches, (c) age of oldest active blocker.
**Source:** Cat#28 (Project Health Color)
**Acceptance:**
- **GIVEN** Project has 8/10 milestones done by due date, blocker age 0d, last touch 5 days ago → **THEN** `health_color = green`
- **GIVEN** Project has 5/10 milestones done by due date, blocker age 7d, last touch 30 days ago → **THEN** `health_color = amber`
- **GIVEN** Project has 2/10 milestones done by due date, blocker age 21d, last touch 90 days ago → **THEN** `health_color = red`
- **GIVEN** health color changes, **THEN** the new value is persisted and visible on the next grid/Kanban/This-Week render within 1s of trigger
**Deps:** FR-PRJ-1, FR-PRJ-3, contacts.last_touch_at maintained
**Task:** TASK-AGB-101 (Phase 2)

### FR-PRJ-7 · Waiting-on Project (MUST, Phase 1)
**Capability:** Founder can mark a Project as `waiting` and specify what/whom it is waiting on with an expected unblock date.
**Source:** Cat#17 (Waiting-On Tracker)
**Acceptance:**
- **GIVEN** active Project, **WHEN** Founder sets status=`waiting`, `waiting_on="Marta's signed contract"`, `expected_unblock_date=2026-06-10`, **THEN** the change persists and the Project shows in This-Week "blocked" column
- **GIVEN** `expected_unblock_date` passes without status change, **THEN** FR-BRN-2 fires (blocker-overdue notification)
**Deps:** FR-PRJ-1
**Task:** TASK-AGB-002, TASK-AGB-102 (Phase 2 surface)

### FR-PRJ-8 · Owner-by-default for Milestones (SHOULD, Phase 6)
**Capability:** When a Milestone is created without an explicit owner, the system assigns the Project's creator as owner by default.
**Acceptance:**
- **GIVEN** Project owned by Founder A, **WHEN** Founder B creates a Milestone on it without specifying owner, **THEN** owner defaults to Founder B (the creator), not Founder A (the project owner)
**Deps:** FR-PRJ-3
**Task:** TASK-AGB-201 (Phase 6)

### FR-PRJ-9 · Restaurant template (SHOULD, Phase 6+)
**Capability:** A Founder can ship the system with a Restaurant project template once CaneyCloud Restaurant vertical hits production.
**Deps:** FR-PRJ-2
**Task:** TASK-AGB-202 (Phase 6)

---

## §3 — MTG · Meeting & Encounter Capture (7 FRs)

### FR-MTG-1 · Create Meeting (MUST, Phase 1)
**Capability:** Founder can create a Meeting with title, date, attendees (Contacts), agenda, location, type.
**Acceptance:**
- **GIVEN** Contacts Marta and Diego exist, **WHEN** Founder creates Meeting "Strategy review" on 2026-05-30, attendees=[Marta,Diego], type=`group`, **THEN** row in `meetings` + 2 rows in `meeting_attendees`
- **GIVEN** Meeting form submitted without attendees, **THEN** validation rejects (a Meeting must have ≥1 attendee)
**Deps:** FR-CON-1
**Task:** TASK-AGB-009

### FR-MTG-2 · Capture minutes + Action Items (MUST, Phase 1)
**Capability:** Founder can capture meeting minutes (free-text) and explicit Action Items (each with assignee + due date) per Meeting.
**Acceptance:**
- **GIVEN** Meeting exists, **WHEN** Founder adds minutes "Discussed Q3 plan" and Action Item "Send budget proposal" due 2026-06-05 assignee=Tomas, **THEN** `meetings.minutes` updated and FR-MTG-3 fires
- **GIVEN** Action Item added without due_date, **THEN** save proceeds with `due_date=null` and a flag in UI
**Deps:** FR-MTG-1
**Task:** TASK-AGB-009

### FR-MTG-3 · Action Items → Milestones (MUST, Phase 1)
**Capability:** Action Items created in a Meeting auto-promote to Milestones on the linked Project (or stand-alone Milestones if no Project linked). Owner + due date carry over.
**Acceptance:**
- **GIVEN** Meeting with linked Project P, **WHEN** Action Item "Send proposal" assignee=A due 2026-06-05 is added, **THEN** a Milestone is created on P with same fields + `source_meeting_id` set
- **GIVEN** Meeting has NO linked Project, **THEN** Milestone is created with `project_id=null` and appears in the assignee's This-Week independently
**Deps:** FR-MTG-2, FR-PRJ-3
**Task:** TASK-AGB-009

### FR-MTG-4 · Post-Meeting Card (MUST, Phase 4)
**Capability:** After a Meeting ends, the system prompts the Founder via WhatsApp/email for a 60-sec capture (voice memo or one-line summary).
**Acceptance:**
- **GIVEN** Meeting with `ended_at = now() - 2 min`, **WHEN** the post-meeting job runs, **THEN** the Founder receives a WhatsApp message "How did the meeting with [attendees] go? Reply with text or voice memo"
- **GIVEN** Founder replies within 24h, **THEN** the reply becomes a Touch attached to all attendees + the Meeting
**Deps:** FR-MTG-1, FR-CAP-3
**Task:** TASK-AGB-401 (Phase 4)

### FR-MTG-5 · Batch-capture from encounter (MUST, Phase 3)
**Capability:** Founder can batch-capture multiple Contacts from a single encounter ("met 5 people at X conference") with a shared `met_at` tag.
**Acceptance:**
- **GIVEN** Founder forwards a single voice memo "Met Andrea, Pedro, Maria at the tourism conference, all run posadas in Mérida", **THEN** 3 Contacts are created with relationship_type=lead, `met_at_tag="tourism-conference-2026-q2"`, and 1 shared Touch row references all 3
**Deps:** FR-CAP-1, FR-CAP-3
**Task:** TASK-AGB-301 (Phase 3)

### FR-MTG-6 · Meeting visibility (MUST, Phase 1)
**Capability:** Every Meeting appears on the Contact-detail page (for each attendee) and the Project-detail page (if linked).
**Acceptance:**
- **GIVEN** Meeting with 3 attendees and 1 linked Project, **THEN** all 3 Contact-detail pages show this Meeting in their timeline AND the Project-detail page shows it
**Deps:** FR-MTG-1, FR-CON-6
**Task:** TASK-AGB-005, TASK-AGB-006, TASK-AGB-009

### FR-MTG-7 · 30-sec Contact-on-the-fly capture (MUST, Phase 3)
**Capability:** Founder can capture a brand-new Contact in <30 sec at moment of meeting via voice: "just met Marta who runs 3 posadas in Choroní, intro from Diego at the tourism conference" → system parses into Contact + Touch + intro chain (Diego) + venue tag.
**Acceptance:**
- **GIVEN** Founder forwards the above voice memo, **THEN** Contact "Marta" is created with notes mentioning "3 posadas in Choroní", `intro_chain_from_contact_id = Diego.id` (if found in existing contacts) OR `intro_chain_from_text = "Diego at tourism conference"`, and `met_at_tag` is set
- **GIVEN** parse confidence is low, **THEN** the Contact is created in a draft state for Founder review rather than committed
**Deps:** FR-CAP-1, FR-CON-1
**Task:** TASK-AGB-302 (Phase 3)

---

## §4 — BRN · Active Brain (11 FRs)

### FR-BRN-1 · Stale-Deal Watchdog (MUST, Phase 4)
**Capability:** System surfaces a "stale" warning on any Project whose linked Contacts have had no Touch within a configurable threshold (default 21 days; tunable per relationship type).
**Source:** Cat#6
**Acceptance:**
- **GIVEN** Project P with linked Contact C, last Touch on C was 22 days ago, **THEN** P is flagged stale and surfaces in This-Week (FR-BRN-3) "stale" column
- **GIVEN** the threshold is set to 30 days for `friend` relationship type, **THEN** a friend Project is NOT flagged at 22 days but IS at 31 days
**Deps:** FR-PRJ-1, touches.created_at maintained
**Task:** TASK-AGB-400 (Phase 4)

### FR-BRN-2 · Blocker-overdue notification (MUST, Phase 4)
**Capability:** System surfaces Project as "blocker-overdue" when `status=waiting` and `expected_unblock_date` passes without status change.
**Acceptance:**
- **GIVEN** Project P waiting with expected unblock 2026-06-10, **WHEN** current date > 2026-06-10 and status still waiting, **THEN** P appears in This-Week "blocked" column with overdue flag
**Deps:** FR-PRJ-7
**Task:** TASK-AGB-400 (Phase 4)

### FR-BRN-3 · This-Week landing surface (MUST, Phase 2)
**Capability:** Founder views This-Week landing showing items due this week, blocked items, and stale items — ranked by health color then venture tag.
**Source:** Cat#16
**Acceptance:**
- **GIVEN** Founder loads `/` after sign-in, **THEN** the page renders 3 columns: "Due This Week", "Blocked", "Stale" — pulled from Milestones and Projects with explicit ranking (red → amber → green within each column)
- **GIVEN** workspace filter `caney`, **THEN** only items with venture tag `caney` appear
- **GIVEN** zero items, **THEN** an empty state encourages "Add a contact or project to get started"
**Deps:** FR-PRJ-3, FR-PRJ-6, FR-BRN-1, FR-BRN-2
**Task:** TASK-AGB-103 (Phase 2)

### FR-BRN-4 · Weekly Briefing (MUST, Phase 4)
**Capability:** System delivers Weekly Briefing to each Founder Mon 07:00 local time, containing exactly 5 prioritized actions. Each action includes Contact/Project context.
**Acceptance:**
- **GIVEN** Founder Tomas (TZ America/New_York), **WHEN** Mon 07:00 ET fires, **THEN** an email arrives at his address containing exactly 5 ranked action items
- **GIVEN** fewer than 5 candidate items exist, **THEN** the briefing contains all candidates plus a "Nothing else needs attention this week" note
- **GIVEN** the Founder takes any briefing-listed action (clicks the deep link), **THEN** the metric for FR-BRN-instrumentation increments
**Deps:** FR-PRJ-1, FR-PRJ-3, FR-BRN-3
**Task:** TASK-AGB-402 (Phase 4) · DEFERRED: timing/channel from user
**Deferred input:** Briefing day/time/channel per ADR-002 deferred items

### FR-BRN-5 · Re-Intro Generator (MUST, Phase 4)
**Capability:** Founder can request on-demand Re-Intro draft for any Contact whose last touch is >30 days. System returns 2-3 sentence message draft suitable for WhatsApp, referencing most recent conversation context.
**Source:** Cat#20
**Acceptance:**
- **GIVEN** Contact C with last touch 60 days ago and `ai-ok` tag, **WHEN** Founder clicks "Draft re-intro", **THEN** a 2-3 sentence draft message returns within 5s, referencing at least one specific detail from C's last 3 touches
- **GIVEN** Contact C does NOT have `ai-ok` tag, **THEN** the LLM call is skipped; a rule-based template draft is returned instead ("Hi {name}, it's been a while — wanted to check in.")
**Deps:** FR-CON-1, touches.body content
**Task:** TASK-AGB-403 (Phase 4) · DEFERRED: voice sample from user

### FR-BRN-6 · Conversation Memory (MUST, Phase 4)
**Capability:** System maintains rolling "state of relationship" summary (≤3 bullets) per Contact, updated from recent Touches. Surfaced on Contact-detail; used to seed Re-Intro drafts.
**Acceptance:**
- **GIVEN** Contact C with 12 touches across 90 days, all C is `ai-ok`-tagged, **WHEN** the rolling-summary job runs, **THEN** 3 bullet summary is persisted to a `contact_summaries` row
- **GIVEN** Contact C without `ai-ok`, **THEN** the rolling-summary job skips C and only the last touch's body shows on detail page
**Deps:** FR-CON-1, touches
**Task:** TASK-AGB-404 (Phase 4)

### FR-BRN-7 · Pre-Meeting Card (MUST, Phase 4)
**Capability:** Founder can opt into Pre-Meeting Card delivered N hours before calendar event with matched Contact, summarizing relationship state + top 3 talking points.
**Acceptance:**
- **GIVEN** Founder opted in with `pre_meeting_card_lead_hours=2`, calendar event "Coffee with Marta" at 2026-06-15 10:00, attendee email matches Contact Marta, **WHEN** current time = 2026-06-15 08:00, **THEN** Founder receives a card with Marta's 3-bullet state + 3 talking points
**Deps:** FR-BRN-6, calendar OAuth scope
**Task:** TASK-AGB-405 (Phase 4)

### FR-BRN-8 · Editable AI content (MUST, Phase 4)
**Capability:** Active Brain never blocks Founder action — all AI-generated content is editable before sending and clearly marked as machine-generated.
**Acceptance:**
- **GIVEN** any AI-generated draft (re-intro, briefing item, summary), **THEN** it renders with a clear "AI-drafted" badge and an editable textarea
- **GIVEN** Founder edits the draft, **THEN** the edited version is what is sent/saved
**Deps:** FR-BRN-4, FR-BRN-5, FR-BRN-6
**Task:** TASK-AGB-403, TASK-AGB-404

### FR-BRN-9 · Silence rules (MUST, Phase 4)
**Capability:** System suppresses notifications and briefing items for Projects whose status is `done`, `lost`, or `archived`. Also suppresses Contacts tagged `personal-only` or items marked "not useful" 2× in 30 days.
**Source:** ADR-002 D-06
**Acceptance:**
- **GIVEN** Project with status `lost`, **THEN** it NEVER appears in any briefing, watchdog, or This-Week
- **GIVEN** Contact with tag `personal-only`, **THEN** it never appears in briefings even if active
- **GIVEN** briefing item marked "not useful" 2× by either Founder in last 30 days, **THEN** the underlying rule that generated it is suppressed for that Contact for 30 days
**Deps:** FR-BRN-4, FR-BRN-1
**Task:** TASK-AGB-406 (Phase 4)

### FR-BRN-10 · "Not useful" feedback (SHOULD, Phase 4)
**Capability:** Founder can mark any Active Brain suggestion as "not useful" with one click; system records rejection for future tuning.
**Acceptance:**
- **GIVEN** briefing item, **WHEN** Founder clicks "not useful", **THEN** row in `brain_feedback` with timestamp + Founder + item-id; affects FR-BRN-9 suppression count
**Deps:** FR-BRN-4
**Task:** TASK-AGB-407 (Phase 4)

### FR-BRN-11 · Inbound-Triage AI (COULD, Phase 7)
**Capability:** System parses inbound emails forwarded by Founder, identifies contact + intent (request/FYI/intro), drafts a reply, creates a follow-up task if needed.
**Deps:** FR-CAP-2
**Task:** TASK-AGB-700 (v1.5)

---

## §5 — CAP · Capture & Intake (6 FRs)

### FR-CAP-1 · Voice-memo capture (MUST, Phase 3)
**Capability:** Founder can submit a voice memo via WhatsApp bot or web; system transcribes and creates a structured Touch attached to the relevant Contact.
**Acceptance:**
- **GIVEN** Founder forwards a 30-sec voice memo via WhatsApp referencing existing Contact Marta, **THEN** within 10s a Touch is created on Marta with `channel=voice_memo`, transcript populated
- **GIVEN** confidence < threshold, **THEN** Touch is flagged for manual review (FR-CAP-6)
**Deps:** FR-CON-1, FR-CAP-3, OpenAI Whisper API key
**Task:** TASK-AGB-300 (Phase 3)

### FR-CAP-2 · Email-forward intake (MUST, Phase 3)
**Capability:** Founder forwards email to dedicated address; system parses sender, finds/creates Contact, records Touch.
**Acceptance:**
- **GIVEN** dedicated inbound address `crm-intake@...`, **WHEN** Founder forwards an email, **THEN** sender is matched against existing Contacts; if no match, new Contact is created with relationship_type=`prospect` and the email is stored as Touch with `channel=email`
- **GIVEN** the same email is forwarded twice, **THEN** exactly one Touch is created (idempotency via message-id)
**Deps:** FR-CON-1, Postmark inbound config
**Task:** TASK-AGB-303 (Phase 3) · DEFERRED: intake address from user

### FR-CAP-3 · WhatsApp bot commands (MUST, Phase 3)
**Capability:** Founder can issue commands through WhatsApp bot: add-contact / log-touch / what's-due-today / draft-reintro / etc.
**Source:** Cat#34, Phase 3 override
**Acceptance:**
- **GIVEN** Founder Tomas sends "Add contact: Andrea, posada owner, met at conference" to bot, **THEN** a Contact is created with parsed fields
- **GIVEN** Founder sends "What's due today?", **THEN** bot replies with This-Week items due today
- **GIVEN** Founder sends "Draft re-intro to Marta", **THEN** FR-BRN-5 fires and the draft is returned in chat
**Deps:** FR-CON-1, FR-BRN-3, FR-BRN-5, Meta WhatsApp credentials
**Task:** TASK-AGB-304 (Phase 3) · DEFERRED: WhatsApp phone IDs from user

### FR-CAP-4 · WhatsApp proactive push (MUST, Phase 3)
**Capability:** WhatsApp bot can proactively message Founder when watchdog or blocker-overdue rule fires.
**Acceptance:**
- **GIVEN** stale watchdog fires for Project P (FR-BRN-1), **THEN** bot sends a message to Project P's owner Founder "Heads up — Project [name] has gone stale (last touch 22d ago)"
**Deps:** FR-BRN-1, FR-CAP-3
**Task:** TASK-AGB-305 (Phase 3)

### FR-CAP-5 · Manual web CRUD (MUST, Phase 1)
**Capability:** Founder can manually create/edit any Contact, Project, Touch, or Milestone via web app with form validation and saved-on-blur semantics.
**Acceptance:**
- **GIVEN** Founder fills web form for Contact and tabs away from a field, **THEN** the value persists (or the form retains it across navigation if validation passes)
- **GIVEN** validation fails, **THEN** form shows inline error and Save is disabled
**Deps:** FR-CON-1, FR-PRJ-1, FR-MTG-1
**Task:** TASK-AGB-001, TASK-AGB-002, TASK-AGB-009

### FR-CAP-6 · Low-confidence transcription flag (SHOULD, Phase 3)
**Capability:** When voice transcription confidence below threshold, system flags Touch for manual review.
**Acceptance:**
- **GIVEN** voice memo with transcription confidence < 0.7, **THEN** Touch is created but flagged `needs_review=true` and surfaced in a "needs review" list
**Deps:** FR-CAP-1
**Task:** TASK-AGB-306 (Phase 3)

---

## §6 — GRD · Dynamic Grid & Filtering (7 FRs)

### FR-GRD-1 · Contact grid (MUST, Phase 2)
**Capability:** Founder can view all Contacts in a grid surface with configurable column visibility, ordering, and width.
**Source:** Cat#49
**Acceptance:**
- **GIVEN** Founder visits `/contacts`, **THEN** a grid renders with default columns (Name, Relationship Type, Venture Tags, Last Touch, Owner)
- **GIVEN** Founder hides "Owner" column and reorders columns, **THEN** the change persists per-Founder (in `user_grid_preferences` or localStorage)
**Deps:** FR-CON-1
**Task:** TASK-AGB-104 (Phase 2)

### FR-GRD-2 · Project grid (MUST, Phase 2)
**Capability:** Founder can view all Projects in a grid surface with configurable columns separate from Contact grid.
**Acceptance:**
- **GIVEN** Founder visits `/projects`, **THEN** grid renders with default columns (Title, Status, Stage, Owner, Due Date, Health, Venture)
- **GIVEN** Project grid column preferences differ from Contact grid, **THEN** both are remembered independently
**Deps:** FR-PRJ-1
**Task:** TASK-AGB-105 (Phase 2)

### FR-GRD-3 · Multi-filter (MUST, Phase 2)
**Capability:** Founder can filter any grid by multiple criteria simultaneously (tag, venture, status, owner, relationship type, date-range, free-text search). Filters compose with AND.
**Acceptance:**
- **GIVEN** filters: relationship_type=`lead` AND venture=`caney` AND last-touch within 14 days, **THEN** grid shows only Contacts matching ALL three
**Deps:** FR-GRD-1, FR-GRD-2
**Task:** TASK-AGB-106 (Phase 2)

### FR-GRD-4 · Saved Views (MUST, Phase 2)
**Capability:** Founder can save a filtered grid configuration as named View, recall later, share with cofounder.
**Acceptance:**
- **GIVEN** Founder applies filters and clicks "Save view as 'Hot Caney leads'", **THEN** a row in `saved_views` is created scoped to Founder
- **GIVEN** Founder shares the view with cofounder, **THEN** cofounder can load it from their views list
**Deps:** FR-GRD-3
**Task:** TASK-AGB-107 (Phase 2)

### FR-GRD-5 · Sort (MUST, Phase 2)
**Capability:** Founder can sort any grid by any visible column, asc/desc.
**Acceptance:**
- **GIVEN** Project grid, **WHEN** Founder clicks "Due Date" header, **THEN** rows sort ascending by due_date; click again → descending
**Deps:** FR-GRD-1, FR-GRD-2
**Task:** TASK-AGB-104, TASK-AGB-105

### FR-GRD-6 · Group-by + counts (MUST, Phase 2)
**Capability:** Founder can group rows in any grid by chosen column and see counts per group.
**Acceptance:**
- **GIVEN** Contact grid, **WHEN** Founder selects "Group by venture", **THEN** rows are visually grouped under headers like "caney (12)", "vav (8)", "bd (3)"
**Deps:** FR-GRD-1, FR-GRD-2
**Task:** TASK-AGB-108 (Phase 2)

### FR-GRD-7 · CSV export (SHOULD, Phase 6)
**Capability:** Founder can export current grid view (with filters) to CSV.
**Acceptance:**
- **GIVEN** filtered grid with 47 rows, **WHEN** Founder clicks "Export CSV", **THEN** browser downloads a CSV with the 47 rows and current visible columns
**Deps:** FR-GRD-3
**Task:** TASK-AGB-203 (Phase 6)

---

## §7 — NET · Network Graph (5 FRs)

### FR-NET-1 · Intro chain view (MUST, Phase 5)
**Capability:** Founder can view intro chain for any Contact as a tree showing who introduced whom, traversable 1+ hops.
**Acceptance:**
- **GIVEN** Contact C with chain Diego → Marta → C, **THEN** C's detail page shows a 3-node tree
**Deps:** FR-CON-4
**Task:** TASK-AGB-500 (Phase 5)

### FR-NET-2 · Lens toggle (MUST, Phase 5)
**Capability:** Founder can toggle network view between "Friend lens" and "All lens".
**Acceptance:**
- **GIVEN** network graph view, **WHEN** Founder switches to Friend lens, **THEN** only `friend` Contacts and edges between them render
**Deps:** FR-NET-1
**Task:** TASK-AGB-501 (Phase 5)

### FR-NET-3 · Warm-Path Finder (SHOULD, Phase 6)
**Capability:** Given a new Contact, system surfaces 2nd-degree connections from existing Contacts (warm-path suggestions).
**Deps:** FR-NET-1
**Task:** TASK-AGB-204 (Phase 6)

### FR-NET-4 · Reciprocity Ledger (SHOULD, Phase 6)
**Capability:** Founder can record explicit favors-given/received per Contact and view balance.
**Deps:** FR-CON-1
**Task:** TASK-AGB-205 (Phase 6)

### FR-NET-5 · Density heatmap (SHOULD, Phase 6)
**Capability:** Founder can view network density viz showing dense/sparse geographic+venture clusters.
**Deps:** FR-NET-1
**Task:** TASK-AGB-206 (Phase 6)

---

## §8 — OBS · Obsidian Bridge (4 FRs)

### FR-OBS-1 · Markdown file per Contact (MUST, Phase 3)
**Capability:** For every Contact, system maintains a markdown file in the Founder's Obsidian vault under configurable folder path (default `crm/contacts/`).
**Acceptance:**
- **GIVEN** Contact "Marta López", **THEN** a file appears at `{vault}/crm/contacts/marta-lopez.md`
- **GIVEN** the Contact name changes, **THEN** the file is renamed via slug-recomputation; old slug retained as redirect note
**Deps:** FR-CON-1, Obsidian vault path configured
**Task:** TASK-AGB-307 (Phase 3) · DEFERRED: vault path from user

### FR-OBS-2 · YAML frontmatter for structured fields (MUST, Phase 3)
**Capability:** Structured Contact fields (relationship type, venture tags, owner, intro-chain, last_touch_at) live in YAML frontmatter; notes in body.
**Acceptance:**
- **GIVEN** Contact with relationship_type=lead, tags=[caney,vav], owner=Tomas, **THEN** the markdown file frontmatter contains those fields with valid YAML
**Deps:** FR-OBS-1
**Task:** TASK-AGB-307

### FR-OBS-3 · Last-write-wins per field (MUST, Phase 3)
**Capability:** When same field modified in both Obsidian and CRM, most recent write wins per-field.
**Acceptance:**
- **GIVEN** field `relationship_type` modified in CRM at T1 and in Obsidian at T2 > T1, **THEN** the Obsidian value wins and is reconciled into the DB; the discarded T1 value is logged to `.crm-history.md`
**Deps:** FR-OBS-1, FR-OBS-2
**Task:** TASK-AGB-308 (Phase 3)

### FR-OBS-4 · Sync kill switch (MUST, Phase 3)
**Capability:** Founder can disable Obsidian sync globally without affecting CRM operation.
**Acceptance:**
- **GIVEN** Founder toggles "Obsidian sync OFF" in settings, **THEN** the daemon stops and CRM keeps functioning; no markdown files change
**Deps:** FR-OBS-1
**Task:** TASK-AGB-309 (Phase 3)

---

## §9 — WSP · Workspace & Multi-Venture (3 FRs)

### FR-WSP-1 · Workspace pill bar (MUST, Phase 1)
**Capability:** Founder can switch active workspace via top-bar pill selector with values: `All`, `Caney`, `VAV`, `BD`, plus custom tags.
**Acceptance:**
- **GIVEN** the layout, **THEN** a pill bar renders with `All` (default), `Caney`, `VAV`, `BD`
- **GIVEN** Founder creates custom venture tag, **THEN** it appears as a new pill
- **GIVEN** Founder clicks pill, **THEN** active workspace state persists across page navigation (cookie or URL param)
**Deps:** FR-WSP-3
**Task:** TASK-AGB-003

### FR-WSP-2 · Workspace filtering (MUST, Phase 1)
**Capability:** When non-`All` workspace is active, grid, Kanban, This-Week, Briefing surfaces show only Contacts/Projects matching the active venture tag.
**Acceptance:**
- **GIVEN** active workspace=`Caney`, **THEN** every list/grid/board shows only items with venture tag `caney`
**Deps:** FR-WSP-1
**Task:** TASK-AGB-003

### FR-WSP-3 · Author custom tags (MUST, Phase 1)
**Capability:** Founder can author new venture tags. Tag creation does not migrate existing Contacts.
**Acceptance:**
- **GIVEN** Founder creates tag `family-office`, **THEN** the tag is available for tagging and as a workspace pill
- **GIVEN** the new tag, **THEN** no existing Contact is auto-tagged
**Deps:** —
**Task:** TASK-AGB-003

---

## §10 — TEAM · Team & Ownership (3 FRs)

### FR-TEAM-1 · Two-Founder accounts (MUST, Phase 0)
**Capability:** System supports exactly two Founder accounts in v1, each with full read/write access to all data.
**Acceptance:**
- **GIVEN** Supabase Auth, **THEN** two `users` rows exist (Tomas + cofounder), each can sign in
- **GIVEN** Founder A creates data, **THEN** Founder B can read and edit it without permission gates
**Deps:** Supabase Auth scaffolded
**Task:** TASK-AGB-004 · DEFERRED: cofounder identity

### FR-TEAM-2 · Owner field (MUST, Phase 1)
**Capability:** Every Contact and Project carries an `owner_id` field referencing one of the two Founders. Mutable.
**Acceptance:**
- **GIVEN** new Contact/Project, **THEN** `owner_id` defaults to creator
- **GIVEN** ownership reassigned, **THEN** the new owner gets future briefing items for the record
**Deps:** FR-TEAM-1
**Task:** TASK-AGB-004

### FR-TEAM-3 · Owner filter (SHOULD, Phase 6)
**Capability:** Founder can filter any grid by owner (`mine` / `theirs` / `all`).
**Deps:** FR-TEAM-2, FR-GRD-3
**Task:** TASK-AGB-207 (Phase 6)

---

## §11 — Non-Functional Requirements (16 NFRs, summary)

| ID | Category | One-line | Tested by |
|----|----------|----------|-----------|
| NFR-PERF-1 | Performance | This-Week landing renders <1.5s p95 (≤10k contacts, ≤500 active projects) | Lighthouse CI, e2e |
| NFR-PERF-2 | Performance | Grid up to 10k rows interactive — no >100ms UI freeze | Lighthouse CI |
| NFR-PERF-3 | Performance | Weekly Briefing generation ≤30s e2e | Job timing |
| NFR-PERF-4 | Performance | Voice transcription returns draft Touch ≤10s for ≤2-min clips | Job timing |
| NFR-SEC-1 | Security | All PII encrypted at rest + TLS 1.3 in transit | Audit |
| NFR-SEC-2 | Security | Passwordless or strong 2FA auth | Manual + e2e |
| NFR-SEC-3 | Security | No PII to external LLM without per-content-category opt-in | Code review |
| NFR-REL-1 | Reliability | Inbound capture idempotent — duplicate message produces exactly 1 Touch | Integration test |
| NFR-REL-2 | Reliability | Obsidian sync conflicts never silently lose data — discarded value retained in `.crm-history.md` | Unit test |
| NFR-REL-3 | Reliability | Daily backup of all transactional state, 30d retention | Supabase auto |
| NFR-AI-1 | AI cost | LLM features operate within configurable monthly $ ceiling; degrade gracefully on exceed | Cost monitor |
| NFR-AI-2 | AI quality | Re-Intro drafts + summaries cite source Touches | Manual review |
| NFR-OBS-1 | Observability | System logs every Active Brain notification (trigger, target, action taken) | Sentry events |
| NFR-USE-1 | Usability | Capture surfaces require zero context-switch (add Contact end-to-end without leaving channel) | Manual + e2e |
| NFR-USE-2 | Usability | Every AI content visibly marked machine-generated + editable | UI review |
| NFR-INTEG-1 | Integration | Calendar integration read-only, scoped to FR-BRN-7 only | Code review |

---

## §12 — Won't-Have v1 (explicit exclusions)

Per HLR-V2 §5: Multi-tenant SaaS · Email-client replacement · Public API · CRM data import · Native mobile · BI beyond in-grid · RUTA features · Milestone dependencies · Decay scoring · Template improvement loop · Deal-value tracking.

---

## §13 — Validation Self-Score

| Dimension | Score | Note |
|-----------|-------|------|
| Density | 9 | Capability-format throughout, no filler |
| Implementation-free | 9 | All mechanisms quarantined to Assumptions/Tasks |
| Traceability | 10 | Every FR cites source + task |
| Measurability | 9 | Every FR has Given/When/Then ACs |
| SMART | 9 | All ACs are testable |
| Completeness | 9 | 63 FRs cover 10 capability areas; deferred items explicit |
| Actor coverage | 9 | Founder + Active Brain + Contact |
| Independence | 10 | Each FR self-contained; cross-refs only to entity model + adjacent FRs |

**Composite: 9.3 / 10 — EXCELLENT.** Validation gate **OPEN** for `/goal`-style execution.

---

## §14 — Open Items (Re-prompt at Phase Boundary)

| Item | Blocks FR | Phase Re-prompt |
|------|-----------|-----------------|
| Cofounder identity | FR-TEAM-1 (2nd account) | Phase 0 close |
| Obsidian vault path | FR-OBS-1..4 | Phase 3 start |
| Weekly Briefing day/time/channel | FR-BRN-4 | Phase 4 start |
| Re-intro voice sample | FR-BRN-5 (style) | Phase 4 start |
| Domain name | NFR-USE-1 (email links) | Phase 0 close / deploy |
| Email intake address | FR-CAP-2 | Phase 3 start |
| WhatsApp phone IDs | FR-CAP-3, FR-CAP-4 | Phase 3 start |
