---
id: AGB-WA-004
title: Show AI + tech spend on home dashboard and link to treasury
status: open
priority: P1
phase: Wave D — WA Media
fr_covered: [AGB-WA-003]
owner: null
branch: null
pr: null
estimated_points: 3
created: 2026-06-05
updated: 2026-06-05
blocked_by: []
blocker_note: null
due_by: 2026-06-08
---

## What

Add a dashboard card on the home view that shows:

- Today's AI token spend (in/out tokens and cost)
- Today's + MTD tech spend from finance categories (`AI & Compute`, `Tech & SaaS`)
- A direct action to open Treasury

The feature should keep rendering with zero values when analytics data is missing and should be visible in the current daily view right rail.

## Why

This gives one-screen visibility into the operating cost burn while keeping the team focused on execution. It connects directly to existing WA/LLM token capture and finance categories so spend can be actively controlled.

## Acceptance criteria

- [ ] A home right-rail card exists for "AI + Tech spend" with today’s token in/out + cost.
- [ ] Tech spend reads from `Tech & SaaS` and `AI & Compute` categories and reports today + month-to-date values.
- [ ] Card has a clear CTA to the existing treasury screen.
- [ ] If no data exists, card renders a deterministic zero-state (no errors).
- [ ] Home page remains functional with treasury/AI queries failing (safe defaults only).

## Files to touch

```
app/(app)/(home)/page.tsx
components/dashboard/right/ai-tech-spend-card.tsx
db/queries/treasury.ts
```

## Suggested approach

1. Add a dashboard query result for AI token spend (`getAnthropicSpendToday`) to home page bootstrap.
2. Add/extend treasury query for tech spend summary by the two category names.
3. Render a compact card in right rail with a treasury deep link.

## Out of scope

- Per-user spend quotas or billing alerts.
- Changes to how `wa_activity` is written.
- Any change to treasury routing logic.

## Notes

Target completion target: Monday, 2026-06-08.
