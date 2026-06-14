import AppKit
import CaptureCore

/// The Town Hall experience as an embeddable NSView — a left sidebar of section
/// nav + a content area — so it lives INSIDE the AGB control panel (no separate
/// window). The pane is the coordinator: it owns the five section views, the
/// shared pickers, runs picker loads, and forwards the client + mutation hooks
/// to each section. Poller pushes (feed + notifications) come in via
/// `applyPosts` / `applyNotifications`; the latter drives the sidebar badge.
final class TownHallPane: NSView {

    enum Section: String, CaseIterable {
        case feed, notifications, actionItems, files, notes
        var title: String {
            switch self {
            case .feed: return "Feed"
            case .notifications: return "Notifications"
            case .actionItems: return "Action Items"
            case .files: return "Files"
            case .notes: return "Notes"
            }
        }
        var symbol: String {
            switch self {
            case .feed: return "bubble.left.and.bubble.right.fill"
            case .notifications: return "bell.fill"
            case .actionItems: return "checklist"
            case .files: return "folder.fill"
            case .notes: return "note.text"
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

    private let feed = FeedSectionView()
    private let notifications = NotificationsSectionView()
    private let actionItems = ActionItemsSectionView()
    private let files = FilesSectionView()
    private let notes = NotesSectionView()
    private var sectionViews: [TownHallSectionView] { [feed, notifications, actionItems, files, notes] }

    private var navItems: [Section: SidebarItem] = [:]
    private let contentContainer = NSView()
    private var current: Section = .feed

    private var lobs: [LobRef] = []
    private var projects: [ProjectRef] = []
    private var members: [MemberRef] = []
    private var pickersLoaded = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    // MARK: - Build

    private func build() {
        wantsLayer = true

        // Sidebar (vibrancy), pinned left.
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

        // Hairline separator between sidebar and content.
        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false

        contentContainer.translatesAutoresizingMaskIntoConstraints = false

        addSubview(sidebar)
        addSubview(separator)
        addSubview(contentContainer)
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
            contentContainer.bottomAnchor.constraint(equalTo: bottomAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: separator.trailingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])

        // Wire section hooks (clientProvider/onError set via their didSet too).
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

    /// Called when the pane becomes visible (panel expands): load shared pickers
    /// once and refresh the active section.
    func activate() {
        loadPickersIfNeeded()
        sectionView(current).reloadIfNeeded()
    }

    // MARK: - Poller intake (main thread)

    func applyPosts(_ posts: [Post]) { feed.apply(posts: posts) }

    func applyNotifications(unread: Int, items: [THNotification]) {
        notifications.apply(items: items)
        navItems[.notifications]?.badge = unread
    }

    // MARK: - Pickers

    private func loadPickersIfNeeded() {
        guard !pickersLoaded, let client = clientProvider() else { return }
        pickersLoaded = true
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
        }
    }
}
