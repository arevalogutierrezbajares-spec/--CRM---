---
id: TASK-AGB-CALL-ATT-003
title: Live transcript speaker label API (mid-call rename)
status: review
priority: P0
phase: call-capture
fr_covered: [FR-CALL-ATT-2, FR-CALL-ATT-3]
owner: grok-live
branch: task/AGB-CALL-ATT-003-live-label-api
pr: null
estimated_points: 2
created: 2026-07-15
updated: 2026-07-15
blocked_by: []
blocker_note: null
---

## What

Make live transcription engines support updating the far-side speaker label mid-call, and ensure labeling helpers never treat call source app as a person name.

## Why

Phase 1 UI will rename the participant during recording. Today `participantName` is `let` and fixed at init; new lines keep the wrong label if updated. Shared `label(forChannel:)` is the single place to keep consistent.

## Acceptance Criteria

- [ ] `LiveTranscriptStreamer`: `participantName` mutable; `setParticipantName(_: String?)` safe from main + queue
- [ ] `OnDeviceTranscriber`: same API
- [ ] Shared protocol/type if useful (`LiveTranscribing` already exists — extend it)
- [ ] Subsequent `onLine` emissions use the new label for channel 1
- [ ] Channel 0 remains "You" (or founder label if already parameterized — don't break)
- [ ] Empty string normalized to nil
- [ ] Unit tests if extractable pure functions; otherwise smoke via existing suites
- [ ] `swift test` / build green for touched targets

## Files to touch

```
macos-helper/Sources/AGBCaptureHelper/LiveTranscriptStreamer.swift
macos-helper/Sources/AGBCaptureHelper/OnDeviceTranscriber.swift
macos-helper/Sources/AGBCaptureHelper/AppDelegate.swift  # only if LiveTranscribing protocol lives there
# optional small test file under Tests/
```

## Suggested approach

1. Change `private let participantName` → private var + lock or serial queue mutation
2. Add to `LiveTranscribing` protocol: `func setParticipantName(_ name: String?)`
3. Normalize: trim; empty → nil
4. Do not touch UI chrome (CALL-ATT-002) or CaptureCore spool (CALL-ATT-001)

## Out of scope

- Spool/finalize
- Prompt UI
- Diarization

## Notes

Coordinate merge with CALL-ATT-002 which will call `setParticipantName` when user edits the name.

## Implementation notes (2026-07-15)

Landed in-tree: SessionManifest.contactName, ChunkSpooler.setContactName, UploadQueueWorker finalize wire, live setParticipantName, PromptController name field, ControlWindow label chip + menu, AppDelegate wiring. Never uses sourceApp as speaker. swift build + tests green.
