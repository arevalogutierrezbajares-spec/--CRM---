import Foundation
import Testing
@testable import CaptureCore

@Suite struct SilenceMeterTests {

    /// Build interleaved stereo PCM16: constant amplitude per channel.
    private func stereo(frames: Int, left: Int16, right: Int16) -> Data {
        var data = Data(capacity: frames * 4)
        for _ in 0..<frames {
            withUnsafeBytes(of: left.littleEndian) { data.append(contentsOf: $0) }
            withUnsafeBytes(of: right.littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    @Test func bothChannelsSilentFlagged() {
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 16_000, left: 0, right: 0))
        let report = meter.report()
        #expect(report.leftNearSilent)
        #expect(report.rightNearSilent)
        #expect(report.anyChannelNearSilent)
        #expect(report.frames == 16_000)
    }

    @Test func loudLeftSilentRight() {
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 16_000, left: 8_000, right: 0))
        let report = meter.report()
        #expect(!report.leftNearSilent, "mic channel is loud")
        #expect(report.rightNearSilent, "system channel is silent → suspect")
        #expect(abs(report.leftRMS - 8_000.0 / 32_768.0) < 0.001)
        #expect(report.anyChannelNearSilent)
        #expect(report.summary.contains("NEAR-SILENT"))
    }

    @Test func bothChannelsLoudNotFlagged() {
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 8_000, left: 4_000, right: -6_000))
        let report = meter.report()
        #expect(!report.leftNearSilent)
        #expect(!report.rightNearSilent)
        #expect(!report.anyChannelNearSilent)
    }

    @Test func veryQuietButNonZeroStillFlagged() {
        // Amplitude 20/32768 ≈ 0.0006 RMS — below the 0.0025 threshold.
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 16_000, left: 20, right: 20))
        let report = meter.report()
        #expect(report.leftNearSilent)
        #expect(report.rightNearSilent)
    }

    @Test func accumulatesAcrossMultipleFeeds() {
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 1_000, left: 1_000, right: 0))
        meter.feedInterleaved(stereo(frames: 1_000, left: 1_000, right: 0))
        #expect(meter.report().frames == 2_000)
    }

    @Test func noAudioReportsSilent() {
        let report = SilenceMeter().report()
        #expect(report.frames == 0)
        #expect(report.anyChannelNearSilent)
        #expect(report.summary == "no audio measured")
    }

    @Test func resetClearsState() {
        let meter = SilenceMeter()
        meter.feedInterleaved(stereo(frames: 100, left: 5_000, right: 5_000))
        meter.reset()
        #expect(meter.report().frames == 0)
    }
}
