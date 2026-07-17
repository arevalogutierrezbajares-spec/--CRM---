---
id: TASK-AGB-SF-006
title: In-CRM storefront queue UI for Tomas
status: open
priority: P2
phase: storefront
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 8
created: 2026-07-15
updated: 2026-07-15
blocked_by: [TASK-AGB-SF-002]
blocker_note: null
---

## What

A simple AGB page: list open storefront requests (from VAV queue), show status, open preview link, trigger generate-draft.

## Why

MCP-only is fine for v0; a queue UI reduces friction once volume > a few providers.

## Acceptance Criteria

- [ ] Authenticated AGB page lists queue items (status filter).
- [ ] Actions: refresh, generate draft, open preview URL.
- [ ] Errors from VAV HMAC/API shown clearly.
- [ ] Mobile-usable (Tomas on phone).

## Out of scope

- Full design editor.
- Provider-facing approval UI (lives on VAV).
