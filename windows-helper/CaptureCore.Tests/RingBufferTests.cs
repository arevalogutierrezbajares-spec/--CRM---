using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>RingBufferTests.swift</c> — wrap, drain, clear, thread-safety smoke.</summary>
public class RingBufferTests
{
    [Fact]
    public void AppendThenDrainReturnsSameBytes()
    {
        var ring = new RingBuffer(64);
        byte[] payload = { 1, 2, 3, 4, 5 };
        ring.Append(payload);
        Assert.Equal(5, ring.Count);
        Assert.Equal(payload, ring.DrainAll());
        Assert.Equal(0, ring.Count);
    }

    [Fact]
    public void WrapKeepsOnlyMostRecentCapacityBytes()
    {
        var ring = new RingBuffer(10);
        ring.Append(new byte[] { 1, 2, 3, 4 });                       // 4 stored
        ring.Append(new byte[] { 5, 6, 7, 8, 9, 10, 11, 12 });        // 12 total → oldest 2 dropped
        Assert.Equal(10, ring.Count);
        Assert.Equal(new byte[] { 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 }, ring.DrainAll());
    }

    [Fact]
    public void SingleAppendLargerThanCapacityKeepsTail()
    {
        var ring = new RingBuffer(8);
        ring.Append(Enumerable.Range(0, 20).Select(i => (byte)i).ToArray());
        Assert.Equal(8, ring.Count);
        Assert.Equal(Enumerable.Range(12, 8).Select(i => (byte)i).ToArray(), ring.DrainAll());
    }

    [Fact]
    public void WrapAroundAcrossManySmallAppends()
    {
        var ring = new RingBuffer(7);
        for (int value = 0; value < 50; value++)
            ring.Append(new[] { (byte)value });
        Assert.Equal(Enumerable.Range(43, 7).Select(i => (byte)i).ToArray(), ring.DrainAll());
    }

    [Fact]
    public void ClearDropsEverything()
    {
        var ring = new RingBuffer(16);
        ring.Append(Enumerable.Repeat((byte)0xAB, 12).ToArray());
        ring.Clear();
        Assert.Equal(0, ring.Count);
        Assert.Empty(ring.DrainAll());
    }

    [Fact]
    public void DrainOnEmptyReturnsEmpty()
    {
        var ring = new RingBuffer(4);
        Assert.Empty(ring.DrainAll());
    }

    [Fact]
    public void PreRollDefaultCapacityIs60Seconds()
    {
        Assert.Equal(3_840_000, new RingBuffer().Capacity);
    }

    [Fact]
    public void ThreadSafetySmoke()
    {
        var ring = new RingBuffer(4096);
        var tasks = new List<Task>();
        for (int worker = 0; worker < 8; worker++)
        {
            byte w = (byte)worker;
            tasks.Add(Task.Run(() =>
            {
                for (int i = 0; i < 500; i++)
                {
                    ring.Append(Enumerable.Repeat(w, (i % 64) + 1).ToArray());
                    if (i % 97 == 0) _ = ring.DrainAll();
                    if (i % 131 == 0) ring.Clear();
                }
            }));
        }
        Assert.True(Task.WaitAll(tasks.ToArray(), TimeSpan.FromSeconds(30)));
        Assert.True(ring.Count <= 4096);
        Assert.True(ring.DrainAll().Length <= 4096);
    }
}
