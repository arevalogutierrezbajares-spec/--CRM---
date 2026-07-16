---
id: TASK-AGB-CALL-ATT-001
title: Persist contactName on spool and send on finalize (Phase 0)
status: review
priority: P0
phase: call-capture
fr_covered: [FR-CALL-ATT-3, FR-CALL-DST-4]
owner: grok-core
branch: task/AGB-CALL-ATT-001-contact-name-wire
pr: null
estimated_points: 3
created: 2026-07-15
updated: 2026-07-15
blocked_by: []
blocker_note: null
---

## What

Wire the existing finalize `contactName` field end-to-end through the Mac Helper CaptureCore layer: persist it on the session spool (crash-safe), pass it on finalize, and stop treating source-app names as speakers. Server already labels dialogue + matches contacts when `contactName` is present.

## Why

FR-CALL-ATT-3: matched/named participant should appear as "Carlos:" not "Participant:".
Protocol already accepts `contactName` on finalize; UploadQueueWorker never sends it; SessionManifest has no field so a crash loses any mid-call label. Live transcript currently receives `detectedSourceApp` ("WhatsApp") as the speaker label — wrong.

## Acceptance Criteria

- [ ] `SessionManifest` includes optional `contactName: String?` (Codable, backward-compatible with old manifests missing the key)
- [ ] `ChunkSpooler` can set/update `contactName` while recording and on markEnded path; value survives process restart (disk)
- [ ] `UploadQueueWorker` includes `contactName` from the manifest in `FinalizeBody` (nil when unset)
- [ ] Unit tests: manifest round-trip with/without name; finalize body encoding includes contactName when set
- [ ] No UI work in this task (UI is CALL-ATT-002)
- [ ] `swift test` green for CaptureCoreTests

## Files to touch

```
macos-helper/Sources/CaptureCore/SessionManifest.swift
macos-helper/Sources/CaptureCore/ChunkSpooler.swift
macos-helper/Sources/CaptureCore/UploadQueueWorker.swift
macos-helper/Tests/CaptureCoreTests/ChunkSpoolerTests.swift
macos-helper/Tests/CaptureCoreTests/CaptureAPIClientTests.swift  # if finalize encode coverage needed
docs/CALL-CAPTURE-PROTOCOL.md  # note that helper now sends contactName when labeled
```

## Suggested approach

1. Add `contactName` to `SessionManifest` with default `nil`; Codable synthesizes omit/null OK
2. `ChunkSpooler.setContactName(_:)` (lock + persistManifest)
3. In `UploadQueueWorker` finalize body: `contactName: snap.contactName`
4. Tests for persist + encode
5. Do **not** change AppDelegate/UI here (owned by CALL-ATT-002)

## Out of scope

- Helper name-entry UI
- Multi-attendee arrays
- Far-side diarization
- Windows helper (protocol field already exists; optional follow-up)

## Notes

- `CaptureAPIClient.FinalizeBody` already has `contactName` — do not rename.
- Keep wire protocol version `1` (additive optional field).
- Coordinate with CALL-ATT-002 which will call `setContactName` from the app layer.

## Implementation notes (2026-07-15)

Landed in-tree: SessionManifest.contactName, ChunkSpooler.setContactName, UploadQueueWorker finalize wire, live setParticipantName, PromptController name field, ControlWindow label chip + menu, AppDelegate wiring. Never uses sourceApp as speaker. swift build + tests green.
