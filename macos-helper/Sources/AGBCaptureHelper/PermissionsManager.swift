import AppKit
import AVFoundation
import CoreGraphics
import ScreenCaptureKit
import CaptureCore

/// Checks + requests the two OS permissions capture needs, and turns missing
/// permissions into exact, actionable instructions (FR-CALL-OPS-2) instead of
/// silent failure.
enum PermissionsManager {

    enum PermissionState: String {
        case granted = "granted"
        case denied = "denied"
        case undetermined = "not yet requested"
    }

    // MARK: - Microphone

    static func microphoneStatus() -> PermissionState {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .undetermined
        @unknown default: return .undetermined
        }
    }

    static func requestMicrophone() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .audio)
    }

    // MARK: - Screen Recording (system audio rides on this TCC class)

    static func screenRecordingGranted() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    /// Triggers the system prompt / System Settings deep-link on first ask.
    @discardableResult
    static func requestScreenRecording() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    // MARK: - Combined preflight

    /// Ensure permissions for the capture kind. In-person **meetings** only need
    /// the microphone; **calls** also need Screen & System Audio Recording.
    static func ensureCapturePermissions(kind: CaptureKind = .call) async -> String? {
        var problems: [String] = []

        switch microphoneStatus() {
        case .granted:
            break
        case .undetermined:
            let granted = await requestMicrophone()
            if !granted {
                problems.append(microphoneInstructions)
            }
        case .denied:
            problems.append(microphoneInstructions)
        }

        // Mic-only kinds (meeting, speakerphone) never tap system audio.
        if kind.capturesSystemAudio, !screenRecordingGranted() {
            // First call shows the OS prompt; permission applies after relaunch.
            requestScreenRecording()
            problems.append(screenRecordingInstructions)
        }

        return problems.isEmpty ? nil : problems.joined(separator: "\n\n")
    }

    static let microphoneInstructions = """
    Microphone access is missing (needed for your side of the call).
    Fix: System Settings → Privacy & Security → Microphone → enable AGB AI, \
    then restart the app.
    """

    static let screenRecordingInstructions = """
    Screen Recording access is missing (macOS gates system-audio capture behind it — \
    needed for the participants' side).
    Fix: System Settings → Privacy & Security → Screen & System Audio Recording → \
    enable AGB AI, then restart the app.
    """

    // MARK: - Audio capture (Core Audio process tap)

    /// The Core Audio process tap (primary system-audio path, FaceTime-capable)
    /// requires audio-capture authorization, surfaced under macOS's Audio
    /// Recording / system-audio privacy controls. When it is unauthorized the
    /// HAL returns a permission-class OSStatus from `AudioHardwareCreateProcessTap`
    /// and the helper transparently falls back to ScreenCaptureKit — which CANNOT
    /// capture FaceTime. This string tells the user how to unlock the better path.
    static let audioCaptureInstructions = """
    System-audio (process-tap) capture is not authorized. Without it, FaceTime and \
    other call-app audio cannot be recorded (the helper falls back to ScreenCaptureKit, \
    which only captures regular media playback).
    Fix: System Settings → Privacy & Security → Screen & System Audio Recording → \
    enable AGB AI, then restart the app. (Audio-capture authorization for \
    the process tap is granted alongside this control on macOS 14.4+.)
    """

    /// Heuristic: did a process-tap `start()` failure look like a permission /
    /// authorization denial (vs. a transient HAL error)? Core Audio returns
    /// permission-class statuses; treat the common ones as "unauthorized" so the
    /// caller can log the actionable instructions above.
    static func processTapLikelyUnauthorized(_ error: Error) -> Bool {
        let code = (error as NSError).code
        // kAudioHardwareIllegalOperationError ('what'), 'priv'/permission-class,
        // and the generic not-permitted POSIX code all indicate authorization.
        let fourCC: (String) -> Int = { s in
            s.utf8.reduce(0) { ($0 << 8) | Int($1) }
        }
        let permissionLikeCodes: Set<Int> = [
            fourCC("what"),  // kAudioHardwareIllegalOperationError
            fourCC("priv"),  // private/permission
            fourCC("nope"),  // kAudioHardwareNotRunningError-adjacent denials
            1,               // EPERM
        ]
        return permissionLikeCodes.contains(code)
    }

    // MARK: - Diagnostics (FR-CALL-OPS-6)

    static func statusReport() -> String {
        let tapNote: String
        if #available(macOS 14.4, *) {
            tapNote = "process tap available (system-audio incl. FaceTime; needs Audio/Screen Recording auth)"
        } else {
            tapNote = "process tap unavailable on this macOS (<14.4) — ScreenCaptureKit fallback only"
        }
        return """
        Microphone:        \(microphoneStatus().rawValue)
        Screen Recording:  \(screenRecordingGranted() ? "granted" : "denied or not yet requested")
        System audio tap:  \(tapNote)
        """
    }

    /// Open the relevant System Settings privacy pane.
    static func openSystemSettings(microphone: Bool) {
        let urlString = microphone
            ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        if let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }
}
