import Foundation
import Testing
@testable import CaptureCore

/// DEFECT A — the mic-dead watchdog state machine. Time is injected so the
/// dead-window, cooldown, and restart-cap logic is fully deterministic (no
/// CoreAudio, no clock). The `scan` byte helper is exercised separately so we
/// prove the exact-zero L test and RMS R test that feed the machine.
@Suite struct MicDeadDetectorTests {

    /// Interleaved stereo PCM16 batch, constant amplitude per channel.
    private func stereo(frames: Int, left: Int16, right: Int16) -> Data {
        var data = Data(capacity: frames * 4)
        for _ in 0..<frames {
            withUnsafeBytes(of: left.littleEndian) { data.append(contentsOf: $0) }
            withUnsafeBytes(of: right.littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    // MARK: - Core firing behavior

    @Test func firesExactlyAtDeadWindowWhenMicZeroAndSystemLive() {
        var d = MicDeadDetector(deadWindow: 8, maxRestarts: 3, restartCooldown: 30)
        var t = 0.0
        // Tick every 0.1 s for just under 8 s of continuous dead-mic-live-system.
        while t < 7.9 {
            t += 0.1
            #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .none,
                    "must not fire before the window at t=\(t)")
        }
        // Crossing 8 s of continuous dead run → restart, exactly once.
        t += 0.2 // t ≈ 8.1
        #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .restart)
        #expect(d.restartsUsed == 1)
        // Immediately after firing the anchor is cleared: no second fire next tick.
        t += 0.1
        #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .none)
    }

    @Test func healthyMicNeverFires() {
        var d = MicDeadDetector(deadWindow: 8)
        var t = 0.0
        // 60 s of a live mic (nonzero L) while system is also live → never fires.
        while t < 60 {
            t += 0.1
            #expect(d.feed(micAllZero: false, systemActive: true, at: t) == .none)
        }
        #expect(d.restartsUsed == 0)
    }

    @Test func bothChannelsSilentIsNotAMicDeath() {
        // Mic zero but system ALSO silent = normal silence (CallEndMonitor's job),
        // not a dead mic. Must never fire no matter how long it persists.
        var d = MicDeadDetector(deadWindow: 8)
        var t = 0.0
        while t < 60 {
            t += 0.1
            #expect(d.feed(micAllZero: true, systemActive: false, at: t) == .none)
        }
        #expect(d.restartsUsed == 0)
    }

    @Test func anyNonzeroMicTickResetsTheDeadRun() {
        var d = MicDeadDetector(deadWindow: 8)
        var t = 0.0
        // 7.5 s dead…
        while t < 7.5 {
            t += 0.1
            #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .none)
        }
        // …one healthy tick resets the run…
        t += 0.1
        #expect(d.feed(micAllZero: false, systemActive: true, at: t) == .none)
        // …so another ~7.5 s of dead audio still doesn't cross the window.
        let restartTarget = t + 7.5
        while t < restartTarget {
            t += 0.1
            #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .none,
                    "run restarted; should not fire yet at t=\(t)")
        }
        #expect(d.restartsUsed == 0)
    }

    @Test func systemGoingQuietMidRunResetsTheRun() {
        var d = MicDeadDetector(deadWindow: 8)
        var t = 0.0
        while t < 7.5 {
            t += 0.1
            _ = d.feed(micAllZero: true, systemActive: true, at: t)
        }
        // System briefly quiet (nothing to cross-check) resets the dead anchor.
        t += 0.1
        #expect(d.feed(micAllZero: true, systemActive: false, at: t) == .none)
        // Only ~1 s more of dead-live after that → still far from the window.
        for _ in 0..<10 { t += 0.1; _ = d.feed(micAllZero: true, systemActive: true, at: t) }
        #expect(d.restartsUsed == 0)
    }

    // MARK: - Caps: cooldown + max restarts

    @Test func consecutiveRestartsAreHeldAtLeastCooldownApart() {
        var d = MicDeadDetector(deadWindow: 8, maxRestarts: 3, restartCooldown: 30)
        var t = 0.0
        // First restart at ~8 s.
        func tickDeadUntil(_ end: Double) -> MicDeadDetector.Action {
            var last: MicDeadDetector.Action = .none
            while t < end {
                t += 0.1
                last = d.feed(micAllZero: true, systemActive: true, at: t)
                if last == .restart { break }
            }
            return last
        }
        _ = tickDeadUntil(9)
        #expect(d.restartsUsed == 1)
        let firstAt = t

        // Keep the mic dead continuously. The window is satisfied again ~8 s
        // later (t≈17), but the 30 s cooldown blocks a restart until t≈first+30.
        while t < firstAt + 29 {
            t += 0.1
            #expect(d.feed(micAllZero: true, systemActive: true, at: t) == .none,
                    "cooldown must suppress restart at t=\(t)")
        }
        // Past the cooldown, with the dead run still satisfied, it fires again.
        var fired = false
        while t < firstAt + 31 {
            t += 0.1
            if d.feed(micAllZero: true, systemActive: true, at: t) == .restart { fired = true; break }
        }
        #expect(fired)
        #expect(d.restartsUsed == 2)
        #expect(t - firstAt >= 30, "restarts must be ≥ cooldown apart")
    }

    @Test func stopsAfterMaxRestarts() {
        var d = MicDeadDetector(deadWindow: 1, maxRestarts: 3, restartCooldown: 2)
        var t = 0.0
        var restarts = 0
        // Drive continuous dead audio for a long time; count restarts. With a 1 s
        // window + 2 s cooldown, restarts land roughly every ~2 s and must cap at 3.
        while t < 100 {
            t += 0.1
            if d.feed(micAllZero: true, systemActive: true, at: t) == .restart { restarts += 1 }
        }
        #expect(restarts == 3)
        #expect(d.restartsUsed == 3)
    }

    @Test func resetClearsRuntimeStateButKeepsConfig() {
        var d = MicDeadDetector(deadWindow: 1, maxRestarts: 1, restartCooldown: 30)
        var t = 0.0
        while t < 5 { t += 0.1; _ = d.feed(micAllZero: true, systemActive: true, at: t) }
        #expect(d.restartsUsed == 1)
        d.reset()
        #expect(d.restartsUsed == 0)
        // After reset the budget is fresh: a new dead run fires again.
        var fired = false
        let start = t
        while t < start + 5 {
            t += 0.1
            if d.feed(micAllZero: true, systemActive: true, at: t) == .restart { fired = true; break }
        }
        #expect(fired)
    }

    // MARK: - scan(): the byte → (micAllZero, systemActive) derivation

    @Test func scanFlagsPureZeroMicWithLiveSystem() {
        // L all zero, R at a healthy amplitude (well above the ~0.0025 floor).
        let batch = stereo(frames: 1_600, left: 0, right: 6_000)
        let s = MicDeadDetector.scan(interleaved: batch)
        #expect(s.micAllZero)
        #expect(s.systemActive)
    }

    @Test func scanTreatsQuietButNonzeroMicAsAlive() {
        // A single tiny nonzero L sample means the tap is delivering — NOT dead —
        // even though the room is near-silent. Exact-zero is the only signal.
        var batch = stereo(frames: 1_600, left: 0, right: 6_000)
        // Poke one L sample (frame 10, L is sample index 20) to a tiny value.
        batch.withUnsafeMutableBytes { raw in
            let s = raw.bindMemory(to: Int16.self)
            s[20] = Int16(1).littleEndian
        }
        let s = MicDeadDetector.scan(interleaved: batch)
        #expect(!s.micAllZero, "one nonzero L sample must read as a live mic")
    }

    @Test func scanReportsSystemInactiveWhenRightIsSilent() {
        let batch = stereo(frames: 1_600, left: 0, right: 0)
        let s = MicDeadDetector.scan(interleaved: batch)
        #expect(s.micAllZero)
        #expect(!s.systemActive, "silent R must not count as system-active")
    }

    @Test func scanEmptyBatchCannotTrigger() {
        // Sub-frame data: can't judge the far side, so systemActive=false ⇒ inert.
        let s = MicDeadDetector.scan(interleaved: Data([0x00, 0x01]))
        #expect(s.micAllZero)
        #expect(!s.systemActive)
    }

    /// End-to-end through the exact bytes the pump produces: a pure-zero mic and
    /// a live system, scanned then fed, restarts after the window — the 2026-07-12
    /// production scenario reproduced deterministically.
    @Test func scannedPumpBytesDriveARestart() {
        var d = MicDeadDetector(deadWindow: 8, maxRestarts: 3, restartCooldown: 30)
        let deadMicLiveSystem = stereo(frames: 1_600, left: 0, right: 6_000)
        var t = 0.0
        var fired = false
        while t < 9 {
            t += 0.1
            let s = MicDeadDetector.scan(interleaved: deadMicLiveSystem)
            if d.feed(micAllZero: s.micAllZero, systemActive: s.systemActive, at: t) == .restart {
                fired = true
                break
            }
        }
        #expect(fired)
        #expect(t >= 8.0)
    }
}
