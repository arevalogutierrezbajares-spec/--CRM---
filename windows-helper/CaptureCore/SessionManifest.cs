using System.Text.Json.Serialization;

namespace AGB.CaptureCore;

/// <summary>
/// On-disk state of a single capture session's spool directory.
///
/// The manifest (<c>manifest.json</c>) plus the chunk files on disk are the
/// *only* source of truth for upload state — never process memory — so a crash
/// or restart resumes exactly where the files say we were (NFR-CALL-REL-3,
/// FR-CALL-OPS-5).
///
/// 1:1 port of <c>SessionManifest.swift</c>. JSON property names are the exact
/// camelCase the Swift encoder produced, so manifests are wire-compatible across
/// the two helpers (not that they ever share a disk — but it keeps the contract
/// honest and the tests parallel).
/// </summary>
public sealed class SessionManifest
{
    /// <summary>Helper-generated id (GUID). Names the spool dir; stable across restarts.</summary>
    [JsonPropertyName("sessionLocalId")]
    public string SessionLocalId { get; set; }

    /// <summary>CRM session id, once <c>POST /api/capture/sessions</c> has succeeded.</summary>
    [JsonPropertyName("serverSessionId")]
    public string? ServerSessionId { get; set; }

    /// <summary>ISO-8601 call start (includes pre-roll: backdated to first buffered byte).</summary>
    [JsonPropertyName("startedAt")]
    public string StartedAt { get; set; }

    /// <summary>App that opened the microphone, when resolvable, else null.</summary>
    [JsonPropertyName("sourceApp")]
    public string? SourceApp { get; set; }

    /// <summary>Chunk seqs written to disk (contiguous from 0 by construction).</summary>
    [JsonPropertyName("seqsWritten")]
    public List<int> SeqsWritten { get; set; }

    /// <summary>Chunk seqs confirmed uploaded (200 from PUT).</summary>
    [JsonPropertyName("seqsUploaded")]
    public List<int> SeqsUploaded { get; set; }

    /// <summary>
    /// True once finalize succeeded (spool dir is deleted right after; a
    /// finalized manifest on disk means deletion was interrupted).
    /// </summary>
    [JsonPropertyName("finalized")]
    public bool Finalized { get; set; }

    /// <summary>ISO-8601 call end. null while recording; set by stop or crash-adoption.</summary>
    [JsonPropertyName("endedAt")]
    public string? EndedAt { get; set; }

    /// <summary>Seconds of audio captured (PCM bytes / 64 000). Set at end.</summary>
    [JsonPropertyName("durationSecs")]
    public int? DurationSecs { get; set; }

    /// <summary>True when this session was salvaged after a crash (FR-CALL-OPS-5).</summary>
    [JsonPropertyName("partial")]
    public bool Partial { get; set; }

    /// <summary>
    /// Chunk size in seconds used for this session (30 in production; overridable
    /// in simulate mode). Persisted so reopen chunks identically.
    /// </summary>
    [JsonPropertyName("chunkSeconds")]
    public int ChunkSeconds { get; set; }

    /// <summary>Parameterless ctor for the JSON deserializer.</summary>
    [JsonConstructor]
    public SessionManifest()
    {
        SessionLocalId = string.Empty;
        StartedAt = string.Empty;
        SeqsWritten = new List<int>();
        SeqsUploaded = new List<int>();
        ChunkSeconds = AudioConstants.ChunkSeconds;
    }

    public SessionManifest(
        string sessionLocalId,
        DateTimeOffset startedAt,
        string? serverSessionId = null,
        string? sourceApp = null,
        List<int>? seqsWritten = null,
        List<int>? seqsUploaded = null,
        bool finalized = false,
        DateTimeOffset? endedAt = null,
        int? durationSecs = null,
        bool partial = false,
        int chunkSeconds = AudioConstants.ChunkSeconds)
    {
        SessionLocalId = sessionLocalId;
        ServerSessionId = serverSessionId;
        StartedAt = Iso8601.String(startedAt);
        SourceApp = sourceApp;
        SeqsWritten = seqsWritten ?? new List<int>();
        SeqsUploaded = seqsUploaded ?? new List<int>();
        Finalized = finalized;
        EndedAt = endedAt is { } e ? Iso8601.String(e) : null;
        DurationSecs = durationSecs;
        Partial = partial;
        ChunkSeconds = chunkSeconds;
    }

    [JsonIgnore]
    public DateTimeOffset? StartedAtDate => Iso8601.Date(StartedAt);

    [JsonIgnore]
    public DateTimeOffset? EndedAtDate => Iso8601.Date(EndedAt);

    /// <summary>Seqs written but not yet confirmed uploaded, ascending.</summary>
    [JsonIgnore]
    public IReadOnlyList<int> PendingUploadSeqs
    {
        get
        {
            var uploaded = SeqsUploaded.ToHashSet();
            return SeqsWritten.Where(s => !uploaded.Contains(s)).OrderBy(s => s).ToList();
        }
    }

    /// <summary>Ready for finalize: ended, everything written is uploaded, not yet finalized.</summary>
    [JsonIgnore]
    public bool ReadyToFinalize =>
        EndedAt is not null && !Finalized && PendingUploadSeqs.Count == 0 && SeqsWritten.Count > 0;
}
