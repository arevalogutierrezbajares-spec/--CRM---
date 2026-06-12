import Foundation
import Testing
@testable import CaptureCore

/// Locks in the post-2026-06-12 prompt contract: no fixed 60 s expiry loop
/// that wipes pre-roll and re-prompts mid-call, and no re-prompt nag after an
/// explicit dismissal of the same ongoing call.
@Suite struct PromptPolicyTests {

    // MARK: - Re-arm behavior

    @Test func dismissedPromptWaitsForMicReleaseBeforeRearming() {
        // The v1.0 bug: re-arming immediately re-detected the SAME live call
        // ~4 s later and re-prompted. A founder's "no" must stick for the
        // rest of that call.
        #expect(PromptPolicy.rearm(after: .userDismissed) == .afterMicReleased)
    }

    @Test func safetyCappedPromptWaitsForMicRelease() {
        // Same reasoning: the mic is still live when the cap fires.
        #expect(PromptPolicy.rearm(after: .safetyCap) == .afterMicReleased)
    }

    @Test func callEndedRearmsImmediately() {
        // The mic is already quiet — normal detection can resume right away.
        #expect(PromptPolicy.rearm(after: .callEnded) == .immediately)
    }

    // MARK: - Safety cap

    @Test func capMatchesRecordingCeilingWhenCallEndIsObservable() {
        // With the call-end watch (macOS 14.4+), the prompt lives as long as
        // the call does; the cap is only the absolute runaway guard and must
        // NOT be a short fixed timeout (the old 60 s contract lost 8.5
        // minutes of a real call).
        let cap = PromptPolicy.safetyCapSeconds(maxRecordingSeconds: 7200,
                                                callEndWatchAvailable: true)
        #expect(cap == 7200)
        #expect(cap > 60)
    }

    @Test func capFallsBackWhenCallEndIsUnobservable() {
        // Pre-14.4 there is no mic-release signal, so the RAM tap is bounded
        // at 10 minutes instead of running for hours on a false detection.
        let cap = PromptPolicy.safetyCapSeconds(maxRecordingSeconds: 7200,
                                                callEndWatchAvailable: false)
        #expect(cap == PromptPolicy.fallbackCapSeconds)
        #expect(cap == 600)
    }

    @Test func footgunConfigCannotDisableTheCap() {
        let cap = PromptPolicy.safetyCapSeconds(maxRecordingSeconds: 0,
                                                callEndWatchAvailable: true)
        #expect(cap >= 60)
    }
}
