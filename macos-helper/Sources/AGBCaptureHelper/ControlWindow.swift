import AppKit
import QuartzCore
import CaptureCore

/// A small, always-visible floating control with one big button and the current
/// state. Exists because a menu-bar app is hard to drive on a notched MacBook —
/// the status item hides behind the notch and a global hotkey can be swallowed.
/// This window is always on screen, one click from recording, and never depends
/// on the menu bar.
///
/// The button mirrors the helper's state machine: Start Recording when idle,
/// **Record This Call** while a detection prompt is up, and Stop with the
/// elapsed time while capturing. A status dot pulses red while recording so
/// state is unmistakable at a glance. Positioned by PanelLayout so it can never
/// overlap the prompt. All methods run on the main thread (from AppDelegate).
final class ControlWindow: NSObject {

    /// What the single big button currently means.
    enum Mode: Equatable {
        case idle(label: String)
        case detected
        case capturing(elapsed: String)
    }

    /// Stable title used by PromptController to find this window's frame.
    static let windowTitle = "AGB Capture"

    private var panel: NSPanel?
    private var dot: StatusDot?
    private var titleLabel: NSTextField?
    private var subLabel: NSTextField?
    private var button: PillButton?

    var onToggle: (() -> Void)?

    func show() {
        if let panel {
            panel.orderFrontRegardless()
            return
        }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 288, height: 132),
            styleMask: [.nonactivatingPanel, .titled, .closable, .utilityWindow, .hudWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = Self.windowTitle
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true

        let container = NSView(frame: panel.contentLayoutRect)
        container.autoresizingMask = [.width, .height]

        // Status row: pulsing dot + bold state title + secondary caption.
        let dot = StatusDot(frame: NSRect(x: 0, y: 0, width: 12, height: 12))
        dot.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(dot)
        self.dot = dot

        let title = NSTextField(labelWithString: "Ready")
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.textColor = .labelColor
        title.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(title)
        self.titleLabel = title

        let sub = NSTextField(labelWithString: "Watching for calls")
        sub.font = .systemFont(ofSize: 11, weight: .regular)
        sub.textColor = .secondaryLabelColor
        sub.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(sub)
        self.subLabel = sub

        let btn = PillButton(title: "Start Recording")
        btn.target = self
        btn.action = #selector(toggleTapped)
        btn.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(btn)
        self.button = btn

        NSLayoutConstraint.activate([
            dot.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            dot.centerYAnchor.constraint(equalTo: title.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 12),
            dot.heightAnchor.constraint(equalToConstant: 12),

            title.topAnchor.constraint(equalTo: container.topAnchor, constant: 18),
            title.leadingAnchor.constraint(equalTo: dot.trailingAnchor, constant: 9),
            title.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -20),

            sub.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 2),
            sub.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            sub.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -20),

            btn.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            btn.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),
            btn.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -18),
            btn.heightAnchor.constraint(equalToConstant: 42),
        ])

        panel.contentView?.addSubview(container)
        if let screen = NSScreen.main {
            let frame = PanelLayout.controlFrame(visible: screen.visibleFrame, size: panel.frame.size)
            panel.setFrameOrigin(frame.origin)
        }
        panel.orderFrontRegardless()
        self.panel = panel
    }

    @objc private func toggleTapped() { onToggle?() }

    /// Reflect the recorder state on the dot, captions, and the big button.
    func update(_ mode: Mode) {
        guard let button else { return }
        switch mode {
        case .idle(let label):
            titleLabel?.stringValue = "Ready"
            subLabel?.stringValue = label
            dot?.set(color: .tertiaryLabelColor, pulsing: false)
            button.configure(title: "Start Recording", fill: .systemRed, glyph: .record)
        case .detected:
            titleLabel?.stringValue = "Call detected"
            subLabel?.stringValue = "Record this call?"
            dot?.set(color: .systemOrange, pulsing: true)
            button.configure(title: "Record This Call", fill: .systemRed, glyph: .record)
        case .capturing(let elapsed):
            titleLabel?.stringValue = "Recording"
            subLabel?.stringValue = "Tap to stop · \(elapsed)"
            dot?.set(color: .systemRed, pulsing: true)
            button.configure(title: "Stop  ·  \(elapsed)", fill: .controlAccentColor, glyph: .stop)
        }
    }
}

// MARK: - StatusDot

/// A small filled circle that can pulse (opacity breathe) to signal live state.
private final class StatusDot: NSView {
    private let dotLayer = CALayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        dotLayer.backgroundColor = NSColor.tertiaryLabelColor.cgColor
        layer?.addSublayer(dotLayer)
        layoutDot()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    override func layout() { super.layout(); layoutDot() }

    private func layoutDot() {
        let d: CGFloat = 11
        dotLayer.frame = CGRect(x: (bounds.width - d) / 2, y: (bounds.height - d) / 2, width: d, height: d)
        dotLayer.cornerRadius = d / 2
    }

    func set(color: NSColor, pulsing: Bool) {
        dotLayer.backgroundColor = color.cgColor
        dotLayer.removeAnimation(forKey: "pulse")
        guard pulsing else { dotLayer.opacity = 1; return }
        let a = CABasicAnimation(keyPath: "opacity")
        a.fromValue = 1.0
        a.toValue = 0.2
        a.duration = 0.85
        a.autoreverses = true
        a.repeatCount = .infinity
        a.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        dotLayer.add(a, forKey: "pulse")
    }
}

// MARK: - PillButton

/// A filled, rounded, full-width button with a hover state and a leading glyph
/// (record dot / stop square) drawn in code — looks like a modern app's primary
/// action rather than a stock AppKit push button.
private final class PillButton: NSButton {
    enum Glyph { case record, stop }

    private var fill: NSColor = .systemRed
    private var glyph: Glyph = .record
    private var hovering = false

    init(title: String) {
        super.init(frame: .zero)
        self.title = title
        isBordered = false
        wantsLayer = true
        layer?.cornerRadius = 11
        layer?.masksToBounds = true
        focusRingType = .none
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    func configure(title: String, fill: NSColor, glyph: Glyph) {
        self.title = title
        self.fill = fill
        self.glyph = glyph
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

    override func draw(_ dirtyRect: NSRect) {
        let bg = hovering ? (fill.blended(withFraction: 0.14, of: .white) ?? fill) : fill
        bg.setFill()
        bounds.fill() // layer cornerRadius clips to the pill shape

        // Leading glyph.
        let gSize: CGFloat = 11
        let gx: CGFloat = 18
        let gy = (bounds.height - gSize) / 2
        NSColor.white.setFill()
        switch glyph {
        case .record:
            NSBezierPath(ovalIn: NSRect(x: gx, y: gy, width: gSize, height: gSize)).fill()
        case .stop:
            NSBezierPath(roundedRect: NSRect(x: gx, y: gy, width: gSize, height: gSize),
                         xRadius: 2, yRadius: 2).fill()
        }

        // Centered title.
        let p = NSMutableParagraphStyle(); p.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: 14, weight: .semibold),
            .paragraphStyle: p,
        ]
        let s = NSAttributedString(string: title, attributes: attrs)
        let h = s.size().height
        s.draw(in: NSRect(x: 0, y: (bounds.height - h) / 2, width: bounds.width, height: h))
    }
}
