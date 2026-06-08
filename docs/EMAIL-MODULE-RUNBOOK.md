# AGB CRM Email Module Runbook

Version: 2026-06-07  
Scope: V1 company email module for `caneycloud.com`

## Authority Boundaries

| Area | Authority | Notes |
|---|---|---|
| Mailbox hosting, MX delivery, spam filtering, provider sent items | Zoho Mail Free for current low-cost V1; Microsoft 365 / Exchange Online remains supported as upgrade path | AGB CRM does not run SMTP/IMAP or store mailbox passwords. Zoho Free uses REST API/OAuth, not IMAP. |
| CRM workflow, assignment, notes, CRM links, audit, AI policy | AGB CRM Email module | Server actions and database RLS both enforce mailbox access. |
| Local QA and deterministic tests | Sandbox provider | Simulates inbound, sends, attachment metadata, provider denial, and recovery sync. |

## Required Configuration

| Setting | Required In | Purpose |
|---|---|---|
| `MS_GRAPH_TENANT_ID` | staging/prod | Microsoft tenant id for Graph auth. |
| `MS_GRAPH_CLIENT_ID` | staging/prod | App registration client id. |
| `MS_GRAPH_CLIENT_SECRET` | staging/prod secret store | App-only token exchange. |
| `MS_GRAPH_PROVISIONING_ENABLED` | staging/prod optional | Set to `true` only after Graph user creation and license assignment permissions are approved. |
| `MS_GRAPH_LICENSE_SKU_ID` | staging/prod optional | Microsoft license SKU assigned during automatic team-member provisioning. |
| `MS_GRAPH_USAGE_LOCATION` | staging/prod optional | Default two-letter usage location for automatic Microsoft license assignment; UI can override per request. |
| `EMAIL_GRAPH_WEBHOOK_CLIENT_STATE` | staging/prod secret store | Validates Graph webhook client state. |
| `ZOHO_CLIENT_ID` | staging/prod for Zoho | Zoho API OAuth client id. |
| `ZOHO_CLIENT_SECRET` | staging/prod secret store for Zoho | Zoho API OAuth client secret. |
| `ZOHO_REFRESH_TOKEN` | staging/prod secret store for Zoho | Long-lived refresh token for the authorized Zoho account. |
| `ZOHO_ORGANIZATION_ID` | staging/prod optional for Zoho | Zoho organization id for admin traceability. |
| `ZOHO_ACCOUNTS_BASE_URL` | staging/prod optional for Zoho | Zoho Accounts base URL; default is `https://accounts.zoho.com`. Change for EU/IN/AU data centers. |
| `ZOHO_MAIL_API_BASE_URL` | staging/prod optional for Zoho | Zoho Mail API base URL; default is `https://mail.zoho.com/api`. Change for EU/IN/AU data centers. |
| `CRON_SECRET` | staging/prod secret store | Protects scheduled recovery sync at `/api/cron/email-sync`. |
| `NEXT_PUBLIC_SITE_URL` | all | Public webhook and callback base URL. |

## Zoho Mail Free Setup

1. Create a Zoho Mail Free organization for `caneycloud.com`.
2. Verify the domain in Zoho.
3. Add Zoho DNS records: MX, SPF, DKIM, and DMARC.
4. For CRM-synced inboxes, create real Zoho user mailboxes, not forwarding-only aliases:
   - `tomas@caneycloud.com`
   - `sales@caneycloud.com`
   - `admin@caneycloud.com`
   - up to the remaining Zoho Free user limit
5. Confirm each mailbox can send and receive in Zoho webmail.
6. Create a Zoho API/OAuth client with Zoho Mail API scopes needed for account listing, message read, message send, and message update.
7. Generate a refresh token for the Zoho account that can see the mailboxes CRM should import. If a mailbox is not visible during import, authorize that mailbox/account or configure Zoho delegation.
8. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, and data-center base URLs in the deployment secret store.
9. Open `/email` as workspace owner and click Connect Zoho.
10. Click Import Zoho mailboxes.
11. Classify `sales@` and `admin@` as shared; classify personal user mailboxes as personal and assign owners.
12. Grant CRM access to shared inboxes from Email settings.
13. Run recovery sync and verify one inbound sync and one outbound send from each active CRM mailbox.

Zoho Free caveat: AGB CRM can fully integrate with Zoho API-visible mailboxes. If an address is only a forwarding alias or group that does not appear as an API mailbox/account for the authorized Zoho token, the CRM cannot safely sync it as an independent inbox. Use real Zoho user mailboxes for `sales@` and `admin@` during the Free-plan V1.

## Microsoft 365 Setup

1. Verify `caneycloud.com` in Microsoft 365 admin.
2. Configure MX, SPF, DKIM, and DMARC in DNS.
3. Create personal mailboxes for CRM users, starting with `tomas@caneycloud.com`.
4. Create shared mailboxes: `sales@caneycloud.com`, `ops@caneycloud.com`, `support@caneycloud.com`.
5. Grant provider Send As/Full Access only to users that should send or read at Microsoft level.
6. Create Microsoft Entra app registration for Graph mail access.
7. Configure least-privilege Graph permissions and admin consent.
8. Register the Graph webhook URL: `/api/email/graph/webhook`.
9. Record tenant id, app id, and secret in the deployment secret store.
10. For automatic team-member provisioning, grant and review Microsoft Graph permissions for creating users and assigning licenses, set `MS_GRAPH_PROVISIONING_ENABLED=true`, and configure `MS_GRAPH_LICENSE_SKU_ID`.
11. For shared mailbox provisioning, keep Exchange Online as authority: create shared mailboxes and grant Full Access/Send As in Exchange admin center or Exchange Online PowerShell, then use Email Admin Check/import ready.

## CRM Setup

1. Open `/email`.
2. In local development, load the sandbox provider.
3. In staging/prod, connect Zoho Mail Free or Microsoft 365 from Email settings as workspace owner.
4. Register one owner personal mailbox and at least one shared mailbox.
5. Use Email Admin to import existing provider mailboxes and classify them as personal/shared/system.
6. Use Email Admin to create/request shared inboxes and assign CRM rights.
7. Use Email Admin to create/invite team members, request personal mailboxes, and run Check/import ready after provider mailbox readiness.
8. Grant CRM mailbox access from settings.
9. Run recovery sync.
10. Send one personal reply and one shared-mailbox reply.
11. Confirm audit events for provider connection, provisioning request, mailbox import, access grant, send, sync, assignment, and owner personal-mailbox read.

## Mailbox Provisioning Modes

| Flow | Sandbox Provider | Zoho Mail Free Provider | Microsoft 365 Provider |
|---|---|---|---|
| Import existing mailboxes | Uses seeded sandbox records for local QA. | Pulls API-visible `@caneycloud.com` Zoho accounts and records completed import requests. | Pulls `@caneycloud.com` users/mailboxes from Graph and records completed import requests. |
| Provision shared inbox | Creates sandbox mailbox, mirrors permissions, completes request. | Records provider-pending request with Zoho Admin Console steps; active CRM mailbox is created only after Zoho import/readiness evidence. | Records provider-pending request with Exchange admin/PowerShell steps; active CRM mailbox is created only after provider import/readiness evidence. |
| Provision team member | Creates CRM user/member, sandbox personal mailbox, grants access, completes request. | Creates CRM user/member and records Zoho Admin Console steps; Free-plan mailbox creation remains provider-pending until import confirms the mailbox. | Creates CRM user/member. If Graph provisioning is enabled and configured, creates Microsoft user and assigns license, then waits for mailbox readiness. Otherwise records manual provider steps. |
| Check/import ready | Usually not needed because sandbox completes immediately. | Lists Zoho mailboxes; when target address appears, imports mailbox, mirrors CRM access, completes request, and audits. | Lists provider mailboxes; when target address appears, imports mailbox, mirrors CRM access, completes request, and audits. |

## Deployment Scheduler

`vercel.json` schedules the email recovery sync every five minutes:

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/email-sync` | `*/5 * * * *` | Recovery sync/backfill for active, sync-enabled mailboxes whose provider connection is healthy. |
| `/api/cron/reminders` | `*/5 * * * *` | Existing reminder delivery. |
| `/api/cron/watchdogs` | `0 12 * * *` | Existing daily watchdog digest. |
| `/api/cron/nudges` | `0 13 * * *` | Existing daily owner nudges. |
| `/api/cron/weekly-briefing` | `0 13 * * MON` | Existing Monday briefing. |

All cron routes use `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set. Production must set `CRON_SECRET` and confirm Vercel cron invocations include the bearer header.

## Health Checks

| Check | Healthy | Action If Failing |
|---|---|---|
| Provider status | `connected` and recent `last_health_at` | Re-run health check, verify Zoho/Graph env vars, rotate secret if expired. |
| Mailbox sync | `last_synced_at` within expected interval | Run recovery sync, inspect webhook events, verify sync kill switch. |
| Shared Send As | Provider send succeeds | Confirm provider account/delegation permission and CRM `send_as` grant. |
| Webhook validation | Graph validation token returns plain token | Check route deployment and `EMAIL_GRAPH_WEBHOOK_CLIENT_STATE`. |
| Audit stream | Events appear in Email settings | Verify database insert path and RLS policy migration. |
| Recovery sync | `/api/cron/email-sync` returns scanned/synced counts | Check `CRON_SECRET`, provider health, and mailbox kill switches. |
| Provisioning request ledger | Pending/completed/failed requests visible in Email Admin | Check provider connection, request status, provider plan/result, and readiness import audit events. |
| Team member license assignment | Request moves to provider-pending after user/license creation | Check `MS_GRAPH_PROVISIONING_ENABLED`, `MS_GRAPH_LICENSE_SKU_ID`, app permissions, and usage location. |

## Incident Kill Switches

| Incident | Immediate Action | Expected Result |
|---|---|---|
| Compromised shared mailbox | Disable send and sync for that mailbox in Email settings. | Historical threads remain visible; new send/sync actions are blocked and audited. |
| Provider token failure | Mark provider degraded/disconnected and disable sync until refreshed. | Cached threads and internal notes remain readable. |
| Send As mismatch | Remove CRM `send_as` grant or fix Microsoft Send As. | CRM blocks delivery before provider send and logs denial. |
| Sensitive personal mailbox review | Owner records reason in banner before review. | Audit row records actor, mailbox, reason, and timestamp. |

## Recovery

| Failure | Recovery Procedure |
|---|---|
| Missed Graph notifications | Run recovery sync/backfill for affected mailbox. Confirm no duplicate provider message ids. |
| Failed outbound send | Check send job status and provider error. Start a new draft if the idempotency key failed. |
| Attachment fetch denied | Keep metadata visible, show provider permission error, and verify mailbox/provider rights. |
| Bad access grant | Revoke from Email settings, confirm user can no longer see mailbox/thread snippets. |
| Provider outage | Keep CRM reads available, disable unsafe sends/sync, and update provider health detail. |
| Pending shared mailbox request | Create the mailbox in Zoho Admin Console or Exchange, then run Check/import ready. |
| Pending team member request | Confirm provider user/mailbox readiness, then run Check/import ready. |

## Audit Export Scope

Export must include:

| Category | Actions |
|---|---|
| Provider | connect, disconnect, health failure, token/webhook failure |
| Access | grant, revoke, owner personal-mailbox access |
| Workflow | assignment, status change, internal note metadata |
| Sending | sent, failed, provider Send As denied |
| Operations | sync, recovery sync, send/sync kill-switch changes |

## Migration And Rollback Notes

| Migration | Rollback / Repair |
|---|---|
| `db/migrations/0010_email_module.sql` | Forward repair is preferred. If a deploy must roll back before use, drop email tables in dependency order and then drop email enums. After real mail sync begins, do not drop without exporting audit and cached workflow records. |
| `db/migrations/0012_email_draft_ai_metadata.sql` | Additive repair for environments that ran the initial email migration before AI draft provenance fields existed. Safe to re-run. |
| `db/migrations/0013_email_initiative_links.sql` | Additive enum repair enabling direct email-thread links to initiatives. Safe to re-run. |
| `db/migrations/0014_email_provisioning_requests.sql` | Additive provisioning request ledger. If a deploy must roll back before use, drop `email_provisioning_requests` and provisioning enums. After use, forward repair is preferred to preserve request/audit evidence. |
| `db/migrations/0015_email_zoho_provider.sql` | Additive enum repair enabling Zoho Mail provider connections. Safe to re-run. |
| `supabase/migrations/20260607120000_email_module.sql` | Mirrors schema migration for Supabase. Same rollback rule as above. |
| `supabase/migrations/20260607123000_email_module_rls.sql` | Safe to re-run. To repair policy drift, re-apply this migration; it uses `drop policy if exists` and `create or replace function`. |
| `supabase/migrations/20260607150000_email_draft_ai_metadata.sql` | Supabase additive repair for `ai_generated` and `ai_metadata` on existing email draft tables. Safe to re-run. |
| `supabase/migrations/20260607153000_email_initiative_links.sql` | Supabase additive enum repair enabling initiative links. Safe to re-run. |
| `supabase/migrations/20260607163000_email_provisioning_requests.sql` | Supabase provisioning ledger plus owner/admin RLS. Safe to re-run only in fresh environments; after production use, preserve data and forward repair policies. |
| `supabase/migrations/20260607170000_email_zoho_provider.sql` | Supabase additive enum repair enabling Zoho Mail provider connections. Safe to re-run. |

## Release Evidence

Before production, attach:

| Gate | Evidence |
|---|---|
| Unit/type/build | `npx tsc --noEmit`, focused email unit tests, full unit suite, production build. |
| Browser UX | Desktop, tablet, and mobile screenshots of setup, thread reader, composer, settings, and audit. |
| Security | RLS test output, unauthorized mailbox deny-path test, owner audit test, send-as denial test. |
| Provisioning | Sandbox shared/team provisioning test output, Zoho provider-pending/import test output, Microsoft provider-pending/manual-path test output, and real-provider readiness/import smoke when staging tenant exists. |
| Real provider | Staging inbound and outbound message ids from Zoho Mail Free, plus Microsoft 365 if enabled later. |

## Current Verification Snapshot

Last local verification, 2026-06-07:

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` passed. |
| Lint | `npm run lint` passed with existing warnings only: 34 warnings, 0 errors. |
| Unit tests | `npm test` passed: 28 files, 281 tests. Focused email/provider/RLS unit coverage passed, including mocked Zoho Mail API account/message/send/update coverage and mocked Microsoft Graph user creation/license assignment. |
| Vercel cron config | `vercel.json` schedules `/api/cron/email-sync` every five minutes; focused unit coverage prevents dropping the recovery sync route from deployment config. |
| Email integration | `DATABASE_URL=postgresql://agb@localhost:54329/agb_test npx vitest run --config vitest.integration.config.ts __tests__/integration/email-module.test.ts` passed: 17 tests, including Zoho import/shared readiness/team-member readiness coverage, Microsoft import/shared readiness/team-member readiness coverage, sandbox shared/team provisioning, provisioning request ledger, mailbox classification, CRM access mirroring, Active Brain policy/draft provenance, sent-thread derivation, provider outage guards, Graph webhook degraded-provider skip, search metadata, and CRM link coverage. |
| Email browser E2E | `AGB_SKIP_WEBSERVER=1 AGB_TEST_PORT=4111 DATABASE_URL=postgresql://agb@localhost:54329/agb_test npx playwright test __tests__/e2e/email-module.spec.ts __tests__/e2e/mobile-email-module.spec.ts --project=chromium --project=mobile` passed: desktop + mobile, including Email Admin provisioning controls, Zoho import controls, shared/team sandbox provisioning, request ledger rendering, sender-email search, CRM link controls, Unread/Sent/Snoozed views, bulk triage, attachment download, compose, AI summary/draft, attachment send, and responsive overflow check. |
| Production build | `env -u DATABASE_URL npm run build` passed and includes `/email`, `/api/email/graph/webhook`, `/api/email/attachments/[attachmentId]`, and `/api/cron/email-sync`. |
| Full integration suite | Email tests passed; suite result is 57/59 passing and still has two unrelated `__tests__/integration/wa-agent.test.ts` expectation failures for missing `log_touch` / `status_report` tool call reporting. |

Known external gates before production:

| Gate | Required Action |
|---|---|
| Zoho Mail Free smoke | Run Connect Zoho, Import Zoho mailboxes, one real inbound sync, and one real outbound personal/shared send against the Zoho tenant. Record Zoho message ids. |
| Microsoft 365 smoke | Required only if Microsoft is enabled later: run one real inbound sync and one real outbound personal/shared send against the staging tenant. Record Graph message ids. |
| DNS/authentication | Confirm MX, SPF, DKIM, and DMARC are live for `caneycloud.com`. |
| Provider permissions | Confirm Zoho OAuth scopes/account visibility for active mailboxes; if Microsoft is enabled, confirm app registration, admin consent, webhook subscription, and Exchange Send As/Full Access match CRM grants. |
| Scheduler | Confirm deployed Vercel cron registration and first successful `/api/cron/email-sync` invocation with `CRON_SECRET`. |
| Monitoring | Attach Sentry/log alert rules for webhook, sync, send, provider auth, and audit export failures. |
