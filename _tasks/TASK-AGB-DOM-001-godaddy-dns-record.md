---
id: AGB-DOM-001
title: Add DNS A record at GoDaddy for x.vamosavenezuela.com
status: open
phase: Wave E — Domain Launch
priority: P0
points: 1
agent: USER-ACTION
---

## What

Point `x.vamosavenezuela.com` at Vercel by adding an A record at GoDaddy.

## Why

`vamosavenezuela.com` is registered at GoDaddy (nameservers `ns19/ns20.domaincontrol.com`).
Vercel has the domain attached to the `agb-crm` project but cannot serve it
until DNS resolves to Vercel's edge.

The agent cannot do this — GoDaddy's DNS dashboard requires manual login.

## Steps

1. Log into GoDaddy (`account.godaddy.com`) → Products → Domains → `vamosavenezuela.com` → DNS Management
2. Click **Add New Record**
3. Set:
   | Field | Value |
   |-------|-------|
   | Type  | A |
   | Name  | x |
   | Value | 76.76.21.21 |
   | TTL   | 600 (or default) |
4. Save
5. Wait 5–30 min for propagation (sometimes longer if GoDaddy is slow that day)
6. Verify with: `dig +short x.vamosavenezuela.com` — should return `76.76.21.21`
7. Vercel auto-issues the SSL cert on first verification — no further action needed

## Acceptance criteria

- [ ] `dig +short x.vamosavenezuela.com` returns `76.76.21.21`
- [ ] `curl -I https://x.vamosavenezuela.com/login` returns 200 (not 522/525/SSL error)
- [ ] `vercel domains inspect x.vamosavenezuela.com` shows "Configured" (no warning)

## Blocks

[AGB-DOM-003](TASK-AGB-DOM-003-e2e-verify-domain.md)
