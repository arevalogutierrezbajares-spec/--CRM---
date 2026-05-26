---
id: TASK-AGB-009
title: Meeting CRUD + Action Items → Milestones (MTG capability area)
status: open
priority: P1
phase: 1
fr_covered: [FR-MTG-1, FR-MTG-2, FR-MTG-3, FR-MTG-6]
owner: null
branch: null
pr: null
estimated_points: 5
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-001, TASK-AGB-007]
blocker_note: null
---

## What

End-to-end Meeting capture: create a Meeting with title/date/attendees/agenda/location/type, capture free-text minutes + explicit Action Items, and auto-promote Action Items into Milestones (on linked Project, or stand-alone if no Project).

## Why

The MTG capability area was elevated to first-class during the decision session — Tomas explicitly said the system should "help track the people we meet, the convo/meeting minutes etc". Treating Meetings as proper structured entities (not just Touch records) makes minutes searchable, action items trackable, and attendees correlated.

## Acceptance Criteria

- [ ] **FR-MTG-1 AC1:** Meeting "Strategy review" on 2026-05-30, attendees=[Marta, Diego], type=`group` → row in `meetings` + 2 rows in `meeting_attendees`
- [ ] **FR-MTG-1 AC2:** Form rejected if 0 attendees (Meeting must have ≥1)
- [ ] **FR-MTG-2 AC1:** Adding minutes "Discussed Q3 plan" + Action Item "Send budget proposal" due 2026-06-05 assignee=Tomas → `meetings.minutes` updated and Milestone created
- [ ] **FR-MTG-2 AC2:** Action Item added without due_date → saves with `due_date=null` and visible UI flag
- [ ] **FR-MTG-3 AC1:** Meeting with linked Project P, Action Item "Send proposal" → Milestone on P with same fields + `source_meeting_id` set
- [ ] **FR-MTG-3 AC2:** Meeting with NO linked Project → Milestone created with `project_id=null` and appears on assignee's This-Week independently (verify in Phase 2 AGB-103)
- [ ] **FR-MTG-6 AC1:** Meeting with 3 attendees + 1 linked Project → all 3 Contact-detail pages show this Meeting; Project-detail page shows it
- [ ] Meeting detail page at `/meetings/[id]` shows: header (title, date, type, location), attendees with quick-link chips, agenda, minutes editor, action items list, linked project (if any)
- [ ] `__tests__/AGB-009-meetings.test.ts` covers all ACs including Action Item → Milestone promotion

## Files to touch

```
app/meetings/page.tsx                  # list (basic)
app/meetings/new/page.tsx
app/meetings/[id]/page.tsx             # detail
app/meetings/actions.ts                # server actions
components/MeetingForm.tsx
components/MeetingDetail.tsx
components/AttendeePicker.tsx          # multi-select Contact picker
components/ActionItemList.tsx          # special list that hooks into Milestone create
components/MinutesEditor.tsx           # textarea or rich-text — start simple
lib/validation/meeting.ts
db/queries/meetings.ts
__tests__/AGB-009-meetings.test.ts
```

## Suggested approach

1. Server action `createMeeting(input)`:
   - Insert meeting + meeting_attendees in a transaction
   - For each action_item in input.action_items: insert a Milestone with source_meeting_id; project_id = meeting.linked_project_id (nullable)
2. Server action `addActionItem(meetingId, input)` for post-create:
   - Inserts a Milestone with source_meeting_id and project_id (from meeting's linked project or null)
3. AttendeePicker is a multi-select Combobox querying contacts (use shadcn's Combobox or react-select)
4. Minutes editor: textarea for v1. Could be Tiptap/lexical in Phase 6 if richer formatting needed.
5. ActionItemList renders Milestones where source_meeting_id = this meeting; "+ Add action item" opens MilestoneForm-mini

## Out of scope

- Post-Meeting Card prompt (AGB-401, Phase 4 — needs the calendar/WhatsApp hook)
- Voice-memo→Meeting auto-creation (Phase 3)
- Batch contact creation from event (AGB-301, Phase 3)
- Calendar integration to auto-create Meetings from calendar events (Phase 4 BRN-7)

## Notes

When Meeting is created WITHOUT a linked project, the resulting Milestones (from action items) are "stand-alone" — they belong to no project but the assignee can still see them in This-Week. This is an intentional v1 simplification — Phase 6 might add a "personal todos" concept if needed.
