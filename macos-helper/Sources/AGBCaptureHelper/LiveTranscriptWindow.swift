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

    /// Finalized lines, in order. Interim text for each channel is held
    /// separately and re-rendered live until a final replaces it.
    private var finals: [LiveTranscriptStreamer.Line] = []
    private var interimByChannel: [Int: LiveTranscriptStreamer.Line] = [:]

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

        let stack = NSStackView(views: [statusLabel, scroll])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 6
        stack.edgeInsets = NSEdgeInsets(top: 10, left: 12, bottom: 12, right: 12)
        stack.translatesAutoresizingMaskIntoConstraints = false
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
        finals.removeAll()
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
                finals.append(line)
            }
        } else {
            interimByChannel[line.channel] = line
        }
        render()
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

        if finals.isEmpty && interimByChannel.isEmpty {
            storage?.append(NSAttributedString(string: "Listening…\n", attributes: [
                .font: baseFont,
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]))
        } else {
            for line in finals { appendLine(line, interim: false) }
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
