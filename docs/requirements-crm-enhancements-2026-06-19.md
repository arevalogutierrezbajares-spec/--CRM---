# AGB-CRM Enhancements — Functional Requirements

Date: 2026-06-19 · Owner: GigaRico · Status: implementation-ready
Stack: Next.js App Router · Drizzle · Supabase · deployed at x.caneycloud.com

Scope: six enhancements (E1–E6). E6 (Roadmap by Project/Function) is the deep one.
Conventions: all timestamps timezone-aware; all dates ISO `YYYY-MM-DD`; date math via
`addDaysToISODate` (operator timezone). All writes are workspace-scoped via existing RLS.

---

## E1 — Homepage Task Actions

Card: `components/dashboard/daily/tasks-card.tsx`. Data: `DashTask` from
`db/queries/dashboard.ts`. Tasks are `milestones` rows (status `pending|blocked|done`,
`dueDate`, `assigneeUserId`/`assignedTo`→users, `completedAt`). Actions:
`app/(app)/dashboard/item-actions.ts` (`updateTaskAction` covers status/dueDate/
assigneeUserId). **`deleteTaskAction` must be added.**

### Functional Requirements

- **FR-E1-1** Operators can complete a task via a leading checkbox.
  Source: dashboard task workflow. Acceptance below.
- **FR-E1-2** Operators can delete a task via a per-row delete control, gated by confirm.
- **FR-E1-3** Operators can assign a person to a task via an @-mention control that renders
  the chosen person as a person bubble.
- **FR-E1-4** Operators can extend an overdue task's due date via a dropdown offering
  +2 / +5 / +7 days from the current `dueDate`.

### Acceptance Criteria

- **AC-E1-1a** Given a `pending` task, When the operator checks its checkbox, Then the row is
  optimistically removed from the list AND `updateTaskAction` writes `status='done'`,
  `completedAt=now()`; on server error the row is restored and an error toast shown.
- **AC-E1-1b** Given a `done` task surfaced in the list, When unchecked, Then `status` reverts
  to `pending` and `completedAt=null`.
- **AC-E1-2a** Given any task, When the operator clicks delete, Then a confirm prompt appears;
  When confirmed, Then `deleteTaskAction(taskId)` removes the `milestones` row and the row
  disappears optimistically; When cancelled, Then no write occurs.
- **AC-E1-2b** `deleteTaskAction` MUST verify the row's `workspaceId` matches the caller's
  workspace before deleting and return a typed `{ ok } | { error }` result.
- **AC-E1-3a** Given the assign control, When the operator types `@` and selects a workspace
  user, Then `updateTaskAction` writes `assigneeUserId` and a person bubble (avatar/initials +
  name) replaces the input; the picker closes on select.
- **AC-E1-3b** Given an already-assigned task, When the operator clicks the bubble, Then they
  may reassign (writes new `assigneeUserId`) or clear (writes `assigneeUserId=null`).
- **AC-E1-4a** Given a task with `dueDate < today`, Then an overdue indicator renders (red).
- **AC-E1-4b** Given the overdue indicator, When clicked, Then a dropdown offers +2/+5/+7 days;
  When an option is chosen, Then `updateTaskAction` writes
  `dueDate = addDaysToISODate(dueDate, N)` and the overdue indicator clears if the new date is
  today or later.

### NFR

- **NFR-E1-1** Each action is optimistic with rollback on failure; no full-card refetch.
- **NFR-E1-2** All four controls keyboard-operable; checkbox and bubble have aria labels.

---

## E2 — Dynamic Latest-Docs Scroller

Component: `components/dashboard/pinned-projects.tsx` ("Latest updates" rail). Today it shows
one most-recent doc per pinned project (≤6). Docs are `project_links` rows
(`kind` `link|file|note|doc`, `label`, `url`, `originalFilename`, `mimeType`, `updatedAt`).

### Functional Requirements

- **FR-E2-1** Operators can see ALL recently-updated docs across all pinned projects in one
  horizontal side-scroll rail, flattened and sorted by `updatedAt` DESC.
- **FR-E2-2** Each rail item shows: source project, doc label, relative time, and a type icon
  derived from `kind`/`mimeType`; the item opens/links the doc.

### Acceptance Criteria

- **AC-E2-1a** Given N pinned projects each with M docs, When the rail renders, Then it lists
  the union of all docs ordered by `updatedAt` DESC (most recent first), not one-per-project.
- **AC-E2-1b** The query MUST cap to a sane limit (default 40) for first paint; the rail
  side-scrolls horizontally within the existing space (no vertical growth / layout shift).
- **AC-E2-2a** Given a `kind='link'|'doc'` item, When clicked, Then `url` opens in a new tab
  (`rel="noopener"`); Given `kind='file'`, Then it opens via the existing material viewer path
  (proxy view, never a raw signed Supabase URL — see storage HTML/text-plain constraint).
- **AC-E2-2b** Each item shows relative time (e.g. "3h ago") from `updatedAt` and an icon
  mapped from type (`file`→file glyph by mime, `link`→link, `doc`→doc, `note`→note).
- **AC-E2-3** Given zero docs across pinned projects, Then an empty state renders (no crash).

### NFR

- **NFR-E2-1** Single flattened query (avoid N+1 per pinned project).
- **NFR-E2-2** Rail virtualizes or lazy-renders beyond the viewport; scroll stays 60fps.

---

## E3 — Pixar Pop-In Brand Logo

Component: `components/brand/brand-widget.tsx` (top-left "AGB Technologies" lockup).
Motion governed by existing `MotionProvider`.

### Functional Requirements

- **FR-E3-1** The brand lockup animates a top-to-bottom "Pixar bounce" pop-in on mount.
- **FR-E3-2** The animation can replay (on a deliberate trigger, e.g. click/hover or remount),
  not only first paint.
- **FR-E3-3** The animation honors `prefers-reduced-motion`.

### Acceptance Criteria

- **AC-E3-1a** On first render, the lockup enters from above with an overshoot-then-settle
  (bounce) ease, completing within ~600–900ms.
- **AC-E3-2a** Given a replay trigger, When activated, Then the bounce plays again from rest.
- **AC-E3-3a** Given `prefers-reduced-motion: reduce` (or MotionProvider reduced state), Then
  the lockup appears immediately at final position with no transform animation.
- **AC-E3-4a** Reserved space equals the lockup's final box; **zero cumulative layout shift**
  during/after animation (CLS contribution 0).

### NFR

- **NFR-E3-1** Transform/opacity only (GPU-composited); no width/height/top animation.
- **NFR-E3-2** No measurable TBT/INP regression on the sidebar; no new bundle dep if Framer
  Motion (already present) suffices.

---

## E4 — Dynamic Dependency Creation (Roadmap)

Component: `components/roadmap/roadmap-timeline.tsx` (current `DependsOn` `<select>` + drag).
Backend: `addInitiativeDependency(fromId,toId)` / `removeInitiativeDependency(id)` in
`app/(app)/roadmap/actions.ts`. Table `initiative_dependencies`
(`from_initiative_id`, `to_initiative_id`, `type` default `finish_to_start`, unique edge,
cycles guarded in action layer). Semantics: a row means **`to` depends on `from`** (first
selected = predecessor / blocker).

### Functional Requirements

- **FR-E4-1** Operators can select TWO initiatives, then click "Add dependency" to create the
  edge — replacing the dropdown flow. (Drag-to-link may remain as an alternate path.)
- **FR-E4-2** Selection order defines direction: **first selected = predecessor (blocks)**,
  second = successor (depends on first). The UI states this in plain language before commit.
- **FR-E4-3** The system rejects self-link, duplicate edge, and any edge that would form a cycle.

### Acceptance Criteria

- **AC-E4-1a** Given selection mode, When the operator clicks initiative A then B, Then both are
  visibly marked (1st = "blocks", 2nd = "depends on") and "Add dependency" enables.
- **AC-E4-1b** Given A and B selected, When "Add dependency" is clicked, Then
  `addInitiativeDependency(A, B)` writes `from=A, to=B`; on success a link renders and selection
  clears.
- **AC-E4-2a** The pending action reads as "A blocks B" / "B depends on A" before commit.
- **AC-E4-3a** Given A selected twice (A=B), Then "Add dependency" is disabled / rejected
  ("cannot depend on itself").
- **AC-E4-3b** Given an existing edge A→B, When the operator re-adds A→B, Then the action returns
  a typed duplicate error (no second row; unique index also enforces).
- **AC-E4-3c** Given existing A→B, When the operator tries B→A (direct) or any path closing a
  cycle, Then the cycle guard rejects with a clear message and no row is written.
- **AC-E4-4** Given an existing dependency, When the operator removes it, Then
  `removeInitiativeDependency(id)` deletes the row and the link disappears.

### NFR

- **NFR-E4-1** Cycle check runs server-side on the current edge set (defense regardless of UI).
- **NFR-E4-2** Selection state is local/ephemeral; no partial writes if commit fails.

---

## E5 — Roadmap @-Mention Redesign

Today: literal `@NameNoSpaces` tokens live inside the initiative title
(`components/ui/mention-input.tsx` + `components/roadmap/mention-bubbles.tsx`);
`initiative_people` (`initiative_id`,`user_id`, pk both) is DERIVED from title tokens via
`syncInitiativePeopleFromText`. Bugs: dropdown stays open after pick; raw token text remains in
the title. Target: assignment is its own control; `initiative_people` is the **source of truth**;
title stays clean prose.

### Functional Requirements

- **FR-E5-1** Operators can assign people to an initiative via an @ picker that writes directly
  to `initiative_people` (source of truth) and leaves NO token text in the title.
- **FR-E5-2** Assigned people render as bubbles only (not inline title text).
- **FR-E5-3** The picker dropdown closes immediately on selection.
- **FR-E5-4** Clicking a bubble opens a menu to reassign to another user, set to "Everyone",
  or remove the assignment.
- **FR-E5-5** Back-compat: existing titles containing inline `@token` text are migrated so
  `initiative_people` holds the assignments and the title is stripped of the tokens.

### Acceptance Criteria

- **AC-E5-1a** Given the @ picker, When the operator selects a user, Then an `initiative_people`
  row `(initiativeId,userId)` is upserted AND the initiative `title` is unchanged (no `@token`
  appended). The dropdown closes on the same interaction.
- **AC-E5-1b** Title saves no longer call `syncInitiativePeopleFromText` to mutate
  `initiative_people` from tokens; `initiative_people` is written only by the assignment control.
- **AC-E5-2a** Given an initiative with people rows, Then bubbles render from `initiative_people`
  (avatar/initials + name); the title shows prose only.
- **AC-E5-3a** Given the picker open, When a user is picked OR the operator clicks away / presses
  Esc, Then the dropdown closes (no stuck-open state).
- **AC-E5-4a** Given a bubble, When clicked, Then a menu offers: Reassign→(user list),
  "Everyone", Remove. Reassign deletes the old row and inserts the new; "Everyone" sets the
  documented all-hands convention; Remove deletes the `initiative_people` row.
- **AC-E5-5a (migration)** A one-time backfill parses each initiative `title` for `@token`s,
  resolves tokens to user ids, upserts `initiative_people`, and rewrites `title` with tokens
  stripped (preserving readable prose / surrounding whitespace). Unresolvable tokens are left
  in the title and logged for manual review.
- **AC-E5-5b** Post-migration, re-saving a legacy title does not re-introduce tokens or alter
  `initiative_people`.

### NFR

- **NFR-E5-1** Backfill is idempotent (safe to re-run) and runs in the migration path, not by
  hand-applied SQL (per repo migration rule).
- **NFR-E5-2** "Everyone" semantics defined once (documented constant) and used consistently in
  filters and rendering.

---

## E6 — Roadmap View by Project / Line-of-Business (Functions × LoB)

**The mental model.** LoBs (CaneyCloud PMS, CaneyLearn, VAV, …) are VERTICALS. "Functions"
(Product, Engineering, Growth/Marketing, Ops, Finance) are HORIZONTALS that cut across LoBs.
Every initiative must tie to **both** a vertical (LoB) and a horizontal (function). **No orphans.**

Current data (verified in `db/schema.ts`):
- `initiatives` (~L2199): `id`, `workspaceId` (`workspace_id`), `lobId` (`lob_id`, **nullable**,
  FK→`lines_of_business`, `onDelete set null`), `title`, `summary`, `goal`, `status`, `priority`,
  `sortOrder`, `healthColor`, `ownerUserId`, `startDate`, `targetEndDate`, `actualEndDate`,
  `notes`, `successCriteria`, `successOutcome`, `createdBy`, `createdAt`, `updatedAt`.
- `lines_of_business` (~L647): `id`, `workspaceId`, `title`, `kind` (`lob_kind` `business|project`),
  `sortOrder`, `status`, `parentLobId` (`parent_lob_id`), … (no function concept).
- `lob_business_links` (~L719): `projectLobId`, `businessLobId`, `workspaceId` (project↔business M2M).
- `initiative_dependencies` (~L2326), `initiative_people` (~L2244): see E4/E5.
- **There is NO "function"/horizontal categorization today.**

### (a) The `function` (horizontal) concept — recommend a TABLE

**Decision: a table, not an enum.** Rationale: functions must be workspace-scoped, user-editable
(add/rename), ordered (for matrix column order), and referenceable by FK — an enum cannot be
reordered or extended without a migration and offers no per-workspace customization.

Proposed new table `functions`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK `gen_random_uuid()` | |
| `workspace_id` | uuid NOT NULL → `workspaces` (cascade) | scope |
| `name` | text NOT NULL | e.g. "Engineering" |
| `slug` | text NOT NULL | stable key for seed/backfill; unique per workspace |
| `color` | text NULL | hex for swimlane accent |
| `icon` | text NULL | lucide name |
| `sort_order` | integer NOT NULL default 0 | matrix column order |
| `archived` | boolean NOT NULL default false | hide without deleting |
| `created_at` | timestamptz NOT NULL defaultNow | |

Constraints: `uniqueIndex(workspace_id, slug)`. Seedable defaults per workspace:
Product, Engineering, Growth/Marketing, Operations, Finance (slugs:
`product|engineering|growth|operations|finance`), plus a reserved
`uncategorized` function (see (c)).

Link from initiatives:
- **FR-E6-1** Add `initiatives.function_id` uuid NULL → `functions(id)` `onDelete set null`.
  Stored nullable (DB-safe), but **UX must prevent orphans** by always resolving to a function
  (default/Uncategorized) on create and requiring resolution on edit.

### (b) Matrix / grouped roadmap view (Functions × LoB)

- **FR-E6-2** Operators can view a roadmap grouped as a matrix: **rows = functions
  (horizontals), columns = LoBs (verticals)** (orientation configurable; default rows=functions).
- **FR-E6-3** Each cell holds the initiatives whose `(function_id, lob_id)` match that
  intersection; initiatives render as compact cards (title, status/health, people bubbles).
- **FR-E6-4** Operators can filter the matrix by function, by LoB, by owner, and by status; the
  matrix re-projects to the filtered subset.
- **FR-E6-5** A swimlane mode collapses to single-axis grouping (group by function OR by LoB)
  for a linear read of the master plan.

#### Acceptance Criteria — view

- **AC-E6-2a** Given F functions and L LoBs, When the matrix renders, Then there are F×L cells;
  function rows order by `functions.sort_order`, LoB columns by `lines_of_business.sort_order`.
- **AC-E6-2b** Sub-LoBs (`parent_lob_id` set) nest under their parent column (or roll up to the
  parent column) consistently; document which (recommend: roll up to parent, expandable).
- **AC-E6-3a** An initiative appears in exactly one cell: its `(function_id, lob_id)`.
- **AC-E6-3b** **Empty cells** render as an explicit empty slot (not collapsed away) so the grid
  reads as a true matrix; an empty cell offers a "+ add initiative here" affordance that
  pre-fills that function+LoB.
- **AC-E6-4a** Given a function filter, Then only matching rows show; LoB filter → only matching
  columns; combined filters intersect.
- **AC-E6-5a** Given swimlane(function) mode, Then initiatives group under function headers
  ordered by `sort_order`, ignoring LoB columns.

### (c) Data-integrity rules — NO ORPHANS

- **FR-E6-6** Every initiative must resolve to both a LoB and a function. The system enforces
  this via defaults on create, a surfaced "Uncategorized" bucket, and validation on edit.

#### Acceptance Criteria — integrity

- **AC-E6-6a (create default)** When an initiative is created without an explicit function/LoB,
  Then it is assigned the workspace's reserved **Uncategorized** function and/or an
  **Unassigned** LoB bucket so it is never NULL-on-both in the view.
- **AC-E6-6b (fix-me surfacing)** The matrix surfaces an **Uncategorized** row and an
  **Unassigned** column (visually flagged, e.g. amber) listing every initiative missing a real
  function or LoB; this is the operator's fix-me queue.
- **AC-E6-6c (edit validation)** On the initiative edit form, function and LoB are required
  selects; saving with either unset is blocked client-side and the server action rejects a
  payload that would leave a real (non-bucket) initiative without resolution.
- **AC-E6-6d (count badge)** The roadmap header shows a count of Uncategorized/Unassigned
  initiatives so orphans are visible at a glance; count = 0 is the healthy state.

### (d) Migration plan & backfill

- **FR-E6-7** Ship the schema + backfill via the standard migration path
  (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`, applied only by `scripts/db-migrate.sh --apply`;
  never hand-applied — per repo rule).

Migration steps (single ordered set):

1. **M1 create `functions`** table + `uniqueIndex(workspace_id, slug)`.
2. **M2 seed defaults** per existing workspace: Product, Engineering, Growth, Operations,
   Finance, **and `uncategorized`** (reserved; `sort_order` last; `archived=false`).
3. **M3 alter `initiatives`** add `function_id` uuid NULL → `functions(id)` `set null`;
   add index `initiatives_function_idx`.
4. **M4 backfill function_id** for existing initiatives → the workspace's `uncategorized`
   function (heuristic mapping optional but default to Uncategorized to guarantee non-orphan
   in the view).
5. **M5 LoB backfill** for `initiatives.lob_id IS NULL`: either leave NULL and let the view's
   **Unassigned** column handle it, OR (recommended) seed a reserved per-workspace
   `Unassigned` LoB and point orphans at it so both axes are always resolvable. Document the
   choice; recommend reserved Unassigned LoB for symmetry with Uncategorized function.
6. **M6 RLS** — `functions` gets workspace-scoped RLS matching sibling tables (select/insert/
   update/delete by workspace membership); verify via migration, not dashboard.

Back-compat & safety:
- **AC-E6-7a** Migration is forward-only and idempotent where re-runnable; `function_id` stays
  nullable at the DB level (no NOT NULL constraint that could break inserts mid-deploy).
- **AC-E6-7b** After backfill, **zero** initiatives are invisible in the matrix (every one lands
  in a real or reserved-bucket cell).
- **AC-E6-7c** `scripts/db-migrate.sh --check` passes (ledger in sync) before deploy.

### NFR — E6

- **NFR-E6-1** Matrix query is a single workspace-scoped fetch joining initiatives→functions→LoB;
  no N+1 per cell.
- **NFR-E6-2** Reserved buckets (Uncategorized function, Unassigned LoB) are identified by stable
  `slug`, never by display name, so renames don't break integrity logic.
- **NFR-E6-3** Matrix renders ≤200 initiatives without jank; cells lazy-render off-screen.

---

## Cross-Cutting NFRs

- **NFR-X1** All new server actions are workspace-scoped and return typed `{ ok } | { error }`.
- **NFR-X2** No schema change applied by hand; all via `scripts/db-migrate.sh --apply` with a
  single timestamped file per change; `--check` green before deploy.
- **NFR-X3** All new interactive controls keyboard-operable and labeled (a11y).
- **NFR-X4** `npx tsc --noEmit` and `npx vitest run` pass; new logic (cycle guard, backfill
  parser, matrix grouping) has unit tests.

---

## Traceability — FR-IDs → files to touch

| FR-IDs | Files / artifacts |
|---|---|
| FR-E1-1..4 | `components/dashboard/daily/tasks-card.tsx`; `app/(app)/dashboard/item-actions.ts` (add `deleteTaskAction`, extend usage of `updateTaskAction`); `db/queries/dashboard.ts` (DashTask) |
| FR-E2-1..2 | `components/dashboard/pinned-projects.tsx`; `db/queries/dashboard.ts` (new flattened recent-docs query over `project_links`); material viewer path for file opens |
| FR-E3-1..3 | `components/brand/brand-widget.tsx`; `MotionProvider` (reduced-motion read) |
| FR-E4-1..3 | `components/roadmap/roadmap-timeline.tsx` (two-select + "Add dependency", remove dropdown); `app/(app)/roadmap/actions.ts` (`addInitiativeDependency`/`removeInitiativeDependency` + cycle guard); table `initiative_dependencies` |
| FR-E5-1..5 | `components/ui/mention-input.tsx`; `components/roadmap/mention-bubbles.tsx`; `app/(app)/roadmap/actions.ts` (assignment writes to `initiative_people`; stop title-token sync); migration: title-token backfill; `syncInitiativePeopleFromText` (deprecate for writes) |
| FR-E6-1 | `db/schema.ts` (`initiatives.function_id`); migration M3 |
| FR-E6-2..5 | new matrix view under `components/roadmap/` + `app/(app)/roadmap/` page/route; query in `db/queries/` joining initiatives→functions→LoB |
| FR-E6-6 | `app/(app)/roadmap/actions.ts` (create defaults + edit validation); matrix view (Uncategorized/Unassigned surfacing + count badge); initiative edit form |
| FR-E6-7 | `db/schema.ts` (new `functions` table, RLS); `supabase/migrations/YYYYMMDDHHMMSS_functions_and_initiative_function.sql` (M1–M6); applied via `scripts/db-migrate.sh --apply` |
