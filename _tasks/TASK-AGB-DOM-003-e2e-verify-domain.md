---
id: AGB-DOM-003
title: E2E verify x.vamosavenezuela.com — full login flow on the live domain
status: open
phase: Wave E — Domain Launch
priority: P0
points: 2
agent: OVL-AGB-Claude
blocked_by: [AGB-DOM-001, AGB-DOM-002]
---

## What

Once DNS propagates and Supabase is configured, run a full end-to-end check
of the live login flow on `https://x.vamosavenezuela.com`.

## Why

Three independent systems (Vercel edge, GoDaddy DNS, Supabase auth) must all
agree for the magic-link flow to work. A successful local dev test doesn't
prove the prod chain.

## Steps

1. Confirm DNS is live:
   ```bash
   dig +short x.vamosavenezuela.com   # expects 76.76.21.21
   curl -I https://x.vamosavenezuela.com/login   # expects 200
   ```
2. Open `https://x.vamosavenezuela.com/login` in a real browser:
   - Caney photo renders full-bleed
   - `X . JEAV . TIGR` brand mark visible top-left in cyan
   - Hotspot is invisible; OS cursor over the book turns into glowing cyan dot
   - Click → pixel-shatter → IDENTIFY form rises
3. Submit a real email → check inbox for magic link
4. Click magic link → should land at `https://x.vamosavenezuela.com/auth/callback`
   → then redirect to root (or `/`)
5. Confirm session is established (`document.cookie` contains `sb-*` cookies)
6. Hit a protected route (e.g. `/contacts`) — should render the CRM, not redirect to login

## Failure modes to watch for

- Wrong redirect domain in the magic-link email → AGB-DOM-002 not applied
- 401/403 after callback → Supabase site URL still pointing at old domain
- 522/525 on the domain → DNS not yet propagated (wait 30 min)
- Self-signed cert warning → Vercel hasn't issued cert yet (give it 5 min after DNS lands)

## Acceptance criteria

- [ ] Steps 1–6 above all pass
- [ ] Screenshot the login + post-auth state to /docs/screenshots/x-vamosavenezuela-live.png
- [ ] Update HANDOFF.md "What works end-to-end" with "✅ x.vamosavenezuela.com production"
