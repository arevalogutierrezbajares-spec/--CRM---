import Foundation

/// Manages the spool root (`…/AGBCaptureHelper/spool/`): one subdirectory per
/// capture session, each containing chunk WAVs + `manifest.json`.
///
/// Returns *shared* `ChunkSpooler` instances (cached per directory) so the
/// audio engine (writer) and the upload worker (reader/uploader) mutate one
/// manifest through one lock instead of racing on the file.
public final class SpoolStore {
    public let rootURL: URL

    private let lock = NSLock()
    /// Keyed by symlink-resolved directory path: `/var/folders/…` and
    /// `/private/var/folders/…` (or any alias) must hit the same instance.
    private var cache: [String: ChunkSpooler] = [:]

    private func cacheKey(_ directory: URL) -> String {
        directory.resolvingSymlinksInPath().standardizedFileURL.path
    }

    public init(rootURL: URL? = nil) throws {
        let root = rootURL ?? HelperPaths.spoolDir()
        try HelperPaths.ensureDirectory(root.deletingLastPathComponent())
        try HelperPaths.ensureDirectory(root)
        self.rootURL = root
    }

    // MARK: - Session lifecycle

    /// Create a new session spool dir (0700) + manifest, and return its spooler.
    public func createSession(localId: String = UUID().uuidString,
                              startedAt: Date = Date(),
                              sourceApp: String? = nil,
                              captureKind: CaptureKind = .call,
                              chunkSeconds: Int = AudioConstants.chunkSeconds) throws -> ChunkSpooler {
        let dir = rootURL.appendingPathComponent("session-\(localId)", isDirectory: true)
        try HelperPaths.ensureDirectory(dir)
        let kind = captureKind
        let app = kind.defaultSourceApp(detected: sourceApp)
        let manifest = SessionManifest(sessionLocalId: localId,
                                       startedAt: startedAt,
                                       sourceApp: app,
                                       captureKind: kind,
                                       chunkSeconds: chunkSeconds)
        let spooler = try ChunkSpooler(directory: dir, manifest: manifest)
        lock.lock(); cache[cacheKey(dir)] = spooler; lock.unlock()
        return spooler
    }

    /// Open (or return the cached instance for) the session at `directory`.
    public func openSession(at directory: URL) throws -> ChunkSpooler {
        let key = cacheKey(directory)
        lock.lock()
        if let cached = cache[key] {
            lock.unlock()
            return cached
        }
        lock.unlock()
        let spooler = try ChunkSpooler(openingDirectory: directory)
        lock.lock(); cache[key] = spooler; lock.unlock()
        return spooler
    }

    /// All session directories on disk (any state), unsorted.
    public func sessionDirectories() throws -> [URL] {
        let contents = try FileManager.default.contentsOfDirectory(
            at: rootURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )
        return contents.filter {
            $0.lastPathComponent.hasPrefix("session-")
                && (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
        }
    }

    /// Sessions that still need work (not finalized): un-uploaded chunks,
    /// pending finalize, or still recording. Sorted oldest-first so the upload
    /// queue preserves capture order (FR-CALL-TRX-2). Corrupt spools are skipped.
    public func pendingSessions() throws -> [ChunkSpooler] {
        var result: [ChunkSpooler] = []
        for dir in try sessionDirectories() {
            guard let spooler = try? openSession(at: dir) else { continue }
            if !spooler.snapshot.finalized {
                result.append(spooler)
            }
        }
        return result.sorted {
            ($0.snapshot.startedAtDate ?? .distantPast) < ($1.snapshot.startedAtDate ?? .distantPast)
        }
    }

    /// Delete a session's spool directory (after finalize success or abandon).
    public func deleteSession(_ spooler: ChunkSpooler) throws {
        lock.lock(); cache[cacheKey(spooler.directory)] = nil; lock.unlock()
        try FileManager.default.removeItem(at: spooler.directory)
    }

    // MARK: - Crash adoption (FR-CALL-OPS-5)

    /// At startup, any non-finalized session whose localId is not in
    /// `activeLocalIds` belonged to a crashed run. Mark it ended + partial so
    /// the upload worker finalizes the salvageable audio. Sessions with zero
    /// audio on disk are returned separately so the caller can abandon them.
    @discardableResult
    public func adoptOrphans(activeLocalIds: Set<String> = []) throws -> [ChunkSpooler] {
        var adopted: [ChunkSpooler] = []
        for spooler in try pendingSessions() {
            let snap = spooler.snapshot
            guard !activeLocalIds.contains(snap.sessionLocalId) else { continue }
            if snap.endedAt == nil {
                try spooler.markEnded(endedAt: Date(), partial: true)
                adopted.append(spooler)
            }
        }
        return adopted
    }
}
