import Foundation
import Testing
@testable import CaptureCore

@Suite final class UploadQueueWorkerStallTests {
    private let rootDir: URL
    private let store: SpoolStore

    init() throws {
        rootDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-worker-stall-\(UUID().uuidString)/spool", isDirectory: true)
        store = try SpoolStore(rootURL: rootDir)
    }

    deinit {
        try? FileManager.default.removeItem(at: rootDir.deletingLastPathComponent())
    }

    /// A persistently failing upload escalates to `.stalled` and fires the
    /// onStalled hook exactly once — the fix for the silent infinite retry that
    /// hid a stuck call for hours. A nil client makes every pass fail, and a
    /// zero stall threshold makes the first failure cross it immediately.
    @Test func stallEscalatesOnceAndSurfacesState() async {
        let worker = UploadQueueWorker(store: store, clientProvider: { nil })
        var stallReasons: [String] = []
        var sawStalledState = false
        worker.onStateChange = { state in
            if case .stalled = state { sawStalledState = true }
        }
        worker.onStalled = { reason in
            stallReasons.append(reason)
            worker.stop() // end the forever loop after the first escalation
        }

        await worker.runForever(pollInterval: 0.01, stallThreshold: 0)

        #expect(stallReasons.count == 1)
        #expect(sawStalledState)
    }

    /// Below the threshold the worker stays on the quiet `.waitingRetry` path
    /// and does NOT fire the stall hook — no false alarms for brief blips.
    @Test func transientFailureDoesNotEscalate() async {
        let worker = UploadQueueWorker(store: store, clientProvider: { nil })
        var stalls = 0
        var retries = 0
        worker.onStalled = { _ in stalls += 1 }
        worker.onStateChange = { state in
            if case .waitingRetry = state {
                retries += 1
                if retries >= 2 { worker.stop() } // a couple of quiet retries, then stop
            }
        }

        // High threshold → the few-millisecond run never reaches it.
        await worker.runForever(pollInterval: 0.01, stallThreshold: 3600)

        #expect(stalls == 0)
        #expect(retries >= 1)
    }
}
