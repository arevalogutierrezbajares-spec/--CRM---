# Drive AGB-CRM from Claude — Desktop Connector + Weekly Briefing Routine

**What this gets you:** operate the entire CRM by talking to Claude from any app — "Who do I owe a follow-up?", "Log this call note to [contact]", snip a LinkedIn profile → "add this person" — plus an automated weekly briefing that runs in the cloud and lands in your inbox. This is the "100x" layer from the E2E review (items X-1 / X-2).

**Status:** the MCP server is already built and deployed. This is a setup runbook — no code changes required for the OAuth path.

---

## This is the CRM's one existing MCP server — not a new one

There is a single MCP server in this repo: `app/api/mcp/` (internals in `lib/mcp/*`, tokens in the `mcp_access_tokens` table). The **Profile page already exposes it** for Claude Code via the command `claude mcp add --transport http agb-crm-mcp <origin>/api/mcp` (`app/(app)/profile/mcp-connect-snippet.tsx`) and lists/revokes active connections. This runbook connects the **same server, same `/api/mcp` endpoint, same OAuth flow** — just from the Claude **Desktop** app (a custom connector) instead of the Claude **Code** CLI, plus a scheduled Routine. Nothing here builds or duplicates a second MCP.

## What's already in place

- **MCP server:** `app/api/mcp/route.ts`, live at **`https://<your-crm-domain>/api/mcp`** (your Vercel domain — the exact URL the Profile page's `claude mcp add` command points at). Public HTTPS — the one hard prerequisite for a Claude Desktop connector — is already satisfied.
- **OAuth 2.1:** full flow implemented (`/api/mcp/oauth/{register,authorize,token}` + `/api/mcp/well-known/*`), tokens are hashed, scoped to your workspace+user, and expire. Scope: `crm.read crm.write`.
- **19 tools exposed** (a curated subset of the agent registry — `lib/mcp/tools.ts`):
  - **Read (10):** `find_contact`, `contact_summary`, `find_project`, `find_member`, `status_report`, `daily_recap`, `read_todo_board`, `meeting_brief`, `list_reminders`
  - **Write (9):** `create_contact`, `log_touch`, `log_meeting`, `add_action_item`, `edit_action_item`, `attach_link`, `upsert_note`, `mark_milestone_done`, `assign_contact`, `schedule_reminder`
  - WhatsApp side-effect tools (send/draft/post) are deliberately **not** exposed.

---

## X-1 — Add the CRM as a Claude Desktop Custom Connector

1. **Claude Desktop → Settings → Connectors → "Add custom connector."**
2. Enter the remote MCP URL: **`https://<your-crm-domain>/api/mcp`**. Leave OAuth client ID/secret blank — the server self-registers (Dynamic Client Registration is implemented at `/api/mcp/oauth/register`).
3. Claude opens the OAuth consent in your browser → you sign in to the CRM and approve → the connector activates. (Claude connects from Anthropic's cloud, not your machine — fine here, since the server is public on Vercel.)
4. Verify in the CRM: **Settings → MCP connections** shows the new connection with a `last_used_at` stamp after the first call.

> **If the desktop OAuth dance misbehaves** (there was a known Dec-2025 Claude Desktop regression where the app opened its own OAuth URL instead of the server's): use the **static-token hardening** below — it sidesteps OAuth entirely. It's an opt-in code change to the auth boundary, so it's listed as a follow-up, not done by default.

### Create a "Chief of Staff" Project

In Claude Desktop, make a **Project** named "Chief of Staff", connect the CRM connector to it, and paste custom instructions:

```
You are my chief of staff with live access to my AGB CRM via the connector.
- Default to READ tools. Before any WRITE (create_contact, log_touch, log_meeting,
  add_action_item, edit_action_item, attach_link, upsert_note, mark_milestone_done,
  assign_contact, schedule_reminder), show me exactly what you'll write and wait for
  my "yes".
- When I ask "what should I focus on", call status_report + read_todo_board + list_reminders
  and synthesize, don't dump raw tool output.
- Cite the contact/project/meeting a fact came from.
```

Now from any app: **double-tap Option** → ask. For "add this person from a screenshot", use the Desktop screenshot gesture + `create_contact`.

---

## X-2 — Weekly briefing as a scheduled Routine

You already have a weekly-briefing generator at `app/api/cron/weekly-briefing/route.ts` (now on the **briefing tier** — Sonnet — after the model-tiering change). Two ways to schedule the *narrative* briefing:

**Option A — Claude Code `/schedule` (cloud Routine, recommended).** Runs on Anthropic's infra (your machine can be off), min interval 1h.

```
/schedule
Prompt: "Connect to my AGB CRM (MCP) and produce my Monday briefing: call
status_report, read_todo_board, list_reminders, and daily_recap. Then write:
(1) what moved vs last week, (2) top 5 follow-ups with a one-line drafted opener
each (people I haven't touched in a while — use contact_summary), (3) blocked
projects, (4) what slipped. Output markdown. Do not write anything back to the CRM."
Schedule: Mondays 07:00 America/Caracas
```

**Option B — keep the existing Vercel cron** (`vercel.json` already wires crons) and let it email via Resend. Use this if you want zero Claude-Code dependency; use Option A if you want the richer "follow-ups with drafted openers" synthesis.

> ⚠️ **Billing caveat:** from **2026-06-15**, `claude -p` / Agent SDK usage on subscription plans draws a separate Agent-SDK credit. A once-weekly Routine is negligible; just don't fan it out hourly.

---

## Cost note (ties to the model-tiering change)

The agent brain now runs **Sonnet** for chat/briefing and **Haiku** for intake (was all-Haiku). The MCP connector drives the same tools but Claude Desktop/Anthropic runs the model on *their* side for connector calls, so connector usage doesn't hit the CRM's `ANTHROPIC_DAILY_BUDGET_USD` cap — only in-app agent calls do. Keep an eye on the in-app spend dashboard after the Sonnet bump; override any tier with `ANTHROPIC_MODEL_CHAT` / `ANTHROPIC_MODEL_BRIEFING` / `ANTHROPIC_MODEL_STRATEGY` env vars.

---

## Follow-up (needs your go-ahead): static-token hardening

To make the connector immune to desktop-OAuth flakiness, add an env-gated **static bearer token** path so you can paste one long-lived token instead of doing the OAuth dance. This is a deliberate change to the MCP auth boundary (`lib/mcp/oauth.server.ts` `resolveTokenToContext`), so I left it out by default. The shape, if you want it:

- New env vars: `MCP_STATIC_TOKEN` (the secret) + `MCP_STATIC_TOKEN_USER_ID` (whose workspace it acts as).
- In `resolveTokenToContext`, before the DB lookup: if `MCP_STATIC_TOKEN` is set and the bearer matches it (constant-time compare), resolve to that user's workspace context.
- Trade-off: a long-lived credential that doesn't expire/rotate like the OAuth tokens — store it only in Vercel env + Claude Desktop, never in git.

Say the word and I'll implement it behind that env flag.
