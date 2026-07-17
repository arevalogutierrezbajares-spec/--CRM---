---
id: TASK-AGB-SF-002
title: Live-smoke storefront MCP tools against VAV staging
status: open
priority: P0
phase: storefront
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 3
created: 2026-07-15
updated: 2026-07-15
blocked_by: [TASK-AGB-SF-001]
blocker_note: Needs SF-001 secrets
---

## What

End-to-end smoke of the four storefront MCP tools against a real VAV environment with a real provider subject id.

## Why

Unit tests mock fetch. Ops needs proof the signed contract works live before Tomas runs design queue from Claude/MCP.

## Acceptance Criteria

- [ ] `create_storefront_request` creates a row (or 409 if open request exists) for a known VAV provider UUID.
- [ ] `list_storefront_queue` returns that request.
- [ ] `generate_storefront_draft` returns `page_id`, `version`, `preview_url`.
- [ ] `get_storefront_preview_link` returns a working tokenized path.
- [ ] Bad/missing HMAC → 401 from VAV (document once).
- [ ] Evidence snippet pasted into this task Notes or work note.

## Files to touch

```
docs/storefront/AGB-STOREFRONT-WORK-NOTE.md  # evidence
__tests__/unit/mcp-storefront-tools.test.ts  # only if contract drift
lib/storefront/vav-client.ts                 # only if bug found
```

## Suggested approach

1. Use Claude Code MCP or a small script calling `vavCreateStorefrontRequest` etc.
2. Use a non-prod VAV + test provider when possible.
3. Do not leave spam open requests on prod without cancel path.

## Out of scope

- Phase 3 publish.
- Partner-room UI bridge (SF-004).
