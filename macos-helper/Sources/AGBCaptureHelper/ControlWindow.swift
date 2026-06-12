import AppKit
import CaptureCore

/// A small, always-visible floating control with one big button and the
/// current state. Exists because a menu-bar-only (LSUIElement) app is hard
/// to drive on a notched MacBook — the status item hides behind the notch and a
/// global hotkey can be swallowed by other apps. This window is always on
/// screen, one click from recording, and never depends on the menu bar.
///
/// The button mirrors the helper's state machine: Start Recording when idle,
/// **Record This Call** while a detection prompt is up (same affirm path as
/// the prompt's Record button — two visible ways to say yes), and Stop with
/// the elapsed time while capturing. Positioned by PanelLayout so it can
/// never overlap the prompt.
///
/// All methods are invoked on the main thread (from AppDelegate), matching
/// LiveTranscriptWindow's non-isolated pattern.
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
    private var button: NSButton?
    private var stateLabel: NSTextField?

    /// Tapped the big button — wired to the same toggle path as the
    /// hotkey/menu (start, affirm-while-detected, or stop).
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
        // Top-right, just under the menu bar, clear of the notch. The prompt
        // stacks below this frame (PanelLayout) — the two never overlap.
        if let screen = NSScreen.main {
            let frame = PanelLayout.controlFrame(visible: screen.visibleFrame,
                                                 size: panel.frame.size)
            panel.setFrameOrigin(frame.origin)
        }
        panel.orderFrontRegardless()
        self.panel = panel
    }

    @objc private func toggleTapped() {
        onToggle?()
    }

    /// Reflect the recorder state on the big button + caption.
    func update(_ mode: Mode) {
        guard let button else { return }
        switch mode {
        case .idle(let label):
            stateLabel?.stringValue = label
            button.title = "● Start Recording"
            button.contentTintColor = .systemRed
        case .detected:
            stateLabel?.stringValue = "Call detected — record it?"
            button.title = "● Record This Call"
            button.contentTintColor = .systemRed
        case .capturing(let elapsed):
            stateLabel?.stringValue = "Recording — click to stop"
            button.title = "■ Stop Recording  \(elapsed)"
            button.contentTintColor = .systemRed
        }
    }
}
