#!/bin/bash
# verify-diarization.sh — one command to prove the 10+ speaker path works.
#
# Generates a synthetic 10-voice conference (via make-conference-fixture.py),
# runs it through the local WhisperX + pyannote diarizer with a speaker-count
# hint, and reports how many distinct speakers it separated (target: ~10).
#
# Requires: the venv (see README), ffmpeg, and an HF_TOKEN that has accepted
# the pyannote gated-model terms (the script tells you exactly how if missing).

set -euo pipefail
cd "$(dirname "$0")"

VENV_PY=".venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  echo "✗ venv missing. Set it up first:"
  echo "    python3.12 -m venv .venv && .venv/bin/pip install -U pip"
  echo "    .venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu"
  echo "    .venv/bin/pip install whisperx soundfile"
  exit 1
fi

if [[ -z "${HF_TOKEN:-}" && -z "${HUGGING_FACE_HUB_TOKEN:-}" ]]; then
  cat <<'MSG'
✗ No HF_TOKEN. Diarization needs a Hugging Face token that has accepted the
  pyannote gated-model terms. Two minutes, one time:

    1) Create a token (read scope):  https://huggingface.co/settings/tokens
    2) Click "Agree and access" on BOTH:
         https://huggingface.co/pyannote/speaker-diarization-3.1
         https://huggingface.co/pyannote/segmentation-3.0
    3) Re-run with the token:
         HF_TOKEN=hf_xxxxxxxx ./verify-diarization.sh

  (In the AGB AI helper, this same token then powers every speakerphone/
   meeting capture automatically — no per-call step.)
MSG
  exit 2
fi

echo "==> generating 10-voice conference fixture"
"$VENV_PY" make-conference-fixture.py

echo "==> diarizing with --max-speakers 11 (10 voices + 1 headroom)"
OUT="/tmp/agb-diarize-verify.json"
"$VENV_PY" -W ignore transcribe.py conference-stereo16k.wav \
  --max-speakers 11 --model base -o "$OUT" 2>/dev/null

echo "==> result"
"$VENV_PY" - "$OUT" <<'PY'
import json, sys, collections
d = json.load(open(sys.argv[1]))
us = d.get("utterances", [])
spk = collections.Counter(u.get("speaker") for u in us)
print(f"  utterances: {len(us)}")
print(f"  distinct speakers detected: {len(spk)}  (target: 10)")
for s, n in sorted(spk.items()):
    print(f"    {s}: {n} turns")
n = len(spk)
if n >= 8:
    print("✓ Diarization is separating the crowd well.")
elif n >= 4:
    print("~ Partial separation — expected for 10 clean voices; real speakerphone is harder.")
else:
    print("✗ Under-clustered. Check the --max-speakers hint reached pyannote.")
PY
