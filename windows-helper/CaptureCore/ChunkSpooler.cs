using System.Text.Json;

namespace AGB.CaptureCore;

/// <summary>
/// Accumulates interleaved PCM16 bytes for one capture session and writes
/// standalone WAV chunk files (<c>chunk-000000.wav</c>, …) of <c>ChunkSeconds</c>
/// audio each into the session's spool directory, updating <c>manifest.json</c>
/// after every state change (FR-CALL-TRX-1, NFR-CALL-REL-1/3).
///
/// All file writes get a current-user ACL (NFR-CALL-SEC-1). The manifest is
/// written atomically (temp file + replace). A spooler can be re-opened from
/// disk after a crash and resumes sequence numbering from the files that
/// survived.
///
/// 1:1 port of <c>ChunkSpooler.swift</c>.
/// </summary>
public sealed class ChunkSpooler
{
    public enum SpoolerErrorKind
    {
        DirectoryUnavailable,
        ManifestMissing,
        ManifestCorrupt,
        IoFailure,
    }

    public sealed class SpoolerException : Exception
    {
        public SpoolerErrorKind Kind { get; }
        public SpoolerException(SpoolerErrorKind kind, string message) : base(message) => Kind = kind;

        public static SpoolerException DirectoryUnavailable(string p) =>
            new(SpoolerErrorKind.DirectoryUnavailable, $"Spool directory unavailable: {p}");
        public static SpoolerException ManifestMissing(string p) =>
            new(SpoolerErrorKind.ManifestMissing, $"manifest.json missing in {p}");
        public static SpoolerException ManifestCorrupt(string why) =>
            new(SpoolerErrorKind.ManifestCorrupt, $"manifest.json corrupt: {why}");
        public static SpoolerException IoFailure(string why) =>
            new(SpoolerErrorKind.IoFailure, $"Spool I/O failure: {why}");
    }

    public const string ManifestFileName = "manifest.json";

    public string Directory { get; }
    public int ChunkBytes { get; }

    private readonly object _lock = new();
    private SessionManifest _manifest;
    /// <summary>PCM bytes appended but not yet written to a chunk file.</summary>
    private readonly List<byte> _pending = new();

    // -------------------------------------------------------- Create / reopen

    /// <summary>Create a brand-new spool in <paramref name="directory"/> (which must already exist).</summary>
    public ChunkSpooler(string directory, SessionManifest manifest)
    {
        Directory = directory;
        _manifest = manifest;
        ChunkBytes = Math.Max(1, manifest.ChunkSeconds) * AudioConstants.BytesPerSecond;
        PersistManifest();
    }

    /// <summary>
    /// Re-open a spool that already exists on disk. Reconciles the manifest's
    /// <c>seqsWritten</c> against the chunk files actually present (a crash can
    /// lose a manifest write but not the rename-completed chunk before it, and
    /// vice versa). Resumes seq numbering after the highest surviving chunk.
    /// </summary>
    public static ChunkSpooler OpenExisting(string directory)
    {
        string manifestPath = Path.Combine(directory, ManifestFileName);
        if (!File.Exists(manifestPath))
            throw SpoolerException.ManifestMissing(directory);

        SessionManifest manifest;
        try
        {
            byte[] data = File.ReadAllBytes(manifestPath);
            manifest = JsonSerializer.Deserialize<SessionManifest>(data, JsonDefaults.Lenient)
                       ?? throw SpoolerException.ManifestCorrupt("null manifest");
        }
        catch (SpoolerException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw SpoolerException.ManifestCorrupt(ex.ToString());
        }

        // Reconcile with files on disk: a chunk only counts if its file exists.
        var onDisk = ChunkSeqsOnDisk(directory);
        var written = manifest.SeqsWritten.ToHashSet();
        written.UnionWith(onDisk);
        var reconciled = written.Where(onDisk.Contains).OrderBy(s => s).ToList();
        manifest.SeqsWritten = reconciled;
        manifest.SeqsUploaded = manifest.SeqsUploaded.Where(reconciled.Contains).OrderBy(s => s).ToList();

        return new ChunkSpooler(directory, manifest, reopened: true);
    }

    // Private ctor used by OpenExisting so it persists the reconciled manifest.
    private ChunkSpooler(string directory, SessionManifest manifest, bool reopened)
    {
        Directory = directory;
        _manifest = manifest;
        ChunkBytes = Math.Max(1, manifest.ChunkSeconds) * AudioConstants.BytesPerSecond;
        PersistManifest();
    }

    // ------------------------------------------------------------ Introspection

    public SessionManifest Snapshot
    {
        get { lock (_lock) { return Clone(_manifest); } }
    }

    public string LocalId => Snapshot.SessionLocalId;

    /// <summary>PCM bytes buffered in memory, not yet in any chunk file.</summary>
    public int PendingByteCount
    {
        get { lock (_lock) { return _pending.Count; } }
    }

    /// <summary>Total seconds of audio spooled (chunk files + in-memory remainder).</summary>
    public double SpooledSeconds
    {
        get
        {
            lock (_lock)
            {
                long fileBytes = SpooledPcmBytes(Directory, _manifest.SeqsWritten);
                return (double)(fileBytes + _pending.Count) / AudioConstants.BytesPerSecond;
            }
        }
    }

    public string ChunkPath(int seq) => Path.Combine(Directory, ChunkFileName(seq));

    public static string ChunkFileName(int seq) => $"chunk-{seq:D6}.wav";

    // -------------------------------------------------------------- Audio ingest

    /// <summary>
    /// Append interleaved PCM16 bytes. Writes a chunk file every time
    /// <see cref="ChunkBytes"/> of audio have accumulated.
    /// </summary>
    public void Append(ReadOnlySpan<byte> pcm)
    {
        if (pcm.IsEmpty) return;
        lock (_lock)
        {
            _pending.AddRange(pcm.ToArray());
            while (_pending.Count >= ChunkBytes)
            {
                var chunk = _pending.GetRange(0, ChunkBytes);
                WriteChunk(chunk);
                _pending.RemoveRange(0, ChunkBytes);
            }
        }
    }

    /// <summary>Write any in-memory remainder as a final (short) chunk.</summary>
    public void Flush()
    {
        lock (_lock)
        {
            if (_pending.Count == 0) return;
            WriteChunk(_pending);
            _pending.Clear();
        }
    }

    /// <summary>
    /// FR-CALL-CAP-8 v1 semantics ("off the record, last N"): drop up to
    /// <paramref name="maxBytes"/> of the *un-uploaded* tail — first the in-memory
    /// remainder, then trailing chunk files that have not been uploaded yet.
    /// Already uploaded chunks are left alone in v1. Returns bytes dropped.
    /// </summary>
    public int DiscardUnuploadedTail(int maxBytes)
    {
        lock (_lock)
        {
            int budget = maxBytes;
            int dropped = 0;

            int fromPending = Math.Min(_pending.Count, budget);
            if (fromPending > 0)
            {
                _pending.RemoveRange(_pending.Count - fromPending, fromPending);
                budget -= fromPending;
                dropped += fromPending;
            }

            var uploaded = _manifest.SeqsUploaded.ToHashSet();
            var written = _manifest.SeqsWritten.OrderBy(s => s).ToList();
            while (budget > 0 && written.Count > 0)
            {
                int last = written[^1];
                if (uploaded.Contains(last)) break;
                string path = ChunkPath(last);
                int size = PcmBytesOfChunk(path);
                if (size > budget) break; // partial chunk drops not supported in v1
                TryDelete(path);
                written.RemoveAt(written.Count - 1);
                budget -= size;
                dropped += size;
            }
            _manifest.SeqsWritten = written;
            PersistManifest();
            return dropped;
        }
    }

    /// <summary>Convenience: discard the last <paramref name="seconds"/> of un-uploaded audio.</summary>
    public int DiscardUnuploadedTail(TimeSpan duration) =>
        DiscardUnuploadedTail((int)duration.TotalSeconds * AudioConstants.BytesPerSecond);

    // ---------------------------------------------------------- Lifecycle mutations

    public void SetServerSessionId(string id)
    {
        lock (_lock)
        {
            _manifest.ServerSessionId = id;
            PersistManifest();
        }
    }

    public void MarkUploaded(int seq)
    {
        lock (_lock)
        {
            if (!_manifest.SeqsUploaded.Contains(seq))
            {
                _manifest.SeqsUploaded.Add(seq);
                _manifest.SeqsUploaded.Sort();
            }
            PersistManifest();
        }
    }

    /// <summary>Mark the call ended. Duration is derived from spooled bytes unless given.</summary>
    public void MarkEnded(DateTimeOffset? endedAt = null, int? durationSecs = null, bool partial = false)
    {
        lock (_lock)
        {
            _manifest.EndedAt = Iso8601.String(endedAt ?? DateTimeOffset.UtcNow);
            if (durationSecs is { } d)
            {
                _manifest.DurationSecs = d;
            }
            else
            {
                long fileBytes = SpooledPcmBytes(Directory, _manifest.SeqsWritten);
                _manifest.DurationSecs = (int)Math.Round((double)(fileBytes + _pending.Count) / AudioConstants.BytesPerSecond);
            }
            if (partial) _manifest.Partial = true;
            PersistManifest();
        }
    }

    public void MarkFinalized()
    {
        lock (_lock)
        {
            _manifest.Finalized = true;
            PersistManifest();
        }
    }

    // ----------------------------------------------------------------- Internals

    /// <summary>Write one chunk file (canonical WAV) and record it in the manifest.</summary>
    private void WriteChunk(List<byte> pcm)
    {
        int seq = (_manifest.SeqsWritten.Count > 0 ? _manifest.SeqsWritten.Max() : -1) + 1;
        byte[] wav = WavCodec.Wrap(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(pcm));
        string path = ChunkPath(seq);
        try
        {
            File.WriteAllBytes(path, wav);
            FilePermissions.RestrictToCurrentUser(path, isDirectory: false);
        }
        catch (Exception ex)
        {
            throw SpoolerException.IoFailure($"could not write {Path.GetFileName(path)}: {ex.Message}");
        }
        _manifest.SeqsWritten.Add(seq);
        _manifest.SeqsWritten.Sort();
        PersistManifest();
    }

    /// <summary>Atomic, current-user-ACL manifest write: temp file, then replace.</summary>
    private void PersistManifest()
    {
        byte[] data;
        try
        {
            data = JsonSerializer.SerializeToUtf8Bytes(_manifest, JsonDefaults.Pretty);
        }
        catch (Exception ex)
        {
            throw SpoolerException.IoFailure($"manifest encode: {ex.Message}");
        }

        string path = Path.Combine(Directory, ManifestFileName);
        string tmp = Path.Combine(Directory, ".manifest.json.tmp");
        try
        {
            File.WriteAllBytes(tmp, data);
            FilePermissions.RestrictToCurrentUser(tmp, isDirectory: false);
            File.Move(tmp, path, overwrite: true);
            FilePermissions.RestrictToCurrentUser(path, isDirectory: false);
        }
        catch (Exception ex)
        {
            throw SpoolerException.IoFailure($"manifest write: {ex.Message}");
        }
    }

    private static HashSet<int> ChunkSeqsOnDisk(string directory)
    {
        var seqs = new HashSet<int>();
        IEnumerable<string> names;
        try { names = System.IO.Directory.EnumerateFiles(directory); }
        catch { return seqs; }

        foreach (string full in names)
        {
            string name = Path.GetFileName(full);
            if (name.StartsWith("chunk-", StringComparison.Ordinal) &&
                name.EndsWith(".wav", StringComparison.Ordinal))
            {
                string digits = name.Substring("chunk-".Length, name.Length - "chunk-".Length - ".wav".Length);
                if (int.TryParse(digits, out int seq)) seqs.Add(seq);
            }
        }
        return seqs;
    }

    private static int PcmBytesOfChunk(string path)
    {
        try
        {
            long size = new FileInfo(path).Length;
            return (int)Math.Max(0, size - AudioConstants.WavHeaderBytes);
        }
        catch
        {
            return 0;
        }
    }

    private static long SpooledPcmBytes(string directory, IEnumerable<int> seqs)
    {
        long total = 0;
        foreach (int seq in seqs)
            total += PcmBytesOfChunk(Path.Combine(directory, ChunkFileName(seq)));
        return total;
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* best-effort */ }
    }

    private static SessionManifest Clone(SessionManifest m) => new(
        m.SessionLocalId,
        m.StartedAtDate ?? DateTimeOffset.UnixEpoch,
        m.ServerSessionId,
        m.SourceApp,
        new List<int>(m.SeqsWritten),
        new List<int>(m.SeqsUploaded),
        m.Finalized,
        m.EndedAtDate,
        m.DurationSecs,
        m.Partial,
        m.ChunkSeconds)
    {
        // Preserve the exact on-the-wire strings (avoid round-trip drift).
        StartedAt = m.StartedAt,
        EndedAt = m.EndedAt,
    };
}
