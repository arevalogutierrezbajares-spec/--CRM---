---
brain_node: crm
type: explanation
system: crm
title: Posada onboarding
summary: Product and ops notes for posada partner onboarding.
---

# Posada Onboarding Intake Wizard (AGB-CRM → TOUR PMS)

End-to-end note for the operator-facing wizard that stands up a posada (small
hotel) tenant in the TOUR PMS without anyone hand-editing the PMS. This is the
**CRM half** of the AI onboarding pipeline; the PMS owns intake → transform →
validate → deploy.

- **Route:** `/posada-onboarding` (authenticated, under `app/(app)/`).
- **Status:** merged to `main` 2026-06-15 · impeccable 37/40 · E2E 16/16 · `next build` clean.
- **Task:** `_tasks/TASK-AGB-ONB-001-posada-intake-wizard.md`.

## End-to-end flow

```
PMS operator console                AGB-CRM wizard                 TOUR PMS
─────────────────────               ──────────────                ────────
start onboarding session  ──▶  session_id + import_token
                                (deep link ?session=&token=
                                 or paste into step 1)
                                       │
                                capture posada (steps 2–6)
                                       │
                                review + "Enviar al PMS"
                                       │
                                server action (token kept
                                server-side) ───────────────▶  POST /api/v1/onboarding/
                                                               sessions/{id}/intake
                                                               Bearer <import_token>
                                                               { intake_revision, fields }
                                       ◀─────────────────────  ArtifactView { created }
```

The operator starts a session in the **PMS** console and gets a `session_id` plus
a short-lived (**10-minute**) signed `import_token`. They reach this wizard via a
deep link or by pasting both, fill in the posada, and submit. The submit is
**proxied server-side** so the bearer token never makes a cross-origin browser
request and is never in client code.

## The wire contract

`POST {CANEY_PMS_API_URL}/api/v1/onboarding/sessions/{sessionId}/intake`
with `Authorization: Bearer <import_token>` and body:

```json
{ "intake_revision": "crm-<hash>", "fields": { "records": [ … ] } }
```

`fields.records[]` is the exact shape the PMS transform consumes (mirrored in
`lib/onboarding/intake-contract.ts`). Record `type`s and their required fields:

| type | required | notes |
|---|---|---|
| `property_profile` | `name` | + optional `address`, `timezone` |
| `room_type` | `name`, `max_occupancy` | + `bed_type`, `amenities[]` (canonical tokens) |
| `room` | `room_number`, `room_type_name` | references a type by name |
| `rate_plan` | `room_type_name`, `base_rate`, `currency` | currency ∈ USD/VES/EUR |
| `cancellation_rule` | `tier_name`, `time_boundary_hours`, `refund_percentage` | optional |
| `payment_config` | `methods[]` | optional |

Live-ready needs the first four areas. Field keys/enums/taxonomy match the PMS
`transform.py` / `guard.py` / `taxonomy.py` exactly, so a record is never silently
dropped or turned into a transform gap.

**Idempotency:** `intake_revision` is a deterministic content hash, so a retry of
the same submission collapses to a no-op on the PMS (`created: false`).

## What the wizard does (beyond a dumb form)

- **Stepped capture** with a live "datos mínimos para activar" readiness strip;
  every chip / stepper count / review "Editar" link jumps to the exact step.
- **Bulk room entry** — type a range/list ("101-110, 201") and it expands,
  de-dupes against existing, preserves zero-padding; Enter-to-add everywhere.
- **Inline edit** of every item. Renaming a room type **cascade-renames** its
  rooms + rate plans (no orphans); removing a type with dependents confirms then
  cascade-removes.
- **Draft auto-persists** to `localStorage` (the token is *not* persisted) — a
  refresh or a 10-min token expiry mid-entry loses nothing; the token is
  re-pastable on the review step right before sending.
- **Graceful failure** — 401/403/404/400/5xx/timeout map to plain-Spanish
  operator messages (expired token, PMS-dark 404, etc.); the form is never wiped.

## Files

```
app/(app)/posada-onboarding/page.tsx       server page, requireUser, deep-link params
app/(app)/posada-onboarding/actions.ts     "use server" submit proxy → PMS (typed result)
components/posada-onboarding/intake-wizard.tsx   stepped client wizard
lib/onboarding/intake-contract.ts          zod + records assembly + readiness + helpers
__tests__/unit/posada-intake-contract.test.ts   unit tests (assembly, validation, helpers)
```

## Environment

- **`CANEY_PMS_API_URL`** (already in `.env.example`) — PMS backend base URL. Must
  be set on Vercel (preview + prod) or submit returns "CANEY_PMS_API_URL no está
  configurada". No new secret: the import token is per-session, supplied at
  runtime, never stored.

## Run / test locally

```bash
AGB_DEV_FAKE_USER=1 npm run dev      # fake-user auth bypass in dev
# open http://localhost:3000/posada-onboarding
```

Unit tests: `npx vitest run __tests__/unit/posada-intake-contract.test.ts`.

## Production status & caveats

- **Works and degrades gracefully today.** Until the PMS side is live the wizard
  shows the honest "Onboarding no está habilitado en el PMS…" message instead of
  breaking.
- **Live API (2026-07-14):** `POST /api/v1/onboarding/sessions/{id}/intake` is
  **not mounted** on Cloud Run (404). Staff property-onboarding + workbook
  import remain the real path for complex posadas (e.g. Ucaima packages).
- **For real submissions to succeed** the PMS needs: the onboarding pipeline
  deployed, `FF_ONBOARDING=1`, and `ONBOARDING_IMPORT_SECRET` set.
- **Platform linkage** (partner rooms → Caney/VAV ids) lives on each partner
  room page — see `docs/checklists/INTEGRATION-CLOSE-LOOP-CRM-CC-VAV.md`.
- **No sidebar nav entry yet** — reachable directly at `/posada-onboarding`
  (add a nav link when you want it surfaced).

## Deferred (product calls, not blockers)

1. Move the (expirable) token to the last step with a live countdown.
2. Make the wizard a *reconciler* — pre-fill from the PMS partial session or a
   pasted rate sheet instead of a blank capture form.
