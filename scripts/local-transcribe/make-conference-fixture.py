#!/usr/bin/env python3
"""
Generate a synthetic 10-speaker conference-call WAV for diarization testing.

Uses 10 distinct macOS TTS voices (say), two rounds of turns each, 0.5 s gaps,
output as the helper's wire format: 16 kHz stereo PCM16, speech on L, silent R
(i.e. a speakerphone capture). Feed it through the pipeline with:

  .build/release/AGBCaptureHelper --simulate conference-stereo16k.wav \
      --source-app "Speakerphone"

or directly through the local engine:

  ./transcribe.py conference-stereo16k.wav --max-speakers 10 -o /tmp/out.json

Ground truth: 20 turns, speaker order (×2):
  Samantha, Daniel, Karen, Rishi, Moira, Fred, Tessa, Albert, Kathy, Ralph

Measured baseline 2026-07-23: Deepgram nova-3 diarize collapsed these 10
clean TTS voices into 2 clusters (8 merged utterances) — words all intact,
speaker identity lost. That measurement is why the local pyannote path with
--max-speakers exists.
"""
import subprocess
import tempfile
import wave
from pathlib import Path

TURNS = [
    ("Samantha", "Alright everyone, this is the weekly rollout call. Let's go around the table with status."),
    ("Daniel",   "Engineering here. The booking API is code complete and we deploy to staging on Thursday."),
    ("Karen",    "Marketing update. The launch campaign starts Monday and the budget is fully approved."),
    ("Rishi",    "Support speaking. Ticket volume dropped fifteen percent after the new onboarding flow."),
    ("Moira",    "Finance here. Invoicing for the pilot customers goes out at the end of the month."),
    ("Fred",     "Operations. The warehouse migration finished over the weekend without any downtime."),
    ("Tessa",    "Sales checking in. We closed two enterprise deals and the pipeline is at three million."),
    ("Albert",   "Legal update. The revised master service agreement is ready for signatures."),
    ("Kathy",    "Product here. User testing starts tomorrow and we need five more participants."),
    ("Ralph",    "Security. The penetration test report came back clean with two minor findings."),
    ("Samantha", "Great. Any blockers before we commit to the Monday launch date?"),
    ("Daniel",   "One risk. If staging fails Thursday we slip the launch by one week."),
    ("Karen",    "Marketing can absorb a one week slip but not more than that."),
    ("Rishi",    "No blockers from support. The knowledge base is updated."),
    ("Moira",    "No blockers on billing. The payment gateway is live."),
    ("Fred",     "Operations is ready. The fulfillment team is staffed for launch."),
    ("Tessa",    "Customers are asking for a firm date so please decide today."),
    ("Albert",   "Sign the agreement before Friday and legal is clear."),
    ("Kathy",    "Product is go. The release notes are drafted."),
    ("Ralph",    "Security signs off. We are good to launch."),
]

GAP_SECS = 0.5
RATE = 16000


def main() -> None:
    out = Path("conference-stereo16k.wav")
    gap = b"\x00\x00" * int(RATE * GAP_SECS)
    mono = bytearray()
    with tempfile.TemporaryDirectory() as td:
        for i, (voice, text) in enumerate(TURNS):
            aiff = Path(td) / f"u{i:02d}.aiff"
            wav = Path(td) / f"u{i:02d}.wav"
            subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
            subprocess.run(
                ["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(aiff), str(wav)],
                check=True, capture_output=True,
            )
            with wave.open(str(wav), "rb") as w:
                assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, RATE)
                mono += w.readframes(w.getnframes()) + gap

    stereo = bytearray()
    for i in range(0, len(mono), 2):
        stereo += mono[i:i + 2] + b"\x00\x00"

    with wave.open(str(out), "wb") as d:
        d.setnchannels(2)
        d.setsampwidth(2)
        d.setframerate(RATE)
        d.writeframes(bytes(stereo))
    print(f"{out} — {len(stereo) / 4 / RATE:.1f}s, {len(TURNS)} turns, 10 voices")


if __name__ == "__main__":
    main()
