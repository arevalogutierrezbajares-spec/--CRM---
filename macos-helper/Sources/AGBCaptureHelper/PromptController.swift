import AppKit
import CaptureCore

/// The "Call detected — record?" prompt (FR-CALL-TRG-1/2): a small floating,
/// non-activating NSPanel pinned to the top-right of the main screen. It never
/// steals focus from the call. Times out after 60 s to NOT recording; while it
/// is up, the pre-roll ring buffer is already being fed, so an affirm 20 s in
/// loses nothing (FR-CALL-TRG-3).
final class PromptController {

    var onRecord: (() -> Void)?
    /// `timedOut` distinguishes an explicit Dismiss from the 60 s timeout —
    /// both result in NOT recording and a cleared pre-roll (NFR-CALL-PRIV-2).
    var onDismiss: ((_ timedOut: Bool) -> Void)?

    private var panel: NSPanel?
    private var timeoutTimer: Timer?
    private let timeoutSeconds: TimeInterval = 60

    var isShowing: Bool { panel != nil }

    func show(sourceApp: String?) {
        dismissPanel()

        let title = sourceApp.map { "Call detected (\($0))." } ?? "Call detected."

        let label = NSTextField(labelWithString: "\(title)\nRecord?")
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.alignment = .left
        label.maximumNumberOfLines = 2

        let recordButton = NSButton(title: "Record", target: self, action: #selector(recordTapped))
        recordButton.bezelStyle = .rounded
        recordButton.keyEquivalent = "\r"
        recordButton.bezelColor = .systemRed

        let dismissButton = NSButton(title: "Dismiss", target: self, action: #selector(dismissTapped))
        dismissButton.bezelStyle = .rounded
        dismissButton.keyEquivalent = "\u{1b}"

        let buttons = NSStackView(views: [dismissButton, recordButton])
        buttons.orientation = .horizontal
        buttons.spacing = 8

        let stack = NSStackView(views: [label, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 10
        stack.edgeInsets = NSEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 280, height: 92),
            styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false
        panel.contentView = stack

        // Top-right of the main screen, below the menu bar.
        if let screen = NSScreen.main {
            let frame = screen.visibleFrame
            let size = stack.fittingSize
            panel.setContentSize(size)
            let origin = NSPoint(
                x: frame.maxX - size.width - 16,
                y: frame.maxY - size.height - 16
            )
            panel.setFrameOrigin(origin)
        }

        panel.orderFrontRegardless()
        self.panel = panel

        timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeoutSeconds, repeats: false) { [weak self] _ in
            guard let self, self.panel != nil else { return }
            HelperLog.shared.info("prompt timed out (60s) — not recording", category: "prompt")
            self.dismissPanel()
            self.onDismiss?(true)
        }
        HelperLog.shared.info("record prompt shown (source: \(sourceApp ?? "unknown"))", category: "prompt")
    }

    func dismissPanel() {
        timeoutTimer?.invalidate()
        timeoutTimer = nil
        panel?.orderOut(nil)
        panel = nil
    }

    @objc private func recordTapped() {
        dismissPanel()
        onRecord?()
    }

    @objc private func dismissTapped() {
        HelperLog.shared.info("prompt dismissed — not recording", category: "prompt")
        dismissPanel()
        onDismiss?(false)
    }
}
