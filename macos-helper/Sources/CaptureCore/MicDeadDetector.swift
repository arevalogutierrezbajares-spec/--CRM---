import Foundation

/// Watchdog for the "mic went digitally dead" failure (2026-07-12 RCA): a 44-min
/// WhatsApp call recorded the mic (L) channel as pure digital zeros the entire
/// time while the system (R) channel was fine — the mic tap silently stopped
/// delivering buffers (suspected mid-call audio-route change) and nothing
/// detected or recovered it.
///
/// This is the small, pure, time-injected state machine that decides *when* to
/// restart the mic capture path. `AudioEngine` feeds it one observation per
/// pump tick and acts on `.restart`. Keeping the decision here (no CoreAudio,
/// no AppKit) makes it deterministic and unit-testable with a fake clock.
///
/// ## Contract
///
/// Fed `feed(micAllZero:systemActive:at:)` once per pump tick:
///   - `micAllZero`  — every mic (L) sample in this tick was exactly 0 (the tap
///     delivered digital zeros *or* delivered nothing and the interleaver padded
///     L with silence). Exact-zero is the signal: real rooms are never all-zero,
///     so quiet-but-nonzero audio never trips this.
///   - `systemActive` — the system (R) channel had RMS at/above the near-silence
///     floor this tick (there *is* a live far side to cross-check against).
///   - `at` — monotonic wall-clock seconds (injected; tests pass a fake clock).
///
/// Returns `.restart` exactly on the tick that a *continuous* mic-dead run
/// (micAllZero && systemActive, uninterrupted) has lasted `deadWindow` seconds —
/// subject to the caps below — and `.none` otherwise.
///
/// The condition deliberately requires BOTH `micAllZero` and `systemActive`:
///   - mic nonzero            → healthy mic; anchor resets, never fires.
///   - system silent too      → normal silence (both channels quiet); that's the
///     `CallEndMonitor`'s job, not ours — anchor resets, never fires.
///   - mic zero + system live → the real defect; the run accumulates.
///
/// ## Caps (so a genuinely dead device can't loop)
///   - `maxRestarts` total per session (default 3). After that, `.none` forever.
///   - Consecutive restarts are held at least `restartCooldown` apart (default
///     30 s): once a dead run reaches `deadWindow` the machine *wants* to fire,
///     but if the previous restart was < `restartCooldown` ago it waits (keeping
///     its anchor) and fires the moment the cooldown clears.
///   - Every fire resets the anchor, so the next restart also needs a fresh full
///     `deadWindow` of continuous dead audio — the cooldown and the window
///     together make tight looping impossible even while the mic path is
///     re-warming (which briefly reads as more padded-silence zeros).
public struct MicDeadDetector {

    public enum Action: Equatable {
        /// Nothing to do this tick.
        case none
        /// The mic path should be torn down and re-created once, now.
        case restart
    }

    /// Continuous mic-dead-while-system-live for this long → restart.
    public let deadWindow: TimeInterval
    /// Hard ceiling on restarts per session.
    public let maxRestarts: Int
    /// Minimum spacing between consecutive restarts.
    public let restartCooldown: TimeInterval

    /// When the current uninterrupted mic-dead run began (nil = not currently
    /// in a dead run).
    private var deadSince: TimeInterval?
    private var restartCount: Int = 0
    private var lastRestartAt: TimeInterval?

    public init(deadWindow: TimeInterval = 8.0,
                maxRestarts: Int = 3,
                restartCooldown: TimeInterval = 30.0) {
        self.deadWindow = deadWindow
        self.maxRestarts = maxRestarts
        self.restartCooldown = restartCooldown
    }

    /// Feed one pump-tick observation. Returns `.restart` at most once per
    /// qualifying dead run (and never more than `maxRestarts` per session).
    @discardableResult
    public mutating func feed(micAllZero: Bool,
                              systemActive: Bool,
                              at now: TimeInterval) -> Action {
        // Only a candidate when the mic is pure-zero AND the far side is live.
        // Any other combination means the mic is fine or the whole call is quiet;
        // either way, clear the run.
        guard micAllZero, systemActive else {
            deadSince = nil
            return .none
        }

        // Exhausted the per-session budget: never restart again.
        guard restartCount < maxRestarts else { return .none }

        // Start / continue timing this dead run.
        let anchor = deadSince ?? now
        if deadSince == nil { deadSince = now }

        // Not sustained long enough yet.
        guard now - anchor >= deadWindow else { return .none }

        // Sustained — but honor the cooldown between restarts. Keep the anchor so
        // we fire the instant the cooldown clears (if the mic is still dead).
        if let last = lastRestartAt, now - last < restartCooldown {
            return .none
        }

        restartCount += 1
        lastRestartAt = now
        deadSince = nil // next restart needs a fresh full window of dead audio
        return .restart
    }

    /// Clear all runtime state (new capture session). Configuration is preserved.
    public mutating func reset() {
        deadSince = nil
        restartCount = 0
        lastRestartAt = nil
    }

    /// Restarts issued so far this session (for logging / assertions).
    public var restartsUsed: Int { restartCount }

    // MARK: - Byte scan (interleaved L=mic / R=system → the two feed inputs)

    /// Derive `(micAllZero, systemActive)` from one interleaved-stereo PCM16
    /// batch — the exact bytes the recorder pumps (L = mic, R = system).
    ///
    /// `micAllZero` is an *exact* zero test on the L samples (endianness-agnostic:
    /// 0 is 0 in either byte order), so a quiet-but-nonzero mic never reads dead.
    /// `systemActive` mirrors `SilenceMeter`'s RMS math on the R channel.
    ///
    /// A batch with no whole frames is reported as `(micAllZero: true,
    /// systemActive: false)` — we can't judge the far side, so it can never
    /// trigger a restart on its own.
    public static func scan(interleaved pcm: Data,
                            systemThreshold: Double = SilenceMeter.defaultThreshold)
        -> (micAllZero: Bool, systemActive: Bool) {
        guard pcm.count >= AudioConstants.bytesPerFrame else {
            return (micAllZero: true, systemActive: false)
        }
        var micAllZero = true
        var sumR: Double = 0
        var frames = 0
        pcm.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            frames = samples.count / 2
            for i in 0..<frames {
                if samples[i * 2] != 0 { micAllZero = false }
                let r = Double(Int16(littleEndian: samples[i * 2 + 1])) / 32768.0
                sumR += r * r
            }
        }
        guard frames > 0 else { return (true, false) }
        let rmsR = (sumR / Double(frames)).squareRoot()
        return (micAllZero, rmsR >= systemThreshold)
    }
}
