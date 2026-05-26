import { describe, expect, it } from "vitest";
import { pickRecorderMime, recorderFilename } from "@/lib/recorder";

describe("pickRecorderMime", () => {
  const realMR = (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  const setMR = (impl: { isTypeSupported(t: string): boolean }) => {
    (globalThis as unknown as { MediaRecorder: typeof impl }).MediaRecorder = impl;
  };
  const reset = () => {
    if (realMR === undefined) {
      delete (globalThis as Record<string, unknown>).MediaRecorder;
    } else {
      (globalThis as Record<string, unknown>).MediaRecorder = realMR;
    }
  };

  it("returns empty string when MediaRecorder is absent", () => {
    reset();
    expect(pickRecorderMime()).toBe("");
  });

  it("picks webm-opus when supported (Chrome-ish)", () => {
    setMR({
      isTypeSupported: (t: string) => t === "audio/webm;codecs=opus",
    });
    expect(pickRecorderMime()).toBe("audio/webm;codecs=opus");
    reset();
  });

  it("falls back to mp4 when only Safari MIMEs supported", () => {
    setMR({
      isTypeSupported: (t: string) => t === "audio/mp4",
    });
    expect(pickRecorderMime()).toBe("audio/mp4");
    reset();
  });

  it("returns empty when nothing is supported", () => {
    setMR({ isTypeSupported: () => false });
    expect(pickRecorderMime()).toBe("");
    reset();
  });
});

describe("recorderFilename", () => {
  it("maps each container to its expected extension", () => {
    expect(recorderFilename("audio/webm;codecs=opus")).toBe("memo.webm");
    expect(recorderFilename("audio/mp4")).toBe("memo.mp4");
    expect(recorderFilename("audio/ogg;codecs=opus")).toBe("memo.ogg");
    expect(recorderFilename("audio/wav")).toBe("memo.wav");
  });

  it("defaults to webm for unknown MIMEs", () => {
    expect(recorderFilename("application/octet-stream")).toBe("memo.webm");
  });
});
