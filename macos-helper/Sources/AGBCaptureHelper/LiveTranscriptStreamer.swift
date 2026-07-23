import Foundation
import CaptureCore

/// Best-effort live transcription over a direct Deepgram streaming WebSocket
/// (FEATURE 2). The Helper mints a short-lived Deepgram token from the CRM
/// (`POST /api/capture/live-token`, mirroring the browser recorder's
/// `/api/voice/live-token`) then streams a *copy* of the interleaved 16 kHz
/// stereo PCM the recorder already produces straight to
/// `wss://api.deepgram.com/v1/listen`.
///
/// HARD CONTRACT: this path is fully decoupled from capture. Token failure, a
/// dropped socket, or any Deepgram error only flips this object to a quiet
/// `.unavailable` state — it never throws into, blocks, or stops the recorder.
/// `send(pcm:)` enqueues and returns immediately; if the socket is down the
/// bytes are dropped on the floor.
final class LiveTranscriptStreamer: NSObject {

    enum Status: Equatable {
        case idle
        case connecting
        case live
        /// The stream dropped (network hiccup, TLS corruption, Deepgram close)
        /// and the engine is re-opening it with backoff. Recording unaffected.
        case reconnecting(attempt: Int)
        /// Best-effort path gave up; recording continues unaffected.
        case unavailable(String)
    }


    /// Deepgram channel index → speaker label. ch0 = mic (founder / room), ch1 = system.
    static func label(forChannel index: Int,
                      participantName: String?,
                      kind: CaptureKind = .call) -> String {
        switch index {
        case 0: return kind.primarySpeakerLabel(participantName: participantName)
        case 1: return kind.secondarySpeakerLabel(participantName: participantName)
        default: return "Channel \(index)"
        }
    }

    /// Trim + empty → nil so unlabeled calls stay "Participant".
    static func normalizeParticipantName(_ name: String?) -> String? {
        guard let t = name?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else {
            return nil
        }
        return t
    }

    /// One finalized or interim transcript line.
    struct Line: Equatable {
        let speaker: String
        let text: String
        let isFinal: Bool
        let channel: Int
    }

    // Callbacks delivered on the main queue.
    var onStatus: ((Status) -> Void)?
    /// Emitted for every result: interim (isFinal=false) replaces the live tail;
    /// final appends and clears the interim for that channel.
    var onLine: ((Line) -> Void)?

    private let config: HelperConfig
    private var participantName: String?
    private let captureKind: CaptureKind
    private let session: URLSession
    private var task: URLSessionWebSocketTask?
    private let queue = DispatchQueue(label: "com.agb.capture-helper.live")
    private var closed = false
    private var opened = false
    private var pendingBeforeOpen: [Data] = []
    private(set) var status: Status = .idle
    /// Consecutive failed opens since the last successful message (queue-only).
    private var reconnectAttempts = 0
    /// True while a reconnect is scheduled/minting, so overlapping failures
    /// (receive-loop error + send errors) collapse into one attempt.
    private var reconnectPending = false

    init(config: HelperConfig, participantName: String? = nil, captureKind: CaptureKind = .call) {
        self.config = config
        self.participantName = Self.normalizeParticipantName(participantName)
        self.captureKind = captureKind
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 15
        cfg.waitsForConnectivity = false
        self.session = URLSession(configuration: cfg)
        super.init()
    }

    /// Update far-side speaker label mid-call. Thread-safe; subsequent lines use the new name.
    func setParticipantName(_ name: String?) {
        let normalized = Self.normalizeParticipantName(name)
        queue.async { [weak self] in
            self?.participantName = normalized
        }
    }

    // MARK: - Lifecycle

    /// Mint a token and open the stream. Returns immediately; all work is async.
    /// Any failure is swallowed into `.unavailable`.
    func start() {
        setStatus(.connecting)
        Task { [weak self] in
            guard let self else { return }
            do {
                let token = try await self.fetchToken()
                self.openSocketAsync(token: token)
            } catch {
                HelperLog.shared.warn("live transcript token failed: \(error.localizedDescription)", category: "live")
                self.setStatus(.unavailable("Live transcript unavailable (token)"))
            }
        }
    }

    private func openSocketAsync(token: String) {
        queue.async { [weak self] in
            guard let self, !self.closed else { return }
            self.openSocket(token: token)
        }
    }

    /// Stream one interleaved-stereo PCM16 batch. Non-blocking; dropped if the
    /// socket isn't open yet (a small pre-open buffer covers the handshake gap).
    func send(pcm: Data) {
        guard !pcm.isEmpty else { return }
        queue.async { [weak self] in
            guard let self, !self.closed else { return }
            // Send as soon as the socket task exists (resumed). URLSession queues
            // messages until the WS handshake completes, so we must NOT wait for
            // a *received* message first: Deepgram stays silent until it receives
            // audio, so gating sends on `opened` deadlocked the stream and Deepgram
            // closed it on its ~12s no-audio timeout ("Socket is not connected").
            // Only buffer while the task doesn't exist yet (token still minting).
            guard let task = self.task else {
                if self.pendingBeforeOpen.count < 40 { self.pendingBeforeOpen.append(pcm) }
                return
            }
            task.send(.data(pcm)) { error in
                if let error {
                    HelperLog.shared.warn("live transcript send failed: \(error.localizedDescription)", category: "live")
                }
            }
        }
    }

    /// Stop the stream cleanly. Safe to call repeatedly; never affects capture.
    func stop() {
        queue.async { [weak self] in
            guard let self, !self.closed else { return }
            self.closed = true
            if let task = self.task, self.opened {
                // Deepgram flushes finals on a CloseStream control message.
                let msg = #"{"type":"CloseStream"}"#
                task.send(.string(msg)) { _ in }
            }
            self.task?.cancel(with: .goingAway, reason: nil)
            self.task = nil
            self.pendingBeforeOpen.removeAll()
            self.setStatus(.idle)
        }
    }

    // MARK: - Token

    private func fetchToken() async throws -> String {
        guard let url = config.liveTokenURL, !config.token.isEmpty else {
            throw LiveError.notConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.setValue(AudioConstants.protocolVersion, forHTTPHeaderField: "X-Capture-Protocol")
        request.setValue("AGBCaptureHelper/\(AudioConstants.helperVersion)", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw LiveError.http(code)
        }
        struct Grant: Decodable { let token: String?; let expiresIn: Int? }
        let grant = try JSONDecoder().decode(Grant.self, from: data)
        guard let token = grant.token, !token.isEmpty else { throw LiveError.noToken }
        return token
    }

    // MARK: - WebSocket

    private func openSocket(token: String) {
        guard !closed else { return }
        // Match the post-call transcription model where possible: multichannel
        // nova-3, multilingual, linear16 @ 16 kHz stereo, interim results.
        var components = URLComponents(string: "wss://api.deepgram.com/v1/listen")!
        components.queryItems = [
            URLQueryItem(name: "model", value: "nova-3"),
            URLQueryItem(name: "language", value: "multi"),
            URLQueryItem(name: "multichannel", value: "true"),
            URLQueryItem(name: "channels", value: "\(AudioConstants.channels)"),
            URLQueryItem(name: "encoding", value: "linear16"),
            URLQueryItem(name: "sample_rate", value: "\(AudioConstants.sampleRate)"),
            URLQueryItem(name: "interim_results", value: "true"),
            URLQueryItem(name: "punctuate", value: "true"),
        ]
        guard let url = components.url else {
            setStatus(.unavailable("Live transcript unavailable (URL)"))
            return
        }

        var request = URLRequest(url: url)
        // The short-lived grant is a JWT — Deepgram requires `Bearer <jwt>` on
        // the WS upgrade (`Token <key>` is only for the permanent API key, and
        // returns 401 "Invalid credentials" for a JWT). Verified: Bearer + these
        // params → 101 Switching Protocols.
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        // Flush whatever we buffered while the token was minting, immediately —
        // URLSession queues these until the handshake finishes. Starting the
        // audio flow now is what keeps Deepgram from timing out.
        flushPending(task: task)
        receiveLoop(task: task)
        HelperLog.shared.info("live transcript socket opening", category: "live")
    }

    private func receiveLoop(task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }
            self.queue.async {
                guard !self.closed, self.task === task else { return }
                switch result {
                case .success(let message):
                    if !self.opened {
                        self.opened = true
                        self.reconnectAttempts = 0
                        self.setStatus(.live)
                        self.flushPending(task: task)
                    }
                    if case .string(let text) = message {
                        self.handle(text: text)
                    }
                    self.receiveLoop(task: task)
                case .failure(let error):
                    HelperLog.shared.warn("live transcript socket closed: \(error.localizedDescription)", category: "live")
                    self.task = nil
                    self.opened = false
                    self.scheduleReconnect()
                }
            }
        }
    }

    /// Re-open the stream after a mid-call drop. Must run on `queue`. Mints a
    /// fresh token every time (the grant is short-lived) and retries for as
    /// long as the recording lasts — `stop()` is the only way out. While a
    /// reconnect waits, `send(pcm:)` keeps buffering up to its small pre-open
    /// window so a quick blip loses little or nothing in the live view.
    private func scheduleReconnect() {
        guard !closed, !reconnectPending else { return }
        reconnectPending = true
        reconnectAttempts += 1
        let delay = LiveBackoff.reconnectDelay(attempt: reconnectAttempts)
        setStatus(.reconnecting(attempt: reconnectAttempts))
        HelperLog.shared.info(
            "live transcript reconnecting in \(Int(delay))s (attempt \(reconnectAttempts))",
            category: "live"
        )
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.closed else { return }
            Task { [weak self] in
                guard let self else { return }
                do {
                    let token = try await self.fetchToken()
                    self.queue.async { [weak self] in
                        guard let self, !self.closed else { return }
                        self.reconnectPending = false
                        self.openSocket(token: token)
                    }
                } catch {
                    HelperLog.shared.warn(
                        "live transcript reconnect token failed: \(error.localizedDescription)",
                        category: "live"
                    )
                    self.queue.async { [weak self] in
                        guard let self, !self.closed else { return }
                        self.reconnectPending = false
                        self.scheduleReconnect()
                    }
                }
            }
        }
    }

    private func flushPending(task: URLSessionWebSocketTask) {
        let batch = pendingBeforeOpen
        pendingBeforeOpen.removeAll()
        for data in batch {
            task.send(.data(data)) { _ in }
        }
    }

    private func handle(text: String) {
        guard let data = text.data(using: .utf8),
              let result = try? JSONDecoder().decode(DeepgramResult.self, from: data),
              let transcript = result.channel?.alternatives?.first?.transcript,
              !transcript.trimmingCharacters(in: .whitespaces).isEmpty else {
            return
        }
        // multichannel results carry channel_index = [thisChannel, totalChannels].
        // Read label on the serial queue so mid-call renames are consistent.
        let channel = result.channelIndex?.first ?? 0
        queue.async { [weak self] in
            guard let self else { return }
            // Mic-only kinds (meeting, speakerphone): R is silence by design, so
            // any ch1 result is bleed or noise rather than the far side. Mirrors
            // OnDeviceTranscriber.emit — without it a phantom "Remote:" line can
            // appear mid-call.
            if !self.captureKind.capturesSystemAudio, channel != 0 { return }
            let speaker = Self.label(forChannel: channel,
                                     participantName: self.participantName,
                                     kind: self.captureKind)
            let line = Line(speaker: speaker,
                            text: transcript,
                            isFinal: result.isFinal ?? false,
                            channel: channel)
            DispatchQueue.main.async { self.onLine?(line) }
        }
    }

    // MARK: - Status

    private func setStatus(_ newStatus: Status) {
        status = newStatus
        DispatchQueue.main.async { [weak self] in self?.onStatus?(newStatus) }
    }

    // MARK: - Types

    private enum LiveError: Error, LocalizedError {
        case notConfigured, noToken, http(Int)
        var errorDescription: String? {
            switch self {
            case .notConfigured: return "CRM URL/token not set"
            case .noToken: return "CRM returned no Deepgram token"
            case .http(let code): return "live-token HTTP \(code)"
            }
        }
    }

    private struct DeepgramResult: Decodable {
        struct Channel: Decodable {
            struct Alternative: Decodable { let transcript: String? }
            let alternatives: [Alternative]?
        }
        let channel: Channel?
        let isFinal: Bool?
        let channelIndex: [Int]?

        enum CodingKeys: String, CodingKey {
            case channel
            case isFinal = "is_final"
            case channelIndex = "channel_index"
        }
    }
}
