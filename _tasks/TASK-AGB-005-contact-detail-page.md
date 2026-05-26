---
id: TASK-AGB-005
title: Contact detail page (touches + projects + intro chain + meetings)
status: open
priority: P1
phase: 1
fr_covered: [FR-CON-6, FR-MTG-6]
owner: null
branch: null
pr: null
estimated_points: 5
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-001, TASK-AGB-008, TASK-AGB-009]
blocker_note: null
---

## What

Full Contact detail page at `/contacts/[id]` with: header (name, relationship type, tags, owner, last-touch), tabbed sections for Touches / Projects / Meetings / Intro Chain / Notes. Replaces the basic placeholder from AGB-001.

## Why

`FR-CON-6` — Founders need a single page to see everything about a contact. Also satisfies `FR-MTG-6` (Meetings visible per attendee).

## Acceptance Criteria

- [ ] **FR-CON-6 AC1:** Contact with 10 touches over 60 days → all 10 render newest-first with date, channel, body preview
- [ ] **FR-CON-6 AC2:** Contact linked to 2 Projects → both project cards render with status + due date
- [ ] **FR-CON-6 AC3:** Contact with 3-hop intro chain (Diego → Marta → Andrea → THIS contact) → all 3 ancestors render as navigable tree
- [ ] **FR-MTG-6 AC1:** Contact appearing as attendee in any Meeting → those Meetings render on Contact detail with date + title
- [ ] Header shows: name (h1), avatar (initials), relationship badge, venture tag badges, owner avatar, "Last touch: X days ago"
- [ ] Quick action buttons in header: "Log touch", "Add to project", "New meeting", "Edit"
- [ ] Notes section editable inline (saves on blur to `contacts.notes_path` or a `contact_notes` table — TBD by implementer)
- [ ] Responsive: mobile collapses tabs to dropdown
- [ ] `__tests__/AGB-005-contact-detail.test.ts` smoke-tests all ACs

## Files to touch

```
app/contacts/[id]/page.tsx
components/ContactHeader.tsx
components/ContactTabs.tsx
components/IntroChainTree.tsx
components/NotesEditor.tsx
__tests__/AGB-005-contact-detail.test.ts
```

## Suggested approach

1. Server component fetches: contact + channels + tags + recent touches (50) + linked projects + meeting attendances + intro ancestors (recursive CTE)
2. Header is server-rendered; quick actions open client-component Dialogs (TouchForm from AGB-008, etc.)
3. Intro chain tree uses simple `<ul>` nested rendering — fancy graph viz is AGB-500
4. Notes: free-form text persisted on a dedicated column `contacts.notes` (or `contact_notes` table if we want history — implementer's call)

## Out of scope

- Full network graph viz (AGB-500)
- Reciprocity ledger surface (AGB-205)
- Send-from-this-page email/whatsapp (Phase 3 capture)
- Activity heatmap chart (Phase 6)

## Notes

Use `<Suspense>` for the heavier queries (intro chain CTE) so the header renders fast.
