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

    /// Ensure both permissions, requesting whatever is requestable. Returns
    /// nil when ready, else a founder-facing explanation of what is missing.
    static func ensureCapturePermissions() async -> String? {
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

        if !screenRecordingGranted() {
            // First call shows the OS prompt; permission applies after relaunch.
            requestScreenRecording()
            problems.append(screenRecordingInstructions)
        }

        return problems.isEmpty ? nil : problems.joined(separator: "\n\n")
    }

    static let microphoneInstructions = """
    Microphone access is missing (needed for your side of the call).
    Fix: System Settings → Privacy & Security → Microphone → enable AGBCaptureHelper, \
    then restart the helper.
    """

    static let screenRecordingInstructions = """
    Screen Recording access is missing (macOS gates system-audio capture behind it — \
    needed for the participants' side).
    Fix: System Settings → Privacy & Security → Screen & System Audio Recording → \
    enable AGBCaptureHelper, then restart the helper.
    """

    // MARK: - Diagnostics (FR-CALL-OPS-6)

    static func statusReport() -> String {
        """
        Microphone:        \(microphoneStatus().rawValue)
        Screen Recording:  \(screenRecordingGranted() ? "granted" : "denied or not yet requested")
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
