import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation
import CaptureCore

/// System / call-audio capture via a **Core Audio process tap** (macOS 14.4+).
///
/// This replaces ScreenCaptureKit as the R-channel (system-audio) source in
/// `AudioEngine`. ScreenCaptureKit taps the normal output *mix*, which EXCLUDES
/// FaceTime and any app that renders through the communication / voice-processing
/// audio path (AUVoiceProcessingIO) — made worse by AirPods/HFP. A process tap
/// reads a process's audio *directly* and reaches that path, so FaceTime call
/// audio is actually captured.
///
/// Pattern (mirrors github.com/insidegui/AudioCap, the proven approach the
/// shipping "Dipper" recorder uses):
///   1. Build a GLOBAL stereo tap of every process EXCEPT our own (so we capture
///      everything the user hears — media AND every call app incl. FaceTime —
///      without feeding our own output back in).
///   2. `AudioHardwareCreateProcessTap` → tap AudioObjectID.
///   3. Wrap the tap in a PRIVATE auto-starting aggregate device.
///   4. Read the aggregate's input stream format, install an IOProc, start it.
///   5. In the IOProc: downmix the native float buffers to mono and convert to
///      16 kHz Int16, then hand the bytes to the same sink the SCStream path fed.
///
/// The tap is kept STEREO (2-channel): there is a known tap attenuation bug that
/// scales with channel count, and 2 ch measures ≈ 0 dB.
@available(macOS 14.4, *)
final class ProcessAudioTap {

    /// Emits 16 kHz mono Int16 little-endian PCM — byte-for-byte what the
    /// SCStream path delivered to `StereoInterleaver.appendSystem`. Called on the
    /// IOProc's real-time thread; the closure must not block (it only appends to
    /// the interleaver's lock-guarded queue).
    var onSystemPCM: ((Data) -> Void)?

    /// Fired on a fatal start/teardown error (e.g. permission denied). The caller
    /// uses this to fall back to the ScreenCaptureKit path.
    var onFatalError: ((String) -> Void)?

    /// True only between a successful `start()` and `stop()`.
    private(set) var isRunning = false

    // Core Audio handles. kAudioObjectUnknown / nil mean "not created".
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var ioProcID: AudioDeviceIOProcID?

    // Format conversion (native tap format → 16 kHz mono Int16).
    private var converter: AVAudioConverter?
    private var tapInputFormat: AVAudioFormat?
    private static let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(AudioConstants.sampleRate),
        channels: 1,
        interleaved: true
    )

    /// Serializes start/stop/restart so a mid-call route change can't race the
    /// IOProc teardown.
    private let lock = NSLock()
    /// Listener on the aggregate's input format so AirPods connect/disconnect
    /// (which changes sample rate / channel count) re-reads the format and
    /// restarts the IOProc, mirroring the SCStream-restart resilience.
    private var formatListenerInstalled = false
    /// Serial queue the format-change listener fires on (off the real-time
    /// IOProc thread; serialized so overlapping route changes can't race).
    private let listenerQueue = DispatchQueue(label: "com.agb.capture-helper.process-tap.listener")

    // MARK: - Lifecycle

    /// Build the tap + aggregate device + IOProc and start capture. Throws on any
    /// HAL failure so the caller can fall back to ScreenCaptureKit.
    func start() throws {
        lock.lock(); defer { lock.unlock() }
        guard !isRunning else { return }

        let tap = try createTap()
        let (aggregate, format) = try createAggregate(forTapUUID: tap.uuid)
        self.tapID = tap.id
        self.aggregateID = aggregate
        self.tapInputFormat = format
        self.converter = nil // rebuilt lazily against `format`

        try installIOProcAndStart(on: aggregate)
        installFormatListener(on: aggregate)

        isRunning = true
        HelperLog.shared.info(
            "process-tap started (aggregate \(aggregate), \(Int(format.sampleRate)) Hz × \(format.channelCount) ch)",
            category: "audio"
        )
    }

    /// Robust, idempotent teardown. Safe to call when nothing was created.
    func stop() {
        lock.lock(); defer { lock.unlock() }
        teardownLocked()
        HelperLog.shared.info("process-tap stopped", category: "audio")
    }

    /// Must be called with `lock` held.
    private func teardownLocked() {
        isRunning = false
        removeFormatListenerLocked()

        if aggregateID != AudioObjectID(kAudioObjectUnknown) {
            AudioDeviceStop(aggregateID, ioProcID)
            if let proc = ioProcID {
                AudioDeviceDestroyIOProcID(aggregateID, proc)
            }
            ioProcID = nil
            AudioHardwareDestroyAggregateDevice(aggregateID)
            aggregateID = AudioObjectID(kAudioObjectUnknown)
        } else if let proc = ioProcID {
            // Aggregate already gone but a proc handle lingered — drop it.
            ioProcID = nil
            _ = proc
        }

        if tapID != AudioObjectID(kAudioObjectUnknown) {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = AudioObjectID(kAudioObjectUnknown)
        }

        converter = nil
        tapInputFormat = nil
    }

    // MARK: - Tap creation

    private struct Tap { let id: AudioObjectID; let uuid: UUID }

    private func createTap() throws -> Tap {
        // GLOBAL stereo tap of all processes EXCEPT ourselves (no feedback).
        let exclude = Self.ourProcessObjectIDs()
        let description = CATapDescription(stereoGlobalTapButExcludeProcesses: exclude)
        description.name = "AGBCaptureHelper System Tap"
        description.uuid = UUID()
        description.isPrivate = true                         // visible only to this process
        description.muteBehavior = CATapMuteBehavior.unmuted // capture without muting playback
        // Keep it 2-channel: the tap-attenuation bug scales with channel count.
        description.isMono = false

        var id = AudioObjectID(kAudioObjectUnknown)
        let status = AudioHardwareCreateProcessTap(description, &id)
        guard status == noErr, id != AudioObjectID(kAudioObjectUnknown) else {
            throw tapError("AudioHardwareCreateProcessTap failed", status)
        }
        return Tap(id: id, uuid: description.uuid)
    }

    /// AudioObjectIDs for our own process, to exclude from the global tap.
    /// Returns [] if translation fails — a global tap that can't exclude us still
    /// works; the helper produces no playback audio, so there is nothing to feed
    /// back even when the exclusion is empty.
    private static func ourProcessObjectIDs() -> [AudioObjectID] {
        var pid = getpid()
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var object = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address,
            UInt32(MemoryLayout<pid_t>.size), &pid, &size, &object
        )
        guard status == noErr, object != AudioObjectID(kAudioObjectUnknown) else {
            return []
        }
        return [object]
    }

    // MARK: - Aggregate device

    private func createAggregate(forTapUUID tapUUID: UUID) throws -> (AudioObjectID, AVAudioFormat) {
        let uid = "com.agb.capture-helper.tap-aggregate.\(UUID().uuidString)"
        let description: [String: Any] = [
            kAudioAggregateDeviceUIDKey as String: uid,
            kAudioAggregateDeviceNameKey as String: "AGBCaptureHelper Tap Aggregate",
            kAudioAggregateDeviceIsPrivateKey as String: true,
            kAudioAggregateDeviceTapAutoStartKey as String: true,
            kAudioAggregateDeviceTapListKey as String: [
                [
                    kAudioSubTapUIDKey as String: tapUUID.uuidString,
                    kAudioSubTapDriftCompensationKey as String: true,
                ]
            ],
        ]

        var aggregate = AudioObjectID(kAudioObjectUnknown)
        let status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregate)
        guard status == noErr, aggregate != AudioObjectID(kAudioObjectUnknown) else {
            throw tapError("AudioHardwareCreateAggregateDevice failed", status)
        }

        do {
            let format = try readInputFormat(of: aggregate)
            return (aggregate, format)
        } catch {
            AudioHardwareDestroyAggregateDevice(aggregate)
            throw error
        }
    }

    /// Read the aggregate's input-scope stream format (the tap's native format).
    private func readInputFormat(of device: AudioObjectID) throws -> AVAudioFormat {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var asbd = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &asbd)
        guard status == noErr, asbd.mSampleRate > 0,
              let format = AVAudioFormat(streamDescription: &asbd) else {
            throw tapError("Reading aggregate input format failed", status)
        }
        return format
    }

    // MARK: - IOProc

    private func installIOProcAndStart(on device: AudioObjectID) throws {
        var proc: AudioDeviceIOProcID?
        let createStatus = AudioDeviceCreateIOProcIDWithBlock(
            &proc, device, nil
        ) { [weak self] _, inInputData, _, _, _ in
            self?.handleIO(inInputData)
        }
        guard createStatus == noErr, let proc else {
            throw tapError("AudioDeviceCreateIOProcIDWithBlock failed", createStatus)
        }
        self.ioProcID = proc

        let startStatus = AudioDeviceStart(device, proc)
        guard startStatus == noErr else {
            AudioDeviceDestroyIOProcID(device, proc)
            self.ioProcID = nil
            throw tapError("AudioDeviceStart failed", startStatus)
        }
    }

    /// IOProc body (real-time thread). Pull every input channel, downmix to mono,
    /// convert to 16 kHz Int16, emit. Never allocates a converter on the hot path
    /// after the first buffer of a given format.
    private func handleIO(_ bufferList: UnsafePointer<AudioBufferList>) {
        guard isRunning, let target = Self.targetFormat else { return }
        guard let sourceFormat = tapInputFormat else { return }

        let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: bufferList))
        guard abl.count > 0 else { return }

        // Frame count from the first non-empty buffer.
        let bytesPerSampleFloat = MemoryLayout<Float>.size
        let channelCount = Int(sourceFormat.channelCount)
        let isInterleaved = sourceFormat.isInterleaved

        let mono: [Float]
        if isInterleaved {
            guard let mData = abl[0].mData else { return }
            let totalSamples = Int(abl[0].mDataByteSize) / bytesPerSampleFloat
            guard totalSamples > 0 else { return }
            let samples = UnsafeBufferPointer(
                start: mData.assumingMemoryBound(to: Float.self), count: totalSamples
            )
            mono = PCMDownmix.monoAverageInterleaved(
                samples: Array(samples), channels: max(channelCount, 1)
            )
        } else {
            // De-interleaved: one buffer per channel.
            let frameCount = Int(abl[0].mDataByteSize) / bytesPerSampleFloat
            guard frameCount > 0 else { return }
            var channels: [[Float]] = []
            channels.reserveCapacity(abl.count)
            for i in 0..<abl.count {
                guard let mData = abl[i].mData else { continue }
                let count = Int(abl[i].mDataByteSize) / bytesPerSampleFloat
                guard count >= frameCount else { continue }
                let buf = UnsafeBufferPointer(
                    start: mData.assumingMemoryBound(to: Float.self), count: count
                )
                channels.append(Array(buf[0..<frameCount]))
            }
            mono = PCMDownmix.monoAverage(channels: channels, frameCount: frameCount)
        }
        guard !mono.isEmpty else { return }

        if let pcm = convertMonoToTarget(mono, sourceSampleRate: sourceFormat.sampleRate, target: target) {
            onSystemPCM?(pcm)
        }
    }

    /// Resample/convert mono Float samples at `sourceSampleRate` to 16 kHz mono
    /// Int16, returning little-endian bytes. Uses an AVAudioConverter, mirroring
    /// the conversion AudioEngine already uses for the mic/SCStream paths.
    private func convertMonoToTarget(_ mono: [Float], sourceSampleRate: Double, target: AVAudioFormat) -> Data? {
        guard let monoSourceFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sourceSampleRate,
            channels: 1,
            interleaved: true
        ) else { return nil }

        if converter == nil || converter?.inputFormat != monoSourceFormat {
            converter = AVAudioConverter(from: monoSourceFormat, to: target)
        }
        guard let activeConverter = converter else { return nil }

        let frameCount = AVAudioFrameCount(mono.count)
        guard let inBuffer = AVAudioPCMBuffer(pcmFormat: monoSourceFormat, frameCapacity: frameCount),
              let inChannel = inBuffer.floatChannelData else { return nil }
        inBuffer.frameLength = frameCount
        mono.withUnsafeBufferPointer { src in
            inChannel[0].update(from: src.baseAddress!, count: mono.count)
        }

        let ratio = target.sampleRate / sourceSampleRate
        let capacity = AVAudioFrameCount(Double(frameCount) * ratio) + 64
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
            return inBuffer
        }
        guard status != .error, conversionError == nil, outBuffer.frameLength > 0,
              let channelData = outBuffer.int16ChannelData else {
            return nil
        }
        return Data(bytes: channelData[0], count: Int(outBuffer.frameLength) * 2)
    }

    // MARK: - Mid-call format / route changes (AirPods connect/disconnect)

    private func installFormatListener(on device: AudioObjectID) {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectAddPropertyListenerBlock(
            device, &address, listenerQueue
        ) { [weak self] _, _ in
            self?.handleFormatChange()
        }
        formatListenerInstalled = (status == noErr)
    }

    private func removeFormatListenerLocked() {
        // Deliberately do NOT call AudioObjectRemovePropertyListenerBlock here:
        // that call can synchronize with `listenerQueue`, and if a format-change
        // callback is in flight waiting on `lock` (held during teardown) the two
        // would deadlock. Destroying the aggregate device in teardownLocked()
        // invalidates the listener anyway, and `handleFormatChange` no-ops once
        // `isRunning` is false (and bails the instant the aggregate is gone). We
        // also cannot match the original block by identity to remove it.
        formatListenerInstalled = false
    }

    /// A route change (e.g. AirPods connect/disconnect) altered the aggregate's
    /// input format. We STOP the IOProc, re-read the format, and START a fresh
    /// IOProc against the new rate/channel layout — all under `lock`. Restarting
    /// (rather than mutating `tapInputFormat`/`converter` live) means the
    /// real-time IOProc thread never reads those while the listener thread writes
    /// them, so there is no data race. This mirrors the SCStream-restart-in-place
    /// resilience the fallback path has today.
    private func handleFormatChange() {
        lock.lock(); defer { lock.unlock() }
        guard isRunning, aggregateID != AudioObjectID(kAudioObjectUnknown) else { return }
        do {
            let newFormat = try readInputFormat(of: aggregateID)
            guard newFormat != tapInputFormat else { return }
            HelperLog.shared.warn(
                "process-tap input format changed → \(Int(newFormat.sampleRate)) Hz × \(newFormat.channelCount) ch — restarting IOProc",
                category: "audio"
            )

            // Stop + destroy the current IOProc before touching shared format
            // state the IOProc reads.
            AudioDeviceStop(aggregateID, ioProcID)
            if let proc = ioProcID {
                AudioDeviceDestroyIOProcID(aggregateID, proc)
                ioProcID = nil
            }

            tapInputFormat = newFormat
            converter = nil

            try installIOProcAndStart(on: aggregateID)
        } catch {
            HelperLog.shared.warn(
                "process-tap format re-read/restart failed after route change: \(error.localizedDescription)",
                category: "audio"
            )
        }
    }

    // MARK: - Errors

    private func tapError(_ message: String, _ status: OSStatus) -> NSError {
        NSError(domain: "AGBCapture.ProcessTap", code: Int(status), userInfo: [
            NSLocalizedDescriptionKey: "\(message) (OSStatus \(status))"
        ])
    }
}
