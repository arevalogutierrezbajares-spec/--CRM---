---
id: TASK-AGB-002
title: Project CRUD + template instantiation + pipeline-stage tracking
status: review
priority: P0
phase: 1
fr_covered: [FR-PRJ-1, FR-PRJ-2, FR-PRJ-4, FR-PRJ-7]
owner: OVL-AGB-Claude
branch: null
pr: null
estimated_points: 8
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-001, TASK-AGB-007]
blocker_note: null
---

## What

End-to-end Project CRUD: create form (with template selector), list at `/projects`, edit page, template auto-instantiation that creates 12/10/5 Milestones from the seeded pipeline templates with correct SLA-based due dates and default owners, pipeline-stage advance (button + later Kanban drag), waiting-on state with expected-unblock date.

## Why

Phase 1 keystone. Implements the "every deal IS a project" architecture from the brainstorm Cat#14. Without this, no template-driven workflow is real and the cofounder can't validate the Caney / VAV / BD pipelines.

## Acceptance Criteria

- [ ] **FR-PRJ-1 AC1:** Create Project "Marta — Caney onboarding" with template `caney-posada-onboarding`, owner=self, linked to Contact Marta → row in `projects` + 1 row in `project_contacts`
- [ ] **FR-PRJ-1 AC2:** New active Project has `health_color=green` by default (deeper logic in AGB-101)
- [ ] **FR-PRJ-2 AC1:** Creating with template `caney-posada-onboarding` (12 stages) → 12 Milestones inserted with `order` 1..12, owner per stage's `default_owner` mapping (tomas/cofounder/either → resolve), `due_date` = `created_at + stage.sla_days`
- [ ] **FR-PRJ-2 AC2:** Stage with `sla_days=null` → Milestone created with `due_date=null`
- [ ] **FR-PRJ-2 AC3:** VAV template → 10 Milestones; BD template → 5 Milestones (smoke-test all 3)
- [ ] **FR-PRJ-4 AC1:** Advancing Project from stage 1 to stage 2 → `current_stage_id` updates + audit row in `project_stage_history` (new table)
- [ ] **FR-PRJ-4 AC2:** Project with no template → `current_stage_id=null` and stage controls hidden from the UI
- [ ] **FR-PRJ-7 AC1:** Setting status=`waiting` with `waiting_on="Marta's signature"` + `expected_unblock_date=2026-06-10` persists; Project shows in any "blocked" surface
- [ ] **FR-PRJ-7 AC2:** When `expected_unblock_date` passes without status change, eligible for FR-BRN-2 firing (verified in AGB-400)
- [ ] `__tests__/AGB-002-project-crud.test.ts` exercises every AC

## Files to touch

```
app/projects/page.tsx
app/projects/new/page.tsx
app/projects/[id]/page.tsx                  # detail (also AGB-006)
app/projects/[id]/edit/page.tsx
app/projects/actions.ts                     # server actions
components/ProjectForm.tsx
components/TemplateSelector.tsx             # dropdown with 3 templates + "no template"
components/StageAdvanceControl.tsx
components/WaitingOnForm.tsx
lib/validation/project.ts
lib/templates.ts                            # readPipelineTemplate(slug) helper
db/queries/projects.ts
db/queries/milestones.ts                    # helper to bulk-insert template milestones
db/migrations/0003-project-stage-history.sql   # new audit table
__tests__/AGB-002-project-crud.test.ts
```

## Suggested approach

1. New migration: add `project_stage_history` table (id, project_id, from_stage_id, to_stage_id, changed_by, changed_at) + add it to `db/schema.ts`
2. Server action `createProject(input)`:
   - Insert project row
   - If `template_id` provided: query `pipeline_stages` ordered by `order`, bulk-insert milestones with `due_date = NOW() + stage.sla_days days`
   - Resolve `default_owner` enum to actual user_id: tomas → Tomas's user_id, cofounder → cofounder's user_id (if exists), either → leave NULL (assigned later)
   - Set `current_stage_id` to first stage
3. `advanceStage(projectId, toStageId)`: update + insert history row
4. Waiting-on UI: when status=`waiting`, show extra fields (text + date)
5. Tests cover the instantiation logic carefully — count exact milestones, verify due dates within ±1 day of expected

## Out of scope

- Pipeline Kanban surface — AGB-100 in Phase 2 (this task just wires the data layer + a simple list)
- Health color computation — AGB-101 in Phase 2
- Dependency between milestones — out of v1 scope (won't-have)
- Project templates that the user can author themselves — Phase 6+

## Notes

The seeded templates use `default_owner` enum `tomas/cofounder/either`. Resolve to user_ids at instantiation time. If cofounder doesn't exist yet (AGB-000B not done), `cofounder`-defaulted milestones get assigned to Tomas with a flag for reassignment.
