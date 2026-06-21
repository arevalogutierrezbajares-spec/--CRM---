Perfect! Now I have all the information I need. Let me compile the comprehensive surface map:

---

# AGB-CRM Surface Map

## System Overview
**AGB-CRM** is the chief-of-staff CRM and portfolio orchestration platform for Arevalo Gutierrez Bajares. It aggregates contacts, projects, meetings, research, treasury, email, and overlord tasks into a unified intelligence layer. Built with Next.js 16 (App Router) + Drizzle ORM + Supabase Postgres, deployed on Vercel at `https://agb-crm.vercel.app` (custom domain: `x.vamosavenezuela.com`).

**Key role in derivation pipeline:** Reads Overlord boards via `/api/overlord/sync`, ingests research roots from VAV/VZ docs via `lib/brain-roots.ts`, maintains canonical project + contact state, and serves all downstream agent tools via MCP (`/api/mcp`) and WhatsApp agent webhooks.

---

## L1 DOMAINS (Machine-Readable)

| Domain | Description | Function | API Routes | DB Tables | Key Queries |
|--------|-------------|----------|-----------|-----------|------------|
| **CONTACTS & NETWORK** | Person/org records, relationship types, communication channels (email, WhatsApp, phone, Instagram, domain), warm network inference | Identity/Access + Comms | `/api/capture/members/*`, `/api/capture/sessions/*`, `/api/contact-logo` | `contacts`, `contactChannels`, `contactTags`, `tags`, `waConversations` | `contacts.ts`, `network.ts`, `reciprocity.ts`, `warm-path.ts` |
| **PROJECTS & PORTFOLIO** | Portfolio line-of-business tracking, project status (active/waiting/done/lost), milestones, dependencies, doc comments, featured logos, OKRs. Cross-links with contacts and initiatives | Ops/Intelligence | `/api/export/projects`, `/api/materials/[id]/view` | `projects`, `linesOfBusiness`, `milestones`, `projectLinks`, `projectDocContents`, `docComments`, `projectContacts`, `objectives`, `keyResults` | `projects.ts`, `roadmap.ts`, `items.ts`, `milestones.ts`, `okrs.ts` |
| **MEETINGS & TOUCHES** | Meeting logs (one-on-one/group/event/call), meeting materials, call recordings, voice transcription, touch logs (email/WhatsApp/call/meeting/voice_memo/manual), recency tracking | Messaging/Comms + Ops | `/api/voice/transcribe`, `/api/meetings`, `/api/capture/notes` | `meetings`, `meetingAttendees`, `meetingMaterials`, `touches`, `callRecordings`, `voiceNotes` | `meetings.ts`, `touches.ts`, `activity.ts`, `call-recordings.ts` |
| **RESEARCH & INTELLIGENCE** | Research note sync from VAV/VZ docs, note classification, brain-roots allow-list (`lib/brain-roots.ts`), research content indexing | Content/Catalog | `/api/research/sync`, `/api/research/[id]` | `researchNotes` | `research.ts` |
| **TREASURY & FINANCE** | Accounts (checking/savings/crypto/brokerage), transactions, categories (expense/income/transfer), subscriptions, budgets, FX rates, usage snapshots | Payments/Money | `/api/equity/advisor` | `finAccounts`, `finTransactions`, `finCategories`, `finVendors`, `finSubscriptions`, `finBudgets`, `finFxRates`, `finUsageSnapshots` | `treasury.ts` |
| **EMAIL MODULE** | Provider connections (Microsoft 365 / Zoho Mail / sandbox), mailboxes, threads (open/waiting/done/snoozed), messages (inbound/outbound), drafts, send jobs, Postmark inbound webhook, CRM link cross-references | Messaging/Comms | `/api/email`, `/api/postmark/inbound`, `/api/capture/notes` | `emailProviderConnections`, `emailMailboxes`, `emailThreads`, `emailMessages`, `emailDrafts`, `emailSendJobs`, `emailThreadCrmLinks`, `emailAuditEvents` | `email.ts`, `email-sandbox.ts` |
| **PARTNER ROOMS & ACCESS** | Partner-facing share rooms (draft/active/paused/revoked), items, comments, signatures, uploads, next-steps, share channels (email/WhatsApp/signal/link), access tracking | Content/Catalog + Booking | `/api/access/*`, `/api/partner-uploads`, `/api/room-items` | `partnerRooms`, `partnerRoomMembers`, `partnerShares`, `partnerAccessEvents`, `partnerUploads`, `partnerRoomMessages`, `partnerRoomItems`, `partnerItemComments`, `partnerNextSteps`, `partnerSignatures` | `partner-access.ts`, `partner-repository.ts`, `partner-uploads.ts`, `partner-next-steps.ts`, `partner-signatures.ts` |
| **OVERLORD & WORK MGMT** | Overlord board sync (sections/tasks), work priorities (now/next/later/backlog), initiatives (planning/active/paused/done), sprints, themes, action items, dependencies | Ops/Intelligence | `/api/overlord/sync` | `overlordSections`, `overlordTasks`, `initiatives`, `sprints`, `actionItems`, `themes`, `initiativeDependencies` | `overlord.ts`, `work.ts` |
| **VOICE & CAPTURE** | WhatsApp bot media pipeline (voice transcription via Groq/OpenAI Whisper), capture tokens, sessions, action items, posts, live token generation, quick-contact endpoint | Messaging/Comms | `/api/voice/*`, `/api/capture/*`, `/api/whatsapp/webhook`, `/api/agent/transcribe` | `voiceNotes`, `captureSessions`, `captureTokens`, `actionItems`, `posts`, `postReactions`, `postMentions` | `capture-sessions.ts`, `activity.ts` |
| **PITCH FEEDBACK** | Campaign creation/delivery (draft/active/closed/archived), invites (link_generated/sent/opened/completed/expired), sessions, responses (reaction/score/text), AI insights, delivery attempts, events | Content/Catalog + Booking | (UI only via `/app/presentations`) | `pitchFeedbackCampaigns`, `pitchFeedbackInvites`, `pitchFeedbackSessions`, `pitchFeedbackResponses`, `pitchFeedbackAiInsights`, `pitchFeedbackDeliveryAttempts`, `pitchFeedbackEvents` | `pitch-feedback.ts` |
| **REMINDERS & NUDGES** | Recurring reminders (once/daily/weekly/monthly), DST-aware cron (`*/5 * * * *`), nudges (daily overdue/blocked/stale aggregation), dedup per day | Messaging/Comms + Ops | `/api/cron/reminders`, `/api/cron/nudges` | `reminders`, `sharedReminders`, `nudges` | (query fragments in cron handlers) |
| **INTELLIGENCE & AI** | Dashboard AI actions, brain feedback, MCP tool definitions + execution (`lib/mcp/tools.ts`), WhatsApp agent intent routing (Haiku 4.5 / Sonnet), tool-gating per intent | Ops/Intelligence | `/api/dashboard/ai-actions`, `/api/brain/feedback`, `/api/mcp` | `mcpAccessTokens`, `mcpAuthCodes`, `mcpOauthClients` | (no separate queries) |

---

## Machine-Readable Contracts

### Drizzle Schema + Database Tables
**Path:** `/Users/tomas/AGB-CRM/db/schema.ts`  
**Migrations:** `/Users/tomas/AGB-CRM/db/migrations/` (25 files, versioned)  
**Total Tables:** ~140 exported Drizzle tables (incl. views, junction tables)

**Core tables by domain:**

| Domain | Key Tables (name / type) | Enums | Count |
|--------|--------------------------|-------|-------|
| Contacts | `contacts`, `contactChannels`, `contactTags`, `tags` | `contactType`, `relationshipType`, `channelKind`, `tagKind` | 4 primary + 2 junction |
| Projects | `projects`, `projectLinks`, `projectDocContents`, `docComments`, `milestones` | `projectStatus`, `healthColor`, `milestoneStatus`, `linkCategory` | 5 primary + 2 supporting |
| Meetings | `meetings`, `meetingAttendees`, `meetingMaterials`, `touches` | `meetingType`, `meetingSource`, `touchChannel` | 4 primary |
| Email | `emailProviderConnections`, `emailMailboxes`, `emailThreads`, `emailMessages`, `emailDrafts`, `emailSendJobs` | `emailProviderKind`, `emailConnectionStatus`, `emailThreadStatus`, `emailMessageDirection`, `emailDraftStatus` | 8+ with provisioning/audit |
| Treasury | `finAccounts`, `finTransactions`, `finCategories`, `finVendors`, `finSubscriptions` | `accountType`, `categoryKind`, `subscriptionStatus`, `txnSource` | 8+ with budgets/FX/usage |
| Partner | `partnerRooms`, `partnerRoomMembers`, `partnerShares`, `partnerAccessEvents`, `partnerUploads` | `partnerKind`, `partnerRoomStatus`, `partnerShareChannel`, `partnerAccessEventType` | 10+ with signatures/items |
| Overlord | `overlordSections`, `overlordTasks` | `overlordStatus`, `overlordPriority` | 2 primary (synced from external board) |
| Work Mgmt | `initiatives`, `sprints`, `actionItems`, `themes` | `initiativeStatus`, `sprintStatus`, `workPriority` | 8+ with dependencies/OKRs |
| Pitch | `pitchFeedbackCampaigns`, `pitchFeedbackInvites`, `pitchFeedbackResponses`, `pitchFeedbackAiInsights` | 7 enums (audience/status/delivery) | 7 primary + delivery tracking |
| Voice/Capture | `voiceNotes`, `callRecordings`, `captureSessions`, `posts`, `waConversations` | `waDirection` | 5 + WhatsApp activity audit |
| Users/Workspace | `users`, `workspaces`, `workspaceMembers`, `workspaceInvites` | `workspaceRole` | 4 primary (auth mirror + invites) |

**Database connection:** Supabase project `uktrhbvdamzfzbnhuwhn` (pooler: session mode)  
**Applied migrations:** 25/25 recorded in `supabase_migrations.schema_migrations`  
**Key rule:** Never apply migrations by hand; use `scripts/db-migrate.sh --apply`

### API Routes + Endpoints
**Path:** `/Users/tomas/AGB-CRM/app/api/`  
**Total routes:** ~75 `route.ts` files

**By API domain (endpoint count + primary methods):**

| API Domain | Routes | Key Endpoints | Methods |
|-----------|--------|---------------|---------|
| `capture/` | 23 | `POST /api/capture/{members, posts, notes, action-items}`, `GET /api/capture/{sessions, tokens}`, `PUT /api/capture/sessions/[id]` | POST, GET, PUT, DELETE |
| `access/` | 8 | `GET /api/access/[token]/{identify, unlock}`, `POST /api/access/[token]/{sign, comments, messages}` | GET, POST, PATCH, DELETE |
| `voice/` | 7 | `POST /api/voice/{call, transcribe, quick-contact, quote}`, `GET /api/voice/live-token` | POST, GET |
| `cron/` | 7 | `POST /api/cron/{reminders, email-sync, nudges, watchdogs}` (Vercel cron triggers) | POST |
| `mcp/` | 6 | `POST /api/mcp`, `GET/POST /api/mcp/oauth/{token, authorize, register}` | POST, GET |
| `research/` | 2 | `POST /api/research/sync`, `GET /api/research/[id]` | POST, GET |
| `email/` | 2 | (handlers, schema TBD from sources) | POST, GET |
| `whatsapp/` | 1 | `POST /api/whatsapp/webhook` (Cloud API handshake + message receive) | GET (handshake), POST (events) |
| `postmark/` | 1 | `POST /api/postmark/inbound` (inbound email webhook) | POST |
| `overlord/` | 1 | `POST /api/overlord/sync` (board state sync) | POST |
| `dashboard/` | 1 | `POST /api/dashboard/ai-actions` | POST |
| `materials/` | 1 | `GET /api/materials/[id]/view` | GET |
| `export/` | 2 | `POST /api/export/{projects, contacts}` (CSV) | POST |
| `health/` | 1 | `GET /api/health` (liveness + deep check) | GET |
| Other | 13 | `partner-uploads`, `room-items`, `agent/transcribe`, `equity/advisor`, `contact-logo`, `brain/feedback` | Mixed |

**No OpenAPI spec exists.** Contracts are implicit in Drizzle queries (`db/queries/*.ts`, 53 files) + NextRoute handlers.

### Cron Jobs (Vercel)
**Path:** `/Users/tomas/AGB-CRM/vercel.json`

| Cron Job | Schedule | Endpoint | Function |
|----------|----------|----------|----------|
| Reminders | `*/5 * * * *` | `POST /api/cron/reminders` | Fire due reminders + DST math |
| Email sync | `*/5 * * * *` | `POST /api/cron/email-sync` | Sync Postmark/O365/Zoho inbound |
| Watchdogs | `0 12 * * *` | `POST /api/cron/watchdogs` | Health checks (TBD) |
| Nudges | `0 13 * * *` | `POST /api/cron/nudges` | Gather overdue/blocked/stale + push via WA |
| Weekly briefing | `0 13 * * 1` | `POST /api/cron/weekly-briefing` | Summarize week + send email |
| Audio purge | `30 11 * * *` | `POST /api/cron/audio-purge` | Clean up voice recordings (TTL) |

---

## Cross-System Integration Points (Interchange Edges)

### Inbound (other systems → AGB-CRM)

| Source System | Protocol | Data Flow | AGB Table | Route/Handler |
|---------------|----------|-----------|-----------|---------------|
| **Overlord board** (external JSON/web) | HTTP POST | Board sections/tasks sync | `overlordSections`, `overlordTasks` | `POST /api/overlord/sync` → `lib/overlord-parser.ts` |
| **VAV docs** (`vz-docs/`) | Filesystem mount | Research notes ingest (path: `/Users/tomas/vz-docs`) | `researchNotes` | `POST /api/research/sync` → `lib/brain-roots.ts` + file read |
| **VZ Tourism docs** (`VZ_Tourism_Project/docs/`) | Filesystem mount | Research notes ingest (path: `/Users/tomas/VZ_Tourism_Project/docs`) | `researchNotes` | `POST /api/research/sync` |
| **WhatsApp Cloud API** (Meta) | Webhook POST | Inbound messages, media, status callbacks | `waConversations`, `voiceNotes`, `waActivity` | `POST /api/whatsapp/webhook` → WA agent tools |
| **Postmark** (email service) | Webhook POST | Inbound email forward | `emailThreads`, `emailMessages` | `POST /api/postmark/inbound` + signature verify |
| **Microsoft Graph** (O365) | OAuth2 + REST | Email sync (mailboxes, threads, attachments) | `emailProviderConnections`, `emailMailboxes`, `emailMessages` | `/api/email/*` handlers (async polling via cron) |
| **Zoho Mail** | OAuth2 + REST | Email sync (alt provider) | `emailProviderConnections`, `emailMailboxes`, `emailMessages` | `/api/email/*` handlers (async polling via cron) |
| **Anthropic Claude API** | HTTPS REST | LLM inference (Haiku/Sonnet) for agent intent routing, summarization, nudges | (no direct table; output feeds WA agent tool calls) | `/api/mcp`, WA agent loops, cron summarization |
| **Groq / Whisper** (voice transcription) | HTTPS REST | Transcribe voice notes → text | `voiceNotes` | `POST /api/voice/transcribe`, WA media pipeline |
| **Elevenlabs** (TTS) | HTTPS REST | Generate voice clips (jarvis.mp3, greetings) | (files only, no DB) | `scripts/gen-greetings.ts` (batch, not API) |
| **Deepgram** (live transcription) | WebSocket | Real-time call recording transcription | `callRecordings` | (prototype, `/record` page, not yet in prod cron) |
| **Resend / Twilio** (email delivery) | HTTPS REST | Outbound email send | `emailDrafts`, `emailSendJobs` | `lib/email-send.ts` (called from draft UI + cron) |
| **Sentry** | HTTPS REST | Error/performance instrumentation | (no table; only logs) | `lib/instrument.ts` (integrated into 4 routes) |

### Outbound (AGB-CRM → other systems)

| Target System | Protocol | Data Flow | Source Tables | Trigger |
|---------------|----------|-----------|----------------|---------|
| **WhatsApp Cloud API** (Meta) | HTTP POST | Send messages, upload media | `waConversations` | WA agent tool `send_message` (manual + nudges cron) |
| **Anthropic Claude** | HTTPS REST | LLM tool calls (intent classify, summarize) | All (context-dependent) | Every WA inbound + nudge cron + briefing cron |
| **Supabase Storage** | S3-like API | Upload media (documents, signatures, voice) | `itemAttachments`, `partnerUploads`, `voiceNotes` | Partner room upload + capture pipeline |
| **Microsoft Graph / Zoho** | HTTP PATCH/POST | Update mailbox flags, sync status back | `emailMailboxes`, `emailThreads` | Email thread read/archive (polling-based, not push) |
| **Resend / SMTP** | SMTP or HTTP POST | Send outbound email (briefing, share invites) | `emailDrafts`, `partnerShares` | Weekly briefing cron, partner room invite flow |

### Shared Auth/Identity

| System | Type | Details |
|--------|------|---------|
| **Supabase Auth** (auth.users) | Single sign-on | `users` table mirrors `auth.users` (UUID pk, email unique); invite-only magic link login at `x.vamosavenezuela.com` |
| **MCP OAuth server** | Tool authorization | AGB-CRM acts as OAuth provider for external MCP clients (Claude Code, etc.); tokens in `mcpAccessTokens`, `mcpOauthClients` |
| **Workspace membership** | RBAC | `workspaceMembers` (role: owner/admin/member) gates access to all data via RLS policies; no cross-org data bleed |

### Shared Database

| Source | Target | Type | Details |
|--------|--------|------|---------|
| AGB-CRM | VAV platform | Query mirror (TBD) | VAV reads `projects`, `contacts`, `milestones` via service role key + Supabase RLS exceptions (TBD) |
| AGB-CRM | Caney PMS | REST API query | Caney PMS reads project state via AGB API (TBD integration) |

---

## Deploy + Liveness Signals

| Signal Type | Current Value | Details |
|-------------|---------------|---------|
| **Git remote** | `https://github.com/arevalogutierrezbajares-spec/--CRM---.git` | Primary repo; branch strategy: feature/* → main (PR review) |
| **Git branch (current)** | `main` (detached from `feat/crm-5-enhancements`) | 27 commits ahead of last tag; `git describe --tags` shows nearest production release |
| **Deployed at** | `https://agb-crm.vercel.app` (Vercel) | Custom domain: `x.vamosavenezuela.com` (DNS A record pending) |
| **CI/CD** | Vercel auto-deploy on push to `main` | Build: `npm run build` (2.3s ✓); typecheck: `tsc --noEmit` (clean ✓) |
| **Database health** | `GET /api/health?deep=1` | Checks Supabase connection pool + Postgres ping; yellow banner if degraded |
| **Workspace schema** | `supabase_migrations.schema_migrations` | 25/25 migrations applied + recorded; next pending: none |
| **Cron status** | Vercel cron dashboard | 6 scheduled jobs; last fires logged in error aggregator |
| **Error tracking** | Sentry + `lib/instrument.ts` | Integrated into 4 high-value routes (whatsapp/webhook, postmark/inbound, mcp, cron/nudges) |
| **Local dev signal** | `pnpm dev` → `localhost:3000` | Requires `.env.local` (DATABASE_URL, ANTHROPIC_API_KEY, etc.); unset keys → feature paused (not 500) |

**Git status (as of now):**
- `M package.json` (dependency changes)
- `M pnpm-lock.yaml` (lock file)
- `?? docs/requirements/THE-BRAIN-HLR.md` (untracked doc)
- No uncommitted schema changes

---

## Function Alignment (per domain)

| Domain | Booking/Commerce | Content/Catalog | Identity/Access | Messaging/Comms | Payments/Money | Ops/Intelligence |
|--------|------------------|-----------------|-----------------|-----------------|-----------------|-----------------|
| Contacts | - | - | **Primary** | **Primary** | - | - |
| Projects | - | - | - | - | - | **Primary** |
| Meetings | - | - | - | **Primary** | - | **Primary** |
| Research | - | **Primary** | - | - | - | **Primary** |
| Treasury | - | - | - | - | **Primary** | - |
| Email | - | - | - | **Primary** | - | **Primary** |
| Partner Rooms | **Primary** | **Primary** | **Primary** | **Primary** | - | - |
| Overlord | - | - | - | - | - | **Primary** |
| Voice/Capture | - | - | - | **Primary** | - | **Primary** |
| Pitch Feedback | **Primary** | **Primary** | - | - | - | - |
| Reminders | - | - | - | **Primary** | - | **Primary** |
| Intelligence | - | - | - | - | - | **Primary** |

---

## Notes for the Brain Derivation Pipeline

1. **Overlord sync is the circuit-breaker:** Every portfolio change (new project, status update, task creation) flows through `/api/overlord/sync` → `overlordTasks` table → derivative initiative/milestone/actionItem nodes. This is where the "chief-of-staff" role manifests.

2. **Research roots are mounted:** External doc systems (VAV, VZ) are mounted at `/Users/tomas/vz-docs` and `/Users/tomas/VZ_Tourism_Project/docs`. The `POST /api/research/sync` handler reads these and fills `researchNotes`, keyed by `source_root` + relative path. Allow-list in `lib/brain-roots.ts` gates access.

3. **MCP is the tool export:** All agent-callable functions (create contact, log meeting, add action item, etc.) are defined in `lib/mcp/tools.ts` and exposed via OAuth at `/api/mcp/oauth/*`. The WA agent, Claude Code, and any external Claude instance can authenticate and call tools.

4. **Email thread ↔ contact link:** Every `emailMessage` can be linked to a `contact` via `emailThreadCrmLinks`. This allows the email module to drive contact recency and surface partner engagement without duplicate sync logic.

5. **Partner room is the external-facing portal:** `partnerRooms` + access token (`/api/access/[token]/*`) is how external stakeholders (investors, partners, advisors) get gated, read-only views + next-steps forms. Every room event is logged in `partnerAccessEvents` for engagement tracking.

6. **Dual-identity on users:** `users.id` (UUID) mirrors Supabase auth; `whatsappPhone` (E.164 number) is how the WA webhook router identifies the sender. Persona string in `whatsappPersona` customizes agent replies per user.

7. **No explicit "Booking" domain yet:** Pitch Feedback and Partner Rooms touch commerce (investor engagement, signature capture), but there's no Stripe/payment binding yet. Treasury is financial tracking, not transaction processing.

8. **Daily budget guard on LLM:** `ANTHROPIC_DAILY_BUDGET_USD` (default 3) enforces $3/day max spend across all agent + cron calls. Haiku 4.5 routing on routine intents (recap, todos, reminders) keeps spend low.

---

## File Paths (for reference during derivation)

**Schema + migrations:**
- `/Users/tomas/AGB-CRM/db/schema.ts` — Drizzle table definitions + enums
- `/Users/tomas/AGB-CRM/db/migrations/` — 25 migration files (YYYYMMDDHHMMSS_description.sql format)
- `/Users/tomas/AGB-CRM/db/queries/` — 53 query modules (one per domain/feature)

**API routes:**
- `/Users/tomas/AGB-CRM/app/api/` — 21 subdirectories, ~75 route.ts files

**Frontend (app routes):**
- `/Users/tomas/AGB-CRM/app/(app)/` — 35 route segments (contacts/, projects/, overlord/, research/, etc.)

**External integrations:**
- `/Users/tomas/AGB-CRM/lib/brain-roots.ts` — Research root allow-list
- `/Users/tomas/AGB-CRM/lib/overlord-parser.ts` — Overlord board parse logic
- `/Users/tomas/AGB-CRM/lib/overlord-sync.ts` — Overlord state reconciliation
- `/Users/tomas/AGB-CRM/lib/mcp/tools.ts` — MCP tool definitions + execute
- `/Users/tomas/AGB-CRM/lib/wa-agent/` — WhatsApp agent intent classifier, tools, media pipeline

**Deployment config:**
- `/Users/tomas/AGB-CRM/vercel.json` — Cron schedule + build settings
- `/Users/tomas/AGB-CRM/package.json` — Scripts (dev, build, test, db:*)
- `/Users/tomas/AGB-CRM/next.config.ts` — Next.js config (image optimization, etc.)
- `/Users/tomas/AGB-CRM/drizzle.config.ts` — Drizzle CLI config (schema path, migrations dir)

---