# AGB Capture Helper (Windows)

A Windows tray companion that captures both sides of any call on the PC —
WhatsApp desktop, Zoom, Teams, Meet in any browser — and streams it to the AGB
CRM for transcription and AI filing.

It is a feature-for-feature port of the proven macOS Capture Helper
(`../macos-helper`). It speaks the **same wire protocol** (`../docs/CALL-CAPTURE-PROTOCOL.md`),
so the CRM needs **zero changes** — this is just another protocol client.

> ## ⚠️ BUILT BUT UNVERIFIED ON THIS MACHINE — needs a Windows build/run
>
> This project was authored on macOS, which has **no .NET SDK and no Windows
> audio stack**. It was therefore **never compiled, never run, and never tested
> here.** WASAPI / NAudio / WinForms are Windows-only.
>
> - The **portable logic** (`CaptureCore`) is OS-agnostic and is covered by an
>   xUnit suite (`CaptureCore.Tests`) that *would* run on any OS with the .NET 8
>   SDK — but it has **not** been executed in this environment (no SDK present).
>   Its correctness here is by 1:1 port from the Swift original + by-hand review.
> - The **OS glue** (`AGBCaptureHelper`: WASAPI capture, mic-session detection,
>   tray UI, hotkey, autostart) is **untestable off Windows** and entirely
>   unverified.
>
> **Before relying on it: open in Visual Studio 2022 (or `dotnet`) on Windows 10
> 2004+ and run `dotnet build`, `dotnet test`, and the simulate-mode E2E below.**
> Treat the first Windows run as a bring-up, not a regression check.

## What is and isn't proven

| Part | Project | Status |
|---|---|---|
| WAV codec, ring buffer, interleaver, silence meter, spool, manifest, API client, upload worker, config | `CaptureCore` | **Pure logic, tested-on-paper** (ported 1:1 from the Swift `CaptureCore`; xUnit tests written, **not executed here**) |
| WASAPI mic + loopback capture, 48k→16k resample, mic-session detection, tray icon/menu, record prompt, Configure dialog, hotkey, autostart | `AGBCaptureHelper` | **OS glue, untestable here** — needs a Windows build/run |
| `--simulate` headless E2E (no audio, no TCC) | `AGBCaptureHelper` | Pure-logic path; **runnable on a real Windows box** against the CRM or the bundled mock |

## Architecture (mirrors the macOS helper)

```
mic (WASAPI WasapiCapture) ──→ 16 kHz mono ──┐
                                             ├─ interleave L=mic R=system ─→ 60 s pre-roll ring (RAM only)
system audio (WASAPI loopback) ─→ 16 kHz mono ┘                            └→ ChunkSpooler (30 s WAV chunks on disk)
                                                                                 └→ UploadQueueWorker
                                                                                      createSession → PUT chunks (in order) → finalize
```

- **`CaptureCore`** (`net8.0`, no Windows deps): `RingBuffer`, `WavCodec`,
  `StereoInterleaver`, `SilenceMeter`, `ChunkSpooler`, `SpoolStore`,
  `SessionManifest`, `HelperConfig`, `CaptureApiClient`, `UploadQueueWorker`,
  `ExponentialBackoff`, `HelperLog`, `HelperPaths`. Byte-for-byte protocol
  compatibility: 16 kHz, 2 ch, PCM16 LE, **L = mic, R = system**, canonical
  44-byte WAV header, `Bearer agbcap_…` auth, `X-Capture-Protocol: 1`.
- **`AGBCaptureHelper`** (`net8.0-windows`, WinExe): the tray shell + WASAPI glue.
- **`CaptureCore.Tests`** (`net8.0`, xUnit): the portable-logic test suite.

## Prerequisites

- **Windows 10 version 2004 (build 19041) or newer**, or Windows 11. (v1 uses
  endpoint loopback, which works on any WASAPI-capable Win10; 2004+ is required
  for the per-process-loopback fast-follow noted below.)
- **.NET 8 SDK** — https://dotnet.microsoft.com/download/dotnet/8.0
- Visual Studio 2022 (17.8+) with the **.NET desktop development** workload is
  the easy path; the CLI works too.

## Build, test, run

From `windows-helper\` on Windows:

```powershell
dotnet build                      # builds all three projects (verifies the C#)
dotnet test                       # runs CaptureCore.Tests (xUnit)
dotnet run --project AGBCaptureHelper    # launches the tray app
```

Or open `AGBCaptureHelper.sln` in Visual Studio and press F5.

> `CaptureCore` and `CaptureCore.Tests` are plain `net8.0` and will also
> `dotnet build` / `dotnet test` on macOS or Linux — that is the seam that keeps
> the core logic testable off Windows. `AGBCaptureHelper` targets
> `net8.0-windows` and only builds on Windows.

NAudio is pinned to **2.2.1** in `AGBCaptureHelper/AGBCaptureHelper.csproj`.

## Setup (configure + token)

1. **Mint a capture token** — in the CRM, **Settings → Call capture → mint
   token**. It is shown once (`agbcap_<64 hex>`); the server stores only its
   SHA-256. Revoking it there cuts the helper off instantly.
2. **Configure** — tray icon → **Configure…** → CRM base URL
   (e.g. `https://x.caneycloud.com`) + the token. Saved to
   `%LOCALAPPDATA%\AGBCaptureHelper\config.json` with a current-user-only ACL.
3. **Test Connection** — tray → **Test Connection**; it should report the
   workspace + audio-retention days (`GET /api/capture/ping`).

`config.json`:

```json
{
  "crmBaseUrl": "https://x.caneycloud.com",
  "token": "agbcap_…",
  "retentionNote": "participant informed verbally",
  "neverPromptApps": ["Dictation", "SuperWhisper"],
  "helperVersion": "1.0.0"
}
```

Env vars `AGB_CRM_URL` / `AGB_CRM_TOKEN` override the file (used by simulate
mode and CI). `neverPromptApps` suppresses the record prompt for the named
processes.

### Windows microphone-privacy permission

Windows gates microphone access for desktop apps. If capture won't start:

- **Settings → Privacy & security → Microphone** → turn on **Microphone access**
  *and* **Let desktop apps access your microphone**, then relaunch the helper.

System audio is captured via WASAPI **loopback** on the render endpoint (what you
hear) and needs no special permission. There is **no** Windows equivalent of the
macOS Screen-Recording gate for loopback.

### Autostart (launch at login)

- Tray → **Launch at login** toggles it, or from a terminal:
  ```powershell
  AGBCaptureHelper.exe --install-login     # add
  AGBCaptureHelper.exe --uninstall-login   # remove
  ```
- Implemented via the per-user Run key
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (no admin; also visible
  under Task Manager → Startup).

## Usage

| Tray item | What it does |
|---|---|
| ○ / ? / ● / ‖ / ↑ / ⚠ glyph | idle / call detected / recording (with elapsed time) / paused / uploading / error — always visible |
| Start Recording | manual start, no detection needed. Global hotkey: **Ctrl+Shift+R** toggles start/stop (skipped silently if the chord is already taken) |
| Stop Recording | ends capture, flushes, finalizes + files hands-free |
| Pause / Resume | paused intervals are absent from the recording, not silence |
| Off the record: discard last 5 min | drops the un-uploaded tail from the local spool |
| Test Connection | `GET /api/capture/ping` |
| Configure… | CRM URL + token + never-prompt apps |
| Diagnostics | writes `Desktop\agb-capture-diagnostics.txt`: state, end-conditions, config (token masked), spool, last uploads, log tail |

**Call detection.** When another process opens the default capture device (polled
via WASAPI `IAudioSessionManager2` sessions, 2 s debounce), a small **topmost,
non-activating** prompt appears bottom-right: *"Call detected (WhatsApp). Record?
[Record] [Dismiss]"*. Pre-roll is already buffering in RAM, so affirming 20 s in
loses nothing. **60 s with no answer → not recording, pre-roll dropped, zero
bytes persisted.**

**End conditions** (mirroring the macOS fix; all configurable in
`AppController.EndConditions`):
- **mic release** — when the *other* app stops capturing for 5 s, auto-stop + file;
- **sustained both-channel silence** — default **90 s** of silence on mic *and*
  system → auto-stop;
- **hard max-duration cap** — default **2 h** → auto-stop.

Logs + rotating file live under `%LOCALAPPDATA%\AGBCaptureHelper\logs\helper.log`.

## Simulate mode (headless E2E) — runnable on Windows without audio

Pushes a pre-recorded **16 kHz, stereo (L = founder, R = participants), PCM16**
WAV through the exact production path (spool → session → chunk PUTs → finalize)
against the configured CRM. No tray, no WASAPI, no mic-privacy permission — so it
**can be run on a real Windows box** to prove the protocol end-to-end.

```powershell
# Make a valid test WAV without ffmpeg (3 chunks at 65 s):
python scripts\make-test-wav.py test16k.wav --seconds 65
# …or convert a real call: ffmpeg -i call.m4a -ar 16000 -ac 2 -c:a pcm_s16le test16k.wav

$env:AGB_CRM_URL = "https://x.caneycloud.com"
$env:AGB_CRM_TOKEN = "agbcap_…"

dotnet run --project AGBCaptureHelper -- --simulate test16k.wav                  # full flow; prints finalize JSON; exit 0/1
dotnet run --project AGBCaptureHelper -- --simulate test16k.wav --chunk-secs 5   # smaller chunks
dotnet run --project AGBCaptureHelper -- --simulate test16k.wav --source-app SimApp
dotnet run --project AGBCaptureHelper -- --simulate test16k.wav --simulate-crash-after 2
    # uploads 2 chunks then exits 2 WITHOUT finalize — spool stays on disk;
    # any later run (or the tray helper) resumes and finalizes it
dotnet run --project AGBCaptureHelper -- --simulate test16k.wav --abandon
    # createSession → 2 chunks → DELETE session (decline-after-start path)
```

Exit codes: `0` success, `1` failure, `2` simulated crash.

### Local mock CRM (no real CRM needed)

`scripts\mock-crm.py` implements the whole protocol in-memory (copied verbatim
from the macOS helper — same protocol, OS-agnostic Python):

```powershell
python scripts\mock-crm.py --port 8899        # optionally --drop-seq 1 to force a 409
$env:AGB_CRM_URL = "http://127.0.0.1:8899"
$env:AGB_CRM_TOKEN = "agbcap_test"
dotnet run --project AGBCaptureHelper -- --simulate test16k.wav
```

This is the recommended **first** thing to run on Windows: it exercises
createSession → ordered chunk PUTs → 409 missing-chunk recovery → finalize with
zero external dependencies.

## Per-process loopback (documented fast-follow — NOT in v1)

v1 system-audio capture uses **endpoint loopback**
(`NAudio.CoreAudioApi.WasapiLoopbackCapture`), which grabs the **entire system
render mix** — every app you can hear, not just the call app. The brief accepts
this for v1. See the `TODO` in `AGBCaptureHelper/Audio/AudioEngine.cs`.

The targeted version (Win10 2004+) should capture only the call app's audio via
**process loopback**:

- `ActivateAudioInterfaceAsync` with `AUDIOCLIENT_ACTIVATION_PARAMS`
  (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`,
  `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`) and the target PID — the
  same PID `MicActivityDetector` already resolves for the source-app name.
- This is a raw COM/WASAPI call (NAudio 2.2.1 does not wrap it); it would live
  behind the same `MonoResampler` → `StereoInterleaver` seam, so only
  `AudioEngine.StartSystemCapture` changes. The interleaver, spooler, uploader,
  and protocol are unaffected.

## Other known v1 limits

- Off-the-record drops only the **un-uploaded** tail (the protocol allows
  overwrite-based redaction of uploaded seqs in a later version).
- File ACL hardening (the analogue of macOS `0600`/`0700`) is best-effort on
  Windows and a no-op off Windows; the per-user `%LOCALAPPDATA%` root is the
  primary barrier. Storing the token in the Windows Credential Manager instead of
  `config.json` is a hardening candidate.
- No code signing — sign + (optionally) MSIX-package before distributing to
  anyone else.
- The tray glyph is rendered at runtime (no shipped `.ico`); swap in a real icon
  asset for production polish.

## Mapping to the macOS helper (for reviewers)

| macOS (Swift) | Windows (C#) |
|---|---|
| `CaptureCore/*.swift` | `CaptureCore/*.cs` (1:1) |
| `AudioEngine.swift` (AVAudioEngine + ScreenCaptureKit) | `Audio/AudioEngine.cs` (WASAPI capture + loopback) + `Audio/MonoResampler.cs` |
| `MicActivityDetector.swift` (CoreAudio process objects) | `Audio/MicActivityDetector.cs` (WASAPI audio sessions) |
| `PromptController.swift` (NSPanel) | `UI/PromptController.cs` + `UI/RecordPromptForm.cs` |
| `ConfigurePanel.swift` | `UI/ConfigureForm.cs` |
| `AppDelegate.swift` (NSStatusItem) | `AppController.cs` (NotifyIcon) |
| `GlobalHotKey.swift` (Carbon) | `Platform/GlobalHotKey.cs` (RegisterHotKey) |
| `main.swift` + `SMAppService` | `Program.cs` + `Platform/Autostart.cs` |
| `SimulatedEngine.swift` | `SimulatedEngine.cs` |
| `Tests/CaptureCoreTests/*.swift` | `CaptureCore.Tests/*.cs` |
```
