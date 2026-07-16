import Foundation
import Testing
@testable import CaptureCore

@Suite final class MonoWavAssemblerTests {
    @Test func extractLeftFromStereoInterleaved() {
        // frames: L0 R0 L1 R1 as Int16 little-endian
        var pcm = Data()
        func append(_ v: Int16) {
            var le = v.littleEndian
            withUnsafeBytes(of: &le) { pcm.append(contentsOf: $0) }
        }
        append(100)
        append(200)
        append(300)
        append(400)
        let mono = MonoWavAssembler.extractLeft(pcm: pcm, channels: 2)
        #expect(mono.count == 4)
        let samples = mono.withUnsafeBytes { Array($0.bindMemory(to: Int16.self)) }
        #expect(samples[0] == 100)
        #expect(samples[1] == 300)
    }

    @Test func extractLeftMonoPassthrough() {
        var pcm = Data()
        var v: Int16 = 42
        withUnsafeBytes(of: &v) { pcm.append(contentsOf: $0) }
        let mono = MonoWavAssembler.extractLeft(pcm: pcm, channels: 1)
        #expect(mono == pcm)
    }
}
