-- Roadmap Module Wave 2 (FR-PLN-2): action items reviewed during a planning
-- session. "Dismiss" stamps this so the item stays an ordinary open action
-- item but stops appearing in the unlinked-work triage list.
-- Additive + idempotent.

alter table action_items
  add column if not exists plan_reviewed_at timestamptz;
