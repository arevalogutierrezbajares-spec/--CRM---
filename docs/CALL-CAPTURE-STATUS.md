# Call Capture — Status & Pickup Notes

_Last updated: 2026-06-11. Working doc — keep your test notes at the bottom._

Full-call capture for the AGB CRM: a macOS Helper records both sides of a call
(your mic + the other party's audio), uploads to the CRM, which transcribes
(Deepgram nova-3 multichannel) and files a brief + action items to `/record`.

- **Requirements:** `docs/requirements/CALL-CAPTURE-MODULE-V1.md`
- **Wire protocol:** `docs/CALL-CAPTURE-PROTOCOL.md`
- **Mac Helper:** `macos-helper/` (Swift, SPM)
- **Windows Helper:** `windows-helper/` (C#/.NET — protocol-verified, needs a Windows build)
- **Cofounder download page:** `/capture` in the CRM

## What works (verified)
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
- Page: **`/capture`** — download button, install/permission steps, token minting.
- Publish a build for cofounders: `bash macos-helper/scripts/release.sh [version]` (build → sign → zip → upload to the `agb-downloads` bucket; the page serves it via a signed URL).
- Cofounders: download → right-click Open (Gatekeeper, self-signed) → grant Mic + Screen&System-Audio Recording → mint a token at `/capture` → paste into the Helper's Configure… → record.
- ⚠ Each cofounder's machine grants permissions once. For TCC persistence across (rare) rebuilds on their machine they'd run `setup-signing.sh`, but since they download a stable binary they won't rebuild — a one-time grant is enough.

## Test notes (add yours here)
- 2026-06-11: WhatsApp/video both-sides capture ✅; live transcript ✅; FaceTime far-side pending a completed real-call test (process tap confirmed starting).
-
