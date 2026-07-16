import Foundation
import Testing
@testable import CaptureCore

@Suite final class ChunkSpoolerTests {

    private let tempDir: URL

    init() throws {
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-spooler-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func makeSpooler(chunkSeconds: Int = 30,
                             localId: String = "test-session") throws -> ChunkSpooler {
        let manifest = SessionManifest(sessionLocalId: localId,
                                       startedAt: Date(timeIntervalSince1970: 1_780_000_000),
                                       sourceApp: "WhatsApp",
                                       chunkSeconds: chunkSeconds)
        return try ChunkSpooler(directory: tempDir, manifest: manifest)
    }

    // MARK: - Chunking

    @Test func exact30SecondBoundaryProducesExactlyOneChunk() throws {
        let spooler = try makeSpooler()
        try spooler.append(Data(repeating: 0x55, count: AudioConstants.chunkBytes)) // exactly 30 s

        let snap = spooler.snapshot
        #expect(snap.seqsWritten == [0])
        #expect(spooler.pendingByteCount == 0)

        let wav = try Data(contentsOf: spooler.chunkURL(seq: 0))
        #expect(wav.count == 44 + AudioConstants.chunkBytes)
        let info = try WavCodec.parse(wav)
        #expect(info.sampleRate == 16_000)
        #expect(info.channels == 2)
        #expect(info.dataLength == AudioConstants.chunkBytes)
        #expect(abs(info.durationSeconds - 30) < 0.001)
    }

    @Test func oddSlicesChunkAtBoundariesAndFlushWritesRemainder() throws {
        let spooler = try makeSpooler()
        // 75 s of audio delivered in odd-sized slices.
        let totalBytes = 75 * AudioConstants.bytesPerSecond
        var remaining = totalBytes
        var value: UInt8 = 0
        while remaining > 0 {
            let size = min(remaining, 70_001)
            try spooler.append(Data(repeating: value, count: size))
            remaining -= size
            value &+= 1
        }
        #expect(spooler.snapshot.seqsWritten == [0, 1], "two full 30s chunks before flush")
        #expect(spooler.pendingByteCount == 15 * AudioConstants.bytesPerSecond)

        try spooler.flush()
        #expect(spooler.snapshot.seqsWritten == [0, 1, 2])
        #expect(spooler.pendingByteCount == 0)

        let lastChunk = try Data(contentsOf: spooler.chunkURL(seq: 2))
        #expect(lastChunk.count == 44 + 15 * AudioConstants.bytesPerSecond)
        #expect(abs(spooler.spooledSeconds - 75) < 0.01)
    }

    @Test func flushWithNothingPendingWritesNothing() throws {
        let spooler = try makeSpooler()
        try spooler.flush()
        #expect(spooler.snapshot.seqsWritten.isEmpty)
    }

    // MARK: - Manifest

    @Test func manifestCorrectness() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        try spooler.append(Data(count: AudioConstants.bytesPerSecond * 2)) // 2 chunks
        try spooler.setServerSessionId("srv-123")
        try spooler.markUploaded(seq: 0)
        try spooler.markEnded(endedAt: Date(timeIntervalSince1970: 1_780_000_100), partial: false)

        // Re-read straight from disk to prove persistence.
        let raw = try Data(contentsOf: tempDir.appendingPathComponent("manifest.json"))
        let manifest = try JSONDecoder().decode(SessionManifest.self, from: raw)

        #expect(manifest.sessionLocalId == "test-session")
        #expect(manifest.serverSessionId == "srv-123")
        #expect(manifest.sourceApp == "WhatsApp")
        #expect(manifest.seqsWritten == [0, 1])
        #expect(manifest.seqsUploaded == [0])
        #expect(manifest.pendingUploadSeqs == [1])
        #expect(!manifest.finalized)
        #expect(manifest.endedAt != nil)
        #expect(manifest.durationSecs == 2)
        #expect(!manifest.partial)
        #expect(manifest.chunkSeconds == 1)
        #expect(!manifest.readyToFinalize, "seq 1 not uploaded yet")

        try spooler.markUploaded(seq: 1)
        #expect(spooler.snapshot.readyToFinalize)
        try spooler.markFinalized()
        #expect(spooler.snapshot.finalized)
    }

    @Test func manifestFilePermissionsAre0600() throws {
        _ = try makeSpooler()
        let attrs = try FileManager.default.attributesOfItem(
            atPath: tempDir.appendingPathComponent("manifest.json").path)
        #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
    }

    @Test func chunkFilePermissionsAre0600() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        try spooler.append(Data(count: AudioConstants.bytesPerSecond))
        let attrs = try FileManager.default.attributesOfItem(atPath: spooler.chunkURL(seq: 0).path)
        #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
    }

    // MARK: - Reopen from disk (crash recovery)

    @Test func reopenFromDiskResumesSequenceNumbering() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        try spooler?.append(Data(count: AudioConstants.bytesPerSecond * 2)) // seq 0, 1
        try spooler?.markUploaded(seq: 0)
        spooler = nil // "crash"

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        let snap = reopened.snapshot
        #expect(snap.seqsWritten == [0, 1])
        #expect(snap.seqsUploaded == [0])
        #expect(snap.chunkSeconds == 1)
        #expect(abs(reopened.spooledSeconds - 2) < 0.01)

        try reopened.append(Data(count: AudioConstants.bytesPerSecond))
        #expect(reopened.snapshot.seqsWritten == [0, 1, 2], "resumes at seq 2")
        #expect(FileManager.default.fileExists(atPath: reopened.chunkURL(seq: 2).path))
    }

    @Test func reopenDropsManifestEntriesForMissingChunkFiles() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        try spooler?.append(Data(count: AudioConstants.bytesPerSecond * 3)) // seq 0,1,2
        let lostChunk = spooler!.chunkURL(seq: 2)
        spooler = nil
        try FileManager.default.removeItem(at: lostChunk) // simulate lost write

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.seqsWritten == [0, 1])
        try reopened.append(Data(count: AudioConstants.bytesPerSecond))
        #expect(reopened.snapshot.seqsWritten == [0, 1, 2], "reuses the lost seq")
    }

    @Test func reopenMissingManifestThrows() {
        #expect(throws: (any Error).self) {
            try ChunkSpooler(openingDirectory: self.tempDir)
        }
    }

    // MARK: - Off the record (FR-CALL-CAP-8 v1)

    @Test func discardUnuploadedTailDropsPendingAndUnuploadedChunksOnly() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler.append(Data(count: second * 3)) // chunks 0,1,2
        try spooler.append(Data(count: second / 2)) // 0.5 s pending
        try spooler.markUploaded(seq: 0)

        // Budget: 10 s — but only pending (0.5 s) + chunks 2 and 1 are droppable.
        let dropped = try spooler.discardUnuploadedTail(seconds: 10)
        #expect(dropped == second / 2 + second * 2)

        #expect(spooler.snapshot.seqsWritten == [0], "uploaded chunk 0 must survive")
        #expect(spooler.pendingByteCount == 0)
        #expect(!FileManager.default.fileExists(atPath: spooler.chunkURL(seq: 1).path))
        #expect(!FileManager.default.fileExists(atPath: spooler.chunkURL(seq: 2).path))
        #expect(FileManager.default.fileExists(atPath: spooler.chunkURL(seq: 0).path))
    }

    @Test func discardRespectsBudget() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler.append(Data(count: second * 3)) // chunks 0,1,2

        // Budget of 1 s: only chunk 2 fits.
        let dropped = try spooler.discardUnuploadedTail(seconds: 1)
        #expect(dropped == second)
        #expect(spooler.snapshot.seqsWritten == [0, 1])
    }

    @Test func seqNumberingContinuesCorrectlyAfterDiscard() throws {
        let spooler = try makeSpooler(chunkSeconds: 1)
        let second = AudioConstants.bytesPerSecond
        try spooler.append(Data(count: second * 2)) // 0,1
        try spooler.discardUnuploadedTail(seconds: 1) // drops 1
        try spooler.append(Data(count: second)) // becomes new seq 1
        #expect(spooler.snapshot.seqsWritten == [0, 1])
    }

    // MARK: - Participant label (FR-CALL-ATT-3)

    @Test func setContactNamePersistsAndSurvivesReopen() throws {
        var spooler: ChunkSpooler? = try makeSpooler(chunkSeconds: 1)
        try spooler?.setContactName("  Carlos  ")
        #expect(spooler?.snapshot.contactName == "Carlos")

        // Whitespace-only clears.
        try spooler?.setContactName("   ")
        #expect(spooler?.snapshot.contactName == nil)
        try spooler?.setContactName("Ana")
        spooler = nil

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        #expect(reopened.snapshot.contactName == "Ana")
    }

    @Test func oldManifestWithoutContactNameDecodesAsNil() throws {
        // Simulate a pre-ATT-001 manifest on disk (no contactName key).
        let legacy: [String: Any] = [
            "sessionLocalId": "legacy",
            "startedAt": "2026-06-01T12:00:00.000Z",
            "sourceApp": "Zoom",
            "seqsWritten": [] as [Int],
            "seqsUploaded": [] as [Int],
            "finalized": false,
            "partial": false,
            "chunkSeconds": 30,
        ]
        let data = try JSONSerialization.data(withJSONObject: legacy)
        let manifest = try JSONDecoder().decode(SessionManifest.self, from: data)
        #expect(manifest.contactName == nil)
        #expect(manifest.sourceApp == "Zoom")
        #expect(manifest.sessionLocalId == "legacy")
    }
}
