---
id: TASK-AGB-SF-004
title: Partner room → create storefront request bridge
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
blocked_by: [TASK-AGB-SF-001, TASK-LINK-001]
blocker_note: Needs platform linkage fields + VAV auth env
---

## What

From a partner room that has VAV/Caney platform linkage (e.g. Ucaima), expose one action that creates a VAV storefront request with a sensible default brief (business name, region, goals placeholder) and the correct `providers.id` / subject id.

## Why

Ops should not copy UUIDs by hand. Partner rooms are the CRM home for posadas; storefront request should start there.

## Acceptance Criteria

- [ ] Action available on room detail when VAV provider id (or resolvable linkage) is present.
- [ ] Calls VAV create-request via `vavCreateStorefrontRequest` (HMAC).
- [ ] Surfaces request_id + status; handles 409 already-open gracefully.
- [ ] Unit test for payload assembly (no live VAV required).
- [ ] Documented for Ucaima pilot.

## Files to touch

```
app/(app)/partner-access/
components/partner-access/
lib/storefront/
__tests__/unit/
docs/storefront/
```

## Out of scope

- Designing the storefront (VAV AI).
- Publishing the storefront.
