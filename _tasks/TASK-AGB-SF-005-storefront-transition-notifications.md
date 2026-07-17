---
id: TASK-AGB-SF-005
title: Storefront lifecycle notifications (ops + optional provider)
status: open
priority: P1
phase: storefront
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 5
created: 2026-07-15
updated: 2026-07-15
blocked_by: [TASK-AGB-SF-002]
blocker_note: Needs live queue; may depend on VAV webhooks/events
---

## What

Notify Tomas (and optionally the provider) when storefront request state changes: requested, in_design (draft ready), in_review, approved/published.

## Why

Queue polling via MCP alone will miss drafts sitting in preview.

## Acceptance Criteria

- [ ] Ops notification channel chosen (email and/or WhatsApp to Tomas) and documented.
- [ ] At least: “draft ready” (after generate) and “published” (when VAV Phase 3 emits).
- [ ] No spam on every list-queue poll.
- [ ] Failure to notify does not block VAV write path.

## Files to touch

```
lib/wa-agent/ or email helpers
app/api/ or Inngest equivalent if AGB has jobs
docs/storefront/
```

## Out of scope

- Implementing VAV state machine (VAV Phase 3).
