import Testing
import Foundation
@testable import CaptureCore

@Suite("Town Hall — notification deduper")
struct NotificationDeduperTests {

    @Test("First batch primes silently — no banners on launch")
    func primesSilently() {
        var d = NotificationDeduper()
        let fresh = d.newlySeen(["a", "b", "c"])
        #expect(fresh.isEmpty)
        #expect(d.isPrimed)
    }

    @Test("Only genuinely new ids are returned after priming")
    func returnsOnlyNew() {
        var d = NotificationDeduper()
        _ = d.newlySeen(["a", "b"])           // prime
        let fresh = d.newlySeen(["a", "b", "c", "d"])
        #expect(fresh == ["c", "d"])
    }

    @Test("Already-seen ids never banner twice")
    func noDoubleBanner() {
        var d = NotificationDeduper()
        _ = d.newlySeen(["a"])                // prime
        _ = d.newlySeen(["a", "b"])           // b is new
        let fresh = d.newlySeen(["a", "b"])   // nothing new now
        #expect(fresh.isEmpty)
    }

    @Test("An id that drops off then reappears is not re-bannered")
    func stickySeen() {
        var d = NotificationDeduper()
        _ = d.newlySeen(["a", "b"])           // prime
        _ = d.newlySeen(["a"])                // b read/snoozed → drops off the active list
        let fresh = d.newlySeen(["a", "b"])   // b reappears but was already seen
        #expect(fresh.isEmpty)
    }
}

@Suite("Town Hall — wire decoders")
struct TownHallDecoderTests {

    @Test("Post decodes with refs + reactions, tolerates missing keys")
    func decodesPost() throws {
        let json = """
        { "id": "p1", "author": "Tomas", "body": "hello", "kind": "message",
          "createdAt": "2026-06-14T00:00:00.000Z",
          "references": [{ "kind": "project", "id": "x", "label": "RUTA" }],
          "reactions": [{ "emoji": "👍", "count": 2, "reactedByMe": true }] }
        """.data(using: .utf8)!
        let post = try JSONDecoder().decode(Post.self, from: json)
        #expect(post.id == "p1")
        #expect(post.body == "hello")
        #expect(post.references.first?.label == "RUTA")
        #expect(post.reactions.first?.count == 2)
        #expect(post.reactions.first?.reactedByMe == true)
    }

    @Test("Post tolerates a bare/minimal object")
    func decodesMinimalPost() throws {
        let json = #"{ "id": "p2", "body": "x" }"#.data(using: .utf8)!
        let post = try JSONDecoder().decode(Post.self, from: json)
        #expect(post.id == "p2")
        #expect(post.references.isEmpty)
        #expect(post.reactions.isEmpty)
    }

    @Test("THNotification headline prefers title, then actor+body, then kind")
    func notificationHeadline() throws {
        let titled = try JSONDecoder().decode(THNotification.self, from:
            #"{ "id": "n1", "title": "Review the deck", "kind": "assignment" }"#.data(using: .utf8)!)
        #expect(titled.headline == "Review the deck")

        let mention = try JSONDecoder().decode(THNotification.self, from:
            #"{ "id": "n2", "kind": "mention", "authorName": "Ana", "body": "ping" }"#.data(using: .utf8)!)
        #expect(mention.headline == "Ana: ping")

        let bare = try JSONDecoder().decode(THNotification.self, from:
            #"{ "id": "n3", "kind": "mention" }"#.data(using: .utf8)!)
        #expect(bare.headline == "Mention")
    }

    @Test("ActionItem + ProjectFile decode")
    func decodesItemAndFile() throws {
        let item = try JSONDecoder().decode(ActionItem.self, from:
            #"{ "id": "a1", "title": "Call lawyer", "priority": "now", "done": false }"#.data(using: .utf8)!)
        #expect(item.title == "Call lawyer")
        #expect(item.priority == "now")

        let file = try JSONDecoder().decode(ProjectFile.self, from:
            #"{ "id": "f1", "label": "Deck.pdf", "mimeType": "application/pdf", "url": "https://x/y" }"#.data(using: .utf8)!)
        #expect(file.label == "Deck.pdf")
        #expect(file.url == "https://x/y")
    }
}

@Suite("Town Hall — MIME guessing")
struct MimeTypeTests {
    @Test("Known extensions map; unknown falls back")
    func guesses() {
        #expect(MimeType.guess(forFilename: "a.pdf") == "application/pdf")
        #expect(MimeType.guess(forFilename: "Photo.JPG") == "image/jpeg")
        #expect(MimeType.guess(forFilename: "notes.md") == "text/markdown")
        #expect(MimeType.guess(forFilename: "mystery.qzx") == "application/octet-stream")
    }
}
