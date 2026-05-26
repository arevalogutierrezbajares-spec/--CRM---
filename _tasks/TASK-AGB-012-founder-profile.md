---
id: TASK-AGB-012
title: Founder profile page (timezone, display name, briefing prefs)
status: open
priority: P1
phase: 1
fr_covered: [FR-TEAM-1]
owner: null
branch: null
pr: null
estimated_points: 2
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-004, TASK-AGB-011]
blocker_note: null
---

## What

`/profile` page where a Founder edits their display name, timezone, and (placeholder for) Weekly Briefing preferences. Required for FR-BRN-4 (timezone determines briefing delivery time).

## Why

`FR-TEAM-1` requires per-Founder profile fields. Timezone in particular is consumed by Phase 4 (Weekly Briefing at 07:00 local time).

## Acceptance Criteria

- [ ] `/profile` route renders the signed-in Founder's current values (display_name, email, timezone)
- [ ] Display name editable inline (saves on blur to `users.display_name`)
- [ ] Timezone selectable from a dropdown of IANA TZ values (use `Intl.supportedValuesOf('timeZone')` or a curated list)
- [ ] Briefing preferences section is a stub for Phase 4 (placeholder explaining "Will be enabled in Phase 4 Active Brain")
- [ ] Email field shown but NOT editable (auth email is immutable)
- [ ] Changes persist and survive page refresh
- [ ] `__tests__/AGB-012-profile.test.ts` covers update + readback

## Files to touch

```
app/profile/page.tsx
components/ProfileForm.tsx
app/profile/actions.ts
__tests__/AGB-012-profile.test.ts
```

## Suggested approach

Simple form, server action updates `users` row. Validate timezone against `Intl.supportedValuesOf('timeZone')`. Default to `America/New_York` (Tomas's locked TZ from ADR-002).

## Out of scope

- Avatar upload (Phase 6)
- Email change (requires Supabase Auth admin flow — out of v1)
- Per-user notification preferences (deeper config — Phase 4)

## Notes

The timezone field unlocks FR-BRN-4 — Weekly Briefing fires at 07:00 in the Founder's TZ. Tomas's TZ is locked to America/New_York; cofounder's TZ depends on AGB-000B.
