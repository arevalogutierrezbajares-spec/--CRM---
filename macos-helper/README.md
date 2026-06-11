# AGB Capture Helper (macOS)

Menu-bar companion that captures both sides of any call on the Mac — WhatsApp
desktop, Zoom, Meet in any browser, FaceTime, Continuity cellular — and streams
it to the AGB CRM for transcription and AI filing.

Implements the helper side of:

- `docs/CALL-CAPTURE-PROTOCOL.md` — wire contract (endpoints, WAV chunks, auth)
- `docs/requirements/CALL-CAPTURE-MODULE-V1.md` — FR contract (CAP/TRG/TRX/RET/OPS)

The helper is an ear; the CRM is the brain. It never touches the CRM database —
everything goes through the authenticated capture API.

## How it works

```
mic (AVAudioEngine) ──→ 16 kHz mono ──┐
                                      ├─ interleave L=mic R=system ─→ 60 s pre-roll ring (RAM only)
system audio (ScreenCaptureKit) ─→ 16 kHz mono ──┘                  └→ ChunkSpooler (30 s WAV chunks on disk, 0600)
                                                                          └→ UploadQueueWorker
                                                                               createSession → PUT chunks (in order) → finalize
```

- An app opens the microphone → CoreAudio detector fires → floating prompt
  "Call detected (WhatsApp). Record?" while the pre-roll buffer is already
  filling in memory. Affirm and nothing is lost; dismiss (or 60 s timeout) and
  zero bytes are persisted.
- Chunks upload **during** the call; a crash loses at most the un-chunked tail
  (≤30 s). Spool + manifest survive restart; uploads resume automatically and
  in order, with 1→60 s exponential backoff while offline.
- On finalize the CRM transcribes both channels, files the call (title, brief,
  action items, contact match) and the helper deletes the local spool.

## Build

Requires Swift 6.x on macOS 14+. No Xcode project — pure SwiftPM:

```bash
cd macos-helper
swift build            # debug binary at .build/debug/AGBCaptureHelper
swift test             # 59 unit tests (CaptureCore)
./make-app.sh          # release build wrapped into ./AGBCaptureHelper.app
```

> Note: `Package.swift` depends on `swiftlang/swift-testing` (test-only). That
> is deliberate: on a machine with Command Line Tools but no Xcode, the
> toolchain ships no XCTest and does not wire its bundled Testing.framework
> into `swift test`, which would otherwise silently run zero tests. With the
> source dependency, plain `swift test` builds and runs everything anywhere.

## Setup

1. **Build the app bundle** — `./make-app.sh`. Run the helper from the bundle
   (`open AGBCaptureHelper.app`), not as a bare binary: TCC permissions attach
   to the bundle identity and the Info.plist carries
   `NSMicrophoneUsageDescription`.
2. **Mint a capture token** — CRM Settings → `/settings` → Capture → mint
   token. It is shown once (`agbcap_<64 hex>`); the server stores only its
   SHA-256. Revoking it there cuts the helper off instantly (NFR-CALL-SEC-2).
3. **Configure** — menu bar ○ → Configure… → CRM base URL + token. Saved to
   `~/Library/Application Support/AGBCaptureHelper/config.json` (mode 0600).
   Then "Test Connection" should report workspace + retention days.
4. **Grant permissions** (FR-CALL-OPS-2) — the helper requests both on first
   capture and tells you exactly what is missing:
   - **Microphone** — System Settings → Privacy & Security → Microphone →
     enable AGBCaptureHelper (your side of the call).
   - **Screen Recording** — System Settings → Privacy & Security → Screen &
     System Audio Recording → enable AGBCaptureHelper (macOS gates *system
     audio* capture behind this; it is how we hear the participants). Restart
     the helper after granting.
5. **Launch at login** (FR-CALL-OPS-1) — `./make-app.sh --install-login`
   (uses `SMAppService`; manage under System Settings → General → Login Items).

### config.json

```json
{
  "crmBaseUrl": "https://x.caneycloud.com",
  "token": "agbcap_…",
  "retentionNote": "participant informed verbally",
  "neverPromptApps": ["Dictation", "SuperWhisper"],
  "helperVersion": "1.0.0"
}
```

Env `AGB_CRM_URL` / `AGB_CRM_TOKEN` override the file (used by simulate mode
and CI). `neverPromptApps` suppresses the record prompt for named apps
(FR-CALL-TRG-6; app-name resolution requires macOS 14.4+).

## Usage

| Menu item | What it does |
|---|---|
| ○ / ? / ● / ‖ / ↑ / ⚠ | idle / call detected / recording / paused / uploading / error — always visible (FR-CALL-RET-3) |
| Start Recording | manual start, no detection needed (FR-CALL-TRG-4). Global hotkey: **⌘⇧R** toggles start/stop |
| Stop Recording | ends capture (≤1 s), flushes, finalizes + files hands-free |
| Pause / Resume | paused intervals are absent from the recording, not silence (FR-CALL-CAP-7) |
| Off the record: discard last 5 min | drops the un-uploaded tail from the local spool (FR-CALL-CAP-8 v1) |
| Test Connection | `GET /api/capture/ping` |
| Configure… | URL + token + never-prompt apps |
| Diagnostics | writes `~/Desktop/agb-capture-diagnostics.txt`: state, permissions, config (token masked), spool, last uploads, log tail (FR-CALL-OPS-6) |

Call-end auto-detection (FR-CALL-TRG-5) uses CoreAudio process objects
(macOS 14.4+) to notice when the *other* app releases the mic — 5 s of quiet
auto-stops and files the call. On 14.0–14.3, stop manually (⌘⇧R or menu).

Logs: `os.log` subsystem `com.agb.capture-helper` + rotating plain-text file at
`~/Library/Application Support/AGBCaptureHelper/logs/helper.log`.

## Simulate mode (headless E2E)

Pushes a pre-recorded WAV through the exact production path (spool → session →
chunk PUTs → finalize) against the configured CRM. No menu bar, no TCC
permissions needed.

```bash
# Input must be 16 kHz, stereo (L = founder, R = participants), PCM16:
ffmpeg -i call.m4a -ar 16000 -ac 2 -c:a pcm_s16le call16k.wav

export AGB_CRM_URL=https://x.caneycloud.com
export AGB_CRM_TOKEN=agbcap_…

.build/debug/AGBCaptureHelper --simulate call16k.wav                 # full flow; prints finalize JSON; exit 0/1
.build/debug/AGBCaptureHelper --simulate call16k.wav --chunk-secs 5  # smaller chunks
.build/debug/AGBCaptureHelper --simulate call16k.wav --source-app SimApp
.build/debug/AGBCaptureHelper --simulate call16k.wav --simulate-crash-after 2
    # uploads 2 chunks then exits 2 WITHOUT finalize — spool stays on disk;
    # tests the server-side salvage sweep; any later run (or the menu-bar
    # helper) resumes and finalizes it
.build/debug/AGBCaptureHelper --simulate call16k.wav --abandon
    # createSession → 2 chunks → DELETE session (decline-after-start path)
```

### Local mock CRM

`scripts/mock-crm.py` implements the whole protocol in-memory for development:

```bash
python3 scripts/mock-crm.py --port 8899 &          # optionally: --drop-seq 1 to force a 409
AGB_CRM_URL=http://127.0.0.1:8899 AGB_CRM_TOKEN=agbcap_test \
  .build/debug/AGBCaptureHelper --simulate call16k.wav
```

## Troubleshooting (symptom → fix)

| Symptom | Cause | Fix |
|---|---|---|
| Menu shows ⚠ "401 — capture token invalid or revoked" | token revoked/rotated | mint a new token in CRM Settings → `/settings`, paste into Configure… |
| Prompt never appears on calls | helper not running, or detector disarmed | check menu bar for ○; relaunch; reboot test (login item) |
| "Microphone access is missing" | TCC denied | System Settings → Privacy & Security → **Microphone** → enable AGBCaptureHelper, restart helper (FR-CALL-OPS-2) |
| "Screen Recording access is missing" / participants' side silent | system-audio gate | System Settings → Privacy & Security → **Screen & System Audio Recording** → enable AGBCaptureHelper, restart helper |
| Recording shows "Suspect audio: mic(L) NEAR-SILENT" | muted mic / wrong input device | check input device + mute state; server also flags at filing (FR-CALL-OPS-4) |
| ↑ stays on / "Upload retrying" | CRM unreachable | uploads retry forever with backoff and resume on reconnect (FR-CALL-TRX-2); check Test Connection |
| Call captured but cut at device switch | SCStream error mid-call | helper auto-restarts the stream and continues the same session (FR-CALL-CAP-5); check Diagnostics log tail if gaps exceed ~2 s |
| Helper crashed mid-call | — | relaunch: the spool is adopted, uploaded, and finalized as `partial: true` (FR-CALL-OPS-5); ≤30 s tail lost |
| TCC prompts name your terminal instead of the helper | running the bare binary | use `AGBCaptureHelper.app` from `make-app.sh` |
| No call-end auto-stop | macOS < 14.4 | per-process mic state needs 14.4+; stop manually (⌘⇧R) |

## Privacy posture

- Pre-roll lives only in RAM; declined/timed-out prompts persist **zero bytes**
  (FR-CALL-TRG-7, NFR-CALL-PRIV-2).
- Spool files 0600, dirs 0700, deleted after confirmed upload (NFR-CALL-SEC-1).
- Recording state is always visible in the menu bar (FR-CALL-RET-3).
- The token is founder-scoped and revocable server-side. Storing it in the
  Keychain instead of config.json is a v1.1 hardening candidate.

## Known v1 limits

- Off-the-record drops only the **un-uploaded** tail (protocol allows
  overwrite-based redaction of uploaded seqs in a later version).
- Self-update (FR-CALL-OPS-7, SHOULD) not implemented — rebuild + relaunch.
- Source-app naming and call-end detection need macOS 14.4+; below that the
  prompt shows no app name and stop is manual.
- Ad-hoc codesigning (OD-3: local single-user build); notarize before
  distributing to anyone else.
