import AppKit
import CaptureCore

/// The Notifications inbox: active (unread, unsnoozed) notifications with a kind
/// icon, an unread dot, and per-row Open / Mark read / Snooze (a menu chip).
/// Items arrive via the poller (`apply(items:)`).
final class NotificationsSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var items: [THNotification] = []
    private let (scroll, table) = thMakeTable()
    private lazy var empty = thEmptyState(symbol: "checkmark.circle",
                                          title: "All caught up",
                                          subtitle: "No new notifications.")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        table.dataSource = self
        table.delegate = self

        let title = thSectionLabel("NOTIFICATIONS")
        let markAll = THButton(title: "Mark all read", style: .plain, symbol: "checkmark",
                               target: self, action: #selector(markAll))
        let header = NSStackView(views: [title, NSView(), markAll])
        header.orientation = .horizontal
        header.alignment = .centerY

        empty.translatesAutoresizingMaskIntoConstraints = false
        installStandardLayout(header: header, body: scroll)
        scroll.addSubview(empty)
        NSLayoutConstraint.activate([
            empty.centerXAnchor.constraint(equalTo: scroll.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: scroll.centerYAnchor),
        ])
    }

    func apply(items: [THNotification]) {
        self.items = items
        empty.isHidden = !items.isEmpty
        table.reloadData()
    }

    override func reload() {
        run { [weak self] client in
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
        }
    }

    @objc private func markAll() {
        let ids = items.map { $0.id }
        guard !ids.isEmpty else { return }
        apply(items: [])
        run { [weak self] client in
            for id in ids { try await client.markNotificationRead(id: id) }
            self?.onMutation?()
        }
    }

    @objc private func markRead(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < items.count else { return }
        let id = items[sender.tag].id
        run { [weak self] client in
            try await client.markNotificationRead(id: id)
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
            self?.onMutation?()
        }
    }

    @objc private func openItem(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < items.count else { return }
        let href = items[sender.tag].href ?? "/town-hall"
        guard let client = clientProvider() else { return }
        let full = client.baseURL.appendingPathComponent(href.hasPrefix("/") ? String(href.dropFirst()) : href)
        NSWorkspace.shared.open(full)
    }

    private func snoozePicked(_ row: Int, _ idx: Int) {
        guard row >= 0 && row < items.count else { return }
        let id = items[row].id
        let until: Date
        switch idx {
        case 1: until = Date().addingTimeInterval(3600)
        case 2: until = Date().addingTimeInterval(86400)
        case 3: until = Date().addingTimeInterval(7 * 86400)
        default: return
        }
        run { [weak self] client in
            try await client.snoozeNotification(id: id, until: until)
            let res = try await client.getNotifications()
            self?.apply(items: res.items)
            self?.onMutation?()
        }
    }

    private func symbol(for kind: String?) -> String {
        switch kind {
        case "mention": return "at"
        case "assignment": return "person.crop.circle.badge.checkmark"
        default: return "bell.fill"
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { items.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let n = items[row]
        let cell = NSTableCellView()

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: symbol(for: n.kind), accessibilityDescription: nil)
        icon.symbolConfiguration = .init(pointSize: 14, weight: .medium)
        icon.contentTintColor = n.read ? .tertiaryLabelColor : .controlAccentColor
        icon.translatesAutoresizingMaskIntoConstraints = false

        let title = thBodyLabel(n.headline, weight: n.read ? .regular : .semibold)
        let meta = thMetaLabel(thRelativeTime(n.createdAt))

        let open = THButton(title: "Open", style: .plain, target: self, action: #selector(openItem(_:)))
        open.tag = row
        let read = THButton(title: "Mark read", style: .plain, target: self, action: #selector(markRead(_:)))
        read.tag = row
        let snooze = THMenuButton(symbol: "clock")
        snooze.setTitles(["Snooze", "1 hour", "Tomorrow", "Next week"])
        snooze.resetsAfterSelect = true
        snooze.onSelect = { [weak self] idx in self?.snoozePicked(row, idx) }

        let actions = NSStackView(views: [open, read, snooze])
        actions.orientation = .horizontal
        actions.spacing = 4

        let content = NSStackView(views: [title, meta, actions])
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 4
        content.setCustomSpacing(7, after: meta)
        content.translatesAutoresizingMaskIntoConstraints = false

        cell.addSubview(icon)
        cell.addSubview(content)
        NSLayoutConstraint.activate([
            icon.topAnchor.constraint(equalTo: cell.topAnchor, constant: 12),
            icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 12),
            icon.widthAnchor.constraint(equalToConstant: 18),
            content.topAnchor.constraint(equalTo: cell.topAnchor, constant: 9),
            content.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -9),
            content.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 11),
            content.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12),
        ])
        return cell
    }
}
