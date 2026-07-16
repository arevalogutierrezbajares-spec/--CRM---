import AVFoundation
import CoreAudio
import Foundation
import CaptureCore

/// Microphone capture via a **Core Audio HAL IOProc** on the default input
/// device — bypasses `AVAudioEngine` / voice-processing paths that go near-silent
/// when the default *output* is speakers (AEC/AGC during VoIP calls).
///
/// Emits 16 kHz mono Int16 little-endian PCM, same contract as the system-audio
/// path feeds into `StereoInterleaver.appendMic`.
///
/// Why this exists (FR-CALL-CAP-2 + live transcript "You:" lines):
/// With headphones, AVAudioEngine mic RMS is healthy (~0.03). With Mac speakers
/// during WhatsApp/Zoom, the shared mic often lands near-silent (~0.003) so live
/// captions only show the far side. HAL capture of the physical input keeps the
/// founder's speech on channel L for both live transcript and post-call file.
final class MicHALCapture {

    /// 16 kHz mono Int16 LE — byte-compatible with `StereoInterleaver.appendMic`.
    var onMicPCM: ((Data) -> Void)?
    var onFatalError: ((String) -> Void)?

    private(set) var isRunning = false

    private var deviceID = AudioObjectID(kAudioObjectUnknown)
    private var ioProcID: AudioDeviceIOProcID?
    private var converter: AVAudioConverter?
    private var inputFormat: AVAudioFormat?

    private let lock = NSLock()
    private let listenerQueue = DispatchQueue(label: "com.agb.capture-helper.mic-hal.listener")
    private var defaultInputListenerInstalled = false
    private var lastRestartAt: CFAbsoluteTime = 0

    private static let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(AudioConstants.sampleRate),
        channels: 1,
        interleaved: true
    )

    // MARK: - Lifecycle

    func start() throws {
        lock.lock(); defer { lock.unlock() }
        guard !isRunning else { return }
        try startHardwareLocked()
        installDefaultInputListener()
        isRunning = true
        let name = deviceName(deviceID) ?? "input \(deviceID)"
        HelperLog.shared.info(
            "mic-hal started (device \(deviceID) \"\(name)\", \(Int(inputFormat?.sampleRate ?? 0)) Hz × \(inputFormat?.channelCount ?? 0) ch)",
            category: "audio"
        )
    }

    func stop() {
        lock.lock(); defer { lock.unlock() }
        teardownLocked(removeInputListener: true)
        HelperLog.shared.info("mic-hal stopped", category: "audio")
    }

    private func startHardwareLocked() throws {
        let device = try Self.defaultInputDeviceID()
        let format = try Self.readStreamFormat(of: device, scope: kAudioObjectPropertyScopeInput)
        self.deviceID = device
        self.inputFormat = format
        self.converter = nil
        try installIOProcAndStart(on: device)
    }

    private func teardownLocked(removeInputListener: Bool) {
        isRunning = false
        if removeInputListener {
            defaultInputListenerInstalled = false
        }

        if deviceID != AudioObjectID(kAudioObjectUnknown) {
            AudioDeviceStop(deviceID, ioProcID)
            if let proc = ioProcID {
                AudioDeviceDestroyIOProcID(deviceID, proc)
            }
            ioProcID = nil
            deviceID = AudioObjectID(kAudioObjectUnknown)
        } else {
            ioProcID = nil
        }
        converter = nil
        inputFormat = nil
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
            throw Self.micError("AudioDeviceCreateIOProcIDWithBlock failed", createStatus)
        }
        self.ioProcID = proc

        let startStatus = AudioDeviceStart(device, proc)
        guard startStatus == noErr else {
            AudioDeviceDestroyIOProcID(device, proc)
            self.ioProcID = nil
            throw Self.micError("AudioDeviceStart (mic) failed", startStatus)
        }
    }

    private func handleIO(_ bufferList: UnsafePointer<AudioBufferList>) {
        guard isRunning, let sourceFormat = inputFormat, let target = Self.targetFormat else { return }
        let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: bufferList))
        guard abl.count > 0 else { return }

        let mono: [Float]
        // Prefer AVAudioFormat.commonFormat; fall back to ASBD float flag.
        let asbd = sourceFormat.streamDescription.pointee
        let isFloat = sourceFormat.commonFormat == .pcmFormatFloat32
            || (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0

        if isFloat {
            mono = Self.monoFloat(from: abl, channelCount: Int(sourceFormat.channelCount), interleaved: sourceFormat.isInterleaved)
        } else {
            // Int16 hardware — convert to float for shared resampler path.
            mono = Self.monoInt16AsFloat(from: abl, channelCount: Int(sourceFormat.channelCount), interleaved: sourceFormat.isInterleaved)
        }
        guard !mono.isEmpty else { return }

        if let pcm = convertMonoToTarget(mono, sourceSampleRate: sourceFormat.sampleRate, target: target) {
            onMicPCM?(pcm)
        }
    }

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
            if let base = src.baseAddress {
                inChannel[0].update(from: base, count: mono.count)
            }
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

    // MARK: - Default input device changes

    private func installDefaultInputListener() {
        guard !defaultInputListenerInstalled else { return }
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectAddPropertyListenerBlock(
            AudioObjectID(kAudioObjectSystemObject), &address, listenerQueue
        ) { [weak self] _, _ in
            self?.fullRestart(reason: "default input device changed")
        }
        defaultInputListenerInstalled = (status == noErr)
    }

    private func fullRestart(reason: String) {
        lock.lock(); defer { lock.unlock() }
        guard isRunning else { return }
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastRestartAt > 0.75 else { return }
        lastRestartAt = now

        HelperLog.shared.warn("mic-hal full restart (\(reason))", category: "audio")
        teardownLocked(removeInputListener: false)
        do {
            try startHardwareLocked()
            isRunning = true
        } catch {
            HelperLog.shared.error("mic-hal restart failed: \(error.localizedDescription)", category: "audio")
            onFatalError?("Microphone HAL capture lost: \(error.localizedDescription)")
        }
    }

    // MARK: - HAL helpers

    private static func defaultInputDeviceID() throws -> AudioObjectID {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device
        )
        guard status == noErr, device != AudioObjectID(kAudioObjectUnknown) else {
            throw micError("No default input device", status)
        }
        return device
    }

    private static func readStreamFormat(of device: AudioObjectID, scope: AudioObjectPropertyScope) throws -> AVAudioFormat {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamFormat,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        var asbd = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &asbd)
        guard status == noErr, asbd.mSampleRate > 0,
              let format = AVAudioFormat(streamDescription: &asbd) else {
            throw micError("Reading mic stream format failed", status)
        }
        return format
    }

    private func deviceName(_ device: AudioObjectID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var cfName: CFString?
        var size = UInt32(MemoryLayout<CFString?>.size)
        let status = withUnsafeMutablePointer(to: &cfName) { ptr in
            AudioObjectGetPropertyData(device, &address, 0, nil, &size, ptr)
        }
        guard status == noErr, let cfName else { return nil }
        return cfName as String
    }

    private static func monoFloat(
        from abl: UnsafeMutableAudioBufferListPointer,
        channelCount: Int,
        interleaved: Bool
    ) -> [Float] {
        let bytesPerSample = MemoryLayout<Float>.size
        if interleaved {
            guard let mData = abl[0].mData else { return [] }
            let totalSamples = Int(abl[0].mDataByteSize) / bytesPerSample
            guard totalSamples > 0 else { return [] }
            let samples = UnsafeBufferPointer(start: mData.assumingMemoryBound(to: Float.self), count: totalSamples)
            return PCMDownmix.monoAverageInterleaved(samples: Array(samples), channels: max(channelCount, 1))
        }
        let frameCount = Int(abl[0].mDataByteSize) / bytesPerSample
        guard frameCount > 0 else { return [] }
        var channels: [[Float]] = []
        for i in 0..<abl.count {
            guard let mData = abl[i].mData else { continue }
            let count = Int(abl[i].mDataByteSize) / bytesPerSample
            guard count >= frameCount else { continue }
            let buf = UnsafeBufferPointer(start: mData.assumingMemoryBound(to: Float.self), count: count)
            channels.append(Array(buf[0..<frameCount]))
        }
        return PCMDownmix.monoAverage(channels: channels, frameCount: frameCount)
    }

    private static func monoInt16AsFloat(
        from abl: UnsafeMutableAudioBufferListPointer,
        channelCount: Int,
        interleaved: Bool
    ) -> [Float] {
        let bytesPerSample = MemoryLayout<Int16>.size
        if interleaved {
            guard let mData = abl[0].mData else { return [] }
            let totalSamples = Int(abl[0].mDataByteSize) / bytesPerSample
            guard totalSamples > 0 else { return [] }
            let samples = UnsafeBufferPointer(start: mData.assumingMemoryBound(to: Int16.self), count: totalSamples)
            let floats = samples.map { Float($0) / 32768.0 }
            return PCMDownmix.monoAverageInterleaved(samples: floats, channels: max(channelCount, 1))
        }
        let frameCount = Int(abl[0].mDataByteSize) / bytesPerSample
        guard frameCount > 0 else { return [] }
        var channels: [[Float]] = []
        for i in 0..<abl.count {
            guard let mData = abl[i].mData else { continue }
            let count = Int(abl[i].mDataByteSize) / bytesPerSample
            guard count >= frameCount else { continue }
            let buf = UnsafeBufferPointer(start: mData.assumingMemoryBound(to: Int16.self), count: count)
            channels.append(buf[0..<frameCount].map { Float($0) / 32768.0 })
        }
        return PCMDownmix.monoAverage(channels: channels, frameCount: frameCount)
    }

    private static func micError(_ message: String, _ status: OSStatus) -> NSError {
        NSError(domain: "AGBCapture.MicHAL", code: Int(status), userInfo: [
            NSLocalizedDescriptionKey: "\(message) (OSStatus \(status))"
        ])
    }
}
