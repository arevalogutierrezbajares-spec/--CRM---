import AppKit
import CoreAudio
import Foundation
import CaptureCore

/// Detects "some app started using the microphone" (FR-CALL-TRG-1) via
/// CoreAudio: a property listener plus a 1 s poll of
/// `kAudioDevicePropertyDeviceIsRunningSomewhere` on the default input device,
/// re-bound when the default device changes. Activity must persist for 2 s
/// (debounce) before firing; the prompt then appears well inside the 5 s SLA
/// (NFR-CALL-PERF-3).
///
/// On macOS 14.4+ the triggering app is resolved via AudioHardware process
/// objects (`kAudioHardwarePropertyProcessObjectList` →
/// `kAudioProcessPropertyIsRunningInput` → PID → NSRunningApplication);
/// otherwise `sourceApp` is nil.
///
/// The detector must only be armed while the helper is idle: our own
/// AVAudioEngine keeps the device "running" during preroll/recording, which
/// would otherwise re-trigger detection (the helper disarms before starting
/// its engine and re-arms after teardown).
final class MicActivityDetector {

    /// Fired on the main queue when mic activity is detected while armed.
    var onActivity: ((_ sourceApp: String?) -> Void)?
    /// Fired (main queue) when, during a recording watch, no *other* process
    /// has been using the mic for `endQuietSeconds` (FR-CALL-TRG-5, 14.4+ only).
    var onCallLikelyEnded: (() -> Void)?

    private let queue = DispatchQueue(label: "com.agb.capture-helper.detector")
    private var pollTimer: DispatchSourceTimer?
    private var armed = false
    private var watchingForEnd = false
    /// Waiting for the mic to go quiet before re-arming detection — used after
    /// an explicit prompt dismissal so the *same* ongoing call can never
    /// re-trigger the prompt the founder just declined (PromptPolicy.Rearm).
    private var waitingForQuiet = false

    private var currentDevice = AudioObjectID(kAudioObjectUnknown)
    private var deviceListenerInstalled = false
    private var defaultDeviceListenerInstalled = false

    private let debounceSeconds: TimeInterval = 2
    private let endQuietSeconds: TimeInterval = 5
    private var runningSince: Date?
    private var quietSince: Date?

    private lazy var defaultDeviceListener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
        self?.queue.async { self?.rebindDefaultDevice() }
    }
    private lazy var deviceRunningListener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
        self?.queue.async { self?.evaluate() }
    }

    // MARK: - Arm / disarm

    /// Arm idle-state detection. Call only when the helper is NOT capturing.
    func arm() {
        queue.async { [weak self] in
            guard let self, !self.armed else { return }
            self.armed = true
            self.watchingForEnd = false
            self.waitingForQuiet = false
            self.runningSince = nil
            self.installDefaultDeviceListener()
            self.rebindDefaultDevice()
            self.startPolling()
            HelperLog.shared.info("detector armed", category: "detect")
        }
    }

    /// Re-arm detection only once the mic has been released for a couple of
    /// seconds. Device-level (`kAudioDevicePropertyDeviceIsRunningSomewhere`),
    /// so it works on every macOS version — the caller must have torn down
    /// its own audio engine first or the device never goes quiet.
    func armAfterMicReleased() {
        queue.async { [weak self] in
            guard let self else { return }
            self.armed = false
            self.watchingForEnd = false
            self.waitingForQuiet = true
            self.quietSince = nil
            self.installDefaultDeviceListener()
            self.rebindDefaultDevice()
            self.startPolling()
            HelperLog.shared.info("detector waiting for mic release before re-arming", category: "detect")
        }
    }

    func disarm() {
        queue.async { [weak self] in
            guard let self else { return }
            self.armed = false
            self.watchingForEnd = false
            self.waitingForQuiet = false
            self.stopPolling()
            self.removeDeviceListener()
            HelperLog.shared.info("detector disarmed", category: "detect")
        }
    }

    /// While recording — or while the record prompt is up — watch for the
    /// *other* app releasing the mic so the capture can auto-finalize
    /// (FR-CALL-TRG-5) or the unanswered prompt can auto-dismiss. Only
    /// effective on 14.4+ where per-process input state is observable;
    /// otherwise a no-op (manual stop still works; the prompt falls back to
    /// PromptPolicy's safety cap).
    func watchForCallEnd() {
        queue.async { [weak self] in
            guard let self else { return }
            guard #available(macOS 14.4, *) else { return }
            self.armed = false
            self.waitingForQuiet = false
            self.watchingForEnd = true
            self.quietSince = nil
            self.startPolling()
            HelperLog.shared.info("watching for call end (process objects)", category: "detect")
        }
    }

    /// Whether the call-end watch can actually observe per-process mic state.
    static var callEndWatchAvailable: Bool {
        if #available(macOS 14.4, *) { return true }
        return false
    }

    // MARK: - Polling + evaluation

    private func startPolling() {
        guard pollTimer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in self?.evaluate() }
        timer.resume()
        pollTimer = timer
    }

    private func stopPolling() {
        pollTimer?.cancel()
        pollTimer = nil
    }

    private func evaluate() {
        if armed {
            evaluateDetection()
        } else if watchingForEnd {
            evaluateCallEnd()
        } else if waitingForQuiet {
            evaluateQuietWait()
        }
    }

    /// Device quiet for `endQuietSeconds` → flip into normal armed detection.
    /// Uses the same 5 s threshold as call-end detection so a brief mid-call
    /// mic gap (AirPods switch, route change, hold) can never re-arm and
    /// re-prompt the call the founder just dismissed.
    private func evaluateQuietWait() {
        guard currentDevice != AudioObjectID(kAudioObjectUnknown) else {
            rebindDefaultDevice()
            return
        }
        if Self.isRunningSomewhere(device: currentDevice) {
            quietSince = nil
            return
        }
        if quietSince == nil { quietSince = Date() }
        if let since = quietSince, Date().timeIntervalSince(since) >= endQuietSeconds {
            waitingForQuiet = false
            armed = true
            runningSince = nil
            HelperLog.shared.info("mic released — detector re-armed", category: "detect")
        }
    }

    private func evaluateDetection() {
        guard currentDevice != AudioObjectID(kAudioObjectUnknown) else {
            rebindDefaultDevice()
            return
        }
        let running = Self.isRunningSomewhere(device: currentDevice)
        if running {
            if runningSince == nil { runningSince = Date() }
            if let since = runningSince, Date().timeIntervalSince(since) >= debounceSeconds {
                armed = false // one-shot until re-armed
                stopPolling()
                let app = resolveSourceApp()
                HelperLog.shared.info("mic activity detected (source: \(app ?? "unknown"))", category: "detect")
                DispatchQueue.main.async { [weak self] in
                    self?.onActivity?(app)
                }
            }
        } else {
            runningSince = nil
        }
    }

    private func evaluateCallEnd() {
        guard #available(macOS 14.4, *) else { return }
        let othersRunning = Self.processesRunningInput(excludingPID: ProcessInfo.processInfo.processIdentifier)
        if othersRunning.isEmpty {
            if quietSince == nil { quietSince = Date() }
            if let since = quietSince, Date().timeIntervalSince(since) >= endQuietSeconds {
                watchingForEnd = false
                stopPolling()
                HelperLog.shared.info("no other process using mic for \(Int(endQuietSeconds))s — call likely ended", category: "detect")
                DispatchQueue.main.async { [weak self] in
                    self?.onCallLikelyEnded?()
                }
            }
        } else {
            quietSince = nil
        }
    }

    // MARK: - Source app resolution (macOS 14.4+)

    private func resolveSourceApp() -> String? {
        guard #available(macOS 14.4, *) else { return nil }
        let pids = Self.processesRunningInput(excludingPID: ProcessInfo.processInfo.processIdentifier)
        for pid in pids {
            if let app = NSRunningApplication(processIdentifier: pid),
               let name = app.localizedName {
                return name
            }
        }
        return nil
    }

    /// PIDs of processes (other than `excludingPID`) currently running audio
    /// *input*, via AudioHardware process objects.
    @available(macOS 14.4, *)
    private static func processesRunningInput(excludingPID: pid_t) -> [pid_t] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyProcessObjectList,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &dataSize
        )
        guard status == noErr, dataSize > 0 else { return [] }

        let count = Int(dataSize) / MemoryLayout<AudioObjectID>.size
        var objects = [AudioObjectID](repeating: 0, count: count)
        status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &dataSize, &objects
        )
        guard status == noErr else { return [] }

        var pids: [pid_t] = []
        for object in objects {
            var runningAddress = AudioObjectPropertyAddress(
                mSelector: kAudioProcessPropertyIsRunningInput,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var isRunning: UInt32 = 0
            var size = UInt32(MemoryLayout<UInt32>.size)
            guard AudioObjectGetPropertyData(object, &runningAddress, 0, nil, &size, &isRunning) == noErr,
                  isRunning != 0 else { continue }

            var pidAddress = AudioObjectPropertyAddress(
                mSelector: kAudioProcessPropertyPID,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var pid: pid_t = 0
            var pidSize = UInt32(MemoryLayout<pid_t>.size)
            guard AudioObjectGetPropertyData(object, &pidAddress, 0, nil, &pidSize, &pid) == noErr else { continue }
            if pid != excludingPID && pid > 0 {
                pids.append(pid)
            }
        }
        return pids
    }

    // MARK: - CoreAudio plumbing

    private func installDefaultDeviceListener() {
        guard !defaultDeviceListenerInstalled else { return }
        var address = Self.defaultInputAddress
        let status = AudioObjectAddPropertyListenerBlock(
            AudioObjectID(kAudioObjectSystemObject), &address, queue, defaultDeviceListener
        )
        defaultDeviceListenerInstalled = (status == noErr)
    }

    private func rebindDefaultDevice() {
        let newDevice = Self.defaultInputDevice()
        guard newDevice != currentDevice else { return }
        removeDeviceListener()
        currentDevice = newDevice
        runningSince = nil
        guard newDevice != AudioObjectID(kAudioObjectUnknown) else { return }
        var address = Self.runningSomewhereAddress
        let status = AudioObjectAddPropertyListenerBlock(newDevice, &address, queue, deviceRunningListener)
        deviceListenerInstalled = (status == noErr)
        HelperLog.shared.info("detector bound to input device \(newDevice)", category: "detect")
    }

    private func removeDeviceListener() {
        guard deviceListenerInstalled, currentDevice != AudioObjectID(kAudioObjectUnknown) else { return }
        var address = Self.runningSomewhereAddress
        AudioObjectRemovePropertyListenerBlock(currentDevice, &address, queue, deviceRunningListener)
        deviceListenerInstalled = false
    }

    private static var defaultInputAddress: AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private static var runningSomewhereAddress: AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private static func defaultInputDevice() -> AudioObjectID {
        var address = defaultInputAddress
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device
        )
        return status == noErr ? device : AudioObjectID(kAudioObjectUnknown)
    }

    private static func isRunningSomewhere(device: AudioObjectID) -> Bool {
        var address = runningSomewhereAddress
        var isRunning: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        let status = AudioObjectGetPropertyData(device, &address, 0, nil, &size, &isRunning)
        return status == noErr && isRunning != 0
    }
}
