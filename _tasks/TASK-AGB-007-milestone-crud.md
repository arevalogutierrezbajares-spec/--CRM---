---
id: TASK-AGB-007
title: Milestone CRUD on Projects
status: open
priority: P0
phase: 1
fr_covered: [FR-PRJ-3]
owner: null
branch: null
pr: null
estimated_points: 3
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-004]
blocker_note: null
---

## What

CRUD for ad-hoc Milestones on Projects: add a Milestone with title/due/owner/status/blocker, edit it, mark done (auto-set `completed_at`), mark blocked (require blocker_text). Used both for template-instantiated milestones (AGB-002) and Founder-added ones mid-project.

## Why

`FR-PRJ-3` — Founders need to add Milestones outside the template (e.g., "Send follow-up after Maria's call") without it being a full Project.

## Acceptance Criteria

- [ ] **FR-PRJ-3 AC1:** Adding Milestone "Send follow-up" due 2026-06-15 owner=self → row in `milestones` with all values + project_id link
- [ ] **FR-PRJ-3 AC2:** Marking Milestone `done` auto-sets `completed_at = NOW()`
- [ ] **FR-PRJ-3 AC3:** Marking Milestone `blocked` without `blocker_text` → form rejects with validation error
- [ ] Editing a Milestone changes title/due/owner without affecting other Milestones
- [ ] Reordering Milestones via drag updates `order` field
- [ ] `__tests__/AGB-007-milestone.test.ts` covers all ACs

## Files to touch

```
app/projects/[id]/page.tsx                  # render milestones section
components/MilestoneList.tsx
components/MilestoneForm.tsx
app/projects/[id]/milestones/actions.ts     # server actions
lib/validation/milestone.ts
db/queries/milestones.ts                    # extend with create/update/markDone helpers
__tests__/AGB-007-milestone.test.ts
```

## Suggested approach

1. Inline edit on the Project detail page — no separate route needed
2. Add Milestone via Dialog (shadcn) opened from a button
3. Status = `done` toggle in the row sets `completed_at = NOW()` server-side
4. Blocker dropdown: when user picks `blocked`, expose a required text input

## Out of scope

- Milestone dependencies (won't-have v1)
- Recurring milestones (won't-have v1)
- Comments on milestones (Phase 6)

## Notes

Reuse the MilestoneForm component on Project detail (AGB-006) — same form, just embedded.
