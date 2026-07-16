# AGB AI (macOS helper)

Menu-bar companion (**AGB AI**) that captures both sides of any call on the Mac — WhatsApp
desktop, Zoom, Meet in any browser, FaceTime, Continuity cellular — and streams
it to the AGB CRM for transcription and AI filing.

> Finder / Dock name: **AGB AI**. Internal binary remains `AGBCaptureHelper` (SPM product + bundle executable). Config lives under `~/Library/Application Support/AGBCaptureHelper/` so existing tokens and spools keep working.

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
  filling in memory. **The prompt persists for as long as the call is live**
  (the pre-roll ring keeps rolling in RAM, and the prompt shows how much is
  buffered) — affirm minutes in and the last 60 s are still included. It goes
  away on its own when the call ends unanswered; dismiss it and it stays away
  for the rest of *that* call (detection re-arms once the mic is released).
  Either way zero bytes are persisted. A safety cap (`maxRecordingSeconds`,
  10 min pre-14.4) bounds the tap absolutely.
- While the prompt is up, the always-visible control window's big button also
  turns into **● Record This Call** — two unmissable ways to say yes. The
  prompt sits at `.statusBar` window level (above other apps' floating call
  windows) and is laid out by `PanelLayout` directly below the control window,
  so the panels can never cover each other.
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
swift test             # unit tests (CaptureCore)
./make-app.sh          # release build wrapped into ./AGB\ AI.app
```

> Note: `Package.swift` depends on `swiftlang/swift-testing` (test-only). That
> is deliberate: on a machine with Command Line Tools but no Xcode, the
> toolchain ships no XCTest and does not wire its bundled Testing.framework
> into `swift test`, which would otherwise silently run zero tests. With the
> source dependency, plain `swift test` builds and runs everything anywhere.

## Setup

1. **Build the app bundle** — `./make-app.sh`. Run from the bundle
   (`open "AGB AI.app"`), not as a bare binary: TCC permissions attach
   to the bundle identity and the Info.plist carries
   `NSMicrophoneUsageDescription`.
2. **Mint a capture token** — CRM Settings → `/settings` → Capture → mint
   token. It is shown once (`agbcap_<64 hex>`); the server stores only its
   SHA-256. Revoking it there cuts the helper off instantly (NFR-CALL-SEC-2).
3. **Configure** — menu bar ○ → Configure… → CRM base URL + token, plus:
   - on-device live transcript (Apple)
   - keep audio local
   - **local free STT + diarization for meetings** (WhisperX / Vibe / whisper.cpp / custom command)
   Saved to `~/Library/Application Support/AGBCaptureHelper/config.json` (mode 0600).
   Then "Test Connection" should report workspace + retention days.
   See `scripts/local-transcribe/README.md` and `docs/LOCAL-DIARIZATION-PLAN.md`.
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
  "helperVersion": "1.0.0",
  "silenceAutoEndSeconds": 90,
  "maxRecordingSeconds": 7200,
  "liveTranscript": true,
  "liveTranscriptAutoShow": true
}
```

Env `AGB_CRM_URL` / `AGB_CRM_TOKEN` override the file (used by simulate mode
and CI). `neverPromptApps` suppresses the record prompt for named apps
(FR-CALL-TRG-6; app-name resolution requires macOS 14.4+).

**Auto-end tunables** (all optional; absent keys use these defaults, and
non-positive values fall back to the defaults so the safety net can't be
disabled by a footgun config):

| Key | Default | What it does |
|---|---|---|
| `silenceAutoEndSeconds` | `90` | Continuous near-silence on **both** channels for this long auto-finalizes the call as a normal end. The primary guard against runaway recordings when the OS mic-release signal never fires (e.g. WhatsApp holding the mic open after hangup). |
| `maxRecordingSeconds` | `7200` (2 h) | Hard ceiling — a single recording is auto-finalized after this many seconds no matter what, so nothing ever runs forever. Logged distinctly. |
| `liveTranscript` | `true` | Open a best-effort Deepgram live-transcript stream during recording and show it in a floating window. Purely additive; never affects capture or post-call filing. |
| `liveTranscriptAutoShow` | `true` | Auto-show the floating transcript window when a recording starts (only meaningful when `liveTranscript` is on). |

## Usage

| Menu item | What it does |
|---|---|
| ○ / ? / ● / ‖ / ↑ / ⚠ | idle / call detected / recording / paused / uploading / error — always visible (FR-CALL-RET-3) |
| ● Recording mm:ss — Stop | **shown only while capturing**: a bold red live item with the running elapsed time, always one click from finalizing the call |
| Start Recording | manual start, no detection needed (FR-CALL-TRG-4). Global hotkey: **⌘⇧R** toggles start/stop |
| Stop Recording | ends capture (≤1 s), flushes, finalizes + files hands-free |
| Pause / Resume | paused intervals are absent from the recording, not silence (FR-CALL-CAP-7) |
| Off the record: discard last 5 min | drops the un-uploaded tail from the local spool (FR-CALL-CAP-8 v1) |
| Show / Hide live transcript | toggles the floating live-transcript window (⌘⇧T) |
| Town Hall | expands the control panel into Town Hall (⌘⇧H) — feed, notifications, action items, files, notes, all in this one window |
| Test Connection | `GET /api/capture/ping` |
| Configure… | URL + token + never-prompt apps + local STT backend for meetings |
| Diagnostics | writes `~/Desktop/agb-capture-diagnostics.txt`: state, permissions, config (token masked), spool, last uploads, log tail (FR-CALL-OPS-6) |

### Call-end detection (three independent end conditions)

A recording finalizes on **any** of the following — so a call can never run away
even if one signal misbehaves:

1. **Process-object mic-release** (FR-CALL-TRG-5) — CoreAudio process objects
   (macOS 14.4+) notice when the *other* app releases the mic; 5 s of quiet
   auto-stops and files the call. Works only when the app actually releases the
   mic (some apps, e.g. WhatsApp, don't on hangup), and only on 14.4+.
2. **Silence-based auto-end** — if **both** channels stay near-silent
   continuously for `silenceAutoEndSeconds` (default 90 s), the call is treated
   as ended and auto-finalized as a *normal* end (`partial: false`). Any signal
   on either channel resets the timer. This is the catch-all for the WhatsApp
   "mic held open after hangup" runaway. Version-independent (no 14.4 needed).
3. **Hard max-duration cap** — `maxRecordingSeconds` (default 2 h) is an absolute
   ceiling; crossing it auto-finalizes so nothing ever runs forever. Logged
   distinctly from a silence end.

Silence and max-duration ends post a quiet macOS notification ("recording filed")
so you know it ended itself. Manual **Stop** (the live menu item, the Stop
Recording item, or ⌘⇧R) is always available and unmistakable.

### Live transcript (floating window)

When a recording starts, the helper opens a best-effort Deepgram streaming
WebSocket (`wss://api.deepgram.com/v1/listen`, `model=nova-3`, `language=multi`,
multichannel) using a short-lived token minted from
`POST /api/capture/live-token`, and shows a small, always-on-top, draggable
floating window with the running transcript — speaker-labeled (**You** = your
mic / **Participant** = system audio), newest at the bottom, autoscrolling, with
interim text shown greyed until finalized. It talks to Deepgram directly (no
Vercel WebSocket) and streams a **copy** of the same interleaved 16 kHz stereo
PCM the recorder spools.

This path is fully decoupled from capture: if the token request fails, the
socket drops, or Deepgram errors, the window shows a quiet "live transcript
unavailable" banner and **recording + post-call filing continue completely
unaffected**. Post-call filing (the CRM transcribing both channels and filing
the call) remains the source of truth; the live window is purely additive.
Toggle it with **Show/Hide live transcript** (⌘⇧T); auto-show and the whole
feature are configurable (`liveTranscript`, `liveTranscriptAutoShow`).

Logs: `os.log` subsystem `com.agb.capture-helper` + rotating plain-text file at
`~/Library/Application Support/AGBCaptureHelper/logs/helper.log`.

## Town Hall (expands in the same panel)

Beyond call capture, the AGB control panel **expands in place** into Town Hall —
press the `bubble.left.and.bubble.right` button on the control (or ⌘⇧H). The panel
animates from its top-right anchor into a workspace: a slim header (collapse,
monogram, live recording state, a compact record button, gear/transcript) above a
left **sidebar** of sections and a content area. There is no separate window — the
record control and the whole chief-of-staff surface live in the one panel. Click
the sidebar/collapse button to shrink back to the compact control.

| Section | What it does |
|---|---|
| **Feed** | Newest-first Town Hall posts (author, body, #project refs, 👍). Compose a message with an optional `#project` reference. |
| **Notifications** | Active inbox (unread + unsnoozed) with Open (deep-links into the CRM), Mark read, and Snooze (1h / tomorrow / next week). The toolbar item shows the unread count. |
| **Action Items** | Open items with a done checkbox; create one with title + optional project + due date + priority. |
| **Files** | Pick a project (line of business), browse its files (Open downloads via a signed URL), and upload by dropping files on the list **or** the Upload… picker. |
| **Notes** | Save a quick note — either a Town Hall note-post (lands in the feed) or attached to a project. |

A single background **poller** refreshes the feed + notifications every ~30 s and
posts native macOS banners for newly-arrived notifications (it primes silently on
the first poll so existing unread items don't all banner at launch, and uses each
notification's id as the banner identifier so the OS de-dupes across relaunches).
The poller starts on first open and runs for the app's lifetime, so banners arrive
even when the window is closed. Banner authorization is requested once; if denied,
the in-window Notifications list is the fallback.

It talks to the same `agbcap_` capture token over these capture-authed routes:
`GET /api/capture/{lobs,projects,members}`, `GET /api/capture/lobs/{id}/files`,
`POST /api/capture/files/{sign,finalize}` (3-step sign → raw PUT to Supabase →
finalize), `GET|POST /api/capture/posts`, `POST /api/capture/reactions`,
`POST /api/capture/notes`, `GET /api/capture/notifications` +
`PATCH /api/capture/notifications/{id}`, and `GET|POST /api/capture/action-items`
+ `PATCH /api/capture/action-items/{id}`.

> Native banners need the signed `.app` bundle (a valid bundle id). Under a bare
> `swift run` they no-op; the in-window list still works.

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
| Prompt missing right after dismissing one | by design: a dismissed prompt stays away for the rest of that call | use the control window's button or ⌘⇧R to start anyway; detection re-arms when the mic is released |
| "Microphone access is missing" | TCC denied | System Settings → Privacy & Security → **Microphone** → enable AGBCaptureHelper, restart helper (FR-CALL-OPS-2) |
| "Screen Recording access is missing" / participants' side silent | system-audio gate | System Settings → Privacy & Security → **Screen & System Audio Recording** → enable AGBCaptureHelper, restart helper |
| Works with headphones but not speakers? | usually permissions / silent R channel | **Headphones are not required.** Process tap + SCStream capture pre-device. Check log for `default output: … [speakers]` and `system(R) RMS` non-zero while the other person talks. Grant Screen & System Audio Recording. |
| Record an **in-person meeting** (no call app)? | meeting mode | Menu → **Start Meeting Recording…** (⌘M). Mic-only; only needs Microphone permission. Label room with **Label room…**. `sourceApp` = `In-Person Meeting`. |
| Meeting has one speaker / no SPEAKER_xx | no local STT or whisper.cpp-only | Install WhisperX (`scripts/local-transcribe/README.md`), enable local STT in Configure…, or map names on CRM `/record`. Without local STT, CRM may use Deepgram diarize if keyed. |
| Recording shows "Suspect audio: mic(L) NEAR-SILENT" | muted mic / wrong input device | check input device + mute state; server also flags at filing (FR-CALL-OPS-4) |
| ↑ stays on / "Upload retrying" | CRM unreachable | uploads retry forever with backoff and resume on reconnect (FR-CALL-TRX-2); check Test Connection |
| Call captured but cut at device switch | SCStream error mid-call | helper auto-restarts the stream and continues the same session (FR-CALL-CAP-5); check Diagnostics log tail if gaps exceed ~2 s |
| Helper crashed mid-call | — | relaunch: the spool is adopted, uploaded, and finalized as `partial: true` (FR-CALL-OPS-5); ≤30 s tail lost |
| TCC prompts name your terminal instead of the helper | running the bare binary | use `"AGB AI.app"` from `make-app.sh` |
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
