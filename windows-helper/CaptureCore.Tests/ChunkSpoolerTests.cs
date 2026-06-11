using System.Text.Json;
using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>ChunkSpoolerTests.swift</c> — chunking, manifest, reopen-from-disk, off-the-record.</summary>
public class ChunkSpoolerTests : IDisposable
{
    private readonly string _tempDir;

    public ChunkSpoolerTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"agb-spooler-tests-{Guid.NewGuid()}");
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* ignore */ }
    }

    private ChunkSpooler MakeSpooler(int chunkSeconds = 30, string localId = "test-session")
    {
        var manifest = new SessionManifest(
            sessionLocalId: localId,
            startedAt: DateTimeOffset.FromUnixTimeSeconds(1_780_000_000),
            sourceApp: "WhatsApp",
            chunkSeconds: chunkSeconds);
        return new ChunkSpooler(_tempDir, manifest);
    }

    // ----------------------------------------------------------------- Chunking

    [Fact]
    public void Exact30SecondBoundaryProducesExactlyOneChunk()
    {
        var spooler = MakeSpooler();
        spooler.Append(new byte[AudioConstants.ChunkBytes]); // exactly 30 s (value 0)

        var snap = spooler.Snapshot;
        Assert.Equal(new[] { 0 }, snap.SeqsWritten);
        Assert.Equal(0, spooler.PendingByteCount);

        byte[] wav = File.ReadAllBytes(spooler.ChunkPath(0));
        Assert.Equal(44 + AudioConstants.ChunkBytes, wav.Length);
        var info = WavCodec.Parse(wav);
        Assert.Equal(16_000, info.SampleRate);
        Assert.Equal(2, info.Channels);
        Assert.Equal(AudioConstants.ChunkBytes, info.DataLength);
        Assert.True(Math.Abs(info.DurationSeconds - 30) < 0.001);
    }

    [Fact]
    public void OddSlicesChunkAtBoundariesAndFlushWritesRemainder()
    {
        var spooler = MakeSpooler();
        // 75 s of audio delivered in odd-sized slices.
        int totalBytes = 75 * AudioConstants.BytesPerSecond;
        int remaining = totalBytes;
        byte value = 0;
        while (remaining > 0)
        {
            int size = Math.Min(remaining, 70_001);
            var block = new byte[size];
            Array.Fill(block, value);
            spooler.Append(block);
            remaining -= size;
            value = unchecked((byte)(value + 1));
        }
        Assert.Equal(new[] { 0, 1 }, spooler.Snapshot.SeqsWritten); // two full 30s chunks before flush
        Assert.Equal(15 * AudioConstants.BytesPerSecond, spooler.PendingByteCount);

        spooler.Flush();
        Assert.Equal(new[] { 0, 1, 2 }, spooler.Snapshot.SeqsWritten);
        Assert.Equal(0, spooler.PendingByteCount);

        byte[] lastChunk = File.ReadAllBytes(spooler.ChunkPath(2));
        Assert.Equal(44 + 15 * AudioConstants.BytesPerSecond, lastChunk.Length);
        Assert.True(Math.Abs(spooler.SpooledSeconds - 75) < 0.01);
    }

    [Fact]
    public void FlushWithNothingPendingWritesNothing()
    {
        var spooler = MakeSpooler();
        spooler.Flush();
        Assert.Empty(spooler.Snapshot.SeqsWritten);
    }

    // ----------------------------------------------------------------- Manifest

    [Fact]
    public void ManifestCorrectness()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        spooler.Append(new byte[AudioConstants.BytesPerSecond * 2]); // 2 chunks
        spooler.SetServerSessionId("srv-123");
        spooler.MarkUploaded(0);
        spooler.MarkEnded(endedAt: DateTimeOffset.FromUnixTimeSeconds(1_780_000_100), partial: false);

        // Re-read straight from disk to prove persistence.
        byte[] raw = File.ReadAllBytes(Path.Combine(_tempDir, "manifest.json"));
        var manifest = JsonSerializer.Deserialize<SessionManifest>(raw, JsonDefaults.Lenient)!;

        Assert.Equal("test-session", manifest.SessionLocalId);
        Assert.Equal("srv-123", manifest.ServerSessionId);
        Assert.Equal("WhatsApp", manifest.SourceApp);
        Assert.Equal(new[] { 0, 1 }, manifest.SeqsWritten);
        Assert.Equal(new[] { 0 }, manifest.SeqsUploaded);
        Assert.Equal(new[] { 1 }, manifest.PendingUploadSeqs);
        Assert.False(manifest.Finalized);
        Assert.NotNull(manifest.EndedAt);
        Assert.Equal(2, manifest.DurationSecs);
        Assert.False(manifest.Partial);
        Assert.Equal(1, manifest.ChunkSeconds);
        Assert.False(manifest.ReadyToFinalize); // seq 1 not uploaded yet

        spooler.MarkUploaded(1);
        Assert.True(spooler.Snapshot.ReadyToFinalize);
        spooler.MarkFinalized();
        Assert.True(spooler.Snapshot.Finalized);
    }

    // ------------------------------------------------ Reopen from disk (crash recovery)

    [Fact]
    public void ReopenFromDiskResumesSequenceNumbering()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        spooler.Append(new byte[AudioConstants.BytesPerSecond * 2]); // seq 0, 1
        spooler.MarkUploaded(0);
        spooler = null!; // "crash"

        var reopened = ChunkSpooler.OpenExisting(_tempDir);
        var snap = reopened.Snapshot;
        Assert.Equal(new[] { 0, 1 }, snap.SeqsWritten);
        Assert.Equal(new[] { 0 }, snap.SeqsUploaded);
        Assert.Equal(1, snap.ChunkSeconds);
        Assert.True(Math.Abs(reopened.SpooledSeconds - 2) < 0.01);

        reopened.Append(new byte[AudioConstants.BytesPerSecond]);
        Assert.Equal(new[] { 0, 1, 2 }, reopened.Snapshot.SeqsWritten); // resumes at seq 2
        Assert.True(File.Exists(reopened.ChunkPath(2)));
    }

    [Fact]
    public void ReopenDropsManifestEntriesForMissingChunkFiles()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        spooler.Append(new byte[AudioConstants.BytesPerSecond * 3]); // seq 0,1,2
        string lostChunk = spooler.ChunkPath(2);
        spooler = null!;
        File.Delete(lostChunk); // simulate lost write

        var reopened = ChunkSpooler.OpenExisting(_tempDir);
        Assert.Equal(new[] { 0, 1 }, reopened.Snapshot.SeqsWritten);
        reopened.Append(new byte[AudioConstants.BytesPerSecond]);
        Assert.Equal(new[] { 0, 1, 2 }, reopened.Snapshot.SeqsWritten); // reuses the lost seq
    }

    [Fact]
    public void ReopenMissingManifestThrows()
    {
        Assert.Throws<ChunkSpooler.SpoolerException>(() => ChunkSpooler.OpenExisting(_tempDir));
    }

    // ------------------------------------------- Off the record (FR-CALL-CAP-8 v1)

    [Fact]
    public void DiscardUnuploadedTailDropsPendingAndUnuploadedChunksOnly()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        int second = AudioConstants.BytesPerSecond;
        spooler.Append(new byte[second * 3]); // chunks 0,1,2
        spooler.Append(new byte[second / 2]); // 0.5 s pending
        spooler.MarkUploaded(0);

        // Budget: 10 s — but only pending (0.5 s) + chunks 2 and 1 are droppable.
        int dropped = spooler.DiscardUnuploadedTail(TimeSpan.FromSeconds(10));
        Assert.Equal(second / 2 + second * 2, dropped);

        Assert.Equal(new[] { 0 }, spooler.Snapshot.SeqsWritten); // uploaded chunk 0 must survive
        Assert.Equal(0, spooler.PendingByteCount);
        Assert.False(File.Exists(spooler.ChunkPath(1)));
        Assert.False(File.Exists(spooler.ChunkPath(2)));
        Assert.True(File.Exists(spooler.ChunkPath(0)));
    }

    [Fact]
    public void DiscardRespectsBudget()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        int second = AudioConstants.BytesPerSecond;
        spooler.Append(new byte[second * 3]); // chunks 0,1,2

        // Budget of 1 s: only chunk 2 fits.
        int dropped = spooler.DiscardUnuploadedTail(TimeSpan.FromSeconds(1));
        Assert.Equal(second, dropped);
        Assert.Equal(new[] { 0, 1 }, spooler.Snapshot.SeqsWritten);
    }

    [Fact]
    public void SeqNumberingContinuesCorrectlyAfterDiscard()
    {
        var spooler = MakeSpooler(chunkSeconds: 1);
        int second = AudioConstants.BytesPerSecond;
        spooler.Append(new byte[second * 2]); // 0,1
        spooler.DiscardUnuploadedTail(TimeSpan.FromSeconds(1)); // drops 1
        spooler.Append(new byte[second]); // becomes new seq 1
        Assert.Equal(new[] { 0, 1 }, spooler.Snapshot.SeqsWritten);
    }
}
