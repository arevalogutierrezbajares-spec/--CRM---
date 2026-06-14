import AppKit
import CaptureCore

/// Open action items with a done checkbox per row + colored priority/due tags,
/// and a compact create form (title input + project/priority chips + due date).
final class ActionItemsSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var items: [ActionItem] = []
    private var projects: [ProjectRef] = []

    private let (scroll, table) = thMakeTable()
    private lazy var empty = thEmptyState(symbol: "checklist",
                                          title: "Nothing open",
                                          subtitle: "Add an action item below.")

    private let titleInput = THInput(placeholder: "New action item…  (↩ to add)")
    private let projectChip = THMenuButton(symbol: "number")
    private let priorityChip = THMenuButton(symbol: "flag")
    private let duePicker = NSDatePicker()
    private let dueToggle = NSButton(checkboxWithTitle: "Due", target: nil, action: nil)

    var onPickersNeeded: (() -> [ProjectRef])?

    private let priorities = ["now", "next", "later", "backlog"]

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        table.dataSource = self
        table.delegate = self

        let header = thSectionLabel("ACTION ITEMS")

        titleInput.field.target = self
        titleInput.field.action = #selector(add)
        projectChip.setTitles(["No project"]); projectChip.maxWidth = 140
        priorityChip.setTitles(["Priority", "Now", "Next", "Later", "Backlog"]); priorityChip.maxWidth = 120

        duePicker.datePickerStyle = .textFieldAndStepper
        duePicker.datePickerElements = [.yearMonthDay]
        duePicker.dateValue = Date()
        duePicker.controlSize = .small
        dueToggle.state = .off
        dueToggle.font = .systemFont(ofSize: 12)

        let addBtn = THButton(title: "Add", style: .primary, symbol: "plus",
                              target: self, action: #selector(add))

        let form = NSStackView(views: [titleInput, projectChip, priorityChip, dueToggle, duePicker, addBtn])
        form.orientation = .horizontal
        form.alignment = .centerY
        form.spacing = 8
        titleInput.setContentHuggingPriority(.defaultLow, for: .horizontal)
        form.translatesAutoresizingMaskIntoConstraints = false

        scroll.translatesAutoresizingMaskIntoConstraints = false
        header.translatesAutoresizingMaskIntoConstraints = false
        empty.translatesAutoresizingMaskIntoConstraints = false

        addSubview(header); addSubview(scroll); addSubview(empty); addSubview(form)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),

            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            empty.centerXAnchor.constraint(equalTo: scroll.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: scroll.centerYAnchor),

            form.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            form.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            form.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            form.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
        ])
    }

    func setProjects(_ projects: [ProjectRef]) {
        self.projects = projects
        projectChip.setTitles(["No project"] + projects.map { $0.title })
    }

    override func reload() {
        run { [weak self] client in
            let items = try await client.getActionItems()
            self?.apply(items)
        }
    }

    private func apply(_ items: [ActionItem]) {
        self.items = items
        empty.isHidden = !items.isEmpty
        table.reloadData()
    }

    @objc private func add() {
        let title = titleInput.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        var projectId: String?
        let pIdx = projectChip.selectedIndex - 1
        if pIdx >= 0 && pIdx < projects.count { projectId = projects[pIdx].id }
        let prIdx = priorityChip.selectedIndex - 1
        let priority = (prIdx >= 0 && prIdx < priorities.count) ? priorities[prIdx] : nil
        var dueDate: String?
        if dueToggle.state == .on {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            dueDate = f.string(from: duePicker.dateValue)
        }
        titleInput.stringValue = ""
        run { [weak self] client in
            _ = try await client.createActionItem(title: title, projectId: projectId, dueDate: dueDate, priority: priority)
            let items = try await client.getActionItems()
            self?.apply(items)
            self?.onMutation?()
        }
    }

    @objc private func toggleDone(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < items.count else { return }
        let id = items[sender.tag].id
        let done = sender.state == .on
        run { [weak self] client in
            try await client.setActionItemDone(id: id, done: done)
            let items = try await client.getActionItems()
            self?.apply(items)
            self?.onMutation?()
        }
    }

    private func priorityTint(_ p: String) -> NSColor {
        switch p {
        case "now": return .systemRed
        case "next": return .systemOrange
        case "later": return .systemBlue
        default: return .systemGray
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { items.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let item = items[row]
        let cell = NSTableCellView()

        let check = NSButton(checkboxWithTitle: item.title, target: self, action: #selector(toggleDone(_:)))
        check.tag = row
        check.state = item.done ? .on : .off
        check.font = .systemFont(ofSize: 13)

        var tags: [NSView] = []
        if let p = item.priority { tags.append(thTag(p.capitalized, tint: priorityTint(p))) }
        if let d = item.dueDate { tags.append(thTag("Due \(d)", tint: .systemGray)) }

        var views: [NSView] = [check]
        if !tags.isEmpty {
            let tagRow = NSStackView(views: tags)
            tagRow.orientation = .horizontal
            tagRow.spacing = 6
            views.append(tagRow)
        }
        let content = NSStackView(views: views)
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 6
        content.translatesAutoresizingMaskIntoConstraints = false

        cell.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: cell.topAnchor, constant: 9),
            content.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -9),
            content.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 14),
            content.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12),
        ])
        return cell
    }
}
