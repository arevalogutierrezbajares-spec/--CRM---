import Foundation

/// Backoff policy for the live-transcript engines. Pure + testable; the engine
/// classes call these rather than embedding magic curves.
public enum LiveBackoff {

    /// Cloud-stream reconnect: before attempt N (1-based) wait 1, 2, 4, 8, then
    /// 15 s forever. The live stream is throwaway (filing re-transcribes
    /// server-side), so the streamer retries for the whole call rather than
    /// giving up — a mid-call Wi-Fi blip must not kill the live view for the
    /// remaining hour (2026-07-22 RCA: TLS `-9820 bad record MAC` closed the
    /// socket 17 min in and the old code never reopened it).
    public static func reconnectDelay(attempt: Int) -> TimeInterval {
        guard attempt > 0 else { return 1 }
        return min(15, pow(2, Double(attempt - 1)))
    }

    /// On-device channel restart after an error: 0.5, 1, 2, 4, then 8 s. The
    /// 2026-07-13 RCA found the old instant retry spinning at ~100 Hz against a
    /// broken speech-model cache (kAFAssistantErrorDomain 1101) — 22k silent
    /// errors in 24 s until the XPC service ran out of memory.
    public static func onDeviceRetryDelay(consecutiveFailures: Int) -> TimeInterval {
        guard consecutiveFailures > 0 else { return 0 }
        return min(8, 0.5 * pow(2, Double(consecutiveFailures - 1)))
    }
}
