import AppKit
import CaptureCore

/// Clean card inbox — no fragile multi-constraint table cells.
/// Each row is a self-contained card: accent bar, icon, title, body, time, actions.
final class NotificationsSectionView: TownHallSectionView {

    private var items: [THNotification] = []
    private let scroll = NSScrollView()
    private let stack = NSStackView()
    private lazy var empty = thEmptyState(
        symbol: "bell",
        title: "All caught up",
        subtitle: "Mentions and assignments will land here."
    )
    private let documentView = FlippedView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        let title = thSectionLabel("NOTIFICATIONS")
        let markAll = THButton(title: "Mark all read", style: .secondary, symbol: "checkmark",
                               target: self, action: #selector(markAll))
        let openCRM = THButton(title: "Inbox in CRM", style: .plain, symbol: "arrow.up.right",
                               target: self, action: #selector(openCRMInbox))
        let header = NSStackView(views: [title, NSView(), openCRM, markAll])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8
        header.translatesAutoresizingMaskIntoConstraints = false

        stack.orientation = .vertical
        stack.alignment = .width
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 4, left: 0, bottom: 12, right: 0)
        stack.translatesAutoresizingMaskIntoConstraints = false

        documentView.translatesAutoresizingMaskIntoConstraints = false
        documentView.addSubview(stack)
        documentView.addSubview(empty)
        empty.translatesAutoresizingMaskIntoConstraints = false

        scroll.documentView = documentView
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false
        // Match scroll width to content (standard pattern for stack-in-scroll)
        scroll.contentView.postsBoundsChangedNotifications = true

        addSubview(header)
        addSubview(scroll)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),

            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),

            stack.topAnchor.constraint(equalTo: documentView.topAnchor),
            stack.leadingAnchor.constraint(equalTo: documentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: documentView.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: documentView.bottomAnchor),
            stack.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor, constant: -4),

            empty.centerXAnchor.constraint(equalTo: documentView.centerXAnchor),
            empty.topAnchor.constraint(equalTo: documentView.topAnchor, constant: 48),
        ])
    }

    func apply(items: [THNotification]) {
        self.items = items
        empty.isHidden = !items.isEmpty
        rebuildCards()
    }

    override func reload() {
        run { [weak self] client in
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
        }
    }

    private func rebuildCards() {
        stack.arrangedSubviews.forEach {
            stack.removeArrangedSubview($0)
            $0.removeFromSuperview()
        }
        for (i, n) in items.enumerated() {
            let card = NotificationCardView(notification: n, index: i)
            card.onOpen = { [weak self] idx in self?.openNotification(at: idx) }
            card.onMarkRead = { [weak self] idx in self?.markRead(at: idx) }
            card.onSnooze = { [weak self] idx, hours in self?.snooze(at: idx, hours: hours) }
            stack.addArrangedSubview(card)
        }
    }

    // MARK: - Actions

    @objc private func openCRMInbox() {
        if let url = HelperConfig.effective().crmWebURL(path: "/inbox")
            ?? HelperConfig.effective().crmWebURL(path: "/town-hall") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func markAll() {
        let ids = items.map(\.id)
        guard !ids.isEmpty else { return }
        apply(items: [])
        run { [weak self] client in
            for id in ids { try await client.markNotificationRead(id: id) }
            self?.onMutation?()
        }
    }

    private func openNotification(at row: Int) {
        guard row >= 0, row < items.count else { return }
        let n = items[row]
        let path = n.href ?? "/town-hall"
        if let url = HelperConfig.effective().crmWebURL(path: path) {
            NSWorkspace.shared.open(url)
        }
        if !n.read {
            markRead(at: row)
        }
    }

    private func markRead(at row: Int) {
        guard row >= 0, row < items.count else { return }
        let id = items[row].id
        run { [weak self] client in
            try await client.markNotificationRead(id: id)
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
            self?.onMutation?()
        }
    }

    private func snooze(at row: Int, hours: Double) {
        guard row >= 0, row < items.count else { return }
        let id = items[row].id
        let until = Date().addingTimeInterval(hours * 3600)
        run { [weak self] client in
            try await client.snoozeNotification(id: id, until: until)
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
            self?.onMutation?()
        }
    }
}

// MARK: - Card

/// One notification as a rounded card — designed for readability, not density.
private final class NotificationCardView: NSView {
    var onOpen: ((Int) -> Void)?
    var onMarkRead: ((Int) -> Void)?
    var onSnooze: ((Int, Double) -> Void)?

    private let index: Int
    private var hovering = false

    init(notification n: THNotification, index: Int) {
        self.index = index
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        wantsLayer = true
        layer?.cornerRadius = 12
        layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(n.read ? 0.03 : 0.055).cgColor

        let unread = !n.read
        let tint = Self.tint(for: n.kind)

        // Unread bar
        let bar = NSView()
        bar.wantsLayer = true
        bar.layer?.cornerRadius = 2
        bar.layer?.backgroundColor = unread ? NSColor.controlAccentColor.cgColor : NSColor.clear.cgColor
        bar.translatesAutoresizingMaskIntoConstraints = false

        // Icon well
        let well = NSView()
        well.wantsLayer = true
        well.layer?.cornerRadius = 18
        well.layer?.backgroundColor = tint.withAlphaComponent(0.16).cgColor
        well.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: Self.symbol(for: n.kind), accessibilityDescription: n.kind)
        icon.symbolConfiguration = .init(pointSize: 14, weight: .semibold)
        icon.contentTintColor = tint
        icon.translatesAutoresizingMaskIntoConstraints = false
        well.addSubview(icon)

        let title = NSTextField(wrappingLabelWithString: n.headline)
        title.font = .systemFont(ofSize: 13.5, weight: unread ? .semibold : .medium)
        title.textColor = .labelColor
        title.maximumNumberOfLines = 2
        title.translatesAutoresizingMaskIntoConstraints = false

        let bodyText: String = {
            if let body = n.body?.trimmingCharacters(in: .whitespacesAndNewlines),
               !body.isEmpty, body != n.headline {
                return body
            }
            if let author = n.authorName, !author.isEmpty { return author }
            return (n.kind ?? "Update").replacingOccurrences(of: "_", with: " ").capitalized
        }()
        let body = NSTextField(wrappingLabelWithString: bodyText)
        body.font = .systemFont(ofSize: 12)
        body.textColor = .secondaryLabelColor
        body.maximumNumberOfLines = 2
        body.translatesAutoresizingMaskIntoConstraints = false

        let time = NSTextField(labelWithString: thRelativeTime(n.createdAt))
        time.font = .systemFont(ofSize: 11, weight: .medium)
        time.textColor = unread ? .controlAccentColor : .tertiaryLabelColor
        time.translatesAutoresizingMaskIntoConstraints = false

        let openBtn = THButton(title: "Open", style: .secondary, symbol: nil,
                               target: self, action: #selector(openTapped))
        let readBtn = THButton(title: unread ? "Mark read" : "Read", style: .plain, symbol: nil,
                               target: self, action: #selector(readTapped))
        readBtn.isEnabled = unread

        let snoozeBtn = THMenuButton(symbol: "moon.zzz")
        snoozeBtn.setTitles(["Snooze", "1 hour", "Tomorrow", "Next week"])
        snoozeBtn.resetsAfterSelect = true
        snoozeBtn.maxWidth = 100
        snoozeBtn.onSelect = { [weak self] idx in
            guard let self else { return }
            let hours: Double
            switch idx {
            case 1: hours = 1
            case 2: hours = 24
            case 3: hours = 168
            default: return
            }
            self.onSnooze?(self.index, hours)
        }

        let actions = NSStackView(views: [openBtn, readBtn, snoozeBtn, NSView()])
        actions.orientation = .horizontal
        actions.spacing = 6
        actions.alignment = .centerY
        actions.translatesAutoresizingMaskIntoConstraints = false

        let textCol = NSStackView(views: [title, body, actions])
        textCol.orientation = .vertical
        textCol.alignment = .leading
        textCol.spacing = 4
        textCol.setCustomSpacing(8, after: body)
        textCol.translatesAutoresizingMaskIntoConstraints = false

        addSubview(bar)
        addSubview(well)
        addSubview(textCol)
        addSubview(time)

        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: 88),

            bar.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            bar.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            bar.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
            bar.widthAnchor.constraint(equalToConstant: 3),

            well.leadingAnchor.constraint(equalTo: bar.trailingAnchor, constant: 12),
            well.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            well.widthAnchor.constraint(equalToConstant: 36),
            well.heightAnchor.constraint(equalToConstant: 36),
            icon.centerXAnchor.constraint(equalTo: well.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: well.centerYAnchor),

            time.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            time.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),

            textCol.leadingAnchor.constraint(equalTo: well.trailingAnchor, constant: 12),
            textCol.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            textCol.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            textCol.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
            textCol.trailingAnchor.constraint(lessThanOrEqualTo: time.leadingAnchor, constant: -8),
        ])
    }

    required init?(coder: NSCoder) { fatalError("unused") }

    @objc private func openTapped() { onOpen?(index) }
    @objc private func readTapped() { onMarkRead?(index) }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeInActiveApp, .mouseEnteredAndExited, .inVisibleRect],
            owner: self
        ))
    }

    override func mouseEntered(with event: NSEvent) {
        hovering = true
        layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.08).cgColor
    }

    override func mouseExited(with event: NSEvent) {
        hovering = false
        layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.04).cgColor
    }

    override func mouseUp(with event: NSEvent) {
        // Click empty card area opens; buttons handle their own clicks.
        let loc = convert(event.locationInWindow, from: nil)
        // If click was on a button subview tree, ignore
        if hitTest(loc) is NSButton || hitTest(loc) is THButton || hitTest(loc) is THMenuButton {
            return
        }
        // Only open if not on nested controls
        var v: NSView? = hitTest(loc)
        while let cur = v {
            if cur is THButton || cur is THMenuButton || cur is NSButton { return }
            v = cur.superview
            if v === self { break }
        }
        onOpen?(index)
    }

    private static func symbol(for kind: String?) -> String {
        switch kind {
        case "mention": return "at"
        case "assignment": return "person.fill"
        case "comment": return "text.bubble.fill"
        case "reaction": return "hand.thumbsup.fill"
        default: return "bell.fill"
        }
    }

    private static func tint(for kind: String?) -> NSColor {
        switch kind {
        case "mention": return .systemPurple
        case "assignment": return .systemBlue
        case "comment": return .systemTeal
        case "reaction": return .systemOrange
        default: return .controlAccentColor
        }
    }
}

/// Document view with top-left origin so stack grows downward in scroll views.
private final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}
