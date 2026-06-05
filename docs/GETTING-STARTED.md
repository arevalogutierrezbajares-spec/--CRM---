# AGB CRM — Getting started

A 10-minute path from "fresh laptop" to "I just logged my first touch."
Audience: a cofounder (or future-you) on day one.

---

## 0. What this tool is

Internal chief-of-staff CRM. **Every meaningful relationship is a Contact**,
**every deal/project is a Project with template-driven Milestones**, and every
substantive interaction is a **Touch**. The system layers brain features on
top — re-intros, watchdogs, weekly briefings — but the core is the same three
tables.

Don't worry about understanding the whole surface on day one. The five
workflows below cover ~90% of real usage.

---

## 1. Local dev — install

```bash
git clone <repo>
cd AGB-CRM
pnpm install
cp .env.example .env.local        # fill in below
pnpm dev                          # http://localhost:3000
```

That's it for shell setup. Now wire the env vars.

---

## 2. The env-var checklist

Edit `.env.local`. Items marked **required** must be set before anything works;
the rest activate optional brain surfaces.

### Required for any usage

| Var | Where to get it | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → "URL" | Auth + storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → "anon public" | Auth |
| `DATABASE_URL` | Supabase Dashboard → Project Settings → Database → Connection string (**Transaction** mode, port 6543, `?pgbouncer=true`) | Postgres queries |

### Optional — activate as needed

| Var(s) | Surface that activates | Where to get |
|---|---|---|
| `ANTHROPIC_API_KEY` | Re-intro generator, weekly briefing, post-meeting card, inbound triage, conversation memory | console.anthropic.com |
| `ANTHROPIC_DAILY_BUDGET_USD` | Safety stop for AI surfaces (defaults to `3`) | set to 0 to disable |
| `ANTHROPIC_DEFAULT_MODEL` | default LLM model for untyped workflows (`claude-haiku-4-5`) | keep default unless a flow is failing |
| `OPENAI_API_KEY` | Voice memo capture, 30-sec contact-on-the-fly | platform.openai.com |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AGB_BRIEFING_RECIPIENT` | Weekly briefing email | resend.com |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN` | WhatsApp bot + proactive watchdog ping | developers.facebook.com → WhatsApp Cloud API |
| `POSTMARK_INBOUND_SECRET`, `AGB_INBOUND_OWNER_USER_ID` | Forwarded-email intake | postmarkapp.com → Inbound stream |
| `OBSIDIAN_VAULT`, `OBSIDIAN_OWNER_USER_ID` | `pnpm obsidian:sync` markdown ↔ DB sync | absolute path to your vault |
| `CRON_SECRET` | Locks down `/api/cron/*` routes | any random string |
| `SENTRY_DSN` | Error capture for production webhooks/crons | sentry.io |
| `AGB_BRAIN_DISABLED=1` | Kill switch for all LLM output | — |
| `AGB_BRAIN_QUIET_HOURS=22-7`, `AGB_BRAIN_QUIET_HOURS_TZ=America/New_York` | Suppress notifications during quiet hours | — |

After editing `.env.local`, run:

```bash
pnpm verify
```

`pnpm verify` walks every surface and reports `active / paused / broken`. Use
it after any env-var change to confirm nothing regressed.

---

## 3. Apply schema + seed (one-time)

```bash
pnpm db:push    # applies the 12-table Drizzle schema to Supabase
pnpm db:seed    # loads 4 pipeline templates + 6 default tags
```

You should see "27 rows inserted into pipeline_stages" or similar. If `db:push`
errors with auth issues, double-check `DATABASE_URL`.

After this, apply RLS (defense-in-breadth):

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260526120000_rls_owner_policies.sql
```

(Or paste that SQL into the Supabase SQL editor.)

---

## 4. First sign-in

1. `pnpm dev` (or visit your Vercel deployment)
2. Enter your email, click "Send magic link"
3. Click the link in your inbox
4. You land on `/` (This Week) — initially empty
5. Click your avatar (top-right) → "Profile" — set your display name + timezone, click Save

That last step matters more than it looks: it upserts a row in `public.users`
keyed to your Supabase `auth.users.id`. Every contact/project FK depends on
that row existing.

---

## 5. Day-one workflows

### A. Log a person you just met

**Slow path** (1 min):
- `/contacts/new` → fill name + relationship → Save
- On the contact detail page, drop a touch in the textarea (channel = manual)

**Fast path** (30 sec):
- `/contacts/quick` (or the Mic button in the contacts toolbar)
- Hit record, say: *"Just met Marta López, runs Posada La Rosa in Caney —
  potential partner for the Caney onboarding project. We talked about booking
  flow at the IDB dinner."*
- Whisper transcribes → Claude extracts name + org + relationship → Contact +
  first Touch created in one shot.
- (Needs `OPENAI_API_KEY`; with `ANTHROPIC_API_KEY` set, Claude does the
  extraction. Without Claude, we use the first sentence as the name and you
  edit on the detail page.)

### B. Start a deal-as-project

- `/projects/new` → title, template (pick `caney-posada-onboarding` /
  `vav-creator-campaign` / `bd-courtship` / `restaurant-discovery`)
- Choosing a template instantiates one milestone per stage with due dates
  computed from each stage's SLA
- Link the relevant contact(s) before saving
- Click into the project → tick milestones off as you finish them

### C. After a meeting

- `/meetings/new` → title, when, attendees (chip-toggle), link a project
- In the Minutes textarea, write notes. For action items, use `[ ]` syntax:
  ```
  [ ] Send proposal to Marta
  [ ] Confirm vendor pricing
  ```
- Save → each attendee gets one `meeting` Touch + each `[ ]` line spawns a
  Milestone on the linked project

### D. Draft a warm re-intro

- On any contact detail page, click "Draft re-intro"
- Claude reads the last 5 touches + intro chain context → drafts a 2-4
  sentence message
- Edit, click Copy, send via your channel of choice
- (Needs `ANTHROPIC_API_KEY`. Without, you get a deterministic boilerplate
  template — still useful, just generic.)

### E. Get the weekly briefing

Once `ANTHROPIC_API_KEY` + Resend env vars are set, the briefing goes out
every Monday 13:00 UTC via Vercel Cron (`/api/cron/weekly-briefing`). If you
want it before then, hit the URL with your `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/weekly-briefing
```

---

## 6. What to expect when things degrade

The app is built to **fail gracefully**:

- **DB unreachable** → yellow "Database not connected" banner on every page,
  empty states everywhere. The shell stays browsable.
- **`OPENAI_API_KEY` missing** → voice features return 503 with a friendly
  message; the manual touch form still works.
- **`ANTHROPIC_API_KEY` missing** → re-intro draft falls back to a
  deterministic template; weekly briefing falls back to a 5-bullet
  fact-only summary.
- **Webhook unmatched** → unknown senders log a JSONL line in
  `/tmp/agb-inbound-triage.jsonl` (or wherever `INBOUND_TRIAGE_LOG_PATH`
  points) so you can promote them to real contacts later.

If something looks broken, run `pnpm verify` first — it'll tell you which
surface is paused vs broken.

---

## 7. The board

Day-to-day work is tracked in `_tasks/_BOARD.md`. Every task has a markdown
file with frontmatter (`status: open|claimed|in_progress|review|merged`).
When you start something, change `status: claimed`. When you finish, push to
`review`. Tomas merges.

See `_tasks/_WORKFLOW.md` for the full lifecycle.

---

## 8. Conventions you'll pick up over time

- **Server actions, not REST.** Every mutation lives in
  `app/(app)/<entity>/actions.ts` and is called from a `<form action={...}>`.
  No client-side fetching for our own data.
- **`safeRead` everywhere.** List queries wrap in
  `safeRead(() => listX(...), defaultEmpty)`. If the DB is unreachable we
  show a banner instead of 500ing.
- **No tests yet for end-to-end DB flows.** Unit tests exist for pure lib
  functions; e2e tests cover UI + form rendering. When you add a feature with
  a real data flow, write a Playwright test that exercises it against a seed
  DB.
- **Server-side everything by default.** Only files that need browser APIs
  (recorder, drawer, dropdowns, theme toggle) get `"use client"`.

---

## 9. Quick reference

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` | Production build (verifies TS) |
| `pnpm db:push` | Apply schema to DB |
| `pnpm db:seed` | Seed templates + tags |
| `pnpm db:studio` | Drizzle Studio (data browser) |
| `pnpm test` | Vitest unit tests (~70 tests, ~400ms) |
| `pnpm test:e2e` | Playwright e2e (~12 tests, ~45s) |
| `pnpm test:all` | Both |
| `pnpm verify` | Check every env-gated surface (`active / paused / broken`) |
| `pnpm obsidian:sync` | Pull frontmatter from your Obsidian vault into the DB |

---

Welcome aboard.
