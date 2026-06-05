# WhatsApp agent — operator's guide

## What it is

Text the AGB CRM number in plain English; an LLM-powered agent routes your
message through a catalog of CRM tools (find/create contacts, log touches,
schedule reminders, mark milestones done, summarize status). Reminders and
proactive nudges run on cron and push to you over WhatsApp.

The same webhook still handles the legacy slash commands (`/log /find /help`)
as a fallback path when `AGB_WA_AGENT` is off.

## Activation checklist

Set these in `.env.local` and Vercel:

```bash
# WhatsApp Cloud API (existing)
WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=               # any random string; mirrors Meta config
WA_APP_SECRET=                 # Meta App → App Secret; used to verify x-hub-signature-256

# Tells the webhook which user owns inbound messages
AGB_INBOUND_OWNER_USER_ID=     # your auth.users.id (sign in + /profile to seed)

# Outbound destination for reminders + nudges (E.164, e.g. +15551234567)
AGB_WATCHDOG_NOTIFY_PHONE=

# Brain
ANTHROPIC_API_KEY=             # required for the agent loop
ANTHROPIC_DEFAULT_MODEL=claude-haiku-4-5  # default; keep this unless a flow is failing
ANTHROPIC_DAILY_BUDGET_USD=3              # hard daily spend limit (USD)
ANTHROPIC_PRICE_PER_1M_USD=               # optional model price override JSON

# Toggles
AGB_WA_AGENT=1                 # turn on the LLM agent (else legacy /commands)
ANTHROPIC_DAILY_TOKEN_CAP=300000  # optional hard cap on daily tracked tokens
AGB_WA_DAILY_TOKEN_CAP=300000      # legacy alias for ANTHROPIC_DAILY_TOKEN_CAP
AGB_WA_RATE_PER_MIN=30         # default
AGB_WA_RATE_PER_DAY=200        # default

# Cron security
CRON_SECRET=                   # any random string; Vercel Cron sends it as Bearer
```

Add to `vercel.json` crons:

```json
{
  "crons": [
    { "path": "/api/cron/watchdogs",       "schedule": "0 12 * * *" },
    { "path": "/api/cron/weekly-briefing", "schedule": "0 13 * * MON" },
    { "path": "/api/cron/reminders",       "schedule": "*/5 * * * *" },
    { "path": "/api/cron/nudges",          "schedule": "0 13 * * *" }
  ]
}
```

Then point Meta's webhook at `https://<your-domain>/api/whatsapp/webhook` and
subscribe to the `messages` field on the WhatsApp Business Account.

Confirm everything with:

```bash
pnpm verify
```

## What the agent can do (tool catalog)

9 tools, picked by Claude based on your message:

| Tool | When Claude calls it | Example trigger |
|---|---|---|
| `find_contact` | Resolving a name to a uuid before any other action | "Marta", "Carlos at Acme" |
| `create_contact` | Only after `find_contact` returned no match + you confirmed | "Yes, create a new contact for Diego" |
| `log_touch` | Capturing an interaction | "Just had coffee with Marta, talked funding" |
| `contact_summary` | Brief on a contact | "What's the story with Carlos?" |
| `find_project` | Resolving project name | "Caney project" |
| `mark_milestone_done` | Closing a milestone (destructive — confirms first) | "Mark 'Send proposal' done on the Marta project" |
| `status_report` | Daily/weekly overview | "Status", "What's overdue?" |
| `schedule_reminder` | One-shot or recurring | "Remind me Tuesday 9am about Marta's proposal" |
| `list_reminders` | Show upcoming | "What reminders do I have this week?" |
| `cancel_reminder` | Drop a scheduled reminder | "Cancel the VAV reminder" |

(The `cancel_reminder` tool counts in the catalog — 10 entries, called "9 tools" loosely because some are read-only.)

## What you can text

Free-form examples, all routed via the agent:

| Message | Behavior |
|---|---|
| "Just met Marta López, runs Posada La Rosa in Caney" | Claude calls `find_contact("Marta")` → no match → asks "Want me to create her?" → on yes, `create_contact` + `log_touch` with the context |
| "Log a call with Carlos: he's interested in the BD intro" | `find_contact` → 1 match → `log_touch(channel: "call")` |
| "Mark 'Send proposal' done on the Marta project" | `find_project` → `find_contact` → list milestones → confirm → `mark_milestone_done` |
| "What's overdue?" | `status_report({scope:"overdue"})` → Claude summarizes in text |
| "Status" | `status_report({scope:"all"})` → "1 overdue, 1 blocked, 2 stale" + nudge |
| "Remind me Tuesday 9am about Marta's proposal" | `schedule_reminder` with parsed ISO datetime in your tz |
| "Every Monday at 8am remind me about VAV creator pipeline" | `schedule_reminder(recur: "weekly", recur_day: 1, recur_time_hhmm: "08:00")` |
| "Cancel that VAV reminder" | `list_reminders` → match by subject → `cancel_reminder` |

## What the agent will NOT do

- Send Claude any contact tagged `personal-only` (silence rule).
- Fire reminders or nudges during quiet hours (`AGB_BRAIN_QUIET_HOURS=22-7`) unless explicitly urgent.
- Auto-confirm destructive ops (mark done, advance stage). You'll always get a "Do that? yes/no" preview.
- Process messages from numbers Meta doesn't sign correctly (`x-hub-signature-256` is verified).
- Process more than `AGB_WA_RATE_PER_MIN` / `_PER_DAY` per sender — beyond that you get a rate-limit reply.
- Burn through more than `ANTHROPIC_DAILY_TOKEN_CAP` / `ANTHROPIC_DAILY_BUDGET_USD` (and legacy `AGB_WA_DAILY_TOKEN_CAP`) per day — beyond that you get a budget reply and slash-commands take over.

## Observability

Every inbound + tool call + outbound is logged to the `wa_activity` table.
Columns: `direction`, `payload` (JSONB), `tokens_in`, `tokens_out`,
`cost_millicents`, `created_at`. Query directly:

```sql
select direction, payload->>'name' as tool, count(*)
from wa_activity
where created_at > now() - interval '1 day'
group by 1, 2 order by 3 desc;
```

Errors land in your existing `lib/instrument.ts` pipeline (Sentry if
`SENTRY_DSN` is set, structured `console.error` otherwise).

## Cost reality check

At Haiku defaults:

- ~$0.00084 per typical inbound message (1200 input + 300 output tokens including system prompt + concise WA workflow context)
- 3000 messages/day = **~$2.50/day**
- Default `ANTHROPIC_DAILY_BUDGET_USD=3` gives a practical hard cap around this target for typical traffic.

If you want even tighter control, lower `ANTHROPIC_DAILY_TOKEN_CAP` or
`ANTHROPIC_DAILY_BUDGET_USD`.
For complex flows, flip workflow models to Sonnet only where needed in
`lib/wa-agent/intent/workflows.ts`.

## Failure modes

| Mode | What you'll see |
|---|---|
| Claude API 500 | Reply "I'm having trouble right now, try again in a minute." Pending intent is preserved for the next message. |
| Tool execution throws | Claude sees the error in its tool_result and either explains it to you or recovers. |
| Daily cap exceeded | "Daily AI budget reached. Try again tomorrow or use slash commands (/log /find /help)." |
| Rate limit hit | "Slow down — try again in 60s." |
| Webhook signature invalid | 403, dropped silently (logged to `wa_activity` as `direction=reject` only when `WA_APP_SECRET` is set). |
| Reminder send fails | Cron logs failure to `wa_activity`; reminder stays in `due_at = past, fired_at = null` so the next cron tick retries. |

## Multi-turn flows

The agent persists conversation state per sender phone in `wa_conversations`
with a 30-minute idle TTL. Example:

```
You:  "Remind me about Marta"
Bot:  "When? And about what specifically?"          [pending_intent set]
You:  "Tuesday 9am, about the proposal"
Bot:  "Will remind you Tue Jun 2 at 9 AM about the proposal."  [intent completed]
```

If you take more than 30 minutes between messages, the bot resets state on
the next message.

## Slash commands still work

Set `AGB_WA_AGENT=0` (or just unset it) to use the legacy parser:

- `/log @hint body` — log a touch on the matched contact
- `/find query` — fuzzy-find contacts
- `/help` — list commands

These are useful when Claude is unavailable or when you want a deterministic
shortcut.

## Local testing

```bash
pnpm test:db                      # spin up local Postgres + schema + seed
pnpm test:integration             # 33 tests covering agent, tools, crons
```

The agent integration tests mock Claude's tool-use responses + verify DB side
effects. They run in ~5s against the local Postgres without any external
network calls.
