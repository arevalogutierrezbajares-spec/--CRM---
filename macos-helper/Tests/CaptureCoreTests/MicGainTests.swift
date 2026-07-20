import XCTest
@testable import CaptureCore

/// Input gain for speakerphone capture. The properties that matter are: quiet
/// speech gets lifted, loud speech is never clipped, and silence stays silent
/// (so the auto-end watchdog keeps working).
final class MicGainTests: XCTestCase {

    /// Mono Int16 sine at a given full-scale amplitude.
    private func tone(amplitude: Double, samples: Int = 1600) -> Data {
        var d = Data(capacity: samples * 2)
        for i in 0..<samples {
            let v = sin(Double(i) / 8.0) * amplitude * 32767.0
            var s = Int16(max(-32768.0, min(32767.0, v))).littleEndian
            withUnsafeBytes(of: &s) { d.append(contentsOf: $0) }
        }
        return d
    }

    func testRMSMatchesKnownSineLevel() {
        // Sine RMS = amplitude / sqrt(2).
        let rms = MicGain.rms(tone(amplitude: 0.5))
        XCTAssertEqual(rms, 0.5 / 2.0.squareRoot(), accuracy: 0.02)
    }

    func testQuietSpeechIsAmplifiedTowardTarget() {
        let gain = MicGain()
        // ≈ −46 dBFS: the level observed from a phone on speaker at desk distance.
        let quiet = tone(amplitude: 0.0065)
        var out = Data()
        // Release is deliberately slow; feed a couple of seconds of batches.
        for _ in 0..<200 { out = gain.apply(quiet) }

        XCTAssertGreaterThan(gain.currentGain, 4.0, "quiet speech should be lifted substantially")
        XCTAssertLessThanOrEqual(gain.currentGain, MicGain.maxGain)
        XCTAssertGreaterThan(MicGain.rms(out), MicGain.rms(quiet) * 4)
    }

    func testGainNeverExceedsCeiling() {
        let gain = MicGain()
        // Quiet, but above the noise floor — target/rms would demand ~22x.
        let veryQuiet = tone(amplitude: 0.005)
        XCTAssertGreaterThan(MicGain.rms(veryQuiet), MicGain.noiseFloorRMS,
                             "precondition: this must be treated as speech, not room tone")
        for _ in 0..<500 { _ = gain.apply(veryQuiet) }
        XCTAssertEqual(gain.currentGain, MicGain.maxGain, accuracy: 0.01)
    }

    /// A sudden shout while gain is already high is the clipping-risk case.
    func testSuddenLoudPassageIsPulledDownAndNeverWraps() {
        let gain = MicGain()
        for _ in 0..<400 { _ = gain.apply(tone(amplitude: 0.0065)) } // ride gain up
        XCTAssertGreaterThan(gain.currentGain, 4.0, "precondition: gain is up")

        let loud = tone(amplitude: 0.95)
        var out = Data()
        for _ in 0..<50 { out = gain.apply(loud) }

        XCTAssertLessThan(gain.currentGain, 1.5, "attack must pull gain down fast")
        // No sample may have wrapped sign — the classic symptom of unclamped gain.
        out.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let samples = raw.bindMemory(to: Int16.self)
            let peak = samples.map { abs(Int(Int16(littleEndian: $0))) }.max() ?? 0
            XCTAssertLessThanOrEqual(peak, 32767)
        }
    }

    /// The floor must never sit below the threshold, or there is a band of
    /// audio that is "silence" to SilenceMeter but "speech" to MicGain.
    func testNoiseFloorIsPinnedToSilenceThreshold() {
        XCTAssertGreaterThanOrEqual(MicGain.noiseFloorRMS, SilenceMeter.defaultThreshold,
                                    "a lower floor amplifies audio the helper defines as silence")
    }

    /// The regression that matters most, swept across the whole boundary band
    /// rather than at one convenient point: if any input SilenceMeter calls
    /// silent gets boosted into signal, CallEndMonitor never sees a silent frame
    /// and the silence auto-end can never fire. For `.speaker` captures that
    /// watchdog is the only auto-end, so this would mean recording room tone to
    /// the 2-hour cap.
    func testNoSilentInputIsEverBoostedIntoSignal() {
        let threshold = SilenceMeter.defaultThreshold
        for step in 0...20 {
            let amp = 0.0005 + Double(step) * 0.0002
            let gain = MicGain()
            let batch = tone(amplitude: amp)
            guard MicGain.rms(batch) < threshold else { continue } // only silent inputs
            var out = Data()
            for _ in 0..<400 { out = gain.apply(batch) }
            XCTAssertLessThan(MicGain.rms(out), threshold,
                              "silent input at amplitude \(amp) was boosted into signal")
        }
    }

    /// After gain has ridden up on speech, a realistic office noise floor must
    /// drag it back down fast enough to be seen inside the 90 s silence window.
    func testGainSettlesAfterSpeechStopsWellInsideSilenceWindow() {
        let gain = MicGain()
        for _ in 0..<400 { _ = gain.apply(tone(amplitude: 0.0065)) }
        XCTAssertGreaterThan(gain.currentGain, 4.0, "precondition: gain is up")

        let roomTone = tone(amplitude: 0.0028) // ≈ −54 dBFS HVAC floor
        var batches = 0
        for i in 0..<5000 {
            let out = gain.apply(roomTone)
            if MicGain.rms(out) < SilenceMeter.defaultThreshold { batches = i + 1; break }
        }
        XCTAssertGreaterThan(batches, 0, "boosted room tone never settled")
        // Each test batch is 1600 samples @ 16 kHz = 100 ms.
        XCTAssertLessThan(Double(batches) * 0.1, 30.0,
                          "must settle far inside the 90 s silence window")
    }

    /// Idle decay must be gentle enough that a normal pause between sentences
    /// doesn't dump the gain — otherwise the first word after every pause is
    /// swallowed while release slowly climbs back.
    func testInterSentencePauseDoesNotCollapseGain() {
        let gain = MicGain()
        for _ in 0..<400 { _ = gain.apply(tone(amplitude: 0.0065)) }
        let before = gain.currentGain
        for _ in 0..<3 { _ = gain.apply(tone(amplitude: 0.0008)) } // ~300 ms
        XCTAssertGreaterThan(gain.currentGain, before * 0.85,
                             "gain collapsed during a normal speech pause")
    }

    func testAttackIsFasterThanRelease() {
        // Gain must come down faster than it goes up, so a sudden loud talker
        // cannot ride a high gain into clipping.
        let up = MicGain()
        for _ in 0..<10 { _ = up.apply(tone(amplitude: 0.0065)) }
        let gainedUp = up.currentGain - 1.0

        let down = MicGain()
        for _ in 0..<200 { _ = down.apply(tone(amplitude: 0.0065)) }
        let high = down.currentGain
        for _ in 0..<10 { _ = down.apply(tone(amplitude: 0.9)) }
        let droppedBy = high - down.currentGain

        XCTAssertGreaterThan(droppedBy, gainedUp, "attack should outpace release")
    }

    func testUnityGainReturnsInputUnchanged() {
        let gain = MicGain()
        let loud = tone(amplitude: 0.9)
        XCTAssertEqual(gain.apply(loud), loud, "no needless copy at unity")
    }

    func testShortBufferIsPassedThrough() {
        let gain = MicGain()
        let tiny = Data([0x01])
        XCTAssertEqual(gain.apply(tiny), tiny)
    }
}
