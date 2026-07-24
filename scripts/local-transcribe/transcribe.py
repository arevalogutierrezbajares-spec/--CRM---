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

import os as _os

# macOS venv Pythons often lack a usable system CA bundle, so model downloads
# (VAD / align / pyannote from the HF hub) fail with SSL cert-verify errors.
# Point urllib + requests at certifi's bundle before anything network runs.
try:
    import certifi as _certifi
    _os.environ.setdefault("SSL_CERT_FILE", _certifi.where())
    _os.environ.setdefault("REQUESTS_CA_BUNDLE", _certifi.where())
except Exception:
    pass

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


def _load_audio_16k_mono(wav: Path):
    """Load a WAV/MP3 as float32 mono @ 16 kHz WITHOUT torchcodec.

    torchcodec (whisperx's default decoder) is broken against ffmpeg 8, so we
    decode with soundfile (libsndfile) and resample if needed. Returns a numpy
    float32 array in [-1, 1], the shape whisperx.transcribe expects.
    """
    import numpy as np
    try:
        import soundfile as sf
    except ImportError as e:
        raise SystemExit(
            "soundfile not installed (needed to decode audio without torchcodec).\n"
            "  scripts/local-transcribe/.venv/bin/pip install soundfile\n"
            f"Import error: {e}"
        ) from e

    data, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)  # downmix to mono
    if sr != 16000:
        # Linear resample — adequate for STT; avoids a scipy/librosa dependency.
        n_out = int(round(len(mono) * 16000 / sr))
        if n_out > 0:
            mono = np.interp(
                np.linspace(0.0, len(mono), num=n_out, endpoint=False),
                np.arange(len(mono)),
                mono,
            ).astype(np.float32)
    return np.ascontiguousarray(mono, dtype=np.float32)


def _open_diarize(result: dict, audio, min_speakers=None, max_speakers=None) -> None:
    """Token-free speaker diarization: embed each aligned segment with an open
    d-vector model (Resemblyzer, bundled weights — no Hugging Face gating) and
    cluster the embeddings. Writes seg["speaker"] = "SPEAKER_NN" in place.

    The roster speaker-count hint (max_speakers) sets the cluster count, which
    is what makes 10+ voice separation tractable; without a hint we auto-pick
    the count from embedding distances.
    """
    import numpy as np
    try:
        from resemblyzer import VoiceEncoder
        from sklearn.cluster import AgglomerativeClustering
    except ImportError as e:
        raise SystemExit(
            "Token-free diarization needs resemblyzer + scikit-learn:\n"
            "  scripts/local-transcribe/.venv/bin/pip install resemblyzer scikit-learn\n"
            f"Import error: {e}"
        ) from e

    segments = [s for s in (result.get("segments") or []) if (s.get("text") or "").strip()]
    if not segments:
        return
    sr = 16000
    encoder = VoiceEncoder("cpu", verbose=False)
    embs, embedded = [], []
    for seg in segments:
        s = int(float(seg.get("start") or 0) * sr)
        e = int(float(seg.get("end") or 0) * sr)
        clip = audio[max(0, s):min(len(audio), e)]
        if len(clip) < int(0.4 * sr):  # too short to embed reliably
            continue
        try:
            embs.append(encoder.embed_utterance(np.asarray(clip, dtype=np.float32)))
            embedded.append(seg)
        except Exception:
            continue
    if not embs:
        for seg in segments:
            seg["speaker"] = "SPEAKER_00"
        return

    X = np.asarray(embs)
    n = len(X)
    if max_speakers and max_speakers > 0:
        k = min(max_speakers, n)
        labels = AgglomerativeClustering(
            n_clusters=k, metric="cosine", linkage="average").fit_predict(X)
    else:
        # No hint: cut the dendrogram at a cosine-distance threshold tuned for
        # distinct voices, bounded by an optional floor.
        labels = AgglomerativeClustering(
            n_clusters=None, distance_threshold=0.32,
            metric="cosine", linkage="average").fit_predict(X)
        if min_speakers and len(set(labels)) < min_speakers and n >= min_speakers:
            labels = AgglomerativeClustering(
                n_clusters=min_speakers, metric="cosine", linkage="average").fit_predict(X)

    # Stable SPEAKER_NN ids in order of first appearance.
    order, remap = {}, {}
    for lbl in labels:
        if lbl not in remap:
            remap[lbl] = len(order)
            order[lbl] = True
    for seg, lbl in zip(embedded, labels):
        seg["speaker"] = f"SPEAKER_{remap[lbl]:02d}"
    # Segments too short to embed inherit the previous speaker.
    last = "SPEAKER_00"
    for seg in segments:
        if "speaker" in seg:
            last = seg["speaker"]
        else:
            seg["speaker"] = last


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

    import os
    import torch

    # faster-whisper (CTranslate2) has no Metal backend, so "mps" — which the
    # helper passes on Apple Silicon — raises "unsupported device mps". Metal
    # buys little for these short calls anyway; run the ASR on CPU (int8).
    if device == "mps":
        device = "cpu"

    compute_type = "float16" if device == "cuda" else "int8"
    # Load audio ourselves via soundfile so we never touch torchcodec's decoder
    # (broken against ffmpeg 8 on this Mac: "Could not load libtorchcodec").
    # whisperx wants float32 mono @ 16 kHz.
    audio = _load_audio_16k_mono(wav)
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

    # Diarization. Two engines:
    #  • pyannote (whisperx) — higher quality, but its checkpoints are gated
    #    behind a Hugging Face token the user must request + accept.
    #  • token-free (Resemblyzer d-vectors + agglomerative clustering) — no
    #    token, no gating, works out of the box; the DEFAULT so 10-speaker
    #    capture works with zero setup. The roster speaker-count hint drives
    #    the cluster count, which is exactly what crowded audio needs.
    # Set HF_TOKEN (and accept the pyannote terms) to prefer pyannote instead.
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    used_pyannote = False
    if hf_token:
        try:
            try:
                from whisperx.diarize import DiarizationPipeline  # whisperx >= 3.8
            except ImportError:
                from whisperx import DiarizationPipeline  # older whisperx
            try:
                diarize_model = DiarizationPipeline(token=hf_token, device=device)
            except TypeError:
                diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=device)
            diarize_kwargs = {}
            if min_speakers:
                diarize_kwargs["min_speakers"] = min_speakers
            if max_speakers:
                diarize_kwargs["max_speakers"] = max_speakers
            diarize_segments = diarize_model(audio, **diarize_kwargs)
            result = whisperx.assign_word_speakers(diarize_segments, result)
            used_pyannote = True
        except Exception as e:  # gated-model refusal, network, etc.
            print(f"[transcribe] pyannote unavailable ({e}); using token-free diarizer",
                  file=sys.stderr)

    if not used_pyannote:
        _open_diarize(result, audio, min_speakers=min_speakers, max_speakers=max_speakers)

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
        "engine": "whisperx" if used_pyannote else "whisperx+resemblyzer",
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
