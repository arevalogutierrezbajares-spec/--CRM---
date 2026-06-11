import Foundation
import Testing
@testable import CaptureCore

@Suite struct WavCodecTests {

    /// Golden bytes for the canonical header of a full 30 s chunk
    /// (1 920 000 PCM bytes @ 16 kHz, 2 ch, 16-bit).
    @Test func goldenHeaderBytes() {
        let header = WavCodec.header(dataBytes: 1_920_000)
        let expected: [UInt8] = [
            0x52, 0x49, 0x46, 0x46,             // "RIFF"
            0x24, 0x4C, 0x1D, 0x00,             // 36 + 1_920_000 = 1_920_036 LE
            0x57, 0x41, 0x56, 0x45,             // "WAVE"
            0x66, 0x6D, 0x74, 0x20,             // "fmt "
            0x10, 0x00, 0x00, 0x00,             // fmt chunk size 16
            0x01, 0x00,                         // PCM = 1
            0x02, 0x00,                         // channels = 2
            0x80, 0x3E, 0x00, 0x00,             // sample rate 16_000
            0x00, 0xFA, 0x00, 0x00,             // byte rate 64_000
            0x04, 0x00,                         // block align 4
            0x10, 0x00,                         // bits 16
            0x64, 0x61, 0x74, 0x61,             // "data"
            0x00, 0x4C, 0x1D, 0x00,             // data size 1_920_000 LE
        ]
        #expect(header.count == 44)
        #expect([UInt8](header) == expected)
    }

    @Test func wrapParseRoundtrip() throws {
        // 100 stereo frames of a recognizable ramp.
        var pcm = Data()
        for i in 0..<200 {
            let sample = Int16(truncatingIfNeeded: i * 17 - 1000)
            withUnsafeBytes(of: sample.littleEndian) { pcm.append(contentsOf: $0) }
        }
        let wav = WavCodec.wrap(pcm: pcm)
        #expect(wav.count == 44 + pcm.count)

        let info = try WavCodec.parse(wav)
        #expect(info.sampleRate == 16_000)
        #expect(info.channels == 2)
        #expect(info.bitsPerSample == 16)
        #expect(info.dataOffset == 44)
        #expect(info.dataLength == pcm.count)
        #expect(info.frameCount == 100)
        #expect(WavCodec.pcmData(wav, info: info) == pcm)
    }

    @Test func roundtripSurvivesDataSlicing() throws {
        // parse must work on Data rebuilt from a slice with non-zero indices.
        let pcm = Data(repeating: 0x42, count: 400)
        var padded = Data([0xFF, 0xFF, 0xFF])
        padded.append(WavCodec.wrap(pcm: pcm))
        let slice = padded.dropFirst(3)
        let info = try WavCodec.parse(Data(slice))
        #expect(info.dataLength == 400)
    }

    @Test func rejectsGarbage() {
        #expect(throws: WavCodec.WavError.notRIFF) {
            try WavCodec.parse(Data(repeating: 0xAA, count: 100))
        }
    }

    @Test func rejectsTruncated() {
        #expect(throws: WavCodec.WavError.tooShort) {
            try WavCodec.parse(Data("RIFF1234WAVE".utf8))
        }
    }

    @Test func rejectsWrongMagicAfterRIFF() {
        var wav = WavCodec.wrap(pcm: Data(count: 64))
        wav.replaceSubrange(8..<12, with: Data("AVI ".utf8))
        #expect(throws: WavCodec.WavError.notWAVE) {
            try WavCodec.parse(wav)
        }
    }

    @Test func rejectsNonPCMFormat() {
        var wav = WavCodec.wrap(pcm: Data(count: 64))
        wav[20] = 0x03 // IEEE float format tag
        #expect(throws: WavCodec.WavError.notPCM16(format: 3, bits: 16)) {
            try WavCodec.parse(wav)
        }
    }

    @Test func rejects8Bit() {
        var wav = WavCodec.wrap(pcm: Data(count: 64))
        wav[34] = 0x08 // bits per sample = 8
        #expect(throws: WavCodec.WavError.notPCM16(format: 1, bits: 8)) {
            try WavCodec.parse(wav)
        }
    }

    @Test func parsesNonCanonicalWavWithExtraChunk() throws {
        // RIFF / fmt / LIST(6 bytes) / data — what ffmpeg often emits.
        let pcm = Data(repeating: 0x11, count: 128)
        var wav = Data()
        wav.append(contentsOf: Array("RIFF".utf8))
        let riffSize = UInt32(4 + 24 + 14 + 8 + pcm.count)
        withUnsafeBytes(of: riffSize.littleEndian) { wav.append(contentsOf: $0) }
        wav.append(contentsOf: Array("WAVE".utf8))
        // canonical fmt chunk lifted from our own header builder
        let canonical = WavCodec.header(dataBytes: pcm.count)
        wav.append(canonical[12..<36]) // "fmt " + size + 16-byte body
        // LIST chunk with 6 bytes of junk
        wav.append(contentsOf: Array("LIST".utf8))
        withUnsafeBytes(of: UInt32(6).littleEndian) { wav.append(contentsOf: $0) }
        wav.append(Data(repeating: 0x00, count: 6))
        // data chunk
        wav.append(contentsOf: Array("data".utf8))
        withUnsafeBytes(of: UInt32(pcm.count).littleEndian) { wav.append(contentsOf: $0) }
        wav.append(pcm)

        let info = try WavCodec.parse(wav)
        #expect(info.sampleRate == 16_000)
        #expect(info.channels == 2)
        #expect(info.dataLength == pcm.count)
        #expect(WavCodec.pcmData(wav, info: info) == pcm)
    }
}
