---
id: TASK-AGB-001
title: Contact CRUD (form, list, server actions)
status: review
priority: P0
phase: 1
fr_covered: [FR-CON-1, FR-CON-2, FR-CON-3, FR-CON-5, FR-CON-7, FR-CAP-5]
owner: OVL-AGB-Claude
branch: null
pr: null
estimated_points: 5
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-010, TASK-AGB-011, TASK-AGB-003, TASK-AGB-004]
blocker_note: null
---

## What

End-to-end Contact CRUD: web form for create/edit, list page at `/contacts` (basic table — full grid comes in Phase 2 AGB-104), server actions for create/update/archive, all wired to the Drizzle schema + Supabase RLS.

## Why

First real feature. Validates the full stack (Auth → server action → Drizzle → Postgres → RLS → revalidate → UI) on the simplest entity. Every downstream task depends on having Contacts in the system.

## Acceptance Criteria

- [ ] **FR-CON-1 AC1:** Signed-in Founder submits Contact form (name "Marta López", type=person, relationship=lead) → row in `contacts` with correct values + `owner_id` = current Founder + `archived=false` + appears in list
- [ ] **FR-CON-1 AC2:** Empty name → form rejects with validation error, no row created
- [ ] **FR-CON-1 AC3:** No relationship type selected → defaults to `prospect`
- [ ] **FR-CON-2 AC1:** Adding email channel "marta@x.com" → row in `contact_channels`, `is_primary=false`
- [ ] **FR-CON-2 AC2:** First channel for a Contact → auto `is_primary=true`
- [ ] **FR-CON-2 AC3:** Multiple channels of same kind → exactly one `is_primary=true` per kind
- [ ] **FR-CON-3 AC1/2/3:** Tag selection works (covered also by AGB-003 — verify integration)
- [ ] **FR-CON-5 AC1:** Updating `relationship_type` from `friend` to `lead` preserves touches + intro chain + channels
- [ ] **FR-CON-7 AC1:** Archived Contact does NOT appear in default list
- [ ] **FR-CON-7 AC2:** With filter `archived=true`, archived Contact appears
- [ ] **FR-CAP-5:** Form has saved-on-blur semantics: tab away from a field, value persists; navigate away mid-edit, form retains the draft (via local storage or URL state)
- [ ] `__tests__/AGB-001-contact-crud.test.ts` exercises every AC above

## Files to touch

```
app/contacts/page.tsx                       # list view (basic table; full grid in AGB-104)
app/contacts/new/page.tsx                   # create form
app/contacts/[id]/edit/page.tsx             # edit form
app/contacts/actions.ts                     # server actions (createContact, updateContact, archiveContact)
components/ContactForm.tsx                  # the form (RHF + zod + shadcn)
components/ContactList.tsx                  # basic list table
lib/validation/contact.ts                   # zod schema
db/queries/contacts.ts                      # query helpers (listContacts, getContact, etc.)
__tests__/AGB-001-contact-crud.test.ts
```

## Suggested approach

1. Define the zod schema in `lib/validation/contact.ts` matching the Drizzle schema fields
2. Server actions in `app/contacts/actions.ts` using `'use server'`:
   - `createContact(input)`: validate → insert → if channels provided, insert each (first one `is_primary=true`); also insert tag rows
   - `updateContact(id, input)`: validate → update; if tags changed, diff `contact_tags`
   - `archiveContact(id)`: update `archived=true`
3. `ContactForm` uses `react-hook-form` + `zodResolver` + shadcn `<Form>`, `<Input>`, `<Select>`, multi-tag `<Combobox>` (shadcn composes one)
4. List page queries via `listContacts({ workspace, archived })` and renders a simple `<Table>` of shadcn — column: Name, Relationship, Tags, Last Touch, Owner
5. Tests use a Supabase test project OR Drizzle's `pglite` in-memory adapter for fast unit tests; mock auth for the unit pass; one e2e via Playwright covers the form submission round-trip

## Out of scope

- Dynamic grid with multi-filter — that's AGB-104 / AGB-106 in Phase 2
- Bulk operations (bulk archive, bulk tag) — Phase 6
- Contact merge (FR-CON-8) — Phase 6 (AGB-015)
- Avatar upload — Phase 6 polish

## Notes

Default columns for the basic list: Name (link to detail), Relationship Type (badge), Tags (badges), Last Touch (relative date), Owner. Don't over-engineer — the real grid lives in Phase 2.
