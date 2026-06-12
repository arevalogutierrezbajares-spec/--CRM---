import Foundation

/// Pure PCM helpers used by the Core Audio process-tap path (ProcessAudioTap).
///
/// The process tap delivers de-interleaved **non-interleaved** float buffers in
/// the aggregate device's native format (typically 2 ch, 44.1/48 kHz). Before
/// handing audio to the same 16 kHz-mono-Int16 sink the SCStream path fed, the
/// tap downmixes the channels to mono. That channel averaging is the one piece
/// of pure arithmetic worth unit-testing headlessly; the HAL plumbing around it
/// cannot run without the audio server + capture permission.
public enum PCMDownmix {

    /// Average N equal-length non-interleaved float channels into a single mono
    /// channel. `channels` is an array of per-channel sample arrays, each of
    /// length `frameCount`. A single channel is returned unchanged; zero
    /// channels yields an empty array.
    ///
    /// Mirrors the energy-preserving "duplicate mono / average stereo" behaviour
    /// CATapDescription documents for its own mixdowns, so a 2-channel tap of a
    /// mono source (FaceTime voice) collapses cleanly back to that mono signal.
    public static func monoAverage(channels: [[Float]], frameCount: Int) -> [Float] {
        guard frameCount > 0 else { return [] }
        let usable = channels.filter { $0.count >= frameCount }
        guard let first = usable.first else { return [] }
        if usable.count == 1 { return Array(first[0..<frameCount]) }

        var out = [Float](repeating: 0, count: frameCount)
        for ch in usable {
            for i in 0..<frameCount { out[i] += ch[i] }
        }
        let scale = 1.0 / Float(usable.count)
        for i in 0..<frameCount { out[i] *= scale }
        return out
    }

    /// Average the channels of an **interleaved** float buffer (frame = one
    /// sample per channel, laid out L,R,L,R,…) into mono. Used when the tapped
    /// stream is reported as interleaved rather than de-interleaved.
    public static func monoAverageInterleaved(samples: [Float], channels: Int) -> [Float] {
        guard channels > 0 else { return [] }
        if channels == 1 { return samples }
        let frameCount = samples.count / channels
        guard frameCount > 0 else { return [] }

        var out = [Float](repeating: 0, count: frameCount)
        let scale = 1.0 / Float(channels)
        for frame in 0..<frameCount {
            var acc: Float = 0
            let base = frame * channels
            for c in 0..<channels { acc += samples[base + c] }
            out[frame] = acc * scale
        }
        return out
    }
}
