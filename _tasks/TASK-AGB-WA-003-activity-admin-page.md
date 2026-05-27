---
id: AGB-WA-003
title: /wa-activity admin page — token usage + cost tracking
status: open
phase: Wave D — WA Media
priority: P1
points: 3
agent: OVL-AGB-Claude
---

## What

Build a simple `/wa-activity` admin page that reads from `wa_activity` and
shows per-day token usage, cost, and per-sender message counts.

## Why

The agent loop logs every invocation to `wa_activity` (tokens_in, tokens_out,
cost_millicents). Without a page to read it you're flying blind on cost. The
HANDOFF notes this as the main missing production hardening piece.

## Schema (already exists)

```
wa_activity: id, workspace_id, user_id, sender_phone, direction,
             payload, tokens_in, tokens_out, cost_millicents, created_at
```

## Acceptance criteria

- [ ] `/wa-activity` page protected by `requireUser()` (existing auth check)
- [ ] Shows last 7 days of activity: date | messages in | messages out | tokens | cost ($)
- [ ] Shows per-sender breakdown for today
- [ ] Total cost in USD (cost_millicents ÷ 100000)
- [ ] Empty state if no activity yet
- [ ] No new API endpoints needed — server component reading directly from DB is fine
