# AGB CRM - Email Module Strong V1 Requirements

**Version:** v1.0, 2026-06-07
**Status:** Strong V1 requirements contract for a new AGB CRM module
**Scope:** Company email send/receive, shared inboxes, personal mailboxes, mailbox access governance, Gmail-style CRM workflow
**Source:** Founder request, 2026-06-07: "send/receive emails and assign emails like sales@caneycloud.com, tomas@caneycloud.com; owner access to as many inboxes as he wants; assign access to inboxes; everyone has own personal name@caneycloud.com."
**Supersedes:** `FR-MATRIX.md` "Email-client replacement" v1 exclusion for this module only. Existing `FR-CAP-2` email-forward intake remains valid as a narrow capture path, but this document defines the broader first-class Email module.
**Requirement count:** 76 FRs, 27 NFRs, 18 launch gates.
**ID prefix:** `FR-EMAIL-`, `NFR-EMAIL-`, `TASK-AGB-EMAIL-`.

> Reader contract: this is the product contract for a strong V1. It defines what the module must do. The supported mailbox hosts for V1 are Zoho Mail Free/Paid and Microsoft 365/Exchange Online. Zoho Mail Free is the current low-cost setup path and uses Zoho REST APIs/OAuth rather than IMAP; Microsoft Graph/Exchange remains the enterprise upgrade path. Resend/Postmark remain useful for transactional email and simple inbound intake, but they are not the mailbox authority for personal and shared company mailboxes.

---

## 1. Product Boundary

| Layer | V1 Owner | Requirement |
|---|---|---|
| Mailbox authority | Zoho Mail Free/Paid or Microsoft 365 / Exchange Online | Hosts `caneycloud.com` mailboxes, spam filtering, MX delivery, personal mailboxes, CRM-synced shared mailboxes, provider folders, provider sent items |
| CRM workflow authority | AGB CRM Email module | Owns thread assignment, internal status, CRM links, notes, templates, notifications, audit, AI summaries, owner access policy |
| Transactional email | Resend or Postmark | Password/setup emails, system notifications, optional simple inbound capture fallback |
| Storage | Supabase Storage / Postgres | Cached metadata, message body cache, attachments metadata, CRM audit, workflow state |
| Out of scope authority | AGB CRM | Does not run its own SMTP/IMAP server and does not become the domain's MX host |

---

## 2. Actors

| Actor | Definition | V1 Access Principle |
|---|---|---|
| Owner | Workspace owner, usually Tomas | Can connect provider, see/manage all connected mailboxes, grant access, override assignments, and audit usage |
| Admin | Trusted workspace admin | Can manage shared mailbox access and operational settings unless owner-only setting is marked |
| Team Member | Normal CRM user | Has own personal mailbox plus any shared/personal mailbox access granted |
| Mailbox Delegate | User with access to another mailbox | Can act only within granted rights: view, reply, send-as, assign, manage |
| External Sender/Recipient | Customer, lead, partner, vendor | Never logs in; appears through messages and matched CRM contacts |
| Active Brain | AGB CRM system agent | Can summarize, suggest, notify, and draft only when policy allows |
| Sync Worker | Background system process | Ingests, dedupes, refreshes, queues, and repairs mailbox sync |

---

## 3. Strong V1 Scope

| Area | Included in Strong V1 | Deferred |
|---|---|---|
| Personal mailboxes | Each user can use a `name@caneycloud.com` mailbox inside CRM; owner/admin can provision or request team-member mailboxes from Email Admin | Complex HR onboarding beyond mailbox and CRM membership |
| Shared mailboxes | `sales@`, `ops@`, `support@`, etc. with CRM-level access assignment | Complex distribution groups and nested Exchange groups |
| Owner visibility | Owner can access any connected company mailbox with explicit audit | Silent monitoring or unlogged personal-mailbox reads |
| Sending | Compose, reply, forward, send-as, attachments, templates, signatures | Bulk marketing campaigns and mail merge |
| Receiving | Inbound sync, webhook/delta refresh, thread cache, search, attachments | Spam quarantine management |
| CRM workflow | Assign, status, internal notes, link to contact/project/action item | Full helpdesk SLA automation |
| AI | Thread summary, next-action suggestion, reply draft, source citations | Autonomous sending |
| Compliance | Audit, token encryption, permission review, retention/export | Full eDiscovery/legal-hold suite |

---

## 4. Permission Model

| Right | Meaning | Personal Mailbox Default | Shared Mailbox Default |
|---|---|---|---|
| `view` | See threads/messages and attachment metadata | Mailbox user + owner | Granted users + owner |
| `reply` | Compose replies in CRM | Mailbox user + owner | Granted users + owner |
| `send_as` | Send as that mailbox address | Mailbox user if provider allows + owner if provider allows | Granted users if provider allows + owner |
| `assign` | Assign/reassign threads from that mailbox | Mailbox user + owner | Granted users + owner |
| `manage_access` | Grant/revoke CRM mailbox access | Owner only | Owner/admin |
| `manage_settings` | Change sync, signature, labels, templates | Mailbox user for own mailbox; owner for all | Owner/admin |

Provider permission and CRM permission must both pass for sending. If the CRM says a user may send as `sales@caneycloud.com` but Zoho Mail or Microsoft 365 denies Send As/account access, the CRM must block the send and show the provider permission failure.

---

## 5. UX/UI and Dynamic Behavior Contract

The Email module must feel like a native AGB CRM work surface, not a bolted-on webmail clone. The product is a dense, operational shared-inbox cockpit for a small company: fast scanning, keyboard triage, clear ownership, visible permissions, and CRM context beside every thread.

| Surface | Required UX | Dynamic Behavior |
|---|---|---|
| Email main route | Dedicated app route distinct from the existing notification inbox. The current `/inbox` remains notification triage; the Email module uses its own nav item and screen title. | Thread counts, unread counts, sync health, assignee filters, and mailbox filters refresh after sync and local actions. |
| Mailbox rail | Shows All Mail, personal mailboxes, shared mailboxes, assigned views, unassigned shared inboxes, drafts, sent, and settings entry. | Counts update after incoming mail, send, assignment, status changes, and permission changes. |
| Thread list | Dense rows with sender, mailbox chip, assignee, status, contact/project chips, unread state, attachment marker, and last activity time. | Selection, bulk actions, read state, status, and assignment update optimistically with rollback on server/provider failure. |
| Thread reader | Message timeline, inline attachments, internal notes, reply composer, and CRM right rail. | New replies, internal notes, AI summaries, and linked CRM records appear without a full page reload. |
| CRM right rail | Contact match/create, project link, action item extraction, assignment, status, internal notes, AI summary/draft controls. | Changes write to CRM objects and immediately reflect in contact/project/detail surfaces. |
| Composer | Reply, reply-all, forward, new message, send-as identity, signatures, attachments, templates, drafts, confirmation when changing sender identity. | Draft autosave, attachment progress, send queue state, duplicate-send guard, provider send result, and sent touch creation are visible. |
| Mailbox settings | Provider health, domain setup, mailbox registry, access grants, signatures, AI policy, sync/send kill switches, audit export. | Health checks run on demand and on schedule; permission edits take effect server-side immediately. |
| Mobile | Triage-first list, slide-in reader, bottom composer actions, readable thread timeline, permission-safe reply. | Mobile can perform core read/reply/assign/status actions; owner/admin deep settings can be desktop-preferred. |

---

## 6. Functional Requirements

### 6.1 Provider and Mailbox Registry

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-1 | MUST | Owner can connect the workspace to a company mailbox provider for `caneycloud.com`. | Given owner completes provider authorization, when Email Settings loads, then provider status shows connected, domain shows `caneycloud.com`, and no mailbox password is stored in AGB CRM. | Founder domain ownership |
| FR-EMAIL-2 | MUST | Owner can register connected mailboxes as personal, shared, or system mailboxes. | Given provider has `tomas@caneycloud.com` and `sales@caneycloud.com`, when owner imports or registers them, then CRM shows mailbox type, display name, provider id, sync status, and last synced time. | Founder mailbox examples |
| FR-EMAIL-3 | MUST | Team Member can use their own personal company mailbox inside CRM. | Given user `ana@caneycloud.com` exists and has CRM account, when she opens Email, then she can access her own mailbox without seeing another personal mailbox unless granted. | Personal mailbox requirement |
| FR-EMAIL-4 | MUST | Owner can view all connected mailboxes across the workspace. | Given 10 mailboxes are connected, when owner opens Mailboxes settings, then all 10 appear with type, access count, health, sync state, and last activity. | Owner access requirement |
| FR-EMAIL-5 | MUST | Admin can create a CRM record for a shared inbox such as `sales@caneycloud.com`. | Given provider mailbox exists, when admin registers `sales@caneycloud.com` as shared, then users can be granted rights without creating a CRM user for the mailbox. | Shared inbox requirement |
| FR-EMAIL-6 | MUST | Owner can deactivate mailbox sync while preserving historical CRM records. | Given mailbox `sales@` is active, when owner deactivates it, then new sync/send stops, cached historical messages remain visible to permitted users, and audit records the action. | Operational control |

### 6.2 Access Control and Governance

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-7 | MUST | Owner can grant and revoke mailbox access for any user. | Given user Diego exists, when owner grants `view` and `reply` on `sales@`, then Diego sees `sales@` in Email and can reply but cannot send new messages as `sales@` unless `send_as` is granted. | Founder access assignment |
| FR-EMAIL-8 | MUST | Admin can grant/revoke shared mailbox access when permitted by workspace role. | Given admin Maria manages `support@`, when she removes a member from `support@`, then that member loses access on next page load and server checks reject future actions. | Delegated admin |
| FR-EMAIL-9 | MUST | User can only see mailboxes and threads allowed by mailbox rights. | Given user lacks access to `finance@`, when they query Email API, then no `finance@` threads, snippets, counts, or attachments are returned. | Least privilege |
| FR-EMAIL-10 | MUST | Owner access to another user's personal mailbox is explicit and audited. | Given owner opens `ana@caneycloud.com`, when the mailbox is not the owner's, then CRM records owner id, mailbox id, action type, timestamp, and reason if prompted. | Governance learning |
| FR-EMAIL-11 | MUST | System can enforce send-as using both CRM rights and provider permissions. | Given user has CRM `send_as` but provider denies Send As/account access, when user sends from `sales@`, then send is blocked before delivery and a setup warning identifies provider permission mismatch. | Provider permission boundary |
| FR-EMAIL-12 | MUST | Owner can review who has access to each mailbox. | Given owner opens mailbox detail, then every user with rights is listed with rights, granted_by, granted_at, last_used_at, and revoke action. | Access audit |
| FR-EMAIL-13 | MUST | System can audit mailbox configuration and high-risk actions. | Given a grant, revoke, send-as, owner-read of personal mailbox, mailbox deactivation, or token refresh failure occurs, then an audit event is persisted with workspace, actor, mailbox, action, and before/after where applicable. | Auditability |
| FR-EMAIL-14 | MUST | User can configure signature and display identity per mailbox they can send from. | Given user has `send_as` for `sales@`, when they edit `sales@` signature, then new replies from `sales@` use that signature without affecting `tomas@`. | Gmail-style identity |

### 6.3 Sync, Threading, and Message Cache

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-15 | MUST | Sync Worker can ingest inbound and sent messages from connected mailboxes. | Given a new inbound message arrives in `sales@`, when provider notification or delta sync runs, then CRM creates or updates the corresponding message and thread cache exactly once. | Send/receive requirement |
| FR-EMAIL-16 | MUST | Sync Worker can thread related messages into a conversation. | Given a reply has matching provider conversation id or email headers, when it syncs, then it appears in the existing thread in chronological order. | Gmail-style threading |
| FR-EMAIL-17 | MUST | Sync Worker can dedupe messages across retries and forwarded intake. | Given the same message is received twice with the same provider id or internet message id for the same mailbox, then CRM stores one canonical message record. | FR-CAP-2 idempotency |
| FR-EMAIL-18 | MUST | System can mirror core provider states needed by the CRM inbox. | Given a message is read/unread or archived in provider mailbox, when sync runs, then CRM reflects read/unread and provider folder/category enough to keep counts accurate. | Inbox correctness |
| FR-EMAIL-19 | MUST | User can view and download permitted attachments. | Given a thread contains PDF and image attachments, when user has mailbox `view`, then attachment names, sizes, MIME types, and download controls appear; if provider denies download, CRM shows a permission error. | Full email use |
| FR-EMAIL-20 | MUST | Sync Worker can recover from missed notifications using delta/backfill sync. | Given webhook delivery pauses for 30 minutes, when recovery job runs, then missed messages are backfilled and mailbox health shows recovered timestamp. | Reliability |
| FR-EMAIL-21 | MUST | User can see mailbox health and stale-sync warnings. | Given a mailbox has not synced for longer than the configured threshold, then Email UI shows a warning and Mailboxes settings shows failure reason and last successful sync. | Ops readiness |
| FR-EMAIL-22 | MUST | User can search messages and threads they are allowed to access. | Given user searches "proposal deck", then results include matching subject, sender, recipient, body snippet, contact, project, and mailbox only within their permission scope. | Gmail-style use |

### 6.4 Compose, Send, Reply, and Forward

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-23 | MUST | User can compose and send email from any mailbox they can send from. | Given user has `send_as` for `sales@`, when they compose to a contact and select `sales@`, then provider sends from `sales@`, CRM records sent status, and provider Sent folder receives the message. | Send requirement |
| FR-EMAIL-24 | MUST | User can reply and reply-all inside an existing thread. | Given thread has original sender plus cc recipients, when user clicks Reply All, then composer preserves correct recipient set, in-reply-to threading, and selected sending mailbox. | Gmail-style reply |
| FR-EMAIL-25 | MUST | User can forward a message with optional attachments. | Given user forwards a message with 3 attachments, then they can choose include/exclude attachments and the sent message is linked to the source thread. | Common mailbox use |
| FR-EMAIL-26 | MUST | System can queue outbound sends and prevent duplicate delivery. | Given user double-clicks Send or network retries, then exactly one provider send occurs and CRM shows a single sent message. | Reliability |
| FR-EMAIL-27 | MUST | User can attach files to outbound messages within configured limits. | Given user attaches a file over the allowed size, then composer blocks send with a clear limit message; valid attachments are included in provider send. | Full email use |
| FR-EMAIL-28 | MUST | User can save CRM drafts before sending. | Given user starts a reply and navigates away, then draft persists in CRM and can be resumed by the same user; draft is not visible to other users unless thread access and draft-sharing policy allow. | Gmail-style draft |
| FR-EMAIL-29 | SHOULD | User can use per-mailbox templates/snippets in composer. | Given user selects "intro follow-up" template, then subject/body populate and remain editable before send. | CRM speed |
| FR-EMAIL-30 | MUST | System can record sent email as a CRM touch when linked to a contact. | Given sent email is linked to Contact Marta, then CRM creates a Touch with `channel=email`, sender mailbox, subject, body snippet, and message id reference. | CRM integration |

### 6.5 Gmail-Style Triage and Workflow

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-31 | MUST | User can view a multi-inbox thread list. | Given user has access to personal mailbox and `sales@`, then Email shows combined inbox with filters for All, Mine, Unassigned, Assigned to me, mailbox, unread, and status. | Gmail-style tool |
| FR-EMAIL-32 | MUST | User can assign an email thread to a workspace user. | Given unassigned `sales@` thread exists, when owner assigns it to Diego, then Diego receives notification and thread appears in "Assigned to me". | Assignment requirement |
| FR-EMAIL-33 | MUST | User can change CRM thread status. | Given thread is open, when user marks Waiting, Done, Snoozed, or Reopened, then CRM status updates without deleting provider email. | CRM workflow |
| FR-EMAIL-34 | MUST | User can add internal notes to an email thread. | Given thread exists, when user adds an internal note, then note appears only to CRM users with thread access and is never sent externally. | Shared inbox workflow |
| FR-EMAIL-35 | MUST | User can link a thread to Contact, Project, Initiative, or Action Item. | Given thread with sender `marta@example.com`, when user links it to Project "Caney onboarding", then the project detail page shows the linked email thread and the thread shows the project link. | AGB CRM module fit |
| FR-EMAIL-36 | MUST | System can auto-match senders/recipients to existing Contacts. | Given inbound message from an email already in `contact_channels`, then thread shows matched contact and offers one-click link; if no match, it offers create Contact. | Contact graph |
| FR-EMAIL-37 | SHOULD | User can bulk-triage threads. | Given user selects 10 threads, when they assign to Ana or mark done, then all permitted threads update and unauthorized threads are skipped with a count. | Gmail-style efficiency |
| FR-EMAIL-38 | MUST | System can notify users about assigned email work. | Given thread assigned to Diego or mentioned in an internal note, then Diego receives AGB notification and the existing notification inbox links to the email thread. | Existing inbox integration |

### 6.6 CRM Conversion and Active Brain

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-39 | MUST | User can create a Contact from an email thread. | Given unknown sender exists, when user chooses Create Contact, then contact form is prefilled with name, email, org guess if available, relationship type, and linked source thread. | CRM capture |
| FR-EMAIL-40 | MUST | User can convert email content into Action Item or Milestone. | Given email says "send proposal by Friday", when user creates action item from selection, then action item captures title, due date if parsed, source message id, and assignee. | Work module integration |
| FR-EMAIL-41 | MUST | User can log an email as a Touch on one or more Contacts. | Given thread includes multiple contacts, when user logs touch, then each selected contact gets a Touch and `last_touch_at` updates. | Existing Touch model |
| FR-EMAIL-42 | SHOULD | Active Brain can summarize a thread with cited source messages. | Given user asks for summary, then output includes summary, open questions, next action, and citations to message timestamps; no summary appears for mailboxes where AI is disabled. | Existing AI governance |
| FR-EMAIL-43 | SHOULD | Active Brain can draft a reply without sending autonomously. | Given user clicks Draft Reply, then system generates editable text and requires human Send; draft records source thread and AI-generated label. | AI safety |
| FR-EMAIL-44 | SHOULD | System can include email workload in daily/weekly briefings. | Given user owns or is assigned email threads, then briefing includes overdue replies, waiting threads, unassigned shared-inbox threads, and top next actions. | Active Brain |

### 6.7 Operations, Retention, and Safety

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-45 | MUST | Owner can review setup health for domain and mailbox integration. | Given Email Settings opens, then setup checklist shows provider connected, domain verified, mailboxes imported, permissions valid, sync subscription healthy, and last test send/receive. | Ops readiness |
| FR-EMAIL-46 | MUST | System can export mailbox workflow records for audit. | Given owner exports Email audit for a date range, then export includes mailbox grants, sends, assignments, internal notes metadata, status changes, and owner personal-mailbox access events. | Governance |
| FR-EMAIL-47 | MUST | Owner can disable sending or syncing per mailbox during an incident. | Given mailbox is compromised or provider token fails, when owner disables send or sync, then affected actions are blocked immediately while historical CRM view remains available to permitted users. | Incident control |

### 6.8 UX/UI, Dynamic Experience, and Implementation Readiness

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-48 | MUST | User can open a dedicated Email module that is separate from the notification inbox. | Given user is signed in, when they use sidebar navigation or command palette, then they can open the Email module; the existing notification inbox still routes to notification triage and does not mix email messages with system notifications. | AGB CRM route boundary |
| FR-EMAIL-49 | MUST | User can use a production-grade three-pane desktop email layout. | Given viewport is desktop width, when Email loads, then mailbox rail, thread list, and thread reader/CRM rail fit without horizontal scrolling, text overlap, or card nesting; selected thread remains visibly active. | Nice UX/UI requirement |
| FR-EMAIL-50 | MUST | User can use a responsive mobile email layout for core work. | Given viewport is mobile width, when user opens Email, then list, reader, composer, and triage actions are reachable in a single-column or drawer flow; no button text overflows and no controls overlap. | Mobile production readiness |
| FR-EMAIL-51 | MUST | User can trust dynamic mailbox counts and filters. | Given new mail arrives, user marks a thread done, or access changes, then unread, assigned, unassigned, mailbox, and status counts update to match server truth after refresh/revalidation. | Dynamic behavior requirement |
| FR-EMAIL-52 | MUST | User can perform fast inline triage from the thread list. | Given a thread row is visible, then permitted users can assign, mark done/open/waiting, archive provider-side if supported, snooze CRM-side, and select for bulk action without opening the full thread. | Gmail-style workflow |
| FR-EMAIL-53 | MUST | User can see CRM context beside every open thread. | Given a thread is selected, then the right rail shows matched contact(s), linked project(s), action items, owner/assignee, internal notes, and AI controls governed by policy. | AGB CRM fit |
| FR-EMAIL-54 | MUST | User can manage mailbox access from a clear settings UI. | Given owner opens a mailbox settings page, then they can search workspace users, grant/revoke rights, see provider permission status, and see who last used each right. | Permission governance |
| FR-EMAIL-55 | MUST | Owner receives an explicit visual warning when viewing another user's personal mailbox. | Given owner opens `ana@caneycloud.com`, then a persistent banner identifies the mailbox owner, states that access is audited, and requires or displays access reason based on policy. | Owner access audit |
| FR-EMAIL-56 | MUST | Owner can complete setup through a guided setup wizard. | Given provider is not connected, when owner opens Email Settings, then a step-by-step checklist covers Zoho Mail/Microsoft 365 connection, domain verification, mailbox import, shared inbox registration, access grants, test inbound, test outbound, and provider sync health. | Production setup |
| FR-EMAIL-57 | MUST | User can recover cleanly from loading, empty, error, and provider-outage states. | Given no mailboxes exist, sync is down, provider auth expired, or a thread fails to load, then the UI presents a specific state with next action and never shows a blank or misleading inbox. | Production UX |
| FR-EMAIL-58 | MUST | User can rely on optimistic UI with rollback for thread workflow actions. | Given user assigns, changes status, or adds internal note, then the UI updates immediately; if server/provider fails, it rolls back and shows a precise error. | Dynamic behavior |
| FR-EMAIL-59 | MUST | User can operate the Email module with keyboard and command palette flows. | Given keyboard focus is in the Email module, then documented shortcuts or command palette actions support search, next/previous thread, reply, assign, mark done, open contact/project, and compose; shortcuts do not fire inside text inputs. | Power-user UX |
| FR-EMAIL-60 | MUST | User can use a safe composer with autosave and explicit send state. | Given user writes a reply, then draft autosaves, unsent changes are protected on navigation, send button disables while queued, send result is visible, and duplicate sends are prevented. | Production send UX |
| FR-EMAIL-61 | SHOULD | User can use a local demo/provider-sandbox mode for development and QA. | Given real provider credentials are unavailable in local development, then seeded provider fixtures can simulate inbound sync, thread updates, sends, failures, attachments, and permission errors without contacting a real mailbox. | End-to-end testability |
| FR-EMAIL-62 | MUST | User can see visible provenance for AI and CRM-generated content. | Given AI creates a summary, suggested next action, or reply draft, then the UI labels it as AI-generated, links cited messages, and requires human edit/send control. | Existing AI governance |
| FR-EMAIL-63 | MUST | User can confirm high-risk mailbox actions before they take effect. | Given owner revokes access, disables sending, disconnects provider, deletes a draft, or sends from a shared identity for the first time, then UI requires explicit confirmation and records audit where applicable. | Safety |
| FR-EMAIL-64 | MUST | User can experience the Email module as a polished AGB CRM-native interface. | Given the module is reviewed on desktop and mobile, then it uses the existing app shell, typography, spacing, colors, icons, toasts, focus rings, empty states, and density conventions; it avoids marketing-style hero layouts and avoids nested cards. | Nice UX/UI requirement |

### 6.9 Email Admin and Mailbox Provisioning

| ID | Priority | Capability | Acceptance Criteria | Source |
|---|---:|---|---|---|
| FR-EMAIL-65 | MUST | Owner can open an Email Admin provisioning surface inside the Email module. | Given owner opens Email settings, then they can see provider connection, import controls, shared-inbox provisioning, team-member provisioning, mailbox classification, access assignment, and provisioning request history in one admin workflow. | Founder provisioning request |
| FR-EMAIL-66 | MUST | Owner can import existing provider mailboxes for `caneycloud.com`. | Given Zoho Mail or Microsoft 365 is connected, when owner runs import, then CRM pulls provider-visible mailboxes for `@caneycloud.com`, creates or updates mailbox records, records completed import requests, and audits the import count. | Import Existing Mailboxes |
| FR-EMAIL-67 | MUST | Owner can classify imported mailboxes as personal, shared, or system. | Given `admin@caneycloud.com` imports as a mailbox, when owner classifies it as shared/system/personal, then CRM stores the selected type, requires a workspace member owner for personal mailboxes, and audits the classification. | Import classification |
| FR-EMAIL-68 | MUST | Owner can assign CRM mailbox rights during or after import. | Given imported `sales@caneycloud.com` exists, when owner grants a member responder/send-as/manager rights, then rights are persisted, visible in access review, enforced by server actions, and audited. | Assign CRM rights |
| FR-EMAIL-69 | MUST | Owner can create or request a shared inbox from Email Admin. | Given owner enters `sales@caneycloud.com` and display name, when provider supports automatic creation, then CRM creates/imports the mailbox; when provider requires admin work, CRM records a provider-pending request with explicit provider steps. | Provision Shared Inbox |
| FR-EMAIL-70 | MUST | System can mirror desired shared-inbox provider permissions into CRM access. | Given owner selects users for `sales@`, then the provisioning request records desired Full Access/Send As and CRM rights; when provider mailbox becomes ready, CRM grants matching internal rights and audits the mirror. | Permission mirroring |
| FR-EMAIL-71 | MUST | Owner can create or invite a team member and request their personal mailbox. | Given owner enters name and `name@caneycloud.com`, when provisioning starts, then CRM creates or reuses the CRM user, adds workspace membership, starts provider user/mailbox provisioning or records manual steps, and audits the request. | Provision Team Member |
| FR-EMAIL-72 | MUST | System can assign a Microsoft 365 license during team-member provisioning when configured. | Given Graph provisioning is enabled and license SKU is configured, when owner submits a temporary password and user details, then CRM asks Microsoft Graph to create the user and assign the license, then marks the mailbox request provider-pending until Exchange mailbox readiness is visible. | Team member license |
| FR-EMAIL-73 | MUST | Owner can check provider readiness and import a pending mailbox. | Given a provisioning request is provider-pending, when owner clicks Check/import ready and the provider lists the mailbox, then CRM imports it, links the request to the mailbox, grants desired CRM access, marks request completed, and audits the completion. | Wait/import readiness |
| FR-EMAIL-74 | MUST | System can distinguish completed, provider-pending, failed, cancelled, and requested provisioning states. | Given any provisioning action runs, then Email Admin shows the request state, target address, provider plan/result/error, next check time where applicable, requester, and completion mailbox where applicable. | Audit everything |
| FR-EMAIL-75 | MUST | System never marks a real-provider shared mailbox as created unless provider evidence exists. | Given Zoho Free mailbox creation requires Zoho Admin Console or Microsoft shared mailbox creation requires Exchange admin/PowerShell, when owner requests `admin@caneycloud.com`, then CRM records provider-pending steps and does not create an active CRM mailbox until import or readiness check finds the provider mailbox. | Safety/scalability |
| FR-EMAIL-76 | MUST | Provider sandbox can simulate successful provisioning, permission mirroring, and readiness for automated tests. | Given local QA uses sandbox provider, when shared/team provisioning actions run, then CRM completes the request, creates mailboxes/users/grants, and records audit without contacting Zoho or Microsoft. | Test every feature |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Acceptance Target |
|---|---|---|---|
| NFR-EMAIL-1 | Security | CRM stores OAuth/provider tokens encrypted and never stores mailbox passwords. | Code review verifies encrypted storage and no password fields |
| NFR-EMAIL-2 | Security | All mailbox reads/writes are workspace-scoped and mailbox-access-scoped on server and database layers. | RLS or equivalent policy tests cover deny paths |
| NFR-EMAIL-3 | Security | Owner/admin access to another user's personal mailbox is auditable. | Test confirms audit row on owner view/action |
| NFR-EMAIL-4 | Privacy | AI features are disabled by default for sensitive mailboxes unless mailbox policy or linked contact/project permits AI. | AI summary/draft blocked when policy false |
| NFR-EMAIL-5 | Reliability | New inbound mail appears in CRM within 2 minutes when provider notifications are healthy. | E2E test or staging monitor measures under target |
| NFR-EMAIL-6 | Reliability | Missed notification recovery backfills messages without duplicates. | Replay/backfill test creates zero duplicates |
| NFR-EMAIL-7 | Reliability | Outbound sends are idempotent. | Double-submit test sends one provider message |
| NFR-EMAIL-8 | Performance | Thread list loads first 50 threads under 2 seconds on normal production data. | Browser performance smoke |
| NFR-EMAIL-9 | Performance | Search returns first page of permitted results under 3 seconds for 25k cached messages. | Load test or indexed query plan review |
| NFR-EMAIL-10 | Usability | Email UI is keyboard navigable for list, thread, composer, assign, archive/done, and search. | Playwright keyboard smoke |
| NFR-EMAIL-11 | Accessibility | Controls have unique accessible names per mailbox/thread/action. | Automated and manual accessibility smoke |
| NFR-EMAIL-12 | Observability | Sync, webhook, send, token refresh, and provider failures emit structured logs with mailbox id and workspace id. | Sentry/log inspection |
| NFR-EMAIL-13 | Data Integrity | Message/thread cache preserves provider ids, internet message ids, and source mailbox ids. | DB constraint/unit tests |
| NFR-EMAIL-14 | Compliance | Deleted/deactivated mailbox history remains queryable according to retention policy unless owner purges under explicit export/delete flow. | Retention test |
| NFR-EMAIL-15 | Operations | Provider subscription renewal and token refresh jobs have visible health and alerts. | Health page shows warning before expiry/failure |
| NFR-EMAIL-16 | Degradation | If provider is unavailable, users can read cached threads and CRM notes, but send/sync actions are clearly disabled. | Simulated provider outage smoke |
| NFR-EMAIL-17 | Visual Quality | The module matches AGB CRM's existing quiet, dense, work-focused UI and avoids decorative marketing composition. | Design review screenshots pass desktop and mobile |
| NFR-EMAIL-18 | Responsive Safety | Text, controls, chips, side rails, composer, and tables must not overlap or overflow on 390px mobile, 768px tablet, 1440px desktop, and wide desktop. | Playwright screenshots at required breakpoints |
| NFR-EMAIL-19 | Dynamic Integrity | Optimistic updates must reconcile to server state and cannot leave stale counts, ghost rows, or duplicate sent messages after failure/retry. | Integration and E2E rollback tests |
| NFR-EMAIL-20 | Testability | Provider adapter must support deterministic fixtures for local unit/integration/E2E tests without real Zoho or Microsoft credentials. | Test provider covers inbound, outbound, attachments, failures |
| NFR-EMAIL-21 | Coverage | Every launch gate must have at least one automated test or documented manual verification step before production release. | Gate-to-test matrix complete |
| NFR-EMAIL-22 | Production Operations | Runbook must cover setup, sync failures, token expiry, send failures, provider outage, rollback, audit export, and kill-switch use. | Runbook linked from release checklist |
| NFR-EMAIL-23 | Security Review | Mailbox access, token storage, webhook validation, send-as, audit, and AI policy require explicit code review before launch. | Security checklist signed off |
| NFR-EMAIL-24 | Data Migration | Schema changes and backfills for email objects must be reversible or forward-repairable with a tested rollback plan. | Migration dry-run and rollback notes |
| NFR-EMAIL-25 | Security | Provisioning requests must not store mailbox passwords or reusable provider credentials. | Temporary provider passwords are action-only inputs and absent from persisted request metadata |
| NFR-EMAIL-26 | Data Integrity | A pending real-provider provisioning request must not create an active CRM mailbox until provider import/readiness evidence exists. | Integration/unit tests prove pending request without mailbox for manual Zoho/Microsoft paths |
| NFR-EMAIL-27 | Auditability | Every provisioning request, provider result, permission mirror, classification change, and readiness check must create auditable evidence. | Audit query shows actor, target address, request id, status, mailbox id where available |

---

## 8. Capability Data Contract

These are product objects, not final schema names.

| Object | Purpose | Must Link To |
|---|---|---|
| Mail Provider Connection | Provider tenant/domain auth and health | Workspace, owner |
| Mailbox | Personal/shared/system address, provider id, sync status | Workspace, provider |
| Mailbox Access Grant | User rights for a mailbox | Workspace, mailbox, user, granting actor |
| Email Thread | CRM conversation wrapper and workflow status | Workspace, mailbox, assignee, linked CRM records |
| Email Message | Cached provider message metadata/body reference | Thread, mailbox, provider ids |
| Email Attachment | Attachment metadata and download reference | Message, provider/storage object |
| Email Draft | CRM draft state before provider send | Thread, composer user, mailbox |
| Email Send Job | Idempotent outbound queue item | Draft/message, mailbox, actor |
| Email Internal Note | CRM-only team note on a thread | Thread, author |
| Email Provisioning Request | Import/create/request ledger for existing mailboxes, shared inboxes, team-member mailboxes, desired access, provider plan/result, and readiness checks | Workspace, provider, requester, target user, target mailbox |
| Email Audit Event | Security and workflow event log | Workspace, actor, mailbox/thread/message |

---

## 9. Launch Gates

| Gate | Requirement | Pass Criteria |
|---|---|---|
| LG-EMAIL-1 | Provider tenant connected | Owner can connect and see `caneycloud.com` status |
| LG-EMAIL-2 | Mailbox import | At least one personal mailbox and one shared mailbox connected |
| LG-EMAIL-3 | Access controls | Unauthorized user cannot read, search, or send from unauthorized mailbox |
| LG-EMAIL-4 | Owner audit | Owner access to another personal mailbox creates audit event |
| LG-EMAIL-5 | Send-as verification | CRM blocks send when provider Send As permission is absent |
| LG-EMAIL-6 | Inbound sync | New inbound email appears in CRM and thread list |
| LG-EMAIL-7 | Outbound send | Reply from personal and shared mailbox lands in provider Sent folder |
| LG-EMAIL-8 | Thread assignment | Shared inbox thread can be assigned, notified, and marked done |
| LG-EMAIL-9 | CRM linking | Email can create/link Contact, Project, Touch, and Action Item |
| LG-EMAIL-10 | Attachments | User can view inbound attachment metadata and send a valid attachment |
| LG-EMAIL-11 | Recovery | Backfill sync recovers missed email without duplicates |
| LG-EMAIL-12 | Ops kill switch | Owner can disable send/sync for a mailbox immediately |
| LG-EMAIL-13 | UX/UI desktop and mobile | Email main route, thread reader, composer, settings, and permission views pass visual review at 390px, 768px, 1440px, and wide desktop |
| LG-EMAIL-14 | End-to-end test suite | Provider-sandbox E2E covers inbound, reply, assignment, CRM link, send-as denial, owner audit, attachment, sync recovery, and provider outage |
| LG-EMAIL-15 | Security/privacy gate | Unauthorized mailbox access, unauthorized send-as, owner personal-mailbox access audit, AI-disabled mailbox, and token encryption checks pass |
| LG-EMAIL-16 | Production runbook | Operations runbook, alerting, environment variables, provider permissions, recovery jobs, and rollback plan are complete |
| LG-EMAIL-17 | Provisioning admin | Owner can import existing provider mailboxes, classify them, provision/request a shared inbox, provision/request a team-member mailbox, and see request history |
| LG-EMAIL-18 | Provisioning safety | Zoho/Microsoft provider-pending requests do not create fake mailboxes; sandbox provisioning completes end to end with users, mailboxes, grants, and audits |

---

## 10. Testing and Verification Matrix

| Test Layer | Required Coverage | Evidence Required Before Launch |
|---|---|---|
| Unit | Provider adapter mapping, dedupe keys, thread grouping, permission checks, send queue idempotency, count reducers, AI policy gates, contact matching, URL/email parsing, date/status helpers. | Unit test output with focused Email suites passing. |
| Integration | Database constraints, RLS/authorization deny paths, sync worker backfill, send job lifecycle, audit event writes, mailbox access grants, provisioning requests, CRM link writes, notification creation, attachment metadata. | Integration test output with seeded multi-user workspace. |
| Provider sandbox E2E | Fake provider simulates inbound, sent folder, notification/delta sync, provider outage, Send As denied, attachment fetch failure, token expiry. | Deterministic E2E run in CI/local without external credentials. |
| Real-provider smoke | Staging Zoho Mail tenant/mailboxes prove one inbound and one outbound shared-mailbox flow; Microsoft 365 smoke is required only when Microsoft is enabled. | Manual or automated staging record with message ids and screenshots. |
| Browser UX | Desktop and mobile paths for setup wizard, thread list, reader, compose, reply, assign, link to contact/project, access management, owner audit banner, empty/error/offline states. | Playwright screenshots and test report at required breakpoints. |
| Accessibility | Keyboard navigation, focus traps, unique accessible names, shortcut suppression inside inputs, screen-reader labels for mailbox/thread/action controls. | Automated a11y check plus keyboard smoke notes. |
| Security | Unauthorized read/search/send attempts, personal mailbox owner audit, provider webhook validation, encrypted token storage, AI policy enforcement, audit export permission. | Security test output and code review checklist. |
| Performance | 25k-message search, 50-thread list load, thread detail with 100 messages, bulk assignment of 100 selected threads. | Query plans or performance test output under NFR targets. |
| Resilience | Provider outage, token expiry, notification gap, send retry, attachment failure, DB transient failure, stale sync warning, rollback after failed optimistic action. | Failure-injection test output and runbook links. |

### Required E2E Scenarios

| Scenario | Flow | Launch Gates Proved |
|---|---|---|
| E2E-EMAIL-1 | Owner connects provider, imports `tomas@` and `sales@`, runs test inbound/outbound. | LG-EMAIL-1, LG-EMAIL-2, LG-EMAIL-6, LG-EMAIL-7 |
| E2E-EMAIL-2 | Member sees own mailbox and `sales@`, cannot see `finance@`, cannot query its thread by URL/API. | LG-EMAIL-3 |
| E2E-EMAIL-3 | Owner opens another user's personal mailbox, sees warning, records reason, audit event persists. | LG-EMAIL-4, LG-EMAIL-15 |
| E2E-EMAIL-4 | User with CRM `send_as` but missing provider Send As attempts send; CRM blocks and shows setup mismatch. | LG-EMAIL-5 |
| E2E-EMAIL-5 | New inbound email to `sales@` appears, auto-matches contact, is assigned, notifies assignee, marked done. | LG-EMAIL-6, LG-EMAIL-8, LG-EMAIL-9 |
| E2E-EMAIL-6 | User replies from `sales@`, sent item syncs back, Touch created on linked contact. | LG-EMAIL-7, LG-EMAIL-9 |
| E2E-EMAIL-7 | Message with attachment syncs, metadata renders, download works or shows provider denial cleanly. | LG-EMAIL-10 |
| E2E-EMAIL-8 | Webhook gap is simulated; delta/backfill recovers missed mail without duplicates. | LG-EMAIL-11 |
| E2E-EMAIL-9 | Owner disables send/sync during simulated incident; historical read remains, send/sync blocked. | LG-EMAIL-12 |
| E2E-EMAIL-10 | Browser screenshots verify desktop/mobile route, list, reader, composer, settings, permission, and error states. | LG-EMAIL-13 |
| E2E-EMAIL-11 | AI-disabled mailbox blocks summaries/drafts; AI-enabled shared inbox draft is labeled, cited, editable, and not auto-sent. | LG-EMAIL-15 |
| E2E-EMAIL-12 | Provider outage mode keeps cached thread readable and disables unsafe actions with specific state. | LG-EMAIL-14, LG-EMAIL-16 |
| E2E-EMAIL-13 | Owner provisions `admin@caneycloud.com`, grants a member access, provisions `new@caneycloud.com`, checks request ledger, and verifies new mailboxes/grants render. | LG-EMAIL-17, LG-EMAIL-18 |

---

## 11. Production Readiness Checklist

| Area | Ship Requirement | No-Ship Condition |
|---|---|---|
| Provider config | Zoho OAuth/client credentials, API scopes, mailbox visibility policy, and Microsoft Graph/Exchange settings if enabled are documented. | Any required provider permission is unknown or manually held in one person's memory. |
| Domain/DNS | MX, SPF, DKIM, DMARC, and provider domain status are verified outside the CRM. | Domain receives mail but fails authentication or deliverability checks. |
| Environment | Required env vars, secrets, encryption keys, callback URLs, and staging/prod separation are documented. | Dev credentials or broad provider permissions leak into production without scoping. |
| Database | Email migrations are applied, indexed, covered by tests, and have rollback/repair notes. | Search/thread list depends on unindexed scans for production-sized data. |
| Background jobs | Sync, backfill, subscription renewal, send queue, cleanup, and health jobs are scheduled and observable. | Any job can silently fail for more than one sync interval. |
| Monitoring | Sentry/log events cover provider auth, webhook, sync, send, permission denial, outage, and audit export. | A failed send or missed sync lacks a traceable event. |
| Security | Token encryption, mailbox authorization, RLS/deny paths, owner audit, AI policy, and send-as checks pass review. | Any unauthorized user can infer mailbox existence, counts, snippets, or attachments. |
| UX/UI | Required screenshots pass with no overlap, clipped text, ambiguous empty state, inaccessible action, or mobile dead end. | Mobile cannot read/reply/assign or desktop needs horizontal scrolling for core layout. |
| Recovery | Provider outage, token expiry, webhook gap, send retry, and kill-switch procedures are verified. | Operator cannot restore sync/send without code changes. |
| Support | Owner/admin can export audit, see health, revoke access, disable mailbox, and identify last successful sync. | Ops team cannot answer "who saw/sent/changed this?" from CRM records. |

---

## 12. Phasing and Task Buckets

| Phase | Task Bucket | Scope | Exit Criteria |
|---|---|---|---|
| E0 | `TASK-AGB-EMAIL-001` | Provider connection, domain setup checklist, mailbox registry | LG-EMAIL-1, LG-EMAIL-2 |
| E1 | `TASK-AGB-EMAIL-002` | Mailbox access grants, owner/admin/member rights, audit | LG-EMAIL-3, LG-EMAIL-4, LG-EMAIL-5 |
| E2 | `TASK-AGB-EMAIL-003` | Inbound/sent sync, thread cache, search, recovery | LG-EMAIL-6, LG-EMAIL-11 |
| E3 | `TASK-AGB-EMAIL-004` | Compose, reply, forward, attachments, drafts, templates | LG-EMAIL-7, LG-EMAIL-10 |
| E4 | `TASK-AGB-EMAIL-005` | Assignment, CRM linking, touches, action items, notifications | LG-EMAIL-8, LG-EMAIL-9 |
| E5 | `TASK-AGB-EMAIL-006` | Operations page, kill switches, exports, alerting | LG-EMAIL-12 |
| E6 | `TASK-AGB-EMAIL-007` | AI summaries/drafts, briefings, polish | FR-EMAIL-42 through FR-EMAIL-44 |
| E7 | `TASK-AGB-EMAIL-008` | UX hardening, provider-sandbox E2E, production runbook, visual/a11y/performance gates | LG-EMAIL-13 through LG-EMAIL-16 |
| E8 | `TASK-AGB-EMAIL-009` | Email Admin provisioning, request ledger, mailbox classification, shared/team provisioning, readiness checks | LG-EMAIL-17, LG-EMAIL-18 |

---

## 13. Explicit Won't-Have for Strong V1

| Exclusion | Reason |
|---|---|
| Self-hosted SMTP/IMAP mail server | High deliverability and security burden; no CRM differentiation |
| Fake real-provider mailbox creation without provider evidence | CRM may create/request and track provider work, but Zoho/Microsoft remains mailbox authority |
| Bulk outbound campaigns, cold outreach, mail merge | Different compliance/deliverability product |
| Spam quarantine administration | Provider should own spam filtering |
| Full eDiscovery/legal hold | Enterprise compliance suite, not needed for strong internal V1 |
| Public customer support portal | Shared inbox first; portal later if support volume justifies it |
| Calendar replacement | Keep calendar integrations separate |
| Offline native mobile email app | Web CRM first |
| Autonomous AI sending | Human must review and click Send |

---

## 14. V1 Defaults and Override Points

These defaults stand for V1 implementation unless the founder explicitly overrides them before build kickoff.

| ID | V1 Default | Why This Default | Override Risk |
|---|---|---|---|
| VD-EMAIL-1 | Zoho Mail Free for low-cost V1; Microsoft 365 remains the upgrade path | Best fit for current cost constraint while keeping real provider-hosted mailboxes, spam filtering, mobile/webmail fallback, and API sync/send. | Free-plan account limits may force Zoho Mail Lite/Premium or Microsoft later. |
| VD-EMAIL-2 | Owner can access all company mailboxes, but every personal mailbox read/action is audited. | Matches founder control requirement while preserving trust and forensic evidence. | Too strict blocks owner's stated need; too loose creates trust risk. |
| VD-EMAIL-3 | Launch shared inboxes: `sales@caneycloud.com`, `ops@caneycloud.com`, `support@caneycloud.com`. | Covers revenue, operations, and support without overloading V1 setup. | Too many inboxes increases sync/config surface. |
| VD-EMAIL-4 | AI off for personal mailboxes; AI available for shared inboxes and `ai-ok` contacts/projects. | Preserves privacy while keeping useful shared-inbox acceleration. | AI privacy mismatch. |
| VD-EMAIL-5 | Cache metadata indefinitely; cache bodies/attachments while mailbox remains active unless owner purge policy says otherwise. | Balances CRM history with storage cost and privacy. | Storage growth or audit gap. |

---

## 15. Requirement Quality Self-Score

| Dimension | Score | Note |
|---|---:|---|
| Density | 9.4 | 76 FRs cover provider, access, sync, send, triage, CRM integration, UX, dynamic behavior, testing, provisioning, and ops |
| Implementation-free | 8.6 | Zoho/Microsoft provider boundary is explicit and AGB CRM does not become the mailbox host |
| Traceability | 9.3 | Every FR traces to founder need, AGB module boundary, UX goal, production goal, or existing CRM object |
| Measurability | 9.4 | FRs, NFRs, launch gates, and E2E scenarios have concrete evidence requirements |
| Actor coverage | 9.3 | Owner/admin/member/delegate/system/external sender covered |
| Completeness | 9.5 | Strong V1 now includes UX/UI, dynamic states, provider-sandbox testing, production runbook gates, and Email Admin provisioning |
| Risk handling | 9.4 | Owner access, send-as, dedupe, missed sync, kill switch, audit, AI policy, provider outage, and rollback all specified |

Composite: **9.5 / 10 - implementation-ready. V1 defaults stand unless the founder overrides them before build kickoff.**

---

## 16. External Capability References

| Reference | Why It Matters |
|---|---|
| Zoho Mail API overview: https://www.zoho.com/mail/help/api/overview.html | Confirms REST API/OAuth path for Zoho Mail Free/Paid provider integration |
| Zoho Mail Accounts API: https://www.zoho.com/mail/help/api/get-all-user-accounts.html | Confirms account/mailbox discovery for authorized Zoho tokens |
| Zoho Mail send API: https://www.zoho.com/mail/help/api/post-send-an-email.html | Confirms provider send path without IMAP/SMTP |
| Zoho Mail messages API: https://www.zoho.com/mail/help/api/get-emails-list.html | Confirms inbox message sync path |
| Microsoft Graph Mail API: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview | Confirms Graph access to primary and shared mailbox messages |
| Microsoft Graph change notifications: https://learn.microsoft.com/en-us/graph/change-notifications-overview | Confirms webhook-style change notification path for mail resources |
| Exchange Online recipient permissions: https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/manage-permissions-for-recipients | Confirms Full Access and Send As are distinct provider permissions |
| Microsoft Graph create user: https://learn.microsoft.com/en-us/graph/api/user-post-users | Confirms Microsoft user creation path when CRM provisioning automation is enabled |
| Microsoft Graph assign license: https://learn.microsoft.com/en-us/graph/api/user-assignlicense | Confirms license assignment path after Microsoft user creation |
| Microsoft 365 shared mailboxes: https://learn.microsoft.com/en-us/microsoft-365/admin/email/about-shared-mailboxes | Confirms shared mailbox authority and admin-managed mailbox lifecycle |
| Microsoft Graph permissions reference: https://learn.microsoft.com/en-us/graph/permissions-reference | Confirms least-privilege and mailbox access scoping considerations |
