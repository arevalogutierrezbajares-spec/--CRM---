# Call Capture — Status & Pickup Notes

_Last updated: 2026-07-16. Working doc — keep your test notes at the bottom._

Full-call capture for the AGB CRM: a macOS Helper records both sides of a call
(your mic + the other party's audio), uploads to the CRM, which transcribes
(Deepgram nova-3 multichannel) and files a brief + action items to `/record`.

- **Requirements:** `docs/requirements/CALL-CAPTURE-MODULE-V1.md`
- **Wire protocol:** `docs/CALL-CAPTURE-PROTOCOL.md`
- **Mac Helper:** `macos-helper/` (Swift, SPM)
- **Windows Helper:** `windows-helper/` (C#/.NET — protocol-verified, needs a Windows build)
- **Cofounder download page:** `/capture` in the CRM
- **Local free STT / multi-speaker:** `docs/LOCAL-DIARIZATION-PLAN.md` + `scripts/local-transcribe/`

## What works (verified)
- ✅ **In-person meeting mode (2026-07-15)** — menu **Start Meeting Recording…** (⌘M): mic-only room capture, no system-audio permission required, live labels as `Room` / `Room (name)`, CRM `sourceApp=In-Person Meeting`, no false `participant_channel_silent` flag.
- ✅ **Multi-speaker D1–D3 (2026-07-16, code complete — live verify pending)** — meetings assemble mono L-channel WAV → optional local WhisperX/Vibe/whisper.cpp → `precomputedTranscript` on finalize (skips Deepgram). CRM stores `speaker_map` + `transcript_engine`; `/record` maps `SPEAKER_00…` → names and can re-file brief. Configure panel exposes local STT backend. Migration `0025_speaker_map.sql`.
- ✅ **Capture both sides with headphones** — proven on real calls (WhatsApp/Zoom/Meet): both channels transcribed, attributed (You vs the contact), filed with an AI brief + action items.
- ✅ **Post-call transcript + brief + action items + contact match** → `/record`.
- ✅ **Live transcript window** — streams during the call (Deepgram WS, fixed auth + deadlock; verified 17 live captions, connection holds).
- ✅ **Auto-end** — silence (90s) / 2h cap / mic-release; bold "● Recording — Stop" menu + always-visible floating control window.
- ✅ **Long calls** — transcribed from bytes (decoupled from storage); audio stored best-effort (skipped if over the 50MB object limit, transcript always saved).
- ✅ **Permanent permissions** — Helper is signed with a stable self-signed cert (`macos-helper/scripts/setup-signing.sh`), so rebuilds keep the macOS grant. Proven: rebuilt with a major change, grant persisted.
- ✅ **Deployed to prod** (x.caneycloud.com): migration `0020`, all `/api/capture/*` routes, the live-token + download routes.

## Known issues / pending
1. **FaceTime far-side capture — fix built, UNVERIFIED on a real call.** ScreenCaptureKit can't see FaceTime's audio (it uses macOS "communication" mode, off the captured output mix). Fix shipped: a **Core Audio process tap** (`macos-helper/Sources/AGBCaptureHelper/ProcessAudioTap.swift`, macOS 14.4+) captures the call app's audio directly. The log confirmed the tap STARTS (`system-audio via process-tap (FaceTime-capable)`, 48kHz×2ch), but the last test attempts the prompt timed out / was dismissed before a real FaceTime recording completed. **TO VERIFY:** make a FaceTime call, click the floating **● Start Recording** (not the popup — the floating button), have the other person talk, **■ Stop**, then check the `system(R) RMS` in `~/Library/Application Support/AGBCaptureHelper/logs/helper.log` is non-zero.
2. **Flaky network** — `bad MAC` / SSL errors corrupt TLS on this machine's network (also broke `git push` and uploads). Environmental (VPN/proxy/Wi-Fi), not the tool. Audio is safe on disk and uploads when the connection steadies. Worth fixing the network for smooth use.
3. **Auto-end for FaceTime/WhatsApp** — these keep the mic open after hangup, so end isn't auto-detected; the 90s-silence backstop or **clicking Stop** finalizes. Habit: click Stop when you hang up.
4. **Windows Helper** — `dotnet build` on a Windows 10+ box to verify the OS-glue (WASAPI/tray); CaptureCore (protocol) passes 61 tests on Mac.

## How to pick up / iterate
```bash
# Build + test the Mac Helper
cd ~/AGB-CRM/macos-helper && swift build && swift test

# Rebuild the .app (signed, grant survives) + relaunch
./make-app.sh && open AGBCaptureHelper.app          # quit first: pkill -f AGBCaptureHelper.app/Contents/MacOS

# Watch what the Helper is doing
tail -f "$HOME/Library/Application Support/AGBCaptureHelper/logs/helper.log"

# Headless E2E of the whole pipeline (real Deepgram + Claude) against the local stack
cd ~/AGB-CRM && bash scripts/e2e/make-call-audio.sh /tmp/call.wav   # synth bilingual stereo call
# (then: test DB up + dev server pinned to it, then) npx tsx scripts/e2e/capture-e2e.ts
```
Key Mac Helper files: `AudioEngine.swift` (capture: L=mic AVAudioEngine, R=ProcessAudioTap→SCStream fallback), `ProcessAudioTap.swift` (FaceTime fix), `LiveTranscriptStreamer.swift` (live captions), `CallEndMonitor.swift` (auto-end), `ControlWindow.swift` (floating button), `CaptureAPIClient.swift` + `UploadQueueWorker.swift` (upload). CRM: `lib/capture/*`, `app/api/capture/*`.

## Cofounder distribution
- Page: **Settings → Configurations → Call Capture** — download button, install/permission steps, token minting. (Old `/capture` route retired into Settings.)
- Product name: **AGB AI.app** (download file `AGB-AI.zip`). Binary id stays `com.agb.capture-helper` / `AGBCaptureHelper` for TCC continuity.
- Publish a build for cofounders: `bash macos-helper/scripts/release.sh [version]` (build → sign → zip → upload to the `agb-downloads` bucket; the page serves it via a signed URL).
- **Current published:** `1.1.0` (2026-07-16) — AGB AI rebrand, icon, intro cinema, `LSUIElement`, meeting multi-speaker path. Replaced stale `2026.06.11` `AGBCaptureHelper` zip that cofounders were still downloading.
- Cofounders: download → unzip **AGB AI.app** → Applications → right-click Open (Gatekeeper, self-signed) → grant Mic + Screen&System-Audio Recording → mint a token in Settings → Call Capture → paste into Configure… → record.
- ⚠ Each cofounder's machine grants permissions once. For TCC persistence across (rare) rebuilds on their machine they'd run `setup-signing.sh`, but since they download a stable binary they won't rebuild — a one-time grant is enough.
- ⚠ **Upload SSL flakiness** on some networks (`bad MAC` / "secure connection cannot be made") — environmental; audio stays on disk and retries. Not a download-bucket issue.

## Test notes (add yours here)
- 2026-06-11: WhatsApp/video both-sides capture ✅; live transcript ✅; FaceTime far-side pending a completed real-call test (process tap confirmed starting).
-
