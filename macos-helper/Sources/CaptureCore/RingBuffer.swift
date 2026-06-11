import Foundation

/// Fixed-capacity byte ring buffer used for the 60 s pre-roll (FR-CALL-TRG-3).
///
/// Audio bytes are appended continuously while a detection prompt is pending.
/// - On affirm: `drainAll()` hands the buffered pre-roll to the spooler.
/// - On decline/timeout: `clear()` drops everything — bytes only ever lived in
///   memory, satisfying NFR-CALL-PRIV-2 (zero persisted artifacts).
///
/// Thread-safe: all operations take an internal lock. Appending more bytes than
/// `capacity` silently discards the oldest bytes (only the most recent
/// `capacity` bytes are retained).
public final class RingBuffer {
    private let lock = NSLock()
    private var storage: [UInt8]
    /// Index of the oldest byte.
    private var head = 0
    /// Number of valid bytes currently stored.
    private var stored = 0

    public let capacity: Int

    public init(capacity: Int = AudioConstants.preRollBytes) {
        precondition(capacity > 0, "RingBuffer capacity must be positive")
        self.capacity = capacity
        self.storage = [UInt8](repeating: 0, count: capacity)
    }

    /// Number of bytes currently buffered.
    public var count: Int {
        lock.lock(); defer { lock.unlock() }
        return stored
    }

    public var isEmpty: Bool { count == 0 }

    /// Append bytes, overwriting the oldest data when the buffer is full.
    public func append(_ data: Data) {
        guard !data.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }

        // If the incoming block alone exceeds capacity, only its tail survives.
        if data.count >= capacity {
            data.suffix(capacity).withUnsafeBytes { src in
                storage.withUnsafeMutableBytes { dst in
                    dst.copyMemory(from: src)
                }
            }
            head = 0
            stored = capacity
            return
        }

        var writeIndex = (head + stored) % capacity
        data.withUnsafeBytes { (src: UnsafeRawBufferPointer) in
            var offset = 0
            let total = src.count
            while offset < total {
                let run = min(total - offset, capacity - writeIndex)
                storage.withUnsafeMutableBytes { dst in
                    _ = memcpy(dst.baseAddress!.advanced(by: writeIndex),
                               src.baseAddress!.advanced(by: offset),
                               run)
                }
                writeIndex = (writeIndex + run) % capacity
                offset += run
            }
        }

        let overflow = (stored + data.count) - capacity
        if overflow > 0 {
            head = (head + overflow) % capacity
            stored = capacity
        } else {
            stored += data.count
        }
    }

    /// Remove and return everything buffered, oldest byte first.
    public func drainAll() -> Data {
        lock.lock(); defer { lock.unlock() }
        guard stored > 0 else { return Data() }

        var out = Data(capacity: stored)
        let firstRun = min(stored, capacity - head)
        out.append(contentsOf: storage[head..<(head + firstRun)])
        if firstRun < stored {
            out.append(contentsOf: storage[0..<(stored - firstRun)])
        }
        head = 0
        stored = 0
        return out
    }

    /// Drop everything without returning it (declined / timed-out prompt).
    public func clear() {
        lock.lock(); defer { lock.unlock() }
        head = 0
        stored = 0
    }
}
