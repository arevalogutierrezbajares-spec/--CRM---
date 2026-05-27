---
id: AGB-WA-001
title: Wire media dispatcher into WhatsApp webhook
status: open
phase: Wave D — WA Media
priority: P0
points: 5
agent: OVL-AGB-Claude
---

## What

Update `app/api/whatsapp/webhook/route.ts` to handle non-text message types
(audio, image, video, document, contacts) using the Wave B media pipeline.

## Why

The Wave B files (`lib/wa-agent/media/`) are complete and tested but not yet
wired into the live webhook. Voice notes arrive and are silently dropped.

## Acceptance criteria

- [ ] `type=audio`: `downloadWaMedia` → `transcribeVoice` → prepend `"I heard: '...' — "` → `agentHandle`. Body always starts with confirmation-forcing prefix.
- [ ] `type=image` / `type=video`: `downloadWaMedia` → `storeMedia` → pass caption + signed URL to agent
- [ ] `type=document`: `downloadWaMedia` → `storeMedia` → pass filename + signed URL to agent
- [ ] `type=contacts`: `parseWaContacts` → `contactCardSummary` → ask "Should I add X to CRM?"
- [ ] Other types (location, sticker, reaction): skip silently, no 500
- [ ] `type=text`: extract links with `extractLinks`, pass alongside body
- [ ] All media errors degrade gracefully (download fails → agent notified, not a 500)
- [ ] `OPENAI_API_KEY` absent → transcription skipped, agent told "voice note received but transcription unavailable"

## Files to touch

- `app/api/whatsapp/webhook/route.ts` — main dispatcher
- Imports: `downloadWaMedia`, `transcribeVoice`, `storeMedia`, `parseWaContacts`, `contactCardSummary`, `extractLinks`

## Dependencies

- AGB-WA-002 must be done first (bucket + service role key) for `storeMedia` to work
- `OPENAI_API_KEY` in `.env.local` for transcription
