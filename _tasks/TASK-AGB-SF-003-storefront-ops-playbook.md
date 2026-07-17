---
id: TASK-AGB-SF-003
title: Tomas storefront ops playbook (MCP until UI)
status: open
priority: P0
phase: storefront
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 2
created: 2026-07-15
updated: 2026-07-15
blocked_by: [TASK-AGB-SF-002]
blocker_note: null
---

## What

Write a short operator playbook for running the storefront design queue from AGB: create/list → generate → preview → notes for VAV publish (Phase 3).

## Why

Without a dedicated queue UI, Tomas needs a single doc to run the loop without rediscovering tool names and failure modes.

## Acceptance Criteria

- [ ] Playbook lives under `docs/storefront/` with step-by-step MCP commands/inputs.
- [ ] Covers: new request, open request 409, generate draft, open preview URL, hand-edit handoff.
- [ ] Links to VAV Phase 3 publish once available; until then documents “preview only”.
- [ ] Linked from `AGB-STOREFRONT-WORK-NOTE.md`.

## Files to touch

```
docs/storefront/OPS-PLAYBOOK.md
docs/storefront/AGB-STOREFRONT-WORK-NOTE.md
```

## Out of scope

- Building the CRM queue UI (SF-006).
