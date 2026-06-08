-- MCP server: OAuth 2.1 client registration, authorization codes, and
-- access/refresh tokens. Lets a user connect Claude Code to the CRM and use a
-- curated tool set scoped to their user + workspace. Tokens stored as SHA-256
-- hashes only (same approach as Partner Access).

CREATE TABLE "mcp_oauth_clients" (
  "id" text PRIMARY KEY NOT NULL,
  "client_name" text,
  "redirect_uris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "grant_types" jsonb NOT NULL DEFAULT '["authorization_code","refresh_token"]'::jsonb,
  "token_endpoint_auth_method" text NOT NULL DEFAULT 'none',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "mcp_auth_codes" (
  "code_hash" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "code_challenge" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'crm.read crm.write',
  "resource" text,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "mcp_access_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "access_token_hash" text NOT NULL UNIQUE,
  "refresh_token_hash" text UNIQUE,
  "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "scope" text NOT NULL DEFAULT 'crm.read crm.write',
  "access_expires_at" timestamptz NOT NULL,
  "refresh_expires_at" timestamptz,
  "revoked_at" timestamptz,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "mcp_access_tokens_user_active_idx"
  ON "mcp_access_tokens" ("user_id", "created_at" DESC);
