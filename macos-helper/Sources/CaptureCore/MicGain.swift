import Foundation

/// Bounded automatic gain for acoustically-captured speech (speakerphone mode).
///
/// A phone on speaker across a desk lands around −46 dBFS (RMS ≈ 0.005) at the
/// Mac's mic — far below what streaming STT expects, and only ~6 dB above the
/// near-silence floor that arms the auto-end watchdog. This lifts the level
/// toward a target RMS with a hard ceiling.
///
/// Design notes:
/// - **Idle decay.** When a batch is below the noise floor, gain is driven back
///   toward 1.0 rather than held. Holding it would amplify room tone above
///   `SilenceMeter.defaultThreshold` and permanently blind the silence
///   watchdog. Real silence must stay measurably silent.
/// - **Asymmetric smoothing.** Gain drops fast (attack) and rises slowly
///   (release), so a sudden loud talker cannot clip while a quiet one is still
///   brought up gradually instead of pumping on every syllable.
/// - **Hard clamp.** Boosted samples are clamped to Int16 range; without it a
///   12× boost on an already-loud passage wraps and produces harsh distortion
///   that wrecks recognition far worse than a quiet signal.
public final class MicGain {

    /// Target output RMS (≈ −22 dBFS) — comfortable speech level for STT.
    public static let targetRMS: Double = 0.08
    /// Ceiling. 12× ≈ +21.6 dB, enough for a phone at desk distance without
    /// dragging HVAC hum and keyboard noise up with it.
    public static let maxGain: Double = 12.0
    public static let minGain: Double = 1.0
    /// Batches at or below this are treated as room tone, not speech, and drive
    /// gain back *down* instead of up.
    ///
    /// This is pinned to `SilenceMeter.defaultThreshold` deliberately, and the
    /// two must never drift apart. If this floor were any lower, audio that the
    /// rest of the helper defines as silence would still be amplified — a batch
    /// at RMS 0.002 would ride to the 12× ceiling and read as 0.024, so
    /// `SilenceMeter` and `CallEndMonitor` would never see a silent frame again
    /// and the silence auto-end would never fire. For `.speaker` captures that
    /// watchdog is the *only* auto-end (peer-mic detection is meaningless for an
    /// off-Mac call), so blinding it means recording room tone to the 2 h cap.
    public static let noiseFloorRMS: Double = SilenceMeter.defaultThreshold

    /// Smoothing coefficients per batch (batches arrive every ~10–100 ms).
    private let attackCoeff: Double
    private let releaseCoeff: Double
    private let idleDecayCoeff: Double

    private let lock = NSLock()
    private var gain: Double = 1.0

    /// - Parameters:
    ///   - attackCoeff: fraction of the way toward a *lower* target per batch
    ///     when the signal is too loud. Fast, so a sudden shout cannot clip.
    ///   - releaseCoeff: fraction of the way toward a *higher* target per batch.
    ///     Slow, so gain does not pump on every syllable.
    ///   - idleDecayCoeff: fraction of the way back toward unity per batch while
    ///     below the noise floor. Deliberately *much* slower than `attackCoeff`:
    ///     a natural 300 ms pause between sentences must barely move the gain
    ///     (otherwise the first word after every pause is swallowed while
    ///     release crawls back up), while several seconds of true silence must
    ///     still settle to unity so the silence watchdog can see it.
    public init(attackCoeff: Double = 0.35,
                releaseCoeff: Double = 0.05,
                idleDecayCoeff: Double = 0.05) {
        self.attackCoeff = attackCoeff
        self.releaseCoeff = releaseCoeff
        self.idleDecayCoeff = idleDecayCoeff
    }

    /// Current smoothed gain — for logging / diagnostics.
    public var currentGain: Double {
        lock.lock(); defer { lock.unlock() }
        return gain
    }

    public func reset() {
        lock.lock(); defer { lock.unlock() }
        gain = 1.0
    }

    /// Measure a mono Int16 batch and return it amplified toward `targetRMS`.
    /// Returns the input unchanged when it is too short to measure.
    public func apply(_ monoPCM16: Data) -> Data {
        guard monoPCM16.count >= 2 else { return monoPCM16 }

        let rms = Self.rms(monoPCM16)

        lock.lock()
        let target: Double
        let coeff: Double
        if rms > Self.noiseFloorRMS {
            target = min(Self.maxGain, max(Self.minGain, Self.targetRMS / rms))
            coeff = target < gain ? attackCoeff : releaseCoeff
        } else {
            // At or below the noise floor this is room tone, not speech. Decay
            // toward unity so real silence stays measurably silent for
            // SilenceMeter / CallEndMonitor — slowly, so inter-sentence pauses
            // don't reset the gain the next word needs.
            target = Self.minGain
            coeff = idleDecayCoeff
        }
        gain += (target - gain) * coeff
        let applied = gain
        lock.unlock()

        // Unity gain: skip the copy entirely.
        guard applied > 1.001 else { return monoPCM16 }

        var out = Data(count: monoPCM16.count)
        monoPCM16.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let src = raw.bindMemory(to: Int16.self)
            out.withUnsafeMutableBytes { (rawOut: UnsafeMutableRawBufferPointer) in
                let dst = rawOut.bindMemory(to: Int16.self)
                for i in 0..<src.count {
                    let boosted = Double(Int16(littleEndian: src[i])) * applied
                    // Clamp, never wrap.
                    let clamped = min(max(boosted, -32768.0), 32767.0)
                    dst[i] = Int16(clamped).littleEndian
                }
            }
        }
        return out
    }

    /// RMS of a mono Int16 buffer, normalized to full scale (0...1).
    public static func rms(_ monoPCM16: Data) -> Double {
        guard monoPCM16.count >= 2 else { return 0 }
        var sum = 0.0
        var count = 0
        monoPCM16.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            for i in 0..<samples.count {
                let v = Double(Int16(littleEndian: samples[i])) / 32768.0
                sum += v * v
            }
            count = samples.count
        }
        guard count > 0 else { return 0 }
        return (sum / Double(count)).squareRoot()
    }
}
