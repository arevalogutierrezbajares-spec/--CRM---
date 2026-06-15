---
id: TASK-AGB-ONB-001
title: Posada onboarding intake wizard (AGB-CRM → TOUR PMS)
status: review
priority: P1
phase: 7
fr_covered: [FR-BR-1, FR-BR-2, FR-BR-3, FR-BR-4, FR-BR-5, FR-GAP-1]
owner: OVL-TG
branch: feat/posada-onboarding-intake
pr: null
estimated_points: 5
created: 2026-06-14
updated: 2026-06-14
blocked_by: []
blocker_note: null
---

## What

A capture surface in AGB-CRM (the "CAP-\*" intake wizard) that collects a posada's
structured details and pushes them to the TOUR PMS onboarding import endpoint, so
an operator can stand up a PMS tenant without hand-editing the PMS. The PMS-side
pipeline (intake → transform → validate → deploy) already exists and ships dark
behind `Flags.ONBOARDING`; this is the cross-repo CRM half noted in the PMS
onboarding handoff.

Flow: the PMS operator starts an onboarding session in the TOUR console and
receives a `session_id` + a short-lived (10-minute) signed `import_token`. They
open this wizard via deep link (`/posada-onboarding?session=<id>&token=<token>`)
or by pasting both into the connection step, capture the posada, and submit. The
submit is proxied **server-side** so the bearer token never makes a cross-origin
browser request and is never embedded in client code.

The FR IDs above are owned by the PMS spec `docs/ONBOARDING-PIPELINE-FRS.md`
(`--TOURISM--`), not AGB's `FR-MATRIX.md` — this task is the CRM consumer of that
contract.

## Why

This implements the CRM half of the AI onboarding pipeline:
- **FR-BR-1** — authenticate to the PMS with the signed, tenant-bound, scoped import token.
- **FR-BR-2/3/4** — push structured intake; idempotent on a content-derived revision (retry = no-op).
- **FR-BR-5** — a cross-tenant/expired token is surfaced, never silently dropped.
- **FR-GAP-1** — show live-readiness (property/room_type/room/rate_plan) before submit.

User need: operators currently have no UI to feed the PMS onboarding pipeline; the
PMS console's token panel assumes this capture surface exists.

## Acceptance Criteria

- [ ] **Contract:** wizard POSTs `{ intake_revision, fields:{ records:[…] } }` to
      `POST {CANEY_PMS_API_URL}/api/v1/onboarding/sessions/{id}/intake` with
      `Authorization: Bearer <import_token>`; record shapes/keys/enums match the PMS
      `transform.py`/`guard.py`/`taxonomy.py`. *(unit-tested)*
- [ ] **Idempotency:** identical content yields an identical revision → PMS dedups
      (`created=false`); changed content yields a new revision. *(unit-tested)*
- [ ] **Validation:** wizard rejects non-canonical currency, non-positive occupancy,
      negative rate, refund out of 0..100, unresolved/duplicate room-type refs before
      submit. *(unit-tested)*
- [ ] **Error/expiry UX:** 401/403/404/400/5xx/timeout map to clear operator messages;
      token-expiry and PMS-dark (404) are explained with a re-paste path.
- [ ] **Auth/CORS:** token forwarded only from the server action; page gated by `requireUser()`.
- [ ] **Operator verify (gate):** live round-trip once the PMS flips `FF_ONBOARDING=1` and
      `CANEY_PMS_API_URL` points at the backend — `created=true` then a replay `created=false`.

## Files to touch

```
app/(app)/posada-onboarding/page.tsx        # server page, requireUser, deep-link params
app/(app)/posada-onboarding/actions.ts      # "use server" submit proxy → PMS
components/posada-onboarding/intake-wizard.tsx  # stepped client wizard
lib/onboarding/intake-contract.ts           # zod + records assembly + readiness + revision
__tests__/unit/posada-intake-contract.test.ts   # 15 unit tests
.env.example                                 # CANEY_PMS_API_URL comment (var already present)
```

## Suggested approach

1. Mirror the PMS record contract in a pure, framework-agnostic `lib/` module (importable by client + server, unit-testable). ✅
2. Server action forwards to the PMS with the bearer token, maps status codes to a typed result. ✅
3. Stepped client wizard (connection → property → room types → rooms → rates → policies → review) with a live readiness strip. ✅
4. Unit tests for assembly/validation/readiness/revision; tsc + eslint + vitest green. ✅

## Out of scope

- Photo drag-board / binary artifact upload (PMS multipart route still stubbed; `POST /sessions/{id}/artifacts`).
- Starting/aborting/archiving PMS sessions from the CRM (operator-only PMS JWT endpoints).
- Unstructured (free-text/vision) intake — handled by the PMS LLM provider seam.
- Playwright e2e for the wizard (add a happy-path spec when wiring it into nav).

## Notes

- `CANEY_PMS_API_URL` already exists in `.env.example`; no new secret — the import
  token is per-session and supplied at runtime, never stored.
- Built on `feat/posada-onboarding-intake` off `origin/main`; does not touch `main`
  and is independent of the in-flight `feat/roadmap-editor-instant` work.
- Verified: `tsc --noEmit` clean, eslint clean, `vitest run` 414/414 (incl. 15 new).
