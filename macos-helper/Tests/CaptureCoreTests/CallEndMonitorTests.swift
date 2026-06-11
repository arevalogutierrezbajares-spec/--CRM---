import Foundation
import Testing
@testable import CaptureCore

/// FEATURE 1 — the auto-end watchdog. Time is injected so the silence-window
/// and max-duration logic is fully deterministic with no TCC, network, or clock.
@Suite struct CallEndMonitorTests {

    /// Interleaved stereo PCM16 batch, constant amplitude per channel.
    private func stereo(frames: Int, left: Int16, right: Int16) -> Data {
        var data = Data(capacity: frames * 4)
        for _ in 0..<frames {
            withUnsafeBytes(of: left.littleEndian) { data.append(contentsOf: $0) }
            withUnsafeBytes(of: right.littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    private func loudBatch() -> Data { stereo(frames: 1_600, left: 8_000, right: 6_000) }
    private func silentBatch() -> Data { stereo(frames: 1_600, left: 0, right: 0) }
    /// One channel loud, the other silent — should still count as signal.
    private func oneChannelLoud() -> Data { stereo(frames: 1_600, left: 8_000, right: 0) }

    // MARK: - Silence timeout

    @Test func silenceFiresExactlyAtWindow() {
        let monitor = CallEndMonitor(silenceWindow: 90, maxDuration: 7200)
        var t = 0.0
        monitor.start(now: t)

        // 0–10 s: real audio keeps resetting the silence timer.
        for _ in 0..<10 {
            t += 1
            #expect(monitor.feed(loudBatch(), now: t) == nil)
        }

        // Then go quiet. Last signal was at t=10. Window is 90 s, so silence
        // crosses at t=100. Feed silent batches each second up to t=99 → no fire.
        while t < 99 {
            t += 1
            #expect(monitor.feed(silentBatch(), now: t) == nil, "should not fire before the window at t=\(t)")
        }

        // t=100: 90 s since last signal → fire, as a *normal* end.
        t += 1
        let reason = monitor.feed(silentBatch(), now: t)
        guard case .silence(let seconds)? = reason else {
            Issue.record("expected silence reason, got \(String(describing: reason))")
            return
        }
        #expect(seconds >= 90)
        #expect(monitor.hasFired)
    }

    @Test func signalOnEitherChannelResetsTheTimer() {
        let monitor = CallEndMonitor(silenceWindow: 5, maxDuration: 7200)
        var t = 0.0
        monitor.start(now: t)

        // 4 s of silence (under the 5 s window).
        for _ in 0..<4 { t += 1; #expect(monitor.feed(silentBatch(), now: t) == nil) }
        // A blip of audio on the mic channel only resets the timer.
        t += 1; #expect(monitor.feed(oneChannelLoud(), now: t) == nil)
        // Another 4 s of silence — still under the window from the reset.
        for _ in 0..<4 { t += 1; #expect(monitor.feed(silentBatch(), now: t) == nil) }
        #expect(!monitor.hasFired)
        // Cross the window now.
        t += 1; #expect(monitor.feed(silentBatch(), now: t) != nil)
    }

    @Test func firesOnlyOnce() {
        let monitor = CallEndMonitor(silenceWindow: 2, maxDuration: 7200)
        monitor.start(now: 0)
        _ = monitor.feed(silentBatch(), now: 1)
        let first = monitor.feed(silentBatch(), now: 3) // crosses 2 s
        #expect(first != nil)
        // Subsequent feeds must return nil so the caller finalizes exactly once.
        #expect(monitor.feed(silentBatch(), now: 4) == nil)
        #expect(monitor.feed(silentBatch(), now: 100) == nil)
    }

    @Test func continuousAudioNeverFiresSilence() {
        let monitor = CallEndMonitor(silenceWindow: 30, maxDuration: 7200)
        var t = 0.0
        monitor.start(now: t)
        for _ in 0..<300 { // 5 minutes of solid audio
            t += 1
            #expect(monitor.feed(loudBatch(), now: t) == nil)
        }
        #expect(!monitor.hasFired)
    }

    // MARK: - Max-duration cap

    @Test func maxDurationFiresEvenMidSpeech() {
        let monitor = CallEndMonitor(silenceWindow: 90, maxDuration: 120)
        var t = 0.0
        monitor.start(now: t)
        // Loud audio the whole time — silence never triggers; the cap must.
        while t < 119 {
            t += 1
            #expect(monitor.feed(loudBatch(), now: t) == nil)
        }
        t += 1 // t = 120 → cap reached
        let reason = monitor.feed(loudBatch(), now: t)
        guard case .maxDuration(let seconds)? = reason else {
            Issue.record("expected maxDuration reason, got \(String(describing: reason))")
            return
        }
        #expect(seconds >= 120)
    }

    @Test func maxDurationTakesPrecedenceOverSilence() {
        // If both could fire on the same pump, the cap wins (distinct logging).
        let monitor = CallEndMonitor(silenceWindow: 10, maxDuration: 10)
        monitor.start(now: 0)
        let reason = monitor.feed(silentBatch(), now: 10)
        guard case .maxDuration? = reason else {
            Issue.record("expected maxDuration to win, got \(String(describing: reason))")
            return
        }
    }

    // MARK: - Telemetry helpers

    @Test func tracksSilentAndElapsedSeconds() {
        let monitor = CallEndMonitor(silenceWindow: 90, maxDuration: 7200)
        monitor.start(now: 100)
        _ = monitor.feed(loudBatch(), now: 105) // signal at 105
        _ = monitor.feed(silentBatch(), now: 110)
        #expect(abs(monitor.silentSeconds(now: 110) - 5) < 0.001)
        #expect(abs(monitor.elapsedSeconds(now: 110) - 10) < 0.001)
    }

    @Test func hasSignalDetectsEitherChannel() {
        let threshold = SilenceMeter.defaultThreshold
        #expect(CallEndMonitor.batchHasSignal(loudBatch(), threshold: threshold))
        #expect(CallEndMonitor.batchHasSignal(oneChannelLoud(), threshold: threshold))
        #expect(!CallEndMonitor.batchHasSignal(silentBatch(), threshold: threshold))
        #expect(!CallEndMonitor.batchHasSignal(Data(), threshold: threshold))
    }

    @Test func feedWithPrecomputedSignalFlag() {
        let monitor = CallEndMonitor(silenceWindow: 5, maxDuration: 7200)
        monitor.start(now: 0)
        #expect(monitor.feed(hasSignal: true, now: 3) == nil)  // resets at 3
        #expect(monitor.feed(hasSignal: false, now: 7) == nil) // 4 s of silence
        #expect(monitor.feed(hasSignal: false, now: 8) != nil) // 5 s → fire
    }
}
