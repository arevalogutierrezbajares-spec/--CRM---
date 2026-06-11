namespace AGB.CaptureCore;

/// <summary>
/// Manages the spool root (<c>…\AGBCaptureHelper\spool\</c>): one subdirectory
/// per capture session, each containing chunk WAVs + <c>manifest.json</c>.
///
/// Returns *shared* <see cref="ChunkSpooler"/> instances (cached per directory)
/// so the audio engine (writer) and the upload worker (reader/uploader) mutate
/// one manifest through one lock instead of racing on the file.
///
/// 1:1 port of <c>SpoolStore.swift</c>.
/// </summary>
public sealed class SpoolStore
{
    public string RootPath { get; }

    private readonly object _lock = new();
    private readonly Dictionary<string, ChunkSpooler> _cache = new();

    private static string CacheKey(string directory) =>
        Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    public SpoolStore(string? rootPath = null)
    {
        string root = rootPath ?? HelperPaths.SpoolDir();
        HelperPaths.EnsureDirectory(Path.GetDirectoryName(root)!);
        HelperPaths.EnsureDirectory(root);
        RootPath = root;
    }

    // ----------------------------------------------------------- Session lifecycle

    /// <summary>Create a new session spool dir + manifest, and return its spooler.</summary>
    public ChunkSpooler CreateSession(
        string? localId = null,
        DateTimeOffset? startedAt = null,
        string? sourceApp = null,
        int chunkSeconds = AudioConstants.ChunkSeconds)
    {
        localId ??= Guid.NewGuid().ToString();
        string dir = Path.Combine(RootPath, $"session-{localId}");
        HelperPaths.EnsureDirectory(dir);

        var manifest = new SessionManifest(
            sessionLocalId: localId,
            startedAt: startedAt ?? DateTimeOffset.UtcNow,
            sourceApp: sourceApp,
            chunkSeconds: chunkSeconds);

        var spooler = new ChunkSpooler(dir, manifest);
        lock (_lock) { _cache[CacheKey(dir)] = spooler; }
        return spooler;
    }

    /// <summary>Open (or return the cached instance for) the session at <paramref name="directory"/>.</summary>
    public ChunkSpooler OpenSession(string directory)
    {
        string key = CacheKey(directory);
        lock (_lock)
        {
            if (_cache.TryGetValue(key, out var cached)) return cached;
        }
        var spooler = ChunkSpooler.OpenExisting(directory);
        lock (_lock) { _cache[key] = spooler; }
        return spooler;
    }

    /// <summary>All session directories on disk (any state), unsorted.</summary>
    public IReadOnlyList<string> SessionDirectories()
    {
        if (!Directory.Exists(RootPath)) return Array.Empty<string>();
        return Directory.EnumerateDirectories(RootPath)
            .Where(d => Path.GetFileName(d).StartsWith("session-", StringComparison.Ordinal))
            .ToList();
    }

    /// <summary>
    /// Sessions that still need work (not finalized): un-uploaded chunks, pending
    /// finalize, or still recording. Sorted oldest-first so the upload queue
    /// preserves capture order (FR-CALL-TRX-2). Corrupt spools are skipped.
    /// </summary>
    public IReadOnlyList<ChunkSpooler> PendingSessions()
    {
        var result = new List<ChunkSpooler>();
        foreach (string dir in SessionDirectories())
        {
            ChunkSpooler spooler;
            try { spooler = OpenSession(dir); }
            catch { continue; } // corrupt/unreadable spool — skip, never fatal
            if (!spooler.Snapshot.Finalized) result.Add(spooler);
        }
        return result
            .OrderBy(s => s.Snapshot.StartedAtDate ?? DateTimeOffset.MinValue)
            .ToList();
    }

    /// <summary>Delete a session's spool directory (after finalize success or abandon).</summary>
    public void DeleteSession(ChunkSpooler spooler)
    {
        lock (_lock) { _cache.Remove(CacheKey(spooler.Directory)); }
        if (Directory.Exists(spooler.Directory))
            Directory.Delete(spooler.Directory, recursive: true);
    }

    // ------------------------------------------------- Crash adoption (FR-CALL-OPS-5)

    /// <summary>
    /// At startup, any non-finalized session whose localId is not in
    /// <paramref name="activeLocalIds"/> belonged to a crashed run. Mark it
    /// ended + partial so the upload worker finalizes the salvageable audio.
    /// </summary>
    public IReadOnlyList<ChunkSpooler> AdoptOrphans(ISet<string>? activeLocalIds = null)
    {
        activeLocalIds ??= new HashSet<string>();
        var adopted = new List<ChunkSpooler>();
        foreach (var spooler in PendingSessions())
        {
            var snap = spooler.Snapshot;
            if (activeLocalIds.Contains(snap.SessionLocalId)) continue;
            if (snap.EndedAt is null)
            {
                spooler.MarkEnded(endedAt: DateTimeOffset.UtcNow, partial: true);
                adopted.Add(spooler);
            }
        }
        return adopted;
    }
}
