import AppKit
import CaptureCore

/// The Town Hall experience as an embeddable NSView — sidebar nav + content +
/// a bottom status/CRM strip. Poller pushes feed, notifications, and action items.
final class TownHallPane: NSView {

    enum Section: String, CaseIterable {
        case feed, calls, notifications, actionItems, files, notes
        var title: String {
            switch self {
            case .feed: return "Feed"
            case .calls: return "Calls"
            case .notifications: return "Notifications"
            case .actionItems: return "Action Items"
            case .files: return "Files"
            case .notes: return "Notes"
            }
        }
        var symbol: String {
            switch self {
            case .feed: return "bubble.left.and.bubble.right.fill"
            case .calls: return "waveform"
            case .notifications: return "bell.fill"
            case .actionItems: return "checklist"
            case .files: return "folder.fill"
            case .notes: return "note.text"
            }
        }
        /// Web path for “Open in CRM” (one-way deep link).
        var crmPath: String {
            switch self {
            case .feed: return "/town-hall"
            case .calls: return "/meetings"
            case .notifications: return "/inbox"
            case .actionItems: return "/dashboard"
            case .files: return "/town-hall"
            case .notes: return "/town-hall"
            }
        }
    }

    var clientProvider: () -> CaptureAPIClient? = { nil } {
        didSet { sectionViews.forEach { $0.clientProvider = clientProvider } }
    }
    var onMutation: (() -> Void)?
    var onError: ((String) -> Void)? {
        didSet { sectionViews.forEach { $0.onError = onError } }
    }
    /// Compact-panel badge: unread notifications.
    var onUnreadChange: ((Int) -> Void)?

    private let feed = FeedSectionView()
    private let calls = CallsSectionView()
    private let notifications = NotificationsSectionView()
    private let actionItems = ActionItemsSectionView()
    private let files = FilesSectionView()
    private let notes = NotesSectionView()
    private var sectionViews: [TownHallSectionView] { [feed, calls, notifications, actionItems, files, notes] }

    private var navItems: [Section: SidebarItem] = [:]
    private let contentContainer = NSView()
    private var current: Section = .feed

    // Footer: sync status + Open in CRM (Apple-caliber chrome)
    private let statusDot = NSView()
    private let statusLabel = NSTextField(labelWithString: "Not synced yet")
    private let openCRMButton = THButton(title: "Open in CRM", style: .plain, symbol: "arrow.up.right")

    private var lobs: [LobRef] = []
    private var projects: [ProjectRef] = []
    private var members: [MemberRef] = []
    private var pickersLoaded = false
    private var lastSyncAt: Date?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    // MARK: - Build

    private func build() {
        wantsLayer = true

        let sidebar = NSVisualEffectView()
        sidebar.material = .sidebar
        sidebar.blendingMode = .behindWindow
        sidebar.state = .active
        sidebar.translatesAutoresizingMaskIntoConstraints = false

        let nav = NSStackView()
        nav.orientation = .vertical
        nav.alignment = .leading
        nav.spacing = 2
        nav.translatesAutoresizingMaskIntoConstraints = false

        for section in Section.allCases {
            let item = SidebarItem(symbol: section.symbol, title: section.title)
            item.onSelect = { [weak self] in self?.select(section) }
            navItems[section] = item
            nav.addArrangedSubview(item)
            item.widthAnchor.constraint(equalTo: nav.widthAnchor).isActive = true
        }

        sidebar.addSubview(nav)
        NSLayoutConstraint.activate([
            nav.topAnchor.constraint(equalTo: sidebar.topAnchor, constant: 10),
            nav.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor, constant: 8),
            nav.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: -8),
        ])

        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false

        contentContainer.translatesAutoresizingMaskIntoConstraints = false

        // Footer strip
        let footer = NSView()
        footer.wantsLayer = true
        footer.layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.04).cgColor
        footer.translatesAutoresizingMaskIntoConstraints = false

        statusDot.wantsLayer = true
        statusDot.layer?.cornerRadius = 3.5
        statusDot.layer?.backgroundColor = NSColor.tertiaryLabelColor.cgColor
        statusDot.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.font = .systemFont(ofSize: 11, weight: .regular)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        openCRMButton.target = self
        openCRMButton.action = #selector(openCurrentInCRM)
        openCRMButton.translatesAutoresizingMaskIntoConstraints = false

        let footerHairline = NSBox()
        footerHairline.boxType = .separator
        footerHairline.translatesAutoresizingMaskIntoConstraints = false

        footer.addSubview(statusDot)
        footer.addSubview(statusLabel)
        footer.addSubview(openCRMButton)

        addSubview(sidebar)
        addSubview(separator)
        addSubview(contentContainer)
        addSubview(footerHairline)
        addSubview(footer)

        NSLayoutConstraint.activate([
            sidebar.topAnchor.constraint(equalTo: topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: bottomAnchor),
            sidebar.leadingAnchor.constraint(equalTo: leadingAnchor),
            sidebar.widthAnchor.constraint(equalToConstant: 168),

            separator.topAnchor.constraint(equalTo: topAnchor),
            separator.bottomAnchor.constraint(equalTo: bottomAnchor),
            separator.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
            separator.widthAnchor.constraint(equalToConstant: 1),

            contentContainer.topAnchor.constraint(equalTo: topAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: separator.trailingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: footerHairline.topAnchor),

            footerHairline.leadingAnchor.constraint(equalTo: separator.trailingAnchor),
            footerHairline.trailingAnchor.constraint(equalTo: trailingAnchor),
            footerHairline.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footerHairline.heightAnchor.constraint(equalToConstant: 1),

            footer.leadingAnchor.constraint(equalTo: separator.trailingAnchor),
            footer.trailingAnchor.constraint(equalTo: trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: bottomAnchor),
            footer.heightAnchor.constraint(equalToConstant: 32),

            statusDot.leadingAnchor.constraint(equalTo: footer.leadingAnchor, constant: 14),
            statusDot.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            statusDot.widthAnchor.constraint(equalToConstant: 7),
            statusDot.heightAnchor.constraint(equalToConstant: 7),

            statusLabel.leadingAnchor.constraint(equalTo: statusDot.trailingAnchor, constant: 8),
            statusLabel.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: openCRMButton.leadingAnchor, constant: -8),

            openCRMButton.trailingAnchor.constraint(equalTo: footer.trailingAnchor, constant: -10),
            openCRMButton.centerYAnchor.constraint(equalTo: footer.centerYAnchor),
        ])

        for view in sectionViews {
            view.onMutation = { [weak self] in self?.onMutation?() }
        }
        feed.onPickersNeeded = { [weak self] in (self?.projects ?? [], self?.members ?? []) }
        actionItems.onPickersNeeded = { [weak self] in self?.projects ?? [] }
        files.onLobsNeeded = { [weak self] in self?.lobs ?? [] }
        notes.onLobsNeeded = { [weak self] in self?.lobs ?? [] }

        select(.feed, animated: false)
    }

    private func sectionView(_ s: Section) -> TownHallSectionView {
        switch s {
        case .feed: return feed
        case .calls: return calls
        case .notifications: return notifications
        case .actionItems: return actionItems
        case .files: return files
        case .notes: return notes
        }
    }

    // MARK: - Selection

    func select(_ section: Section, animated: Bool = true) {
        current = section
        navItems.forEach { $0.value.isSelected = ($0.key == section) }
        openCRMButton.title = "Open in CRM"

        let view = sectionView(section)
        let install = { [weak self] in
            guard let self else { return }
            self.contentContainer.subviews.forEach { $0.removeFromSuperview() }
            view.translatesAutoresizingMaskIntoConstraints = false
            self.contentContainer.addSubview(view)
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: self.contentContainer.topAnchor),
                view.bottomAnchor.constraint(equalTo: self.contentContainer.bottomAnchor),
                view.leadingAnchor.constraint(equalTo: self.contentContainer.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: self.contentContainer.trailingAnchor),
            ])
            view.reloadIfNeeded()
        }

        if animated {
            view.alphaValue = 0
            install()
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.16
                view.animator().alphaValue = 1
            }
        } else {
            install()
        }
    }

    /// Jump to Action Items (used after a call files — “Add actions”).
    func showActionItems() {
        select(.actionItems, animated: true)
    }

    func activate() {
        loadPickersIfNeeded()
        sectionView(current).reloadIfNeeded()
        setStatus(.idle)
    }

    // MARK: - Status strip

    enum SyncStatus {
        case idle
        case syncing
        case synced
        case error(String)
    }

    func setStatus(_ status: SyncStatus) {
        switch status {
        case .idle:
            if let t = lastSyncAt {
                statusLabel.stringValue = "Synced \(thRelativeTime(from: t))"
                statusDot.layer?.backgroundColor = NSColor.systemGreen.withAlphaComponent(0.85).cgColor
            } else {
                statusLabel.stringValue = "Waiting for first sync…"
                statusDot.layer?.backgroundColor = NSColor.tertiaryLabelColor.cgColor
            }
        case .syncing:
            statusLabel.stringValue = "Syncing…"
            statusDot.layer?.backgroundColor = NSColor.systemBlue.cgColor
        case .synced:
            lastSyncAt = Date()
            statusLabel.stringValue = "Synced just now"
            statusDot.layer?.backgroundColor = NSColor.systemGreen.cgColor
        case .error(let msg):
            statusLabel.stringValue = msg
            statusDot.layer?.backgroundColor = NSColor.systemOrange.cgColor
        }
    }

    // MARK: - Poller intake

    func applyPosts(_ posts: [Post]) {
        feed.apply(posts: posts)
        setStatus(.synced)
    }

    func applyNotifications(unread: Int, items: [THNotification]) {
        notifications.apply(items: items)
        navItems[.notifications]?.badge = unread
        onUnreadChange?(unread)
        setStatus(.synced)
    }

    func applyActionItems(_ items: [ActionItem]) {
        actionItems.apply(items: items)
        let urgent = items.filter { ($0.priority ?? "") == "now" }.count
        navItems[.actionItems]?.badge = urgent
        setStatus(.synced)
    }

    func noteSyncStarted() { setStatus(.syncing) }

    // MARK: - CRM deep link

    @objc private func openCurrentInCRM() {
        let path = current.crmPath
        if let url = HelperConfig.effective().crmWebURL(path: path) {
            NSWorkspace.shared.open(url)
        } else {
            onError?("Configure CRM URL first (gear → Configure…).")
        }
    }

    // MARK: - Pickers

    private func loadPickersIfNeeded() {
        guard !pickersLoaded, let client = clientProvider() else { return }
        pickersLoaded = true
        setStatus(.syncing)
        Task { @MainActor in
            async let lobsR = try? client.getLobs()
            async let projsR = try? client.getProjects()
            async let membersR = try? client.getMembers()
            self.lobs = await lobsR ?? []
            self.projects = await projsR ?? []
            self.members = await membersR ?? []
            self.feed.setPickers(projects: self.projects, members: self.members)
            self.actionItems.setProjects(self.projects)
            self.files.setLobs(self.lobs)
            self.notes.setLobs(self.lobs)
            self.setStatus(.synced)
        }
    }
}

/// Relative time from a Date (for sync strip).
func thRelativeTime(from date: Date) -> String {
    let secs = -date.timeIntervalSinceNow
    if secs < 15 { return "just now" }
    if secs < 60 { return "\(Int(secs))s ago" }
    if secs < 3600 { return "\(Int(secs / 60))m ago" }
    return "\(Int(secs / 3600))h ago"
}
