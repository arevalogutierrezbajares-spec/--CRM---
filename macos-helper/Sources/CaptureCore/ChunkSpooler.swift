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

        // Reconcile with files on disk: a chunk only counts if its file exists.
        let onDisk = Self.chunkSeqsOnDisk(in: directory)
        let written = Set(manifestStorage.seqsWritten).union(onDisk)
            .filter { onDisk.contains($0) }
            .sorted()
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

    /// Write one chunk file (canonical WAV) and record it in the manifest.
    private func writeChunk(_ pcm: Data) throws {
        let seq = (manifestStorage.seqsWritten.max() ?? -1) + 1
        let wav = WavCodec.wrap(pcm: pcm)
        let url = chunkURL(seq: seq)
        let ok = FileManager.default.createFile(
            atPath: url.path,
            contents: wav,
            attributes: [.posixPermissions: 0o600]
        )
        guard ok else { throw SpoolerError.ioFailure("could not write \(url.lastPathComponent)") }
        manifestStorage.seqsWritten.append(seq)
        manifestStorage.seqsWritten.sort()
        try persistManifest()
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
