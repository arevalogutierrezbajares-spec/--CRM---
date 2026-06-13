import Foundation

/// Writes a playable local copy of a captured call by concatenating its spooled
/// chunk WAVs into one WAV file. Used in transcript-only mode (FR-CALL-RET):
/// the CRM stores no audio and the recording is kept only on this Mac.
///
/// Streaming write — never holds the whole call in memory: it writes a
/// placeholder header, appends each chunk's PCM payload, then patches the
/// 44-byte header with the real length.
public enum LocalAudioArchive {

    /// Default destination: ~/Documents/AGB Call Recordings.
    public static func defaultDirectory() -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents")
        return docs.appendingPathComponent("AGB Call Recordings", isDirectory: true)
    }

    /// Assemble `spooler`'s chunks into a single WAV in `directory`. Returns the
    /// written file URL. Best-effort per chunk: a missing/corrupt chunk file is
    /// skipped rather than aborting the whole save.
    @discardableResult
    public static func save(spooler: ChunkSpooler,
                            title: String?,
                            directory: URL = defaultDirectory()) throws -> URL {
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true)

        let snap = spooler.snapshot
        let dest = directory.appendingPathComponent(
            fileName(startedAt: snap.startedAtDate ?? Date(), title: title))

        // Create with a zero-length placeholder header, then stream PCM in.
        try WavCodec.header(dataBytes: 0).write(to: dest)
        let handle = try FileHandle(forWritingTo: dest)
        defer { try? handle.close() }
        try handle.seekToEnd()

        var pcmBytes = 0
        for seq in snap.seqsWritten.sorted() {
            let url = spooler.chunkURL(seq: seq)
            guard let data = FileManager.default.contents(atPath: url.path),
                  let info = try? WavCodec.parse(data) else { continue }
            let pcm = WavCodec.pcmData(data, info: info)
            if pcm.isEmpty { continue }
            try handle.write(contentsOf: pcm)
            pcmBytes += pcm.count
        }

        // Patch the header now that the real PCM length is known.
        try handle.seek(toOffset: 0)
        try handle.write(contentsOf: WavCodec.header(dataBytes: pcmBytes))
        return dest
    }

    /// "yyyy-MM-dd HHmm <title>.wav" — sortable, human-readable, filesystem-safe.
    static func fileName(startedAt: Date, title: String?) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd HHmm"
        return "\(fmt.string(from: startedAt)) \(sanitize(title ?? "Call")).wav"
    }

    static func sanitize(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = trimmed.isEmpty ? "Call" : trimmed
        let invalid = CharacterSet(charactersIn: "/\\:*?\"<>|\n\r\t")
        let cleaned = base.components(separatedBy: invalid).joined(separator: "-")
        return String(cleaned.prefix(80))
    }
}
