import AppKit

/// A small, always-visible floating control with one big Start/Stop button and
/// the current state. Exists because a menu-bar-only (LSUIElement) app is hard
/// to drive on a notched MacBook — the status item hides behind the notch and a
/// global hotkey can be swallowed by other apps. This window is always on
/// screen, one click from recording, and never depends on the menu bar.
/// All methods are invoked on the main thread (from AppDelegate), matching
/// LiveTranscriptWindow's non-isolated pattern.
final class ControlWindow: NSObject {
    private var panel: NSPanel?
    private var button: NSButton?
    private var stateLabel: NSTextField?

    /// Tapped Start/Stop — wired to the same toggle path as the hotkey/menu.
    var onToggle: (() -> Void)?

    func show() {
        if let panel {
            panel.orderFrontRegardless()
            return
        }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 230, height: 96),
            styleMask: [.nonactivatingPanel, .titled, .closable, .utilityWindow, .hudWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = "AGB Capture"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true

        let container = NSView(frame: panel.contentLayoutRect)
        container.autoresizingMask = [.width, .height]

        let state = NSTextField(labelWithString: "Idle")
        state.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        state.textColor = .secondaryLabelColor
        state.alignment = .center
        state.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(state)
        self.stateLabel = state

        let btn = NSButton(title: "● Start Recording", target: self, action: #selector(toggleTapped))
        btn.bezelStyle = .regularSquare
        btn.controlSize = .large
        btn.font = NSFont.systemFont(ofSize: 14, weight: .semibold)
        btn.contentTintColor = .systemRed
        btn.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(btn)
        self.button = btn

        NSLayoutConstraint.activate([
            btn.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            btn.centerYAnchor.constraint(equalTo: container.centerYAnchor, constant: 4),
            btn.widthAnchor.constraint(equalToConstant: 200),
            btn.heightAnchor.constraint(equalToConstant: 40),
            state.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            state.bottomAnchor.constraint(equalTo: btn.topAnchor, constant: -8),
        ])

        panel.contentView?.addSubview(container)
        // Park it top-right, just under the menu bar, clear of the notch.
        if let screen = NSScreen.main {
            let f = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(x: f.maxX - 250, y: f.maxY - 130))
        }
        panel.orderFrontRegardless()
        self.panel = panel
    }

    @objc private func toggleTapped() {
        onToggle?()
    }

    /// Reflect the recorder state. `isCapturing` switches the button to Stop and
    /// shows elapsed time; otherwise it's a red "Start Recording".
    func update(stateLabel label: String, isCapturing: Bool, elapsed: String) {
        guard let button else { return }
        stateLabel?.stringValue = isCapturing ? "Recording — click to stop" : label
        if isCapturing {
            button.title = "■ Stop Recording  \(elapsed)"
            button.contentTintColor = .systemRed
        } else {
            button.title = "● Start Recording"
            button.contentTintColor = .systemRed
        }
    }
}
