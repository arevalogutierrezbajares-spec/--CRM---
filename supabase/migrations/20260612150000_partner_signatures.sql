-- Partner-room e-signatures: the owner requests a signature on a repository
-- entry (share or item); the guest signs from the public portal (drawn
-- signature + typed name + consent). The signature row is the audit record —
-- server-side timestamp, signer identity, document SHA-256, IP, user agent —
-- and, for stored PDFs, a stamped signed copy lands back in storage.
-- Idempotent + additive.

create table if not exists partner_signature_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  target_kind text not null,                  -- 'share' | 'item'
  target_id uuid not null,
  title_snapshot text not null,               -- doc title at request time
  message text,                               -- optional note shown to the signer
  status text not null default 'pending',     -- pending | signed | voided
  requested_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, target_kind, target_id)
);
create index if not exists partner_signature_requests_room_idx
  on partner_signature_requests(room_id, status);
create index if not exists partner_signature_requests_workspace_idx
  on partner_signature_requests(workspace_id);

create table if not exists partner_signatures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  request_id uuid not null unique references partner_signature_requests(id) on delete cascade,
  member_id uuid references partner_room_members(id) on delete set null,
  signer_name text not null,
  signer_email text,
  signature_image_path text,                  -- drawn signature PNG in storage
  document_sha256 text,                       -- hash of the exact bytes signed
  signed_pdf_path text,                       -- stamped copy (PDF targets only)
  ip text,
  user_agent text,
  signed_at timestamptz not null default now()
);
create index if not exists partner_signatures_room_idx
  on partner_signatures(room_id, signed_at);
create index if not exists partner_signatures_workspace_idx
  on partner_signatures(workspace_id);

alter type partner_access_event_type add value if not exists 'signature_requested';
alter type partner_access_event_type add value if not exists 'document_signed';

alter table partner_signature_requests enable row level security;
alter table partner_signatures enable row level security;
drop policy if exists "workspace_isolation" on partner_signature_requests;
create policy "workspace_isolation" on partner_signature_requests
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "workspace_isolation" on partner_signatures;
create policy "workspace_isolation" on partner_signatures
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
