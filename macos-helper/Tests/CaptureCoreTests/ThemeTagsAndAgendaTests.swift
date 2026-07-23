import Foundation
import Testing
@testable import CaptureCore

/// El Cuaderno Slice 1 — #theme tag parsing, agenda manifest storage, theme-def
/// union, and the wire encoding contract (empty ⇒ omitted; legacy decodes).
@Suite struct ThemeTagsAndAgendaTests {

    // MARK: - ThemeTags

    @Test func slugifyNormalizes() {
        #expect(ThemeTags.slugify("Pricing model") == "pricing-model")
        #expect(ThemeTags.slugify("  K&R  Clause!! ") == "k-r-clause")
        #expect(ThemeTags.slugify("Añejo café") == "anejo-cafe")
    }

    @Test func parseExtractsAndStripsTags() {
        let p = ThemeTags.parse("wire deposit #payment-terms")
        #expect(p.text == "wire deposit")
        #expect(p.tags == ["payment-terms"])
    }

    @Test func parseDedupesAndKeepsOrder() {
        let p = ThemeTags.parse("#pricing he capped at 30% #pricing #legal")
        #expect(p.text == "he capped at 30%")
        #expect(p.tags == ["pricing", "legal"])
    }

    @Test func numericTagsStayInText() {
        let p = ThemeTags.parse("fix ticket #42 today")
        #expect(p.text == "fix ticket #42 today")
        #expect(p.tags.isEmpty)
    }

    @Test func labelFromSlug() {
        #expect(ThemeTags.label(fromSlug: "payment-terms") == "Payment terms")
    }

    // MARK: - Manifest

    @Test func themeKeyAndAgendaRoundTrip() throws {
        var m = SessionManifest(sessionLocalId: "t",
                                startedAt: Date(timeIntervalSince1970: 1_780_000_000))
        m.notes = [.init(tSecs: 10, text: "n1", themeKey: "pricing")]
        m.agenda = [.init(key: "pricing", label: "Pricing")]
        let back = try JSONDecoder().decode(SessionManifest.self,
                                            from: JSONEncoder().encode(m))
        #expect(back.notes?.first?.themeKey == "pricing")
        #expect(back.agenda?.first?.key == "pricing")
    }

    @Test func legacyManifestDecodesWithoutNewKeys() throws {
        let json = #"""
        { "sessionLocalId": "x", "startedAt": "2026-07-01T00:00:00.000Z",
          "seqsWritten": [], "seqsUploaded": [], "finalized": false,
          "partial": false, "chunkSeconds": 30,
          "notes": [{"tSecs": 5, "text": "legacy"}] }
        """#
        let m = try JSONDecoder().decode(SessionManifest.self, from: Data(json.utf8))
        #expect(m.notes?.first?.themeKey == nil)
        #expect(m.agenda == nil)
    }

    // MARK: - Theme union + wire

    @Test func themeDefsUnionAgendaFirstNoDupes() {
        var m = SessionManifest(sessionLocalId: "t",
                                startedAt: Date(timeIntervalSince1970: 1_780_000_000))
        m.agenda = [.init(key: "pricing", label: "Pricing")]
        m.notes = [.init(tSecs: 1, text: "a", themeKey: "pricing"),
                   .init(tSecs: 2, text: "b", themeKey: "legal")]
        let defs = UploadQueueWorker.themeDefs(for: m)
        #expect(defs.map(\.key) == ["pricing", "legal"])
        #expect(defs[0].agenda == true)
        #expect(defs[1].agenda == false)
        #expect(defs[1].label == "Legal")
    }

    @Test func wireOmitsEmptyIncludesPopulated() throws {
        let body = CaptureAPIClient.FinalizeBody(
            endedAt: Date(timeIntervalSince1970: 1_780_000_100),
            durationSecs: 100, totalChunks: 2, partial: false,
            notes: [.init(tSecs: 1, text: "x", themeKey: "pricing")],
            agenda: [.init(key: "pricing", label: "Pricing")],
            themes: [.init(key: "pricing", label: "Pricing", agenda: true)])
        let obj = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(body)) as? [String: Any] ?? [:]
        #expect((obj["agenda"] as? [[String: Any]])?.count == 1)
        #expect(((obj["notes"] as? [[String: Any]])?.first?["themeKey"] as? String) == "pricing")

        let empty = CaptureAPIClient.FinalizeBody(
            endedAt: Date(timeIntervalSince1970: 1), durationSecs: 1,
            totalChunks: 1, partial: false)
        let objE = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(empty)) as? [String: Any] ?? [:]
        #expect(objE["agenda"] == nil)
        #expect(objE["themes"] == nil)
    }
}
