import Foundation
import Testing
@testable import CaptureCore

@Suite final class SpoolStoreTests {

    private let rootDir: URL
    private let store: SpoolStore

    init() throws {
        rootDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-store-tests-\(UUID().uuidString)/spool", isDirectory: true)
        store = try SpoolStore(rootURL: rootDir)
    }

    deinit {
        try? FileManager.default.removeItem(at: rootDir.deletingLastPathComponent())
    }

    @Test func createListDelete() throws {
        #expect(try store.sessionDirectories().isEmpty)

        let spoolerA = try store.createSession(localId: "aaa", startedAt: Date(), sourceApp: nil)
        let spoolerB = try store.createSession(localId: "bbb", startedAt: Date(), sourceApp: "Zoom")
        #expect(try store.sessionDirectories().count == 2)
        #expect(FileManager.default.fileExists(
            atPath: spoolerA.directory.appendingPathComponent("manifest.json").path))

        try store.deleteSession(spoolerA)
        let remaining = try store.sessionDirectories()
        #expect(remaining.count == 1)
        #expect(remaining.first?.lastPathComponent == "session-bbb")
        #expect(spoolerB.snapshot.sourceApp == "Zoom")
    }

    @Test func sessionDirectoryPermissionsAre0700() throws {
        let spooler = try store.createSession(localId: "perm", startedAt: Date(), sourceApp: nil)
        let attrs = try FileManager.default.attributesOfItem(atPath: spooler.directory.path)
        #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o700)
    }

    @Test func pendingDetectionExcludesFinalizedAndSortsOldestFirst() throws {
        _ = try store.createSession(localId: "old",
                                    startedAt: Date(timeIntervalSinceNow: -600),
                                    sourceApp: nil)
        _ = try store.createSession(localId: "recent",
                                    startedAt: Date(timeIntervalSinceNow: -60),
                                    sourceApp: nil)
        let done = try store.createSession(localId: "done",
                                           startedAt: Date(timeIntervalSinceNow: -30),
                                           sourceApp: nil)
        try done.markFinalized()

        let pending = try store.pendingSessions()
        #expect(pending.map(\.localId) == ["old", "recent"], "oldest first, finalized excluded")
    }

    @Test func openSessionReturnsSharedCachedInstance() throws {
        let created = try store.createSession(localId: "shared", startedAt: Date(), sourceApp: nil)
        let opened = try store.openSession(at: created.directory)
        #expect(created === opened, "writer and uploader must share one spooler instance")
    }

    @Test func openSessionFromDiskAfterRestart() throws {
        let created = try store.createSession(localId: "restart", startedAt: Date(),
                                              sourceApp: nil, chunkSeconds: 1)
        try created.append(Data(count: AudioConstants.bytesPerSecond))
        let dir = created.directory

        // New store = new process.
        let freshStore = try SpoolStore(rootURL: rootDir)
        let reopened = try freshStore.openSession(at: dir)
        #expect(!(created === reopened))
        #expect(reopened.snapshot.seqsWritten == [0])
    }

    @Test func adoptOrphansMarksEndedAndPartial() throws {
        let orphan = try store.createSession(localId: "orphan", startedAt: Date(),
                                             sourceApp: nil, chunkSeconds: 1)
        try orphan.append(Data(count: AudioConstants.bytesPerSecond * 2))
        #expect(orphan.snapshot.endedAt == nil)

        let active = try store.createSession(localId: "active", startedAt: Date(), sourceApp: nil)

        let adopted = try store.adoptOrphans(activeLocalIds: ["active"])
        #expect(adopted.map(\.localId) == ["orphan"])

        let snap = orphan.snapshot
        #expect(snap.endedAt != nil)
        #expect(snap.partial)
        #expect(snap.durationSecs == 2)
        #expect(active.snapshot.endedAt == nil, "active session must not be adopted")
    }

    @Test func corruptManifestIsSkippedNotFatal() throws {
        _ = try store.createSession(localId: "good", startedAt: Date(), sourceApp: nil)
        let badDir = rootDir.appendingPathComponent("session-corrupt", isDirectory: true)
        try FileManager.default.createDirectory(at: badDir, withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: badDir.appendingPathComponent("manifest.json"))

        let pending = try store.pendingSessions()
        #expect(pending.map(\.localId) == ["good"])
    }
}
