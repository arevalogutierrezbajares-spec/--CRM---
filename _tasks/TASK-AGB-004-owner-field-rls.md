---
id: TASK-AGB-004
title: Owner field on Contact + Project + baseline RLS
status: open
priority: P0
phase: 1
fr_covered: [FR-TEAM-1, FR-TEAM-2, NFR-SEC-1]
owner: null
branch: null
pr: null
estimated_points: 3
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-000A]
blocker_note: null
---

## What

Wire the `owner_id` field on Contact and Project so every record has a Founder owner. Apply baseline Supabase RLS policies that match the v1 model: "both Founders can read+write all rows, but the `owner_id` field defaults to creator". Add a Supabase trigger or server-action layer that auto-mirrors `auth.users` into the public `users` table on first sign-in.

## Why

`FR-TEAM-2` requires owner field on every Contact and Project. Owner drives FR-BRN-4 (Weekly Briefing routing) and FR-TEAM-3 (owner filter in Phase 6). Even with no permissions in v1, RLS must be on for `NFR-SEC-1` (no anonymous reads).

## Acceptance Criteria

- [ ] **FR-TEAM-1 AC1:** Both Founders signing in produces 2 rows in `public.users` mirroring `auth.users`
- [ ] **FR-TEAM-1 AC2:** Founder A can read+edit data created by Founder B without permission gates
- [ ] **FR-TEAM-2 AC1:** New Contact and Project default `owner_id` to the creating Founder's `auth.uid()`
- [ ] **FR-TEAM-2 AC2:** Owner is mutable — Founder A can reassign a record to Founder B; future briefings route to B
- [ ] **NFR-SEC-1:** RLS enabled on every public table; unauthenticated SELECT returns 0 rows
- [ ] Supabase Auth trigger OR server-side `ensureUserRow()` helper creates a `public.users` row on first sign-in (display_name from email local part initially, editable in profile)
- [ ] `db/migrations/NNNN-rls-policies.sql` checked in
- [ ] `__tests__/AGB-004-rls.test.ts` verifies: (a) unauthenticated calls fail; (b) authenticated calls succeed; (c) owner_id auto-fills

## Files to touch

```
db/migrations/0002-rls-policies.sql       # new migration with RLS enable + policies
db/auth-mirror.ts                          # server-side helper or trigger
lib/auth.ts                                # ensureUserRow on every authed page load
db/schema.ts                               # confirm owner_id NOT NULL on contacts + projects
__tests__/AGB-004-rls.test.ts
```

## Suggested approach

1. Write a SQL migration that enables RLS on all 12 tables and adds policies:
   - `users`: SELECT/INSERT/UPDATE allowed where `id = auth.uid()` OR membership in `users` (effectively "both see both")
   - `contacts`, `projects`, `touches`, `milestones`, `meetings`, `tags`, `contact_*`, `project_*`, `meeting_*`, `pipeline_*`: SELECT/INSERT/UPDATE/DELETE allowed where `auth.uid()` is in `users.id`
2. Server-side helper `ensureUserRow()` runs on every authenticated request before queries:
   - Checks if `auth.uid()` has a matching `public.users` row
   - If not, inserts one with display_name = email local part, timezone = `America/New_York` (default per stack)
3. `createContact()` and `createProject()` server actions set `owner_id = auth.uid()` automatically
4. Owner reassignment UI is just a Select in the edit form (lists the 2 Founders)
5. Test RLS with an unauthenticated `postgres` client to confirm 0 rows returned

## Out of scope

- Role hierarchies / admin roles (v1 = both Founders equal)
- Per-record ACL (use of `confidential` tag is Phase 6)
- Audit log table for ownership changes (Phase 6)

## Notes

After this lands, every subsequent CRUD task can assume `owner_id` is wired. AGB-001/002/007/008/009 all depend on this for their default-owner behavior.
