import Foundation
import Testing
@testable import CaptureCore

/// Live Notes + term-correction spine (Call Desk): the manifest additions must
/// stay backward-compatible, the spooler must persist/dedupe crash-safe, and
/// FinalizeBody must omit the new arrays when empty (old servers see an
/// unchanged wire body).
@Suite final class LiveNotesAndTermsTests {

    private let tempDir: URL

    init() throws {
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-notes-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func makeSpooler() throws -> ChunkSpooler {
        let manifest = SessionManifest(sessionLocalId: "notes-test",
                                       startedAt: Date(timeIntervalSince1970: 1_780_000_000))
        return try ChunkSpooler(directory: tempDir, manifest: manifest)
    }

    // MARK: - Manifest compatibility

    @Test func oldManifestWithoutNewKeysDecodes() throws {
        let json = #"""
        { "sessionLocalId": "x", "startedAt": "2026-07-01T00:00:00.000Z",
          "seqsWritten": [], "seqsUploaded": [], "finalized": false,
          "partial": false, "chunkSeconds": 30 }
        """#
        let m = try JSONDecoder().decode(SessionManifest.self, from: Data(json.utf8))
        #expect(m.notes == nil)
        #expect(m.terms == nil)
    }

    // MARK: - Spooler persistence

    @Test func notesPersistCrashSafe() throws {
        let spooler = try makeSpooler()
        #expect(try spooler.addNote(tSecs: 12, text: "  follow up on API doc  ") == 1)
        #expect(try spooler.addNote(tSecs: 40, text: "pricing agreed") == 2)
        #expect(try spooler.addNote(tSecs: 50, text: "   ") == 2) // whitespace no-op

        // Reopen from disk — a crash must not lose notes.
        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        let notes = reopened.snapshot.notes ?? []
        #expect(notes.count == 2)
        #expect(notes[0].text == "follow up on API doc") // trimmed
        #expect(notes[0].tSecs == 12)
    }

    @Test func termCorrectionsDedupeAndPersist() throws {
        let spooler = try makeSpooler()
        #expect(try spooler.addTermCorrection(wrong: "Kenny Cloud", right: "CaneyCloud") == 1)
        #expect(try spooler.addTermCorrection(wrong: "kenny cloud", right: "caneycloud") == 1) // dup (case)
        #expect(try spooler.addTermCorrection(wrong: nil, right: "CaneyCloud") == 2) // hint ≠ correction
        #expect(try spooler.addTermCorrection(wrong: "x", right: "  ") == 2) // empty right no-op

        let reopened = try ChunkSpooler(openingDirectory: tempDir)
        let terms = reopened.snapshot.terms ?? []
        #expect(terms.count == 2)
        #expect(terms[0].wrong == "Kenny Cloud")
        #expect(terms[0].right == "CaneyCloud")
        #expect(terms[1].wrong == nil)
    }

    // MARK: - Wire encoding

    private func encodeBody(notes: [SessionManifest.Note],
                            terms: [SessionManifest.TermCorrection]) throws -> [String: Any] {
        let body = CaptureAPIClient.FinalizeBody(
            endedAt: Date(timeIntervalSince1970: 1_780_000_100),
            durationSecs: 100, totalChunks: 4, partial: false,
            notes: notes, terms: terms)
        let data = try JSONEncoder().encode(body)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    @Test func emptyArraysAreOmittedFromWire() throws {
        let obj = try encodeBody(notes: [], terms: [])
        #expect(obj["notes"] == nil)
        #expect(obj["terms"] == nil)
        #expect(obj["endedAt"] != nil)
    }

    @Test func populatedArraysEncode() throws {
        let obj = try encodeBody(
            notes: [.init(tSecs: 12.5, text: "check pricing")],
            terms: [.init(wrong: "Kenny Cloud", right: "CaneyCloud"), .init(right: "Posada")])
        let notes = obj["notes"] as? [[String: Any]]
        #expect(notes?.count == 1)
        #expect(notes?.first?["text"] as? String == "check pricing")
        let terms = obj["terms"] as? [[String: Any]]
        #expect(terms?.count == 2)
        #expect(terms?.first?["wrong"] as? String == "Kenny Cloud")
        #expect(terms?.last?["wrong"] == nil)
        #expect(terms?.last?["right"] as? String == "Posada")
    }
}
