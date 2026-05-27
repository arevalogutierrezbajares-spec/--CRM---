---
id: AGB-WA-002
title: Set up agb-media Supabase Storage bucket + env vars
status: open
phase: Wave D — WA Media
priority: P0
points: 1
agent: USER-ACTION
---

## What

Create the `agb-media` private bucket in Supabase and add two env vars to
`.env.local` and Vercel. **This requires manual action — cannot be done by
the agent.**

## Steps

1. **Supabase Dashboard → Storage → New bucket**
   - Name: `agb-media`
   - Public: OFF (private)
   - No file size limit needed (voice notes are <5MB)

2. **Get Service Role Key**
   - Supabase Dashboard → Settings → API → `service_role` (secret key)
   - Add to `.env.local`:
     ```
     SUPABASE_SERVICE_ROLE_KEY=eyJ...
     ```

3. **Get OpenAI API Key**
   - platform.openai.com → API keys → Create key
   - Add to `.env.local`:
     ```
     OPENAI_API_KEY=sk-...
     ```

4. **Add both to Vercel** (if deployed):
   - `vercel env add SUPABASE_SERVICE_ROLE_KEY`
   - `vercel env add OPENAI_API_KEY`

5. Run `pnpm verify` to confirm both surfaces flip to `active`.

## Acceptance criteria

- [ ] `agb-media` bucket exists in Supabase Dashboard
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in `.env.local`
- [ ] `OPENAI_API_KEY` set in `.env.local`
- [ ] `pnpm verify` shows storage + transcription as `active`
