import Foundation
import AVFoundation
import Speech
import CaptureCore

/// Common interface for the live-transcript engines so the window + AppDelegate
/// are engine-agnostic. Both the cloud streamer and the on-device transcriber
/// conform; `beginRecordingSession` picks one from config.
protocol LiveTranscribing: AnyObject {
    var onStatus: ((LiveTranscriptStreamer.Status) -> Void)? { get set }
    var onLine: ((LiveTranscriptStreamer.Line) -> Void)? { get set }
    var status: LiveTranscriptStreamer.Status { get }
    func start()
    func send(pcm: Data)
    func stop()
    /// Update far-side speaker label mid-call (FR-CALL-ATT-3). Empty → nil.
    func setParticipantName(_ name: String?)
}

extension LiveTranscriptStreamer: LiveTranscribing {}

/// On-device live transcription via Apple's Speech framework
/// (`SFSpeechRecognizer`, `requiresOnDeviceRecognition`): free, private, offline,
/// no API key. Two recognizers run in parallel — channel 0 = you (mic L),
/// channel 1 = the participant (system R) — fed from the same interleaved 16 kHz
/// stereo PCM the recorder already produces. Emits the same `Line` type as the
/// cloud streamer so the live window doesn't care which engine is running.
///
/// HARD CONTRACT (mirrors LiveTranscriptStreamer): fully decoupled from capture.
/// Any failure flips to `.unavailable`; `send(pcm:)` never blocks or throws.
///
/// `SFSpeechRecognitionTask` stops after ~1 minute, so each channel's task is
/// rotated automatically on completion/timeout and the live view continues.
final class OnDeviceTranscriber: NSObject, LiveTranscribing {

    var onStatus: ((LiveTranscriptStreamer.Status) -> Void)?
    var onLine: ((LiveTranscriptStreamer.Line) -> Void)?
    private(set) var status: LiveTranscriptStreamer.Status = .idle

    private var participantName: String?
    private let captureKind: CaptureKind
    private let queue = DispatchQueue(label: "com.agb.capture-helper.ondevice")
    private var closed = false
    private var started = false

    private final class Channel {
        let index: Int
        let recognizer: SFSpeechRecognizer
        var request: SFSpeechAudioBufferRecognitionRequest?
        var task: SFSpeechRecognitionTask?
        /// Consecutive error-driven restarts with no result in between. A healthy
        /// rotation (the ~1-minute task ceiling, after results) resets this.
        var consecutiveFailures = 0
        /// When the current task was started — used to tell a broken engine
        /// (task dies in well under a second) from normal lifecycle errors (a
        /// silent channel's ~1-minute no-speech timeout also arrives as an
        /// error, and must never count as a failure).
        var taskStartedAt = Date.distantPast
        init(index: Int, recognizer: SFSpeechRecognizer) {
            self.index = index
            self.recognizer = recognizer
        }
    }
    private var channels: [Channel] = []

    /// A task that errors out after living at least this long is treated as
    /// normal Speech-framework lifecycle, not an engine failure.
    static let healthyTaskLifetime: TimeInterval = 10

    /// Max consecutive error-driven restarts per channel before the engine
    /// declares itself unavailable. With `retryDelay` backoff this spans ~15 s —
    /// long enough to ride out a transient, short enough that the caller can
    /// fall back to the cloud engine early in the call.
    static let maxConsecutiveFailures = 6


    // The recorder's canonical wire format: 16 kHz mono PCM16 (one per channel).
    private let monoFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!

    init(participantName: String?, captureKind: CaptureKind = .call) {
        self.participantName = LiveTranscriptStreamer.normalizeParticipantName(participantName)
        self.captureKind = captureKind
        super.init()
    }

    // MARK: - LiveTranscribing

    func setParticipantName(_ name: String?) {
        let normalized = LiveTranscriptStreamer.normalizeParticipantName(name)
        queue.async { [weak self] in
            self?.participantName = normalized
        }
    }

    func start() {
        setStatus(.connecting)
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in
            guard let self else { return }
            self.queue.async {
                guard !self.closed else { return }
                guard auth == .authorized else {
                    self.setStatus(.unavailable("On-device transcription not authorized"))
                    return
                }
                guard let r0 = Self.makeRecognizer(), let r1 = Self.makeRecognizer() else {
                    self.setStatus(.unavailable("On-device speech model unavailable for this language"))
                    return
                }
                self.channels = [Channel(index: 0, recognizer: r0), Channel(index: 1, recognizer: r1)]
                self.started = true
                self.channels.forEach { self.startTask(for: $0) }
                self.setStatus(.live)
            }
        }
    }

    func send(pcm: Data) {
        guard !pcm.isEmpty else { return }
        queue.async { [weak self] in
            guard let self, !self.closed, self.started, self.channels.count == 2 else { return }
            // Interleaved L,R,L,R Int16 → two mono arrays.
            let sampleCount = pcm.count / MemoryLayout<Int16>.size
            let frames = sampleCount / 2
            guard frames > 0 else { return }
            var left = [Int16](repeating: 0, count: frames)
            var right = [Int16](repeating: 0, count: frames)
            pcm.withUnsafeBytes { raw in
                let s = raw.bindMemory(to: Int16.self)
                for i in 0..<frames {
                    left[i] = s[2 * i]
                    right[i] = s[2 * i + 1]
                }
            }
            self.append(left, to: self.channels[0])
            self.append(right, to: self.channels[1])
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self, !self.closed else { return }
            self.closed = true
            for ch in self.channels {
                ch.request?.endAudio()
                ch.task?.cancel()
            }
            self.channels = []
        }
    }

    // MARK: - Internals

    /// Prefer the user's system language, then common Spanish/English variants —
    /// only locales whose on-device model is actually present.
    private static func makeRecognizer() -> SFSpeechRecognizer? {
        let candidates = [Locale.current.identifier, "es-MX", "es-ES", "es-US", "en-US"]
        for id in candidates {
            if let r = SFSpeechRecognizer(locale: Locale(identifier: id)), r.supportsOnDeviceRecognition {
                return r
            }
        }
        return nil
    }

    private func startTask(for ch: Channel) {
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        if #available(macOS 13, *) { req.addsPunctuation = true }
        ch.request = req
        ch.taskStartedAt = Date()
        ch.task = ch.recognizer.recognitionTask(with: req) { [weak self, weak ch] result, error in
            guard let self, let ch else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty {
                    self.queue.async { ch.consecutiveFailures = 0 }
                    self.emit(channel: ch.index, text: text, isFinal: result.isFinal)
                }
                if result.isFinal { self.rotate(ch, afterError: false) }
            } else if let error {
                // ~1-minute cutoff or a real failure — restart with backoff so a
                // permanently-broken recognizer can't spin us in a hot loop.
                self.rotate(ch, afterError: true, message: error.localizedDescription)
            }
        }
    }

    /// Restart a channel's request/task so transcription continues past the
    /// framework's ~1-minute per-task ceiling. Idempotent + serialized.
    /// Error-driven restarts back off exponentially and, after
    /// `maxConsecutiveFailures`, flip the whole engine to `.unavailable` (the
    /// AppDelegate then swaps in the cloud engine unless the user chose
    /// local-only).
    private func rotate(_ ch: Channel, afterError: Bool, message: String? = nil) {
        queue.async { [weak self] in
            guard let self, !self.closed, self.started else { return }
            guard ch.task != nil || ch.request != nil else { return } // already rotated
            ch.request?.endAudio()
            ch.task?.cancel()
            ch.request = nil
            ch.task = nil

            // Long-lived tasks that error are normal lifecycle (no-speech
            // timeout / task ceiling) — rotate immediately, health intact.
            let lifetime = Date().timeIntervalSince(ch.taskStartedAt)
            guard afterError, lifetime < Self.healthyTaskLifetime else {
                ch.consecutiveFailures = 0
                self.startTask(for: ch)
                return
            }

            ch.consecutiveFailures += 1
            if ch.consecutiveFailures >= Self.maxConsecutiveFailures {
                HelperLog.shared.warn(
                    "on-device transcription ch\(ch.index) failed \(ch.consecutiveFailures)× in a row"
                        + " (last: \(message ?? "unknown")) — giving up on this engine",
                    category: "live"
                )
                self.started = false
                for other in self.channels {
                    other.request?.endAudio()
                    other.task?.cancel()
                    other.request = nil
                    other.task = nil
                }
                self.setStatus(.unavailable("On-device transcription is failing on this Mac"))
                return
            }

            let delay = LiveBackoff.onDeviceRetryDelay(consecutiveFailures: ch.consecutiveFailures)
            HelperLog.shared.warn(
                "on-device transcription ch\(ch.index) error (\(message ?? "unknown")) — "
                    + "restart \(ch.consecutiveFailures)/\(Self.maxConsecutiveFailures) in \(delay)s",
                category: "live"
            )
            self.queue.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, !self.closed, self.started else { return }
                guard ch.task == nil, ch.request == nil else { return }
                self.startTask(for: ch)
            }
        }
    }

    private func append(_ samples: [Int16], to ch: Channel) {
        guard let req = ch.request,
              let buf = AVAudioPCMBuffer(pcmFormat: monoFormat,
                                         frameCapacity: AVAudioFrameCount(samples.count)) else { return }
        buf.frameLength = AVAudioFrameCount(samples.count)
        if let dst = buf.int16ChannelData?[0] {
            samples.withUnsafeBufferPointer { src in
                if let base = src.baseAddress { dst.update(from: base, count: samples.count) }
            }
        }
        req.append(buf)
    }

    private func setStatus(_ s: LiveTranscriptStreamer.Status) {
        DispatchQueue.main.async { [weak self] in
            self?.status = s
            self?.onStatus?(s)
        }
    }

    private func emit(channel: Int, text: String, isFinal: Bool) {
        // Always called on `queue` — read participantName here (same serial queue).
        // Mic-only kinds: only the mic channel carries speech (R is silence).
        if !captureKind.capturesSystemAudio, channel != 0 { return }
        let speaker = LiveTranscriptStreamer.label(forChannel: channel,
                                                   participantName: participantName,
                                                   kind: captureKind)
        let line = LiveTranscriptStreamer.Line(speaker: speaker, text: text, isFinal: isFinal, channel: channel)
        DispatchQueue.main.async { [weak self] in self?.onLine?(line) }
    }
}
