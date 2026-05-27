---
id: AGB-DOM-002
title: Whitelist x.vamosavenezuela.com in Supabase Auth URL Configuration
status: open
phase: Wave E — Domain Launch
priority: P0
points: 1
agent: USER-ACTION
---

## What

Allow the magic-link callback to redirect to the new domain by adding it to
Supabase's auth URL allow-list.

## Why

Supabase Auth rejects any redirect URL not explicitly allow-listed. Without
this, users who click the magic link from their email will land on a 401 or
be redirected to the old default URL instead of `https://x.vamosavenezuela.com`.

The agent cannot do this — Supabase Dashboard does not expose URL allow-list
management via CLI/API in a way the agent can reliably automate.

## Steps

1. Supabase Dashboard → project `uktrhbvdamzfzbnhuwhn` → **Authentication → URL Configuration**
2. **Site URL** field → set to `https://x.vamosavenezuela.com`
3. **Redirect URLs** section → click "Add URL" → add: `https://x.vamosavenezuela.com/auth/callback`
4. Keep any existing entries (e.g., `http://localhost:3000/auth/callback` for local dev)
5. Save

## Acceptance criteria

- [ ] Site URL is `https://x.vamosavenezuela.com`
- [ ] Redirect URLs list contains `https://x.vamosavenezuela.com/auth/callback`
- [ ] Local-dev redirect URL `http://localhost:3000/auth/callback` still present

## Blocks

[AGB-DOM-003](TASK-AGB-DOM-003-e2e-verify-domain.md) — magic link won't work without this
