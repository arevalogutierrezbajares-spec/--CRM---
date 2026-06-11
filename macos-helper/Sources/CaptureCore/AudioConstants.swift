import Foundation

/// Fixed v1 audio contract (docs/CALL-CAPTURE-PROTOCOL.md):
/// PCM16 little-endian WAV, 16 000 Hz, 2 channels, interleaved.
/// Channel 0 (L) = founder microphone. Channel 1 (R) = system audio.
public enum AudioConstants {
    public static let sampleRate = 16_000
    public static let channels = 2
    public static let bitsPerSample = 16
    public static let bytesPerSample = 2

    /// Bytes per interleaved stereo frame (2 ch × 2 bytes).
    public static let bytesPerFrame = channels * bytesPerSample
    /// Bytes per second of interleaved stereo audio: 16 000 × 2 × 2 = 64 000.
    public static let bytesPerSecond = sampleRate * bytesPerFrame

    /// 60 s pre-roll ring buffer: 16 kHz × 2 ch × 2 bytes × 60 s = 3 840 000 bytes.
    public static let preRollSeconds = 60
    public static let preRollBytes = preRollSeconds * bytesPerSecond // 3_840_000

    /// 30 s chunk: 1 920 000 bytes of PCM (≈1.92 MB — under the 4 MB request cap).
    public static let chunkSeconds = 30
    public static let chunkBytes = chunkSeconds * bytesPerSecond // 1_920_000

    public static let wavHeaderBytes = 44

    /// Wire protocol version (X-Capture-Protocol header).
    public static let protocolVersion = "1"

    public static let helperVersion = "1.0.0"
}
