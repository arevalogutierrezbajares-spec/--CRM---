import Foundation

/// Async upload loop. State is derived entirely from the spool on disk
/// (manifest + chunk files), never process memory, so it is crash-safe by
/// construction (NFR-CALL-REL-1/3, FR-CALL-OPS-5).
///
/// Per pass it scans `SpoolStore.pendingSessions()` (oldest first — order
/// preserved, FR-CALL-TRX-2) and, for each session:
///   1. creates the server session if `serverSessionId` is missing,
///   2. uploads un-uploaded seqs in ascending order (PUT is idempotent),
///   3. when the session has ended and everything is uploaded, finalizes
///      (with the protocol's 409 missing-chunks recovery), records the result
///      and deletes the spool dir,
///   4. abandons + deletes sessions that ended with zero audio.
///
/// Network failures abort the pass (the link is down for everyone); the
/// forever-loop backs off exponentially (1 s → 60 s cap) and retries.
/// Per-session HTTP errors are recorded and do not block other sessions.
public final class UploadQueueWorker {

    public struct Outcome {
        public let localId: String
        public let serverSessionId: String
        public let finalize: CaptureAPIClient.FinalizeResult
        public let at: Date
    }

    public struct PassResult {
        public var sessionsSeen = 0
        public var chunksUploaded = 0
        public var outcomes: [Outcome] = []
        public var errors: [(localId: String, message: String)] = []
        public var abortedByNetwork = false

        public var clean: Bool { errors.isEmpty && !abortedByNetwork }
        public var didWork: Bool { chunksUploaded > 0 || !outcomes.isEmpty }
    }

    public enum WorkerState: Equatable {
        case idle
        case uploading
        case waitingRetry(seconds: TimeInterval, reason: String)
        /// Uploads have been failing continuously past the stall threshold —
        /// the queue keeps retrying (a call is never dropped), but we escalate
        /// to a visible alert so the founder is never silently blind to a call
        /// that can't file (the failure mode that hid a 77-min call for hours).
        case stalled(reason: String)
    }

    // Observability hooks (menu bar state, simulate mode).
    public var onStateChange: ((WorkerState) -> Void)?
    public var onChunkUploaded: ((_ localId: String, _ seq: Int) -> Void)?
    public var onSessionFinalized: ((Outcome) -> Void)?
    /// Test hook (simulate --precomputed): a pre-diarized transcript to send
    /// verbatim as the finalize precomputedTranscript, bypassing local STT.
    /// Lets the E2E verify per-speaker synthesis on a KNOWN 10-voice transcript
    /// without depending on the HF-token-gated diarizer. Nil in production.
    public var precomputedOverride: CaptureAPIClient.FinalizeBody.PrecomputedTranscript?
    public var onError: ((String) -> Void)?
    /// Optional: persist a local copy of the assembled audio right before the
    /// spool is deleted (transcript-only mode keeps audio only on this Mac).
    /// Best-effort — runs on the worker task; a failure here must never block
    /// filing or queue progress, so the caller swallows + logs its own errors.
    public var archiveLocally: ((ChunkSpooler, CaptureAPIClient.FinalizeResult) -> Void)?
    /// Fired ONCE per stall episode (continuous failures past the threshold),
    /// so the app can post a single user notification rather than log spam.
    public var onStalled: ((String) -> Void)?

    public private(set) var recentOutcomes: [Outcome] = []
    public private(set) var lastError: String?

    private let store: SpoolStore
    private let clientProvider: () -> CaptureAPIClient?
    private let log: HelperLog
    private var stopped = false
    private let stateLock = NSLock()
    /// Wakes the forever-loop early (e.g. right after a call ends).
    private var kicked = false

    public init(store: SpoolStore,
                clientProvider: @escaping () -> CaptureAPIClient?,
                log: HelperLog = .shared) {
        self.store = store
        self.clientProvider = clientProvider
        self.log = log
    }

    public func stop() {
        stateLock.lock(); stopped = true; stateLock.unlock()
    }

    public func kick() {
        stateLock.lock(); kicked = true; stateLock.unlock()
    }

    private var isStopped: Bool {
        stateLock.lock(); defer { stateLock.unlock() }
        return stopped
    }

    private func consumeKick() -> Bool {
        stateLock.lock(); defer { stateLock.unlock() }
        let was = kicked
        kicked = false
        return was
    }

    // MARK: - Forever loop

    /// Poll + retry forever. `pollInterval` is the idle re-scan cadence
    /// (uploads in-progress recordings incrementally, FR-CALL-TRX-1).
    /// `stallThreshold` is how long uploads may fail continuously before we
    /// escalate from a quiet retry to a visible `.stalled` alert (the queue
    /// still retries forever — escalation is purely about surfacing it).
    public func runForever(
        pollInterval: TimeInterval = 5,
        stallThreshold: TimeInterval = 600
    ) async {
        var backoff = ExponentialBackoff()
        var firstFailureAt: Date?
        var stallNotified = false
        while !isStopped {
            let result = await processPendingOnce()
            if result.clean {
                backoff.reset()
                firstFailureAt = nil
                stallNotified = false
                if result.didWork { continue } // immediately re-scan after progress
                await sleepInterruptibly(pollInterval)
            } else {
                let delay = backoff.nextDelay()
                let reason = result.errors.last?.message ?? "network unreachable"
                let since = firstFailureAt ?? Date()
                firstFailureAt = since
                let stalledFor = Date().timeIntervalSince(since)
                if stalledFor >= stallThreshold {
                    // Past the threshold: surface a visible alert. Fire the
                    // user-notification hook only once per episode.
                    emitState(.stalled(reason: reason))
                    if !stallNotified {
                        stallNotified = true
                        log.warn("upload STALLED \(Int(stalledFor))s on: \(reason) — surfacing alert", category: "upload")
                        onStalled?(reason)
                    }
                } else {
                    emitState(.waitingRetry(seconds: delay, reason: reason))
                }
                log.warn("upload pass failed (\(reason)); retrying in \(Int(delay))s", category: "upload")
                await sleepInterruptibly(delay)
            }
        }
    }

    private func sleepInterruptibly(_ seconds: TimeInterval) async {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline, !isStopped {
            if consumeKick() { return }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    // MARK: - Single pass

    @discardableResult
    public func processPendingOnce() async -> PassResult {
        var result = PassResult()
        guard let client = clientProvider() else {
            result.errors.append((localId: "-", message: "helper not configured (CRM URL + token)"))
            recordError("helper not configured")
            return result
        }

        let pending: [ChunkSpooler]
        do {
            pending = try store.pendingSessions()
        } catch {
            result.errors.append((localId: "-", message: "spool scan failed: \(error.localizedDescription)"))
            recordError("spool scan failed: \(error.localizedDescription)")
            return result
        }

        guard !pending.isEmpty else {
            emitState(.idle)
            return result
        }

        emitState(.uploading)

        for spooler in pending {
            result.sessionsSeen += 1
            do {
                try await process(spooler, client: client, result: &result)
            } catch let apiError as CaptureAPIClient.APIError where apiError.isNetworkFailure {
                // Whole link likely down — abort the pass, retry everything later
                // from disk state. Order is preserved.
                result.abortedByNetwork = true
                result.errors.append((localId: spooler.localId,
                                      message: apiError.localizedDescription))
                recordError(apiError.localizedDescription)
                break
            } catch {
                // Session-specific failure (4xx/5xx/decode) — record, continue
                // with other sessions so one poisoned spool can't dam the queue.
                result.errors.append((localId: spooler.localId,
                                      message: error.localizedDescription))
                recordError("session \(spooler.localId): \(error.localizedDescription)")
            }
        }

        if result.clean { emitState(.idle) }
        return result
    }

    private func process(_ spooler: ChunkSpooler,
                         client: CaptureAPIClient,
                         result: inout PassResult) async throws {
        var snap = spooler.snapshot

        // Ended with zero audio (e.g. instant stop, crash before first chunk):
        // abandon any server session and drop the spool. Nothing to salvage.
        if snap.endedAt != nil && snap.seqsWritten.isEmpty && spooler.pendingByteCount == 0 {
            if let serverId = snap.serverSessionId {
                do {
                    try await client.abandon(sessionId: serverId)
                } catch CaptureAPIClient.APIError.sessionNotFound {
                    // already gone server-side — fine
                }
            }
            log.info("dropped empty session \(snap.sessionLocalId)", category: "upload")
            try? store.deleteSession(spooler)
            return
        }

        // 1. Ensure server session exists.
        if snap.serverSessionId == nil {
            let meta = CaptureAPIClient.SessionMeta(manifest: snap)
            let serverId = try await client.createSession(meta: meta)
            try spooler.setServerSessionId(serverId)
            log.info("session \(snap.sessionLocalId) → server \(serverId)", category: "upload")
            snap = spooler.snapshot
        }
        guard let serverId = snap.serverSessionId else { return }

        // 2. Upload pending seqs in order.
        for seq in spooler.snapshot.pendingUploadSeqs {
            let url = spooler.chunkURL(seq: seq)
            try await client.uploadChunk(sessionId: serverId, seq: seq, fileURL: url)
            try spooler.markUploaded(seq: seq)
            result.chunksUploaded += 1
            onChunkUploaded?(snap.sessionLocalId, seq)
        }

        // 3. Finalize when the call has ended and everything is uploaded.
        snap = spooler.snapshot
        guard snap.readyToFinalize else { return }

        // Mic-only kinds (meeting, speakerphone): try free local STT+diarize
        // before finalize (D2/D3). Both put all speech on L, which is exactly
        // what MonoWavAssembler.assembleLeftChannel expects — and local Whisper
        // diarization is the only way to separate speakers on a mixed channel.
        var precomputed: CaptureAPIClient.FinalizeBody.PrecomputedTranscript? = nil
        if let override = precomputedOverride {
            precomputed = override
        } else if !snap.kind.capturesSystemAudio {
            precomputed = tryLocalTranscribe(spooler: spooler)
        }

        let body = CaptureAPIClient.FinalizeBody(
            endedAtISO: snap.endedAt ?? ISO8601.string(from: Date()),
            durationSecs: snap.durationSecs ?? Int(spooler.spooledSeconds.rounded()),
            totalChunks: snap.seqsWritten.count,
            partial: snap.partial,
            contactName: snap.contactName,
            precomputedTranscript: precomputed,
            highlights: snap.highlights ?? [],
            notes: snap.notes ?? [],
            terms: snap.terms ?? [],
            agenda: snap.agenda ?? [],
            coverage: snap.coverage ?? [],
            roster: snap.roster ?? [],
            themes: Self.themeDefs(for: snap)
        )

        let finalize = try await client.finalizeRecovering(
            sessionId: serverId,
            body: body
        ) { seq in
            let url = spooler.chunkURL(seq: seq)
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }

        try spooler.markFinalized()
        let outcome = Outcome(localId: snap.sessionLocalId,
                              serverSessionId: serverId,
                              finalize: finalize,
                              at: Date())
        recordOutcome(outcome)
        result.outcomes.append(outcome)
        log.info("finalized \(snap.sessionLocalId): \(finalize.title ?? "(untitled)") [\(finalize.recordingId ?? "?")]",
                 category: "upload")

        // 4a. Optional local archive BEFORE the spool is removed (the chunks are
        // the only audio source once filing skipped CRM storage).
        archiveLocally?(spooler, finalize)

        // 4b. Confirmed upload → local buffers deleted (NFR-CALL-SEC-1).
        try store.deleteSession(spooler)
        onSessionFinalized?(outcome)
    }

    // MARK: - Local free STT (meetings)

    /// Assemble mono L channel and run WhisperX/Vibe/whisper.cpp when configured.
    /// Returns nil on any failure so finalize can fall back to Deepgram.
    private func tryLocalTranscribe(spooler: ChunkSpooler) -> CaptureAPIClient.FinalizeBody.PrecomputedTranscript? {
        let cfg = HelperConfig.effective()
        guard cfg.localTranscribeEnabled else {
            log.info("local-stt disabled in config", category: "local-stt")
            return nil
        }
        let backend = LocalTranscribeBackendId(rawValue: cfg.localTranscribeBackend) ?? .auto
        if backend == .off { return nil }

        let monoURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-mono-\(spooler.localId).wav")
        defer { try? FileManager.default.removeItem(at: monoURL) }

        do {
            try MonoWavAssembler.assembleLeftChannel(spooler: spooler, dest: monoURL)
        } catch {
            log.warn("local-stt mono assemble failed: \(error.localizedDescription)", category: "local-stt")
            return nil
        }

        emitState(.uploading) // keep UI busy indicator while local STT runs
        onError?("Transcribing locally (free, offline)…")

        do {
            let opts = LocalTranscribeRunner.Opts(
                backend: backend,
                explicitCommand: cfg.localTranscribeCommand,
                model: cfg.localTranscribeModel,
                timeoutSecs: cfg.localTranscribeTimeoutSecs,
                repoRootHint: URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("AGB-CRM"),
                // Per-session roster hint wins over the global config default —
                // a 10-name roster tells pyannote to look for ~11 clusters.
                maxSpeakers: spooler.speakerHint > 0 ? spooler.speakerHint : cfg.localTranscribeMaxSpeakers
            )
            let result = try LocalTranscribeRunner.transcribe(wav: monoURL, opts: opts)
            log.info(
                "local-stt ok engine=\(result.engine) utterances=\(result.utterances.count)",
                category: "local-stt"
            )
            return CaptureAPIClient.FinalizeBody.PrecomputedTranscript(result)
        } catch {
            log.warn("local-stt failed: \(error.localizedDescription) — cloud finalize will run", category: "local-stt")
            return nil
        }
    }

    // MARK: - Bookkeeping

    private func recordOutcome(_ outcome: Outcome) {
        stateLock.lock()
        recentOutcomes.append(outcome)
        if recentOutcomes.count > 20 { recentOutcomes.removeFirst() }
        lastError = nil
        stateLock.unlock()
    }

    private func recordError(_ message: String) {
        stateLock.lock(); lastError = message; stateLock.unlock()
        onError?(message)
    }

    private func emitState(_ state: WorkerState) {
        onStateChange?(state)
    }
}


extension UploadQueueWorker {
    /// Theme definitions for the wire: every agenda item seeds a theme
    /// (agenda:true) and every distinct #tag on markers adds a live theme
    /// (label de-slugged). The server buckets evidence by these keys.
    static func themeDefs(for snap: SessionManifest) -> [CaptureAPIClient.FinalizeBody.ThemeDef] {
        var defs: [CaptureAPIClient.FinalizeBody.ThemeDef] = []
        var seen = Set<String>()
        for item in snap.agenda ?? [] where !item.key.isEmpty {
            guard seen.insert(item.key).inserted else { continue }
            defs.append(.init(key: item.key, label: item.label, agenda: true))
        }
        let markerKeys = (snap.notes ?? []).compactMap(\.themeKey)
            + (snap.highlights ?? []).compactMap(\.themeKey)
        for key in markerKeys where !key.isEmpty {
            guard seen.insert(key).inserted else { continue }
            defs.append(.init(key: key, label: ThemeTags.label(fromSlug: key), agenda: false))
        }
        return defs
    }
}
