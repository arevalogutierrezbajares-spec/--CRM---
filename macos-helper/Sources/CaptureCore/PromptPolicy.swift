import Foundation

/// Policy for the "Call detected — record?" prompt lifecycle.
///
/// History: v1.0 gave the prompt a fixed 60 s timeout that tore down the
/// pre-roll engine and re-prompted ~4 s later, wiping the RAM ring each
/// cycle — a 2026-06-12 WhatsApp call lost its first 8.5 minutes to that
/// loop. The contract is now: **the prompt persists while the call is live**
/// (pre-roll keeps rolling, RAM-only), and it goes away when the call ends,
/// the founder answers it, or a safety cap fires. Privacy is unchanged:
/// declined/expired prompts persist zero bytes (FR-CALL-TRG-7).
public enum PromptPolicy {

    /// Why a prompt ended without an affirmative "Record".
    public enum DeclineReason: Equatable, Sendable {
        /// Founder explicitly clicked Dismiss.
        case userDismissed
        /// The other app released the mic — the call ended unanswered.
        case callEnded
        /// The absolute safety cap fired (prevents a runaway audio tap).
        case safetyCap
    }

    /// How detection re-arms after a declined prompt.
    public enum Rearm: Equatable, Sendable {
        /// Arm normal detection right away (the mic is already quiet).
        case immediately
        /// Wait until the mic is released before re-arming, so the same
        /// ongoing call can never re-trigger the prompt the founder just
        /// dismissed (the v1.0 "nag loop").
        case afterMicReleased
    }

    public static func rearm(after reason: DeclineReason) -> Rearm {
        switch reason {
        case .callEnded:
            return .immediately
        case .userDismissed, .safetyCap:
            return .afterMicReleased
        }
    }

    /// Absolute ceiling on how long a prompt (and its RAM-only pre-roll tap)
    /// may stay alive. When per-process mic state is observable (macOS 14.4+)
    /// the call-end watch dismisses the prompt naturally, so the cap only
    /// guards against a truly stuck mic and mirrors the recording's own
    /// max-duration ceiling. Without that signal there is no way to know the
    /// call ended, so the tap is capped at 10 minutes.
    public static let fallbackCapSeconds: TimeInterval = 600

    public static func safetyCapSeconds(
        maxRecordingSeconds: TimeInterval,
        callEndWatchAvailable: Bool
    ) -> TimeInterval {
        guard callEndWatchAvailable else { return fallbackCapSeconds }
        // Never below the old 60 s contract, even with a footgun config.
        return max(maxRecordingSeconds, 60)
    }
}
