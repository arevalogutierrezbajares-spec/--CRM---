import Foundation

/// Merges two mono Int16 16 kHz streams — mic (L) and system audio (R) — into
/// interleaved stereo frames on a wall-clock sample clock (FR-CALL-CAP-3).
///
/// Each side queues bytes as its capture callback delivers them. `pump(now:)`
/// emits exactly the number of frames the elapsed time dictates (minus a small
/// jitter cushion); a side with no queued data for that span is filled with
/// silence so the two channels stay time-aligned even when one source stalls
/// (e.g. SCStream restarting across an output-device switch, FR-CALL-CAP-5).
public final class StereoInterleaver {
    private let lock = NSLock()
    private var micQueue = Data()
    private var sysQueue = Data()
    private var startTime: TimeInterval?
    private var framesEmitted = 0

    public let sampleRate: Int
    /// Frames held back to absorb delivery jitter before declaring a side silent.
    public let cushionFrames: Int
    /// Per-side queue bound; overflow drops the *oldest* bytes (clock drift guard).
    public let maxQueueBytes: Int

    public init(sampleRate: Int = AudioConstants.sampleRate,
                cushionSeconds: Double = 0.5,
                maxQueueSeconds: Double = 5.0) {
        self.sampleRate = sampleRate
        self.cushionFrames = Int(cushionSeconds * Double(sampleRate))
        self.maxQueueBytes = Int(maxQueueSeconds * Double(sampleRate)) * 2
    }

    public func appendMic(_ monoPCM16: Data) {
        lock.lock(); defer { lock.unlock() }
        micQueue.append(monoPCM16)
        trim(&micQueue)
    }

    public func appendSystem(_ monoPCM16: Data) {
        lock.lock(); defer { lock.unlock() }
        sysQueue.append(monoPCM16)
        trim(&sysQueue)
    }

    /// Emit interleaved stereo bytes for the wall-clock time elapsed since the
    /// first pump, minus the jitter cushion. Returns empty Data when no frames
    /// are due yet.
    public func pump(now: TimeInterval) -> Data {
        lock.lock(); defer { lock.unlock() }
        if startTime == nil { startTime = now }
        guard let start = startTime else { return Data() }

        let target = Int((now - start) * Double(sampleRate)) - cushionFrames
        let frames = target - framesEmitted
        guard frames > 0 else { return Data() }
        return emit(frames: frames)
    }

    /// Emit everything still queued (call end): output length = the longer
    /// side, the shorter side padded with silence.
    public func flushRemaining() -> Data {
        lock.lock(); defer { lock.unlock() }
        let frames = max(micQueue.count, sysQueue.count) / 2
        guard frames > 0 else { return Data() }
        return emit(frames: frames)
    }

    /// Reset the clock and drop queued audio (new session / after decline).
    public func reset() {
        lock.lock(); defer { lock.unlock() }
        micQueue.removeAll()
        sysQueue.removeAll()
        startTime = nil
        framesEmitted = 0
    }

    // MARK: - Internals (call with lock held)

    private func emit(frames: Int) -> Data {
        let bytesPerSide = frames * 2
        var out = Data(count: frames * 4)

        out.withUnsafeMutableBytes { (dst: UnsafeMutableRawBufferPointer) in
            let stereo = dst.bindMemory(to: Int16.self)
            micQueue.withUnsafeBytes { (mic: UnsafeRawBufferPointer) in
                sysQueue.withUnsafeBytes { (sys: UnsafeRawBufferPointer) in
                    let micSamples = mic.bindMemory(to: Int16.self)
                    let sysSamples = sys.bindMemory(to: Int16.self)
                    let micAvail = micQueue.count / 2
                    let sysAvail = sysQueue.count / 2
                    for i in 0..<frames {
                        stereo[i * 2] = i < micAvail ? micSamples[i] : 0
                        stereo[i * 2 + 1] = i < sysAvail ? sysSamples[i] : 0
                    }
                }
            }
        }

        micQueue.removeFirst(min(bytesPerSide, micQueue.count))
        sysQueue.removeFirst(min(bytesPerSide, sysQueue.count))
        framesEmitted += frames
        return out
    }

    private func trim(_ queue: inout Data) {
        let overflow = queue.count - maxQueueBytes
        if overflow > 0 {
            queue.removeFirst(overflow)
        }
    }
}
