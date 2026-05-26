---
id: TASK-AGB-008
title: Touch entity — manual create + list
status: open
priority: P0
phase: 1
fr_covered: [FR-CAP-5]
owner: null
branch: null
pr: null
estimated_points: 3
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-001]
blocker_note: null
---

## What

Manual Touch entry (web form) + Touch list on Contact-detail. A Touch is "an interaction logged with a Contact" — channel (email/whatsapp/call/voice_memo/manual), body text, optional link to Project or Meeting. Phase 3 adds voice/email/WhatsApp auto-capture; this is the manual baseline.

## Why

Without Touches, the system has no relationship intelligence — no "last_touch_at" updates, no Conversation Memory (Phase 4 FR-BRN-6), no Watchdog (FR-BRN-1). Manual Touch is the simplest path to start populating the data.

## Acceptance Criteria

- [ ] Founder can add a Touch on a Contact via a "Log touch" button on Contact detail
- [ ] Form fields: channel (select), body (textarea), optional project link (select from Contact's linked Projects)
- [ ] On Touch insert, the Contact's `last_touch_at` updates to the Touch's `created_at`
- [ ] Touches render on Contact detail in reverse-chronological order (newest first)
- [ ] Each Touch row shows: date (relative), channel badge, body preview (first 100 chars), linked project chip if set
- [ ] Touch insert triggers a re-fetch / revalidation of the Contact detail page
- [ ] `__tests__/AGB-008-touch.test.ts` covers create + last_touch_at update + ordering

## Files to touch

```
app/contacts/[id]/page.tsx              # the detail page (also AGB-005 builds this)
components/TouchList.tsx
components/TouchForm.tsx                # in a Dialog
app/contacts/[id]/touches/actions.ts    # createTouch server action
lib/validation/touch.ts
db/queries/touches.ts
db/triggers/last-touch-at.sql           # OR computed via server action — simpler to start
__tests__/AGB-008-touch.test.ts
```

## Suggested approach

1. `createTouch(input)` server action:
   - Insert touch row with channel=`manual` (default for web form), `created_by=auth.uid()`
   - In the same transaction, update `contacts.last_touch_at = NEW.created_at` if newer
2. Could be a DB trigger instead — but server-action simpler for v1 (less DB-side complexity)
3. TouchList renders the timeline; reuse for Project-detail (AGB-006) and Meeting-detail (AGB-009)

## Out of scope

- Editing or deleting Touches (audit considerations — Phase 6)
- Touch from Voice memo / WhatsApp / email — Phase 3 tasks
- Touch threading / replies — Phase 6+

## Notes

The `last_touch_at` field is critical for FR-BRN-1 (watchdog). Make sure the update happens in the same transaction as the insert to avoid race conditions.
