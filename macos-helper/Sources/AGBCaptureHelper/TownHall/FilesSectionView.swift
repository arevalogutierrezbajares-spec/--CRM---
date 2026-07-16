import AppKit
import CaptureCore

/// Project files browser: pick a portfolio unit, list files, open HTML decks and
/// other files correctly (download via capture view proxy → open locally so
/// presentations render — never open Supabase signed URLs for HTML).
final class FilesSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var lobs: [LobRef] = []
    private var files: [ProjectFile] = []
    private var selectedLobId: String?
    private var opening = false

    private let lobChip = THMenuButton(symbol: "folder")
    private let (scroll, table) = thMakeTable()
    private let dropZone = DropZoneView()
    private let status = thMetaLabel("")
    private lazy var empty = thEmptyState(
        symbol: "doc.richtext",
        title: "No files yet",
        subtitle: "Drop HTML decks, PDFs, or docs here — double-click to open."
    )

    var onLobsNeeded: (() -> [LobRef])?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private func build() {
        table.dataSource = self
        table.delegate = self
        table.doubleAction = #selector(rowDoubleClicked)
        table.target = self
        table.intercellSpacing = NSSize(width: 0, height: 4)

        lobChip.maxWidth = 220
        lobChip.setTitles(["Select project…"])
        lobChip.onSelect = { [weak self] idx in self?.lobChosen(idx) }
        let uploadBtn = THButton(title: "Upload", style: .primary, symbol: "arrow.up.doc",
                                 target: self, action: #selector(pickFiles))
        let openCRM = THButton(title: "Open in CRM", style: .plain, symbol: "arrow.up.right",
                               target: self, action: #selector(openCRMFiles))

        let header = NSStackView(views: [
            thSectionLabel("FILES"), lobChip, NSView(), status, openCRM, uploadBtn,
        ])
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
            lobChip.setTitles(["No portfolio projects"])
            selectedLobId = nil
            apply([])
            return
        }
        lobChip.setTitles(
            lobs.map(\.title),
            selected: previous.flatMap { p in lobs.firstIndex(where: { $0.id == p }) } ?? 0
        )
        selectedLobId = previous.flatMap { p in lobs.first(where: { $0.id == p })?.id } ?? lobs.first?.id
        loadFiles()
    }

    @objc private func openCRMFiles() {
        if let url = HelperConfig.effective().crmWebURL(path: "/town-hall") {
            NSWorkspace.shared.open(url)
        }
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
        status.stringValue = "Loading…"
        run { [weak self] client in
            let files = try await client.getLobFiles(lobId: lobId)
            self?.status.stringValue = files.isEmpty ? "" : "\(files.count) file\(files.count == 1 ? "" : "s")"
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
        panel.allowedContentTypes = [] // all; server allow-lists
        panel.begin { [weak self] resp in
            if resp == .OK { self?.upload(panel.urls) }
        }
    }

    private func upload(_ urls: [URL]) {
        guard let lobId = selectedLobId else { onError?("Pick a project first."); return }
        guard !urls.isEmpty else { return }
        status.stringValue = "Uploading \(urls.count)…"
        run { [weak self] client in
            for url in urls { _ = try await client.uploadFile(url, toLob: lobId) }
            let files = try await client.getLobFiles(lobId: lobId)
            self?.status.stringValue = "\(files.count) file\(files.count == 1 ? "" : "s")"
            self?.apply(files)
            self?.onMutation?()
        }
    }

    @objc private func rowDoubleClicked() {
        let row = table.clickedRow
        guard row >= 0 else { return }
        openFile(at: row)
    }

    @objc private func openFileButton(_ sender: NSButton) {
        openFile(at: sender.tag)
    }

    private func openFile(at row: Int) {
        guard row >= 0, row < files.count else { return }
        guard !opening else { return }
        let file = files[row]
        opening = true
        status.stringValue = file.isHTMLPresentation ? "Opening presentation…" : "Opening…"
        run { [weak self] client in
            defer {
                self?.opening = false
            }
            do {
                let local = try await client.downloadProjectFile(file)
                let ok = NSWorkspace.shared.open(local)
                if !ok {
                    // Fallback: reveal in Finder
                    NSWorkspace.shared.activateFileViewerSelecting([local])
                    self?.onError?("Opened in Finder — double-click the file to view.")
                }
                self?.status.stringValue = file.isHTMLPresentation
                    ? "Opened \(file.preferredFilename)"
                    : "\(self?.files.count ?? 0) file\((self?.files.count ?? 0) == 1 ? "" : "s")"
            } catch {
                self?.status.stringValue = ""
                throw error
            }
        }
    }

    private func fileSymbol(_ f: ProjectFile) -> String {
        switch f.fileExtension {
        case "html", "htm": return "rectangle.on.rectangle.angled"
        case "pdf": return "doc.richtext"
        case "png", "jpg", "jpeg", "gif", "webp", "heic": return "photo"
        case "doc", "docx": return "doc.text"
        case "xls", "xlsx", "csv": return "tablecells"
        case "ppt", "pptx": return "rectangle.on.rectangle"
        case "md", "markdown": return "text.alignleft"
        case "zip": return "doc.zipper"
        case "txt": return "doc.plaintext"
        default: return "doc"
        }
    }

    private func kindLabel(_ f: ProjectFile) -> String {
        switch f.fileExtension {
        case "html", "htm": return "HTML deck"
        case "pdf": return "PDF"
        case "md", "markdown": return "Markdown"
        case "pptx", "ppt": return "Slides"
        default: return f.fileExtension.uppercased().isEmpty ? "File" : f.fileExtension.uppercased()
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { files.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let f = files[row]
        let cell = NSTableCellView()

        let well = NSView()
        well.wantsLayer = true
        well.layer?.cornerRadius = 10
        well.layer?.backgroundColor = (f.isHTMLPresentation
            ? NSColor.systemPurple : NSColor.controlAccentColor)
            .withAlphaComponent(0.14).cgColor
        well.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: fileSymbol(f), accessibilityDescription: nil)
        icon.symbolConfiguration = .init(pointSize: 15, weight: .semibold)
        icon.contentTintColor = f.isHTMLPresentation ? .systemPurple : .controlAccentColor
        icon.translatesAutoresizingMaskIntoConstraints = false
        well.addSubview(icon)

        let name = NSTextField(labelWithString: f.label)
        name.font = .systemFont(ofSize: 13, weight: .semibold)
        name.lineBreakMode = .byTruncatingTail
        name.translatesAutoresizingMaskIntoConstraints = false

        var metaParts: [String] = [kindLabel(f)]
        let size = thFormatBytes(f.sizeBytes)
        if !size.isEmpty { metaParts.append(size) }
        let t = thRelativeTime(f.createdAt)
        if !t.isEmpty { metaParts.append(t) }
        let meta = NSTextField(labelWithString: metaParts.joined(separator: "  ·  "))
        meta.font = .systemFont(ofSize: 11)
        meta.textColor = .secondaryLabelColor
        meta.translatesAutoresizingMaskIntoConstraints = false

        let open = THButton(
            title: f.isHTMLPresentation ? "Present" : "Open",
            style: .secondary,
            symbol: f.isHTMLPresentation ? "play.rectangle" : "arrow.up.forward",
            target: self,
            action: #selector(openFileButton(_:))
        )
        open.tag = row

        let textCol = NSStackView(views: [name, meta])
        textCol.orientation = .vertical
        textCol.alignment = .leading
        textCol.spacing = 2

        let rowStack = NSStackView(views: [well, textCol, NSView(), open])
        rowStack.orientation = .horizontal
        rowStack.alignment = .centerY
        rowStack.spacing = 12
        rowStack.translatesAutoresizingMaskIntoConstraints = false

        cell.addSubview(rowStack)
        NSLayoutConstraint.activate([
            well.widthAnchor.constraint(equalToConstant: 36),
            well.heightAnchor.constraint(equalToConstant: 36),
            icon.centerXAnchor.constraint(equalTo: well.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: well.centerYAnchor),
            rowStack.topAnchor.constraint(equalTo: cell.topAnchor, constant: 8),
            rowStack.bottomAnchor.constraint(equalTo: cell.bottomAnchor, constant: -8),
            rowStack.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 10),
            rowStack.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -10),
            cell.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
        ])
        return cell
    }
}
