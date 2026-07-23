import AppKit
import CaptureCore

/// Filed-calls browser: every recorded call, right inside the helper — title,
/// when, how long, who was on it, the AI brief, and the full speaker-attributed
/// transcript. List → detail is an in-place push (back chip returns), matching
/// the pane's Apple-caliber chrome: icon wells, hover rows, tag pills, and the
/// same speaker colors the live-transcript window uses (blue = you, palette =
/// everyone else) so a call reads the same live and filed.
final class CallsSectionView: TownHallSectionView, NSTableViewDataSource, NSTableViewDelegate {

    private var recordings: [CallRecordingSummary] = []
    private var filtered: [CallRecordingSummary] = []
    private var detailCache: [String: CallRecordingDetail] = [:]
    private var loadedOnce = false

    // List chrome
    private let search = THInput(placeholder: "Search calls, people…")
    private let (scroll, table) = thMakeTable()
    private let status = thMetaLabel("")
    private lazy var empty = thEmptyState(
        symbol: "waveform",
        title: "No calls filed yet",
        subtitle: "Recorded calls land here automatically after filing."
    )

    // Detail chrome (built once, filled per call)
    private let listContainer = NSView()
    private let detailContainer = NSView()
    private let detailTitle = NSTextField(wrappingLabelWithString: "")
    private let detailMeta = thMetaLabel("")
    private let detailTags = NSStackView()
    private let detailText = NSTextView()
    private var detailScroll: NSScrollView?
    private var currentDetailId: String?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        build()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    // MARK: - Build

    private func build() {
        table.dataSource = self
        table.delegate = self
        table.doubleAction = #selector(rowActivated)
        table.target = self
        table.intercellSpacing = NSSize(width: 0, height: 4)

        search.field.delegate = self
        search.translatesAutoresizingMaskIntoConstraints = false
        search.widthAnchor.constraint(equalToConstant: 220).isActive = true

        let header = NSStackView(views: [thSectionLabel("CALLS"), search, NSView(), status])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        // List page
        listContainer.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        empty.translatesAutoresizingMaskIntoConstraints = false
        listContainer.addSubview(scroll)
        listContainer.addSubview(empty)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: listContainer.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: listContainer.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: listContainer.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: listContainer.trailingAnchor),
            empty.centerXAnchor.constraint(equalTo: listContainer.centerXAnchor),
            empty.centerYAnchor.constraint(equalTo: listContainer.centerYAnchor),
        ])

        buildDetailPage()

        let body = NSView()
        body.translatesAutoresizingMaskIntoConstraints = false
        for page in [listContainer, detailContainer] {
            body.addSubview(page)
            NSLayoutConstraint.activate([
                page.topAnchor.constraint(equalTo: body.topAnchor),
                page.bottomAnchor.constraint(equalTo: body.bottomAnchor),
                page.leadingAnchor.constraint(equalTo: body.leadingAnchor),
                page.trailingAnchor.constraint(equalTo: body.trailingAnchor),
            ])
        }
        detailContainer.isHidden = true

        installStandardLayout(header: header, body: body)
    }

    private func buildDetailPage() {
        detailContainer.translatesAutoresizingMaskIntoConstraints = false

        let back = THButton(title: "All calls", style: .plain, symbol: "chevron.left",
                            target: self, action: #selector(backToList))
        let openCRM = THButton(title: "Open in CRM", style: .secondary, symbol: "arrow.up.right",
                               target: self, action: #selector(openDetailInCRM))
        let bar = NSStackView(views: [back, NSView(), openCRM])
        bar.orientation = .horizontal
        bar.alignment = .centerY
        bar.spacing = 8
        bar.translatesAutoresizingMaskIntoConstraints = false

        detailTitle.font = .systemFont(ofSize: 15, weight: .semibold)
        detailTitle.textColor = .labelColor
        detailTitle.isSelectable = true
        detailTitle.translatesAutoresizingMaskIntoConstraints = false

        detailMeta.translatesAutoresizingMaskIntoConstraints = false

        detailTags.orientation = .horizontal
        detailTags.alignment = .centerY
        detailTags.spacing = 5
        detailTags.translatesAutoresizingMaskIntoConstraints = false

        let hairline = NSBox()
        hairline.boxType = .separator
        hairline.translatesAutoresizingMaskIntoConstraints = false

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false

        detailText.isEditable = false
        detailText.isSelectable = true
        detailText.drawsBackground = false
        detailText.textContainerInset = NSSize(width: 2, height: 8)
        detailText.autoresizingMask = [.width]
        detailText.isVerticallyResizable = true
        detailText.isHorizontallyResizable = false
        detailText.textContainer?.widthTracksTextView = true
        scroll.documentView = detailText
        detailScroll = scroll

        detailContainer.addSubview(bar)
        detailContainer.addSubview(detailTitle)
        detailContainer.addSubview(detailMeta)
        detailContainer.addSubview(detailTags)
        detailContainer.addSubview(hairline)
        detailContainer.addSubview(scroll)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: detailContainer.topAnchor),
            bar.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: detailContainer.trailingAnchor),

            detailTitle.topAnchor.constraint(equalTo: bar.bottomAnchor, constant: 10),
            detailTitle.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor, constant: 2),
            detailTitle.trailingAnchor.constraint(equalTo: detailContainer.trailingAnchor, constant: -2),

            detailMeta.topAnchor.constraint(equalTo: detailTitle.bottomAnchor, constant: 4),
            detailMeta.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor, constant: 2),
            detailMeta.trailingAnchor.constraint(lessThanOrEqualTo: detailContainer.trailingAnchor),

            detailTags.topAnchor.constraint(equalTo: detailMeta.bottomAnchor, constant: 8),
            detailTags.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor, constant: 2),
            detailTags.trailingAnchor.constraint(lessThanOrEqualTo: detailContainer.trailingAnchor),

            hairline.topAnchor.constraint(equalTo: detailTags.bottomAnchor, constant: 10),
            hairline.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: detailContainer.trailingAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1),

            scroll.topAnchor.constraint(equalTo: hairline.bottomAnchor, constant: 2),
            scroll.leadingAnchor.constraint(equalTo: detailContainer.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: detailContainer.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: detailContainer.bottomAnchor),
        ])
    }

    // MARK: - Data

    override func reload() {
        status.stringValue = loadedOnce ? status.stringValue : "Loading…"
        run { [weak self] client in
            let recs = try await client.getRecordings(limit: 50)
            guard let self else { return }
            self.loadedOnce = true
            self.recordings = recs
            self.applyFilter()
        }
    }

    private func applyFilter() {
        let query = search.stringValue.trimmingCharacters(in: .whitespaces).lowercased()
        filtered = query.isEmpty ? recordings : recordings.filter { r in
            r.title.lowercased().contains(query)
                || (r.contactName?.lowercased().contains(query) ?? false)
                || (r.sourceApp?.lowercased().contains(query) ?? false)
                || r.participants.contains { $0.lowercased().contains(query) }
        }
        empty.isHidden = !filtered.isEmpty
        let n = filtered.count
        status.stringValue = n == 0 ? "" : "\(n) call\(n == 1 ? "" : "s")"
        table.reloadData()
    }

    // MARK: - Detail

    private func showDetail(_ summary: CallRecordingSummary) {
        currentDetailId = summary.id
        detailTitle.stringValue = summary.title
        detailMeta.stringValue = Self.metaLine(for: summary)
        setTags(participants: summary.participants, contact: summary.contactName,
                partial: summary.partial, suspectFlags: summary.suspectFlags)
        detailText.textStorage?.setAttributedString(
            NSAttributedString(string: "Loading transcript…", attributes: [
                .font: NSFont.systemFont(ofSize: 12.5),
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]))
        swapPages(showDetail: true)

        if let cached = detailCache[summary.id] {
            renderDetail(cached)
            return
        }
        run { [weak self] client in
            let detail = try await client.getRecording(id: summary.id)
            guard let self else { return }
            self.detailCache[detail.id] = detail
            if self.currentDetailId == detail.id { self.renderDetail(detail) }
        }
    }

    private func renderDetail(_ d: CallRecordingDetail) {
        detailTitle.stringValue = d.title
        var metaParts: [String] = []
        if let t = d.createdAt.map(thRelativeTime), !t.isEmpty { metaParts.append(t) }
        if let dur = d.durationSecs, dur > 0 { metaParts.append(Self.duration(dur)) }
        if let src = d.sourceApp, !src.isEmpty { metaParts.append(src) }
        if let engine = d.transcriptEngine, !engine.isEmpty { metaParts.append(engine) }
        detailMeta.stringValue = metaParts.joined(separator: "  ·  ")

        let out = NSMutableAttributedString()
        if let brief = d.brief, !brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append(sectionHeading("BRIEF"))
            out.append(Self.renderMarkdownLite(brief))
            out.append(NSAttributedString(string: "\n"))
        }
        if !d.utterances.isEmpty {
            out.append(sectionHeading("TRANSCRIPT"))
            for u in d.utterances where !u.text.trimmingCharacters(in: .whitespaces).isEmpty {
                out.append(Self.renderUtterance(u, in: d))
            }
        } else if !d.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append(sectionHeading("TRANSCRIPT"))
            out.append(NSAttributedString(string: d.transcript, attributes: [
                .font: NSFont.systemFont(ofSize: 12.5),
                .foregroundColor: NSColor.labelColor,
            ]))
        }
        if out.length == 0 {
            out.append(NSAttributedString(string: "No transcript stored for this call.", attributes: [
                .font: NSFont.systemFont(ofSize: 12.5),
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]))
        }
        detailText.textStorage?.setAttributedString(out)
        detailScroll?.contentView.scroll(to: .zero)
        detailScroll?.reflectScrolledClipView(detailScroll!.contentView)
    }

    private func setTags(participants: [String], contact: String?, partial: Bool, suspectFlags: [String]) {
        detailTags.arrangedSubviews.forEach { $0.removeFromSuperview() }
        var names = participants
        if let contact, !contact.isEmpty, !names.contains(contact) { names.insert(contact, at: 0) }
        for name in names.prefix(5) {
            detailTags.addArrangedSubview(thTag(name, tint: Self.speakerColor(name)))
        }
        if partial { detailTags.addArrangedSubview(thTag("partial", tint: .systemOrange)) }
        if !suspectFlags.isEmpty { detailTags.addArrangedSubview(thTag("⚠ check audio", tint: .systemOrange)) }
        detailTags.isHidden = detailTags.arrangedSubviews.isEmpty
    }

    private func swapPages(showDetail: Bool) {
        let incoming = showDetail ? detailContainer : listContainer
        let outgoing = showDetail ? listContainer : detailContainer
        incoming.isHidden = false
        incoming.alphaValue = 0
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.14
            incoming.animator().alphaValue = 1
        }, completionHandler: {
            outgoing.isHidden = true
        })
    }

    @objc private func backToList() {
        currentDetailId = nil
        swapPages(showDetail: false)
    }

    @objc private func openDetailInCRM() {
        guard let id = currentDetailId,
              let url = HelperConfig.effective().crmWebURL(path: "/meetings/recordings/\(id)") else {
            onError?("Configure CRM URL first (gear → Configure…).")
            return
        }
        NSWorkspace.shared.open(url)
    }

    // MARK: - Rendering helpers

    private func sectionHeading(_ text: String) -> NSAttributedString {
        NSAttributedString(string: "\(text)\n", attributes: [
            .font: NSFont.systemFont(ofSize: 10.5, weight: .semibold),
            .foregroundColor: NSColor.secondaryLabelColor,
            .kern: 0.8,
            .paragraphStyle: {
                let p = NSMutableParagraphStyle()
                p.paragraphSpacingBefore = 10
                p.paragraphSpacing = 6
                return p
            }(),
        ])
    }

    /// "MM:SS  Name  text\n" with the live-window color language: you = blue,
    /// everyone else = a stable palette color per display name.
    static func renderUtterance(_ u: CallUtterance, in d: CallRecordingDetail) -> NSAttributedString {
        let name = d.displayName(for: u)
        let line = NSMutableAttributedString()
        let para = NSMutableParagraphStyle()
        para.paragraphSpacing = 5
        para.headIndent = 0
        line.append(NSAttributedString(string: clock(u.start) + "  ", attributes: [
            .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .regular),
            .foregroundColor: NSColor.tertiaryLabelColor,
            .paragraphStyle: para,
        ]))
        line.append(NSAttributedString(string: "\(name)  ", attributes: [
            .font: NSFont.systemFont(ofSize: 12.5, weight: .semibold),
            .foregroundColor: speakerColor(name),
            .paragraphStyle: para,
        ]))
        line.append(NSAttributedString(string: u.text + "\n", attributes: [
            .font: NSFont.systemFont(ofSize: 12.5),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para,
        ]))
        return line
    }

    /// "You" keeps the live-transcript blue; other speakers get a stable
    /// AvatarView-style palette color keyed on the name.
    static func speakerColor(_ name: String) -> NSColor {
        let lowered = name.lowercased()
        if lowered == "you" || lowered == "founder" { return .systemBlue }
        let palette: [NSColor] = [
            .systemGreen, .systemTeal, .systemPurple, .systemPink,
            .systemIndigo, .systemOrange, .systemBrown,
        ]
        var hash = 5381
        for b in name.utf8 { hash = ((hash << 5) &+ hash) &+ Int(b) }
        return palette[abs(hash) % palette.count]
    }

    /// Just enough markdown for the filed briefs: #/##/### headings, "- "
    /// bullets, **bold** runs. Anything else renders as body text.
    static func renderMarkdownLite(_ md: String) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let bodyFont = NSFont.systemFont(ofSize: 12.5)
        let para = NSMutableParagraphStyle()
        para.paragraphSpacing = 4

        for rawLine in md.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                out.append(NSAttributedString(string: "\n"))
                continue
            }
            if line.hasPrefix("#") {
                let text = line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
                out.append(NSAttributedString(string: text + "\n", attributes: [
                    .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                    .foregroundColor: NSColor.labelColor,
                    .paragraphStyle: {
                        let p = NSMutableParagraphStyle()
                        p.paragraphSpacingBefore = 8
                        p.paragraphSpacing = 4
                        return p
                    }(),
                ]))
                continue
            }
            var body = line
            var prefix = ""
            if body.hasPrefix("- ") || body.hasPrefix("* ") {
                prefix = "•  "
                body = String(body.dropFirst(2))
            }
            let lineOut = NSMutableAttributedString(string: prefix, attributes: [
                .font: bodyFont, .foregroundColor: NSColor.secondaryLabelColor, .paragraphStyle: para,
            ])
            // **bold** toggling
            var bold = false
            for (i, chunk) in body.components(separatedBy: "**").enumerated() {
                if i > 0 { bold.toggle() }
                guard !chunk.isEmpty else { continue }
                lineOut.append(NSAttributedString(string: chunk, attributes: [
                    .font: bold ? NSFont.systemFont(ofSize: 12.5, weight: .semibold) : bodyFont,
                    .foregroundColor: NSColor.labelColor,
                    .paragraphStyle: para,
                ]))
            }
            lineOut.append(NSAttributedString(string: "\n"))
            out.append(lineOut)
        }
        return out
    }

    static func clock(_ secs: Double) -> String {
        let s = max(0, Int(secs.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec)
                     : String(format: "%d:%02d", m, sec)
    }

    static func duration(_ secs: Int) -> String {
        if secs < 60 { return "\(secs)s" }
        let m = secs / 60
        if m < 60 { return "\(m) min" }
        return String(format: "%dh %02dm", m / 60, m % 60)
    }

    static func metaLine(for r: CallRecordingSummary) -> String {
        var parts: [String] = []
        if let t = r.createdAt.map(thRelativeTime), !t.isEmpty { parts.append(t) }
        if let d = r.durationSecs, d > 0 { parts.append(duration(d)) }
        if let src = r.sourceApp, !src.isEmpty { parts.append(src) }
        if r.actionItemCount > 0 {
            parts.append("\(r.actionItemCount) action\(r.actionItemCount == 1 ? "" : "s")")
        }
        return parts.joined(separator: "  ·  ")
    }

    private func sourceSymbol(_ r: CallRecordingSummary) -> String {
        switch (r.sourceApp ?? "").lowercased() {
        case "speakerphone": return "speaker.wave.2.fill"
        case "meeting", "in person", "in-person": return "person.2.fill"
        case "": return "waveform"
        default: return "phone.fill"
        }
    }

    // MARK: - Table

    func numberOfRows(in tableView: NSTableView) -> Int { filtered.count }
    func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? { THRowView() }

    @objc private func rowActivated() {
        let row = table.clickedRow
        guard row >= 0, row < filtered.count else { return }
        showDetail(filtered[row])
    }

    @objc private func viewButtonTapped(_ sender: NSButton) {
        guard sender.tag >= 0, sender.tag < filtered.count else { return }
        showDetail(filtered[sender.tag])
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let r = filtered[row]
        let cell = NSTableCellView()

        let well = NSView()
        well.wantsLayer = true
        well.layer?.cornerRadius = 10
        well.layer?.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.14).cgColor
        well.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: sourceSymbol(r), accessibilityDescription: nil)
        icon.symbolConfiguration = .init(pointSize: 14, weight: .semibold)
        icon.contentTintColor = .controlAccentColor
        icon.translatesAutoresizingMaskIntoConstraints = false
        well.addSubview(icon)

        let name = NSTextField(labelWithString: r.title)
        name.font = .systemFont(ofSize: 13, weight: .semibold)
        name.lineBreakMode = .byTruncatingTail
        name.translatesAutoresizingMaskIntoConstraints = false

        let meta = NSTextField(labelWithString: Self.metaLine(for: r))
        meta.font = .systemFont(ofSize: 11)
        meta.textColor = .secondaryLabelColor
        meta.lineBreakMode = .byTruncatingTail
        meta.translatesAutoresizingMaskIntoConstraints = false

        let textCol = NSStackView(views: [name, meta])
        textCol.orientation = .vertical
        textCol.alignment = .leading
        textCol.spacing = 2

        // Who was on the call — contact first, then derived voices.
        var tagNames: [String] = []
        if let c = r.contactName, !c.isEmpty { tagNames.append(c) }
        for p in r.participants where !tagNames.contains(p) { tagNames.append(p) }
        if !tagNames.isEmpty || r.partial {
            let tags = NSStackView()
            tags.orientation = .horizontal
            tags.spacing = 4
            for n in tagNames.prefix(3) {
                tags.addArrangedSubview(thTag(n, tint: Self.speakerColor(n)))
            }
            if tagNames.count > 3 { tags.addArrangedSubview(thTag("+\(tagNames.count - 3)", tint: .secondaryLabelColor)) }
            if r.partial { tags.addArrangedSubview(thTag("partial", tint: .systemOrange)) }
            textCol.addArrangedSubview(tags)
        }

        let view = THButton(title: "View", style: .secondary, symbol: "text.alignleft",
                            target: self, action: #selector(viewButtonTapped(_:)))
        view.tag = row

        let rowStack = NSStackView(views: [well, textCol, NSView(), view])
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

extension CallsSectionView: NSTextFieldDelegate {
    func controlTextDidChange(_ obj: Notification) {
        applyFilter()
    }
}
