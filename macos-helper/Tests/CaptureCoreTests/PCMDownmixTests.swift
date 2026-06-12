import Foundation
import Testing
@testable import CaptureCore

/// Unit tests for the pure channel-downmix logic the Core Audio process tap
/// (ProcessAudioTap) uses to collapse its 2-channel tapped buffers to mono
/// before resampling to 16 kHz Int16. The HAL plumbing itself can't run
/// headlessly, but this arithmetic is the part most worth pinning down.
@Suite struct PCMDownmixTests {

    private func approxEqual(_ a: [Float], _ b: [Float], tol: Float = 1e-6) -> Bool {
        guard a.count == b.count else { return false }
        for (x, y) in zip(a, b) where abs(x - y) > tol { return false }
        return true
    }

    // MARK: - De-interleaved (per-channel buffers)

    @Test func averagesTwoDeinterleavedChannels() {
        let left: [Float] = [1.0, 0.5, -0.5, -1.0]
        let right: [Float] = [0.0, 0.5, 0.5, 1.0]
        let mono = PCMDownmix.monoAverage(channels: [left, right], frameCount: 4)
        #expect(approxEqual(mono, [0.5, 0.5, 0.0, 0.0]))
    }

    @Test func singleChannelPassesThroughUnchanged() {
        let only: [Float] = [0.1, -0.2, 0.3, -0.4]
        let mono = PCMDownmix.monoAverage(channels: [only], frameCount: 4)
        #expect(approxEqual(mono, only))
    }

    @Test func duplicatedStereoOfMonoSourceRecoversMono() {
        // A 2-channel tap of a mono FaceTime source duplicates L=R; averaging
        // must return the original mono signal (no attenuation).
        let signal: [Float] = [0.25, -0.75, 1.0, -1.0, 0.0]
        let mono = PCMDownmix.monoAverage(channels: [signal, signal], frameCount: 5)
        #expect(approxEqual(mono, signal))
    }

    @Test func ignoresChannelsShorterThanFrameCount() {
        let full: [Float] = [1.0, 1.0, 1.0, 1.0]
        let short: [Float] = [1.0, 1.0] // dropped (too short)
        let mono = PCMDownmix.monoAverage(channels: [full, short], frameCount: 4)
        // Only `full` is usable → mono == full.
        #expect(approxEqual(mono, full))
    }

    @Test func zeroFramesYieldsEmpty() {
        #expect(PCMDownmix.monoAverage(channels: [[1, 2, 3]], frameCount: 0).isEmpty)
    }

    @Test func noUsableChannelsYieldsEmpty() {
        #expect(PCMDownmix.monoAverage(channels: [], frameCount: 4).isEmpty)
    }

    @Test func truncatesLongerChannelsToFrameCount() {
        let left: [Float] = [1, 2, 3, 4, 5, 6]
        let right: [Float] = [1, 2, 3, 4, 5, 6]
        let mono = PCMDownmix.monoAverage(channels: [left, right], frameCount: 3)
        #expect(mono.count == 3)
        #expect(approxEqual(mono, [1, 2, 3]))
    }

    // MARK: - Interleaved

    @Test func averagesInterleavedStereo() {
        // L,R,L,R,… → [(1+0)/2, (0+1)/2, (0.5+0.5)/2]
        let samples: [Float] = [1.0, 0.0, 0.0, 1.0, 0.5, 0.5]
        let mono = PCMDownmix.monoAverageInterleaved(samples: samples, channels: 2)
        #expect(approxEqual(mono, [0.5, 0.5, 0.5]))
    }

    @Test func interleavedMonoPassesThrough() {
        let samples: [Float] = [0.1, 0.2, 0.3]
        let mono = PCMDownmix.monoAverageInterleaved(samples: samples, channels: 1)
        #expect(approxEqual(mono, samples))
    }

    @Test func interleavedZeroChannelsYieldsEmpty() {
        #expect(PCMDownmix.monoAverageInterleaved(samples: [1, 2, 3], channels: 0).isEmpty)
    }

    @Test func interleavedDropsRaggedTrailingSamples() {
        // 5 samples, 2 channels → 2 full frames; the trailing odd sample is
        // ignored rather than read out of bounds.
        let samples: [Float] = [1.0, 1.0, 0.0, 0.0, 0.5]
        let mono = PCMDownmix.monoAverageInterleaved(samples: samples, channels: 2)
        #expect(mono.count == 2)
        #expect(approxEqual(mono, [1.0, 0.0]))
    }
}
