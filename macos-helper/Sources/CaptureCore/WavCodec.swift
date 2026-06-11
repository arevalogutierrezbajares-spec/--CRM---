import Foundation

/// Canonical 44-byte PCM WAV header building + parsing (pure functions).
///
/// The wire contract (CALL-CAPTURE-PROTOCOL.md) requires every chunk to be a
/// standalone valid WAV file with a *canonical* 44-byte header (PCM fmt chunk,
/// no extra chunks) — the server strips exactly 44 bytes and concatenates PCM.
public enum WavCodec {

    public struct Info: Equatable {
        public let sampleRate: Int
        public let channels: Int
        public let bitsPerSample: Int
        /// Byte offset where PCM data begins.
        public let dataOffset: Int
        /// Length of the PCM data in bytes.
        public let dataLength: Int

        public var frameCount: Int {
            let blockAlign = channels * (bitsPerSample / 8)
            guard blockAlign > 0 else { return 0 }
            return dataLength / blockAlign
        }

        public var durationSeconds: Double {
            guard sampleRate > 0 else { return 0 }
            return Double(frameCount) / Double(sampleRate)
        }
    }

    public enum WavError: Error, LocalizedError, Equatable {
        case tooShort
        case notRIFF
        case notWAVE
        case missingFmtChunk
        case missingDataChunk
        case notPCM16(format: Int, bits: Int)
        case malformed(String)

        public var errorDescription: String? {
            switch self {
            case .tooShort: return "WAV data shorter than a 44-byte header"
            case .notRIFF: return "Missing RIFF magic"
            case .notWAVE: return "Missing WAVE magic"
            case .missingFmtChunk: return "No fmt chunk found"
            case .missingDataChunk: return "No data chunk found"
            case .notPCM16(let f, let b): return "Not PCM16 (format tag \(f), \(b) bits)"
            case .malformed(let why): return "Malformed WAV: \(why)"
            }
        }
    }

    // MARK: - Building

    /// Build the canonical 44-byte header for a PCM16 payload of `dataBytes` bytes.
    public static func header(dataBytes: Int,
                              sampleRate: Int = AudioConstants.sampleRate,
                              channels: Int = AudioConstants.channels,
                              bitsPerSample: Int = AudioConstants.bitsPerSample) -> Data {
        let byteRate = sampleRate * channels * (bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)

        var d = Data(capacity: 44)
        d.append(contentsOf: Array("RIFF".utf8))
        appendUInt32LE(&d, UInt32(clamping: 36 + dataBytes))     // RIFF chunk size
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8))
        appendUInt32LE(&d, 16)                                   // fmt chunk size (PCM)
        appendUInt16LE(&d, 1)                                    // audio format = PCM
        appendUInt16LE(&d, UInt16(channels))
        appendUInt32LE(&d, UInt32(sampleRate))
        appendUInt32LE(&d, UInt32(byteRate))
        appendUInt16LE(&d, UInt16(blockAlign))
        appendUInt16LE(&d, UInt16(bitsPerSample))
        d.append(contentsOf: Array("data".utf8))
        appendUInt32LE(&d, UInt32(clamping: dataBytes))
        return d
    }

    /// Wrap raw interleaved PCM16 bytes into a standalone WAV chunk file body.
    public static func wrap(pcm: Data,
                            sampleRate: Int = AudioConstants.sampleRate,
                            channels: Int = AudioConstants.channels,
                            bitsPerSample: Int = AudioConstants.bitsPerSample) -> Data {
        var out = header(dataBytes: pcm.count,
                         sampleRate: sampleRate,
                         channels: channels,
                         bitsPerSample: bitsPerSample)
        out.append(pcm)
        return out
    }

    // MARK: - Parsing

    /// Parse + validate a WAV header. Tolerates non-canonical files (extra
    /// chunks such as LIST/INFO before the data chunk) so simulate mode can
    /// read WAVs from ffmpeg etc. Requires PCM (format tag 1), 16-bit.
    public static func parse(_ data: Data) throws -> Info {
        guard data.count >= 44 else { throw WavError.tooShort }
        guard fourCC(data, at: 0) == "RIFF" else { throw WavError.notRIFF }
        guard fourCC(data, at: 8) == "WAVE" else { throw WavError.notWAVE }

        var offset = 12
        var fmt: (format: Int, channels: Int, sampleRate: Int, bits: Int)?
        var dataRange: (offset: Int, length: Int)?

        while offset + 8 <= data.count {
            let id = fourCC(data, at: offset)
            let size = Int(readUInt32LE(data, at: offset + 4))
            let body = offset + 8

            if id == "fmt " {
                guard size >= 16, body + 16 <= data.count else {
                    throw WavError.malformed("fmt chunk truncated")
                }
                fmt = (
                    format: Int(readUInt16LE(data, at: body)),
                    channels: Int(readUInt16LE(data, at: body + 2)),
                    sampleRate: Int(readUInt32LE(data, at: body + 4)),
                    bits: Int(readUInt16LE(data, at: body + 14))
                )
            } else if id == "data" {
                let available = data.count - body
                // Some writers leave a 0 / 0xFFFFFFFF placeholder size; clamp.
                let length = (size == 0 || size > available) ? available : size
                dataRange = (offset: body, length: length)
                break // data is the payload; stop scanning
            }

            // Chunks are word-aligned (pad byte after odd sizes).
            offset = body + size + (size % 2)
            if size <= 0 && id != "data" {
                throw WavError.malformed("zero/negative chunk size for '\(id)'")
            }
        }

        guard let f = fmt else { throw WavError.missingFmtChunk }
        guard let dr = dataRange else { throw WavError.missingDataChunk }
        guard f.format == 1, f.bits == 16 else {
            throw WavError.notPCM16(format: f.format, bits: f.bits)
        }
        guard f.channels > 0, f.sampleRate > 0 else {
            throw WavError.malformed("channels=\(f.channels) sampleRate=\(f.sampleRate)")
        }

        return Info(sampleRate: f.sampleRate,
                    channels: f.channels,
                    bitsPerSample: f.bits,
                    dataOffset: dr.offset,
                    dataLength: dr.length)
    }

    /// Extract the PCM payload of a parsed WAV.
    public static func pcmData(_ data: Data, info: Info) -> Data {
        let start = data.startIndex + info.dataOffset
        let end = min(start + info.dataLength, data.endIndex)
        guard start < end else { return Data() }
        return Data(data[start..<end])
    }

    // MARK: - Little-endian helpers

    private static func appendUInt32LE(_ d: inout Data, _ v: UInt32) {
        d.append(UInt8(truncatingIfNeeded: v))
        d.append(UInt8(truncatingIfNeeded: v >> 8))
        d.append(UInt8(truncatingIfNeeded: v >> 16))
        d.append(UInt8(truncatingIfNeeded: v >> 24))
    }

    private static func appendUInt16LE(_ d: inout Data, _ v: UInt16) {
        d.append(UInt8(truncatingIfNeeded: v))
        d.append(UInt8(truncatingIfNeeded: v >> 8))
    }

    private static func readUInt32LE(_ d: Data, at offset: Int) -> UInt32 {
        let i = d.startIndex + offset
        return UInt32(d[i]) | (UInt32(d[i + 1]) << 8) | (UInt32(d[i + 2]) << 16) | (UInt32(d[i + 3]) << 24)
    }

    private static func readUInt16LE(_ d: Data, at offset: Int) -> UInt16 {
        let i = d.startIndex + offset
        return UInt16(d[i]) | (UInt16(d[i + 1]) << 8)
    }

    private static func fourCC(_ d: Data, at offset: Int) -> String {
        let i = d.startIndex + offset
        guard i + 4 <= d.endIndex else { return "" }
        return String(bytes: d[i..<(i + 4)], encoding: .ascii) ?? ""
    }
}
