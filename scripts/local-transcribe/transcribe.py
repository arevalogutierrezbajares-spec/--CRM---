#!/usr/bin/env python3
"""
Local free transcription + speaker diarization for AGB CRM capture.

Backends (first available wins):
  1. WhisperX  (pip install whisperx)  — recommended
  2. Fallback: prints install instructions and exits 2

Usage:
  ./transcribe.py meeting.wav -o utterances.json
  ./transcribe.py meeting.wav --device cpu --model small

Output JSON matches AGB Utterance[] for CRM dialogue building.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def fmt_speaker(label: str | int | None) -> str:
    if label is None:
        return "SPEAKER_00"
    s = str(label)
    if s.startswith("SPEAKER_"):
        return s
    # WhisperX often returns "SPEAKER_00" already; pyannote ints → pad
    if s.isdigit():
        return f"SPEAKER_{int(s):02d}"
    return s


def run_whisperx(wav: Path, model: str, device: str, language: str | None,
                 min_speakers: int | None = None, max_speakers: int | None = None) -> dict:
    try:
        import whisperx  # type: ignore
    except ImportError as e:
        raise SystemExit(
            "WhisperX not installed.\n"
            "  cd scripts/local-transcribe && python3 -m venv .venv && source .venv/bin/activate\n"
            "  pip install torch torchaudio whisperx\n"
            "  # optional: export HF_TOKEN=... for pyannote diarization models\n"
            f"Import error: {e}"
        ) from e

    import torch

    compute_type = "float16" if device == "cuda" else "int8"
    audio = whisperx.load_audio(str(wav))
    model_a = whisperx.load_model(model, device, compute_type=compute_type)
    result = model_a.transcribe(audio, batch_size=8, language=language)

    # Align for better timestamps
    model_a, metadata = whisperx.load_align_model(
        language_code=result.get("language") or language or "en",
        device=device,
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )

    # Diarization (requires HF token for many pyannote checkpoints)
    diarize_model = whisperx.DiarizationPipeline(
        use_auth_token=True,  # reads HF_TOKEN / huggingface-cli login
        device=device,
    )
    # Speaker-count hints dramatically improve clustering on crowded audio
    # (10+ people on a speakerphone): pyannote otherwise under-clusters.
    diarize_kwargs = {}
    if min_speakers:
        diarize_kwargs["min_speakers"] = min_speakers
    if max_speakers:
        diarize_kwargs["max_speakers"] = max_speakers
    diarize_segments = diarize_model(audio, **diarize_kwargs)
    result = whisperx.assign_word_speakers(diarize_segments, result)

    utterances = []
    for seg in result.get("segments") or []:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        sp = fmt_speaker(seg.get("speaker"))
        utterances.append(
            {
                "speaker": sp,
                "diarizationId": sp,
                "channel": 0,
                "start": float(seg.get("start") or 0),
                "end": float(seg.get("end") or seg.get("start") or 0),
                "text": text,
            }
        )

    utterances.sort(key=lambda u: u["start"])
    return {
        "language": result.get("language") or language or "multi",
        "engine": "whisperx",
        "model": model,
        "utterances": utterances,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Local free diarized transcription (WhisperX)")
    ap.add_argument("wav", type=Path, help="Input WAV/MP3 (mono or stereo)")
    ap.add_argument("-o", "--output", type=Path, help="Write JSON here (default stdout)")
    ap.add_argument("--model", default="small", help="Whisper model size (default: small)")
    ap.add_argument(
        "--device",
        default="cpu",
        choices=("cpu", "cuda", "mps"),
        help="Torch device (default: cpu; mps on Apple Silicon if available)",
    )
    ap.add_argument("--language", default=None, help="Force language code (e.g. en, es)")
    ap.add_argument("--min-speakers", type=int, default=None,
                    help="Diarization hint: at least this many speakers")
    ap.add_argument("--max-speakers", type=int, default=None,
                    help="Diarization hint: at most this many speakers")
    args = ap.parse_args()

    if not args.wav.is_file():
        print(f"File not found: {args.wav}", file=sys.stderr)
        return 1

    device = args.device
    if device == "mps":
        try:
            import torch

            if not torch.backends.mps.is_available():
                print("MPS not available; falling back to cpu", file=sys.stderr)
                device = "cpu"
        except Exception:
            device = "cpu"

    out = run_whisperx(args.wav, args.model, device, args.language,
                       min_speakers=args.min_speakers, max_speakers=args.max_speakers)
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
        print(f"Wrote {len(out['utterances'])} utterances → {args.output}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
