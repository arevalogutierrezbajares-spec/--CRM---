using System.Buffers.Binary;
using System.Globalization;

namespace AGB.CaptureCore;

/// <summary>
/// Tracks per-channel RMS over a whole call and reports whether either channel
/// was near-silent overall — a likely mis-routing (muted mic, wrong device).
/// Informational on the helper side; the server also checks at filing time
/// (FR-CALL-OPS-4).
///
/// 1:1 port of <c>SilenceMeter.swift</c>.
/// </summary>
public sealed class SilenceMeter
{
    private readonly object _lock = new();
    private double _sumSquaresLeft;
    private double _sumSquaresRight;
    private long _frames;

    /// <summary>Default near-silence threshold: RMS below ~0.0025 full scale (≈ −52 dBFS).</summary>
    public const double DefaultThreshold = 0.0025;

    /// <summary>Feed interleaved stereo PCM16 bytes (L = mic, R = system).</summary>
    public void FeedInterleaved(ReadOnlySpan<byte> pcm)
    {
        if (pcm.Length < AudioConstants.BytesPerFrame) return;

        double localL = 0;
        double localR = 0;
        int frameCount = pcm.Length / 4;
        for (int i = 0; i < frameCount; i++)
        {
            double l = BinaryPrimitives.ReadInt16LittleEndian(pcm.Slice(i * 4)) / 32768.0;
            double r = BinaryPrimitives.ReadInt16LittleEndian(pcm.Slice(i * 4 + 2)) / 32768.0;
            localL += l * l;
            localR += r * r;
        }

        lock (_lock)
        {
            _sumSquaresLeft += localL;
            _sumSquaresRight += localR;
            _frames += frameCount;
        }
    }

    public readonly record struct Report(
        double LeftRms,
        double RightRms,
        bool LeftNearSilent,
        bool RightNearSilent,
        long Frames)
    {
        public bool AnyChannelNearSilent => LeftNearSilent || RightNearSilent;

        public string Summary
        {
            get
            {
                if (Frames == 0) return "no audio measured";
                string l = LeftRms.ToString("F4", CultureInfo.InvariantCulture);
                string r = RightRms.ToString("F4", CultureInfo.InvariantCulture);
                return $"mic(L) RMS {l}{(LeftNearSilent ? " NEAR-SILENT" : "")}, " +
                       $"system(R) RMS {r}{(RightNearSilent ? " NEAR-SILENT" : "")}";
            }
        }
    }

    public Report GetReport(double threshold = DefaultThreshold)
    {
        lock (_lock)
        {
            if (_frames == 0)
                return new Report(0, 0, LeftNearSilent: true, RightNearSilent: true, Frames: 0);

            double l = Math.Sqrt(_sumSquaresLeft / _frames);
            double r = Math.Sqrt(_sumSquaresRight / _frames);
            return new Report(l, r, l < threshold, r < threshold, _frames);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _sumSquaresLeft = 0;
            _sumSquaresRight = 0;
            _frames = 0;
        }
    }
}
