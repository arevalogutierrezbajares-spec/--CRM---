import Foundation

/// Build a mono 16 kHz WAV (channel L only) from stereo spool chunks for
/// local free diarization (in-person meetings). Streaming — never holds the
/// whole call in RAM.
public enum MonoWavAssembler {

    public enum AssemblerError: Error, LocalizedError {
        case noAudio
        case io(String)
        public var errorDescription: String? {
            switch self {
            case .noAudio: return "No audio chunks to assemble"
            case .io(let m): return m
            }
        }
    }

    /// Write mono WAV to `dest`. Returns dest on success.
    @discardableResult
    public static func assembleLeftChannel(spooler: ChunkSpooler, dest: URL) throws -> URL {
        let snap = spooler.snapshot
        guard !snap.seqsWritten.isEmpty else { throw AssemblerError.noAudio }

        try WavCodec.header(dataBytes: 0, channels: 1).write(to: dest)
        let handle = try FileHandle(forWritingTo: dest)
        defer { try? handle.close() }
        try handle.seekToEnd()

        var monoBytes = 0
        for seq in snap.seqsWritten.sorted() {
            let url = spooler.chunkURL(seq: seq)
            guard let data = FileManager.default.contents(atPath: url.path),
                  let info = try? WavCodec.parse(data) else { continue }
            let pcm = WavCodec.pcmData(data, info: info)
            if pcm.isEmpty { continue }
            let mono = extractLeft(pcm: pcm, channels: info.channels)
            if mono.isEmpty { continue }
            try handle.write(contentsOf: mono)
            monoBytes += mono.count
        }
        guard monoBytes > 0 else { throw AssemblerError.noAudio }
        try handle.seek(toOffset: 0)
        try handle.write(contentsOf: WavCodec.header(dataBytes: monoBytes, channels: 1))
        return dest
    }

    /// Interleaved stereo Int16 → mono L channel bytes.
    public static func extractLeft(pcm: Data, channels: Int) -> Data {
        if channels <= 1 { return pcm }
        let samples = pcm.count / 2
        let frames = samples / channels
        guard frames > 0 else { return Data() }
        var out = Data(count: frames * 2)
        out.withUnsafeMutableBytes { dst in
            let outS = dst.bindMemory(to: Int16.self)
            pcm.withUnsafeBytes { src in
                let inS = src.bindMemory(to: Int16.self)
                for i in 0..<frames {
                    outS[i] = inS[i * channels] // L = first channel
                }
            }
        }
        return out
    }
}
