---
id: TASK-AGB-000A
title: Apply Drizzle schema + run seed against linked Supabase project
status: open
priority: P0
phase: 0
fr_covered: [FR-TEAM-1]
owner: null
branch: null
pr: null
estimated_points: 1
created: 2026-05-26
updated: 2026-05-26
blocked_by: []
blocker_note: Requires user (Tomas) to fetch DB password from Supabase dashboard
---

## What

Apply the 12-table Drizzle schema to the linked Supabase project (`bbrhvedzmzjbhjpjmhab`) and run the seed script that loads the 3 pipeline templates (Caney 12 stages + VAV 10 + BD 5) and 6 default tags.

## Why

Phase 0 scaffold shipped without an applied schema because the DB password wasn't available during the orchestrated build session. Without this, no other Phase 1 task can run end-to-end since CRUD relies on real tables.

## Acceptance Criteria

- [ ] DB password fetched from Supabase Dashboard → Project Settings → Database (or "Reset database password")
- [ ] `DATABASE_URL` set in `.env.local` (pooler URL with password)
- [ ] `pnpm db:push` completes without error
- [ ] All 12 tables visible in Supabase Studio: `users`, `contacts`, `contact_channels`, `contact_tags`, `tags`, `pipeline_templates`, `pipeline_stages`, `projects`, `project_contacts`, `milestones`, `touches`, `meetings`, `meeting_attendees`
- [ ] `pnpm db:seed` completes; 27 rows in `pipeline_stages`, 3 in `pipeline_templates`, 6 in `tags`
- [ ] Same `DATABASE_URL` added to Vercel env vars for production + preview + development
- [ ] **Vercel redeploy completes successfully with DB connection live**

## Files to touch

```
.env.local                  # add DATABASE_URL
(no code changes)
```

## Suggested approach

1. Supabase Dashboard → bbrhvedzmzjbhjpjmhab → Project Settings → Database → Connection string (Transaction mode, port 6543, with `?pgbouncer=true`)
2. Reset password if needed, copy connection string with password substituted
3. Paste into `.env.local` as `DATABASE_URL=...`
4. From `~/AGB-CRM`: `pnpm db:push` → confirm migration
5. `pnpm db:seed`
6. Open Supabase Studio and verify 12 tables + 27 stages
7. Add `DATABASE_URL` to Vercel (3 envs) and trigger redeploy

## Out of scope

- Creating Founder 2 account (see AGB-000B)
- Custom domain / RLS policies (see AGB-004)

## Notes

The Supabase pooler URL format is roughly:
`postgresql://postgres.bbrhvedzmzjbhjpjmhab:<PASSWORD>@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

Use the actual region from the Supabase dashboard (West US Oregon → `us-west-1`).
