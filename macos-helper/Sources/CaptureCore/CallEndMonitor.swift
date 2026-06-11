import Foundation

/// Watches an in-flight recording for two independent auto-end conditions that
/// don't depend on the OS mic-release signal (FR-CALL-TRG-5's process-object
/// watch, which can silently fail — e.g. WhatsApp keeping the mic open after
/// hangup). Both are evaluated from the same interleaved-audio pump the recorder
/// already runs, so no extra capture machinery is needed.
///
///  1. **Silence timeout** — if BOTH channels stay near-silent (per
///     `SilenceMeter`'s RMS threshold) continuously for `silenceWindow`, the
///     call has almost certainly ended; finalize as a *normal* end
///     (partial = false). Any signal on either channel resets the timer.
///  2. **Max-duration cap** — a hard ceiling so nothing ever runs forever;
///     crossing `maxDuration` forces a finalize regardless of audio.
///
/// Pure logic, time injected: deterministic and unit-testable with synthetic
/// frames and a clock. No AppKit / CoreAudio. Thread-safe (the audio pump and a
/// menu read can touch it concurrently).
public final class CallEndMonitor {

    /// Why the monitor fired (for logging / notification copy).
    public enum Reason: Equatable {
        case silence(seconds: Double)
        case maxDuration(seconds: Double)
    }

    private let lock = NSLock()

    /// Continuous near-silence on BOTH channels for this long → auto-end.
    public let silenceWindow: TimeInterval
    /// Absolute ceiling on a single recording → auto-end.
    public let maxDuration: TimeInterval
    /// RMS below this on a channel counts as near-silent (per-frame, not cumulative).
    public let silenceThreshold: Double

    private var startedAt: TimeInterval?
    /// Wall-clock time of the last frame batch that had signal on either channel.
    private var lastSignalAt: TimeInterval?
    private var firedReason: Reason?

    public init(silenceWindow: TimeInterval,
                maxDuration: TimeInterval,
                silenceThreshold: Double = SilenceMeter.defaultThreshold) {
        self.silenceWindow = silenceWindow
        self.maxDuration = maxDuration
        self.silenceThreshold = silenceThreshold
    }

    /// Begin (or restart) the watch at `now`. The first interval is treated as
    /// signal so a slow-starting call isn't ended before any audio arrives.
    public func start(now: TimeInterval = CACurrentMediaTimeShim()) {
        lock.lock(); defer { lock.unlock() }
        startedAt = now
        lastSignalAt = now
        firedReason = nil
    }

    /// Feed one interleaved-stereo PCM16 batch (the exact bytes the recorder
    /// spools). Updates the silence timer from this batch's RMS. Returns a
    /// `Reason` exactly once, on the pump that first crosses either threshold;
    /// subsequent calls return nil so the caller finalizes only once.
    @discardableResult
    public func feed(_ pcm: Data, now: TimeInterval = CACurrentMediaTimeShim()) -> Reason? {
        let hasSignal = Self.batchHasSignal(pcm, threshold: silenceThreshold)
        return evaluate(hasSignal: hasSignal, now: now)
    }

    /// Variant for callers that have already computed per-channel RMS (avoids a
    /// second pass over the bytes). `true` = at least one channel had signal.
    @discardableResult
    public func feed(hasSignal: Bool, now: TimeInterval = CACurrentMediaTimeShim()) -> Reason? {
        evaluate(hasSignal: hasSignal, now: now)
    }

    private func evaluate(hasSignal: Bool, now: TimeInterval) -> Reason? {
        lock.lock(); defer { lock.unlock() }
        guard firedReason == nil else { return nil }
        if startedAt == nil { startedAt = now; lastSignalAt = now }

        if hasSignal {
            lastSignalAt = now
        }

        // Max-duration ceiling takes precedence — it must fire even mid-speech.
        if let start = startedAt, now - start >= maxDuration {
            let reason = Reason.maxDuration(seconds: now - start)
            firedReason = reason
            return reason
        }

        if let lastSignal = lastSignalAt, now - lastSignal >= silenceWindow {
            let reason = Reason.silence(seconds: now - lastSignal)
            firedReason = reason
            return reason
        }
        return nil
    }

    /// Seconds since the last non-silent audio on either channel (0 if unstarted).
    public func silentSeconds(now: TimeInterval = CACurrentMediaTimeShim()) -> Double {
        lock.lock(); defer { lock.unlock() }
        guard let lastSignal = lastSignalAt else { return 0 }
        return max(0, now - lastSignal)
    }

    /// Seconds since the recording started (0 if unstarted).
    public func elapsedSeconds(now: TimeInterval = CACurrentMediaTimeShim()) -> Double {
        lock.lock(); defer { lock.unlock() }
        guard let start = startedAt else { return 0 }
        return max(0, now - start)
    }

    /// Whether either auto-end condition has already fired.
    public var hasFired: Bool {
        lock.lock(); defer { lock.unlock() }
        return firedReason != nil
    }

    // MARK: - RMS helper

    /// Per-batch near-silence test: returns `true` if EITHER channel of this
    /// interleaved-stereo PCM16 batch has RMS at/above `threshold`. Mirrors the
    /// `SilenceMeter` math but scoped to a single batch (a rolling window), not
    /// the whole-call cumulative average.
    public static func batchHasSignal(_ pcm: Data, threshold: Double) -> Bool {
        guard pcm.count >= AudioConstants.bytesPerFrame else { return false }
        var sumL: Double = 0
        var sumR: Double = 0
        var frames = 0
        pcm.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            frames = samples.count / 2
            for i in 0..<frames {
                let l = Double(Int16(littleEndian: samples[i * 2])) / 32768.0
                let r = Double(Int16(littleEndian: samples[i * 2 + 1])) / 32768.0
                sumL += l * l
                sumR += r * r
            }
        }
        guard frames > 0 else { return false }
        let rmsL = (sumL / Double(frames)).squareRoot()
        let rmsR = (sumR / Double(frames)).squareRoot()
        return rmsL >= threshold || rmsR >= threshold
    }
}

/// `CACurrentMediaTime()` lives in QuartzCore (an Apple-platform framework that
/// CaptureCore deliberately doesn't link, so the target stays portable and
/// unit-testable). This shim resolves to the monotonic clock at runtime; tests
/// inject their own `now` and never call it.
@inline(__always)
public func CACurrentMediaTimeShim() -> TimeInterval {
    var ts = timespec()
    clock_gettime(CLOCK_MONOTONIC, &ts)
    return TimeInterval(ts.tv_sec) + TimeInterval(ts.tv_nsec) / 1_000_000_000
}
