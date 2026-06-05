# Anthropic Cost Review (AGB CRM)

## 1) Where Anthropic is used

All Claude/Anthropic traffic goes through `lib/anthropic.ts` and is wrapped by the same spend controls.

### Wrapper entrypoints
- `claudeChat(...)` — single-turn text completions
- `claudeWithTools(...)` — agent/tool-use turns

### Callsites
- `app/api/cron/weekly-briefing/route.ts`
- `app/api/cron/nudges/route.ts`
- `app/api/meetings/[id]/summarize/route.ts`
- `app/api/voice/quick-contact/route.ts`
- `app/api/voice/call/route.ts` (tool + fallback)
- `app/(app)/brain/actions.ts`
- `app/(app)/brain/conversation-memory.ts`
- `app/(app)/brain/post-meeting-actions.ts`
- `lib/inbound-triage.ts`
- `lib/town-hall/extract.ts`
- `lib/wa-agent/loop.ts` (WhatsApp/web agent turns)

All calls pass a spend context (`workspaceId`, `userId`, `senderPhone`, `route`) with `trackUsage: true`.

---

## 2) Controls currently enforced

- `getAnthropicSpendToday(workspaceId)` in `lib/anthropic-budget.ts`
- Daily hard stop by cost via `ANTHROPIC_DAILY_BUDGET_USD` (USD millicents internal check)
- Optional hard token stop via `ANTHROPIC_DAILY_TOKEN_CAP`
- Legacy aliases still read for compatibility:
  - `AGB_ANTHROPIC_DAILY_BUDGET_USD`
  - `AGB_WA_DAILY_TOKEN_CAP`
- Spend is stored in `wa_activity` (`tokens_in`, `tokens_out`, `cost_millicents`).

---

## 3) Cost efficiency changes in place

### Runtime behavior now
- Default model has been set to Haiku (`ANTHROPIC_DEFAULT_MODEL=claude-haiku-4-5`).
- Unknown/low-risk flows use Haiku.
- WA loop max turns reduced to **5** and per-turn output cap reduced to **768 tokens**.
- WA action-capture workflow explicitly pinned to Haiku.

### Hard cap to target
- `ANTHROPIC_DAILY_BUDGET_USD=3` in `.env.example` gives a practical guardrail.
- Keep budget guardrails as-is for a strict ceiling; this applies before model call.

---

## 4) What to do to keep under ~$3/day

1. Keep default model on Haiku.
2. Keep `ANTHROPIC_DAILY_BUDGET_USD=3`.
3. Leave `ANTHROPIC_DAILY_TOKEN_CAP` unset (or low like `120000` only if you want a hard token fallback).
4. Prefer short prompts and bounded outputs (already done in most AI routes).
5. For high-frequency usage, monitor spend:
   - `sum(cost_millicents) / 1000` for daily USD estimate from `wa_activity`.

---

## 5) One-liner daily spend check

```sql
select
  date_trunc('day', created_at) as day,
  sum(cost_millicents) / 1000.0 as usd_estimate
from wa_activity
where created_at >= date_trunc('day', now())
  and workspace_id = '<YOUR_WORKSPACE_ID>'
group by 1
order by 1 desc;
```

---

## 6) Remaining follow-ups to reduce cost further (optional)

- Add a route-level opt-out so non-critical surfaces can skip LLM work during off-peak.
- Add alerting when daily spend > 80% of cap.
- Enforce per-tool/route token budgets on very chatty surfaces.
