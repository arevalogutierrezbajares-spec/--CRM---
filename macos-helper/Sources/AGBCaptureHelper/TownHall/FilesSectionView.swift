import AppKit
import CaptureCore

/// Project files: pick a line of business (chip), browse its files (type icon +
/// size, Open in browser), and upload via the Upload button or by dropping files
/// anywhere on the list. Uploads run the 3-step sign→PUT→finalize flow.
final class FilesSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var lobs: [LobRef] = []
    private var files: [ProjectFile] = []
    private var selectedLobId: String?

    private let lobChip = THMenuButton(symbol: "folder")
    private let (scroll, table) = thMakeTable()
    private let dropZone = DropZoneView()
    private let status = thMetaLabel("")
    private lazy var empty = thEmptyState(symbol: "tray.and.arrow.down",
                                          title: "No files here yet",
                                          subtitle: "Drop files anywhere, or use Upload.")

    var onLobsNeeded: (() -> [LobRef])?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        table.dataSource = self
        table.delegate = self

        lobChip.maxWidth = 220
        lobChip.setTitles(["No projects"])
        lobChip.onSelect = { [weak self] idx in self?.lobChosen(idx) }
        let uploadBtn = THButton(title: "Upload", style: .primary, symbol: "arrow.up.doc",
                                 target: self, action: #selector(pickFiles))

        let header = NSStackView(views: [thSectionLabel("FILES"), lobChip, NSView(), status, uploadBtn])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        dropZone.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        empty.translatesAutoresizingMaskIntoConstraints = false
        dropZone.addSubview(scroll)
        dropZone.addSubview(empty)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: dropZone.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: dropZone.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: dropZone.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: dropZone.trailingAnchor),
            empty.centerXAnchor.constraint(equalTo: dropZone.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: dropZone.centerYAnchor),
        ])
        dropZone.onDrop = { [weak self] urls in self?.upload(urls) }

        installStandardLayout(header: header, body: dropZone)
    }

    func setLobs(_ lobs: [LobRef]) {
        self.lobs = lobs
        let previous = selectedLobId
        if lobs.isEmpty {
            lobChip.setTitles(["No projects"])
            selectedLobId = nil
            return
        }
        lobChip.setTitles(lobs.map { $0.title },
                          selected: previous.flatMap { p in lobs.firstIndex(where: { $0.id == p }) } ?? 0)
        selectedLobId = previous.flatMap { p in lobs.first(where: { $0.id == p })?.id } ?? lobs.first?.id
        loadFiles()
    }

    override func reload() {
        if lobs.isEmpty, let provided = onLobsNeeded?() { setLobs(provided) }
        else { loadFiles() }
    }

    private func lobChosen(_ idx: Int) {
        guard idx >= 0 && idx < lobs.count else { return }
        selectedLobId = lobs[idx].id
        loadFiles()
    }

    private func loadFiles() {
        guard let lobId = selectedLobId else { apply([]); return }
        run { [weak self] client in
            let files = try await client.getLobFiles(lobId: lobId)
            self?.apply(files)
        }
    }

    private func apply(_ files: [ProjectFile]) {
        self.files = files
        empty.isHidden = !files.isEmpty
        table.reloadData()
    }

    @objc private func pickFiles() {
        guard selectedLobId != nil else { onError?("Pick a project first."); return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.begin { [weak self] resp in
            if resp == .OK { self?.upload(panel.urls) }
        }
    }

    private func upload(_ urls: [URL]) {
        guard let lobId = selectedLobId else { onError?("Pick a project first."); return }
        guard !urls.isEmpty else { return }
        status.stringValue = "Uploading \(urls.count) file\(urls.count == 1 ? "" : "s")…"
        run { [weak self] client in
            for url in urls { _ = try await client.uploadFile(url, toLob: lobId) }
            self?.status.stringValue = ""
            let files = try await client.getLobFiles(lobId: lobId)
            self?.apply(files)
            self?.onMutation?()
        }
    }

    @objc private func openFile(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < files.count, let urlStr = files[sender.tag].url,
              let url = URL(string: urlStr) else {
            onError?("This file has no download link.")
            return
        }
        NSWorkspace.shared.open(url)
    }

    private func fileSymbol(_ f: ProjectFile) -> String {
        let ext = (f.originalFilename ?? f.label as String).split(separator: ".").last.map { $0.lowercased() } ?? ""
        switch ext {
        case "pdf": return "doc.richtext"
        case "png", "jpg", "jpeg", "gif", "webp", "heic": return "photo"
        case "doc", "docx": return "doc.text"
        case "xls", "xlsx", "csv": return "tablecells"
        case "ppt", "pptx": return "rectangle.on.rectangle"
        case "zip": return "doc.zipper"
        case "md", "txt": return "doc.plaintext"
        default: return "doc"
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { files.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let f = files[row]
        let cell = NSTableCellView()

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: fileSymbol(f), accessibilityDescription: nil)
        icon.symbolConfiguration = .init(pointSize: 16, weight: .regular)
        icon.contentTintColor = .controlAccentColor
        icon.translatesAutoresizingMaskIntoConstraints = false

        let name = thBodyLabel(f.label, weight: .medium)
        var metaParts: [String] = []
        if let c = f.category { metaParts.append(c) }
        let size = thFormatBytes(f.sizeBytes); if !size.isEmpty { metaParts.append(size) }
        let t = thRelativeTime(f.createdAt); if !t.isEmpty { metaParts.append(t) }
        let meta = thMetaLabel(metaParts.joined(separator: "  ·  "))

        let open = THButton(title: "Open", style: .plain, symbol: "arrow.up.right.square",
                            target: self, action: #selector(openFile(_:)))
        open.tag = row

        let textCol = NSStackView(views: [name, meta])
        textCol.orientation = .vertical
        textCol.alignment = .leading
        textCol.spacing = 2

        let rowStack = NSStackView(views: [icon, textCol, NSView(), open])
        rowStack.orientation = .horizontal
        rowStack.alignment = .centerY
        rowStack.spacing = 11
        rowStack.translatesAutoresizingMaskIntoConstraints = false

        cell.addSubview(rowStack)
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 22),
            rowStack.topAnchor.constraint(equalTo: cell.topAnchor, constant: 9),
            rowStack.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -9),
            rowStack.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 12),
            rowStack.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12),
        ])
        return cell
    }
}
