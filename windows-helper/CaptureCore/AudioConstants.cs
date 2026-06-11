namespace AGB.CaptureCore;

/// <summary>
/// Fixed v1 audio contract (docs/CALL-CAPTURE-PROTOCOL.md):
/// PCM16 little-endian WAV, 16 000 Hz, 2 channels, interleaved.
/// Channel 0 (L) = founder microphone. Channel 1 (R) = system audio.
///
/// Direct port of <c>AudioConstants.swift</c>. These numbers are load-bearing:
/// the CRM strips exactly 44 header bytes and concatenates PCM, so the helper
/// MUST emit this exact format or the assembled call is garbage.
/// </summary>
public static class AudioConstants
{
    public const int SampleRate = 16_000;
    public const int Channels = 2;
    public const int BitsPerSample = 16;
    public const int BytesPerSample = 2;

    /// <summary>Bytes per interleaved stereo frame (2 ch × 2 bytes).</summary>
    public const int BytesPerFrame = Channels * BytesPerSample;

    /// <summary>Bytes per second of interleaved stereo audio: 16 000 × 2 × 2 = 64 000.</summary>
    public const int BytesPerSecond = SampleRate * BytesPerFrame;

    /// <summary>60 s pre-roll ring: 16 kHz × 2 ch × 2 bytes × 60 s = 3 840 000 bytes.</summary>
    public const int PreRollSeconds = 60;
    public const int PreRollBytes = PreRollSeconds * BytesPerSecond; // 3_840_000

    /// <summary>30 s chunk: 1 920 000 bytes of PCM (≈1.92 MB — under the 4 MB request cap).</summary>
    public const int ChunkSeconds = 30;
    public const int ChunkBytes = ChunkSeconds * BytesPerSecond; // 1_920_000

    public const int WavHeaderBytes = 44;

    /// <summary>Wire protocol version (X-Capture-Protocol header).</summary>
    public const string ProtocolVersion = "1";

    public const string HelperVersion = "1.0.0";
}
