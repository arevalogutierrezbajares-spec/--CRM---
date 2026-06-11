#!/usr/bin/env python3
"""Generate a valid 16 kHz, 2-channel, PCM16 test WAV matching the capture wire
contract (L = mic tone, R = system tone), so simulate mode can be exercised
end-to-end without ffmpeg or any real audio.

    python3 scripts/make-test-wav.py [out.wav] [--seconds 65]

A duration > 60 s produces 3 chunks at the default 30 s chunk size, exercising
multi-chunk upload + finalize. The two channels use different tones so the
SilenceMeter sees real signal on both (no false NEAR-SILENT).
"""
import argparse
import math
import struct
import wave

SAMPLE_RATE = 16_000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out", nargs="?", default="test16k.wav")
    parser.add_argument("--seconds", type=float, default=65.0)
    args = parser.parse_args()

    frames = int(SAMPLE_RATE * args.seconds)
    left_freq, right_freq = 440.0, 660.0  # mic tone vs system tone
    amp = 8000  # well above the near-silence threshold

    with wave.open(args.out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        buf = bytearray()
        for n in range(frames):
            t = n / SAMPLE_RATE
            left = int(amp * math.sin(2 * math.pi * left_freq * t))
            right = int(amp * math.sin(2 * math.pi * right_freq * t))
            buf += struct.pack("<hh", left, right)
        w.writeframes(bytes(buf))

    print(f"wrote {args.out}: {args.seconds:.1f}s, 16000 Hz, 2 ch, PCM16")


if __name__ == "__main__":
    main()
