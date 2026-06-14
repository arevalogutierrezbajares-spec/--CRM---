import AppKit

/// A menu "chip": a rounded, subtly-filled button with an optional leading SF
/// symbol, a title, and a trailing chevron, that pops an NSMenu on click. A
/// purpose-built, good-looking replacement for the stock NSPopUpButton chrome,
/// which reads as heavy in a HUD panel. Two behaviors:
///  • sticky (default)  — keeps the chosen item as its title, accent-tinted when
///    a non-zero option is active (e.g. a chosen project / priority).
///  • `resetsAfterSelect` — always shows item 0 as a placeholder (e.g. an "@
///    mention" action that inserts and resets).
final class THMenuButton: NSView {
    private var titles: [String] = [""]
    private(set) var selectedIndex = 0
    var onSelect: ((Int) -> Void)?
    var resetsAfterSelect = false
    var leadingSymbol: String?
    /// The chip locks to exactly this width — predictable, never stretched or
    /// overflowing in a stack. Text inside truncates with a tail ellipsis.
    var maxWidth: CGFloat = 150 { didSet { invalidateIntrinsicContentSize() } }

    private var hovering = false

    init(symbol: String? = nil) {
        super.init(frame: .zero)
        leadingSymbol = symbol
        wantsLayer = true
        // Hold size: a stack must never stretch or squeeze the chip.
        setContentHuggingPriority(.required, for: .horizontal)
        setContentHuggingPriority(.required, for: .vertical)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .vertical)
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    func setTitles(_ t: [String], selected: Int = 0) {
        titles = t.isEmpty ? [""] : t
        selectedIndex = min(max(0, selected), titles.count - 1)
        needsDisplay = true
    }

    private var displayTitle: String {
        if resetsAfterSelect { return titles.first ?? "" }
        return titles.indices.contains(selectedIndex) ? titles[selectedIndex] : ""
    }
    private var isActive: Bool { !resetsAfterSelect && selectedIndex > 0 }
    private var labelFont: NSFont { .systemFont(ofSize: 12.5, weight: .medium) }

    override var intrinsicContentSize: NSSize { NSSize(width: maxWidth, height: 28) }
    override var isFlipped: Bool { false }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.activeInActiveApp, .mouseEnteredAndExited, .inVisibleRect],
                                       owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }

    override func mouseDown(with event: NSEvent) {
        let menu = NSMenu()
        for (i, t) in titles.enumerated() {
            let item = NSMenuItem(title: t, action: #selector(menuPicked(_:)), keyEquivalent: "")
            item.target = self
            item.tag = i
            if !resetsAfterSelect && i == selectedIndex { item.state = .on }
            menu.addItem(item)
        }
        menu.minimumWidth = bounds.width
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: bounds.height + 4), in: self)
    }

    @objc private func menuPicked(_ sender: NSMenuItem) {
        let idx = sender.tag
        if !resetsAfterSelect { selectedIndex = idx }
        needsDisplay = true
        onSelect?(idx)
    }

    override func draw(_ dirtyRect: NSRect) {
        let accent = NSColor.controlAccentColor
        let bg: NSColor = isActive
            ? accent.withAlphaComponent(hovering ? 0.22 : 0.14)
            : NSColor.labelColor.withAlphaComponent(hovering ? 0.10 : 0.06)
        bg.setFill()
        NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 7, yRadius: 7).fill()

        let fg: NSColor = isActive ? accent : .labelColor
        var x: CGFloat = 10

        if let leadingSymbol, let img = NSImage(systemSymbolName: leadingSymbol, accessibilityDescription: nil) {
            let t = img.tinted(fg.withAlphaComponent(0.9))
            let isz: CGFloat = 12
            t.draw(in: NSRect(x: x, y: (bounds.height - isz) / 2, width: isz, height: isz))
            x += isz + 6
        }

        // Chevron at the right edge; text fills the gap between, truncating.
        let chevronCx = bounds.width - 13, chevronCy = bounds.height / 2
        let textRect = NSRect(x: x, y: 0, width: max(0, chevronCx - 7 - x), height: bounds.height)
        let para = NSMutableParagraphStyle(); para.lineBreakMode = .byTruncatingTail
        let s = NSAttributedString(string: displayTitle, attributes: [
            .foregroundColor: fg, .font: labelFont, .paragraphStyle: para,
        ])
        let h = s.size().height
        s.draw(in: NSRect(x: textRect.minX, y: (bounds.height - h) / 2, width: textRect.width, height: h))

        let chevron = NSBezierPath()
        chevron.move(to: NSPoint(x: chevronCx - 3.5, y: chevronCy + 2))
        chevron.line(to: NSPoint(x: chevronCx, y: chevronCy - 2.5))
        chevron.line(to: NSPoint(x: chevronCx + 3.5, y: chevronCy + 2))
        chevron.lineWidth = 1.4
        chevron.lineCapStyle = .round
        chevron.lineJoinStyle = .round
        fg.withAlphaComponent(0.6).setStroke()
        chevron.stroke()
    }
}

/// A rounded, padded single-line text input — the Apple-style field look
/// (subtle fill + hairline border) instead of the default beveled NSTextField.
final class THInput: NSView {
    let field = NSTextField()

    init(placeholder: String) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 8

        field.placeholderString = placeholder
        field.font = .systemFont(ofSize: 13)
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.lineBreakMode = .byTruncatingTail
        field.translatesAutoresizingMaskIntoConstraints = false
        field.cell?.usesSingleLineMode = true
        addSubview(field)
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            field.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            field.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: 30),
        ])
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    var stringValue: String {
        get { field.stringValue }
        set { field.stringValue = newValue }
    }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 0.5, dy: 0.5)
        NSColor.labelColor.withAlphaComponent(0.05).setFill()
        let path = NSBezierPath(roundedRect: r, xRadius: 8, yRadius: 8)
        path.fill()
        NSColor.labelColor.withAlphaComponent(0.12).setStroke()
        path.lineWidth = 1
        path.stroke()
    }
}

/// A rounded, padded multiline text area with a placeholder — the note/compose
/// surface. Matches THInput's look (subtle fill + hairline border).
final class THTextArea: NSView, NSTextViewDelegate {
    let textView = NSTextView()
    private let scroll = NSScrollView()
    private let placeholder = NSTextField(labelWithString: "")

    init(placeholder text: String) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 10

        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.borderType = .noBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false

        textView.delegate = self
        textView.isEditable = true
        textView.isRichText = false
        textView.drawsBackground = false
        textView.font = .systemFont(ofSize: 13)
        textView.textContainerInset = NSSize(width: 8, height: 10)
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.textContainer?.widthTracksTextView = true
        scroll.documentView = textView

        placeholder.stringValue = text
        placeholder.font = .systemFont(ofSize: 13)
        placeholder.textColor = .tertiaryLabelColor
        placeholder.translatesAutoresizingMaskIntoConstraints = false

        addSubview(scroll)
        addSubview(placeholder)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor, constant: 2),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -2),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            placeholder.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            placeholder.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 13),
        ])
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    var string: String {
        get { textView.string }
        set { textView.string = newValue; placeholder.isHidden = !newValue.isEmpty }
    }

    func textDidChange(_ notification: Notification) {
        placeholder.isHidden = !textView.string.isEmpty
    }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 0.5, dy: 0.5)
        NSColor.labelColor.withAlphaComponent(0.05).setFill()
        let path = NSBezierPath(roundedRect: r, xRadius: 10, yRadius: 10)
        path.fill()
        NSColor.labelColor.withAlphaComponent(0.12).setStroke()
        path.lineWidth = 1
        path.stroke()
    }
}

/// A circular initials avatar with a deterministic color from the name — gives
/// feed/notification rows a face and a sense of who's who.
final class AvatarView: NSView {
    private let name: String
    private let diameter: CGFloat

    init(name: String, diameter: CGFloat = 28) {
        self.name = name
        self.diameter = diameter
        super.init(frame: NSRect(x: 0, y: 0, width: diameter, height: diameter))
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: diameter).isActive = true
        heightAnchor.constraint(equalToConstant: diameter).isActive = true
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private static let palette: [NSColor] = [
        .systemBlue, .systemIndigo, .systemPurple, .systemPink, .systemTeal,
        .systemGreen, .systemOrange, .systemRed, .systemBrown,
    ]

    private var color: NSColor {
        var hash = 5381
        for b in name.utf8 { hash = ((hash << 5) &+ hash) &+ Int(b) }
        return Self.palette[abs(hash) % Self.palette.count]
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let chars = parts.compactMap { $0.first }.map(String.init)
        return chars.joined().uppercased().isEmpty ? "?" : chars.joined().uppercased()
    }

    override func draw(_ dirtyRect: NSRect) {
        let c = color
        c.withAlphaComponent(0.9).setFill()
        NSBezierPath(ovalIn: bounds).fill()
        let para = NSMutableParagraphStyle(); para.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: diameter * 0.42, weight: .semibold),
            .paragraphStyle: para,
        ]
        let s = NSAttributedString(string: initials, attributes: attrs)
        let h = s.size().height
        s.draw(in: NSRect(x: 0, y: (bounds.height - h) / 2, width: bounds.width, height: h))
    }
}

/// A table row that lifts to a subtle rounded highlight on hover — the small
/// touch that makes a list feel alive and Mac-native.
final class THRowView: NSTableRowView {
    private var hovering = false

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds,
                                       options: [.activeInActiveApp, .mouseEnteredAndExited, .inVisibleRect],
                                       owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }

    override func drawBackground(in dirtyRect: NSRect) {
        super.drawBackground(in: dirtyRect)
        guard hovering else { return }
        let r = bounds.insetBy(dx: 6, dy: 1)
        NSColor.labelColor.withAlphaComponent(0.05).setFill()
        NSBezierPath(roundedRect: r, xRadius: 8, yRadius: 8).fill()
    }
    // Never draw the stock blue selection — these lists are content, not pickers.
    override func drawSelection(in dirtyRect: NSRect) {}
}

/// A small rounded pill label (e.g. a `#project` ref or a meta tag).
final class THTag: NSView {
    private let text: String
    private let tint: NSColor

    init(_ text: String, tint: NSColor = .controlAccentColor) {
        self.text = text
        self.tint = tint
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    private var labelFont: NSFont { .systemFont(ofSize: 11, weight: .medium) }

    override var intrinsicContentSize: NSSize {
        let w = (text as NSString).size(withAttributes: [.font: labelFont]).width
        return NSSize(width: ceil(w) + 16, height: 18)
    }

    override func draw(_ dirtyRect: NSRect) {
        tint.withAlphaComponent(0.14).setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 5, yRadius: 5).fill()
        let para = NSMutableParagraphStyle(); para.alignment = .center
        let s = NSAttributedString(string: text, attributes: [
            .foregroundColor: tint, .font: labelFont, .paragraphStyle: para,
        ])
        let h = s.size().height
        s.draw(in: NSRect(x: 0, y: (bounds.height - h) / 2, width: bounds.width, height: h))
    }
}

func thTag(_ text: String, tint: NSColor = .controlAccentColor) -> NSView { THTag(text, tint: tint) }

/// A centered empty-state: large SF symbol + title + subtitle. Pin its center
/// to the list it stands in for.
func thEmptyState(symbol: String, title: String, subtitle: String) -> NSView {
    let icon = NSImageView()
    icon.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
    icon.symbolConfiguration = .init(pointSize: 30, weight: .regular)
    icon.contentTintColor = .tertiaryLabelColor

    let t = NSTextField(labelWithString: title)
    t.font = .systemFont(ofSize: 13, weight: .medium)
    t.textColor = .secondaryLabelColor
    t.alignment = .center

    let sub = NSTextField(labelWithString: subtitle)
    sub.font = .systemFont(ofSize: 11.5)
    sub.textColor = .tertiaryLabelColor
    sub.alignment = .center

    let stack = NSStackView(views: [icon, t, sub])
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 6
    stack.setCustomSpacing(10, after: icon)
    stack.translatesAutoresizingMaskIntoConstraints = false
    return stack
}
