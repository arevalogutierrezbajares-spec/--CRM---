using System.Buffers.Binary;
using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>StereoInterleaverTests.swift</c> — L/R mapping, silence padding, clock limiting.</summary>
public class StereoInterleaverTests
{
    private static byte[] Mono(int frames, short value)
    {
        var data = new byte[frames * 2];
        for (int i = 0; i < frames; i++)
            BinaryPrimitives.WriteInt16LittleEndian(data.AsSpan(i * 2), value);
        return data;
    }

    private static short[] Samples(byte[] data)
    {
        var result = new short[data.Length / 2];
        for (int i = 0; i < result.Length; i++)
            result[i] = BinaryPrimitives.ReadInt16LittleEndian(data.AsSpan(i * 2));
        return result;
    }

    [Fact]
    public void InterleavesMicLeftSystemRight()
    {
        var interleaver = new StereoInterleaver(cushionSeconds: 0);
        interleaver.AppendMic(Mono(4, 11));
        interleaver.AppendSystem(Mono(4, 22));

        _ = interleaver.Pump(0); // establishes the clock
        byte[] outBytes = interleaver.Pump(4.0 / 16_000.0);
        short[] stereo = Samples(outBytes);
        Assert.Equal(8, stereo.Length);
        Assert.Equal(new short[] { 11, 22, 11, 22, 11, 22, 11, 22 }, stereo);
    }

    [Fact]
    public void MissingSideIsPaddedWithSilence()
    {
        var interleaver = new StereoInterleaver(cushionSeconds: 0);
        interleaver.AppendMic(Mono(8, 5)); // no system audio at all

        _ = interleaver.Pump(0);
        short[] stereo = Samples(interleaver.Pump(8.0 / 16_000.0));
        Assert.Equal(16, stereo.Length);
        for (int frame = 0; frame < 8; frame++)
        {
            Assert.Equal(5, stereo[frame * 2]);       // mic side present
            Assert.Equal(0, stereo[frame * 2 + 1]);   // system side silence-filled
        }
    }

    [Fact]
    public void ClockLimitsEmissionNotQueueDepth()
    {
        var interleaver = new StereoInterleaver(cushionSeconds: 0);
        interleaver.AppendMic(Mono(1_600, 1));   // 100 ms queued
        interleaver.AppendSystem(Mono(1_600, 2));

        _ = interleaver.Pump(0);
        // Only 10 ms of wall clock elapsed → only 160 frames may come out.
        byte[] outBytes = interleaver.Pump(0.010);
        Assert.Equal(160 * 4, outBytes.Length);
    }

    [Fact]
    public void FlushRemainingPadsShorterSide()
    {
        var interleaver = new StereoInterleaver(cushionSeconds: 0);
        interleaver.AppendMic(Mono(6, 9));
        interleaver.AppendSystem(Mono(2, 7));

        short[] stereo = Samples(interleaver.FlushRemaining());
        Assert.Equal(12, stereo.Length); // length follows the longer side
        Assert.Equal(9, stereo[0]);
        Assert.Equal(7, stereo[1]);
        Assert.Equal(0, stereo[5]); // system ran out after 2 frames
        Assert.Equal(9, stereo[10]);
    }

    [Fact]
    public void ResetDropsQueuesAndClock()
    {
        var interleaver = new StereoInterleaver(cushionSeconds: 0);
        interleaver.AppendMic(Mono(100, 1));
        interleaver.Reset();
        Assert.Empty(interleaver.FlushRemaining());
    }
}
