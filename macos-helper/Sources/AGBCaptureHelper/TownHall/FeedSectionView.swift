import AppKit
import CaptureCore

/// The Town Hall feed: a scrolling list of posts (avatar, author, time, body,
/// refs, a 👍 reaction) with a compose bar (chip pickers for #project and
/// @mention + a rounded input + Post). Posts arrive via the poller
/// (`apply(posts:)`) and an immediate fetch on appear.
final class FeedSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var posts: [Post] = []
    private var projects: [ProjectRef] = []
    private var members: [MemberRef] = []
    private var selectedMentionIds: [String] = []

    private let (scroll, table) = thMakeTable()
    private let composeInput = THInput(placeholder: "Write a message…  (↩ to post)")
    private let projectChip = THMenuButton(symbol: "number")
    private let mentionChip = THMenuButton(symbol: "at")
    private lazy var empty = thEmptyState(symbol: "bubble.left.and.bubble.right",
                                          title: "No posts yet",
                                          subtitle: "Start the conversation below.")

    var onPickersNeeded: (() -> ([ProjectRef], [MemberRef]))?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        table.dataSource = self
        table.delegate = self

        let header = thSectionLabel("FEED")

        projectChip.setTitles(["No project"])
        projectChip.maxWidth = 150
        mentionChip.setTitles(["@"])
        mentionChip.resetsAfterSelect = true
        mentionChip.maxWidth = 130
        mentionChip.onSelect = { [weak self] idx in self?.mentionPicked(idx) }

        composeInput.field.target = self
        composeInput.field.action = #selector(post)

        let postBtn = THButton(title: "Post", style: .primary, symbol: "paperplane.fill",
                               target: self, action: #selector(post))

        let composeRow = NSStackView(views: [projectChip, mentionChip, composeInput, postBtn])
        composeRow.orientation = .horizontal
        composeRow.alignment = .centerY
        composeRow.spacing = 8
        composeRow.translatesAutoresizingMaskIntoConstraints = false
        composeInput.setContentHuggingPriority(.defaultLow, for: .horizontal)
        projectChip.setContentHuggingPriority(.required, for: .horizontal)
        mentionChip.setContentHuggingPriority(.required, for: .horizontal)
        postBtn.setContentHuggingPriority(.required, for: .horizontal)

        scroll.translatesAutoresizingMaskIntoConstraints = false
        header.translatesAutoresizingMaskIntoConstraints = false
        empty.translatesAutoresizingMaskIntoConstraints = false

        addSubview(header); addSubview(scroll); addSubview(empty); addSubview(composeRow)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),

            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            empty.centerXAnchor.constraint(equalTo: scroll.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: scroll.centerYAnchor),

            composeRow.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            composeRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            composeRow.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            composeRow.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
        ])
    }

    func setPickers(projects: [ProjectRef], members: [MemberRef]) {
        self.projects = projects
        self.members = members
        projectChip.setTitles(["No project"] + projects.map { $0.title })
        mentionChip.setTitles(["@"] + members.map { $0.name })
    }

    func apply(posts: [Post]) {
        // The server returns newest-first; show chronological (newest at the
        // bottom) like a chat, and scroll to the latest.
        self.posts = posts.reversed()
        empty.isHidden = !posts.isEmpty
        table.reloadData()
        scrollToBottom()
    }

    private func scrollToBottom() {
        guard !posts.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.posts.isEmpty else { return }
            self.table.scrollRowToVisible(self.posts.count - 1)
        }
    }

    override func reload() {
        run { [weak self] client in
            let posts = try await client.getPosts()
            self?.apply(posts: posts)
        }
    }

    private func mentionPicked(_ idx: Int) {
        let memberIdx = idx - 1   // 0 == "@"
        guard memberIdx >= 0 && memberIdx < members.count else { return }
        let member = members[memberIdx]
        if !selectedMentionIds.contains(member.id) { selectedMentionIds.append(member.id) }
        let cur = composeInput.stringValue
        let sep = cur.isEmpty || cur.hasSuffix(" ") ? "" : " "
        composeInput.stringValue = cur + "\(sep)@\(member.name) "
        window?.makeFirstResponder(composeInput.field)
    }

    @objc private func post() {
        let body = composeInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        var projectId: String?
        let idx = projectChip.selectedIndex - 1
        if idx >= 0 && idx < projects.count { projectId = projects[idx].id }
        let mentions = selectedMentionIds
        composeInput.stringValue = ""
        selectedMentionIds = []
        projectChip.setTitles(["No project"] + projects.map { $0.title }, selected: 0)
        run { [weak self] client in
            _ = try await client.createPost(body: body, projectId: projectId, mentionUserIds: mentions)
            let posts = try await client.getPosts()
            self?.apply(posts: posts)
            self?.onMutation?()
        }
    }

    @objc private func reactTapped(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < posts.count else { return }
        let post = posts[sender.tag]
        run { [weak self] client in
            try await client.toggleReaction(postId: post.id, emoji: "👍")
            let posts = try await client.getPosts()
            self?.apply(posts: posts)
            self?.onMutation?()
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { posts.count }

    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let post = posts[row]
        let cell = NSTableCellView()

        let avatar = AvatarView(name: post.author ?? "•")

        let author = NSTextField(labelWithString: post.author ?? "Someone")
        author.font = .systemFont(ofSize: 13, weight: .semibold)
        let time = thMetaLabel(thRelativeTime(post.createdAt))
        let headerRow = NSStackView(views: [author, time])
        headerRow.orientation = .horizontal
        headerRow.spacing = 8

        let body = thBodyLabel(post.body)

        var contentViews: [NSView] = [headerRow, body]

        let refLabels = post.references.compactMap { $0.label }.filter { !$0.isEmpty }
        if !refLabels.isEmpty {
            let refs = NSStackView(views: refLabels.map { thTag("#\($0)") })
            refs.orientation = .horizontal
            refs.spacing = 6
            contentViews.append(refs)
        }

        let thumbs = post.reactions.first(where: { $0.emoji == "👍" })
        let react = THButton(title: thumbs.map { $0.count > 0 ? "\($0.count)" : "" } ?? "",
                             style: thumbs?.reactedByMe == true ? .secondary : .plain,
                             symbol: "hand.thumbsup.fill",
                             target: self, action: #selector(reactTapped(_:)))
        react.tag = row
        let reactRow = NSStackView(views: [react])
        reactRow.orientation = .horizontal
        contentViews.append(reactRow)

        let content = NSStackView(views: contentViews)
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 5
        content.setCustomSpacing(8, after: body)

        avatar.translatesAutoresizingMaskIntoConstraints = false
        content.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(avatar)
        cell.addSubview(content)
        NSLayoutConstraint.activate([
            avatar.topAnchor.constraint(equalTo: cell.topAnchor, constant: 10),
            avatar.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 10),
            content.topAnchor.constraint(equalTo: cell.topAnchor, constant: 9),
            content.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -9),
            content.leadingAnchor.constraint(equalTo: avatar.trailingAnchor, constant: 11),
            content.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12),
        ])
        return cell
    }
}
