import Foundation
import Testing
@testable import CaptureCore

@Suite struct RingBufferTests {

    @Test func appendThenDrainReturnsSameBytes() {
        let ring = RingBuffer(capacity: 64)
        let payload = Data([1, 2, 3, 4, 5])
        ring.append(payload)
        #expect(ring.count == 5)
        #expect(ring.drainAll() == payload)
        #expect(ring.count == 0)
    }

    @Test func wrapKeepsOnlyMostRecentCapacityBytes() {
        let ring = RingBuffer(capacity: 10)
        ring.append(Data([1, 2, 3, 4]))                // 4 stored
        ring.append(Data([5, 6, 7, 8, 9, 10, 11, 12])) // 12 total → oldest 2 dropped
        #expect(ring.count == 10)
        #expect(ring.drainAll() == Data([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
    }

    @Test func singleAppendLargerThanCapacityKeepsTail() {
        let ring = RingBuffer(capacity: 8)
        ring.append(Data(0...19)) // 20 bytes
        #expect(ring.count == 8)
        #expect(ring.drainAll() == Data(12...19))
    }

    @Test func wrapAroundAcrossManySmallAppends() {
        let ring = RingBuffer(capacity: 7)
        for value in 0..<50 {
            ring.append(Data([UInt8(value)]))
        }
        #expect(ring.drainAll() == Data((43...49).map { UInt8($0) }))
    }

    @Test func clearDropsEverything() {
        let ring = RingBuffer(capacity: 16)
        ring.append(Data(repeating: 0xAB, count: 12))
        ring.clear()
        #expect(ring.count == 0)
        #expect(ring.drainAll().isEmpty)
    }

    @Test func drainOnEmptyReturnsEmpty() {
        let ring = RingBuffer(capacity: 4)
        #expect(ring.drainAll().isEmpty)
    }

    @Test func preRollDefaultCapacityIs60Seconds() {
        #expect(RingBuffer().capacity == 3_840_000)
    }

    @Test func threadSafetySmoke() {
        let ring = RingBuffer(capacity: 4096)
        let group = DispatchGroup()
        let queue = DispatchQueue.global(qos: .userInitiated)

        for worker in 0..<8 {
            group.enter()
            queue.async {
                for i in 0..<500 {
                    ring.append(Data(repeating: UInt8(worker), count: (i % 64) + 1))
                    if i % 97 == 0 { _ = ring.drainAll() }
                    if i % 131 == 0 { ring.clear() }
                }
                group.leave()
            }
        }
        #expect(group.wait(timeout: .now() + 30) == .success)
        #expect(ring.count <= 4096)
        #expect(ring.drainAll().count <= 4096)
    }
}
