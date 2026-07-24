import Foundation

/// Accumulates interleaved PCM16 bytes for one capture session and writes
/// standalone WAV chunk files (`chunk-000000.wav`, …) of `chunkSeconds` audio
/// each into the session's spool directory, updating `manifest.json` after
/// every state change (FR-CALL-TRX-1, NFR-CALL-REL-1/3).
///
/// All file writes are 0600 (NFR-CALL-SEC-1). The manifest is written
/// atomically (temp file + rename). A spooler can be re-opened from disk after
/// a crash and resumes sequence numbering from the files that survived.
public final class ChunkSpooler {
    public enum SpoolerError: Error, LocalizedError {
        case directoryUnavailable(String)
        case manifestMissing(String)
        case manifestCorrupt(String)
        case ioFailure(String)

        public var errorDescription: String? {
            switch self {
            case .directoryUnavailable(let p): return "Spool directory unavailable: \(p)"
            case .manifestMissing(let p): return "manifest.json missing in \(p)"
            case .manifestCorrupt(let why): return "manifest.json corrupt: \(why)"
            case .ioFailure(let why): return "Spool I/O failure: \(why)"
            }
        }
    }

    public let directory: URL
    public let chunkBytes: Int

    private let lock = NSRecursiveLock()
    private var manifestStorage: SessionManifest
    /// PCM bytes appended but not yet written to a chunk file.
    private var pending = Data()
    /// Total PCM bytes appended over the session's life (this process).
    private var appendedBytes: Int

    public static let manifestFileName = "manifest.json"

    // MARK: - Create / reopen

    /// Create a brand-new spool in `directory` (which must already exist).
    public init(directory: URL, manifest: SessionManifest) throws {
        self.directory = directory
        self.manifestStorage = manifest
        self.chunkBytes = max(1, manifest.chunkSeconds) * AudioConstants.bytesPerSecond
        self.appendedBytes = 0
        try persistManifest()
    }

    /// Re-open a spool that already exists on disk. Reconciles the manifest's
    /// `seqsWritten` against the chunk files actually present (a crash can lose
    /// a manifest write but not the rename-completed chunk before it; and
    /// vice versa). Resumes seq numbering after the highest surviving chunk.
    public init(openingDirectory directory: URL) throws {
        self.directory = directory
        let manifestURL = directory.appendingPathComponent(Self.manifestFileName)
        guard let data = FileManager.default.contents(atPath: manifestURL.path) else {
            throw SpoolerError.manifestMissing(directory.path)
        }
        do {
            self.manifestStorage = try JSONDecoder().decode(SessionManifest.self, from: data)
        } catch {
            throw SpoolerError.manifestCorrupt(String(describing: error))
        }
        self.chunkBytes = max(1, manifestStorage.chunkSeconds) * AudioConstants.bytesPerSecond

        // Sweep any partial temp files a crash may have left behind (they never
        // count as chunks, but don't let them accumulate).
        Self.removeTempFiles(in: directory)

        // Reconcile with files on disk. A chunk counts only if its file is both
        // present AND complete: a crash before the atomic rename can't leave a
        // truncated `chunk-*.wav`, but legacy spools (pre-atomic-write) or a
        // damaged filesystem can — an under-sized non-final chunk, or a final
        // chunk with no real PCM, would silently corrupt the upload. Drop those
        // seqs (and delete the bad file) so `seqsWritten` — and therefore the
        // finalize `totalChunks` (= `seqsWritten.count`) — reflects only audio
        // that is actually intact on disk.
        let onDisk = Self.chunkSeqsOnDisk(in: directory)
        let candidates = Set(manifestStorage.seqsWritten).union(onDisk).sorted()
        let maxSeq = candidates.max()
        var written: [Int] = []
        for seq in candidates {
            let url = directory.appendingPathComponent(Self.chunkFileName(seq: seq))
            guard onDisk.contains(seq) else {
                HelperLog.shared.warn(
                    "reopen: chunk seq \(seq) has no file on disk — dropping from seqsWritten",
                    category: "audio")
                continue
            }
            let size = Self.fileSize(at: url)
            let isFinal = (seq == maxSeq)
            guard Self.chunkFileIsComplete(size: size, isFinal: isFinal, chunkBytes: chunkBytes) else {
                HelperLog.shared.warn(
                    "reopen: chunk seq \(seq) is truncated (\(size) bytes, final=\(isFinal)) — dropping + deleting",
                    category: "audio")
                try? FileManager.default.removeItem(at: url)
                continue
            }
            written.append(seq)
        }
        manifestStorage.seqsWritten = written
        manifestStorage.seqsUploaded = manifestStorage.seqsUploaded.filter { written.contains($0) }.sorted()
        self.appendedBytes = (try? Self.spooledPCMBytes(in: directory, seqs: written)) ?? 0
        try persistManifest()
    }

    // MARK: - Introspection

    public var snapshot: SessionManifest {
        lock.lock(); defer { lock.unlock() }
        return manifestStorage
    }

    public var localId: String { snapshot.sessionLocalId }

    /// PCM bytes buffered in memory, not yet in any chunk file.
    public var pendingByteCount: Int {
        lock.lock(); defer { lock.unlock() }
        return pending.count
    }

    /// Total seconds of audio spooled (chunk files + in-memory remainder).
    public var spooledSeconds: Double {
        lock.lock(); defer { lock.unlock() }
        let fileBytes = (try? Self.spooledPCMBytes(in: directory, seqs: manifestStorage.seqsWritten)) ?? 0
        return Double(fileBytes + pending.count) / Double(AudioConstants.bytesPerSecond)
    }

    /// Current audio-timeline position in seconds, from the O(1) in-memory byte
    /// counter — no disk enumeration, so it holds the shared lock only for
    /// nanoseconds and never contends the capture path (unlike `spooledSeconds`).
    /// Includes pre-roll (it's flushed through `append`), matching the timeline
    /// the server stamps utterances against. Used to time-anchor live highlights.
    public var appendedSeconds: Double {
        lock.lock(); defer { lock.unlock() }
        return Double(appendedBytes) / Double(AudioConstants.bytesPerSecond)
    }

    public func chunkURL(seq: Int) -> URL {
        directory.appendingPathComponent(Self.chunkFileName(seq: seq))
    }

    public static func chunkFileName(seq: Int) -> String {
        String(format: "chunk-%06d.wav", seq)
    }

    // MARK: - Audio ingest

    /// Append interleaved PCM16 bytes. Writes a chunk file every time
    /// `chunkBytes` of audio have accumulated.
    public func append(_ pcm: Data) throws {
        guard !pcm.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        pending.append(pcm)
        appendedBytes += pcm.count
        while pending.count >= chunkBytes {
            let chunkPCM = pending.prefix(chunkBytes)
            try writeChunk(Data(chunkPCM))
            pending.removeFirst(chunkBytes)
        }
    }

    /// Write any in-memory remainder as a final (short) chunk.
    public func flush() throws {
        lock.lock(); defer { lock.unlock() }
        guard !pending.isEmpty else { return }
        try writeChunk(pending)
        pending.removeAll()
    }

    /// FR-CALL-CAP-8 v1 semantics ("off the record, last N"): drop up to
    /// `maxBytes` of the *un-uploaded* tail — first the in-memory remainder,
    /// then trailing chunk files that have not been uploaded yet. Already
    /// uploaded chunks are left alone in v1. Returns bytes actually dropped.
    @discardableResult
    public func discardUnuploadedTail(maxBytes: Int) throws -> Int {
        lock.lock(); defer { lock.unlock() }
        var budget = maxBytes
        var dropped = 0

        let fromPending = min(pending.count, budget)
        if fromPending > 0 {
            pending.removeLast(fromPending)
            appendedBytes -= fromPending
            budget -= fromPending
            dropped += fromPending
        }

        let uploaded = Set(manifestStorage.seqsUploaded)
        var written = manifestStorage.seqsWritten.sorted()
        while budget > 0, let last = written.last, !uploaded.contains(last) {
            let url = chunkURL(seq: last)
            let size = Self.pcmBytes(ofChunkAt: url)
            guard size <= budget else { break } // partial chunk drops not supported in v1
            try? FileManager.default.removeItem(at: url)
            written.removeLast()
            budget -= size
            dropped += size
            appendedBytes -= size
        }
        manifestStorage.seqsWritten = written
        try persistManifest()
        return dropped
    }

    /// Convenience: discard the last `seconds` of un-uploaded audio.
    @discardableResult
    public func discardUnuploadedTail(seconds: Int) throws -> Int {
        try discardUnuploadedTail(maxBytes: seconds * AudioConstants.bytesPerSecond)
    }

    // MARK: - Lifecycle mutations (called by the upload worker / engine)

    public func setServerSessionId(_ id: String) throws {
        lock.lock(); defer { lock.unlock() }
        manifestStorage.serverSessionId = id
        try persistManifest()
    }

    public func markUploaded(seq: Int) throws {
        lock.lock(); defer { lock.unlock() }
        if !manifestStorage.seqsUploaded.contains(seq) {
            manifestStorage.seqsUploaded.append(seq)
            manifestStorage.seqsUploaded.sort()
        }
        try persistManifest()
    }

    /// Set/clear the far-side participant label (FR-CALL-ATT-3). Persists to
    /// disk so a mid-call crash still finalizes with the name. Empty/whitespace
    /// is stored as nil (unlabeled).
    public func setContactName(_ name: String?) throws {
        lock.lock(); defer { lock.unlock() }
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        manifestStorage.contactName = (trimmed?.isEmpty == false) ? trimmed : nil
        try persistManifest()
    }

    /// Append an operator-flagged "important moment" (hotkey / ★ button).
    /// Time-anchored to the recording; persisted to disk so a mid-call crash
    /// still finalizes with the flags. Empty/whitespace notes store as nil.
    /// Returns the running highlight count (for live UI feedback).
    @discardableResult
    public func addHighlight(tSecs: Double, note: String? = nil, themeKey: String? = nil) throws -> Int {
        lock.lock(); defer { lock.unlock() }
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let highlight = SessionManifest.Highlight(
            tSecs: max(0, tSecs),
            note: (trimmed?.isEmpty == false) ? trimmed : nil,
            themeKey: themeKey
        )
        var current = manifestStorage.highlights ?? []
        current.append(highlight)
        manifestStorage.highlights = current
        try persistManifest()
        return current.count
    }

    /// Append a live typed note (Call Desk composer / ⌘⇧N). Time-anchored and
    /// persisted to disk like highlights, so a mid-call crash still finalizes
    /// with the notes. Returns the running note count for live UI feedback;
    /// empty/whitespace text is a no-op (returns current count).
    @discardableResult
    public func addNote(tSecs: Double, text: String, themeKey: String? = nil,
                        anchor: SessionManifest.NoteAnchor? = nil) throws -> Int {
        lock.lock(); defer { lock.unlock() }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var current = manifestStorage.notes ?? []
        guard !trimmed.isEmpty else { return current.count }
        current.append(SessionManifest.Note(tSecs: max(0, tSecs), text: trimmed,
                                            themeKey: themeKey, anchor: anchor))
        manifestStorage.notes = current
        try persistManifest()
        return current.count
    }

    /// Add a live transcription-term correction ("heard X, it's Y"). Persisted
    /// like highlights; deduped case-insensitively. Returns the running count.
    @discardableResult
    public func addTermCorrection(wrong: String?, right: String) throws -> Int {
        lock.lock(); defer { lock.unlock() }
        let r = right.trimmingCharacters(in: .whitespacesAndNewlines)
        let w = wrong?.trimmingCharacters(in: .whitespacesAndNewlines)
        var current = manifestStorage.terms ?? []
        guard !r.isEmpty else { return current.count }
        let normalizedWrong = (w?.isEmpty == false) ? w : nil
        let duplicate = current.contains {
            $0.right.lowercased() == r.lowercased()
                && ($0.wrong ?? "").lowercased() == (normalizedWrong ?? "").lowercased()
        }
        guard !duplicate else { return current.count }
        current.append(SessionManifest.TermCorrection(wrong: normalizedWrong, right: r))
        manifestStorage.terms = current
        try persistManifest()
        return current.count
    }

    /// Record an operator coverage action on an agenda item (rail click).
    /// Appended; the server keeps the last mark per key. Crash-safe.
    @discardableResult
    public func addCoverageMark(key: String, state: String, tSecs: Double) throws -> Int {
        lock.lock(); defer { lock.unlock() }
        var current = manifestStorage.coverage ?? []
        guard !key.isEmpty else { return current.count }
        current.append(SessionManifest.CoverageMark(key: key, state: state, tSecs: max(0, tSecs)))
        manifestStorage.coverage = current
        try persistManifest()
        return current.count
    }

    /// Set/replace the call agenda (El Cuaderno "original list"). Crash-safe.
    public func setAgenda(_ items: [SessionManifest.AgendaItem]) throws {
        lock.lock(); defer { lock.unlock() }
        manifestStorage.agenda = items.isEmpty ? nil : items
        try persistManifest()
    }

    /// Mark the call ended. Duration is derived from spooled bytes unless given.
    public func markEnded(endedAt: Date = Date(), durationSecs: Int? = nil, partial: Bool = false) throws {
        lock.lock(); defer { lock.unlock() }
        manifestStorage.endedAt = ISO8601.string(from: endedAt)
        if let durationSecs {
            manifestStorage.durationSecs = durationSecs
        } else {
            let fileBytes = (try? Self.spooledPCMBytes(in: directory, seqs: manifestStorage.seqsWritten)) ?? 0
            manifestStorage.durationSecs = Int((Double(fileBytes + pending.count) / Double(AudioConstants.bytesPerSecond)).rounded())
        }
        if partial { manifestStorage.partial = true }
        try persistManifest()
    }

    public func markFinalized() throws {
        lock.lock(); defer { lock.unlock() }
        manifestStorage.finalized = true
        try persistManifest()
    }

    // MARK: - Internals

    /// Write one chunk file (canonical WAV) atomically and record it in the
    /// manifest.
    ///
    /// Atomicity (NFR-CALL-REL-1/3): the WAV is written to a temp name in the
    /// *same* directory, then `rename(2)`d onto the final `chunk-NNNNNN.wav`
    /// name. `rename` within one filesystem is atomic, so the canonical chunk
    /// name only ever appears once its bytes are fully on disk — a crash / power
    /// loss mid-write leaves at most a `.chunk-*.wav.tmp` dropping (which no
    /// reader counts: it is neither `chunk-*` prefixed nor `.wav` suffixed and is
    /// swept on reopen). This closes the "truncated chunk that later uploads
    /// silently corrupt" defect at the source. The temp name is derived from the
    /// same directory so it can never collide across dirs.
    ///
    /// Order is deliberate: file lands atomically FIRST, then the manifest is
    /// persisted. A crash in the gap just leaves a complete, un-recorded chunk
    /// file that `openingDirectory` re-reconciles into `seqsWritten`.
    private func writeChunk(_ pcm: Data) throws {
        let seq = (manifestStorage.seqsWritten.max() ?? -1) + 1
        let wav = WavCodec.wrap(pcm: pcm)
        let url = chunkURL(seq: seq)
        let tmp = directory.appendingPathComponent(Self.chunkTempName(seq: seq))

        // Clear any leftover temp from a prior interrupted attempt at this seq.
        try? FileManager.default.removeItem(at: tmp)

        let ok = FileManager.default.createFile(
            atPath: tmp.path,
            contents: wav,
            attributes: [.posixPermissions: 0o600]
        )
        guard ok else { throw SpoolerError.ioFailure("could not write \(tmp.lastPathComponent)") }

        // Atomic publish. rename() preserves the 0600 temp inode's permissions.
        guard rename(tmp.path, url.path) == 0 else {
            let err = errno
            try? FileManager.default.removeItem(at: tmp)
            throw SpoolerError.ioFailure(
                "could not rename \(tmp.lastPathComponent) → \(url.lastPathComponent) (errno \(err))")
        }

        manifestStorage.seqsWritten.append(seq)
        manifestStorage.seqsWritten.sort()
        try persistManifest()
    }

    /// Temp sibling name for an in-flight chunk write. The leading dot + `.tmp`
    /// suffix keep it out of `chunkSeqsOnDisk` (which requires a `chunk-` prefix
    /// AND a `.wav` suffix), so a partial temp is never mistaken for a chunk.
    private static func chunkTempName(seq: Int) -> String {
        String(format: ".chunk-%06d.wav.tmp", seq)
    }

    /// Atomic, 0600 manifest write: temp file in the same dir, then rename.
    private func persistManifest() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data: Data
        do {
            data = try encoder.encode(manifestStorage)
        } catch {
            throw SpoolerError.ioFailure("manifest encode: \(error)")
        }
        let url = directory.appendingPathComponent(Self.manifestFileName)
        let tmp = directory.appendingPathComponent(".manifest.json.tmp")
        let ok = FileManager.default.createFile(
            atPath: tmp.path,
            contents: data,
            attributes: [.posixPermissions: 0o600]
        )
        guard ok else { throw SpoolerError.ioFailure("could not write manifest temp file") }
        do {
            _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
        } catch {
            throw SpoolerError.ioFailure("manifest rename: \(error)")
        }
    }

    private static func chunkSeqsOnDisk(in directory: URL) -> Set<Int> {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        var seqs = Set<Int>()
        for name in names where name.hasPrefix("chunk-") && name.hasSuffix(".wav") {
            let digits = name.dropFirst("chunk-".count).dropLast(".wav".count)
            if let seq = Int(digits) { seqs.insert(seq) }
        }
        return seqs
    }

    /// Delete any in-flight `.chunk-*.wav.tmp` droppings in the spool directory.
    private static func removeTempFiles(in directory: URL) {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        for name in names where name.hasPrefix(".chunk-") && name.hasSuffix(".wav.tmp") {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    private static func fileSize(at url: URL) -> Int {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        return (attrs?[.size] as? Int) ?? 0
    }

    /// Whether a chunk file on disk is complete enough to keep on reopen.
    ///
    /// - A file must have a header plus at least one PCM byte (`> wavHeaderBytes`);
    ///   a header-only / sub-header remnant is a dropping.
    /// - A *non-final* chunk always carries a full `chunkBytes` PCM payload, so a
    ///   shorter file is a truncated write → not complete.
    /// - The *final* chunk (highest seq) is legitimately short (the flush
    ///   remainder), so any file with real PCM passes.
    static func chunkFileIsComplete(size: Int, isFinal: Bool, chunkBytes: Int) -> Bool {
        guard size > AudioConstants.wavHeaderBytes else { return false }
        if isFinal { return true }
        return size >= AudioConstants.wavHeaderBytes + chunkBytes
    }

    private static func pcmBytes(ofChunkAt url: URL) -> Int {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        let size = (attributes?[.size] as? Int) ?? 0
        return max(0, size - AudioConstants.wavHeaderBytes)
    }

    private static func spooledPCMBytes(in directory: URL, seqs: [Int]) throws -> Int {
        var total = 0
        for seq in seqs {
            let url = directory.appendingPathComponent(chunkFileName(seq: seq))
            total += pcmBytes(ofChunkAt: url)
        }
        return total
    }
}
