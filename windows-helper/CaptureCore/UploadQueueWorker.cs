namespace AGB.CaptureCore;

/// <summary>
/// Async upload loop. State is derived entirely from the spool on disk
/// (manifest + chunk files), never process memory, so it is crash-safe by
/// construction (NFR-CALL-REL-1/3, FR-CALL-OPS-5).
///
/// Per pass it scans <see cref="SpoolStore.PendingSessions"/> (oldest first —
/// order preserved, FR-CALL-TRX-2) and, for each session:
///   1. creates the server session if serverSessionId is missing,
///   2. uploads un-uploaded seqs in ascending order (PUT is idempotent),
///   3. when the session has ended and everything is uploaded, finalizes (with
///      the protocol's 409 missing-chunks recovery), records the result and
///      deletes the spool dir,
///   4. abandons + deletes sessions that ended with zero audio.
///
/// Network failures abort the pass (the link is down for everyone); the
/// forever-loop backs off exponentially (1 s → 60 s cap) and retries. Per-session
/// HTTP errors are recorded and do not block other sessions.
///
/// 1:1 port of <c>UploadQueueWorker.swift</c>.
/// </summary>
public sealed class UploadQueueWorker
{
    public sealed record Outcome(string LocalId, string ServerSessionId, FinalizeResult Finalize, DateTimeOffset At);

    public sealed class PassResult
    {
        public int SessionsSeen { get; set; }
        public int ChunksUploaded { get; set; }
        public List<Outcome> Outcomes { get; } = new();
        public List<(string LocalId, string Message)> Errors { get; } = new();
        public bool AbortedByNetwork { get; set; }

        public bool Clean => Errors.Count == 0 && !AbortedByNetwork;
        public bool DidWork => ChunksUploaded > 0 || Outcomes.Count > 0;
    }

    public abstract record WorkerState
    {
        public sealed record Idle : WorkerState;
        public sealed record Uploading : WorkerState;
        public sealed record WaitingRetry(TimeSpan Delay, string Reason) : WorkerState;
    }

    // Observability hooks (tray state, simulate mode).
    public Action<WorkerState>? OnStateChange { get; set; }
    public Action<string, int>? OnChunkUploaded { get; set; }
    public Action<Outcome>? OnSessionFinalized { get; set; }
    public Action<string>? OnError { get; set; }

    private readonly List<Outcome> _recentOutcomes = new();
    public IReadOnlyList<Outcome> RecentOutcomes { get { lock (_stateLock) { return _recentOutcomes.ToList(); } } }
    public string? LastError { get { lock (_stateLock) { return _lastError; } } }
    private string? _lastError;

    private readonly SpoolStore _store;
    private readonly Func<CaptureApiClient?> _clientProvider;
    private readonly HelperLog _log;

    private readonly object _stateLock = new();
    private volatile bool _stopped;
    /// <summary>Wakes the forever-loop early (e.g. right after a call ends).</summary>
    private volatile bool _kicked;

    public UploadQueueWorker(SpoolStore store, Func<CaptureApiClient?> clientProvider, HelperLog? log = null)
    {
        _store = store;
        _clientProvider = clientProvider;
        _log = log ?? HelperLog.Shared;
    }

    public void Stop() => _stopped = true;
    public void Kick() => _kicked = true;

    private bool ConsumeKick()
    {
        bool was = _kicked;
        _kicked = false;
        return was;
    }

    // ------------------------------------------------------------- Forever loop

    /// <summary>
    /// Poll + retry forever. <paramref name="pollInterval"/> is the idle re-scan
    /// cadence (uploads in-progress recordings incrementally, FR-CALL-TRX-1).
    /// </summary>
    public async Task RunForeverAsync(TimeSpan? pollInterval = null, CancellationToken ct = default)
    {
        TimeSpan poll = pollInterval ?? TimeSpan.FromSeconds(5);
        var backoff = new ExponentialBackoff();
        while (!_stopped && !ct.IsCancellationRequested)
        {
            PassResult result = await ProcessPendingOnceAsync(ct).ConfigureAwait(false);
            if (result.Clean)
            {
                backoff.Reset();
                if (result.DidWork) continue; // immediately re-scan after progress
                await SleepInterruptiblyAsync(poll, ct).ConfigureAwait(false);
            }
            else
            {
                TimeSpan delay = backoff.NextDelay();
                string reason = result.Errors.Count > 0 ? result.Errors[^1].Message : "network unreachable";
                EmitState(new WorkerState.WaitingRetry(delay, reason));
                _log.Warn($"upload pass failed ({reason}); retrying in {(int)delay.TotalSeconds}s", category: "upload");
                await SleepInterruptiblyAsync(delay, ct).ConfigureAwait(false);
            }
        }
    }

    private async Task SleepInterruptiblyAsync(TimeSpan seconds, CancellationToken ct)
    {
        DateTimeOffset deadline = DateTimeOffset.UtcNow + seconds;
        while (DateTimeOffset.UtcNow < deadline && !_stopped && !ct.IsCancellationRequested)
        {
            if (ConsumeKick()) return;
            try { await Task.Delay(TimeSpan.FromMilliseconds(200), ct).ConfigureAwait(false); }
            catch (OperationCanceledException) { return; }
        }
    }

    // ------------------------------------------------------------- Single pass

    public async Task<PassResult> ProcessPendingOnceAsync(CancellationToken ct = default)
    {
        var result = new PassResult();
        CaptureApiClient? client = _clientProvider();
        if (client is null)
        {
            result.Errors.Add(("-", "helper not configured (CRM URL + token)"));
            RecordError("helper not configured");
            return result;
        }

        IReadOnlyList<ChunkSpooler> pending;
        try
        {
            pending = _store.PendingSessions();
        }
        catch (Exception ex)
        {
            result.Errors.Add(("-", $"spool scan failed: {ex.Message}"));
            RecordError($"spool scan failed: {ex.Message}");
            return result;
        }

        if (pending.Count == 0)
        {
            EmitState(new WorkerState.Idle());
            return result;
        }

        EmitState(new WorkerState.Uploading());

        foreach (var spooler in pending)
        {
            result.SessionsSeen++;
            try
            {
                await ProcessSessionAsync(spooler, client, result, ct).ConfigureAwait(false);
            }
            catch (CaptureApiException apiError) when (apiError.IsNetworkFailure)
            {
                // Whole link likely down — abort the pass, retry everything later
                // from disk state. Order is preserved.
                result.AbortedByNetwork = true;
                result.Errors.Add((spooler.LocalId, apiError.Message));
                RecordError(apiError.Message);
                break;
            }
            catch (Exception ex)
            {
                // Session-specific failure (4xx/5xx/decode) — record, continue
                // with other sessions so one poisoned spool can't dam the queue.
                result.Errors.Add((spooler.LocalId, ex.Message));
                RecordError($"session {spooler.LocalId}: {ex.Message}");
            }
        }

        if (result.Clean) EmitState(new WorkerState.Idle());
        return result;
    }

    private async Task ProcessSessionAsync(ChunkSpooler spooler, CaptureApiClient client, PassResult result, CancellationToken ct)
    {
        SessionManifest snap = spooler.Snapshot;

        // Ended with zero audio (e.g. instant stop, crash before first chunk):
        // abandon any server session and drop the spool. Nothing to salvage.
        if (snap.EndedAt is not null && snap.SeqsWritten.Count == 0 && spooler.PendingByteCount == 0)
        {
            if (snap.ServerSessionId is { } serverId0)
            {
                try { await client.AbandonAsync(serverId0, ct).ConfigureAwait(false); }
                catch (CaptureApiException ex) when (ex.Kind == CaptureApiErrorKind.SessionNotFound) { /* already gone */ }
            }
            _log.Info($"dropped empty session {snap.SessionLocalId}", category: "upload");
            try { _store.DeleteSession(spooler); } catch { /* best-effort */ }
            return;
        }

        // 1. Ensure server session exists.
        if (snap.ServerSessionId is null)
        {
            var meta = new SessionMeta(snap);
            string serverId = await client.CreateSessionAsync(meta, ct).ConfigureAwait(false);
            spooler.SetServerSessionId(serverId);
            _log.Info($"session {snap.SessionLocalId} → server {serverId}", category: "upload");
            snap = spooler.Snapshot;
        }
        if (snap.ServerSessionId is not { } sessionId) return;

        // 2. Upload pending seqs in order.
        foreach (int seq in spooler.Snapshot.PendingUploadSeqs)
        {
            string path = spooler.ChunkPath(seq);
            await client.UploadChunkAsync(sessionId, seq, path, ct).ConfigureAwait(false);
            spooler.MarkUploaded(seq);
            result.ChunksUploaded++;
            OnChunkUploaded?.Invoke(snap.SessionLocalId, seq);
        }

        // 3. Finalize when the call has ended and everything is uploaded.
        snap = spooler.Snapshot;
        if (!snap.ReadyToFinalize) return;

        var body = new FinalizeBody(
            endedAtIso: snap.EndedAt ?? Iso8601.String(DateTimeOffset.UtcNow),
            durationSecs: snap.DurationSecs ?? (int)Math.Round(spooler.SpooledSeconds),
            totalChunks: snap.SeqsWritten.Count,
            partial: snap.Partial);

        FinalizeResult finalize = await client.FinalizeRecoveringAsync(
            sessionId,
            body,
            chunkFilePath: seq =>
            {
                string p = spooler.ChunkPath(seq);
                return File.Exists(p) ? p : null;
            },
            ct: ct).ConfigureAwait(false);

        spooler.MarkFinalized();
        var outcome = new Outcome(snap.SessionLocalId, sessionId, finalize, DateTimeOffset.UtcNow);
        RecordOutcome(outcome);
        result.Outcomes.Add(outcome);
        _log.Info($"finalized {snap.SessionLocalId}: {finalize.Title ?? "(untitled)"} [{finalize.RecordingId ?? "?"}]",
            category: "upload");

        // 4. Confirmed upload → local buffers deleted (NFR-CALL-SEC-1).
        _store.DeleteSession(spooler);
        OnSessionFinalized?.Invoke(outcome);
    }

    // ----------------------------------------------------------- Bookkeeping

    private void RecordOutcome(Outcome outcome)
    {
        lock (_stateLock)
        {
            _recentOutcomes.Add(outcome);
            if (_recentOutcomes.Count > 20) _recentOutcomes.RemoveAt(0);
            _lastError = null;
        }
    }

    private void RecordError(string message)
    {
        lock (_stateLock) { _lastError = message; }
        OnError?.Invoke(message);
    }

    private void EmitState(WorkerState state) => OnStateChange?.Invoke(state);
}
