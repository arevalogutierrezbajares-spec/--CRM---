---
id: TASK-AGB-011
title: Root layout + nav + sign-out
status: open
priority: P0
phase: 1
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 2
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-010]
blocker_note: null
---

## What

Replace the scaffolded `app/layout.tsx` with a real app shell: top bar containing AGB CRM logo/text, workspace pill bar placeholder (AGB-003 fills it), main nav links (Contacts / Projects / Meetings / This Week), Founder avatar dropdown with sign-out.

## Why

Every Phase 1 page needs consistent chrome. Without a layout, navigation is broken and the app feels broken.

## Acceptance Criteria

- [ ] `app/layout.tsx` wraps every page in a 2-row layout: top bar + main content area
- [ ] Top bar shows AGB CRM wordmark (left), workspace pill bar placeholder (center — actual pills come in AGB-003), Founder avatar + dropdown (right)
- [ ] Nav links: Contacts (`/contacts`), Projects (`/projects`), Meetings (`/meetings`), This Week (`/`). All four routes exist as empty `app/<route>/page.tsx` returning a heading
- [ ] Avatar dropdown contains: signed-in email, "Profile" link (`/profile`), "Sign out" button
- [ ] Sign-out button calls `supabase.auth.signOut()` via client and redirects to `/login`
- [ ] Layout uses shadcn Avatar + DropdownMenu (from AGB-010)
- [ ] Layout is responsive: mobile shows hamburger that opens a Sheet with the same nav
- [ ] Login page and auth-callback NOT wrapped (use route group `(public)`)
- [ ] Build clean

## Files to touch

```
app/layout.tsx              # main layout
app/(public)/login/page.tsx # moved into route group
app/(public)/auth/callback/route.ts
components/AppShell.tsx     # the actual shell
components/NavLinks.tsx
components/FounderMenu.tsx
app/contacts/page.tsx       # empty placeholder
app/projects/page.tsx       # empty placeholder
app/meetings/page.tsx       # empty placeholder
app/profile/page.tsx        # empty placeholder
```

## Suggested approach

1. Create `(public)` route group containing `login/page.tsx` and `auth/callback/route.ts` (move files; `(public)` has its own layout with no shell)
2. Replace `app/layout.tsx` body with `<AppShell>{children}</AppShell>` (only when wrapped layout applies; `(public)` overrides)
3. Build `AppShell` component using shadcn primitives
4. Use `next/link` for nav, `usePathname` for active highlighting
5. Sign-out: a client component that hits `supabase.auth.signOut()` then `router.push('/login')`

## Out of scope

- Designing the actual workspace pill bar (AGB-003)
- Profile page contents (AGB-012)
- Empty pages' actual contents (each phase task fills them)

## Notes

Keep the AGB CRM wordmark text-only for v1 — no logo asset yet. Use Bebas Neue or system fontstack — match the wordmark to the brand later (Phase 6 polish).
