# AGB CRM — Roadmap Module V1 · Functional Requirements

**Version:** GigaRico 2026-06-10
**Source:** Brainstorm session `_bmad-output/brainstorming/brainstorming-session-2026-06-10-1049-agb-crm-roadmap-module.md` (decisions D1–D12, SCAMPER S1–R18, pre-mortem inversions 1–10)
**Sibling of:** `FR-MATRIX.md` (core CRM, stable citation target — this doc versions independently per the FR-DOCS-LINKS pattern)
**Total:** 41 FRs (30 MUST · 7 SHOULD · 4 COULD) + 7 NFRs across 8 capability areas
**Task bucket:** TASK-AGB-7xx (reserved; 6xx = docs/links module)

## How to read this doc

Same conventions as FR-MATRIX.md: stable IDs (`FR-RMD-1`), MoSCoW priority, wave (build phase), actor, Given/When/Then acceptance. Tasks cite FR IDs.

**Actors:** Founder (any workspace member), Agent (WA voice-note / MCP / call-recorder automations), Partner (partner-room member, read-only), System.

---

## §0 — Design Invariants (operator-locked, from brainstorm D1–D12)

These are constraints, not FRs. Every FR below must be implementable without violating them.

| ID | Invariant |
|----|-----------|
| INV-1 | The database is the single source of truth. Markdown is an interchange format and planning artifact — never a live mirror. |
| INV-2 | Simplicity first. Prefer fewer, obvious mechanisms. No CRDT / real-time co-editing infrastructure; last-write-wins with attribution. |
| INV-3 | No raw markdown editor inside the CRM. In-product editing is inline structured editing only; raw md lives outside. |
| INV-4 | Deliverables are not an entity. A "deliverable" is a milestone with children (`parent_milestone_id`). One work-item table. |
| INV-5 | Action items are a separate, cheap capture layer. Linking is optional and after-the-fact. Capture flow gains no required fields. |
| INV-6 | Owners are always CRM workspace users. No external-owner modeling. |
| INV-7 | Initiatives are created/edited only in the roadmap module (and via import). Everywhere else: read-only. |
| INV-8 | Progress is computed from child work items, never typed. Health color stays human-set. |
| INV-9 | Import never hard-deletes. Disappearance from a file is at most an unchecked archive proposal. |
| INV-10 | Builds on existing tables (`initiatives`, `milestones`, `action_items`, `themes`, `sprints`, `plan` joins). Schema delta is §10 only. |

---

## §1 — RMD · Markdown Round-Trip (12 FRs)

Purpose: the plan can leave the CRM (for planning sessions, external AI editing) and come back without duplication, data loss, or clobbering reality.

### FR-RMD-1 · Export roadmap as markdown (MUST, Wave 1)
**Capability:** A Founder can export the current roadmap — all non-archived initiatives with their milestones/tasks, owners, dates, status, and success criteria — as a single markdown document conforming to the Roadmap-MD contract (§9).
**Source:** Brainstorm D1/D2; motive "easy ingestion + plan anywhere."
**Acceptance:**
- **GIVEN** a workspace with 3 initiatives and 12 milestones, **WHEN** the Founder exports, **THEN** the document contains all 3 initiatives and all 12 milestones with their stable ID markers, and a header declaring the plan version it was generated from
- **GIVEN** an export, **WHEN** it is re-imported unmodified, **THEN** the diff preview shows zero proposed changes (round-trip identity)
- **GIVEN** an archived initiative, **THEN** it is excluded from export by default

### FR-RMD-2 · Copy for AI (MUST, Wave 1)
**Capability:** A Founder can copy, in one action, a clipboard payload containing an instruction header (including "preserve ID marker lines"), the Roadmap-MD format summary, and the current export — ready to paste into any external AI tool.
**Source:** Brainstorm motive #2 (edit in other AI platforms); SCAMPER C6.
**Acceptance:**
- **GIVEN** the roadmap page, **WHEN** Founder clicks "Copy for AI", **THEN** the clipboard contains instruction header + format spec + full export in one paste
- **GIVEN** the payload pasted into an LLM with "add an initiative" request, **THEN** the format spec in the payload is sufficient for the LLM to produce a valid importable document (verified manually against ≥2 AI tools)

### FR-RMD-3 · Import by paste or file (MUST, Wave 1)
**Capability:** A Founder can begin an import by pasting markdown text (primary motion) or uploading a `.md` file (secondary).
**Source:** SCAMPER S2 (paste is the real user motion).
**Acceptance:**
- **GIVEN** the import surface, **WHEN** Founder pastes a 200KB markdown document, **THEN** a diff preview is produced
- **GIVEN** arbitrary non-roadmap text is pasted, **THEN** no database write occurs and the preview reports zero parseable entities

### FR-RMD-4 · Staged diff preview (MUST, Wave 1)
**Capability:** A Founder can review every proposed change from an import — categorized as create / update / archive-proposal / conflict — and accept or reject per change or in bulk, before anything is written.
**Source:** Brainstorm D3; SCAMPER A7 (PR-style); pre-mortem #3/#9.
**Acceptance:**
- **GIVEN** a file that adds 1 initiative, edits 2 milestone due dates, and omits 1 existing milestone, **WHEN** previewed, **THEN** the preview shows exactly 1 create, 2 updates, 1 archive proposal (unchecked), with old→new values visible per update
- **GIVEN** an open preview, **WHEN** the Founder abandons it, **THEN** the database is unchanged
- **GIVEN** a preview, **WHEN** Founder unchecks one update and applies, **THEN** only the accepted changes are written

### FR-RMD-5 · Stable-ID entity matching (MUST, Wave 1)
**Capability:** The System matches imported entities to existing records by their embedded stable ID: known ID → update; no ID → create; the same import can never duplicate an entity that carries its ID.
**Source:** Brainstorm D2 / Architecture #1.
**Acceptance:**
- **GIVEN** an exported doc where a milestone title is reworded (ID marker intact), **WHEN** imported, **THEN** the preview shows 1 update to that milestone, not a create+archive pair
- **GIVEN** a new heading with no ID marker, **THEN** the preview shows it as a create
- **GIVEN** an ID marker that matches no record in this workspace, **THEN** the line is flagged as unmatched in the parse report, not silently created

### FR-RMD-6 · Fuzzy fallback for stripped IDs (MUST, Wave 1)
**Capability:** When an entity arrives without an ID but its title and parent context closely match an existing record, the System presents it as a "probable update" requiring explicit Founder confirmation (never auto-applied).
**Source:** Pre-mortem #4 (external AIs WILL strip comment lines).
**Acceptance:**
- **GIVEN** an export whose ID comments were removed by an AI rewrite but titles preserved, **WHEN** imported, **THEN** ≥90% of entities are offered as probable updates rather than creates
- **GIVEN** a probable update left unconfirmed, **WHEN** applied, **THEN** it is skipped (neither created nor updated) and listed in the result summary

### FR-RMD-7 · Three-way merge against base snapshot (MUST, Wave 1)
**Capability:** When an imported document declares its base plan version, the System computes changes against that snapshot, so a field edited in the CRM after the export is detected as a conflict rather than silently overwritten.
**Source:** Brainstorm D4 / Architecture #2; pre-mortem #3.
**Acceptance:**
- **GIVEN** export at Plan v7, then CRM changes a due date to Jul-20, and the file (based on v7) changes the same field to Jul-25, **WHEN** imported, **THEN** the preview shows a conflict row with both values
- **GIVEN** a field changed only in the file (CRM untouched since v7), **THEN** it is a plain update, not a conflict

### FR-RMD-8 · CRM-wins conflict default (MUST, Wave 1)
**Capability:** Every conflict defaults to keeping the CRM value; the Founder opts into the file's value per conflict.
**Source:** SCAMPER R17 (reality beats the stale file).
**Acceptance:**
- **GIVEN** a preview with 3 conflicts, **WHEN** Founder applies without touching them, **THEN** all 3 CRM values are retained
- **GIVEN** a conflict where Founder selects the file value, **THEN** that field is updated to the file value on apply

### FR-RMD-9 · Staleness warning (MUST, Wave 1)
**Capability:** A Founder importing a document based on an older plan version than the workspace's current one sees a prominent staleness notice identifying both versions before the diff.
**Source:** Pre-mortem #3.
**Acceptance:**
- **GIVEN** current plan is v9 and the file header declares v7, **WHEN** previewed, **THEN** a banner states the file is 2 versions behind
- **GIVEN** a file with no version header, **THEN** the banner states no base version was declared and merge falls back to current-state comparison (every divergence shown as plain update)

### FR-RMD-10 · Archive proposals, never deletion (MUST, Wave 1)
**Capability:** Entities present in the CRM but absent from the imported document become unchecked archive proposals; an import can never hard-delete a record.
**Source:** Brainstorm D3; pre-mortem #9; INV-9.
**Acceptance:**
- **GIVEN** a file omitting an existing initiative, **WHEN** the import is applied with the proposal unchecked, **THEN** the initiative is untouched
- **GIVEN** the proposal checked, **THEN** the initiative is archived (recoverable), and its milestones remain intact

### FR-RMD-11 · Forgiving parser with parse report (MUST, Wave 1)
**Capability:** The parser requires only titles; all other lines (owner, dates, success, status) are optional. Unparseable lines are reported with their line numbers in the preview without aborting the import.
**Source:** Pre-mortem #8; NFR-USE.
**Acceptance:**
- **GIVEN** a document that is just `## Initiative A` followed by three `- [ ] task` lines, **WHEN** imported, **THEN** 1 initiative + 3 tasks are proposed as creates
- **GIVEN** a document with 2 malformed metadata lines, **THEN** the preview lists both with line numbers and the remaining entities import normally

### FR-RMD-12 · Owner resolution by handle (MUST, Wave 1)
**Capability:** Owner annotations in the document resolve to workspace users by handle/name match; unknown owners are flagged in the preview and the entity imports with owner unassigned. Users are never auto-created.
**Source:** Brainstorm D12; INV-6.
**Acceptance:**
- **GIVEN** `@tomas` on a milestone and a workspace user matching "tomas", **WHEN** applied, **THEN** the milestone's assignee is that user
- **GIVEN** `@nonexistent`, **THEN** the preview flags the unknown owner and the applied milestone has no assignee

---

## §2 — PLV · Plan Versions (3 FRs)

Purpose: the plan's history is a queryable ledger — merge base, audit trail, and planning-session memory.

### FR-PLV-1 · Snapshot on export, import, and commit (MUST, Wave 1)
**Capability:** The System records a plan version — a complete snapshot of the roadmap state with monotonic numbering, source (export / import / commit), author, and timestamp — whenever a Founder exports, applies an import, or commits a plan.
**Source:** Brainstorm D4 / Architecture #3.
**Acceptance:**
- **GIVEN** plan v8, **WHEN** a Founder exports, **THEN** v9 exists with source `export` and the export document declares v9
- **GIVEN** an applied import, **THEN** a new version exists whose snapshot reflects post-apply state

### FR-PLV-2 · Plan history (SHOULD, Wave 1)
**Capability:** A Founder can view the list of plan versions with number, date, author, source, and change-count summary.
**Source:** Future-auditor role.
**Acceptance:**
- **GIVEN** 5 plan versions exist, **WHEN** Founder opens plan history, **THEN** all 5 appear newest-first with author and source visible

### FR-PLV-3 · Version-to-version diff (SHOULD, Wave 2)
**Capability:** A Founder can view what changed between any two plan versions: entities added, archived, and edited, including date slips (old→new).
**Source:** Future-auditor role ("why did Q3 slip"); planning mode reuses this.
**Acceptance:**
- **GIVEN** v7 and v9, **WHEN** diffed, **THEN** a milestone whose due date moved between them appears with both dates

---

## §3 — RVW · Roadmap View & Inline Editing (6 FRs)

Purpose: the roadmap reads like a document and edits like one — without ever being raw markdown.

### FR-RVW-1 · Document-style inline-editable roadmap (MUST, Wave 2)
**Capability:** A Founder can read the roadmap as a structured document (initiative sections with metadata and nested task lists) and edit any field in place — title, dates, owner, status, success criteria — with each edit saved directly. No raw markdown editor exists anywhere in the CRM.
**Source:** SCAMPER S1; Tomas motive #3 (inline edits while discussing with team); INV-3.
**Acceptance:**
- **GIVEN** the roadmap detail view, **WHEN** Founder clicks an initiative's target date and picks a new one, **THEN** the value persists and is reflected on next page load and in the next export
- **GIVEN** any CRM surface, **THEN** no UI offers raw-markdown editing of roadmap content

### FR-RVW-2 · Initiative editing confined to roadmap module (MUST, Wave 2)
**Capability:** Initiative create and edit affordances exist only inside the roadmap module (and via import). All other surfaces render initiative information read-only.
**Source:** Brainstorm core vision; pre-mortem #6; INV-7.
**Acceptance:**
- **GIVEN** a project or home page showing an initiative chip, **WHEN** inspected, **THEN** no edit affordance for the initiative exists there
- **GIVEN** the roadmap module, **THEN** initiative create/edit is available to any workspace member

### FR-RVW-3 · Deliverables render as nested task groups (MUST, Wave 2)
**Capability:** A milestone with children renders as a collapsible group whose progress is the roll-up of its children; no separate deliverable entity exists.
**Source:** SCAMPER E14 (Tomas-confirmed); INV-4.
**Acceptance:**
- **GIVEN** a milestone with 4 child milestones, 1 done, **WHEN** rendered, **THEN** the group shows 1/4 and expands to list the children
- **GIVEN** the md export, **THEN** the same structure appears as a parent task with nested tasks

### FR-RVW-4 · Three timeline zoom levels (SHOULD, Wave 2)
**Capability:** A Founder can switch the roadmap timeline between exactly three windows: Quarter, 6-month, Year.
**Source:** SCAMPER M11; pre-mortem #10 (no Gantt monster).
**Acceptance:**
- **GIVEN** the timeline, **WHEN** Founder selects "Quarter", **THEN** the window spans the current quarter and initiative bars re-scale
- **GIVEN** the view, **THEN** no dependency lines are rendered (dependency data stays data-only in v1)

### FR-RVW-5 · Attributed last-write-wins editing (MUST, Wave 2)
**Capability:** Concurrent edits by workspace members resolve last-write-wins, and every roadmap mutation is attributable to its author and time (visible in an activity trail per initiative).
**Source:** Brainstorm D10; Tomas answer "collaborative = internal team"; INV-2.
**Acceptance:**
- **GIVEN** two members edit the same field within a minute, **THEN** the later write persists and the trail shows both writes with authors and timestamps
- **GIVEN** an import-applied change, **THEN** the trail attributes it to the importing Founder with source "import"

### FR-RVW-6 · Quick reschedule from the timeline (COULD, Wave 2)
**Capability:** A Founder can change a milestone's due date or an initiative's target window directly from the timeline view.
**Source:** Monthly-planner role ("drag a milestone to July").
**Acceptance:**
- **GIVEN** the timeline, **WHEN** Founder moves an initiative bar's end to the next month, **THEN** `target_end_date` updates and the activity trail records it

---

## §4 — PLN · Planning Sessions (5 FRs)

Purpose: the monthly ritual is one toggle and one button — review what changed, triage what's unlinked, commit the new plan.

### FR-PLN-1 · Planning mode overlay (MUST, Wave 2)
**Capability:** A Founder can toggle a planning mode on the roadmap that highlights everything that changed since the last committed plan: slipped dates (old→new), completed vs planned work, and entities added or archived.
**Source:** SCAMPER C4; monthly-planner role.
**Acceptance:**
- **GIVEN** a milestone whose due date moved after the last commit, **WHEN** planning mode is on, **THEN** the milestone shows both the planned and current date
- **GIVEN** planning mode off, **THEN** the roadmap renders without change markers

### FR-PLN-2 · Unlinked-work triage (MUST, Wave 2)
**Capability:** In planning mode, a Founder sees all action items captured since the last plan commit that have no initiative or task link, with inline actions to link, promote, or dismiss each.
**Source:** SCAMPER R18 (unplanned work is the signal); D11.
**Acceptance:**
- **GIVEN** 6 unlinked action items captured this month, **WHEN** planning mode opens, **THEN** all 6 are listed with one-step link/promote/dismiss controls
- **GIVEN** an item dismissed, **THEN** it stays an ordinary open action item and stops appearing in this list

### FR-PLN-3 · Commit Plan (MUST, Wave 2)
**Capability:** A Founder can commit the current roadmap state as the new plan version in one action, with an optional session note; the commit closes the planning session and becomes the new baseline for "since last plan."
**Source:** Brainstorm "Commit Plan vN"; monthly cadence.
**Acceptance:**
- **GIVEN** planning mode with adjustments made, **WHEN** Founder commits with note "June session", **THEN** a new plan version exists with source `commit` and that note, and planning mode's change markers reset against it

### FR-PLN-4 · Success-criteria checkpoint (MUST, Wave 2)
**Capability:** When an initiative is completed, the Founder records the outcome against its success criteria as met / partially met / missed (three options, optional note).
**Source:** SCAMPER M10.
**Acceptance:**
- **GIVEN** an initiative with success criteria marked complete, **WHEN** the Founder is prompted, **THEN** choosing one of the three outcomes persists it and it appears on the initiative record and in plan history
- **GIVEN** an initiative without success criteria, **THEN** no outcome prompt blocks completion

### FR-PLN-5 · Planning-cadence nudge (COULD, Wave 3)
**Capability:** The System reminds the Founder when more than 35 days have passed since the last plan commit, via the existing notification/reminder mechanism. A reminder, never a lock.
**Source:** Pre-mortem #7.
**Acceptance:**
- **GIVEN** 36 days since the last commit, **THEN** one nudge is created; **GIVEN** the nudge ignored, **THEN** no roadmap functionality is restricted

---

## §5 — UNI · Cross-Module Unification (6 FRs)

Purpose: every module shows the same data because there is only one copy of it.

### FR-UNI-1 · Single work-item store (MUST, Wave 1 — invariant made testable)
**Capability:** Completing or editing a task on any surface (home task box, sprint board, project page, roadmap, agent tools) mutates the same record; all other surfaces and roll-ups reflect it without any synchronization step.
**Source:** First-principles T2 ("links, never copies").
**Acceptance:**
- **GIVEN** a task visible in the home box and under an initiative, **WHEN** checked done in the home box, **THEN** the initiative's fraction reflects it on next roadmap load with no intermediate process

### FR-UNI-2 · Initiative chip on every task surface (MUST, Wave 2)
**Capability:** Every task row on the home task box, sprint board, project page, and work views displays its initiative as a theme-colored chip; activating the chip navigates to that initiative on the roadmap.
**Source:** SCAMPER C5 ("that one chip IS the unified-data feeling").
**Acceptance:**
- **GIVEN** a task linked to an initiative with a themed color, **WHEN** rendered on any of the four surfaces, **THEN** the chip appears with that color and name
- **GIVEN** a chip clicked, **THEN** the roadmap opens scrolled/focused to that initiative

### FR-UNI-3 · Unassigned lane (MUST, Wave 2)
**Capability:** Tasks with no initiative appear in a visible "Unassigned" lane on the roadmap, where a Founder can assign them to initiatives.
**Source:** Pre-mortem #5 (quarantine, not silent orphans).
**Acceptance:**
- **GIVEN** 4 tasks with no initiative, **WHEN** the roadmap loads, **THEN** the Unassigned lane lists all 4
- **GIVEN** a task assigned from the lane, **THEN** it moves under its initiative immediately

### FR-UNI-4 · Unassigned count badge (SHOULD, Wave 2)
**Capability:** The roadmap's navigation entry shows a count of unassigned tasks plus unlinked open action items, so drift is always visible without opening the page.
**Source:** SCAMPER M9.
**Acceptance:**
- **GIVEN** 4 unassigned tasks and 6 unlinked action items, **THEN** the badge shows 10; **GIVEN** all linked, **THEN** no badge renders

### FR-UNI-5 · Optional initiative link at creation (MUST, Wave 2)
**Capability:** Creating a task anywhere offers an optional initiative selector; skipping it never blocks creation — the task simply lands in the Unassigned lane.
**Source:** Brainstorm D9 (quarantine not blockers); INV-5 spirit applied to tasks.
**Acceptance:**
- **GIVEN** quick task creation in the home box, **WHEN** the Founder skips the initiative field, **THEN** the task is created and appears in the Unassigned lane
- **GIVEN** the selector used, **THEN** the task appears under that initiative with its chip everywhere

### FR-UNI-6 · Agent write parity (MUST, Wave 1 — invariant made testable)
**Capability:** Agents (WhatsApp voice-note, call recorder, MCP tools) create and modify the same records as the UI; their work appears in the next export, the planning diff, and the triage list with no special handling.
**Source:** WA/MCP-agent role; INV-1.
**Acceptance:**
- **GIVEN** an action item created via the MCP `add_action_item` tool, **WHEN** planning mode opens, **THEN** it appears in the unlinked-work triage list
- **GIVEN** a milestone completed by an agent, **WHEN** the roadmap is exported, **THEN** the export reflects its completed state

---

## §6 — AIT · Action-Item Layer (3 FRs)

Purpose: capture stays cheap; connection to the plan is optional, after-the-fact, and one click.

### FR-AIT-1 · Zero-friction capture preserved (MUST, Wave 2 — invariant made testable)
**Capability:** Capturing an action item (manual, voice note, call, agent) requires no initiative or task linkage and gains no new required fields from this module.
**Source:** Tomas answer #2 ("doesn't need to be linked… keep it simple"); INV-5.
**Acceptance:**
- **GIVEN** the existing capture flows, **WHEN** this module ships, **THEN** every capture path succeeds with exactly the fields it required before

### FR-AIT-2 · Link action item to a task or initiative (MUST, Wave 2)
**Capability:** A Founder can link an open action item to an existing task or to an initiative after the fact; linked action items render as annotations on the target's detail view.
**Source:** Brainstorm D6/D11; existing `action_item_initiatives` join.
**Acceptance:**
- **GIVEN** an open action item, **WHEN** linked to a task, **THEN** the task detail lists it as a related capture and the action item shows its link
- **GIVEN** a linked action item completed, **THEN** the task's own status is unaffected (annotation, not child)

### FR-AIT-3 · Promote action item to task (MUST, Wave 2)
**Capability:** A Founder can promote an action item in one action: a new task is created under the chosen initiative/project carrying the item's title, description, owner, and due date; the action item is closed with a two-way provenance link.
**Source:** Brainstorm refinement on species question; SCAMPER R18 ("the plan learns from reality").
**Acceptance:**
- **GIVEN** an open action item from a call, **WHEN** promoted into initiative X, **THEN** a task exists under X with the item's fields, the item is closed and labeled "promoted", and the task shows its origin (source call/date)
- **GIVEN** a promoted item, **THEN** it no longer appears in open action-item lists or the triage queue

---

## §7 — PRG · Progress & Success Criteria (3 FRs)

### FR-PRG-1 · Computed progress only (MUST, Wave 1)
**Capability:** Initiative and parent-task progress is displayed as a completed/total fraction computed from child work items. No surface accepts a typed percentage.
**Source:** First-principles T4; SCAMPER S3; INV-8.
**Acceptance:**
- **GIVEN** an initiative with 12 tasks, 7 done, **THEN** every surface showing its progress shows 7/12 (or the equivalent fraction), and no input exists to override it

### FR-PRG-2 · Success criteria on initiatives (MUST, Wave 1)
**Capability:** A Founder can record success criteria text on an initiative; it is editable in the roadmap module, displayed on the initiative card, and round-trips through the markdown format.
**Source:** SCAMPER M10; user's original ask ("success criteria").
**Acceptance:**
- **GIVEN** success criteria set in the CRM, **WHEN** exported, **THEN** the initiative's section includes it; **GIVEN** it edited in the file and imported, **THEN** the update appears in the diff preview

### FR-PRG-3 · Health stays human (MUST, Wave 1 — invariant made testable)
**Capability:** Initiative health (green/amber/red) remains a manually set judgment, independent of computed progress, settable only in the roadmap module.
**Source:** First-principles T4; existing `health_color`.
**Acceptance:**
- **GIVEN** an initiative at 11/12 tasks done, **THEN** its health remains whatever a Founder last set; the System never recomputes it

---

## §8 — SHR · Sharing & Reporting (3 FRs, Wave 3)

### FR-SHR-1 · Partner-room read-only roadmap card (COULD, Wave 3)
**Capability:** A Founder can attach a read-only roadmap view — scoped to explicitly selected initiatives or one LoB — to a partner room. Partners can view it; no partner action can modify roadmap data.
**Source:** Tomas answer #1 ("maybe partner room"); D10 (read-only, later wave).
**Acceptance:**
- **GIVEN** a room with a roadmap card scoped to 2 initiatives, **WHEN** a Partner views it, **THEN** only those 2 initiatives (and their tasks' titles/dates/progress) are visible and no edit affordance exists
- **GIVEN** an unscoped initiative, **THEN** no partner-facing response contains it

### FR-SHR-2 · Status-report export (SHOULD, Wave 3)
**Capability:** A Founder can generate an export variant that includes progress fractions, health, outcomes, and completed-since-last-plan highlights — suitable as a monthly update for partners or investors.
**Source:** SCAMPER P12 ("stop writing it twice").
**Acceptance:**
- **GIVEN** the status flavor selected, **WHEN** exported, **THEN** the document includes each initiative's fraction, health, and items completed since the last plan commit, and excludes stable ID markers

### FR-SHR-3 · Plan-drift line in weekly review (COULD, Wave 3)
**Capability:** The weekly review surface shows planned-vs-actual counts (milestones completed vs due) and unplanned-work volume (action items captured) since the last plan commit.
**Source:** SCAMPER P13 (conditional on review habit).
**Acceptance:**
- **GIVEN** a week with 3 of 5 due milestones done and 8 action items captured, **WHEN** the review loads, **THEN** those counts appear with links to the roadmap

---

## §9 — Capability Contract · Roadmap-MD v1 (binding)

The FRs above state WHAT round-trips; this section pins HOW it is encoded, because external AI tools are an independent party to this format (same contract treatment as the caneyeducation cross-repo protocol). Changing this binding is a versioned contract change, not a refactor.

```markdown
<!-- AGB-ROADMAP-MD v1 · plan:v9 · workspace export 2026-06-10 -->
<!-- AI INSTRUCTIONS: Edit freely. PRESERVE every "agb:" comment exactly where it
     appears — it identifies the item. New items: just write them without a comment.
     Do not invent agb: IDs. Only titles are required; all other lines optional. -->

# Roadmap — AGB

## Initiative title here <!-- agb:in_8f3a -->
- Owner: @tomas · Status: active · Health: green
- Dates: 2026-06-01 → 2026-08-31
- Success: 3 paying posadas live on the new flow
- Goal: one-line why

- [ ] Parent task (deliverable) <!-- agb:ms_a1b2 -->
  - [x] Child task @tomas due:2026-06-20 <!-- agb:ms_c3d4 -->
  - [ ] Child task <!-- agb:ms_e5f6 -->
- [x] Standalone task <!-- agb:ms_9988 -->
```

| Element | Binding |
|---------|---------|
| Plan header | First line HTML comment: format version + base plan version |
| Initiative | `##` heading; metadata as plain `- Key: value` lines beneath (Owner / Status / Health / Dates / Success / Goal — all optional) |
| Task | Checkbox list item; `[x]` = done. Nesting = parent/child (`parent_milestone_id`). Depth ≤ 2 below initiative |
| Stable ID | Trailing HTML comment `<!-- agb:in_* -->` (initiative) / `<!-- agb:ms_* -->` (task); opaque short tokens, never raw DB UUIDs |
| Owner | `@handle` inline on task lines or `Owner:` line on initiatives; resolves per FR-RMD-12 |
| Dates | `due:YYYY-MM-DD` inline; initiative `Dates: start → target` |
| Excluded from v1 | Sprints, themes, action items, dependencies (data-only), archived entities |

---

## §10 — Schema Delta & Reuse Map

**New (3 items only):**

| Change | Purpose |
|--------|---------|
| `initiatives.success_criteria` (text, nullable) | FR-PRG-2 |
| `plan_versions` table (workspace, version n, snapshot, source export/import/commit, note, summary counts, created_by, created_at) | FR-PLV-1..3, FR-RMD-7 merge base |
| `action_items.milestone_id` (FK, nullable) | FR-AIT-2/3 (covers both "relates to" and post-promote provenance) |

**Reused as-is:** `initiatives` (owner/goal/dates/health/status/priority/LoB), `milestones` (+ `parent_milestone_id`, `initiative_id`, `assignee_user_id`), `action_items` (+ voice/call provenance), `themes` (chip colors), `action_item_initiatives`, `milestone_initiatives`, `milestone_deps` (data-only v1), existing `/roadmap`, `/initiatives`, `/work`, `/sprint`, `/review` surfaces, notification/reminder mechanism (FR-PLN-5), partner-room item system (FR-SHR-1).

---

## §11 — Wave-to-FR Matrix

| Wave | Theme | FRs |
|------|-------|-----|
| **1 — Round-trip core** | md contract, parser/generator, export + Copy-for-AI, staged import, snapshots | RMD-1..12, PLV-1..2, UNI-1, UNI-6, PRG-1..3 |
| **2 — Unification & planning** | doc-style view, chips, lanes, action-item link/promote, planning mode + commit | RVW-1..6, PLN-1..4, UNI-2..5, AIT-1..3, PLV-3 |
| **3 — Sharing & cadence** | partner card, status report, review drift, nudge | SHR-1..3, PLN-5 |

---

## §12 — NFRs

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-R1 | Import preview for a document of ≤200 initiatives / ≤1,000 tasks computes in <5s; inline edit save round-trip <500ms p95 | PERF |
| NFR-R2 | Import apply is transactional: all accepted changes commit or none do; a failed apply leaves the workspace at its pre-import state | REL |
| NFR-R3 | Export/import are workspace-isolated; stable ID tokens are opaque (never raw DB UUIDs); partner-facing views expose only explicitly scoped initiatives | SEC |
| NFR-R4 | The minimal valid document is a heading plus checkbox lines; the full format spec fits on one page | USE |
| NFR-R5 | Every roadmap mutation (UI, import, agent) is attributable to actor + timestamp + source | AUDIT |
| NFR-R6 | Round-trip identity: export → unmodified re-import proposes zero changes, for any workspace state | COMPAT |
| NFR-R7 | The parser never throws on arbitrary input; worst case is zero entities plus a parse report | ROBUST |

---

## §13 — Open Decisions (LOCKED 2026-06-10 — operator accepted recommendations via /goal continue)

| # | Question | Locked decision |
|---|----------|-----------------|
| OD-1 | Export include open action items? | **No** in working export; yes only in the Wave-3 status-report flavor |
| OD-2 | Archive semantics | `cancelled` status for milestones AND initiatives (schema has no `archived` column on initiatives — adapted to avoid a new archival concept; import excludes cancelled both ways) |
| OD-3 | `plan_versions.snapshot` shape | md text (the artifact users saw) + JSON summary counts |
| OD-4 | Project for roadmap-born tasks | Resolution chain: majority project of the initiative's existing tasks → find-or-create project under the initiative's LoB → find-or-create visible "General" LoB |
| OD-5 | Who can Commit Plan | Any workspace member |

## §14 — Implementation Notes & Deviations (as-built, 2026-06-10)

Built: Waves 1+2 (commits on `feat/roadmap-module-wave1`). Verified: 323 unit tests (incl. 20 round-trip/drift), tsc+eslint clean, production build green, live-DB smoke (AGB workspace: 5 initiatives/26 tasks round-trip identity OK; 19 unassigned tasks + 30 unlinked action items populate the new lanes). Canary: `scripts/smoke-roadmap.ts` (read-mostly, self-cleaning).

| FR | Deviation |
|----|-----------|
| FR-UNI-4 | Count badge lives on the Unassigned lane on /roadmap, not the global nav (nav is a shared client component without data; revisit if drift goes unnoticed) |
| FR-UNI-5 | No creation-time picker added to every form; the quarantine path (Unassigned lane + one-click assign, plus /work assignment) covers the flow without touching every capture surface |
| FR-RVW-5 | Last-write-wins is in effect; per-field activity trail NOT built — attribution via plan-version ledger + `updatedAt`. Gap accepted for a 2-3 person team; revisit if "who changed this" ever matters mid-month |
| FR-RVW-6 | (COULD) Drag-reschedule not built; inline date inputs in the plan document cover rescheduling |
| FR-RVW-1 | Sub-task creation in the doc view is import-only for now (UI add-task creates top-level tasks; nesting renders fine) |
| FR-PLN-5 / SHR-* | Wave 3 — not built (as planned) |

---

*Traceability: every FR cites its brainstorm source (D-decisions, SCAMPER items, pre-mortem inversions, role-play findings). Reverse direction: brainstorm decisions D1–D12 are all covered — D1→RMD/PLV, D2→RMD-5, D3→RMD-4/10, D4→PLV-1, D5→RVW-1, D6→AIT-2/3, D7→PRG-1, D8→§0+NFR-R4, D9→UNI-5, D10→RVW-5/SHR-1, D11→AIT-1/PLN-2, D12→RMD-12.*
