import AppKit
import CaptureCore

// Shared AppKit building blocks for the Town Hall window, kept here so the five
// section views stay lean and consistent. Style mirrors ControlWindow's
// hand-drawn look (filled pill primary button, system colors, SF symbols).

/// The Town Hall button system. Three variants:
///  • `.primary`   — filled accent, white text (the main action)
///  • `.secondary` — faint accent-tinted fill, accent text (supporting action)
///  • `.plain`     — no fill, secondary text, subtle hover (inline/row action)
/// Rounded, 28pt tall, hover feedback, optional leading SF symbol.
final class THButton: NSButton {
    enum Style { case primary, secondary, plain }

    private let style: Style
    private var hovering = false
    private var symbol: String?

    init(title: String, style: Style = .primary, symbol: String? = nil,
         target: AnyObject? = nil, action: Selector? = nil) {
        self.style = style
        self.symbol = symbol
        super.init(frame: .zero)
        self.title = title
        self.target = target
        self.action = action
        isBordered = false
        wantsLayer = true
        layer?.cornerRadius = 7
        layer?.masksToBounds = true
        focusRingType = .none
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    override var intrinsicContentSize: NSSize {
        let textW = (title as NSString).size(withAttributes: [.font: labelFont]).width
        let iconW: CGFloat = symbol == nil ? 0 : 18
        return NSSize(width: ceil(textW) + iconW + 26, height: 28)
    }

    private var labelFont: NSFont { .systemFont(ofSize: 12.5, weight: .semibold) }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
                                       owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }

    override func draw(_ dirtyRect: NSRect) {
        let accent = NSColor.controlAccentColor
        let fg: NSColor
        switch style {
        case .primary:
            let base = hovering ? (accent.blended(withFraction: 0.12, of: .white) ?? accent) : accent
            (isEnabled ? base : accent.withAlphaComponent(0.4)).setFill()
            bounds.fill()
            fg = .white
        case .secondary:
            (hovering ? accent.withAlphaComponent(0.24) : accent.withAlphaComponent(0.14)).setFill()
            bounds.fill()
            fg = accent
        case .plain:
            if hovering { NSColor.labelColor.withAlphaComponent(0.08).setFill(); bounds.fill() }
            fg = .secondaryLabelColor
        }

        var textX: CGFloat = 0
        let p = NSMutableParagraphStyle(); p.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: isEnabled ? fg : fg.withAlphaComponent(0.5),
            .font: labelFont, .paragraphStyle: p,
        ]
        let s = NSAttributedString(string: title, attributes: attrs)
        let textSize = s.size()

        if let symbol, let img = NSImage(systemSymbolName: symbol, accessibilityDescription: nil) {
            let tinted = img.tinted(fg)
            let iconSize: CGFloat = 13
            let totalW = iconSize + 6 + textSize.width
            let startX = (bounds.width - totalW) / 2
            tinted.draw(in: NSRect(x: startX, y: (bounds.height - iconSize) / 2, width: iconSize, height: iconSize))
            textX = startX + iconSize + 6
            s.draw(in: NSRect(x: textX, y: (bounds.height - textSize.height) / 2, width: textSize.width, height: textSize.height))
        } else {
            s.draw(in: NSRect(x: 0, y: (bounds.height - textSize.height) / 2, width: bounds.width, height: textSize.height))
        }
    }
}

extension NSImage {
    /// A copy tinted a solid color (for drawing SF symbols in custom buttons).
    func tinted(_ color: NSColor) -> NSImage {
        let img = NSImage(size: size)
        img.lockFocus()
        color.set()
        let rect = NSRect(origin: .zero, size: size)
        draw(in: rect)
        rect.fill(using: .sourceAtop)
        img.unlockFocus()
        img.isTemplate = false
        return img
    }
}

/// A sidebar nav row: SF-symbol icon + label, with a selected/hover background
/// pill and an optional red unread badge. Click reports via `onSelect`.
final class SidebarItem: NSView {
    var onSelect: (() -> Void)?
    var isSelected = false { didSet { updateAppearance() } }
    var badge: Int = 0 { didSet { updateBadge() } }

    private let icon = NSImageView()
    private let label = NSTextField(labelWithString: "")
    private let badgeLabel = NSTextField(labelWithString: "")
    private let badgePill = NSView()
    private var hovering = false { didSet { updateAppearance() } }

    init(symbol: String, title: String) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 7

        icon.image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)
        icon.symbolConfiguration = .init(pointSize: 13, weight: .medium)
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.imageScaling = .scaleProportionallyDown

        label.stringValue = title
        label.font = .systemFont(ofSize: 12.5, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.lineBreakMode = .byTruncatingTail

        badgePill.wantsLayer = true
        badgePill.layer?.cornerRadius = 8
        badgePill.layer?.backgroundColor = NSColor.systemRed.cgColor
        badgePill.translatesAutoresizingMaskIntoConstraints = false
        badgePill.isHidden = true

        badgeLabel.font = .systemFont(ofSize: 10, weight: .bold)
        badgeLabel.textColor = .white
        badgeLabel.alignment = .center
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badgePill.addSubview(badgeLabel)

        addSubview(icon)
        addSubview(label)
        addSubview(badgePill)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 32),
            icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 18),

            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 9),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            label.trailingAnchor.constraint(lessThanOrEqualTo: badgePill.leadingAnchor, constant: -6),

            badgePill.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            badgePill.centerYAnchor.constraint(equalTo: centerYAnchor),
            badgePill.heightAnchor.constraint(equalToConstant: 16),
            badgePill.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),

            badgeLabel.centerYAnchor.constraint(equalTo: badgePill.centerYAnchor),
            badgeLabel.leadingAnchor.constraint(equalTo: badgePill.leadingAnchor, constant: 5),
            badgeLabel.trailingAnchor.constraint(equalTo: badgePill.trailingAnchor, constant: -5),
        ])
        updateAppearance()
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
                                       owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true }
    override func mouseExited(with event: NSEvent) { hovering = false }
    override func mouseDown(with event: NSEvent) { onSelect?() }

    private func updateAppearance() {
        if isSelected {
            layer?.backgroundColor = NSColor.controlAccentColor.cgColor
            icon.contentTintColor = .white
            label.textColor = .white
        } else {
            layer?.backgroundColor = hovering
                ? NSColor.labelColor.withAlphaComponent(0.08).cgColor
                : NSColor.clear.cgColor
            icon.contentTintColor = .secondaryLabelColor
            label.textColor = .labelColor
        }
    }

    private func updateBadge() {
        badgePill.isHidden = badge <= 0
        badgeLabel.stringValue = badge > 99 ? "99+" : "\(badge)"
        // White badge reads better on the accent pill when the row is selected.
        badgePill.layer?.backgroundColor = (isSelected ? NSColor.white : NSColor.systemRed).cgColor
        badgeLabel.textColor = isSelected ? .controlAccentColor : .white
    }
}

/// A small section heading label.
func thSectionLabel(_ text: String) -> NSTextField {
    let l = NSTextField(labelWithString: text)
    l.font = .systemFont(ofSize: 11, weight: .semibold)
    l.textColor = .secondaryLabelColor
    return l
}

/// A vertically-scrolling NSTableView with one borderless full-width column,
/// automatic row heights, no header. Returns (scrollView, tableView).
func thMakeTable(rowHeight: CGFloat? = nil) -> (NSScrollView, NSTableView) {
    let table = NSTableView()
    table.headerView = nil
    table.backgroundColor = .clear
    table.style = .plain
    table.selectionHighlightStyle = .none
    table.intercellSpacing = NSSize(width: 0, height: 6)
    let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("c"))
    column.resizingMask = .autoresizingMask
    table.addTableColumn(column)
    if let rowHeight {
        table.rowHeight = rowHeight
        table.usesAutomaticRowHeights = false
    } else {
        table.usesAutomaticRowHeights = true
    }

    let scroll = NSScrollView()
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    scroll.borderType = .noBorder
    scroll.documentView = table
    scroll.translatesAutoresizingMaskIntoConstraints = false
    return (scroll, table)
}

/// Human "2h ago" style relative time from an ISO-8601 string. Falls back to "".
func thRelativeTime(_ iso: String?) -> String {
    guard let iso, let date = thParseISO(iso) else { return "" }
    let secs = -date.timeIntervalSinceNow
    if secs < 60 { return "just now" }
    if secs < 3600 { return "\(Int(secs / 60))m ago" }
    if secs < 86400 { return "\(Int(secs / 3600))h ago" }
    let days = Int(secs / 86400)
    if days < 7 { return "\(days)d ago" }
    let f = DateFormatter()
    f.dateFormat = "MMM d"
    return f.string(from: date)
}

private let thISOFormatters: [ISO8601DateFormatter] = {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return [withFraction, plain]
}()

func thParseISO(_ iso: String) -> Date? {
    for f in thISOFormatters { if let d = f.date(from: iso) { return d } }
    return nil
}

/// Pretty byte size, e.g. "1.2 MB".
func thFormatBytes(_ bytes: Int?) -> String {
    guard let bytes, bytes > 0 else { return "" }
    let units = ["B", "KB", "MB", "GB"]
    var value = Double(bytes); var i = 0
    while value >= 1024 && i < units.count - 1 { value /= 1024; i += 1 }
    return i == 0 ? "\(bytes) B" : String(format: "%.1f %@", value, units[i])
}

/// A view that accepts file drops and reports the dropped URLs. Draws an accent
/// border while a valid drag hovers. Used as the Files section's drop target.
final class DropZoneView: NSView {
    var onDrop: (([URL]) -> Void)?
    private var active = false { didSet { needsDisplay = true } }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        registerForDraggedTypes([.fileURL])
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        let hasFiles = !urls(from: sender).isEmpty
        active = hasFiles
        return hasFiles ? .copy : []
    }
    override func draggingExited(_ sender: NSDraggingInfo?) { active = false }
    override func draggingEnded(_ sender: NSDraggingInfo) { active = false }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        active = false
        let urls = urls(from: sender)
        guard !urls.isEmpty else { return false }
        onDrop?(urls)
        return true
    }

    private func urls(from sender: NSDraggingInfo) -> [URL] {
        let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
        let objs = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: opts)
        return (objs as? [URL]) ?? []
    }

    override func draw(_ dirtyRect: NSRect) {
        guard active else { return }
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 8, yRadius: 8)
        NSColor.controlAccentColor.withAlphaComponent(0.08).setFill()
        path.fill()
        NSColor.controlAccentColor.setStroke()
        path.lineWidth = 2
        path.setLineDash([6, 4], count: 2, phase: 0)
        path.stroke()
    }
}
