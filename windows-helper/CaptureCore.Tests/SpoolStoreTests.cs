using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>SpoolStoreTests.swift</c> — create/list/delete, shared instances, orphan adoption.</summary>
public class SpoolStoreTests : IDisposable
{
    private readonly string _rootDir;
    private readonly SpoolStore _store;

    public SpoolStoreTests()
    {
        _rootDir = Path.Combine(Path.GetTempPath(), $"agb-store-tests-{Guid.NewGuid()}", "spool");
        _store = new SpoolStore(_rootDir);
    }

    public void Dispose()
    {
        try { Directory.Delete(Path.GetDirectoryName(_rootDir)!, recursive: true); } catch { /* ignore */ }
    }

    [Fact]
    public void CreateListDelete()
    {
        Assert.Empty(_store.SessionDirectories());

        var spoolerA = _store.CreateSession(localId: "aaa", startedAt: DateTimeOffset.UtcNow, sourceApp: null);
        var spoolerB = _store.CreateSession(localId: "bbb", startedAt: DateTimeOffset.UtcNow, sourceApp: "Zoom");
        Assert.Equal(2, _store.SessionDirectories().Count);
        Assert.True(File.Exists(Path.Combine(spoolerA.Directory, "manifest.json")));

        _store.DeleteSession(spoolerA);
        var remaining = _store.SessionDirectories();
        Assert.Single(remaining);
        Assert.Equal("session-bbb", Path.GetFileName(remaining[0]));
        Assert.Equal("Zoom", spoolerB.Snapshot.SourceApp);
    }

    [Fact]
    public void PendingDetectionExcludesFinalizedAndSortsOldestFirst()
    {
        _store.CreateSession(localId: "old", startedAt: DateTimeOffset.UtcNow.AddSeconds(-600), sourceApp: null);
        _store.CreateSession(localId: "recent", startedAt: DateTimeOffset.UtcNow.AddSeconds(-60), sourceApp: null);
        var done = _store.CreateSession(localId: "done", startedAt: DateTimeOffset.UtcNow.AddSeconds(-30), sourceApp: null);
        done.MarkFinalized();

        var pending = _store.PendingSessions();
        Assert.Equal(new[] { "old", "recent" }, pending.Select(s => s.LocalId)); // oldest first, finalized excluded
    }

    [Fact]
    public void OpenSessionReturnsSharedCachedInstance()
    {
        var created = _store.CreateSession(localId: "shared", startedAt: DateTimeOffset.UtcNow, sourceApp: null);
        var opened = _store.OpenSession(created.Directory);
        Assert.Same(created, opened); // writer and uploader must share one spooler instance
    }

    [Fact]
    public void OpenSessionFromDiskAfterRestart()
    {
        var created = _store.CreateSession(localId: "restart", startedAt: DateTimeOffset.UtcNow, sourceApp: null, chunkSeconds: 1);
        created.Append(new byte[AudioConstants.BytesPerSecond]);
        string dir = created.Directory;

        // New store = new process.
        var freshStore = new SpoolStore(_rootDir);
        var reopened = freshStore.OpenSession(dir);
        Assert.NotSame(created, reopened);
        Assert.Equal(new[] { 0 }, reopened.Snapshot.SeqsWritten);
    }

    [Fact]
    public void AdoptOrphansMarksEndedAndPartial()
    {
        var orphan = _store.CreateSession(localId: "orphan", startedAt: DateTimeOffset.UtcNow, sourceApp: null, chunkSeconds: 1);
        orphan.Append(new byte[AudioConstants.BytesPerSecond * 2]);
        Assert.Null(orphan.Snapshot.EndedAt);

        var active = _store.CreateSession(localId: "active", startedAt: DateTimeOffset.UtcNow, sourceApp: null);

        var adopted = _store.AdoptOrphans(new HashSet<string> { "active" });
        Assert.Equal(new[] { "orphan" }, adopted.Select(s => s.LocalId));

        var snap = orphan.Snapshot;
        Assert.NotNull(snap.EndedAt);
        Assert.True(snap.Partial);
        Assert.Equal(2, snap.DurationSecs);
        Assert.Null(active.Snapshot.EndedAt); // active session must not be adopted
    }

    [Fact]
    public void CorruptManifestIsSkippedNotFatal()
    {
        _store.CreateSession(localId: "good", startedAt: DateTimeOffset.UtcNow, sourceApp: null);
        string badDir = Path.Combine(_rootDir, "session-corrupt");
        Directory.CreateDirectory(badDir);
        File.WriteAllText(Path.Combine(badDir, "manifest.json"), "not json");

        var pending = _store.PendingSessions();
        Assert.Equal(new[] { "good" }, pending.Select(s => s.LocalId));
    }
}
