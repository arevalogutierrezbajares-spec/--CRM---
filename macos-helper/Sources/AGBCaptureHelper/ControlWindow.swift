import AppKit
import QuartzCore
import CaptureCore

/// A small, always-visible floating control: the animated AGB monogram, the
/// current state, and one big button. Exists because a menu-bar app is hard to
/// drive on a notched MacBook — the status item hides behind the notch and a
/// global hotkey can be swallowed. This window is always on screen, one click
/// from recording, and never depends on the menu bar.
///
/// The monogram doubles as a live indicator: its three strokes breathe gently
/// when idle and pulse in a staggered red "equalizer" wave while recording, so
/// state is unmistakable. The button mirrors the state machine: Start Recording
/// when idle, Record This Call while a detection prompt is up, and Stop with the
/// elapsed time while capturing. All methods run on the main thread.
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
    private var logo: LogoView?
    private var titleLabel: NSTextField?
    private var subLabel: NSTextField?
    private var button: PillButton?

    // While a "Saved to CRM" confirmation is showing, normal state updates are
    // buffered (so refreshUI doesn't instantly overwrite it) and applied when
    // the confirmation ends. A new recording cancels it immediately.
    private var confirming = false
    private var pendingMode: Mode?
    private var confirmTimer: Timer?
    // Transparent overlay over the logo/title/sub that, while a confirmation is
    // showing, opens the filed call in the CRM. Hidden otherwise.
    private var confirmOverlay: NSButton?
    private var pendingOpenURL: URL?

    var onToggle: (() -> Void)?
    var onConfigure: (() -> Void)?
    var onToggleTranscript: (() -> Void)?

    func show() {
        if let panel {
            panel.orderFrontRegardless()
            logo?.kick() // restart the animation if the layer was paused
            return
        }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 300, height: 168),
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

        // Transparent click target over the status area; only live (visible)
        // while a "Saved to CRM" confirmation is up. Added before the gear so the
        // gear stays clickable on top of it.
        let overlay = NSButton(title: "", target: self, action: #selector(openFiledTapped))
        overlay.isBordered = false
        overlay.isTransparent = true // draws nothing, still receives clicks
        overlay.isHidden = true
        overlay.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(overlay)
        self.confirmOverlay = overlay

        // Small gear in the top-right opens the config dialog directly from the
        // panel, so the helper is configurable without the menu-bar icon.
        let gear = NSButton(
            image: NSImage(systemSymbolName: "gearshape", accessibilityDescription: "Configure")
                ?? NSImage(),
            target: self,
            action: #selector(configureTapped))
        gear.isBordered = false
        gear.bezelStyle = .regularSquare
        gear.contentTintColor = .secondaryLabelColor
        gear.toolTip = "Configure…"
        gear.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(gear)

        // Top-left: show/hide the live transcript window, reachable without the
        // menu. Added after the overlay so it stays clickable during a confirmation.
        let transcriptBtn = NSButton(
            image: NSImage(systemSymbolName: "captions.bubble", accessibilityDescription: "Live transcript")
                ?? NSImage(),
            target: self,
            action: #selector(transcriptTapped))
        transcriptBtn.isBordered = false
        transcriptBtn.bezelStyle = .regularSquare
        transcriptBtn.contentTintColor = .secondaryLabelColor
        transcriptBtn.toolTip = "Show / hide live transcript"
        transcriptBtn.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(transcriptBtn)

        NSLayoutConstraint.activate([
            gear.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            gear.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -13),
            gear.widthAnchor.constraint(equalToConstant: 20),
            gear.heightAnchor.constraint(equalToConstant: 20),

            transcriptBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            transcriptBtn.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 13),
            transcriptBtn.widthAnchor.constraint(equalToConstant: 20),
            transcriptBtn.heightAnchor.constraint(equalToConstant: 20),

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

        panel.contentView?.addSubview(container)
        if let screen = NSScreen.main {
            let frame = PanelLayout.controlFrame(visible: screen.visibleFrame, size: panel.frame.size)
            panel.setFrameOrigin(frame.origin)
        }
        panel.orderFrontRegardless()
        self.panel = panel
    }

    @objc private func toggleTapped() { onToggle?() }
    @objc private func configureTapped() { onConfigure?() }
    @objc private func transcriptTapped() { onToggleTranscript?() }

    /// Reflect the recorder state on the monogram, captions, and the big button.
    func update(_ mode: Mode) {
        guard button != nil else { return }
        if confirming {
            // A new capture takes priority and clears the confirmation; any other
            // state is buffered and applied once the confirmation finishes.
            if case .capturing = mode {
                endConfirmation(apply: false)
            } else {
                pendingMode = mode
                return
            }
        }
        applyMode(mode)
    }

    private func applyMode(_ mode: Mode) {
        guard let button else { return }
        switch mode {
        case .idle(let label):
            titleLabel?.stringValue = "Ready"
            subLabel?.stringValue = label
            logo?.set(color: .labelColor, motion: .calm)
            button.configure(title: "Start Recording", fill: .systemRed, glyph: .record)
        case .detected:
            titleLabel?.stringValue = "Call detected"
            subLabel?.stringValue = "Record this call?"
            logo?.set(color: .systemOrange, motion: .active)
            button.configure(title: "Record This Call", fill: .systemRed, glyph: .record)
        case .capturing(let elapsed):
            titleLabel?.stringValue = "Recording"
            subLabel?.stringValue = "Tap to stop · \(elapsed)"
            logo?.set(color: .systemRed, motion: .active)
            button.configure(title: "Stop  ·  \(elapsed)", fill: .controlAccentColor, glyph: .stop)
        }
    }

    /// Show a "Saved to CRM" confirmation in the panel for a few seconds after a
    /// call files (transcript + brief + action items persisted). `warning` flags
    /// a suspect capture (e.g. a silent channel) so the founder double-checks it.
    func flashFiled(title: String, detail: String, warning: Bool, url: URL?) {
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
}

// MARK: - LogoView

/// The AGB monogram (public/logos/crm.svg) as three filled CAShapeLayers that
/// animate. Calm: a slow synchronized breathe (alive but quiet). Active: a
/// staggered opacity wave across the three strokes — an equalizer-like pulse
/// that reads as "listening / recording".
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

    // The monogram's three shapes in the 200×200 viewBox (content bbox x8..192,
    // y44..166), mapped into this view (y flipped for AppKit's bottom-left origin).
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

    /// Restart the animation (e.g. after the window is re-shown and layers paused).
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
