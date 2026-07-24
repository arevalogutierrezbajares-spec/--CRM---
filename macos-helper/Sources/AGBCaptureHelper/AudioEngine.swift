import AVFoundation
import CoreMedia
import Foundation
import QuartzCore
import ScreenCaptureKit
import CaptureCore

/// The capture core: microphone (AVAudioEngine) + system audio
/// (process tap primary / ScreenCaptureKit fallback), both resampled to 16 kHz
/// mono Int16 and interleaved into stereo frames (L = mic, R = system) on a
/// wall-clock sample pump (FR-CALL-CAP-1/2/3).
///
/// **FR-CALL-CAP-2 — no headphones required.** System audio is captured from
/// the call app / output mix *before* the physical device, so Built-in Speakers,
/// wired headphones, and AirPods all produce a far-side (R) channel. Route
/// switches mid-call restart the process tap / SCStream in place.
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
    /// Fired (audio queue) when a recording auto-ends from continuous silence or
    /// the hard duration cap (FEATURE 1). The delegate hops to main + finalizes.
    var onAutoEnd: ((CallEndMonitor.Reason) -> Void)?
    /// Fired (audio queue) for every interleaved-stereo PCM16 batch produced
    /// while recording — a *copy* for the best-effort live-transcript stream
    /// (FEATURE 2). Must never block: the closure is expected to enqueue and
    /// return immediately. The spool/upload path is unaffected if it's nil or slow.
    var onRecordingPCM: ((Data) -> Void)?

    let silenceMeter = SilenceMeter()

    /// Auto-end watchdog (silence timeout + max-duration). Installed by the
    /// delegate at affirm time with the configured windows; nil disables it.
    private var callEndMonitor: CallEndMonitor?

    /// Install the auto-end watchdog and start its clock. Call right after
    /// promoting to recording. Pass nil to disable (e.g. in tests).
    func installCallEndMonitor(_ monitor: CallEndMonitor?) {
        stateLock.lock()
        callEndMonitor = monitor
        stateLock.unlock()
        monitor?.start()
    }

    private let ring = RingBuffer(capacity: AudioConstants.preRollBytes)
    private let interleaver = StereoInterleaver()
    /// Input gain for acoustically-mixed kinds (speakerphone). Unity elsewhere.
    private let micGain = MicGain()
    private let queue = DispatchQueue(label: "com.agb.capture-helper.audio", qos: .userInitiated)

    private var avEngine: AVAudioEngine?
    /// Primary mic path: Core Audio HAL (survives speakers-on VoIP AEC).
    private var micHAL: MicHALCapture?
    /// True when mic is coming from MicHALCapture rather than AVAudioEngine.
    private var micHALActive = false
    private var scStream: SCStream?
    private var streamOutputBox: StreamOutputBox?
    /// Core Audio process tap — the PRIMARY system-audio source (reaches
    /// FaceTime / communication-path audio that SCStream cannot). Stored as
    /// `Any?` so the type's macOS 14.4 availability doesn't leak into the
    /// stored-property declaration; cast back at use sites under `#available`.
    private var processTapBox: AnyObject?
    /// True once the process tap is the active system-audio source. When false,
    /// the SCStream fallback is active.
    private var processTapActive = false
    private var micConverter: AVAudioConverter?
    private var micConverterInputFormat: AVAudioFormat?
    private var sysConverter: AVAudioConverter?
    private var sysConverterInputFormat: AVAudioFormat?
    private var pumpTimer: DispatchSourceTimer?
    private var configChangeObserver: NSObjectProtocol?
    private var defaultOutputObserver: NSObjectProtocol?
    private var scRestartAttempts = 0
    private var spoolFailureReported = false
    /// Defect-A watchdog: fires a mic-capture restart when the mic (L) channel
    /// delivers only digital zeros for a sustained window while system (R) audio
    /// is live. Touched only on `queue` (the pump + the restart it triggers).
    private var micDeadDetector = MicDeadDetector()
    /// One-time operator notice per session when the mic-dead watchdog restarts.
    private var micRestartNoticeSent = false
    /// Periodic levels log so speakers-only tests can confirm system(R) is live.
    private var levelsTickCount = 0
    private let stateLock = NSLock()
    private var _mode: Mode = .stopped
    private var _captureKind: CaptureKind = .call
    private var spooler: ChunkSpooler?

    private(set) var mode: Mode {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _mode }
        set { stateLock.lock(); _mode = newValue; stateLock.unlock() }
    }

    /// Call (mic+system) vs mic-only kinds (meeting, speakerphone).
    ///
    /// Lock-protected like `mode`: written on the main actor in `startPreroll`,
    /// but read from the Core Audio IOProc thread in `appendMicChannel` to
    /// decide whether input gain applies. Every other cross-thread field in this
    /// class goes through `stateLock`; this one must not be the exception.
    private(set) var captureKind: CaptureKind {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _captureKind }
        set { stateLock.lock(); _captureKind = newValue; stateLock.unlock() }
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

    /// Start capture paths in pre-roll mode (detection fired; prompt up).
    /// Audio flows only into the in-memory ring buffer (NFR-CALL-PRIV-2).
    /// - Parameter kind: `.call` = mic + system audio; `.meeting` = mic only
    ///   (in-person room — R channel stays silent, stereo wire format unchanged).
    func startPreroll(kind: CaptureKind = .call) async throws {
        guard mode == .stopped else { return }
        captureKind = kind
        silenceMeter.reset()
        micGain.reset()
        interleaver.reset()
        ring.clear()
        spoolFailureReported = false
        micDeadDetector.reset()
        micRestartNoticeSent = false
        mode = .preroll

        try startMicEngine()
        if kind.capturesSystemAudio {
            try await startSystemAudioSource()
            installDefaultOutputObserver()
            let route = OutputRoute.currentDefaultOutput()
            HelperLog.shared.info(
                "engine started (preroll, call) — default output: \(route.summary) (headphones not required)",
                category: "audio"
            )
        } else {
            // Mic-only kinds: no system-audio path. Stereo interleaver pads R
            // with silence. Speakerphone additionally runs input gain, since the
            // far side arrives acoustically at ~−46 dBFS.
            HelperLog.shared.info(
                "engine started (preroll, \(kind.rawValue)) — mic-only capture; system audio not tapped"
                    + (kind.isAcousticMixed ? "; input gain enabled" : ""),
                category: "audio"
            )
        }
        startPump()
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
        if let observer = defaultOutputObserver {
            NotificationCenter.default.removeObserver(observer)
            defaultOutputObserver = nil
        }

        micHAL?.stop()
        micHAL = nil
        micHALActive = false

        if let engine = avEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            avEngine = nil
        }

        if #available(macOS 14.4, *), let tap = processTapBox as? ProcessAudioTap {
            tap.stop()
        }
        processTapBox = nil
        processTapActive = false

        if let stream = scStream {
            scStream = nil
            stream.stopCapture { _ in }
        }
        streamOutputBox = nil
        micConverter = nil
        sysConverter = nil
    }

    // MARK: - Microphone path (HAL preferred → AVAudioEngine fallback → L channel)

    /// Start mic capture. Prefer Core Audio HAL so founder speech stays audible
    /// when speakers play far-side audio (VoIP AEC often nulls AVAudioEngine).
    private func startMicEngine() throws {
        // PRIMARY: HAL input — works with speakers for live "You:" captions.
        let hal = MicHALCapture()
        hal.onMicPCM = { [weak self] pcm in
            guard let self, self.mode != .stopped else { return }
            self.appendMicChannel(pcm)
        }
        hal.onFatalError = { [weak self] message in
            HelperLog.shared.warn("mic-hal fatal: \(message) — falling back to AVAudioEngine", category: "audio")
            self?.queue.async {
                guard let self, self.mode != .stopped else { return }
                self.micHAL?.stop()
                self.micHAL = nil
                self.micHALActive = false
                do {
                    try self.startMicAVAudioEngine()
                } catch {
                    self.onError?("Microphone capture lost: \(error.localizedDescription)")
                }
            }
        }
        do {
            try hal.start()
            micHAL = hal
            micHALActive = true
            HelperLog.shared.info(
                "[audio] mic via Core Audio HAL (speakers-safe; live transcript will show You:)",
                category: "audio"
            )
            return
        } catch {
            HelperLog.shared.warn(
                "mic-hal unavailable (\(error.localizedDescription)) — falling back to AVAudioEngine",
                category: "audio"
            )
            micHAL = nil
            micHALActive = false
        }

        try startMicAVAudioEngine()
    }

    private func startMicAVAudioEngine() throws {
        let engine = AVAudioEngine()
        let input = engine.inputNode

        // VoIP + speakers often enables voice processing on the shared input;
        // that AEC nulls the founder channel so live transcript only shows the
        // far side. Force it off when the API is available.
        if #available(macOS 14.0, *) {
            if input.isVoiceProcessingEnabled {
                do {
                    try input.setVoiceProcessingEnabled(false)
                    HelperLog.shared.info("disabled voice processing on mic input (AEC off)", category: "audio")
                } catch {
                    HelperLog.shared.warn("could not disable voice processing: \(error.localizedDescription)", category: "audio")
                }
            }
        }

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
        micHALActive = false
        HelperLog.shared.info(
            "[audio] mic via AVAudioEngine (\(Int(inputFormat.sampleRate)) Hz × \(inputFormat.channelCount) ch)",
            category: "audio"
        )

        // Only reinstall when the *format* actually changes — thrashing on every
        // speakers/headphone route blip was restarting into a near-silent mic.
        configChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: nil
        ) { [weak self] _ in
            self?.queue.async { self?.restartMicAVAudioIfFormatChanged() }
        }
    }

    private func restartMicAVAudioIfFormatChanged() {
        guard mode != .stopped, !micHALActive else { return }
        guard let engine = avEngine else { return }
        let newFormat = engine.inputNode.inputFormat(forBus: 0)
        // No usable format yet mid-switch — wait for a later notification.
        guard newFormat.sampleRate > 0, newFormat.channelCount > 0 else { return }
        if let cached = micConverterInputFormat,
           cached.sampleRate == newFormat.sampleRate,
           cached.channelCount == newFormat.channelCount {
            return // same format; keep the running tap
        }
        HelperLog.shared.warn(
            "mic format changed → \(Int(newFormat.sampleRate)) Hz × \(newFormat.channelCount) ch — reinstalling AVAudio tap",
            category: "audio"
        )
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        avEngine = nil
        if let observer = configChangeObserver {
            NotificationCenter.default.removeObserver(observer)
            configChangeObserver = nil
        }
        micConverter = nil
        micConverterInputFormat = nil
        do {
            try startMicAVAudioEngine()
        } catch {
            onError?("Microphone capture lost mid-call: \(error.localizedDescription)")
        }
    }

    /// DEFECT A recovery: the mic (L) channel has delivered only digital zeros
    /// for a sustained window while system (R) audio is live — the mic tap died
    /// silently (suspected mid-call route change). Tear the mic path down and
    /// re-create it once via `startMicEngine()` (HAL-preferred → AVAudioEngine
    /// fallback), then surface a one-time notice.
    ///
    /// Thread discipline: this runs on `queue` (invoked from `pumpOnce`, and the
    /// pump timer is a serial source on `queue`). That's the *same* queue the
    /// existing mic restarts already marshal onto — `restartMicAVAudioIfFormatChanged`
    /// and the HAL `onFatalError` handler both `queue.async` before touching the
    /// mic path — so tearing down / rebuilding here is on the sanctioned thread.
    private func restartMicCapture() {
        guard mode != .stopped else { return }

        HelperLog.shared.error(
            "mic-dead watchdog: mic (L) delivered only zeros for ~\(Int(micDeadDetector.deadWindow))s while system (R) live — restarting mic capture (attempt \(micDeadDetector.restartsUsed)/\(micDeadDetector.maxRestarts))",
            category: "audio"
        )

        // Tear down whichever mic source is currently active.
        micHAL?.stop()
        micHAL = nil
        micHALActive = false
        if let engine = avEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            avEngine = nil
        }
        if let observer = configChangeObserver {
            NotificationCenter.default.removeObserver(observer)
            configChangeObserver = nil
        }
        micConverter = nil
        micConverterInputFormat = nil

        do {
            try startMicEngine()
            HelperLog.shared.info("mic-dead watchdog: mic capture path restarted", category: "audio")
        } catch {
            onError?("Microphone capture lost: \(error.localizedDescription)")
            return
        }

        // One-time-per-session operator notice (subsequent capped restarts stay
        // quiet in the UI but are still logged above).
        if !micRestartNoticeSent {
            micRestartNoticeSent = true
            onError?("Microphone went silent — capture was automatically restarted.")
        }
    }

    private func handleMicBuffer(_ buffer: AVAudioPCMBuffer) {
        guard mode != .stopped else { return }
        if let mono = convert(buffer: buffer,
                              converter: &micConverter,
                              cachedInputFormat: &micConverterInputFormat) {
            appendMicChannel(mono)
        }
    }

    /// Single entry point for the mic (L) channel. Applies input gain for
    /// acoustically-mixed kinds (speakerphone), where the far side reaches the
    /// mic through air at roughly −46 dBFS. Both mic paths — Core Audio HAL and
    /// the AVAudioEngine fallback — route through here so gain can never apply
    /// to one and not the other.
    private func appendMicChannel(_ monoPCM16: Data) {
        let pcm = captureKind.isAcousticMixed ? micGain.apply(monoPCM16) : monoPCM16
        interleaver.appendMic(pcm)
    }

    // MARK: - System audio path (→ 16 kHz mono Int16 → R channel)

    /// Start the R-channel (system-audio) source. PRIMARY: a Core Audio process
    /// tap (macOS 14.4+) that reaches FaceTime / communication-path audio.
    /// FALLBACK: ScreenCaptureKit (covers media but not FaceTime) when the tap is
    /// unavailable (older OS) or fails to start (permission denied / HAL error).
    /// Either way the produced 16 kHz-mono-Int16 bytes feed the SAME sink
    /// (`interleaver.appendSystem`) and everything downstream is unchanged.
    private func startSystemAudioSource() async throws {
        if #available(macOS 14.4, *) {
            let tap = ProcessAudioTap()
            tap.onSystemPCM = { [weak self] pcm in
                guard let self, self.mode != .stopped else { return }
                self.interleaver.appendSystem(pcm)
            }
            tap.onFatalError = { [weak self] message in
                // A failure *after* a successful start (rare): surface but keep
                // the session alive — the mic channel still records.
                self?.onError?("System-audio process tap error: \(message)")
            }
            do {
                try tap.start()
                processTapBox = tap
                processTapActive = true
                HelperLog.shared.info("[audio] system-audio via process-tap (FaceTime-capable)", category: "audio")
                return
            } catch {
                HelperLog.shared.warn(
                    "process-tap unavailable (\(error.localizedDescription)) — falling back to ScreenCaptureKit",
                    category: "audio"
                )
                if PermissionsManager.processTapLikelyUnauthorized(error) {
                    HelperLog.shared.warn(PermissionsManager.audioCaptureInstructions, category: "audio")
                }
            }
        }

        // Fallback: ScreenCaptureKit (non-FaceTime system audio). Still
        // device-independent — captures the system mix for speakers or headphones.
        processTapActive = false
        try await startSystemStream()
        let route = OutputRoute.currentDefaultOutput()
        HelperLog.shared.info(
            "[audio] system-audio via ScreenCaptureKit (FaceTime NOT captured) — output: \(route.summary)",
            category: "audio"
        )
    }

    // MARK: - System audio fallback (SCStream → 16 kHz mono Int16 → R channel)

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

    // MARK: - Output route (speakers ↔ headphones)

    /// When the SCStream fallback is active, restart it on default-output
    /// changes. Process-tap path handles this internally (full restart).
    private func installDefaultOutputObserver() {
        // Core Audio property → NotificationCenter is not built-in; we poll via
        // a distributed name used by macOS audio when routes change, and also
        // re-log from the process-tap. For SCStream-only sessions, listen to
        // the same system default-output property via a short Core Audio bridge.
        // (Process tap installs its own listener; this covers SCStream fallback.)
        guard defaultOutputObserver == nil else { return }
        // Use a one-shot style: observe AVAudioEngine config is mic-only.
        // SCStream restart is also driven from SCStreamDelegate didStopWithError.
        // Additional: log route on main run loop when app becomes active after sleep.
        defaultOutputObserver = NotificationCenter.default.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.queue.async {
                guard let self, self.mode != .stopped, !self.processTapActive else { return }
                HelperLog.shared.info(
                    "system wake — restarting SCStream for output route (speakers/headphones)",
                    category: "audio"
                )
                self.restartSystemStream()
            }
        }
    }

    // MARK: - Sample pump (100 ms cadence)

    private func startPump() {
        levelsTickCount = 0
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100))
        timer.setEventHandler { [weak self] in
            self?.pumpOnce()
        }
        timer.resume()
        pumpTimer = timer
    }

    private func pumpOnce() {
        let now = CACurrentMediaTime()
        let bytes = interleaver.pump(now: now)
        guard !bytes.isEmpty else { return }

        switch mode {
        case .preroll:
            silenceMeter.feedInterleaved(bytes)
            ring.append(bytes)
            // Early proof that both channels live before Record (incl. speakers-only).
            levelsTickCount += 1
            if levelsTickCount == 50 { // ~5 s into pre-roll
                let r = silenceMeter.report()
                HelperLog.shared.info(
                    "levels (preroll ~5s): \(r.summary) | output: \(OutputRoute.currentDefaultOutput().summary)",
                    category: "audio"
                )
            }
        case .recording:
            silenceMeter.feedInterleaved(bytes)
            levelsTickCount += 1
            // Every ~30 s while recording — verify far-side on speakers without headphones.
            if levelsTickCount > 0, levelsTickCount % 300 == 0 {
                let r = silenceMeter.report()
                HelperLog.shared.info(
                    "levels (recording): \(r.summary) | output: \(OutputRoute.currentDefaultOutput().summary)",
                    category: "audio"
                )
            }

            // DEFECT A: mic-dead watchdog. On call kinds (mic L + system R), a
            // silently-dead mic tap shows up as all-zero L samples while R is
            // live. Feed the pure detector; on `.restart` it has decided the mic
            // has been digitally dead ~8 s and we rebuild the mic path (capped so
            // a genuinely dead device can't loop). Mic-only kinds have no R
            // channel to cross-check, so the watchdog is skipped there.
            if captureKind.capturesSystemAudio {
                let s = MicDeadDetector.scan(interleaved: bytes)
                if micDeadDetector.feed(micAllZero: s.micAllZero,
                                        systemActive: s.systemActive,
                                        at: now) == .restart {
                    restartMicCapture()
                }
            }

            // FEATURE 2: hand a copy to the live-transcript stream. Best-effort,
            // strictly non-blocking, decoupled from the spool path below.
            onRecordingPCM?(bytes)

            // FEATURE 1: auto-end watchdog. Feed the same bytes; if a threshold
            // is crossed, signal the delegate to finalize (only fires once).
            let monitor: CallEndMonitor? = {
                stateLock.lock(); defer { stateLock.unlock() }
                return callEndMonitor
            }()
            if let monitor, let reason = monitor.feed(bytes) {
                HelperLog.shared.info("auto-end watchdog fired: \(reason)", category: "audio")
                onAutoEnd?(reason)
            }

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
