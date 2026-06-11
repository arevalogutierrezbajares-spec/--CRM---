using System.Buffers.Binary;
using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>SilenceMeterTests.swift</c> — per-channel RMS + near-silence flagging.</summary>
public class SilenceMeterTests
{
    /// <summary>Build interleaved stereo PCM16: constant amplitude per channel.</summary>
    private static byte[] Stereo(int frames, short left, short right)
    {
        var data = new byte[frames * 4];
        for (int i = 0; i < frames; i++)
        {
            BinaryPrimitives.WriteInt16LittleEndian(data.AsSpan(i * 4), left);
            BinaryPrimitives.WriteInt16LittleEndian(data.AsSpan(i * 4 + 2), right);
        }
        return data;
    }

    [Fact]
    public void BothChannelsSilentFlagged()
    {
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(16_000, 0, 0));
        var report = meter.GetReport();
        Assert.True(report.LeftNearSilent);
        Assert.True(report.RightNearSilent);
        Assert.True(report.AnyChannelNearSilent);
        Assert.Equal(16_000, report.Frames);
    }

    [Fact]
    public void LoudLeftSilentRight()
    {
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(16_000, 8_000, 0));
        var report = meter.GetReport();
        Assert.False(report.LeftNearSilent);            // mic channel is loud
        Assert.True(report.RightNearSilent);            // system channel is silent → suspect
        Assert.True(Math.Abs(report.LeftRms - 8_000.0 / 32_768.0) < 0.001);
        Assert.True(report.AnyChannelNearSilent);
        Assert.Contains("NEAR-SILENT", report.Summary);
    }

    [Fact]
    public void BothChannelsLoudNotFlagged()
    {
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(8_000, 4_000, -6_000));
        var report = meter.GetReport();
        Assert.False(report.LeftNearSilent);
        Assert.False(report.RightNearSilent);
        Assert.False(report.AnyChannelNearSilent);
    }

    [Fact]
    public void VeryQuietButNonZeroStillFlagged()
    {
        // Amplitude 20/32768 ≈ 0.0006 RMS — below the 0.0025 threshold.
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(16_000, 20, 20));
        var report = meter.GetReport();
        Assert.True(report.LeftNearSilent);
        Assert.True(report.RightNearSilent);
    }

    [Fact]
    public void AccumulatesAcrossMultipleFeeds()
    {
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(1_000, 1_000, 0));
        meter.FeedInterleaved(Stereo(1_000, 1_000, 0));
        Assert.Equal(2_000, meter.GetReport().Frames);
    }

    [Fact]
    public void NoAudioReportsSilent()
    {
        var report = new SilenceMeter().GetReport();
        Assert.Equal(0, report.Frames);
        Assert.True(report.AnyChannelNearSilent);
        Assert.Equal("no audio measured", report.Summary);
    }

    [Fact]
    public void ResetClearsState()
    {
        var meter = new SilenceMeter();
        meter.FeedInterleaved(Stereo(100, 5_000, 5_000));
        meter.Reset();
        Assert.Equal(0, meter.GetReport().Frames);
    }
}
