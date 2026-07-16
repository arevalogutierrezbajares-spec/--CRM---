# Multi-speaker diarization — free / local first

_Last updated: 2026-07-16 — D1–D3 implementation in progress_

## Goal

For **in-person meetings** (and multi-person far-side audio), produce transcripts like:

```text
[00:12] Room (SPEAKER_00): Let's start with the pipeline.
[00:18] Room (SPEAKER_01): We closed the term sheet last week.
[00:25] You: I'll send the follow-up today.
```

Prefer **$0 per minute**, **on-device / offline**, privacy-preserving. Deepgram remains optional fallback for calls (where dual-channel already gives free You vs them).

## What we already have (free)

| Mode | Attribution | Cost |
|------|-------------|------|
| **Call** (mic L + system R) | Side-based: You vs Participant — **no ML diarization needed** | Free (channel index) |
| **Meeting** (mic-only room) | Today: whole room as one stream | Free STT, **no multi-speaker** |
| Live (Apple `SFSpeechRecognizer`) | Live captions only | Free, **no diarization** |
| Post-call Deepgram multichannel | Side-based | Paid if used |

Multi-speaker **inside** one mixed mic stream is the gap (FR-CALL-ATT-4).

## Landscape (GitHub / X — 2026)

### Popular free / OSS stacks

| Project | What it is | Diarization | Fit for AGB helper |
|---------|------------|-------------|--------------------|
| **[Vibe](https://github.com/thewh1teagle/vibe)** (~7k★) | Offline desktop app: Whisper / Parakeet / Nemotron, **speaker diarization**, CLI, MIT | Yes | Best “productized” offline UX; can use as external worker or mirror its whisper.cpp approach |
| **[Meetily](https://github.com/Zackriya-Solutions/meetily)** (viral on X) | Local meeting assistant: Whisper/Parakeet live STT + diarization + Ollama summaries | Yes | Pattern reference; heavy to embed whole app |
| **[WhisperX](https://github.com/m-bain/whisperx)** | faster-whisper + alignment + **pyannote** diarization | Yes (best quality OSS) | Python worker; needs models + often HF token for pyannote |
| **[pyannote.audio](https://github.com/pyannote/pyannote-audio)** | SOTA speaker diarization toolkit | Diarize-only | Pair with Whisper / Apple STT |
| **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** | C++ Whisper, CoreML on Mac | STT only (unless external diarizer) | Best native Mac STT engine to shell out to |
| **[whisper-diarization](https://github.com/MahmoudAshraf97/whisper-diarization)** | Whisper + VAD + embeddings | Yes | Pipeline reference |
| **Apple SpeechAnalyzer / SpeechTranscriber** (WWDC 2025) | Fast on-device STT, free | **Not multi-speaker diarization** | Great for live captions; not a pyannote replacement |

### Takeaway

- **ASR ≠ diarization.** Whisper/Apple transcribe; **pyannote / WhisperX / Vibe** separate *who*.
- **Calls:** keep dual-channel (already free and more accurate than ML for two-party).
- **Meetings:** run **local diarize + STT** on mono mic (L channel).

## Recommended architecture for AGB

```
┌──────────────── Helper (Swift) ────────────────┐
│ Capture (call: L+R / meeting: L only)           │
│ Live: Apple on-device (cheap captions)           │
│ On stop → assemble mono WAV for meeting         │
└───────────────┬────────────────────────────────┘
                │ optional local path
                ▼
┌──────── Local worker (free) ───────────────────┐
│ Prefer: whisper.cpp (CoreML) + pyannote CLI     │
│   or: WhisperX one-shot script                  │
│   or: Vibe CLI if installed                     │
│ Out: JSON utterances [{speaker, start, end, text}]
└───────────────┬────────────────────────────────┘
                │ if local missing / fails
                ▼
┌──────── CRM finalize (existing) ───────────────┐
│ Call: Deepgram multichannel (optional paid)     │
│ Meeting: Deepgram diarize mono (optional paid)  │
│   OR skip cloud and keep helper-local transcript│
│ Claude filing + CRM rows                        │
└────────────────────────────────────────────────┘
```

### Provider priority (config)

1. **`local`** — free, offline (default for meetings when worker present)
2. **`apple`** — free STT only (live + simple mono; no multi-speaker)
3. **`deepgram`** — paid fallback (`diarize=true` on mono for meetings; multichannel for calls)

### Speaker model

```ts
type Utterance = {
  speaker: string;      // "founder" | "participant" | "SPEAKER_00" | "Room (Carlos)"
  channel: number;      // 0 = mic/room, 1 = system (calls)
  start: number;
  end: number;
  text: string;
  diarizationId?: string; // raw cluster id before human label map
};
```

Helper/CRM **speaker_map**: `SPEAKER_00 → "Carlos"` (manual label UI; later voice print).

## Phased delivery

### Phase D1 — Data model + mapping UI (small)

- Allow N speakers in `utterances` + `speaker_map` on recording
- Meeting label UI: map SPEAKER_00… to CRM contacts / free text
- Dialogue builder uses map

### Phase D2 — Local free worker (recommended core)

- `scripts/local-transcribe/` Python (or shell to whisper.cpp):
  - Input: mono 16 kHz WAV
  - Output: JSON matching `Utterance[]`
  - Backend: WhisperX if GPU/MLX available; else whisper.cpp + pyannote community pipeline
- Helper config: path to worker / auto-detect `vibe` CLI
- Meeting finalize: run worker **on Mac before upload**, attach transcript JSON to finalize body (new optional field `precomputedTranscript`) so CRM can skip Deepgram

### Phase D3 — Live multi-speaker (harder)

- Live remains Apple (single stream / dual channel)
- Post-call diarization is enough for CRM notes
- Optional: streaming pyannote is heavy — defer

### Phase D4 — Deepgram diarize fallback

- Only if `DEEPGRAM_API_KEY` set and local worker absent
- `diarize=true` on mono meeting audio
- Document cost

## Why not embed Meetily/Vibe whole?

They are full apps (Tauri/Electron + model downloads). AGB already owns capture + CRM filing. **Reuse their engines as workers**, not replace the helper.

## Why not Deepgram-first?

You asked for free / Apple / OSS. Dual-channel calls already beat diarization for 1:1. For meetings, local WhisperX/Vibe quality is competitive offline; Deepgram is a convenience fallback.

## Acceptance criteria (D2)

- [x] Helper meeting finalize path: mono assemble + LocalTranscribeRunner + `precomputedTranscript`
- [x] CRM skips Deepgram when precomputed utterances present (`lib/capture/finalize.ts`)
- [x] CRM dialogue + speaker map UI on `/record` (`rebuild-dialogue`, PATCH refile)
- [x] Call mode unchanged (channel attribution; local STT only on `CaptureKind.meeting`)
- [x] Configure panel: enable/backend/model/custom command + backend probe
- [ ] **Live verify:** In-person meeting → Stop → local worker produces ≥2 speaker IDs when two people talk (needs WhisperX install + real room)
- [ ] **Live verify:** Works offline with models pre-downloaded

## Open decisions

| ID | Question | Recommendation |
|----|----------|----------------|
| OD-D1 | Bundle models in helper vs download on first use? | First-use download (~1–3 GB) with progress UI |
| OD-D2 | Python worker vs pure Swift (FluidAudio / whisper.cpp) | Python WhisperX for D2 quality; migrate to whisper.cpp native later |
| OD-D3 | Require HF token for pyannote? | Prefer community pipeline / document free-tier HF |
| OD-D4 | Live multi-speaker? | Defer; post-call is enough for CRM |
