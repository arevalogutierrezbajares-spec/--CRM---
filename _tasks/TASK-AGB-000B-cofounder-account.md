---
id: TASK-AGB-000B
title: Capture cofounder identity + create Founder-2 account
status: open
priority: P1
phase: 0
fr_covered: [FR-TEAM-1]
owner: null
branch: null
pr: null
estimated_points: 2
created: 2026-05-26
updated: 2026-05-26
blocked_by: [TASK-AGB-000A]
blocker_note: Requires cofounder to provide identity fields
---

## What

Capture cofounder identity (name, email, GitHub, WhatsApp, Obsidian vault path, timezone) and create their Founder-2 account in Supabase Auth. Add them to the `users` table mirror.

## Why

Per HLR-V2 / ADR-002 Founder 2 was deferred during the decision session. v1 requires both Founders authenticated for FR-TEAM-1 to be fully satisfied.

## Acceptance Criteria

- [ ] Cofounder identity captured in `docs/adr/ADR-002-locked-decisions.md` (Founder 2 section, replacing "TBD")
- [ ] Cofounder signs in via magic link at the deployed app and sees the home dashboard
- [ ] `users` table contains exactly 2 rows: Tomas (existing) + cofounder
- [ ] Cofounder added as collaborator to GitHub repo `arevalogutierrezbajares-spec/--CRM---`
- [ ] Cofounder added to Vercel project `agb-crm`
- [ ] Cofounder onboarded to `_WORKFLOW.md` (link sent + acknowledged)
- [ ] Cofounder timezone recorded in their `users.timezone` field

## Files to touch

```
docs/adr/ADR-002-locked-decisions.md     # update Founder 2 section
(no code changes — manual setup)
```

## Suggested approach

1. Ask cofounder for the 6 fields (name, email, GitHub, WhatsApp E.164, Obsidian path, timezone)
2. Update ADR-002 Founder 2 section
3. Invite their email through Supabase Dashboard → Authentication → Users → Invite
4. They click the magic link → land on `/login` → request another link if first one expires → sign in
5. Add their GitHub handle as collaborator on the repo
6. Add their email to Vercel project members
7. Send them HANDOFF.md + _WORKFLOW.md links

## Out of scope

- Permissions / role-based access (v1 is "both see everything")
- Cofounder-specific WhatsApp pairing (Phase 3 — depends on this task)

## Notes

After this lands, the deferred items list shrinks by 1 (cofounder identity). Update HANDOFF.md.
