import AppKit
import CaptureCore

/// A small, non-activating, always-on-top, draggable floating window that shows
/// the running live transcript during a recording (FEATURE 2) — Otter/Granola
/// style. Newest line at the bottom, autoscrolls, speaker-labeled, interim text
/// shown greyed until finalized.
///
/// Call Desk surface (El Cuaderno): a notes composer (⌘⇧N), ↑/↓ Line-Grab to
/// anchor a note to a specific recent line, #theme chips, and a collapsible
/// agenda rail (⌘⇧A) showing the operator's original list with coverage dots.
///
/// It NEVER touches capture: closing/hiding it is purely cosmetic, and a
/// `.unavailable` status just shows a quiet banner while recording + filing
/// continue. Reduced-motion friendly (no animations; instant scroll).
///
/// Rendering is INCREMENTAL: finalized items are appended once into a
/// committed region and never rebuilt; only the volatile tail (per-channel
/// interim lines) is re-rendered on updates. The old full-rebuild was O(n²)
/// over call length and visibly stuttered on hour-long calls.
final class LiveTranscriptWindow: NSObject {

    private var panel: NSPanel?
    private let textView = NSTextView()
    private var scrollView: NSScrollView?
    private let statusLabel = NSTextField(labelWithString: "")
    private var highlightButton: NSButton?
    /// Call Desk composer: type → Enter files a ✎ note; text + ★ files a
    /// flag WITH that note. Focused globally via ⌘⇧N.
    private let composer = NSTextField(string: "")
    /// "↳ re: …" preview of the Line-Grab anchor while a line is picked.
    private let anchorLabel = NSTextField(labelWithString: "")

    // MARK: - Incremental render state

    /// Length of the committed (finalized, never-rebuilt) region of the text
    /// storage. Everything past it is the volatile tail (interims / empty
    /// state) and is replaced wholesale on updates.
    private var committedLength = 0
    private var interimByChannel: [Int: LiveTranscriptStreamer.Line] = [:]

    // MARK: - Line-Grab state

    /// A recently finalized transcript line the operator can pick as a note
    /// anchor. `range` is its span in the committed storage (for highlight).
    private struct PickableLine {
        let range: NSRange
        let quote: String
        let tSecs: Double
    }
    /// Last N pickable lines, oldest → newest. Bounded so ranges stay cheap.
    private var pickables: [PickableLine] = []
    private static let maxPickables = 30
    /// Index into `pickables` of the currently picked line (nil = no pick).
    private var pickIndex: Int?

    /// A durable note anchor: the aimed-at moment + the live text as context.
    /// The server re-quotes from the FINAL transcript at `tSecs` (the live
    /// text is throwaway); the quote just shows the operator what he grabbed.
    struct Anchor {
        let quote: String
        let tSecs: Double
    }

    /// Audio-timeline clock provider (spooler.appendedSeconds), set by the
    /// AppDelegate per recording. Stamps finalized lines so Line-Grab anchors
    /// land on the same timeline the server stamps utterances against.
    var timelineNow: (() -> Double)?

    // MARK: - Agenda rail state

    enum AgendaState { case none, touched, done }
    private var agendaRows: [(key: String, label: String)] = []
    private var agendaStates: [String: AgendaState] = [:]
    private var railExpanded = false
    private let railStack = NSStackView()
    private var meterButton: NSButton?

    // MARK: - Callbacks

    /// Fired when the operator taps the ★ button to flag the current moment;
    /// carries the composer text (nil when empty) as the flag's note. The
    /// AppDelegate anchors it to the recording + persists it (crash-safe).
    var onHighlight: ((String?) -> Void)?
    /// Fired when the operator types a note and hits Enter in the composer.
    /// Second argument is the Line-Grab anchor when a line was picked.
    var onNote: ((String, Anchor?) -> Void)?
    /// Fired by the "✎ Term" button — AppDelegate prompts for heard/correct.
    var onFixTerm: (() -> Void)?
    /// Fired when the operator clicks an agenda row (key, nowDone).
    var onAgendaToggle: ((String, Bool) -> Void)?
    /// Fired when the operator adopts a commitment-whisper chip as a note.
    var onAdoptCommitment: ((String) -> Void)?
    /// Fired for each FINALIZED transcript line so the AppDelegate can run
    /// on-device detection (commitment whisper + agenda glow) with its
    /// session context (agenda keys, spooler).
    var onFinalLine: ((String) -> Void)?

    var isVisible: Bool { panel?.isVisible ?? false }

    /// The pending commitment-whisper suggestion (nil = none showing).
    private var whisperClause: String?
    private let whisperBar = NSStackView()
    private let whisperLabel = NSTextField(labelWithString: "")

    // MARK: - Window

    private func buildPanelIfNeeded() {
        guard panel == nil else { return }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 380, height: 320),
            styleMask: [.nonactivatingPanel, .titled, .closable, .resizable,
                        .utilityWindow, .hudWindow, .fullSizeContentView],
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
        panel.minSize = NSSize(width: 280, height: 180)
        panel.delegate = self
        // Frosted dark HUD — the same chrome family as the AGB control panel.
        panel.appearance = NSAppearance(named: .darkAqua)
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden

        // Status banner (recording timer / "unavailable") + scrolling transcript.
        statusLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        // ☰ coverage meter — shows "2/5" once an agenda exists; click expands
        // the rail (⌘⇧A does the same globally).
        let meter = NSButton(title: "", target: self, action: #selector(meterTapped))
        meter.bezelStyle = .rounded
        meter.controlSize = .small
        meter.font = .monospacedSystemFont(ofSize: 10.5, weight: .semibold)
        meter.toolTip = "Your agenda — click to expand (⌘⇧A)"
        meter.isHidden = true
        meter.setContentHuggingPriority(.required, for: .horizontal)
        self.meterButton = meter

        // ★ "Flag moment" — mirrors the ⌘⇧K global hotkey. Marks the current
        // point in the call as important; the flag rides through to the CRM
        // brief. If the composer holds text, it becomes the flag's note.
        let star = NSButton(title: "★ Flag", target: self, action: #selector(highlightTapped))
        star.bezelStyle = .rounded
        star.controlSize = .small
        star.font = .systemFont(ofSize: 11, weight: .semibold)
        star.contentTintColor = .systemOrange
        star.toolTip = "Flag this moment as important (⌘⇧K). Text in the note box becomes the flag's note."
        star.setContentHuggingPriority(.required, for: .horizontal)
        self.highlightButton = star

        // ✎ "Term" — teach the filing pass a correction ("heard X, it's Y")
        // so the FILED transcript comes back right.
        let term = NSButton(title: "✎ Term", target: self, action: #selector(fixTermTapped))
        term.bezelStyle = .rounded
        term.controlSize = .small
        term.font = .systemFont(ofSize: 11, weight: .semibold)
        term.contentTintColor = .systemTeal
        term.toolTip = "Correct a misheard name/term — fixes the filed transcript"
        term.setContentHuggingPriority(.required, for: .horizontal)

        let header = NSStackView(views: [statusLabel, meter, term, star])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        // Agenda rail (collapsed by default): the operator's original list
        // with coverage dots; click a row to mark it done.
        railStack.orientation = .vertical
        railStack.alignment = .leading
        railStack.spacing = 2
        railStack.isHidden = true

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.borderType = .noBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false

        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 4, height: 6)
        textView.font = .systemFont(ofSize: 12.5)
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        scroll.documentView = textView
        self.scrollView = scroll

        // Anchor preview (Line-Grab): visible only while a line is picked.
        anchorLabel.font = .systemFont(ofSize: 10.5)
        anchorLabel.textColor = NSColor(calibratedRed: 0.83, green: 0.66, blue: 0.33, alpha: 0.9)
        anchorLabel.lineBreakMode = .byTruncatingTail
        anchorLabel.isHidden = true

        // Commitment whisper: a dismissible chip that surfaces a detected
        // spoken commitment; the operator adopts it as a note (⌥⏎ or the
        // button) or ignores it (it clears on the next detection / dismiss).
        whisperLabel.font = .systemFont(ofSize: 11.5)
        whisperLabel.textColor = .labelColor
        whisperLabel.lineBreakMode = .byTruncatingTail
        whisperLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let adopt = NSButton(title: "Keep ⌥⏎", target: self, action: #selector(adoptWhisperTapped))
        adopt.bezelStyle = .rounded
        adopt.controlSize = .small
        adopt.font = .systemFont(ofSize: 11, weight: .semibold)
        adopt.contentTintColor = .systemGreen
        adopt.setContentHuggingPriority(.required, for: .horizontal)
        let dismiss = NSButton(title: "✕", target: self, action: #selector(dismissWhisperTapped))
        dismiss.bezelStyle = .rounded
        dismiss.controlSize = .small
        dismiss.font = .systemFont(ofSize: 11)
        dismiss.setContentHuggingPriority(.required, for: .horizontal)
        let heard = NSTextField(labelWithString: "⟶")
        heard.font = .systemFont(ofSize: 11, weight: .semibold)
        heard.textColor = .systemGreen
        heard.setContentHuggingPriority(.required, for: .horizontal)
        whisperBar.setViews([heard, whisperLabel, adopt, dismiss], in: .leading)
        whisperBar.orientation = .horizontal
        whisperBar.alignment = .centerY
        whisperBar.spacing = 7
        whisperBar.isHidden = true

        // Notes composer, docked under the transcript. Enter = timestamped ✎
        // note; ↑/↓ picks a recent line as the note's anchor; the panel is
        // non-activating so typing here never steals focus from the call app
        // unless the operator deliberately clicks / ⌘⇧N.
        composer.placeholderString = "Note — ⏎ saves · ↑ grabs a line · #theme  (⌘⇧N)"
        composer.font = .systemFont(ofSize: 12)
        composer.isBezeled = false
        composer.isBordered = false
        composer.drawsBackground = false
        composer.focusRingType = .none
        composer.lineBreakMode = .byTruncatingTail
        composer.cell?.usesSingleLineMode = true
        composer.cell?.sendsActionOnEndEditing = false
        composer.target = self
        composer.action = #selector(composerSubmitted)
        composer.delegate = self
        // Rounded, subtly-filled field chrome (the Town Hall input look).
        let composerWell = ComposerWell()
        composer.translatesAutoresizingMaskIntoConstraints = false
        composerWell.addSubview(composer)
        NSLayoutConstraint.activate([
            composer.leadingAnchor.constraint(equalTo: composerWell.leadingAnchor, constant: 10),
            composer.trailingAnchor.constraint(equalTo: composerWell.trailingAnchor, constant: -10),
            composer.centerYAnchor.constraint(equalTo: composerWell.centerYAnchor),
            composerWell.heightAnchor.constraint(equalToConstant: 30),
        ])

        let stack = NSStackView(views: [header, railStack, scroll, whisperBar, anchorLabel, composerWell])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.setCustomSpacing(4, after: railStack)
        stack.setCustomSpacing(3, after: whisperBar)
        stack.setCustomSpacing(3, after: anchorLabel)
        // Extra top inset clears the transparent titlebar's close button.
        stack.edgeInsets = NSEdgeInsets(top: 30, left: 14, bottom: 12, right: 14)
        stack.translatesAutoresizingMaskIntoConstraints = false
        for v in [header, railStack, scroll, whisperBar, anchorLabel, composerWell] {
            v.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -28).isActive = true
        }

        // Frosted glass behind everything — content floats on vibrancy, not a
        // flat opaque panel.
        let container = NSVisualEffectView()
        container.material = .hudWindow
        container.blendingMode = .behindWindow
        container.state = .active
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
        renderTail()
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
        interimByChannel.removeAll()
        pickables.removeAll()
        pickIndex = nil
        committedLength = 0
        textView.textStorage?.setAttributedString(NSAttributedString(string: ""))
        anchorLabel.isHidden = true
        dismissWhisper()
        setAgenda([])
        setStatus("● Recording — connecting live transcript…")
        renderTail()
    }

    // MARK: - Commitment whisper

    /// Surface a detected commitment as a dismissible suggestion chip. Newest
    /// wins (one at a time), so a stale suggestion never lingers.
    func showWhisper(clause: String) {
        buildPanelIfNeeded()
        whisperClause = clause
        whisperLabel.stringValue = clause
        whisperBar.isHidden = false
    }

    func dismissWhisper() {
        whisperClause = nil
        whisperBar.isHidden = true
    }

    @objc private func adoptWhisperTapped() { adoptWhisper() }
    @objc private func dismissWhisperTapped() { dismissWhisper() }

    private func adoptWhisper() {
        guard let clause = whisperClause else { return }
        dismissWhisper()
        onAdoptCommitment?(clause)
    }

    // MARK: - Content updates (call on main thread)

    func append(line: LiveTranscriptStreamer.Line) {
        if line.isFinal {
            interimByChannel[line.channel] = nil
            // Skip empties; Deepgram occasionally emits a blank final.
            if !line.text.trimmingCharacters(in: .whitespaces).isEmpty {
                let t = timelineNow?() ?? 0
                let run = Self.lineString(line, interim: false)
                let range = appendCommitted(run)
                pickables.append(PickableLine(range: range, quote: line.text, tSecs: t))
                if pickables.count > Self.maxPickables {
                    pickables.removeFirst(pickables.count - Self.maxPickables)
                }
                // An active pick tracks its LINE, not its index-from-end; the
                // simplest correct behavior on new content is to keep the same
                // pickables entry highlighted (ranges never move — committed
                // text is append-only).
                onFinalLine?(line.text)
            }
        } else {
            interimByChannel[line.channel] = line
        }
        renderTail()
    }

    /// Show an operator-flagged ★ moment inline (append order = chronological)
    /// and confirm briefly in the status banner. Cosmetic only — persistence
    /// happens in the AppDelegate; this just gives the operator feedback that
    /// the flag landed and where.
    func flashHighlight(atSecs: TimeInterval, note: String?, count: Int) {
        _ = appendCommitted(Self.highlightString(t: atSecs, note: note))
        setStatus("★ Flagged \(Self.clock(atSecs)) — \(count) this call")
        renderTail()
    }

    /// Show a typed ✎ note inline (append order = chronological) and confirm in
    /// the banner. Cosmetic only — persistence happens in the AppDelegate.
    func flashNote(atSecs: TimeInterval, text: String, themeKey: String? = nil, count: Int) {
        _ = appendCommitted(Self.noteString(t: atSecs, text: text, themeKey: themeKey))
        let chip = themeKey.map { "  #\($0)" } ?? ""
        setStatus("✎ Noted \(Self.clock(atSecs))\(chip) — \(count) this call")
        renderTail()
    }

    /// Confirm a term correction landed (corrections don't sit on the timeline;
    /// they apply to the whole filing pass).
    func flashTerm(wrong: String?, right: String, count: Int) {
        if let wrong, !wrong.isEmpty {
            setStatus("✎ Term \(count): “\(wrong)” → “\(right)” at filing")
        } else {
            setStatus("✎ Term \(count): “\(right)” hinted to the transcriber")
        }
    }

    @objc private func highlightTapped() {
        let text = composer.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        composer.stringValue = ""
        clearPick()
        onHighlight?(text.isEmpty ? nil : text)
    }

    @objc private func composerSubmitted() {
        let text = composer.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        composer.stringValue = ""
        let anchor = currentAnchor()
        clearPick()
        onNote?(text, anchor)
    }

    @objc private func fixTermTapped() {
        onFixTerm?()
    }

    /// Bring the window up and put the cursor in the note composer (⌘⇧N). The
    /// panel is non-activating, so the frontmost app keeps focus until the
    /// field actually becomes first responder here — a deliberate grab.
    func focusComposer() {
        show()
        panel?.makeKey()
        panel?.makeFirstResponder(composer)
    }

    /// Put text back in the composer (a note that couldn't be saved must not
    /// evaporate — the operator typed it).
    func restoreComposer(text: String) {
        composer.stringValue = text
    }

    /// Esc in the composer: stop editing and hand key status back to the call
    /// app (order-out + re-order-front releases key without hiding the window).
    private func releaseComposerFocus() {
        panel?.makeFirstResponder(nil)
        panel?.orderOut(nil)
        panel?.orderFrontRegardless()
    }

    // MARK: - Line-Grab

    private func currentAnchor() -> Anchor? {
        guard let i = pickIndex, pickables.indices.contains(i) else { return nil }
        return Anchor(quote: pickables[i].quote, tSecs: pickables[i].tSecs)
    }

    /// ↑ = pick the previous (older) line; ↓ = move toward newest, then clear.
    private func movePick(older: Bool) {
        guard !pickables.isEmpty else { return }
        let previous = pickIndex
        if older {
            if let i = pickIndex {
                pickIndex = max(0, i - 1)
            } else {
                pickIndex = pickables.count - 1 // start at the newest line
            }
        } else {
            if let i = pickIndex {
                pickIndex = i + 1 < pickables.count ? i + 1 : nil // past newest = clear
            }
        }
        applyPickHighlight(previous: previous)
        updateAnchorPreview()
    }

    private func clearPick() {
        let previous = pickIndex
        pickIndex = nil
        applyPickHighlight(previous: previous)
        updateAnchorPreview()
    }

    private func applyPickHighlight(previous: Int?) {
        guard let storage = textView.textStorage else { return }
        let gold = NSColor(calibratedRed: 0.83, green: 0.66, blue: 0.33, alpha: 1)
        storage.beginEditing()
        if let p = previous, pickables.indices.contains(p) {
            storage.removeAttribute(.backgroundColor, range: pickables[p].range)
        }
        if let i = pickIndex, pickables.indices.contains(i) {
            storage.addAttribute(.backgroundColor,
                                 value: gold.withAlphaComponent(0.12),
                                 range: pickables[i].range)
        }
        storage.endEditing()
        if let i = pickIndex, pickables.indices.contains(i) {
            textView.scrollRangeToVisible(pickables[i].range)
        } else {
            textView.scrollToEndOfDocument(nil)
        }
    }

    private func updateAnchorPreview() {
        if let anchor = currentAnchor() {
            let quote = anchor.quote.count > 60
                ? String(anchor.quote.prefix(60)) + "…" : anchor.quote
            anchorLabel.stringValue = "↳ re: “\(quote)”  @\(Self.clock(anchor.tSecs))"
            anchorLabel.isHidden = false
        } else {
            anchorLabel.isHidden = true
        }
    }

    // MARK: - Agenda rail

    /// Install the operator's original list. Empty hides meter + rail.
    func setAgenda(_ items: [(key: String, label: String)]) {
        agendaRows = items
        agendaStates = agendaStates.filter { pair in items.contains { $0.key == pair.key } }
        railExpanded = railExpanded && !items.isEmpty
        rebuildRail()
    }

    /// Update one item's coverage dot (touched when a tagged note lands,
    /// done when the operator ticks it).
    func updateAgendaState(key: String, state: AgendaState) {
        agendaStates[key] = state
        rebuildRail()
    }

    /// ⌘⇧A / meter click: expand or collapse the rail.
    func toggleRail() {
        guard !agendaRows.isEmpty else { return }
        railExpanded.toggle()
        rebuildRail()
        if railExpanded { show() }
    }

    @objc private func meterTapped() { toggleRail() }

    @objc private func agendaRowTapped(_ sender: NSButton) {
        guard sender.tag >= 0, sender.tag < agendaRows.count else { return }
        let key = agendaRows[sender.tag].key
        let nowDone = agendaStates[key] != AgendaState.done
        agendaStates[key] = nowDone ? .done : .none
        rebuildRail()
        onAgendaToggle?(key, nowDone)
    }

    private func rebuildRail() {
        railStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let covered = agendaRows.filter { (agendaStates[$0.key] ?? .none) != .none }.count
        if agendaRows.isEmpty {
            meterButton?.isHidden = true
            railStack.isHidden = true
            return
        }
        meterButton?.isHidden = false
        meterButton?.title = "☰ \(covered)/\(agendaRows.count)"
        railStack.isHidden = !railExpanded
        guard railExpanded else { return }
        for (i, row) in agendaRows.enumerated() {
            let state = agendaStates[row.key] ?? .none
            let (dot, color): (String, NSColor) = {
                switch state {
                case .none: return ("○", .tertiaryLabelColor)
                case .touched: return ("◐", .systemTeal)
                case .done: return ("●", .systemGreen)
                }
            }()
            let btn = NSButton(title: "", target: self, action: #selector(agendaRowTapped(_:)))
            btn.isBordered = false
            btn.tag = i
            btn.alignment = .left
            btn.toolTip = "Click to mark done"
            let title = NSMutableAttributedString()
            title.append(NSAttributedString(string: "\(dot) ", attributes: [
                .font: NSFont.systemFont(ofSize: 11.5, weight: .semibold),
                .foregroundColor: color,
            ]))
            title.append(NSAttributedString(string: row.label, attributes: [
                .font: NSFont.systemFont(ofSize: 11.5),
                .foregroundColor: state == .done ? NSColor.secondaryLabelColor : NSColor.labelColor,
            ]))
            btn.attributedTitle = title
            railStack.addArrangedSubview(btn)
        }
    }

    // MARK: - Status

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

    // MARK: - Render (incremental)

    /// SF Rounded for speaker names — warmer than mono, still crisp on the HUD.
    private static func roundedFont(ofSize size: CGFloat, weight: NSFont.Weight) -> NSFont {
        let base = NSFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.rounded),
              let font = NSFont(descriptor: descriptor, size: size) else { return base }
        return font
    }

    private static let gold = NSColor(calibratedRed: 0.83, green: 0.66, blue: 0.33, alpha: 1)

    private static var para: NSMutableParagraphStyle {
        let p = NSMutableParagraphStyle()
        p.paragraphSpacing = 5
        p.lineSpacing = 1
        return p
    }

    private static func lineString(_ line: LiveTranscriptStreamer.Line, interim: Bool) -> NSAttributedString {
        let baseFont = NSFont.systemFont(ofSize: 12.5)
        let speakerFont = roundedFont(ofSize: 12.5, weight: .semibold)
        let textColor: NSColor = interim ? .tertiaryLabelColor : .labelColor
        let speakerColor: NSColor = line.channel == 0 ? .systemBlue : .systemGreen
        let out = NSMutableAttributedString()
        out.append(NSAttributedString(string: "\(line.speaker)  ", attributes: [
            .font: speakerFont,
            .foregroundColor: interim ? speakerColor.withAlphaComponent(0.5) : speakerColor,
            .paragraphStyle: para,
        ]))
        out.append(NSAttributedString(string: "\(line.text)\n", attributes: [
            .font: baseFont,
            .foregroundColor: textColor,
            .paragraphStyle: para,
        ]))
        return out
    }

    private static func highlightString(t: TimeInterval, note: String?) -> NSAttributedString {
        let suffix = note.map { "  \($0)" } ?? ""
        return NSAttributedString(
            string: "★ \(clock(t)) flagged\(suffix)\n",
            attributes: [.font: roundedFont(ofSize: 12.5, weight: .semibold),
                         .foregroundColor: NSColor.systemOrange,
                         .paragraphStyle: para]
        )
    }

    private static func noteString(t: TimeInterval, text: String, themeKey: String?) -> NSAttributedString {
        // Third Voice: the operator's typed note renders as his own gold
        // speaker turn, a peer of the blue/green voice channels.
        let baseFont = NSFont.systemFont(ofSize: 12.5)
        let line = NSMutableAttributedString()
        line.append(NSAttributedString(string: "You ✎  ", attributes: [
            .font: roundedFont(ofSize: 12.5, weight: .semibold),
            .foregroundColor: gold, .paragraphStyle: para,
        ]))
        line.append(NSAttributedString(string: "\(clock(t))  ", attributes: [
            .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .regular),
            .foregroundColor: NSColor.tertiaryLabelColor, .paragraphStyle: para,
        ]))
        line.append(NSAttributedString(string: text, attributes: [
            .font: baseFont, .foregroundColor: gold, .paragraphStyle: para,
        ]))
        if let themeKey {
            line.append(NSAttributedString(string: "  #\(themeKey)", attributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .medium),
                .foregroundColor: gold.withAlphaComponent(0.7), .paragraphStyle: para,
            ]))
        }
        line.append(NSAttributedString(string: "\n"))
        return line
    }

    /// Append a finalized run to the committed region (replacing the volatile
    /// tail first) and return its range in the storage. O(run), not O(call).
    @discardableResult
    private func appendCommitted(_ run: NSAttributedString) -> NSRange {
        buildPanelIfNeeded()
        guard let storage = textView.textStorage else { return NSRange(location: 0, length: 0) }
        storage.beginEditing()
        let tail = NSRange(location: committedLength, length: storage.length - committedLength)
        storage.replaceCharacters(in: tail, with: "")
        let range = NSRange(location: committedLength, length: run.length)
        storage.append(run)
        committedLength = storage.length
        storage.endEditing()
        return range
    }

    /// Re-render ONLY the volatile tail: per-channel interim lines, or the
    /// empty state while nothing has arrived yet.
    private func renderTail() {
        guard let storage = textView.textStorage else { return }
        let tail = NSMutableAttributedString()
        if committedLength == 0 && interimByChannel.isEmpty {
            tail.append(NSAttributedString(
                string: "Listening — words appear as they're spoken…\n",
                attributes: [.font: NSFont.systemFont(ofSize: 12.5),
                             .foregroundColor: NSColor.tertiaryLabelColor,
                             .paragraphStyle: Self.para]))
        } else {
            for channel in interimByChannel.keys.sorted() {
                if let line = interimByChannel[channel] {
                    tail.append(Self.lineString(line, interim: true))
                }
            }
        }
        storage.beginEditing()
        let tailRange = NSRange(location: committedLength, length: storage.length - committedLength)
        storage.replaceCharacters(in: tailRange, with: tail)
        storage.endEditing()
        // Autoscroll to the newest line (instant — reduced-motion friendly),
        // unless the operator is aiming the pick bar at an older line.
        if pickIndex == nil {
            textView.scrollToEndOfDocument(nil)
        }
    }
}

extension LiveTranscriptWindow: NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide rather than destroy; the recording is unaffected either way.
        hide()
        return false
    }
}

extension LiveTranscriptWindow: NSTextFieldDelegate {
    /// Composer keyboard grammar: ↑/↓ = Line-Grab pick, Esc = clear pick or
    /// hand focus back to the call app.
    func control(_ control: NSControl, textView: NSTextView,
                 doCommandBy commandSelector: Selector) -> Bool {
        guard control === composer else { return false }
        switch commandSelector {
        case #selector(NSResponder.moveUp(_:)):
            movePick(older: true)
            return true
        case #selector(NSResponder.moveDown(_:)):
            movePick(older: false)
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            if whisperClause != nil {
                dismissWhisper()
            } else if pickIndex != nil {
                clearPick()
            } else {
                releaseComposerFocus()
            }
            return true
        case #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
            // ⌥⏎ adopts the pending commitment whisper as a note (only when
            // the composer is empty — otherwise it's a stray option-return).
            if whisperClause != nil && composer.stringValue.isEmpty {
                adoptWhisper()
                return true
            }
            return false
        default:
            return false
        }
    }
}

/// Rounded, subtly-filled well around the borderless note composer — the same
/// field chrome as the Town Hall inputs, tuned for the dark HUD.
private final class ComposerWell: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        translatesAutoresizingMaskIntoConstraints = false
        wantsLayer = true
        layer?.cornerRadius = 8
    }
    required init?(coder: NSCoder) { fatalError("unused") }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: r, xRadius: 8, yRadius: 8)
        NSColor.white.withAlphaComponent(0.07).setFill()
        path.fill()
        NSColor.white.withAlphaComponent(0.14).setStroke()
        path.lineWidth = 1
        path.stroke()
    }
}
