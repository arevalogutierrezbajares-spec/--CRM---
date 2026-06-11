import Foundation
import Testing
@testable import CaptureCore

// MARK: - In-process mock transport

final class MockURLProtocol: URLProtocol {
    struct Stub {
        let status: Int
        let body: Data
        var headers: [String: String] = [:]
    }

    struct RecordedRequest {
        let method: String
        let url: URL
        let headers: [String: String]
        let body: Data?
    }

    nonisolated(unsafe) static var handler: ((RecordedRequest) -> Stub)?
    nonisolated(unsafe) private static var recordedStorage: [RecordedRequest] = []
    private static let lock = NSLock()

    static var recorded: [RecordedRequest] {
        lock.lock(); defer { lock.unlock() }
        return recordedStorage
    }

    static func reset() {
        lock.lock()
        handler = nil
        recordedStorage = []
        lock.unlock()
    }

    private static func record(_ request: RecordedRequest) -> Stub {
        lock.lock(); defer { lock.unlock() }
        recordedStorage.append(request)
        guard let handler else {
            return Stub(status: 500, body: Data("no handler installed".utf8))
        }
        return handler(request)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let recordedRequest = MockURLProtocol.RecordedRequest(
            method: request.httpMethod ?? "GET",
            url: request.url!,
            headers: request.allHTTPHeaderFields ?? [:],
            body: Self.bodyData(of: request)
        )
        let stub = Self.record(recordedRequest)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.status,
            httpVersion: "HTTP/1.1",
            headerFields: stub.headers.merging(["Content-Type": "application/json"]) { a, _ in a }
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    /// URLProtocol never sees `httpBody` — only `httpBodyStream`.
    private static func bodyData(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 64 * 1024
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            guard read > 0 else { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

// MARK: - Tests
//
// .serialized: the mock transport uses process-global state, so these tests
// must not run in parallel with each other.

@Suite(.serialized) final class CaptureAPIClientTests {

    private let client: CaptureAPIClient
    private let tempDir: URL

    init() throws {
        MockURLProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: configuration)
        client = CaptureAPIClient(
            baseURL: URL(string: "https://crm.example.com")!,
            token: "agbcap_deadbeef",
            urlSession: session
        )
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-client-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    deinit {
        MockURLProtocol.reset()
        try? FileManager.default.removeItem(at: tempDir)
    }

    private func json(_ string: String) -> Data { Data(string.utf8) }

    private func writeChunkFile(seq: Int, pcmBytes: Int = 640) throws -> URL {
        let url = tempDir.appendingPathComponent(ChunkSpooler.chunkFileName(seq: seq))
        try WavCodec.wrap(pcm: Data(repeating: UInt8(seq + 1), count: pcmBytes)).write(to: url)
        return url
    }

    // MARK: ping

    @Test func pingSendsAuthAndProtocolHeaders() async throws {
        MockURLProtocol.handler = { request in
            .init(status: 200,
                  body: Data(#"{"ok":true,"workspaceId":"ws1","userId":"u1","retentionDays":30}"#.utf8))
        }
        let pong = try await client.ping()
        #expect(pong.ok)
        #expect(pong.workspaceId == "ws1")
        #expect(pong.userId == "u1")
        #expect(pong.retentionDays == 30)

        let request = try #require(MockURLProtocol.recorded.first)
        #expect(request.method == "GET")
        #expect(request.url.path == "/api/capture/ping")
        #expect(request.headers["Authorization"] == "Bearer agbcap_deadbeef")
        #expect(request.headers["X-Capture-Protocol"] == "1")
    }

    @Test func ping401MapsToUnauthorized() async {
        MockURLProtocol.handler = { _ in .init(status: 401, body: Data()) }
        await #expect(throws: CaptureAPIClient.APIError.self) {
            _ = try await self.client.ping()
        }
        do {
            _ = try await client.ping()
        } catch let error as CaptureAPIClient.APIError {
            guard case .unauthorized = error else {
                Issue.record("expected .unauthorized, got \(error)")
                return
            }
        } catch {
            Issue.record("unexpected error type \(error)")
        }
    }

    // MARK: createSession

    @Test func createSessionBodyMatchesProtocol() async throws {
        MockURLProtocol.handler = { _ in
            .init(status: 201, body: Data(#"{"sessionId":"sess-42"}"#.utf8))
        }
        let sessionId = try await client.createSession(
            meta: .init(startedAt: Date(), sourceApp: "WhatsApp"))
        #expect(sessionId == "sess-42")

        let request = try #require(MockURLProtocol.recorded.first)
        #expect(request.method == "POST")
        #expect(request.url.path == "/api/capture/sessions")
        let rawBody = try #require(request.body)
        let body = try #require(try JSONSerialization.jsonObject(with: rawBody) as? [String: Any])
        #expect(body["sampleRate"] as? Int == 16_000)
        #expect(body["channels"] as? Int == 2)
        #expect(body["format"] as? String == "wav-pcm16")
        #expect(body["helperVersion"] as? String == AudioConstants.helperVersion)
        #expect(body["sourceApp"] as? String == "WhatsApp")
        #expect(body["startedAt"] is String)
    }

    @Test func createSessionEncodesNullSourceApp() async throws {
        MockURLProtocol.handler = { _ in
            .init(status: 201, body: Data(#"{"sessionId":"s"}"#.utf8))
        }
        _ = try await client.createSession(meta: .init(startedAt: Date(), sourceApp: nil))
        let request = try #require(MockURLProtocol.recorded.first)
        let rawBody = try #require(request.body)
        let body = try #require(try JSONSerialization.jsonObject(with: rawBody) as? [String: Any])
        #expect(body["sourceApp"] is NSNull, "protocol requires explicit null")
    }

    // MARK: uploadChunk

    @Test func uploadChunkPutsWavBodyWithContentType() async throws {
        let fileURL = try writeChunkFile(seq: 3, pcmBytes: 1_000)
        let expectedBody = try Data(contentsOf: fileURL)

        MockURLProtocol.handler = { _ in
            .init(status: 200, body: Data(#"{"ok":true,"bytes":1044}"#.utf8))
        }
        let bytes = try await client.uploadChunk(sessionId: "sess-1", seq: 3, fileURL: fileURL)
        #expect(bytes == 1_044)

        let request = try #require(MockURLProtocol.recorded.first)
        #expect(request.method == "PUT")
        #expect(request.url.path == "/api/capture/sessions/sess-1/chunks/3")
        #expect(request.headers["Content-Type"] == "audio/wav")
        #expect(request.headers["Authorization"] == "Bearer agbcap_deadbeef")
        #expect(request.body == expectedBody, "raw body must be the exact WAV bytes")
    }

    @Test func uploadChunk413MapsToPayloadTooLarge() async throws {
        let fileURL = try writeChunkFile(seq: 0)
        MockURLProtocol.handler = { _ in .init(status: 413, body: Data()) }
        do {
            _ = try await client.uploadChunk(sessionId: "s", seq: 0, fileURL: fileURL)
            Issue.record("expected payloadTooLarge")
        } catch let error as CaptureAPIClient.APIError {
            guard case .payloadTooLarge = error else {
                Issue.record("expected .payloadTooLarge, got \(error)")
                return
            }
        }
    }

    // MARK: finalize + 409 recovery

    @Test func finalize409ThrowsMissingChunks() async throws {
        MockURLProtocol.handler = { _ in
            .init(status: 409, body: Data(#"{"missing":[1,3]}"#.utf8))
        }
        do {
            _ = try await client.finalize(
                sessionId: "s",
                body: .init(endedAt: Date(), durationSecs: 90, totalChunks: 4, partial: false))
            Issue.record("expected missingChunks")
        } catch let error as CaptureAPIClient.APIError {
            guard case .missingChunks(let seqs) = error else {
                Issue.record("expected .missingChunks, got \(error)")
                return
            }
            #expect(seqs == [1, 3])
        }
    }

    @Test func finalizeRecoveringReuploadsMissingThenRetries() async throws {
        let chunk1 = try writeChunkFile(seq: 1)
        let lock = NSLock()
        var finalizeCalls = 0

        MockURLProtocol.handler = { request in
            if request.url.path.hasSuffix("/finalize") {
                lock.lock(); finalizeCalls += 1; let n = finalizeCalls; lock.unlock()
                if n == 1 {
                    return .init(status: 409, body: Data(#"{"missing":[1]}"#.utf8))
                }
                return .init(
                    status: 200,
                    body: Data(#"{"ok":true,"recordingId":"rec-9","title":"Test call","brief":"b","actionItemCount":2,"contact":null,"suspectFlags":[]}"#.utf8))
            }
            return .init(status: 200, body: Data(#"{"ok":true,"bytes":1}"#.utf8))
        }

        let result = try await client.finalizeRecovering(
            sessionId: "sess-1",
            body: .init(endedAt: Date(), durationSecs: 60, totalChunks: 2, partial: false)
        ) { seq in
            seq == 1 ? chunk1 : nil
        }

        #expect(result.ok)
        #expect(result.recordingId == "rec-9")
        #expect(result.title == "Test call")
        #expect(result.actionItemCount == 2)
        #expect(!result.raw.isEmpty)

        let paths = MockURLProtocol.recorded.map { "\($0.method) \($0.url.path)" }
        #expect(paths == [
            "POST /api/capture/sessions/sess-1/finalize",
            "PUT /api/capture/sessions/sess-1/chunks/1",
            "POST /api/capture/sessions/sess-1/finalize",
        ], "409 → re-upload missing seq → retry finalize")
    }

    @Test func finalizeRecoveringGivesUpWhenChunkFileMissing() async throws {
        MockURLProtocol.handler = { request in
            if request.url.path.hasSuffix("/finalize") {
                return .init(status: 409, body: Data(#"{"missing":[7]}"#.utf8))
            }
            return .init(status: 200, body: Data())
        }
        do {
            _ = try await client.finalizeRecovering(
                sessionId: "s",
                body: .init(endedAt: Date(), durationSecs: 10, totalChunks: 8, partial: false)
            ) { _ in nil }
            Issue.record("expected missingChunks")
        } catch let error as CaptureAPIClient.APIError {
            guard case .missingChunks(let seqs) = error else {
                Issue.record("expected .missingChunks, got \(error)")
                return
            }
            #expect(seqs == [7])
        }
    }

    // MARK: abandon

    @Test func abandonSendsDelete() async throws {
        MockURLProtocol.handler = { _ in
            .init(status: 200, body: Data(#"{"ok":true}"#.utf8))
        }
        try await client.abandon(sessionId: "sess-1")
        let request = try #require(MockURLProtocol.recorded.first)
        #expect(request.method == "DELETE")
        #expect(request.url.path == "/api/capture/sessions/sess-1")
    }

    // MARK: backoff

    @Test func exponentialBackoffSequenceCappedAt60() {
        var backoff = ExponentialBackoff()
        var delays: [TimeInterval] = []
        for _ in 0..<9 { delays.append(backoff.nextDelay()) }
        #expect(delays == [1, 2, 4, 8, 16, 32, 60, 60, 60])

        backoff.reset()
        #expect(backoff.nextDelay() == 1)
    }
}
