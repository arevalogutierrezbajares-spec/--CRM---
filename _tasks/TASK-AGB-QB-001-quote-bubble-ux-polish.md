---
id: TASK-AGB-QB-001
title: Quote bubble UX polish — click-to-listen, no audio mixing, 30s pace, next arrow
status: open
priority: P2
phase: 6
fr_covered: []
owner: null
branch: null
pr: null
estimated_points: 2
created: 2026-06-06
updated: 2026-06-06
blocked_by: []
blocker_note: null
---

## What

Polish the Home top-bar quote bubble (`components/dashboard/daily/quote-bubble.tsx`)
based on live feedback. Four changes:

1. **Hover off, click to listen.** Hovering must NOT speak. Audio plays only on a
   deliberate click of the bubble.
2. **Don't mix audio types.** Keep the real broadcast soundbites (static clips)
   and the AI text-to-speech quotes separate — don't interleave the two kinds in
   the same auto-rotation/playback so it feels like one coherent stream, not a
   jarring mix of a human radio clip then a synthetic voice.
3. **Base rotation = 30s.** Change the default quote-change interval from 10s to
   30s (users who set a custom pace keep it).
4. **Small "next" arrow.** Add a clean, subtle, animated arrow control to advance
   to the next message (replaces the hidden double-click-to-advance as the
   discoverable affordance).

## Why

User need (live feedback, 2026-06-06): "change the hover off and click to listen;
don't mix the audios vs AI generated text to speech; change the base quote
changing time to 30 seconds; to go to next there should be a small arrow — make
it look clean and dynamic."

## Acceptance Criteria

- [ ] **Click-to-listen:** Hovering the bubble triggers no speech/fetch.
      A single click plays the current message's audio (real clip for broadcasts,
      TTS for quotes). `handleMouseEnter`/hover-speak removed.
- [ ] **No audio mixing:** Broadcast soundbites and TTS quotes are not blended in
      one rotation. (Design decision to confirm: e.g. broadcasts only play when a
      broadcast is the current message and are visually marked; the auto-rotation
      doesn't hop between a human clip and a synthetic voice mid-stream — or
      broadcasts get their own opt-in stream separate from the scripture/quote
      rotation.)
- [ ] **30s default pace:** `DEFAULT_QUOTE_PACE = 30` in `lib/quote-prefs.ts`;
      a user with a saved `agb_quotes_pace` still uses their value.
- [ ] **Next arrow:** A small, clean, animated arrow button on the bubble advances
      to the next message with the existing blur/slide transition; keyboard
      accessible (aria-label, focus-visible).

## Files to touch

```
components/dashboard/daily/quote-bubble.tsx   # remove hover-speak, add next arrow, separate audio handling
lib/quote-prefs.ts                            # DEFAULT_QUOTE_PACE 10 -> 30
```

## Suggested approach

1. Drop `onMouseEnter`/`handleMouseEnter` speech; keep single-click → speak,
   and move "advance to next" onto the new arrow button (retire double-click).
2. Decide + implement the audio-separation rule (see AC2 open decision) — confirm
   with the user whether broadcasts get their own stream or just never auto-chain
   into a TTS quote.
3. Bump `DEFAULT_QUOTE_PACE` to 30.
4. Add a small chevron/arrow button (lucide `ChevronRight`) at the trailing edge
   of the bubble: subtle by default, slides/fades on hover, advances on click.

## Out of scope

- Demon-mode broadcast content/settings (already shipped: per-line preview +
  in-loop toggles in Settings).
- The greeting audio + global mute (separate, shipped).

## Notes

Related shipped work this week: broadcasts now play original extracted audio
(`/broadcasts/*.mp3`, `audioSrc` on `Quote`); quotes-only TTS via
`/api/voice/quote` (now speaks the text only, no source); global mute
(`lib/audio-mute.ts`). AC2 ("don't mix") needs one product decision before build.
