---
id: TASK-AGB-SF-007
title: Structured storefront change-request feedback (patch intents)
status: open
priority: P2
phase: storefront
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 5
created: 2026-07-15
updated: 2026-07-15
blocked_by: []
blocker_note: Align with VAV Phase 3 feedback table
---

## What

Capture provider/Tomas change requests as structured patch intents (e.g. shorten_about, emphasize_gallery, swap_font) instead of free-text-only, and pass them into VAV generate with guidance.

## Why

Full AI re-roll causes drift and approval fatigue (storefront red-team finding).

## Acceptance Criteria

- [ ] Agreed enum of patch intents documented with VAV.
- [ ] AGB can submit guidance/patch payload into generate-draft.
- [ ] Free-text still allowed as fallback.

## Out of scope

- VAV patch engine implementation details (pair with VAV).
