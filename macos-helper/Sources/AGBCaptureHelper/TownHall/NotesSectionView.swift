import AppKit
import CaptureCore

/// Add a note — a Town Hall note-post (lands in the feed) or a note attached to
/// a project. A segmented destination control flips between the two; the project
/// chip appears only for project notes. A large rounded text area + a primary
/// Save, with an inline confirmation.
final class NotesSectionView: TownHallSectionView {

    private var lobs: [LobRef] = []
    private let destination = NSSegmentedControl(labels: ["Town Hall feed", "Portfolio project"],
                                                 trackingMode: .selectOne, target: nil, action: nil)
    private let lobChip = THMenuButton(symbol: "folder")
    private let editor = THTextArea(placeholder: "Write a note…")
    private let confirm = thMetaLabel("")

    var onLobsNeeded: (() -> [LobRef])?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        destination.selectedSegment = 0
        destination.target = self
        destination.action = #selector(modeChanged)
        destination.controlSize = .large
        destination.segmentStyle = .rounded

        lobChip.maxWidth = 220
        lobChip.setTitles(["Select project…"])
        lobChip.isHidden = true

        let header = thSectionLabel("NEW NOTE")
        let destRow = NSStackView(views: [destination, lobChip, NSView()])
        destRow.orientation = .horizontal
        destRow.alignment = .centerY
        destRow.spacing = 12

        let extractBtn = THButton(title: "Extract actions in CRM", style: .plain, symbol: "sparkles",
                                  target: self, action: #selector(openExtract))
        let saveBtn = THButton(title: "Save Note", style: .primary, symbol: "checkmark",
                               target: self, action: #selector(save))
        let saveRow = NSStackView(views: [confirm, NSView(), extractBtn, saveBtn])
        saveRow.orientation = .horizontal
        saveRow.alignment = .centerY
        saveRow.spacing = 8

        for v in [header, destRow, editor, saveRow] { v.translatesAutoresizingMaskIntoConstraints = false }
        addSubview(header); addSubview(destRow); addSubview(editor); addSubview(saveRow)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),

            destRow.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 12),
            destRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            destRow.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            editor.topAnchor.constraint(equalTo: destRow.bottomAnchor, constant: 12),
            editor.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            editor.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),

            saveRow.topAnchor.constraint(equalTo: editor.bottomAnchor, constant: 12),
            saveRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            saveRow.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            saveRow.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
        ])
    }

    func setLobs(_ lobs: [LobRef]) {
        self.lobs = lobs
        lobChip.setTitles(lobs.isEmpty ? ["No portfolio projects"] : lobs.map { $0.title })
    }

    /// Opens CRM Town Hall extract flow (Haiku, confirm-before-commit — low AI spend).
    @objc private func openExtract() {
        if let url = HelperConfig.effective().crmWebURL(path: "/town-hall?extract=1") {
            NSWorkspace.shared.open(url)
        } else {
            onError?("Configure CRM URL first (gear → Configure…).")
        }
    }

    override func reload() {
        if lobs.isEmpty, let provided = onLobsNeeded?() { setLobs(provided) }
    }

    @objc private func modeChanged() {
        lobChip.isHidden = destination.selectedSegment != 1
        confirm.stringValue = ""
    }

    @objc private func save() {
        let body = editor.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        var lobId: String?
        if destination.selectedSegment == 1 {
            let idx = lobChip.selectedIndex
            guard idx >= 0 && idx < lobs.count else { onError?("Pick a portfolio project for the note."); return }
            lobId = lobs[idx].id
        }
        let where_ = lobId == nil ? "Posted to the Town Hall feed." : "Saved on the portfolio project."
        run { [weak self] client in
            try await client.createNote(body: body, lobId: lobId)
            self?.editor.string = ""
            self?.confirm.stringValue = where_
            self?.onMutation?()
        }
    }
}
