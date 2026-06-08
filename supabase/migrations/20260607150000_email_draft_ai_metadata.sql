alter table public.email_drafts
  add column if not exists ai_generated boolean not null default false;

alter table public.email_drafts
  add column if not exists ai_metadata jsonb not null default '{}'::jsonb;
