import AVFoundation
import CoreMedia
import Foundation
import QuartzCore
import ScreenCaptureKit
import CaptureCore

/// The capture core: microphone (AVAudioEngine) + system audio
/// (ScreenCaptureKit SCStream), both resampled to 16 kHz mono Int16 and
/// interleaved into stereo frames (L = mic, R = system) on a wall-clock sample
/// pump (FR-CALL-CAP-1/2/3).
///
/// Modes:
///   preroll   — interleaved bytes feed the 60 s RingBuffer only (FR-CALL-TRG-3)
///   recording — bytes feed the ChunkSpooler (pre-roll drained in first)
///   paused    — bytes are discarded; no silence padding (FR-CALL-CAP-7)
///
/// SCStream keeps delivering system audio across output-device changes; if the
/// stream errors anyway, it is restarted in place and the session continues
/// (FR-CALL-CAP-5). Persistent failures surface via `onError` within seconds
/// (FR-CALL-OPS-3).
final class AudioEngine: NSObject {

    enum Mode: String {
        case stopped, preroll, recording, paused
    }

    // Callbacks (delivered on the audio queue; hop to main for UI).
    var onError: ((String) -> Void)?

    let silenceMeter = SilenceMeter()

    private let ring = RingBuffer(capacity: AudioConstants.preRollBytes)
    private let interleaver = StereoInterleaver()
    private let queue = DispatchQueue(label: "com.agb.capture-helper.audio", qos: .userInitiated)

    private var avEngine: AVAudioEngine?
    private var scStream: SCStream?
    private var streamOutputBox: StreamOutputBox?
    private var micConverter: AVAudioConverter?
    private var micConverterInputFormat: AVAudioFormat?
    private var sysConverter: AVAudioConverter?
    private var sysConverterInputFormat: AVAudioFormat?
    private var pumpTimer: DispatchSourceTimer?
    private var configChangeObserver: NSObjectProtocol?
    private var scRestartAttempts = 0
    private var spoolFailureReported = false

    private let stateLock = NSLock()
    private var _mode: Mode = .stopped
    private var spooler: ChunkSpooler?

    private(set) var mode: Mode {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _mode }
        set { stateLock.lock(); _mode = newValue; stateLock.unlock() }
    }

    /// Mono 16 kHz Int16, interleaved-irrelevant (1 ch).
    private static let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(AudioConstants.sampleRate),
        channels: 1,
        interleaved: true
    )

    /// Seconds of audio currently in the pre-roll ring buffer.
    var preRollSeconds: Double {
        Double(ring.count) / Double(AudioConstants.bytesPerSecond)
    }

    // MARK: - Lifecycle

    /// Start both capture paths in pre-roll mode (detection fired; prompt up).
    /// Audio flows only into the in-memory ring buffer (NFR-CALL-PRIV-2).
    func startPreroll() async throws {
        guard mode == .stopped else { return }
        silenceMeter.reset()
        interleaver.reset()
        ring.clear()
        spoolFailureReported = false
        mode = .preroll

        try startMicEngine()
        try await startSystemStream()
        startPump()
        HelperLog.shared.info("engine started (preroll)", category: "audio")
    }

    /// Founder affirmed (or started manually): drain the pre-roll ring into the
    /// spooler, then feed it directly. Completes in well under 1 s (NFR-CALL-PERF-1).
    func promoteToRecording(spooler: ChunkSpooler) {
        queue.async { [weak self] in
            guard let self else { return }
            self.stateLock.lock()
            self.spooler = spooler
            self.stateLock.unlock()
            let preroll = self.ring.drainAll()
            if !preroll.isEmpty {
                do {
                    try spooler.append(preroll)
                } catch {
                    self.reportSpoolFailure(error)
                }
            }
            self.mode = .recording
            HelperLog.shared.info("recording (pre-roll drained: \(preroll.count) bytes)", category: "audio")
        }
    }

    /// FR-CALL-CAP-7: stop feeding audio; do not pad silence.
    func pause() {
        guard mode == .recording else { return }
        mode = .paused
        HelperLog.shared.info("paused", category: "audio")
    }

    func resume() {
        guard mode == .paused else { return }
        mode = .recording
        HelperLog.shared.info("resumed", category: "audio")
    }

    /// Stop capture, flush remaining audio into the spooler, return the
    /// silence report. The caller marks the manifest ended + kicks the uploader.
    func stopAndFlush() -> SilenceMeter.Report {
        let currentSpooler: ChunkSpooler? = {
            stateLock.lock(); defer { stateLock.unlock() }
            return spooler
        }()

        queue.sync {
            // Final pump + interleaver drain so the tail isn't lost.
            let tail = interleaver.flushRemaining()
            if !tail.isEmpty, mode == .recording || mode == .paused {
                silenceMeter.feedInterleaved(tail)
                if mode == .recording, let s = currentSpooler {
                    try? s.append(tail)
                }
            }
        }
        teardown()
        if let s = currentSpooler {
            do {
                try s.flush()
            } catch {
                reportSpoolFailure(error)
            }
        }
        stateLock.lock(); spooler = nil; stateLock.unlock()
        HelperLog.shared.info("engine stopped + flushed", category: "audio")
        return silenceMeter.report()
    }

    /// Declined / timed-out prompt: tear down and drop the ring buffer.
    /// Zero bytes persisted (FR-CALL-TRG-7, NFR-CALL-PRIV-2).
    func abortAndClear() {
        teardown()
        ring.clear()
        interleaver.reset()
        stateLock.lock(); spooler = nil; stateLock.unlock()
        HelperLog.shared.info("engine aborted; pre-roll cleared (0 bytes persisted)", category: "audio")
    }

    private func teardown() {
        mode = .stopped
        pumpTimer?.cancel()
        pumpTimer = nil

        if let observer = configChangeObserver {
            NotificationCenter.default.removeObserver(observer)
            configChangeObserver = nil
        }

        if let engine = avEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            avEngine = nil
        }

        if let stream = scStream {
            scStream = nil
            stream.stopCapture { _ in }
        }
        streamOutputBox = nil
        micConverter = nil
        sysConverter = nil
    }

    // MARK: - Microphone path (AVAudioEngine → 16 kHz mono Int16 → L channel)

    private func startMicEngine() throws {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let inputFormat = input.inputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw NSError(domain: "AGBCapture", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No usable microphone input device"
            ])
        }

        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            self?.queue.async {
                self?.handleMicBuffer(buffer)
            }
        }

        engine.prepare()
        try engine.start()
        avEngine = engine

        // Default-input-device switches change the input format mid-run;
        // restart the tap with the new format (FR-CALL-CAP-5, mic side).
        configChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: nil
        ) { [weak self] _ in
            self?.queue.async { self?.restartMicEngine() }
        }
    }

    private func restartMicEngine() {
        guard mode != .stopped else { return }
        HelperLog.shared.warn("audio engine configuration change — restarting mic tap", category: "audio")
        if let engine = avEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            avEngine = nil
        }
        micConverter = nil
        micConverterInputFormat = nil
        do {
            try startMicEngine()
        } catch {
            onError?("Microphone capture lost mid-call: \(error.localizedDescription)")
        }
    }

    private func handleMicBuffer(_ buffer: AVAudioPCMBuffer) {
        guard mode != .stopped else { return }
        if let mono = convert(buffer: buffer,
                              converter: &micConverter,
                              cachedInputFormat: &micConverterInputFormat) {
            interleaver.appendMic(mono)
        }
    }

    // MARK: - System audio path (SCStream → 16 kHz mono Int16 → R channel)

    /// Bridges SCStreamOutput (which retains its outputs) without a cycle.
    private final class StreamOutputBox: NSObject, SCStreamOutput {
        weak var engine: AudioEngine?
        init(engine: AudioEngine) { self.engine = engine }

        func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
            guard type == .audio else { return }
            engine?.handleSystemSampleBuffer(sampleBuffer)
        }
    }

    private func startSystemStream() async throws {
        // Requires Screen Recording permission (PermissionsManager preflights).
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            throw NSError(domain: "AGBCapture", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "No display available for system-audio capture"
            ])
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48_000
        configuration.channelCount = 2
        // Audio-only: shrink the (undelivered) video leg to the minimum.
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        let box = StreamOutputBox(engine: self)
        try stream.addStreamOutput(box, type: .audio, sampleHandlerQueue: queue)
        try await stream.startCapture()

        scStream = stream
        streamOutputBox = box
        scRestartAttempts = 0
    }

    fileprivate func handleSystemSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard mode != .stopped, sampleBuffer.isValid else { return }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return
        }
        var asbd = asbdPointer.pointee
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0,
              let format = AVAudioFormat(streamDescription: &asbd),
              let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else {
            return
        }
        pcmBuffer.frameLength = AVAudioFrameCount(frameCount)
        let status = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer, at: 0, frameCount: Int32(frameCount),
            into: pcmBuffer.mutableAudioBufferList
        )
        guard status == noErr else { return }

        if let mono = convert(buffer: pcmBuffer,
                              converter: &sysConverter,
                              cachedInputFormat: &sysConverterInputFormat) {
            interleaver.appendSystem(mono)
        }
    }

    private func restartSystemStream() {
        guard mode != .stopped else { return }
        scRestartAttempts += 1
        guard scRestartAttempts <= 5 else {
            onError?("System-audio capture failed repeatedly mid-call. Audio from participants may be missing. Check Screen Recording permission.")
            return
        }
        let attempt = scRestartAttempts
        HelperLog.shared.warn("SCStream stopped — restart attempt \(attempt)", category: "audio")
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.startSystemStream()
                HelperLog.shared.info("SCStream restarted (attempt \(attempt)) — session continues", category: "audio")
            } catch {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                self.restartSystemStream()
            }
        }
    }

    // MARK: - Conversion (any input format → 16 kHz mono Int16 Data)

    private func convert(buffer: AVAudioPCMBuffer,
                         converter: inout AVAudioConverter?,
                         cachedInputFormat: inout AVAudioFormat?) -> Data? {
        guard let target = Self.targetFormat else { return nil }
        let inputFormat = buffer.format

        if converter == nil || cachedInputFormat != inputFormat {
            converter = AVAudioConverter(from: inputFormat, to: target)
            cachedInputFormat = inputFormat
        }
        guard let activeConverter = converter else { return nil }

        let ratio = target.sampleRate / inputFormat.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let outBuffer = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else {
            return nil
        }

        var consumed = false
        var conversionError: NSError?
        let status = activeConverter.convert(to: outBuffer, error: &conversionError) { _, outStatus in
            if consumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            consumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, conversionError == nil, outBuffer.frameLength > 0,
              let channelData = outBuffer.int16ChannelData else {
            return nil
        }
        return Data(bytes: channelData[0], count: Int(outBuffer.frameLength) * 2)
    }

    // MARK: - Sample pump (100 ms cadence)

    private func startPump() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            self?.pumpOnce()
        }
        timer.resume()
        pumpTimer = timer
    }

    private func pumpOnce() {
        let bytes = interleaver.pump(now: CACurrentMediaTime())
        guard !bytes.isEmpty else { return }

        switch mode {
        case .preroll:
            silenceMeter.feedInterleaved(bytes)
            ring.append(bytes)
        case .recording:
            silenceMeter.feedInterleaved(bytes)
            let currentSpooler: ChunkSpooler? = {
                stateLock.lock(); defer { stateLock.unlock() }
                return spooler
            }()
            guard let s = currentSpooler else { return }
            do {
                try s.append(bytes)
            } catch {
                reportSpoolFailure(error)
            }
        case .paused:
            break // discarded — paused intervals are absent, not silent
        case .stopped:
            break
        }
    }

    private func reportSpoolFailure(_ error: Error) {
        // FR-CALL-OPS-3: surface within 10 s; only alert once per session.
        guard !spoolFailureReported else { return }
        spoolFailureReported = true
        HelperLog.shared.error("spool write failed: \(error.localizedDescription)", category: "audio")
        onError?("Recording is failing to write to disk: \(error.localizedDescription)")
    }
}

// MARK: - SCStreamDelegate

extension AudioEngine: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        HelperLog.shared.warn("SCStream didStopWithError: \(error.localizedDescription)", category: "audio")
        queue.async { [weak self] in
            guard let self, self.scStream === stream || self.scStream == nil else { return }
            self.scStream = nil
            self.restartSystemStream()
        }
    }
}
