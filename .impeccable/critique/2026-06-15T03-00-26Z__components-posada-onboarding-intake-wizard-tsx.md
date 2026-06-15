---
target: posada onboarding intake wizard
total_score: 32
p0_count: 0
p1_count: 4
timestamp: 2026-06-15T03-00-26Z
slug: components-posada-onboarding-intake-wizard-tsx
---
# Impeccable Critique — Posada Onboarding Intake Wizard (AGB-CRM)

**Target:** `components/posada-onboarding/intake-wizard.tsx` (+ page, actions, intake-contract)
**Register:** product (internal Spanish-first operator tool)
**Method:** Assessment A (independent LLM design review) + Assessment B (deterministic detector) + director synthesis.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Live readiness strip + per-step active state + submit loading + idempotent-vs-created messaging. Gap: readiness never says *which step* fixes a missing area; no count badges on steps; banners not `aria-live`. |
| 2 | Match system / real world | 4 | Domain-fluent Spanish (VES, Pago móvil, Zelle, Binance, posada, pax, America/Caracas). Speaks to a Venezuelan operator. |
| 3 | User control & freedom | 3 | Free-jump stepper + Back + per-item remove. Gaps: no inline edit (remove + re-key only), no clear-all/undo. |
| 4 | Consistency & standards | 4 | One component vocabulary (Section/Field/AddCard/ItemList/Banner) + shared primitives. Minor: CreditCard icon reused for two steps. |
| 5 | Error prevention | 3 | FK pre-validation + duplicate-name guard + canonical enums + connection gate. Gaps: blank rate `Number("")===0` becomes a free room; no guard when a referenced type is removed/renamed; no confirm on destructive remove. |
| 6 | Recognition rather than recall | 3 | Selects for bed/currency/type (never type a token); readiness keeps goal visible. Memory bridge: review banners name blocking areas but don't link to the step. |
| 7 | Flexibility & efficiency | 2 | One rigid path. No bulk room entry (8–30 rooms one-at-a-time), no duplicate, no inline edit, no Enter-to-add, no reorder. Smart defaults exist but stop short. |
| 8 | Aesthetic & minimalist | 4 | Restrained, every element earns its pixel. Product-register floor met. |
| 9 | Error recovery | 3 | Every PMS status → plain-Spanish actionable message (403 token-expiry, 404 dark). Gaps: only first zod issue shown; review "datos inválidos" banner is vague (no field/step). |
| 10 | Help & documentation | 3 | Inline hints on fields, flow + token lifetime explained. No pointer to *where in the PMS console* the session id/token live; no taxonomy tooltips. |
| **Total** | | **32/40** | **Good — solid foundation; address efficiency + review-step navigation.** |

## Anti-Patterns Verdict
**Not AI slop.** Deterministic detector: **clean (`[]`, 0 of 27 patterns)** on wizard + page. No side-stripe borders, no gradient text, no glassmorphism, no hero-metric, no modal-first, no em-dash UI copy. Hand-built shadcn/Radix product UI. Faintest fingerprint: Section→AddCard→ItemList regularity makes every step structurally identical — that's consistency, not slop.

## Cognitive Load: 1/8 failures — LOW (good)
Only failure: **16 amenities rendered as a flat checkbox wall** (Wall-of-Options >4, no grouping/search). P2.

## What's Working
1. **The FK dependency is taught, not just enforced.** Rooms/rates render a warm "define a room type first" banner instead of a broken form, and the type is a `Select` (never typed) + guarded in `superRefine`. Best decision in the build.
2. **Idempotency is real value, surfaced honestly.** Content-hash revision + "Reenvío idempotente… sin cambios" vs "registros recibidos" reassures a nervous operator on a flaky PMS connection — no duplicate tenant.
3. **Dark-PMS / token-expiry are first-class.** The two failure modes this will actually hit in production both produce a recoverable, plain-Spanish message.

## Priority Issues
- **[P1] No inline edit.** Every list item is add-or-remove only; fixing a typo means delete + re-key (and removing a type orphans its rooms/rates). Fix: edit affordance repopulating the add-form; cascade-rename room-type name into referencing rooms/rates. → `clarify`/`adapt`
- **[P1] Bulk/sequential room entry missing.** A posada has 8–30 rooms, mostly sequential + same type, but entry is one add-form cycle each. Fix: range generator ("101-110"), duplicate, Enter-to-add. → `delight`/`adapt`
- **[P1] Review-step validation doesn't navigate.** "Hay datos inválidos. Revisa los pasos anteriores" — no field, no step, no link. Fix: blocking areas + invalid paths become buttons that `setStep`; show the first invalid field. → `clarify`
- **[P1/correctness] Blank rate becomes a free room.** `Number("")===0` passes `nonnegative`. Fix: reject empty base rate at the form. → `harden`
- **[P2] 16-amenity checkbox wall.** Only Wall-of-Options in the build. Fix: group into essentials/comfort/location. → `layout`
- **[P2] Stale-reference window.** Add-forms seed `roomTypeName` from `roomTypeNames[0]` at mount; removing the selected type mid-entry leaves stale local state (submit guard saves correctness, interaction confuses). Fix: reconcile selection against live names. → `harden`
- **[P3] No draft persistence.** Token expires at 10 min; an operator entering 20 rooms can blow past it, hit 403, go get a new token (tab switch), and return to an empty draft — all data lost. Fix: persist `draft` (not the token) to localStorage keyed by session. → `harden`
- **[P3] No confirm on destructive remove.** Removing a type silently invalidates its rooms/rates. Fix: confirm when dependents exist ("esto dejará N habitaciones sin tipo"). → `harden`

## Persona Red Flags
- **Jordan (first-timer):** session id / token explained in prose but no pointer to *where in the PMS console* they live; review "datos inválidos" gives nothing to act on; adding an item has no toast confirmation — easy to miss on a long page.
- **Riley (stress tester):** refresh mid-flow = total data loss; blank rate coerces to a free room; removing a type after wiring rooms shows rooms that will fail at submit with no in-list warning.
- **Sam (accessibility):** strong base (focus rings, 44px targets, `aria-invalid` on session field, `aria-label` on remove) but readiness strip + submit result aren't `aria-live` (the most important state change is silent for screen readers); add-form errors not wired via `aria-describedby`/`role="alert"`; stepper buttons lack `aria-current="step"`.

## Minor Observations
- `CreditCard` icon does double duty for Tarifas + Pagos steps — pick distinct icons.
- Readiness label "Listo para producción" is slightly jargon-y; "Datos mínimos para activar" is warmer.
- `SESSION_ID_RE` duplicated across wizard + actions — centralize in the contract.

## Questions to Consider
1. Connection (the expirable, time-sensitive input) is step 1 of 7, then you ask the operator to spend 5–15 min typing rooms before they use it. Should the token live on the *last* step with a live countdown, so it can't go stale mid-flow?
2. If structured intake is "high-trust, operator-curated," why a dumb capture form rather than a *reconciler* — pre-fill from the PMS partial session or a pasted rate sheet, so the operator confirms instead of re-types?
3. Readiness is non-blocking ("puedes completarlas en otro envío") — is "submit an incomplete tenant" ever what the operator wants, or does it just create half-onboarded posadas someone chases later?
