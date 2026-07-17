-- P0 partner e-sign lifecycle: document freeze at request, consent metadata,
-- placement + stamp status, notify tracking. Additive + idempotent.

-- ── Request: frozen document + notify tracking ───────────────────────────────
alter table partner_signature_requests
  add column if not exists source_storage_path text,
  add column if not exists frozen_storage_path text,
  add column if not exists document_sha256_at_request text,
  add column if not exists document_byte_length integer,
  add column if not exists document_mime_type text,
  add column if not exists notify_emails text[],
  add column if not exists last_notified_at timestamptz,
  add column if not exists notify_error text,
  add column if not exists expires_at timestamptz;

-- ── Signature: consent + placement + stamp lifecycle ─────────────────────────
alter table partner_signatures
  add column if not exists consent_accepted boolean not null default true,
  add column if not exists consent_text_key text,
  add column if not exists consent_locale text,
  add column if not exists consent_at timestamptz,
  add column if not exists placement jsonb,
  add column if not exists stamp_status text not null default 'pending',
  add column if not exists stamp_error text,
  add column if not exists stamp_attempts integer not null default 0;

-- Event types for notify / stamp lifecycle (Postgres enum: add if missing).
do $$ begin
  alter type partner_access_event_type add value if not exists 'signature_notify_sent';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type partner_access_event_type add value if not exists 'signature_notify_failed';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type partner_access_event_type add value if not exists 'signed_pdf_downloaded';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type partner_access_event_type add value if not exists 'signature_stamp_retried';
exception when duplicate_object then null;
end $$;
