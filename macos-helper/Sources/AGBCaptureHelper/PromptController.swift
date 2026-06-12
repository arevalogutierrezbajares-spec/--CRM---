import AppKit
import CaptureCore

/// The "Call detected — record?" prompt (FR-CALL-TRG-1/2): a small floating,
/// non-activating NSPanel stacked directly below the Start/Stop control window
/// (PanelLayout — the two can never overlap). It never steals focus from the
/// call.
///
/// Lifecycle: the prompt **persists while the call is live** — the pre-roll
/// ring keeps rolling in RAM the whole time, so affirming minutes in still
/// includes the last 60 s (FR-CALL-TRG-3). It ends only on Record, Dismiss,
/// the call ending (mic released — AppDelegate dismisses it), or an absolute
/// safety cap (PromptPolicy). Declined/expired prompts persist zero bytes
/// (NFR-CALL-PRIV-2).
///
/// Level is `.statusBar`: above other apps' `.floating` panels (e.g. the
/// WhatsApp call window), so the Record button can never be buried under
/// another window — the failure that lost the first 8.5 minutes of a call on
/// 2026-06-12.
final class PromptController {

    var onRecord: (() -> Void)?
    /// The prompt ended without recording: explicit Dismiss or the safety cap.
    /// (A call-end dismissal comes from AppDelegate via `dismissPanel()`.)
    var onDecline: ((PromptPolicy.DeclineReason) -> Void)?

    private var panel: NSPanel?
    private var capTimer: Timer?
    private var refreshTimer: Timer?
    private var label: NSTextField?
    private var titleText = ""
    /// Live view into the engine's RAM pre-roll, for the buffered readout.
    private var bufferedSeconds: (() -> Double)?

    var isShowing: Bool { panel != nil }

    func show(sourceApp: String?,
              capSeconds: TimeInterval,
              bufferedSeconds: (() -> Double)? = nil) {
        dismissPanel()

        titleText = sourceApp.map { "Call detected (\($0))." } ?? "Call detected."
        self.bufferedSeconds = bufferedSeconds

        // Size the panel for the widest text the label will ever show (the
        // buffered readout maxes out at the 60 s ring), so the live updates
        // never truncate.
        let widestText = bufferedSeconds == nil
            ? labelText()
            : "\(titleText)\nRecord? — last 1:00 buffered"
        let label = NSTextField(labelWithString: widestText)
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.alignment = .left
        label.maximumNumberOfLines = 2
        self.label = label

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
        // Above other apps' .floating panels (call windows) — never buried.
        panel.level = .statusBar
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false
        panel.contentView = stack

        // Stack directly below the always-visible control window (PanelLayout
        // guarantees the two frames are disjoint).
        if let screen = NSScreen.main {
            let size = stack.fittingSize
            panel.setContentSize(size)
            let frame = PanelLayout.promptFrame(
                visible: screen.visibleFrame,
                size: panel.frame.size,
                below: controlWindowFrame()
            )
            panel.setFrameOrigin(frame.origin)
        }

        refreshLabel()
        panel.orderFrontRegardless()
        self.panel = panel

        // Absolute safety cap only — the prompt otherwise persists while the
        // call is live, with the pre-roll ring rolling in RAM (PromptPolicy).
        capTimer = Timer.scheduledTimer(withTimeInterval: capSeconds, repeats: false) { [weak self] _ in
            guard let self, self.panel != nil else { return }
            HelperLog.shared.warn("prompt safety cap (\(Int(capSeconds))s) — not recording", category: "prompt")
            self.dismissPanel()
            self.onDecline?(.safetyCap)
        }

        // Keep the "last m:ss buffered" readout live so the founder can see
        // that answering late loses nothing.
        if bufferedSeconds != nil {
            let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
                self?.refreshLabel()
            }
            RunLoop.main.add(timer, forMode: .common)
            refreshTimer = timer
        }

        HelperLog.shared.info("record prompt shown (source: \(sourceApp ?? "unknown"), cap \(Int(capSeconds))s)", category: "prompt")
    }

    func dismissPanel() {
        capTimer?.invalidate()
        capTimer = nil
        refreshTimer?.invalidate()
        refreshTimer = nil
        panel?.orderOut(nil)
        panel = nil
        label = nil
        bufferedSeconds = nil
    }

    // MARK: - Label

    private func labelText() -> String {
        guard let buffered = bufferedSeconds?() , buffered >= 1 else {
            return "\(titleText)\nRecord?"
        }
        let total = Int(buffered)
        return "\(titleText)\nRecord? — last \(total / 60):\(String(format: "%02d", total % 60)) buffered"
    }

    private func refreshLabel() {
        label?.stringValue = labelText()
    }

    /// The control window's frame, found by title — keeps PromptController
    /// decoupled from ControlWindow while still stacking below it.
    private func controlWindowFrame() -> CGRect? {
        NSApp.windows.first { $0.title == ControlWindow.windowTitle && $0.isVisible }?.frame
    }

    // MARK: - Actions

    @objc private func recordTapped() {
        dismissPanel()
        onRecord?()
    }

    @objc private func dismissTapped() {
        HelperLog.shared.info("prompt dismissed — not recording", category: "prompt")
        dismissPanel()
        onDecline?(.userDismissed)
    }
}
