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

    private let participantName: String?
    private let queue = DispatchQueue(label: "com.agb.capture-helper.ondevice")
    private var closed = false
    private var started = false

    private final class Channel {
        let index: Int
        let recognizer: SFSpeechRecognizer
        var request: SFSpeechAudioBufferRecognitionRequest?
        var task: SFSpeechRecognitionTask?
        init(index: Int, recognizer: SFSpeechRecognizer) {
            self.index = index
            self.recognizer = recognizer
        }
    }
    private var channels: [Channel] = []

    // The recorder's canonical wire format: 16 kHz mono PCM16 (one per channel).
    private let monoFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!

    init(participantName: String?) {
        self.participantName = participantName
        super.init()
    }

    // MARK: - LiveTranscribing

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
        ch.task = ch.recognizer.recognitionTask(with: req) { [weak self, weak ch] result, error in
            guard let self, let ch else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty { self.emit(channel: ch.index, text: text, isFinal: result.isFinal) }
                if result.isFinal { self.rotate(ch) }
            } else if error != nil {
                // ~1-minute cutoff or a transient error — restart this channel.
                self.rotate(ch)
            }
        }
    }

    /// Restart a channel's request/task so transcription continues past the
    /// framework's ~1-minute per-task ceiling. Idempotent + serialized.
    private func rotate(_ ch: Channel) {
        queue.async { [weak self] in
            guard let self, !self.closed, self.started else { return }
            guard ch.task != nil || ch.request != nil else { return } // already rotated
            ch.request?.endAudio()
            ch.task?.cancel()
            ch.request = nil
            ch.task = nil
            self.startTask(for: ch)
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
        let speaker = LiveTranscriptStreamer.label(forChannel: channel, participantName: participantName)
        let line = LiveTranscriptStreamer.Line(speaker: speaker, text: text, isFinal: isFinal, channel: channel)
        DispatchQueue.main.async { [weak self] in self?.onLine?(line) }
    }
}
