import Foundation

/// Tracks which notification ids have already been seen so banners only fire for
/// genuinely new ones. The first batch *primes* the set silently (returns no new
/// ids) — otherwise every existing unread would banner on launch. Pure + sync so
/// it's unit-testable without a network or a clock.
public struct NotificationDeduper {
    private var seen: Set<String> = []
    private var primed = false

    public init() {}

    /// Record `currentIDs` as seen and return the ids that are newly seen and
    /// should banner. Returns [] on the first call (priming).
    public mutating func newlySeen(_ currentIDs: [String]) -> [String] {
        if !primed {
            seen = Set(currentIDs)
            primed = true
            return []
        }
        let fresh = currentIDs.filter { !seen.contains($0) }
        seen.formUnion(currentIDs)
        return fresh
    }

    public var isPrimed: Bool { primed }
}

/// One poller for the whole Town Hall: every `interval` it fetches notifications
/// + posts and emits them to the UI, plus the *newly-arrived* notifications for
/// native banners. Mirrors UploadQueueWorker's `clientProvider` (config read
/// fresh each tick) and AppDelegate's main-RunLoop Timer pattern. All callbacks
/// fire on the main thread. Best-effort: a failed tick is logged and skipped,
/// the next tick retries.
public final class TownHallPoller {
    /// Builds a client from current config each tick (nil when unconfigured).
    private let clientProvider: () -> CaptureAPIClient?
    public var interval: TimeInterval

    /// Newly-arrived notifications since the last tick (for banners). Never the
    /// whole list, never on the priming tick.
    public var onNewNotifications: (([THNotification]) -> Void)?
    /// The full active inbox + unread count (for the badge + the section list).
    public var onNotifications: ((_ unread: Int, _ items: [THNotification]) -> Void)?
    /// The latest feed (for the Feed section).
    public var onPosts: (([Post]) -> Void)?

    private var deduper = NotificationDeduper()
    private var timer: Timer?
    private var ticking = false

    public init(interval: TimeInterval = 30, clientProvider: @escaping () -> CaptureAPIClient?) {
        self.interval = interval
        self.clientProvider = clientProvider
    }

    /// Start polling (idempotent). Fires one tick immediately.
    public func start() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        tick()
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// Force an immediate refresh (call after any mutation so the UI isn't stale).
    public func pokeNow() { tick() }

    private func tick() {
        guard !ticking, let client = clientProvider() else { return }
        ticking = true
        Task { @MainActor [weak self] in
            // Notifications + posts independently; one failing doesn't sink the other.
            async let notifsResult = try? client.getNotifications()
            async let postsResult = try? client.getPosts()
            let notifs = await notifsResult
            let posts = await postsResult

            guard let self else { return }
            self.ticking = false
            if let notifs {
                let fresh = self.deduper.newlySeen(notifs.items.map { $0.id })
                self.onNotifications?(notifs.unread, notifs.items)
                if !fresh.isEmpty {
                    let freshSet = Set(fresh)
                    let freshItems = notifs.items.filter { freshSet.contains($0.id) }
                    if !freshItems.isEmpty { self.onNewNotifications?(freshItems) }
                }
            }
            if let posts { self.onPosts?(posts) }
        }
    }
}
