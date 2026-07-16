---
id: TASK-AGB-CALL-ATT-002
title: Label participant during call in Helper UI (Phase 1)
status: review
priority: P0
phase: call-capture
fr_covered: [FR-CALL-ATT-2, FR-CALL-ATT-3, FR-CALL-DST-2]
owner: grok-ui
branch: task/AGB-CALL-ATT-002-label-participant-ui
pr: null
estimated_points: 5
created: 2026-07-15
updated: 2026-07-15
blocked_by: [TASK-AGB-CALL-ATT-001]
blocker_note: Depends on CaptureCore setContactName + manifest field from CALL-ATT-001; implement against that API contract even if merging later.
---

## What

Add Mac Helper UI to name the far-side participant when a call is detected / being recorded. Persist via CaptureCore `setContactName`, drive live transcript labels (real person name, never source app), and ensure the name rides on finalize.

## Why

Without a name, CRM files as "Participant", live captions say "WhatsApp", and notes don't reflect who spoke. Browser live recorder already has "Attach to contact"; Helper must match for the primary capture path.

## Acceptance Criteria

- [ ] On call detected / start recording: compact way to enter participant name (text field on prompt and/or control window)
- [ ] During recording: show current label chip ("Talking with: Carlos" / "Unlabeled"); click/edit updates name without stopping capture
- [ ] `beginRecordingSession` / live engines receive the **person name**, never `detectedSourceApp`
- [ ] Live streamer + on-device transcriber support mid-call label update (new lines use new name)
- [ ] Name written to active spool via `ChunkSpooler.setContactName` (or equivalent from CALL-ATT-001)
- [ ] Manual start path can also set/edit name
- [ ] Empty/whitespace name → treat as unlabeled (nil), not " "
- [ ] App builds (`swift build`); no regression to Town Hall / capture core behavior

## Files to touch

```
macos-helper/Sources/AGBCaptureHelper/AppDelegate.swift
macos-helper/Sources/AGBCaptureHelper/PromptController.swift
macos-helper/Sources/AGBCaptureHelper/ControlWindow.swift
macos-helper/Sources/AGBCaptureHelper/LiveTranscriptStreamer.swift
macos-helper/Sources/AGBCaptureHelper/OnDeviceTranscriber.swift
macos-helper/Sources/AGBCaptureHelper/LiveTranscriptWindow.swift  # optional title/banner
macos-helper/Sources/CaptureCore/… only if CALL-ATT-001 API needs a thin adapter
```

## Suggested approach

1. Keep `participantName` as var (thread-safe) on streamers; `setParticipantName(_:)` for mid-call
2. PromptController: optional NSTextField "Who's on the call?" above Record/Dismiss
3. ControlWindow: subtitle or chip showing name; menu item or secondary click to edit (simple NSAlert / panel is fine for v1)
4. AppDelegate holds `activeParticipantName`; on affirm apply name → spool + beginRecordingSession(participant: name)
5. Never pass sourceApp into participantName

## Out of scope

- CRM contact typeahead / multi-attendee chips (Phase 2)
- Deepgram far-side diarization (Phase 3)
- Windows Helper UI
- Post-call re-file in web CRM

## Notes

**Contract from CALL-ATT-001 (assume present):**
```swift
// SessionManifest
var contactName: String?

// ChunkSpooler
func setContactName(_ name: String?) throws
// UploadQueueWorker already sends snap.contactName on finalize
```

If CALL-ATT-001 not merged in your worktree, implement the same API stubs in CaptureCore so UI compiles, or coordinate merge after core lands.

UX: keep non-blocking — founder can Record without naming; unlabeled still files.

## Implementation notes (2026-07-15)

Landed in-tree: SessionManifest.contactName, ChunkSpooler.setContactName, UploadQueueWorker finalize wire, live setParticipantName, PromptController name field, ControlWindow label chip + menu, AppDelegate wiring. Never uses sourceApp as speaker. swift build + tests green.
