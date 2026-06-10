-- Credentials Vault (Platform Management): encrypted account/password storage
-- with a per-user passphrase gate. Secrets are AES-256-GCM encrypted by the
-- app (VAULT_MASTER_KEY env) — the DB only ever sees ciphertext.

-- 1) Per-user vault gate: scrypt passphrase hash + lockout counters.
create table if not exists user_vault_settings (
  user_id uuid primary key references users(id) on delete cascade,
  passphrase_salt text not null,
  passphrase_hash text not null,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table user_vault_settings enable row level security;
drop policy if exists "vault_settings_owner_only" on user_vault_settings;
create policy "vault_settings_owner_only" on user_vault_settings
  using (user_id = auth.uid());

-- 2) Vault items: label/username/url plaintext for listing; password + secret
--    notes ciphertext-only. visibility 'private' = owner only; 'workspace' =
--    other members can see it once they pass their own vault gate.
create table if not exists vault_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_user_id uuid not null references users(id) on delete cascade,
  label text not null,
  category text not null default 'other',
  username text,
  url text,
  secret_enc text,
  notes_enc text,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_items_owner_idx on vault_items(owner_user_id);
create index if not exists vault_items_workspace_idx on vault_items(workspace_id);

alter table vault_items enable row level security;
drop policy if exists "vault_items_owner_or_shared" on vault_items;
create policy "vault_items_owner_or_shared" on vault_items
  using (
    owner_user_id = auth.uid()
    or (
      visibility = 'workspace'
      and workspace_id in (select workspace_id from users where id = auth.uid())
    )
  );
