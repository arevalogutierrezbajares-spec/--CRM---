-- Presentations: support uploaded HTML decks alongside the existing
-- structured (JSON Slide[]) flow, plus an explicit public/team visibility
-- gate independent of the existing share-token mechanics.
--
-- Additive + idempotent. presentation_comments gets NO DDL — its
-- `slide_id text` already accepts either a structured slide id ("s3") or an
-- html anchor id ("slide-2" / "full").

do $$ begin
  create type presentation_kind as enum ('structured', 'html');
exception when duplicate_object then null; end $$;

do $$ begin
  create type presentation_visibility as enum ('team', 'public');
exception when duplicate_object then null; end $$;

alter table public.presentations
  add column if not exists kind presentation_kind not null default 'structured',
  add column if not exists html_url text,
  add column if not exists slide_map jsonb,
  add column if not exists visibility presentation_visibility not null default 'team';

-- Backfill: preserve existing intent for decks that were already shared —
-- a pre-existing row with share_enabled=true had a live public /p/[token]
-- link before this migration; without this backfill it would silently
-- become team-only the instant getPresentationByShareToken starts
-- requiring visibility='public' (see db/queries/presentations.ts).
update public.presentations
   set visibility = 'public'
 where share_enabled = true;
