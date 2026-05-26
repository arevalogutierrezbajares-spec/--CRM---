---
id: TASK-AGB-003
title: Tag system + venture workspace pill bar
status: review
priority: P0
phase: 1
fr_covered: [FR-WSP-1, FR-WSP-2, FR-WSP-3, FR-CON-3]
owner: OVL-AGB-Claude
branch: null
pr: null
estimated_points: 3
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-000A, TASK-AGB-011]
blocker_note: null
---

## What

Implement venture tag system end-to-end: seed-populated tags (`caney`, `vav`, `bd`, `friend`, `ai-ok`, `personal-only`) available app-wide, a top-bar pill selector for active workspace (`All` / `Caney` / `VAV` / `BD` / +custom), workspace context persisted across navigation, and the ability for Founders to author new venture tags.

## Why

Foundational for every Phase 1+ feature — Contact and Project lists need workspace filtering on day one. Cat#36 (One Graph + Venture Tags) is one of the required architectural decisions.

## Acceptance Criteria

- [ ] **FR-WSP-1 AC1:** Top bar pill selector renders with All (default), Caney, VAV, BD pills (seeded tags)
- [ ] **FR-WSP-1 AC2:** Custom-created tag appears as a new pill
- [ ] **FR-WSP-1 AC3:** Active workspace persists across navigation (cookie OR URL search-param `?ws=caney`)
- [ ] **FR-WSP-2 AC1:** When `?ws=caney` is active, every list/grid/board shows only items with venture tag `caney`
- [ ] **FR-WSP-3 AC1:** New tag created via UI is available for Contact tagging and appears as workspace pill
- [ ] **FR-WSP-3 AC2:** Creating new tag does NOT auto-tag existing Contacts
- [ ] **FR-CON-3 AC3:** Founder adding a tag that doesn't exist in `tags` auto-creates it with `kind=custom`
- [ ] Server-side: workspace filter applied in DB query (not just client-side filter) — required for grid performance
- [ ] A `<WorkspaceProvider>` React context exposes `{ activeWorkspace, setActiveWorkspace, allTags }` for consumers
- [ ] `__tests__/AGB-003-workspace.test.ts` covers FR-WSP-1/2/3

## Files to touch

```
components/WorkspacePillBar.tsx        # the pill selector
components/WorkspaceProvider.tsx       # React context
components/TagManager.tsx              # CRUD UI for custom tags (in Settings)
lib/workspace.ts                       # server-side helper to get active workspace from cookie/URL
db/queries/tags.ts                     # server actions for tag CRUD
app/(authed)/settings/tags/page.tsx    # tag management page
app/layout.tsx                         # mount the pill bar
__tests__/AGB-003-workspace.test.ts
```

## Suggested approach

1. Server action `setActiveWorkspace(slug)` writes a cookie `agb_workspace=<slug>`
2. `WorkspaceProvider` is a server component that reads the cookie + seeds initial state; client provider handles updates
3. Query helper `where(tagFilter)` returns a Drizzle `where` clause filtering contacts by tag (used by Contact list query and Project list query)
4. Tag CRUD: `/settings/tags` page with add/rename/delete (delete is soft — flag `archived` instead of dropping rows referenced by `contact_tags`)
5. The new tag appears in the pill bar immediately (revalidate after add)

## Out of scope

- Tag colors customization in UI (DB supports it but skip the picker until Phase 6 polish)
- Tag sharing between Founders (all tags are shared by default in v1)
- Bulk re-tagging operations (Phase 6)

## Notes

The seed already populates the 6 tags (per `db/seed.ts`). This task wires them into the UI + filter pipeline. After this lands, AGB-001 Contact CRUD can leverage the tag selector immediately.
