# Local free transcription + diarization

Post-call worker for **in-person meetings** (and optional call re-transcribe).
Runs **offline** on your Mac — no Deepgram required when this succeeds.

## Recommended stacks (same ones viral on X / GitHub)

| Stack | Command flavor | Notes |
|-------|----------------|-------|
| **[WhisperX](https://github.com/m-bain/whisperx)** | `pip install whisperx` | Best OSS quality: faster-whisper + pyannote diarization |
| **[Vibe](https://github.com/thewh1teagle/vibe)** | Desktop app + CLI | Whisper/Parakeet + diarization, MIT, fully offline |
| **[Meetily](https://github.com/Zackriya-Solutions/meetily)** | Full meeting app | Pattern reference; use if you want a separate UI |
| **whisper.cpp** | CoreML on Apple Silicon | Fast STT; pair with pyannote for diarization |
| **Apple Speech** | Built into helper live captions | Free live STT — **not** multi-speaker diarization |

## Quick start (WhisperX)

```bash
# One-time (Apple Silicon: use a venv)
cd ~/AGB-CRM/scripts/local-transcribe
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install whisperx

# Hugging Face token may be required for pyannote models:
#   export HF_TOKEN=hf_...
#   huggingface-cli login

# Transcribe a mono or stereo WAV → JSON utterances
./transcribe.py /path/to/meeting.wav -o /tmp/out.json
```

Output shape (matches CRM `Utterance[]`):

```json
{
  "language": "en",
  "utterances": [
    { "speaker": "SPEAKER_00", "channel": 0, "start": 1.2, "end": 3.4, "text": "Hello", "diarizationId": "SPEAKER_00" }
  ]
}
```

## Wire into AGB Capture Helper

1. In helper config (or env) set:

```json
{
  "localTranscribeCommand": "/Users/tomas/AGB-CRM/scripts/local-transcribe/transcribe.py"
}
```

2. For **meeting** recordings, the helper can assemble mono L and run this
   command before finalize (when implemented in the helper upload path).
   Until then, run manually on `~/Documents/AGB Call Recordings/*.wav` and
   paste speakers into CRM label map.

## When Deepgram is still used

- **Calls** with dual channel: free attribution without diarization.
- **Meetings** if local worker missing: CRM may call Deepgram with `diarize=true`
  (paid). Prefer installing WhisperX to stay free.

## Privacy

Audio and transcripts never leave the Mac when using this worker.
