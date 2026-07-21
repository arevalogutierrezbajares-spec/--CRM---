import AppKit
import CaptureCore

/// A small, non-activating, always-on-top, draggable floating window that shows
/// the running live transcript during a recording (FEATURE 2) — Otter/Granola
/// style. Newest line at the bottom, autoscrolls, speaker-labeled, interim text
/// shown greyed until finalized.
///
/// It NEVER touches capture: closing/hiding it is purely cosmetic, and a
/// `.unavailable` status just shows a quiet banner while recording + filing
/// continue. Reduced-motion friendly (no animations; instant scroll).
final class LiveTranscriptWindow: NSObject {

    private var panel: NSPanel?
    private let textView = NSTextView()
    private var scrollView: NSScrollView?
    private let statusLabel = NSTextField(labelWithString: "")
    private var highlightButton: NSButton?

    /// Transcript timeline, in the order it happened: finalized lines and
    /// operator-flagged ★ markers interleaved. Highlights append "now", so append
    /// order is chronological. Interim text for each channel is held separately
    /// and re-rendered live until a final replaces it.
    private enum Item {
        case line(LiveTranscriptStreamer.Line)
        case highlight(t: TimeInterval, note: String?)
    }
    private var items: [Item] = []
    private var interimByChannel: [Int: LiveTranscriptStreamer.Line] = [:]

    /// Fired when the operator taps the ★ button to flag the current moment.
    /// The AppDelegate anchors it to the recording + persists it (crash-safe).
    var onHighlight: (() -> Void)?

    var isVisible: Bool { panel?.isVisible ?? false }

    // MARK: - Window

    private func buildPanelIfNeeded() {
        guard panel == nil else { return }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 300),
            styleMask: [.nonactivatingPanel, .titled, .closable, .resizable, .utilityWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = "Live transcript"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false
        panel.minSize = NSSize(width: 260, height: 160)
        panel.delegate = self

        // Status banner (recording timer / "unavailable") + scrolling transcript.
        statusLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        // ★ "Flag moment" — mirrors the ⌘⇧K global hotkey. Marks the current
        // point in the call as important; the flag rides through to the CRM brief.
        let star = NSButton(title: "★ Flag", target: self, action: #selector(highlightTapped))
        star.bezelStyle = .rounded
        star.controlSize = .small
        star.font = .systemFont(ofSize: 11, weight: .semibold)
        star.contentTintColor = .systemOrange
        star.toolTip = "Flag this moment as important (⌘⇧K)"
        star.setContentHuggingPriority(.required, for: .horizontal)
        self.highlightButton = star

        let header = NSStackView(views: [statusLabel, star])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false

        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 4, height: 6)
        textView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        scroll.documentView = textView
        self.scrollView = scroll

        let stack = NSStackView(views: [header, scroll])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 6
        stack.edgeInsets = NSEdgeInsets(top: 10, left: 12, bottom: 12, right: 12)
        stack.translatesAutoresizingMaskIntoConstraints = false
        header.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true
        scroll.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true

        let container = NSView()
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: container.topAnchor),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])
        panel.contentView = container

        // Bottom-right of the main screen — PanelLayout keeps it clear of the
        // control/prompt stack in the top-right corner.
        if let screen = NSScreen.main {
            let frame = PanelLayout.transcriptFrame(visible: screen.visibleFrame,
                                                    size: panel.frame.size)
            panel.setFrameOrigin(frame.origin)
        }
        self.panel = panel
        render()
    }

    // MARK: - Show / hide

    func show() {
        buildPanelIfNeeded()
        panel?.orderFrontRegardless()
    }

    func hide() {
        panel?.orderOut(nil)
    }

    func toggle() {
        if isVisible { hide() } else { show() }
    }

    /// Reset transcript content for a new recording (keeps window position).
    func reset() {
        items.removeAll()
        interimByChannel.removeAll()
        setStatus("● Recording — connecting live transcript…")
        render()
    }

    // MARK: - Content updates (call on main thread)

    func append(line: LiveTranscriptStreamer.Line) {
        if line.isFinal {
            interimByChannel[line.channel] = nil
            // Skip empties; Deepgram occasionally emits a blank final.
            if !line.text.trimmingCharacters(in: .whitespaces).isEmpty {
                items.append(.line(line))
            }
        } else {
            interimByChannel[line.channel] = line
        }
        render()
    }

    /// Show an operator-flagged ★ moment inline (append order = chronological)
    /// and confirm briefly in the status banner. Cosmetic only — persistence
    /// happens in the AppDelegate; this just gives the operator feedback that
    /// the flag landed and where.
    func flashHighlight(atSecs: TimeInterval, note: String?, count: Int) {
        items.append(.highlight(t: atSecs, note: note))
        setStatus("★ Flagged \(Self.clock(atSecs)) — \(count) this call")
        render()
    }

    @objc private func highlightTapped() {
        onHighlight?()
    }

    /// mm:ss (or h:mm:ss past an hour) for a moment offset.
    private static func clock(_ secs: TimeInterval) -> String {
        let s = max(0, Int(secs.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, sec)
            : String(format: "%d:%02d", m, sec)
    }

    func setStatus(_ text: String) {
        statusLabel.stringValue = text
    }

    func setUnavailable(_ message: String) {
        setStatus("⚠ \(message) — recording continues normally")
    }

    // MARK: - Render

    private func render() {
        guard panel != nil else { return }
        let storage = textView.textStorage
        storage?.beginEditing()
        storage?.setAttributedString(NSAttributedString(string: ""))

        let baseFont = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let speakerFont = NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)

        func appendLine(_ line: LiveTranscriptStreamer.Line, interim: Bool) {
            let textColor: NSColor = interim ? .tertiaryLabelColor : .labelColor
            let speakerColor: NSColor = line.channel == 0 ? .systemBlue : .systemGreen
            let label = NSAttributedString(string: "\(line.speaker): ", attributes: [
                .font: speakerFont,
                .foregroundColor: interim ? speakerColor.withAlphaComponent(0.5) : speakerColor,
            ])
            let body = NSAttributedString(string: "\(line.text)\n", attributes: [
                .font: baseFont,
                .foregroundColor: textColor,
            ])
            storage?.append(label)
            storage?.append(body)
        }

        func appendHighlight(t: TimeInterval, note: String?) {
            let suffix = note.map { "  \($0)" } ?? ""
            let marker = NSAttributedString(
                string: "★ \(Self.clock(t)) flagged\(suffix)\n",
                attributes: [.font: speakerFont, .foregroundColor: NSColor.systemOrange]
            )
            storage?.append(marker)
        }

        if items.isEmpty && interimByChannel.isEmpty {
            storage?.append(NSAttributedString(string: "Listening…\n", attributes: [
                .font: baseFont,
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]))
        } else {
            for item in items {
                switch item {
                case .line(let line): appendLine(line, interim: false)
                case .highlight(let t, let note): appendHighlight(t: t, note: note)
                }
            }
            // Interim tails (one per active channel) shown greyed at the bottom.
            for channel in interimByChannel.keys.sorted() {
                if let line = interimByChannel[channel] { appendLine(line, interim: true) }
            }
        }
        storage?.endEditing()

        // Autoscroll to the newest line (instant — reduced-motion friendly).
        textView.scrollToEndOfDocument(nil)
    }
}

extension LiveTranscriptWindow: NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide rather than destroy; the recording is unaffected either way.
        hide()
        return false
    }
}
