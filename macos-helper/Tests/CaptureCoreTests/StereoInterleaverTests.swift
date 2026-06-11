import Foundation
import Testing
@testable import CaptureCore

@Suite struct StereoInterleaverTests {

    private func mono(frames: Int, value: Int16) -> Data {
        var data = Data(capacity: frames * 2)
        for _ in 0..<frames {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    private func samples(_ data: Data) -> [Int16] {
        data.withUnsafeBytes { raw in
            Array(raw.bindMemory(to: Int16.self))
        }
    }

    @Test func interleavesMicLeftSystemRight() {
        let interleaver = StereoInterleaver(cushionSeconds: 0)
        interleaver.appendMic(mono(frames: 4, value: 11))
        interleaver.appendSystem(mono(frames: 4, value: 22))

        _ = interleaver.pump(now: 0) // establishes the clock
        let out = interleaver.pump(now: 4.0 / 16_000.0)
        let stereo = samples(out)
        #expect(stereo.count == 8)
        #expect(stereo == [11, 22, 11, 22, 11, 22, 11, 22])
    }

    @Test func missingSideIsPaddedWithSilence() {
        let interleaver = StereoInterleaver(cushionSeconds: 0)
        interleaver.appendMic(mono(frames: 8, value: 5)) // no system audio at all

        _ = interleaver.pump(now: 0)
        let out = interleaver.pump(now: 8.0 / 16_000.0)
        let stereo = samples(out)
        #expect(stereo.count == 16)
        for frame in 0..<8 {
            #expect(stereo[frame * 2] == 5, "mic side present")
            #expect(stereo[frame * 2 + 1] == 0, "system side silence-filled")
        }
    }

    @Test func clockLimitsEmissionNotQueueDepth() {
        let interleaver = StereoInterleaver(cushionSeconds: 0)
        interleaver.appendMic(mono(frames: 1_600, value: 1))   // 100 ms queued
        interleaver.appendSystem(mono(frames: 1_600, value: 2))

        _ = interleaver.pump(now: 0)
        // Only 10 ms of wall clock elapsed → only 160 frames may come out.
        let out = interleaver.pump(now: 0.010)
        #expect(out.count == 160 * 4)
    }

    @Test func flushRemainingPadsShorterSide() {
        let interleaver = StereoInterleaver(cushionSeconds: 0)
        interleaver.appendMic(mono(frames: 6, value: 9))
        interleaver.appendSystem(mono(frames: 2, value: 7))

        let stereo = samples(interleaver.flushRemaining())
        #expect(stereo.count == 12, "length follows the longer side")
        #expect(stereo[0] == 9)
        #expect(stereo[1] == 7)
        #expect(stereo[5] == 0, "system ran out after 2 frames")
        #expect(stereo[10] == 9)
    }

    @Test func resetDropsQueuesAndClock() {
        let interleaver = StereoInterleaver(cushionSeconds: 0)
        interleaver.appendMic(mono(frames: 100, value: 1))
        interleaver.reset()
        #expect(interleaver.flushRemaining().isEmpty)
    }
}
