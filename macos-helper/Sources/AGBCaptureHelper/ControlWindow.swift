import AppKit
import QuartzCore
import CaptureCore

/// The single AGB panel. Two modes in ONE window (no separate Town Hall window):
///
///  • **Compact** — the always-visible floating control: the animated AGB
///    monogram, the current state, and one big Start/Stop button. One click from
///    recording, never dependent on the menu bar.
///  • **Expanded** — the same panel grown into a workspace: a slim header strip
///    (collapse, monogram, live state, a compact record button, gear/transcript)
///    above an embedded `TownHallPane` (sidebar nav + content: feed,
///    notifications, action items, files, notes). Everything lives here.
///
/// The monogram doubles as a live indicator (calm breathe idle / red equalizer
/// wave recording). The panel grows from and collapses back to its top-right
/// anchor with an animated frame change + content crossfade. All methods run on
/// the main thread.
final class ControlWindow: NSObject {

    enum Mode: Equatable {
        case idle(label: String)
        case detected
        case capturing(elapsed: String)
    }

    static let windowTitle = "AGB Capture"

    private static let compactSize = NSSize(width: 300, height: 168)
    private static let expandedSize = NSSize(width: 880, height: 600)

    private var panel: NSPanel?

    // Compact-mode views.
    private var compactContainer: NSView?
    private var logo: LogoView?
    private var titleLabel: NSTextField?
    private var subLabel: NSTextField?
    private var button: PillButton?
    private var confirmOverlay: NSButton?

    // Expanded-mode views (built lazily on first expand).
    private var expandedContainer: NSView?
    private var headerLogo: LogoView?
    private var headerStateLabel: NSTextField?
    private var headerButton: PillButton?
    let pane = TownHallPane()

    private var expanded = false
    /// Last applied recorder mode, re-applied to whichever mode is on screen.
    private var lastMode: Mode = .idle(label: "Idle — watching for calls")

    // Confirmation flash state (compact).
    private var confirming = false
    private var pendingMode: Mode?
    private var confirmTimer: Timer?
    private var pendingOpenURL: URL?

    var onToggle: (() -> Void)?
    var onConfigure: (() -> Void)?
    var onToggleTranscript: (() -> Void)?
    /// Fired the first time Town Hall is opened (so the app starts the poller +
    /// requests notification authorization).
    var onOpenTownHall: (() -> Void)?

    // MARK: - Show

    func show() {
        if let panel {
            panel.orderFrontRegardless()
            (expanded ? headerLogo : logo)?.kick()
            return
        }

        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: Self.compactSize),
            styleMask: [.nonactivatingPanel, .titled, .closable, .utilityWindow, .hudWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = Self.windowTitle
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        self.panel = panel

        let compact = buildCompactContainer()
        self.compactContainer = compact
        panel.contentView = compact

        if let screen = NSScreen.main {
            let frame = PanelLayout.controlFrame(visible: screen.visibleFrame, size: panel.frame.size)
            panel.setFrameOrigin(frame.origin)
        }
        panel.orderFrontRegardless()
        applyMode(lastMode)
    }

    // MARK: - Compact container

    private func buildCompactContainer() -> NSView {
        let container = NSView(frame: NSRect(origin: .zero, size: Self.compactSize))
        container.autoresizingMask = [.width, .height]

        let logo = LogoView(frame: NSRect(x: 0, y: 0, width: 56, height: 36))
        logo.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(logo)
        self.logo = logo

        let title = NSTextField(labelWithString: "Ready")
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.textColor = .labelColor
        title.alignment = .center
        title.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(title)
        self.titleLabel = title

        let sub = NSTextField(labelWithString: "Watching for calls")
        sub.font = .systemFont(ofSize: 11, weight: .regular)
        sub.textColor = .secondaryLabelColor
        sub.alignment = .center
        sub.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(sub)
        self.subLabel = sub

        let btn = PillButton(title: "Start Recording")
        btn.target = self
        btn.action = #selector(toggleTapped)
        btn.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(btn)
        self.button = btn

        let overlay = NSButton(title: "", target: self, action: #selector(openFiledTapped))
        overlay.isBordered = false
        overlay.isTransparent = true
        overlay.isHidden = true
        overlay.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(overlay)
        self.confirmOverlay = overlay

        let gear = iconButton("gearshape", tip: "Configure…", action: #selector(configureTapped))
        container.addSubview(gear)
        let transcriptBtn = iconButton("captions.bubble", tip: "Show / hide live transcript", action: #selector(transcriptTapped))
        container.addSubview(transcriptBtn)
        let townHallBtn = iconButton("bubble.left.and.bubble.right", tip: "Open Town Hall", action: #selector(townHallTapped))
        container.addSubview(townHallBtn)

        NSLayoutConstraint.activate([
            gear.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            gear.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -13),
            gear.widthAnchor.constraint(equalToConstant: 20),
            gear.heightAnchor.constraint(equalToConstant: 20),

            transcriptBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            transcriptBtn.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 13),
            transcriptBtn.widthAnchor.constraint(equalToConstant: 20),
            transcriptBtn.heightAnchor.constraint(equalToConstant: 20),

            townHallBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            townHallBtn.leadingAnchor.constraint(equalTo: transcriptBtn.trailingAnchor, constant: 8),
            townHallBtn.widthAnchor.constraint(equalToConstant: 20),
            townHallBtn.heightAnchor.constraint(equalToConstant: 20),

            logo.topAnchor.constraint(equalTo: container.topAnchor, constant: 14),
            logo.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            logo.widthAnchor.constraint(equalToConstant: 56),
            logo.heightAnchor.constraint(equalToConstant: 36),

            title.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 9),
            title.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            sub.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 2),
            sub.centerXAnchor.constraint(equalTo: container.centerXAnchor),

            btn.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            btn.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),
            btn.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -16),
            btn.heightAnchor.constraint(equalToConstant: 42),

            overlay.topAnchor.constraint(equalTo: container.topAnchor),
            overlay.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            overlay.bottomAnchor.constraint(equalTo: btn.topAnchor, constant: -6),
        ])
        return container
    }

    // MARK: - Expanded container

    private func buildExpandedContainerIfNeeded() -> NSView {
        if let expandedContainer { return expandedContainer }

        let container = NSView(frame: NSRect(origin: .zero, size: Self.expandedSize))

        // Header strip.
        let header = NSView()
        header.translatesAutoresizingMaskIntoConstraints = false

        let collapse = iconButton("sidebar.left", tip: "Collapse", action: #selector(townHallTapped))
        let hLogo = LogoView(frame: .zero)
        hLogo.translatesAutoresizingMaskIntoConstraints = false
        self.headerLogo = hLogo

        let state = NSTextField(labelWithString: "Town Hall")
        state.font = .systemFont(ofSize: 13, weight: .semibold)
        state.textColor = .labelColor
        state.translatesAutoresizingMaskIntoConstraints = false
        self.headerStateLabel = state

        let recordBtn = PillButton(title: "Start Recording")
        recordBtn.target = self
        recordBtn.action = #selector(toggleTapped)
        recordBtn.translatesAutoresizingMaskIntoConstraints = false
        self.headerButton = recordBtn

        let gear = iconButton("gearshape", tip: "Configure…", action: #selector(configureTapped))
        let transcriptBtn = iconButton("captions.bubble", tip: "Show / hide live transcript", action: #selector(transcriptTapped))

        for v in [collapse, hLogo, state, recordBtn, transcriptBtn, gear] { header.addSubview(v) }

        let divider = NSBox(); divider.boxType = .separator
        divider.translatesAutoresizingMaskIntoConstraints = false

        pane.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(header)
        container.addSubview(divider)
        container.addSubview(pane)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: container.topAnchor),
            header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 52),

            collapse.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 14),
            collapse.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            collapse.widthAnchor.constraint(equalToConstant: 20),
            collapse.heightAnchor.constraint(equalToConstant: 20),

            hLogo.leadingAnchor.constraint(equalTo: collapse.trailingAnchor, constant: 12),
            hLogo.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            hLogo.widthAnchor.constraint(equalToConstant: 34),
            hLogo.heightAnchor.constraint(equalToConstant: 24),

            state.leadingAnchor.constraint(equalTo: hLogo.trailingAnchor, constant: 10),
            state.centerYAnchor.constraint(equalTo: header.centerYAnchor),

            gear.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -14),
            gear.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            gear.widthAnchor.constraint(equalToConstant: 20),
            gear.heightAnchor.constraint(equalToConstant: 20),

            transcriptBtn.trailingAnchor.constraint(equalTo: gear.leadingAnchor, constant: -10),
            transcriptBtn.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            transcriptBtn.widthAnchor.constraint(equalToConstant: 20),
            transcriptBtn.heightAnchor.constraint(equalToConstant: 20),

            recordBtn.trailingAnchor.constraint(equalTo: transcriptBtn.leadingAnchor, constant: -14),
            recordBtn.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            recordBtn.widthAnchor.constraint(equalToConstant: 168),
            recordBtn.heightAnchor.constraint(equalToConstant: 32),

            divider.topAnchor.constraint(equalTo: header.bottomAnchor),
            divider.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            divider.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            divider.heightAnchor.constraint(equalToConstant: 1),

            pane.topAnchor.constraint(equalTo: divider.bottomAnchor),
            pane.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pane.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            pane.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        self.expandedContainer = container
        return container
    }

    // MARK: - Expand / collapse

    private var hasOpenedTownHall = false

    @objc private func townHallTapped() { setExpanded(!expanded, animated: true) }

    func setExpanded(_ value: Bool, animated: Bool) {
        guard let panel, expanded != value else { return }
        expanded = value

        let targetSize = value ? Self.expandedSize : Self.compactSize
        let newContent = value ? buildExpandedContainerIfNeeded() : (compactContainer ?? buildCompactContainer())

        // Keep the panel's top-right corner fixed so it grows left + down.
        let old = panel.frame
        let topRight = NSPoint(x: old.maxX, y: old.maxY)
        var newFrame = NSRect(x: topRight.x - targetSize.width,
                              y: topRight.y - targetSize.height,
                              width: targetSize.width, height: targetSize.height)
        if let visible = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            newFrame.origin.x = max(visible.minX + 8, min(newFrame.origin.x, visible.maxX - targetSize.width - 8))
            newFrame.origin.y = max(visible.minY + 8, min(newFrame.origin.y, visible.maxY - targetSize.height - 8))
        }

        panel.contentView = newContent
        applyMode(lastMode)

        if value {
            pane.activate()
            if !hasOpenedTownHall { hasOpenedTownHall = true; onOpenTownHall?() }
            NSApp.activate(ignoringOtherApps: true)
        }

        if animated {
            newContent.alphaValue = 0
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.22
                ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(newFrame, display: true)
                newContent.animator().alphaValue = 1
            }
        } else {
            panel.setFrame(newFrame, display: true)
            newContent.alphaValue = 1
        }
        if value { panel.makeKeyAndOrderFront(nil) } else { panel.orderFrontRegardless() }
    }

    // MARK: - Actions

    @objc private func toggleTapped() { onToggle?() }
    @objc private func configureTapped() { onConfigure?() }
    @objc private func transcriptTapped() { onToggleTranscript?() }

    // MARK: - State

    func update(_ mode: Mode) {
        lastMode = mode
        if confirming {
            if case .capturing = mode {
                endConfirmation(apply: false)
            } else {
                pendingMode = mode
                return
            }
        }
        applyMode(mode)
    }

    /// Apply a mode to whichever container is on screen (compact + expanded
    /// header share the same recorder state).
    private func applyMode(_ mode: Mode) {
        switch mode {
        case .idle(let label):
            titleLabel?.stringValue = "Ready"
            subLabel?.stringValue = label
            logo?.set(color: .labelColor, motion: .calm)
            button?.configure(title: "Start Recording", fill: .systemRed, glyph: .record)
            headerLogo?.set(color: .labelColor, motion: .calm)
            headerStateLabel?.stringValue = "Town Hall"
            headerButton?.configure(title: "Start Recording", fill: .systemRed, glyph: .record)
        case .detected:
            titleLabel?.stringValue = "Call detected"
            subLabel?.stringValue = "Record this call?"
            logo?.set(color: .systemOrange, motion: .active)
            button?.configure(title: "Record This Call", fill: .systemRed, glyph: .record)
            headerLogo?.set(color: .systemOrange, motion: .active)
            headerStateLabel?.stringValue = "Call detected"
            headerButton?.configure(title: "Record This Call", fill: .systemRed, glyph: .record)
        case .capturing(let elapsed):
            titleLabel?.stringValue = "Recording"
            subLabel?.stringValue = "Tap to stop · \(elapsed)"
            logo?.set(color: .systemRed, motion: .active)
            button?.configure(title: "Stop  ·  \(elapsed)", fill: .controlAccentColor, glyph: .stop)
            headerLogo?.set(color: .systemRed, motion: .active)
            headerStateLabel?.stringValue = "Recording · \(elapsed)"
            headerButton?.configure(title: "Stop · \(elapsed)", fill: .controlAccentColor, glyph: .stop)
        }
    }

    /// "Saved to CRM" confirmation in the compact panel (and a brief header note
    /// when expanded).
    func flashFiled(title: String, detail: String, warning: Bool, url: URL?) {
        if expanded {
            headerStateLabel?.stringValue = warning ? "Saved — check it" : "Saved to CRM"
            return
        }
        guard button != nil else { return }
        confirming = true
        pendingMode = nil
        pendingOpenURL = url
        confirmTimer?.invalidate()

        let base = warning ? "Saved — check it" : "Saved to CRM"
        titleLabel?.stringValue = url != nil ? "\(base)  ↗" : base
        subLabel?.stringValue = url != nil ? "\(detail) — tap to open" : detail
        logo?.set(color: warning ? .systemOrange : .systemGreen, motion: .calm)
        button?.configure(title: "Start Recording", fill: .systemRed, glyph: .record)
        confirmOverlay?.isHidden = (url == nil)

        confirmTimer = Timer.scheduledTimer(withTimeInterval: 7, repeats: false) { [weak self] _ in
            self?.endConfirmation(apply: true)
        }
    }

    @objc private func openFiledTapped() {
        if let url = pendingOpenURL { NSWorkspace.shared.open(url) }
        endConfirmation(apply: true)
    }

    private func endConfirmation(apply: Bool) {
        confirming = false
        confirmTimer?.invalidate()
        confirmTimer = nil
        confirmOverlay?.isHidden = true
        pendingOpenURL = nil
        let next = pendingMode ?? .idle(label: "Idle — watching for calls")
        pendingMode = nil
        if apply { applyMode(next) }
    }

    // MARK: - Helpers

    private func iconButton(_ symbol: String, tip: String, action: Selector) -> NSButton {
        let b = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: tip) ?? NSImage(),
                         target: self, action: action)
        b.isBordered = false
        b.bezelStyle = .regularSquare
        b.contentTintColor = .secondaryLabelColor
        b.toolTip = tip
        b.translatesAutoresizingMaskIntoConstraints = false
        return b
    }
}

// MARK: - LogoView

/// The AGB monogram (public/logos/crm.svg) as three filled CAShapeLayers that
/// animate. Calm: a slow synchronized breathe. Active: a staggered opacity wave
/// across the three strokes — an equalizer-like pulse that reads as "listening".
private final class LogoView: NSView {
    enum Motion { case calm, active }

    private let strokes = [CAShapeLayer(), CAShapeLayer(), CAShapeLayer()]
    private var color: NSColor = .labelColor
    private var motion: Motion = .calm

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        strokes.forEach { layer?.addSublayer($0) }
        rebuild()
        apply()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    override var isFlipped: Bool { false }
    override func layout() { super.layout(); rebuild() }

    private func rebuild() {
        let bx: CGFloat = 8, by: CGFloat = 44, bw: CGFloat = 184, bh: CGFloat = 122
        let pad: CGFloat = 1
        let scale = min((bounds.width - pad * 2) / bw, (bounds.height - pad * 2) / bh)
        let drawW = bw * scale, drawH = bh * scale
        let ox = (bounds.width - drawW) / 2, oy = (bounds.height - drawH) / 2
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + (x - bx) * scale, y: bounds.height - (oy + (y - by) * scale))
        }
        let shapes: [[(CGFloat, CGFloat)]] = [
            [(62, 44), (84, 44), (44, 166), (8, 166)],
            [(89, 44), (111, 44), (111, 166), (89, 166)],
            [(116, 44), (138, 44), (192, 166), (156, 166)],
        ]
        for (i, pts) in shapes.enumerated() {
            let path = CGMutablePath()
            path.move(to: p(pts[0].0, pts[0].1))
            for q in pts.dropFirst() { path.addLine(to: p(q.0, q.1)) }
            path.closeSubpath()
            strokes[i].frame = bounds
            strokes[i].path = path
            strokes[i].fillColor = color.cgColor
        }
    }

    func set(color: NSColor, motion: Motion) {
        self.color = color
        strokes.forEach { $0.fillColor = color.cgColor }
        if self.motion != motion || strokes[0].animation(forKey: "wave") == nil {
            self.motion = motion
            apply()
        }
    }

    func kick() { apply() }

    private func apply() {
        for (i, l) in strokes.enumerated() {
            l.removeAnimation(forKey: "wave")
            let a = CABasicAnimation(keyPath: "opacity")
            switch motion {
            case .calm:
                a.fromValue = 0.55
                a.toValue = 1.0
                a.duration = 1.6
                a.beginTime = CACurrentMediaTime() + Double(i) * 0.12
            case .active:
                a.fromValue = 0.2
                a.toValue = 1.0
                a.duration = 0.5
                a.beginTime = CACurrentMediaTime() + Double(i) * 0.16
            }
            a.autoreverses = true
            a.repeatCount = .infinity
            a.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            l.add(a, forKey: "wave")
        }
    }
}

// MARK: - PillButton

/// A filled, rounded, full-width button with a hover state and a leading glyph
/// (record dot / stop square) drawn in code.
private final class PillButton: NSButton {
    enum Glyph { case record, stop }

    private var fill: NSColor = .systemRed
    private var glyph: Glyph = .record
    private var hovering = false
    private var pressed = false
    private static let radius: CGFloat = 10

    init(title: String) {
        super.init(frame: .zero)
        self.title = title
        isBordered = false
        wantsLayer = true
        layer?.cornerRadius = Self.radius
        layer?.masksToBounds = false
        // A soft drop shadow gives the button real depth (Apple's primary buttons
        // sit slightly above the surface). masksToBounds stays off so it shows.
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.22
        layer?.shadowRadius = 4
        layer?.shadowOffset = CGSize(width: 0, height: -1)
        focusRingType = .none
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    func configure(title: String, fill: NSColor, glyph: Glyph) {
        self.title = title
        self.fill = fill
        self.glyph = glyph
        layer?.shadowColor = fill.withAlphaComponent(0.5).cgColor
        needsDisplay = true
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
            owner: self, userInfo: nil))
    }
    override func mouseEntered(with event: NSEvent) { hovering = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovering = false; needsDisplay = true }
    override func mouseDown(with event: NSEvent) {
        pressed = true; needsDisplay = true
        super.mouseDown(with: event)   // tracks the press + fires the action on mouse-up
        pressed = false; needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds, xRadius: Self.radius, yRadius: Self.radius)

        // Vertical gradient: a touch lighter at the top, slightly deeper at the
        // bottom — the subtle dimensionality of a modern primary button.
        let topLift: CGFloat = hovering ? 0.22 : 0.14
        let top = fill.blended(withFraction: topLift, of: .white) ?? fill
        let bottom = fill.blended(withFraction: 0.10, of: .black) ?? fill
        (NSGradient(starting: top, ending: bottom))?.draw(in: path, angle: -90)

        if pressed { NSColor.black.withAlphaComponent(0.16).setFill(); path.fill() }

        // Crisp top highlight + hairline bottom edge for definition.
        NSColor.white.withAlphaComponent(0.22).setStroke()
        let hi = NSBezierPath()
        hi.move(to: NSPoint(x: Self.radius, y: bounds.maxY - 0.5))
        hi.line(to: NSPoint(x: bounds.maxX - Self.radius, y: bounds.maxY - 0.5))
        hi.lineWidth = 1; hi.stroke()
        NSColor.black.withAlphaComponent(0.18).setStroke()
        let border = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                                  xRadius: Self.radius, yRadius: Self.radius)
        border.lineWidth = 1; border.stroke()

        let gSize: CGFloat = 10
        let textColor = NSColor.white
        let p = NSMutableParagraphStyle(); p.alignment = .center
        let textShadow = NSShadow()
        textShadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
        textShadow.shadowOffset = NSSize(width: 0, height: -0.5)
        textShadow.shadowBlurRadius = 1
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: textColor,
            .font: NSFont.systemFont(ofSize: 13.5, weight: .semibold),
            .paragraphStyle: p,
            .shadow: textShadow,
        ]
        let s = NSAttributedString(string: title, attributes: attrs)
        let textSize = s.size()

        // Center the glyph + label as a unit so it reads as one balanced control.
        let gap: CGFloat = 8
        let groupW = gSize + gap + textSize.width
        let startX = (bounds.width - groupW) / 2
        let gy = (bounds.height - gSize) / 2
        textColor.setFill()
        switch glyph {
        case .record:
            NSBezierPath(ovalIn: NSRect(x: startX, y: gy, width: gSize, height: gSize)).fill()
        case .stop:
            NSBezierPath(roundedRect: NSRect(x: startX, y: gy, width: gSize, height: gSize),
                         xRadius: 2.5, yRadius: 2.5).fill()
        }
        s.draw(in: NSRect(x: startX + gSize + gap, y: (bounds.height - textSize.height) / 2,
                          width: textSize.width, height: textSize.height))
    }
}
