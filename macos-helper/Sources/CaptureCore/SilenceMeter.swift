import Foundation

/// Tracks per-channel RMS over a whole call and reports whether either channel
/// was near-silent overall — a likely mis-routing (muted mic, wrong device).
/// Informational on the helper side; the server also checks at filing time
/// (FR-CALL-OPS-4).
public final class SilenceMeter {
    private let lock = NSLock()
    private var sumSquaresLeft: Double = 0
    private var sumSquaresRight: Double = 0
    private var frames: Int = 0

    /// Default near-silence threshold: RMS below ~0.0025 full scale (≈ −52 dBFS).
    public static let defaultThreshold = 0.0025

    public init() {}

    /// Feed interleaved stereo PCM16 bytes (L = mic, R = system).
    public func feedInterleaved(_ pcm: Data) {
        guard pcm.count >= AudioConstants.bytesPerFrame else { return }
        var localL: Double = 0
        var localR: Double = 0
        var localFrames = 0
        pcm.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            let frameCount = samples.count / 2
            for i in 0..<frameCount {
                let l = Double(Int16(littleEndian: samples[i * 2])) / 32768.0
                let r = Double(Int16(littleEndian: samples[i * 2 + 1])) / 32768.0
                localL += l * l
                localR += r * r
            }
            localFrames = frameCount
        }
        lock.lock()
        sumSquaresLeft += localL
        sumSquaresRight += localR
        frames += localFrames
        lock.unlock()
    }

    public struct Report: Equatable {
        public let leftRMS: Double
        public let rightRMS: Double
        public let leftNearSilent: Bool
        public let rightNearSilent: Bool
        public let frames: Int

        public var anyChannelNearSilent: Bool { leftNearSilent || rightNearSilent }

        public var summary: String {
            let l = String(format: "%.4f", leftRMS)
            let r = String(format: "%.4f", rightRMS)
            var s = "mic(L) RMS \(l)\(leftNearSilent ? " NEAR-SILENT" : ""), system(R) RMS \(r)\(rightNearSilent ? " NEAR-SILENT" : "")"
            if frames == 0 { s = "no audio measured" }
            return s
        }
    }

    public func report(threshold: Double = SilenceMeter.defaultThreshold) -> Report {
        lock.lock(); defer { lock.unlock() }
        guard frames > 0 else {
            return Report(leftRMS: 0, rightRMS: 0, leftNearSilent: true, rightNearSilent: true, frames: 0)
        }
        let l = (sumSquaresLeft / Double(frames)).squareRoot()
        let r = (sumSquaresRight / Double(frames)).squareRoot()
        return Report(leftRMS: l,
                      rightRMS: r,
                      leftNearSilent: l < threshold,
                      rightNearSilent: r < threshold,
                      frames: frames)
    }

    public func reset() {
        lock.lock(); defer { lock.unlock() }
        sumSquaresLeft = 0
        sumSquaresRight = 0
        frames = 0
    }
}
