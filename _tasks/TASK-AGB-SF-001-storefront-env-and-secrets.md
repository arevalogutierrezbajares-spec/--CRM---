---
id: TASK-AGB-SF-001
title: Configure VAV storefront service-auth env on AGB
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
blocked_by: []
blocker_note: null
---

## What

Set production (and staging) environment variables so AGB can call VAV’s HMAC-protected storefront internal API.

## Why

MCP tools `create_storefront_request`, `list_storefront_queue`, `generate_storefront_draft`, `get_storefront_preview_link` all hard-fail without `VAV_STOREFRONT_BASE_URL` + `VAV_STOREFRONT_SERVICE_SECRET`. Code is shipped; secrets are not.

## Acceptance Criteria

- [ ] `VAV_STOREFRONT_BASE_URL` set on AGB Vercel production (and staging if used).
- [ ] `VAV_STOREFRONT_SERVICE_SECRET` matches VAV’s `VAV_STOREFRONT_SERVICE_SECRET`.
- [ ] Optional `VAV_STOREFRONT_SERVICE_SECRET_PREVIOUS` documented for rotation window.
- [ ] `docs/storefront/AGB-STOREFRONT-WORK-NOTE.md` env checklist marked live for each environment.
- [ ] One authenticated MCP or curl-signed call from AGB runtime succeeds (or SF-002 covers smoke).

## Files to touch

```
(no app code required — Vercel/env + docs)
docs/storefront/AGB-STOREFRONT-WORK-NOTE.md
```

## Suggested approach

1. Generate secret; set on VAV first; mirror on AGB.
2. Confirm base URL is the VAV deployment that has `/api/internal/storefront/v1/*`.
3. Document rotation in the work note.

## Out of scope

- Implementing MCP tools (already present).
- DNS wildcard for storefronts.
