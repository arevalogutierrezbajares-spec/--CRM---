import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "supabase/migrations/20260607123000_email_module_rls.sql",
  "supabase/migrations/20260607163000_email_provisioning_requests.sql",
]
  .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
  .join("\n");

describe("email RLS migration", () => {
  it("enables row level security on every email table", () => {
    for (const table of [
      "email_provider_connections",
      "email_mailboxes",
      "email_mailbox_access",
      "email_threads",
      "email_messages",
      "email_attachments",
      "email_drafts",
      "email_send_jobs",
      "email_internal_notes",
      "email_thread_crm_links",
      "email_provisioning_requests",
      "email_audit_events",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("keeps direct mailbox reads scoped to owner, personal owner, or explicit grant", () => {
    expect(sql).toContain("create or replace function public.can_access_email_mailbox");
    expect(sql).toContain("wm.role = 'owner'");
    expect(sql).toContain("m.type = 'personal' and m.owner_user_id = auth.uid()");
    expect(sql).toContain("grant_row.can_view");
    expect(sql).toContain("m.status <> 'deactivated'");
  });

  it("honors kill switches and sensitive table boundaries", () => {
    expect(sql).toContain("when 'view' then m.sync_enabled");
    expect(sql).toContain("when 'reply' then m.send_enabled");
    expect(sql).toContain("when 'send_as' then m.send_enabled");
    expect(sql).toContain("email_provider_connections_admin_select");
    expect(sql).toContain("email_provisioning_requests_admin_select");
    expect(sql).toContain("email_drafts_author_select");
    expect(sql).toContain("email_audit_events_admin_or_actor_select");
  });
});
