-- Roadmap Module Wave 2 (FR-PLN-4): outcome recorded against success criteria
-- when an initiative completes — met / partial / missed, optional note.
-- Additive + idempotent.

alter table initiatives
  add column if not exists success_outcome text
    check (success_outcome in ('met', 'partial', 'missed'));

alter table initiatives
  add column if not exists success_outcome_note text;
