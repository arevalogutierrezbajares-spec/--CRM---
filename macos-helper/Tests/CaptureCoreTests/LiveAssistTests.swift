import Foundation
import Testing
@testable import CaptureCore

/// El Cuaderno Slice 3 on-device assists: commitment whisper, agenda glow,
/// roster/speaker-hint, and their wire.
@Suite struct LiveAssistTests {

    // MARK: - CommitmentDetector

    @Test func detectsEnglishCommitments() {
        #expect(CommitmentDetector.scan(line: "I'll send you the API doc tomorrow.") != nil)
        #expect(CommitmentDetector.scan(line: "We will review the booking flow on Friday.") != nil)
        #expect(CommitmentDetector.scan(line: "Let me get you the numbers.") != nil)
    }

    @Test func detectsSpanishCommitments() {
        #expect(CommitmentDetector.scan(line: "Te envío el documento mañana.") != nil)
        #expect(CommitmentDetector.scan(line: "Voy a preparar la propuesta.") != nil)
    }

    @Test func ignoresNonCommitments() {
        #expect(CommitmentDetector.scan(line: "The weather is nice today.") == nil)
        #expect(CommitmentDetector.scan(line: "I am willing to consider it.") == nil) // willing ≠ will
        #expect(CommitmentDetector.scan(line: "ok") == nil) // too short
    }

    @Test func extractsTheCommitmentSentence() {
        let c = CommitmentDetector.scan(line: "Okay so first. I'll get you the numbers by Monday. Anyway.")
        #expect(c?.clause.contains("I'll get you the numbers") == true)
        #expect(c?.clause.contains("Anyway") == false)
    }

    @Test func hasWhenFlagsTemporal() {
        #expect(CommitmentDetector.hasWhen("I'll send it Friday"))
        #expect(CommitmentDetector.hasWhen("te lo mando mañana"))
        #expect(!CommitmentDetector.hasWhen("I'll send it"))
    }

    // MARK: - AgendaMatcher

    private let agenda = [
        (key: "pricing-model", label: "Pricing model"),
        (key: "security-review", label: "Security review"),
        (key: "escort-licensing-bolivar", label: "Escort licensing (Bolívar)"),
    ]

    @Test func matchesTopicKeywords() {
        #expect(AgendaMatcher.matches(line: "let's talk about the pricing", agenda: agenda) == ["pricing-model"])
        #expect(AgendaMatcher.matches(line: "the escort needs a license for Bolivar",
                                      agenda: agenda).contains("escort-licensing-bolivar"))
    }

    @Test func noPartialWordFalsePositives() {
        #expect(AgendaMatcher.matches(line: "enterprise deals closed", agenda: agenda).isEmpty)
    }

    @Test func keywordsStripStopwords() {
        #expect(AgendaMatcher.keywords(for: "Security review").sorted() == ["security"])
    }

    // MARK: - Roster / speaker hint

    @Test func speakerHintPrefersExplicitThenRosterPlusOne() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-roster-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let manifest = SessionManifest(sessionLocalId: "r",
                                       startedAt: Date(timeIntervalSince1970: 1_780_000_000))
        let spooler = try ChunkSpooler(directory: dir, manifest: manifest)

        #expect(spooler.speakerHint == 0) // nothing set
        try spooler.setRoster(["Ana", "Bruno", "Carla"])
        #expect(spooler.speakerHint == 4) // roster + 1 headroom
        try spooler.setRoster(["Ana", "Bruno", "Carla"], expectedSpeakers: 10)
        #expect(spooler.speakerHint == 10) // explicit wins
    }

    @Test func rosterWireOmittedWhenEmpty() throws {
        let full = CaptureAPIClient.FinalizeBody(
            endedAt: Date(timeIntervalSince1970: 1), durationSecs: 1, totalChunks: 1,
            partial: false, roster: ["Ana", "Bruno"])
        let obj = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(full)) as? [String: Any] ?? [:]
        #expect((obj["roster"] as? [String]) == ["Ana", "Bruno"])

        let empty = CaptureAPIClient.FinalizeBody(
            endedAt: Date(timeIntervalSince1970: 1), durationSecs: 1, totalChunks: 1, partial: false)
        let objE = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(empty)) as? [String: Any] ?? [:]
        #expect(objE["roster"] == nil)
    }
}
