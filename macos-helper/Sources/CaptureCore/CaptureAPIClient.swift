import Foundation

/// URLSession client for the Call Capture Protocol v1
/// (docs/CALL-CAPTURE-PROTOCOL.md). Every request carries
/// `Authorization: Bearer agbcap_…` and `X-Capture-Protocol: 1`.
public final class CaptureAPIClient {

    // MARK: - Wire types

    public struct PingResponse: Decodable {
        public let ok: Bool
        public let workspaceId: String?
        public let userId: String?
        public let retentionDays: Int?

        enum CodingKeys: String, CodingKey { case ok, workspaceId, userId, retentionDays }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            ok = try c.decode(Bool.self, forKey: .ok)
            workspaceId = Self.lenientString(c, .workspaceId)
            userId = Self.lenientString(c, .userId)
            retentionDays = try? c.decodeIfPresent(Int.self, forKey: .retentionDays)
        }

        private static func lenientString(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> String? {
            if let s = try? c.decodeIfPresent(String.self, forKey: key) { return s }
            if let i = try? c.decodeIfPresent(Int.self, forKey: key) { return String(i) }
            return nil
        }
    }

    /// Body of `POST /api/capture/sessions`.
    public struct SessionMeta: Encodable {
        public let startedAt: String
        public let sourceApp: String?
        public let sampleRate: Int
        public let channels: Int
        public let format: String
        public let helperVersion: String

        public init(startedAt: Date,
                    sourceApp: String?,
                    helperVersion: String = AudioConstants.helperVersion) {
            self.startedAt = ISO8601.string(from: startedAt)
            self.sourceApp = sourceApp
            self.sampleRate = AudioConstants.sampleRate
            self.channels = AudioConstants.channels
            self.format = "wav-pcm16"
            self.helperVersion = helperVersion
        }

        public init(manifest: SessionManifest, helperVersion: String = AudioConstants.helperVersion) {
            self.startedAt = manifest.startedAt
            self.sourceApp = manifest.sourceApp
            self.sampleRate = AudioConstants.sampleRate
            self.channels = AudioConstants.channels
            self.format = "wav-pcm16"
            self.helperVersion = helperVersion
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: DynamicKey.self)
            try c.encode(startedAt, forKey: .init("startedAt"))
            // Protocol shows "sourceApp": "WhatsApp" | null — encode explicit null.
            if let sourceApp {
                try c.encode(sourceApp, forKey: .init("sourceApp"))
            } else {
                try c.encodeNil(forKey: .init("sourceApp"))
            }
            try c.encode(sampleRate, forKey: .init("sampleRate"))
            try c.encode(channels, forKey: .init("channels"))
            try c.encode(format, forKey: .init("format"))
            try c.encode(helperVersion, forKey: .init("helperVersion"))
        }
    }

    /// Body of `POST /api/capture/sessions/{id}/finalize`.
    public struct FinalizeBody: Encodable {
        public let endedAt: String
        public let durationSecs: Int
        public let totalChunks: Int
        public let partial: Bool
        public let contactName: String?
        /// Local free STT+diarize payload (skips Deepgram when present).
        public let precomputedTranscript: PrecomputedTranscript?

        public struct PrecomputedTranscript: Encodable {
            public let language: String?
            public let engine: String?
            public let utterances: [Utterance]

            public struct Utterance: Encodable {
                public let speaker: String
                public let diarizationId: String?
                public let channel: Int
                public let start: Double
                public let end: Double
                public let text: String

                public init(speaker: String, diarizationId: String?, channel: Int,
                            start: Double, end: Double, text: String) {
                    self.speaker = speaker
                    self.diarizationId = diarizationId
                    self.channel = channel
                    self.start = start
                    self.end = end
                    self.text = text
                }
            }

            public init(language: String?, engine: String?, utterances: [Utterance]) {
                self.language = language
                self.engine = engine
                self.utterances = utterances
            }

            public init(_ t: LocalTranscript) {
                language = t.language
                engine = t.engine
                utterances = t.utterances.map {
                    Utterance(speaker: $0.speaker, diarizationId: $0.diarizationId,
                              channel: $0.channel, start: $0.start, end: $0.end, text: $0.text)
                }
            }
        }

        public init(endedAt: Date, durationSecs: Int, totalChunks: Int,
                    partial: Bool, contactName: String? = nil,
                    precomputedTranscript: PrecomputedTranscript? = nil) {
            self.endedAt = ISO8601.string(from: endedAt)
            self.durationSecs = durationSecs
            self.totalChunks = totalChunks
            self.partial = partial
            self.contactName = contactName
            self.precomputedTranscript = precomputedTranscript
        }

        public init(endedAtISO: String, durationSecs: Int, totalChunks: Int,
                    partial: Bool, contactName: String? = nil,
                    precomputedTranscript: PrecomputedTranscript? = nil) {
            self.endedAt = endedAtISO
            self.durationSecs = durationSecs
            self.totalChunks = totalChunks
            self.partial = partial
            self.contactName = contactName
            self.precomputedTranscript = precomputedTranscript
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: DynamicKey.self)
            try c.encode(endedAt, forKey: .init("endedAt"))
            try c.encode(durationSecs, forKey: .init("durationSecs"))
            try c.encode(totalChunks, forKey: .init("totalChunks"))
            try c.encode(partial, forKey: .init("partial"))
            if let contactName {
                try c.encode(contactName, forKey: .init("contactName"))
            } else {
                try c.encodeNil(forKey: .init("contactName"))
            }
            if let precomputedTranscript {
                try c.encode(precomputedTranscript, forKey: .init("precomputedTranscript"))
            }
        }
    }

    public struct ContactRef: Decodable, Equatable {
        public let id: String?
        public let name: String?

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: DynamicKey.self)
            id = (try? c.decodeIfPresent(String.self, forKey: .init("id")))
                ?? (try? c.decodeIfPresent(Int.self, forKey: .init("id"))).map(String.init)
            name = try? c.decodeIfPresent(String.self, forKey: .init("name"))
        }
    }

    public struct FinalizeResult: Decodable {
        public let ok: Bool
        public let recordingId: String?
        public let title: String?
        public let brief: String?
        public let actionItemCount: Int?
        public let contact: ContactRef?
        public let suspectFlags: [String]?
        /// Raw response body, for printing / diagnostics.
        public var raw: Data = Data()

        enum CodingKeys: String, CodingKey {
            case ok, recordingId, title, brief, actionItemCount, contact, suspectFlags
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            ok = (try? c.decode(Bool.self, forKey: .ok)) ?? false
            recordingId = (try? c.decodeIfPresent(String.self, forKey: .recordingId))
                ?? (try? c.decodeIfPresent(Int.self, forKey: .recordingId)).map(String.init)
            title = try? c.decodeIfPresent(String.self, forKey: .title)
            brief = try? c.decodeIfPresent(String.self, forKey: .brief)
            actionItemCount = try? c.decodeIfPresent(Int.self, forKey: .actionItemCount)
            contact = try? c.decodeIfPresent(ContactRef.self, forKey: .contact)
            suspectFlags = try? c.decodeIfPresent([String].self, forKey: .suspectFlags)
        }
    }

    struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    // MARK: - Errors

    public enum APIError: Error, LocalizedError {
        /// 401 — token invalid or revoked; helper surfaces "reconnect" (FR-CALL-OPS-2).
        case unauthorized
        /// 404 — unknown or closed session.
        case sessionNotFound
        /// 413 — chunk over the 4 MB cap.
        case payloadTooLarge
        /// 409 from finalize — server lists missing seqs to re-upload.
        case missingChunks([Int])
        case http(status: Int, body: String)
        case network(String)
        case invalidResponse
        case decoding(String)

        public var errorDescription: String? {
            switch self {
            case .unauthorized: return "401 — capture token invalid or revoked; re-mint in CRM Settings"
            case .sessionNotFound: return "404 — session unknown or closed on server"
            case .payloadTooLarge: return "413 — chunk exceeded server body limit"
            case .missingChunks(let seqs): return "409 — server missing chunks \(seqs)"
            case .http(let status, let body): return "HTTP \(status): \(body.prefix(300))"
            case .network(let why): return "Network: \(why)"
            case .invalidResponse: return "Invalid (non-HTTP) response"
            case .decoding(let why): return "Response decode failed: \(why)"
            }
        }

        /// Network-level failures (likely whole-link down) vs per-request errors.
        public var isNetworkFailure: Bool {
            if case .network = self { return true }
            return false
        }
    }

    // MARK: - Client

    public let baseURL: URL
    private let token: String
    private let session: URLSession
    /// Finalize is synchronous server-side and may take ~1–10 min.
    public var finalizeTimeout: TimeInterval = 15 * 60
    public var requestTimeout: TimeInterval = 60

    public init(baseURL: URL, token: String, urlSession: URLSession? = nil) {
        self.baseURL = baseURL
        self.token = token
        if let urlSession {
            self.session = urlSession
        } else {
            let cfg = URLSessionConfiguration.ephemeral
            cfg.timeoutIntervalForRequest = 16 * 60
            cfg.timeoutIntervalForResource = 60 * 60
            cfg.waitsForConnectivity = false
            self.session = URLSession(configuration: cfg)
        }
    }

    public convenience init?(config: HelperConfig, urlSession: URLSession? = nil) {
        guard let url = URL(string: config.crmBaseUrl), !config.token.isEmpty else { return nil }
        self.init(baseURL: url, token: config.token, urlSession: urlSession)
    }

    // MARK: - Endpoints

    /// `GET /api/capture/ping`
    public func ping() async throws -> PingResponse {
        let request = makeRequest(path: "/api/capture/ping", method: "GET")
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 200 else { throw APIError.http(status: status, body: bodyString(data)) }
        return try decode(PingResponse.self, from: data)
    }

    /// `POST /api/capture/sessions` → sessionId
    public func createSession(meta: SessionMeta) async throws -> String {
        var request = makeRequest(path: "/api/capture/sessions", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(meta)
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 201 || status == 200 else {
            throw APIError.http(status: status, body: bodyString(data))
        }
        struct CreateResponse: Decodable { let sessionId: String }
        return try decode(CreateResponse.self, from: data).sessionId
    }

    /// `PUT /api/capture/sessions/{id}/chunks/{seq}` — raw WAV body. Idempotent
    /// (re-uploading a seq overwrites it). Returns server-confirmed byte count.
    @discardableResult
    public func uploadChunk(sessionId: String, seq: Int, fileURL: URL) async throws -> Int {
        let wav: Data
        do {
            wav = try Data(contentsOf: fileURL)
        } catch {
            throw APIError.network("could not read chunk file \(fileURL.lastPathComponent): \(error.localizedDescription)")
        }
        var request = makeRequest(path: "/api/capture/sessions/\(sessionId)/chunks/\(seq)", method: "PUT")
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        let (data, status) = try await send(request, body: wav)
        try throwForCommonStatus(status, data: data)
        guard status == 200 else { throw APIError.http(status: status, body: bodyString(data)) }
        struct UploadResponse: Decodable { let ok: Bool; let bytes: Int? }
        let parsed = try? decode(UploadResponse.self, from: data)
        return parsed?.bytes ?? wav.count
    }

    /// `POST /api/capture/sessions/{id}/finalize`. Throws `.missingChunks` on 409.
    public func finalize(sessionId: String, body: FinalizeBody) async throws -> FinalizeResult {
        var request = makeRequest(path: "/api/capture/sessions/\(sessionId)/finalize", method: "POST")
        request.timeoutInterval = finalizeTimeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, status) = try await send(request)
        if status == 409 {
            struct Missing: Decodable { let missing: [Int] }
            let missing = (try? JSONDecoder().decode(Missing.self, from: data))?.missing ?? []
            throw APIError.missingChunks(missing)
        }
        try throwForCommonStatus(status, data: data)
        guard status == 200 else { throw APIError.http(status: status, body: bodyString(data)) }
        var result = try decode(FinalizeResult.self, from: data)
        result.raw = data
        return result
    }

    /// Finalize with the protocol's 409 recovery loop: re-upload the seqs the
    /// server reports missing (from local chunk files), then retry. Bounded so
    /// a pathological server can't loop us forever.
    public func finalizeRecovering(sessionId: String,
                                   body: FinalizeBody,
                                   maxAttempts: Int = 3,
                                   chunkFileURL: (Int) -> URL?) async throws -> FinalizeResult {
        var attempt = 0
        while true {
            attempt += 1
            do {
                return try await finalize(sessionId: sessionId, body: body)
            } catch APIError.missingChunks(let seqs) {
                guard attempt < maxAttempts, !seqs.isEmpty else {
                    throw APIError.missingChunks(seqs)
                }
                for seq in seqs.sorted() {
                    guard let url = chunkFileURL(seq) else {
                        // We can't satisfy the server — surface the 409 as-is.
                        throw APIError.missingChunks(seqs)
                    }
                    try await uploadChunk(sessionId: sessionId, seq: seq, fileURL: url)
                }
            }
        }
    }

    /// `DELETE /api/capture/sessions/{id}` — abandon; zero artifacts persist.
    public func abandon(sessionId: String) async throws {
        let request = makeRequest(path: "/api/capture/sessions/\(sessionId)", method: "DELETE")
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 200 || status == 204 else {
            throw APIError.http(status: status, body: bodyString(data))
        }
    }

    // MARK: - Plumbing

    func makeRequest(path: String, method: String) -> URLRequest {
        var url = baseURL
        // Avoid double slashes when baseURL has a trailing slash.
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        if url.path.hasSuffix("/") || url.path.isEmpty {
            url = url.appendingPathComponent(trimmed)
        } else {
            url = url.appendingPathComponent(trimmed)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = requestTimeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(AudioConstants.protocolVersion, forHTTPHeaderField: "X-Capture-Protocol")
        request.setValue("AGBCaptureHelper/\(AudioConstants.helperVersion)", forHTTPHeaderField: "User-Agent")
        return request
    }

    func send(_ request: URLRequest, body: Data? = nil) async throws -> (Data, Int) {
        do {
            let (data, response): (Data, URLResponse)
            if let body {
                (data, response) = try await session.upload(for: request, from: body)
            } else {
                (data, response) = try await session.data(for: request)
            }
            guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
            return (data, http.statusCode)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error.localizedDescription)
        }
    }

    func throwForCommonStatus(_ status: Int, data: Data) throws {
        switch status {
        case 401: throw APIError.unauthorized
        case 404: throw APIError.sessionNotFound
        case 413: throw APIError.payloadTooLarge
        default: break
        }
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.decoding("\(error) — body: \(bodyString(data).prefix(200))")
        }
    }

    func bodyString(_ data: Data) -> String {
        String(data: data, encoding: .utf8) ?? "<\(data.count) bytes>"
    }
}

// MARK: - Backoff

/// Exponential backoff: 1 s, 2 s, 4 s, … capped at 60 s (FR-CALL-TRX-2).
public struct ExponentialBackoff {
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval
    private var attempt = 0

    public init(baseDelay: TimeInterval = 1, maxDelay: TimeInterval = 60) {
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
    }

    /// Delay to wait before the next retry. First call returns `baseDelay`.
    public mutating func nextDelay() -> TimeInterval {
        let delay = min(baseDelay * pow(2, Double(attempt)), maxDelay)
        if delay < maxDelay { attempt += 1 }
        return delay
    }

    public mutating func reset() { attempt = 0 }
}
