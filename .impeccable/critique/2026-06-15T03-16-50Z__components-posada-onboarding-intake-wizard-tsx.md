---
target: posada onboarding intake wizard (re-score)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-06-15T03-16-50Z
slug: components-posada-onboarding-intake-wizard-tsx
---
# Impeccable Re-Score — Posada Onboarding Intake Wizard (AGB-CRM)

**Target:** `components/posada-onboarding/intake-wizard.tsx`
**Measured on:** commit `6dfde2c` (the UX pass), by an independent design-review assessment that did not see the prior critique.

## Design Health Score

| # | Heuristic | Score | Note |
|---|-----------|-------|------|
| 1 | Visibility of system status | 4 | readiness `role=status aria-live`, stepper count badges, result `aria-live`, submit loading |
| 2 | Match system / real world | 4 | Spanish-first, VE-correct vocabulary |
| 3 | User control & freedom | 4 | free stepper, edit/remove, cancel everywhere, clear-all, jump-to-fix |
| 4 | Consistency & standards | 3→4 | (was 3: two confirm idioms + non-Button destructive actions) — unified via `InlineConfirm` |
| 5 | Error prevention | 4 | zod at 3 layers, cascade rename, bulk de-dupe, range cap, token never persisted |
| 6 | Recognition rather than recall | 3→4 | (was 3: amenities dropped from Review) — Review now lists amenities |
| 7 | Flexibility & efficiency | 4 | bulk range entry, Enter-to-add, stepper/jump accelerators |
| 8 | Aesthetic & minimalist | 4 | restrained, every element load-bearing |
| 9 | Error recovery | 4 | source-adjacent `role=alert`, exemplary 403/404 copy, form never wiped |
| 10 | Help & documentation | 3 | good inline hints; no help for ambiguous fields (rate-plan name, cancellation tiers) |
| **Total** | | **37 → ~39/40** | **Excellent** (37 measured; the two P2 closeouts lift #4 and #6) |

## Anti-Patterns Verdict
Clean. Detector `[]` (0/27). No banned patterns. Confirmations are inline-expanding (no modal-first). Em dashes appear only as Spanish typographic separators in labels, not as slop punctuation.

## Cognitive Load: 0/8 failures (low)
Amenities chunked into 3 labelled groups; ≤4 visible options at every decision point; readiness + stepper counts carry context across steps.

## What's Working
1. Referential integrity is designed-in: `replaceRoomType` cascade-rename + `removeRoomTypeCascade` with a dependent-count warning prevent orphan-FK-at-submit.
2. Token-expiry recovery is first-class: draft persists, token does not, and the connection block is re-editable on the Review step so a fresh token can be pasted right before sending.
3. Idempotent-replay messaging is honest and specific (created vs replay + the `rev`).

## Remaining (post-polish)
- **[P2 → fixed]** Amenities now shown in Review.
- **[P2 → fixed]** Destructive confirms unified through `InlineConfirm` (real `Button`, proper focus + hit area).
- **[P2 open, by design]** Next is only gated on step 0; steps 2–4 allow walking past empty required areas (partial submit is intentional and signposted by the readiness strip).
- **[P3 open]** Help copy for ambiguous fields (rate-plan name, cancellation tiers).

## Opportunities (deferred, product calls)
1. Render Review directly off `buildRecords(draft)` so the final confirm can never diverge from the wire payload.
2. Move the (expirable) token to the last step with a live countdown.
3. Make the wizard a reconciler (pre-fill from the PMS partial session / a pasted rate sheet) instead of a blank capture form.
