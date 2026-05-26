---
id: TASK-AGB-006
title: Project detail page (milestones + touches + meetings + linked contacts)
status: review
priority: P1
phase: 1
fr_covered: [FR-PRJ-1, FR-MTG-6]
owner: OVL-AGB-Claude
branch: null
pr: null
estimated_points: 5
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-002, TASK-AGB-007, TASK-AGB-008, TASK-AGB-009]
blocker_note: null
---

## What

Full Project detail page at `/projects/[id]` with: header (title, status, current stage, owner, health, due date), tabs for Milestones / Linked Contacts / Touches / Meetings, stage-advance control prominently placed.

## Why

Project is the unit of work; this is the page Founders open when they want to act on or update a deal in motion. `FR-PRJ-1` mostly satisfied through this view + AGB-002 (CRUD).

## Acceptance Criteria

- [ ] **FR-PRJ-1 (visibility):** Project detail renders title, status badge, current stage badge, owner, due date, health color
- [ ] **FR-MTG-6 AC1:** Linked Project shows all related Meetings (those with `linked_project_id` = this project)
- [ ] Milestone tab shows ordered list with checkbox-style "mark done" (AGB-007 inline)
- [ ] Linked Contacts tab shows each contact with role + quick link to Contact detail
- [ ] Touches tab shows Touches with `project_id` = this project (newest first)
- [ ] Stage-advance button next to current stage badge; click → dropdown to pick next stage (constrained to template stages); confirms before updating
- [ ] Waiting-on state shows a prominent banner with the waiting_on text + expected unblock date
- [ ] `__tests__/AGB-006-project-detail.test.ts` smoke-tests all ACs

## Files to touch

```
app/projects/[id]/page.tsx
components/ProjectHeader.tsx
components/ProjectTabs.tsx
components/StageAdvanceDropdown.tsx
components/WaitingOnBanner.tsx
__tests__/AGB-006-project-detail.test.ts
```

## Suggested approach

1. Server component fetches project + milestones + touches + linked contacts + meetings + current stage + all template stages (for the dropdown)
2. Header + tabs structure similar to AGB-005 (consider extracting a `DetailLayout` shared component)
3. StageAdvance: button shows current stage; click opens dropdown of `pipeline_stages.where(template_id = project.template_id).orderBy(order)`; select → confirm Dialog → server action

## Out of scope

- Pipeline Kanban (AGB-100)
- Health color computation (AGB-101)
- Project comments / discussion (Phase 6)
- Project archive (just status=lost or done for v1)

## Notes

If the project has no template, hide stage controls entirely. Linked Contacts can be added via the same tab (button "+ Add contact" opens a search-and-link Dialog).
