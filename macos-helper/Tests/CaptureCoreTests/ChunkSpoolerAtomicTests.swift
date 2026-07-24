import Foundation
import Testing
@testable import CaptureCore

/// DEFECT B — chunk files are written atomically (temp + rename), and reopen
/// drops any chunk whose file is missing or truncated so `seqsWritten` (and the
/// finalize `totalChunks = seqsWritten.count`) only ever reflects intact audio.
@Suite final class ChunkSpoolerAtomicTests {

    private let tempDir: URL

    init() throws {
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-spooler-atomic-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func makeSpooler(chunkSeconds: Int = 1,
                             localId: String = "atomic-session") throws -> ChunkSpooler {
        let manifest = SessionManifest(sessionLocalId: localId,
                                       startedAt: Date(timeIntervalSince1970: 1_780_000_000),
                                       sourceApp: "WhatsApp",
                                       chunkSeconds: chunkSeconds)
        return try ChunkSpooler(directory: tempDir, manifest: manifest)
    }

    private func tempDroppings() -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: tempDir.path)) ?? []
        return names.filter { $0.hasPrefix(".chunk-") && $0.hasSuffix(".wav.tmp") }
    }

    private func truncate(_ url: URL, toBytes n: Int) throws {
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.truncate(atOffset: UInt64(n))
    }

    // MARK: - Atomic write

    @Test func atomicWriteLeavesNoTempDroppings() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler.append(Data(repeating: 0x33, count: second * 3)) // 3 full chunks
        try spooler.append(Data(repeating: 0x44, count: second / 2)) // 0.5 s pending
        try spooler.flush()                                          // final short chunk

        #expect(spooler.snapshot.seqsWritten == [0, 1, 2, 3])
        #expect(tempDroppings().isEmpty, "no .wav.tmp files must remain after writes")

        // Every recorded chunk file exists and parses as a valid WAV.
        for seq in spooler.snapshot.seqsWritten {
            let url = spooler.chunkURL(seq: seq)
            #expect(FileManager.default.fileExists(atPath: url.path))
            let wav = try Data(contentsOf: url)
            _ = try WavCodec.parse(wav) // throws if the header/body is malformed
        }
    }

    @Test func atomicWriteChunkFilePermissionsAre0600() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        try spooler.append(Data(count: AudioConstants.bytesPerSecond))
        let attrs = try FileManager.default.attributesOfItem(atPath: spooler.chunkURL(seq: 0).path)
        #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600,
                "rename must preserve the temp's 0600 permissions")
    }

    // MARK: - Reopen hardening

    @Test func reopenDropsTruncatedNonFinalChunkAndStaysConsistent() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler?.append(Data(count: second * 3)) // full chunks 0, 1, 2
        try spooler?.flush()                          // (nothing pending; no-op)
        #expect(spooler?.snapshot.seqsWritten == [0, 1, 2])
        spooler = nil // "crash"

        // Simulate a torn write on the MIDDLE chunk (a full non-final chunk that
        // ended up short — the pre-atomic-write failure mode).
        try truncate(tempDir.appendingPathComponent(ChunkSpooler.chunkFileName(seq: 1)),
                     toBytes: AudioConstants.wavHeaderBytes + 10_000)

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0, 2], "truncated middle chunk is dropped")
        // The bad file was deleted so it can never be re-counted or uploaded.
        #expect(!FileManager.default.fileExists(atPath: reopened.chunkURL(seq: 1).path))

        // Manifest stays internally consistent through finalize.
        try reopened.markEnded()
        try reopened.markUploaded(seq: 0)
        try reopened.markUploaded(seq: 2)
        #expect(reopened.snapshot.pendingUploadSeqs.isEmpty)
        #expect(reopened.snapshot.readyToFinalize)

        // Numbering resumes after the highest surviving seq.
        try reopened.append(Data(count: second))
        #expect(reopened.snapshot.seqsWritten == [0, 2, 3])
    }

    @Test func reopenKeepsShortFinalChunk() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler?.append(Data(count: second * 2)) // full chunks 0, 1
        try spooler?.append(Data(count: second / 4))  // 0.25 s pending
        try spooler?.flush()                          // legitimately-short final chunk 2
        #expect(spooler?.snapshot.seqsWritten == [0, 1, 2])
        spooler = nil

        // The short final chunk is normal (flush remainder), NOT a truncation.
        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0, 1, 2], "short final chunk is retained")
    }

    @Test func reopenDropsHeaderOnlyFinalChunk() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        try spooler?.append(Data(count: AudioConstants.bytesPerSecond * 2)) // 0, 1
        spooler = nil

        // A final chunk that got truncated down to (near) header-only has no real
        // PCM — drop it even though it is the final seq.
        try truncate(tempDir.appendingPathComponent(ChunkSpooler.chunkFileName(seq: 1)),
                     toBytes: AudioConstants.wavHeaderBytes)

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0])
        #expect(!FileManager.default.fileExists(atPath: reopened.chunkURL(seq: 1).path))
    }

    @Test func reopenSweepsStrayTempDroppings() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        try spooler?.append(Data(count: AudioConstants.bytesPerSecond)) // chunk 0
        spooler = nil

        // A crash mid-write could leave a temp for the next seq.
        let stray = tempDir.appendingPathComponent(".chunk-000005.wav.tmp")
        FileManager.default.createFile(atPath: stray.path, contents: Data(count: 128))
        #expect(FileManager.default.fileExists(atPath: stray.path))

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0], "stray temp is never counted as a chunk")
        #expect(!FileManager.default.fileExists(atPath: stray.path), "stray temp is swept on reopen")
    }

    @Test func normalReopenIsUnchanged() throws {
        // Regression guard: the happy path (all chunks intact) survives reopen
        // untouched, including a legitimately-short final chunk and upload state.
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler?.append(Data(count: second * 2)) // 0, 1
        try spooler?.append(Data(count: second / 2))  // 0.5 s pending
        try spooler?.flush()                          // final chunk 2
        try spooler?.markUploaded(seq: 0)
        spooler = nil

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0, 1, 2])
        #expect(reopened.snapshot.seqsUploaded == [0])
        #expect(abs(reopened.spooledSeconds - 2.5) < 0.01)
        #expect(tempDroppings().isEmpty)
    }

    // MARK: - Pure completeness predicate

    @Test func chunkFileIsCompletePredicate() {
        let chunkBytes = AudioConstants.bytesPerSecond // 1 s session
        let header = AudioConstants.wavHeaderBytes

        // Non-final: must be a full header + chunkBytes.
        #expect(ChunkSpooler.chunkFileIsComplete(size: header + chunkBytes, isFinal: false, chunkBytes: chunkBytes))
        #expect(!ChunkSpooler.chunkFileIsComplete(size: header + chunkBytes - 1, isFinal: false, chunkBytes: chunkBytes))

        // Final: any file with real PCM passes; header-only / sub-header fails.
        #expect(ChunkSpooler.chunkFileIsComplete(size: header + 1, isFinal: true, chunkBytes: chunkBytes))
        #expect(!ChunkSpooler.chunkFileIsComplete(size: header, isFinal: true, chunkBytes: chunkBytes))
        #expect(!ChunkSpooler.chunkFileIsComplete(size: 0, isFinal: true, chunkBytes: chunkBytes))
    }
}
