import AppKit
import AVFoundation
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
        /// `participant` is a person name when labeled; nil → "Unlabeled" in subtitle.
        /// `kind` distinguishes call vs in-person meeting chrome.
        case capturing(elapsed: String, participant: String?, kind: CaptureKind)
    }

    static let windowTitle = "AGB AI"

    /// Idle cinema: tall card with video + Bolívar quote (not just a record button).
    private static let idleCinemaSize = NSSize(width: 340, height: 468)
    /// Recording / compact chrome after a session starts.
    private static let compactSize = NSSize(width: 300, height: 168)
    private static let expandedSize = NSSize(width: 880, height: 600)

    private var panel: NSPanel?

    // Compact-mode views.
    private var compactContainer: NSView?
    private var cinema: IdleCinemaView?
    private var logo: LogoView?
    private var logoTopConstraint: NSLayoutConstraint?
    private var logoWidthConstraint: NSLayoutConstraint?
    private var logoHeightConstraint: NSLayoutConstraint?
    private var titleLabel: NSTextField?
    private var subLabel: NSTextField?
    private var button: PillButton?
    private var confirmOverlay: NSButton?
    private var townHallButton: NSButton?
    private var townHallBadgePill: NSView?
    private var townHallBadgeLabel: NSTextField?
    private var townHallUnread = 0
    /// True when the floating panel is sized for the idle cinema (vs recording chrome).
    private var cinemaLayoutActive = true

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
    private var offerAddActions = false
    /// Last applied mode — lets the primary button offer a capture-kind chooser
    /// while idle without the caller having to tell it the state twice.
    private var currentMode: Mode = .idle(label: "")
    private var pendingMode: Mode?
    private var confirmTimer: Timer?
    private var pendingOpenURL: URL?

    var onToggle: (() -> Void)?
    /// Fired when the founder picks a capture kind from the idle start menu.
    /// When nil the primary button falls back to the plain `onToggle` behavior.
    var onStartKind: ((CaptureKind) -> Void)?
    var onConfigure: (() -> Void)?
    var onToggleTranscript: (() -> Void)?
    /// Mid-call: founder wants to set/edit the far-side participant name.
    var onLabelParticipant: (() -> Void)?
    /// Fired the first time Town Hall is opened (so the app starts the poller +
    /// requests notification authorization).
    var onOpenTownHall: (() -> Void)?
    /// After a call files: open Action Items + optional CRM extract.
    var onAddActions: (() -> Void)?

    // MARK: - Show

    func show() {
        if let panel {
            panel.orderFrontRegardless()
            (expanded ? headerLogo : logo)?.kick()
            return
        }

        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: Self.idleCinemaSize),
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
        // Dark chrome matches the cinema card
        panel.appearance = NSAppearance(named: .darkAqua)
        self.panel = panel

        let compact = buildCompactContainer()
        self.compactContainer = compact
        panel.contentView = compact

        if let screen = NSScreen.main {
            let frame = PanelLayout.controlFrame(visible: screen.visibleFrame, size: Self.idleCinemaSize)
            panel.setFrame(frame, display: true)
        }
        panel.orderFrontRegardless()
        applyMode(lastMode)
        cinema?.startCinema()
    }

    // MARK: - Compact container

    private func buildCompactContainer() -> NSView {
        let container = NSView(frame: NSRect(origin: .zero, size: Self.idleCinemaSize))
        container.autoresizingMask = [.width, .height]
        container.wantsLayer = true

        // Full-bleed cinema (idle only).
        let cinema = IdleCinemaView(frame: .zero)
        cinema.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(cinema)
        self.cinema = cinema

        let logo = LogoView(frame: NSRect(x: 0, y: 0, width: 72, height: 46))
        logo.translatesAutoresizingMaskIntoConstraints = false
        // Always on top of cinema / chrome — the breathing monogram is the brand.
        container.addSubview(logo)
        self.logo = logo

        let title = NSTextField(labelWithString: "Ready")
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.textColor = .labelColor
        title.alignment = .center
        title.translatesAutoresizingMaskIntoConstraints = false
        title.isHidden = true
        container.addSubview(title)
        self.titleLabel = title

        let sub = NSTextField(labelWithString: "Watching for calls")
        sub.font = .systemFont(ofSize: 11, weight: .regular)
        sub.textColor = .secondaryLabelColor
        sub.alignment = .center
        sub.translatesAutoresizingMaskIntoConstraints = false
        sub.isHidden = true
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
        gear.contentTintColor = .white
        container.addSubview(gear)
        let labelBtn = iconButton("person.crop.circle.badge.questionmark",
                                  tip: "Label participant…",
                                  action: #selector(labelParticipantTapped))
        labelBtn.contentTintColor = .white
        container.addSubview(labelBtn)
        let transcriptBtn = iconButton("captions.bubble", tip: "Show / hide live transcript", action: #selector(transcriptTapped))
        transcriptBtn.contentTintColor = .white
        container.addSubview(transcriptBtn)
        let townHallBtn = iconButton("bubble.left.and.bubble.right", tip: "Open Town Hall (⌘⇧H)", action: #selector(townHallTapped))
        townHallBtn.contentTintColor = .white
        container.addSubview(townHallBtn)
        self.townHallButton = townHallBtn

        // Unread badge (red pill) on the Town Hall icon — driven by the poller.
        let badgePill = NSView()
        badgePill.wantsLayer = true
        badgePill.layer?.cornerRadius = 7
        badgePill.layer?.backgroundColor = NSColor.systemRed.cgColor
        badgePill.translatesAutoresizingMaskIntoConstraints = false
        badgePill.isHidden = true
        let badgeLabel = NSTextField(labelWithString: "")
        badgeLabel.font = .systemFont(ofSize: 9, weight: .bold)
        badgeLabel.textColor = .white
        badgeLabel.alignment = .center
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badgePill.addSubview(badgeLabel)
        container.addSubview(badgePill)
        self.townHallBadgePill = badgePill
        self.townHallBadgeLabel = badgeLabel

        let logoTop = logo.topAnchor.constraint(equalTo: container.topAnchor, constant: 40)
        let logoW = logo.widthAnchor.constraint(equalToConstant: 72)
        let logoH = logo.heightAnchor.constraint(equalToConstant: 46)
        self.logoTopConstraint = logoTop
        self.logoWidthConstraint = logoW
        self.logoHeightConstraint = logoH

        NSLayoutConstraint.activate([
            cinema.topAnchor.constraint(equalTo: container.topAnchor),
            cinema.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            cinema.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            cinema.bottomAnchor.constraint(equalTo: container.bottomAnchor),

            gear.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            gear.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -13),
            gear.widthAnchor.constraint(equalToConstant: 20),
            gear.heightAnchor.constraint(equalToConstant: 20),

            labelBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            labelBtn.trailingAnchor.constraint(equalTo: gear.leadingAnchor, constant: -8),
            labelBtn.widthAnchor.constraint(equalToConstant: 20),
            labelBtn.heightAnchor.constraint(equalToConstant: 20),

            transcriptBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            transcriptBtn.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 13),
            transcriptBtn.widthAnchor.constraint(equalToConstant: 20),
            transcriptBtn.heightAnchor.constraint(equalToConstant: 20),

            townHallBtn.topAnchor.constraint(equalTo: container.topAnchor, constant: 11),
            townHallBtn.leadingAnchor.constraint(equalTo: transcriptBtn.trailingAnchor, constant: 8),
            townHallBtn.widthAnchor.constraint(equalToConstant: 20),
            townHallBtn.heightAnchor.constraint(equalToConstant: 20),

            badgePill.topAnchor.constraint(equalTo: townHallBtn.topAnchor, constant: -4),
            badgePill.trailingAnchor.constraint(equalTo: townHallBtn.trailingAnchor, constant: 6),
            badgePill.heightAnchor.constraint(equalToConstant: 14),
            badgePill.widthAnchor.constraint(greaterThanOrEqualToConstant: 14),
            badgeLabel.centerYAnchor.constraint(equalTo: badgePill.centerYAnchor),
            badgeLabel.leadingAnchor.constraint(equalTo: badgePill.leadingAnchor, constant: 3),
            badgeLabel.trailingAnchor.constraint(equalTo: badgePill.trailingAnchor, constant: -3),

            logoTop,
            logo.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            logoW,
            logoH,

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
        // Logo above cinema video layer for the idle monogram pulse.
        container.addSubview(logo, positioned: .above, relativeTo: cinema)
        return container
    }

    /// Grow to cinema card when idle; shrink to recording chrome when capturing.
    private func setCinemaLayout(_ cinemaOn: Bool, animated: Bool) {
        guard let panel, !expanded else {
            cinemaLayoutActive = cinemaOn
            return
        }
        let target = cinemaOn ? Self.idleCinemaSize : Self.compactSize
        let needsResize = abs(panel.frame.width - target.width) > 1
            || abs(panel.frame.height - target.height) > 1
        cinemaLayoutActive = cinemaOn

        if cinemaOn {
            // Keep the dynamic AGB monogram over the video; hide Ready/sub chrome.
            logo?.isHidden = false
            titleLabel?.isHidden = true
            subLabel?.isHidden = true
            logoTopConstraint?.constant = 36
            logoWidthConstraint?.constant = 88
            logoHeightConstraint?.constant = 58
            // Cream/white monogram reads on dark video; calm breathe motion.
            logo?.set(color: NSColor.white.withAlphaComponent(0.96), motion: .calm)
            logo?.kick()
            cinema?.isHidden = false
            cinema?.startCinema()
        } else {
            cinema?.stopCinema()
            logo?.isHidden = false
            titleLabel?.isHidden = false
            subLabel?.isHidden = false
            logoTopConstraint?.constant = 14
            logoWidthConstraint?.constant = 56
            logoHeightConstraint?.constant = 36
            logo?.set(color: .labelColor, motion: .calm)
            logo?.kick()
        }
        logo?.superview?.layoutSubtreeIfNeeded()

        guard needsResize else { return }
        let old = panel.frame
        let topRight = NSPoint(x: old.maxX, y: old.maxY)
        var newFrame = NSRect(
            x: topRight.x - target.width,
            y: topRight.y - target.height,
            width: target.width,
            height: target.height
        )
        if let visible = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            newFrame.origin.x = max(visible.minX + 8, min(newFrame.origin.x, visible.maxX - target.width - 8))
            newFrame.origin.y = max(visible.minY + 8, min(newFrame.origin.y, visible.maxY - target.height - 8))
        }
        if animated {
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.28
                ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(newFrame, display: true)
            }
        } else {
            panel.setFrame(newFrame, display: true)
        }
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

        let collapsedSize = cinemaLayoutActive ? Self.idleCinemaSize : Self.compactSize
        let targetSize = value ? Self.expandedSize : collapsedSize
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
            cinema?.stopCinema()
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
            } completionHandler: { [weak self] in
                if !value { self?.applyMode(self?.lastMode ?? .idle(label: "Idle — watching for calls")) }
            }
        } else {
            panel.setFrame(newFrame, display: true)
            newContent.alphaValue = 1
            if !value { applyMode(lastMode) }
        }
        if value { panel.makeKeyAndOrderFront(nil) } else { panel.orderFrontRegardless() }
    }

    // MARK: - Actions

    @objc private func toggleTapped() {
        // During post-file confirmation the primary CTA is “Add actions”.
        if confirming, offerAddActions {
            offerAddActions = false
            endConfirmation(apply: false)
            onAddActions?()
            return
        }
        // Idle: offer the capture kind instead of silently assuming an on-Mac
        // call. The panel is the primary surface, and a kind that only existed
        // in the menu bar was effectively invisible — worse, picking the wrong
        // one records a speakerphone call with no input gain and no
        // diarization, which fails silently as "(no speech detected)".
        if case .idle = currentMode, onStartKind != nil {
            presentCaptureKindMenu()
            return
        }
        onToggle?()
    }

    /// Menu of capture kinds, anchored under whichever start button was hit.
    private func presentCaptureKindMenu() {
        let menu = NSMenu()
        menu.autoenablesItems = false
        let kinds: [(CaptureKind, String, String)] = [
            (.call, "Call on this Mac", "WhatsApp, Zoom, FaceTime — mic + system audio"),
            (.speaker, "Speakerphone", "Phone or handset on speaker — room mic, gain boosted"),
            (.meeting, "In-person meeting", "Everyone in the room — room mic only"),
        ]
        for (kind, title, subtitle) in kinds {
            let item = NSMenuItem(title: title, action: #selector(startKindTapped(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = kind.rawValue
            item.isEnabled = true
            let attr = NSMutableAttributedString(
                string: title + "\n",
                attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .medium)]
            )
            attr.append(NSAttributedString(
                string: subtitle,
                attributes: [
                    .font: NSFont.systemFont(ofSize: 11),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ]
            ))
            item.attributedTitle = attr
            menu.addItem(item)
        }
        let anchor = (headerButton?.window != nil && headerButton?.isHidden == false)
            ? headerButton : button
        if let anchor {
            menu.popUp(positioning: nil,
                       at: NSPoint(x: 0, y: anchor.bounds.height + 4),
                       in: anchor)
        }
    }

    @objc private func startKindTapped(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
              let kind = CaptureKind(rawValue: raw) else { return }
        onStartKind?(kind)
    }
    @objc private func configureTapped() { onConfigure?() }
    @objc private func transcriptTapped() { onToggleTranscript?() }

    /// Compact Town Hall icon badge (unread notifications from CRM poller).
    func setTownHallBadge(_ unread: Int) {
        townHallUnread = unread
        let pill = townHallBadgePill
        let label = townHallBadgeLabel
        pill?.isHidden = unread <= 0
        label?.stringValue = unread > 99 ? "99+" : "\(unread)"
        townHallButton?.toolTip = unread > 0
            ? "Open Town Hall — \(unread) unread (⌘⇧H)"
            : "Open Town Hall (⌘⇧H)"
    }

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
        currentMode = mode
        switch mode {
        case .idle(let label):
            if !expanded { setCinemaLayout(true, animated: true) }
            cinema?.setStatus(label.isEmpty ? "Listo · watching for calls" : label)
            titleLabel?.stringValue = "Ready"
            subLabel?.stringValue = label
            // Monogram stays visible + breathing on the cinema (setCinemaLayout also configures it).
            logo?.set(color: NSColor.white.withAlphaComponent(0.95), motion: .calm)
            logo?.kick()
            button?.configure(title: "Start Recording", fill: PillButton.jungle, glyph: .record, scene: .angelFalls)
            headerLogo?.set(color: .labelColor, motion: .calm)
            headerStateLabel?.stringValue = "Town Hall"
            headerButton?.configure(title: "Start Recording", fill: PillButton.jungle, glyph: .record, scene: .angelFalls)
        case .detected:
            if !expanded { setCinemaLayout(true, animated: true) }
            cinema?.setStatus("Call detected — record this call?")
            titleLabel?.stringValue = "Call detected"
            subLabel?.stringValue = "Record this call?"
            // Active equalizer pulse on the monogram when a call is detected.
            logo?.set(color: .systemOrange, motion: .active)
            logo?.kick()
            button?.configure(title: "Record This Call", fill: PillButton.jungle, glyph: .record, scene: .angelFalls)
            headerLogo?.set(color: .systemOrange, motion: .active)
            headerStateLabel?.stringValue = "Call detected"
            headerButton?.configure(title: "Record This Call", fill: PillButton.jungle, glyph: .record, scene: .angelFalls)
        case .capturing(let elapsed, let participant, let kind):
            if !expanded { setCinemaLayout(false, animated: true) }
            if kind.isMeeting {
                titleLabel?.stringValue = "Meeting"
                let who = participant.map { "Room: \($0)" } ?? "In-person (room mic)"
                subLabel?.stringValue = "\(who) · \(elapsed)"
                headerStateLabel?.stringValue = participant.map { "Meet · \($0) · \(elapsed)" }
                    ?? "Meeting · \(elapsed)"
            } else if kind.isAcousticMixed {
                titleLabel?.stringValue = "Speakerphone"
                let who = participant.map { "Call with \($0)" } ?? "Speakerphone (room mic)"
                subLabel?.stringValue = "\(who) · \(elapsed)"
                headerStateLabel?.stringValue = participant.map { "Spkr · \($0) · \(elapsed)" }
                    ?? "Speakerphone · \(elapsed)"
            } else {
                titleLabel?.stringValue = "Recording"
                let who = participant.map { "Talking with \($0)" } ?? "Unlabeled"
                subLabel?.stringValue = "\(who) · \(elapsed)"
                headerStateLabel?.stringValue = participant.map { "Rec · \($0) · \(elapsed)" }
                    ?? "Recording · \(elapsed)"
            }
            // Recording = Catatumbo thunder (the ONLY state that gets the storm),
            // with the monogram in electric indigo instead of alarm red.
            logo?.set(color: .systemIndigo, motion: .active)
            button?.configure(title: "Stop  ·  \(elapsed)", fill: PillButton.storm, glyph: .stop, scene: .thunder)
            headerLogo?.set(color: .systemIndigo, motion: .active)
            headerButton?.configure(title: "Stop · \(elapsed)", fill: PillButton.storm, glyph: .stop, scene: .thunder)
        }
    }

    @objc private func labelParticipantTapped() {
        onLabelParticipant?()
    }

    /// "Saved to CRM" confirmation in the compact panel (and a brief header note
    /// when expanded). When `offerAddActions`, primary button becomes “Add actions”.
    func flashFiled(title: String, detail: String, warning: Bool, url: URL?,
                    offerAddActions: Bool = false) {
        if expanded {
            headerStateLabel?.stringValue = warning ? "Saved — check it" : "Saved to CRM"
            return
        }
        guard button != nil else { return }
        confirming = true
        self.offerAddActions = offerAddActions
        pendingMode = nil
        pendingOpenURL = url
        confirmTimer?.invalidate()

        // Brief compact confirmation over cinema / chrome
        setCinemaLayout(false, animated: true)
        logo?.isHidden = false
        titleLabel?.isHidden = false
        subLabel?.isHidden = false
        cinema?.stopCinema()

        let base = warning ? "Saved — check it" : "Saved to CRM"
        titleLabel?.stringValue = url != nil ? "\(base)  ↗" : base
        if offerAddActions {
            subLabel?.stringValue = url != nil
                ? "\(detail) — tap title to open · or add more actions"
                : "\(detail) · add follow-ups?"
            button?.configure(title: "Add actions", fill: .controlAccentColor, glyph: .record, scene: .angelFalls)
        } else {
            subLabel?.stringValue = url != nil ? "\(detail) — tap to open" : detail
            button?.configure(title: "Start Recording", fill: PillButton.jungle, glyph: .record, scene: .angelFalls)
        }
        logo?.set(color: warning ? .systemOrange : .systemGreen, motion: .calm)
        confirmOverlay?.isHidden = (url == nil)

        confirmTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { [weak self] _ in
            self?.endConfirmation(apply: true)
        }
    }

    @objc private func openFiledTapped() {
        if let url = pendingOpenURL { NSWorkspace.shared.open(url) }
        endConfirmation(apply: true)
    }

    private func endConfirmation(apply: Bool) {
        confirming = false
        offerAddActions = false
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

/// AGB monogram with Pixar-style personality: the two outer strokes are
/// “sides” that fall outward on click, then spring home with overshoot.
private final class LogoView: NSView {
    enum Motion { case calm, active }

    private let host = CALayer()
    /// 0 = left, 1 = center, 2 = right
    private let strokes = [CAShapeLayer(), CAShapeLayer(), CAShapeLayer()]
    private var color: NSColor = .labelColor
    private var motion: Motion = .calm
    private var collapsing = false
    private var hover = false
    /// Rest pose for each stroke (position = hinge at top of glyph).
    private var restPositions: [CGPoint] = [.zero, .zero, .zero]

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = false
        host.masksToBounds = false
        layer?.addSublayer(host)
        strokes.forEach { host.addSublayer($0) }
        toolTip = "AGB"
        rebuild()
        applyIdleMotion()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unused") }

    override var isFlipped: Bool { false }
    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        host.frame = bounds
        rebuild()
        CATransaction.commit()
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .cursorUpdate, .inVisibleRect],
            owner: self,
            userInfo: nil
        ))
    }

    override func cursorUpdate(with event: NSEvent) {
        NSCursor.pointingHand.set()
    }

    override func mouseEntered(with event: NSEvent) {
        hover = true
        if collapsing { return }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.22
            ctx.allowsImplicitAnimation = true
            layer?.transform = CATransform3DMakeScale(1.08, 1.08, 1)
        }
    }

    override func mouseExited(with event: NSEvent) {
        hover = false
        if collapsing { return }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.22
            ctx.allowsImplicitAnimation = true
            layer?.transform = CATransform3DIdentity
        }
    }

    override func mouseDown(with event: NSEvent) {
        playPixarFallAndReturn()
    }

    // MARK: - Geometry

    private func rebuild() {
        guard bounds.width > 1, bounds.height > 1 else { return }
        let bx: CGFloat = 8, by: CGFloat = 44, bw: CGFloat = 184, bh: CGFloat = 122
        let pad: CGFloat = 2
        let scale = min((bounds.width - pad * 2) / bw, (bounds.height - pad * 2) / bh)
        let drawW = bw * scale, drawH = bh * scale
        let ox = (bounds.width - drawW) / 2
        let oy = (bounds.height - drawH) / 2
        // View coords: y grows up (isFlipped false). SVG y grows down — flip.
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + (x - bx) * scale, y: bounds.height - (oy + (y - by) * scale))
        }
        // Each stroke as polygon in SVG space (top two points first).
        let shapes: [[(CGFloat, CGFloat)]] = [
            [(62, 44), (84, 44), (44, 166), (8, 166)],   // left
            [(89, 44), (111, 44), (111, 166), (89, 166)], // center
            [(116, 44), (138, 44), (192, 166), (156, 166)], // right
        ]

        var rests: [CGPoint] = []
        for (i, pts) in shapes.enumerated() {
            let worldPts = pts.map { p($0.0, $0.1) }
            // Hinge = midpoint of the top edge (first two points) so the
            // stroke falls like a door / limb hinged at the top.
            let hinge = CGPoint(
                x: (worldPts[0].x + worldPts[1].x) / 2,
                y: (worldPts[0].y + worldPts[1].y) / 2
            )
            rests.append(hinge)

            // Path in layer-local space with origin at hinge
            let path = CGMutablePath()
            let local = worldPts.map { CGPoint(x: $0.x - hinge.x, y: $0.y - hinge.y) }
            path.move(to: local[0])
            for q in local.dropFirst() { path.addLine(to: q) }
            path.closeSubpath()

            let s = strokes[i]
            s.removeAllAnimations()
            s.path = path
            s.fillColor = color.cgColor
            s.bounds = path.boundingBoxOfPath.insetBy(dx: -2, dy: -2)
            // Anchor at hinge: path local (0,0) maps to layer position
            s.anchorPoint = CGPoint(
                x: (0 - s.bounds.minX) / max(s.bounds.width, 0.001),
                y: (0 - s.bounds.minY) / max(s.bounds.height, 0.001)
            )
            s.position = hinge
            s.transform = CATransform3DIdentity
            s.opacity = 1
            s.shadowColor = color.cgColor
            s.shadowOpacity = 0.4
            s.shadowRadius = 5
            s.shadowOffset = .zero
        }
        restPositions = rests
    }

    func set(color: NSColor, motion: Motion) {
        self.color = color
        strokes.forEach {
            $0.fillColor = color.cgColor
            $0.shadowColor = color.cgColor
        }
        if self.motion != motion || strokes[0].animation(forKey: "opacityWave") == nil {
            self.motion = motion
            if !collapsing { applyIdleMotion() }
        }
    }

    func kick() {
        if !collapsing { applyIdleMotion() }
    }

    // MARK: - Continuous idle motion (subtle character life)

    private func applyIdleMotion() {
        host.removeAllAnimations()
        for (i, l) in strokes.enumerated() {
            l.removeAllAnimations()
            l.transform = CATransform3DIdentity
            l.opacity = 1
            if restPositions.indices.contains(i) {
                l.position = restPositions[i]
            }

            // Soft opacity shimmer
            let opacity = CABasicAnimation(keyPath: "opacity")
            opacity.fromValue = motion == .active ? 0.45 : 0.7
            opacity.toValue = 1.0
            opacity.duration = motion == .active ? 0.45 : 1.5
            opacity.beginTime = CACurrentMediaTime() + Double(i) * 0.12
            opacity.autoreverses = true
            opacity.repeatCount = .infinity
            opacity.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            l.add(opacity, forKey: "opacityWave")

            // Outer strokes gently sway like breathing shoulders
            if i != 1 {
                let sway = CABasicAnimation(keyPath: "transform.rotation.z")
                let amp: CGFloat = motion == .active ? 0.08 : 0.035
                sway.fromValue = i == 0 ? -amp : amp
                sway.toValue = i == 0 ? amp : -amp
                sway.duration = motion == .active ? 0.6 : 2.0
                sway.autoreverses = true
                sway.repeatCount = .infinity
                sway.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                l.add(sway, forKey: "sway")
            } else {
                // Center: tiny vertical bounce
                let bob = CABasicAnimation(keyPath: "transform.translation.y")
                bob.fromValue = -1.5
                bob.toValue = 1.5
                bob.duration = motion == .active ? 0.5 : 1.6
                bob.autoreverses = true
                bob.repeatCount = .infinity
                bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                l.add(bob, forKey: "bob")
            }
        }
    }

    // MARK: - Pixar click: sides fall out → spring home

    /// Classic character beat:
    /// 1. Anticipation (squash / lean in)
    /// 2. Sides fall outward (hinged at top, cartoon flop)
    /// 3. Brief settle
    /// 4. Sides leap back past rest (overshoot) and ease into place
    private func playPixarFallAndReturn() {
        guard !collapsing else { return }
        collapsing = true
        host.removeAllAnimations()
        strokes.forEach { $0.removeAllAnimations() }

        // Reset to rest pose before keyframing
        for (i, l) in strokes.enumerated() {
            l.transform = CATransform3DIdentity
            l.opacity = 1
            if restPositions.indices.contains(i) { l.position = restPositions[i] }
        }

        let left = strokes[0]
        let center = strokes[1]
        let right = strokes[2]

        // --- Timing (seconds) — snappy Pixar short ---
        let anticip: CFTimeInterval = 0.14
        let fall: CFTimeInterval = 0.42
        let hold: CFTimeInterval = 0.12
        let returnT: CFTimeInterval = 0.55
        let t0 = CACurrentMediaTime()

        // Ease curves: ease-in for fall (accelerate with gravity), springy return
        let easeIn = CAMediaTimingFunction(controlPoints: 0.55, 0.0, 0.85, 0.45)
        let easeOutBack = CAMediaTimingFunction(controlPoints: 0.18, 1.35, 0.35, 1.0)
        let easeAnticip = CAMediaTimingFunction(controlPoints: 0.4, 0.0, 0.2, 1.0)

        // LEFT side: lean in → fall left/down (rotate CW in layer space ≈ negative if y-up...
        // CALayer: +rotation is counter-clockwise. Fall left = rotate CCW for hinge-top
        // so the free end swings left → positive rotation for left stroke.
        animateSideFall(
            layer: left,
            side: .left,
            t0: t0,
            anticip: anticip,
            fall: fall,
            hold: hold,
            returnT: returnT,
            easeAnticip: easeAnticip,
            easeIn: easeIn,
            easeOutBack: easeOutBack
        )
        animateSideFall(
            layer: right,
            side: .right,
            t0: t0,
            anticip: anticip,
            fall: fall,
            hold: hold,
            returnT: returnT,
            easeAnticip: easeAnticip,
            easeIn: easeIn,
            easeOutBack: easeOutBack
        )

        // CENTER: anticipatory squash, crouch while sides fall, spring up on return
        animateCenterReaction(
            layer: center,
            t0: t0,
            anticip: anticip,
            fall: fall,
            hold: hold,
            returnT: returnT,
            easeAnticip: easeAnticip,
            easeIn: easeIn,
            easeOutBack: easeOutBack
        )

        let total = anticip + fall + hold + returnT + 0.08
        DispatchQueue.main.asyncAfter(deadline: .now() + total) { [weak self] in
            guard let self else { return }
            for (i, l) in self.strokes.enumerated() {
                l.removeAllAnimations()
                l.transform = CATransform3DIdentity
                l.opacity = 1
                if self.restPositions.indices.contains(i) {
                    l.position = self.restPositions[i]
                }
            }
            self.collapsing = false
            if self.hover {
                self.layer?.transform = CATransform3DMakeScale(1.08, 1.08, 1)
            }
            self.applyIdleMotion()
        }
    }

    private enum Side { case left, right }

    private func animateSideFall(
        layer: CALayer,
        side: Side,
        t0: CFTimeInterval,
        anticip: CFTimeInterval,
        fall: CFTimeInterval,
        hold: CFTimeInterval,
        returnT: CFTimeInterval,
        easeAnticip: CAMediaTimingFunction,
        easeIn: CAMediaTimingFunction,
        easeOutBack: CAMediaTimingFunction
    ) {
        // Fall angle: ~95° so they flop past horizontal (cartoon weight)
        let fallAngle: CGFloat = side == .left ? 1.65 : -1.65  // radians
        let anticipLean: CGFloat = side == .left ? -0.12 : 0.12 // lean inward first
        // Extra drop as free end hits "floor"
        let fallY: CGFloat = -bounds.height * 0.08
        let fallX: CGFloat = side == .left ? -bounds.width * 0.06 : bounds.width * 0.06

        // Rotation keyframes: rest → lean in → fallen → fallen → overshoot home → rest
        let rot = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        rot.values = [
            0,
            anticipLean,           // anticip: lean toward center
            fallAngle,             // flop out
            fallAngle * 1.05,      // settle a hair further (weight)
            fallAngle * -0.12,     // overshoot past home on the way back
            0,
        ]
        rot.keyTimes = [0, 0.12, 0.42, 0.52, 0.82, 1] as [NSNumber]
        rot.duration = anticip + fall + hold + returnT
        rot.beginTime = t0
        rot.timingFunctions = [
            easeAnticip,
            easeIn,
            CAMediaTimingFunction(name: .easeOut),
            easeOutBack,
            CAMediaTimingFunction(name: .easeOut),
        ]
        rot.fillMode = .forwards
        rot.isRemovedOnCompletion = false

        let ty = CAKeyframeAnimation(keyPath: "transform.translation.y")
        ty.values = [0, 2, fallY, fallY - 1, 4, 0] as [CGFloat]
        ty.keyTimes = rot.keyTimes
        ty.duration = rot.duration
        ty.beginTime = t0
        ty.timingFunctions = rot.timingFunctions
        ty.fillMode = .forwards
        ty.isRemovedOnCompletion = false

        let tx = CAKeyframeAnimation(keyPath: "transform.translation.x")
        tx.values = [0, side == .left ? 2 : -2, fallX, fallX, side == .left ? -3 : 3, 0] as [CGFloat]
        tx.keyTimes = rot.keyTimes
        tx.duration = rot.duration
        tx.beginTime = t0
        tx.timingFunctions = rot.timingFunctions
        tx.fillMode = .forwards
        tx.isRemovedOnCompletion = false

        // Slight squash on impact
        let sy = CAKeyframeAnimation(keyPath: "transform.scale.y")
        sy.values = [1, 0.92, 0.88, 0.85, 1.08, 1] as [CGFloat]
        sy.keyTimes = rot.keyTimes
        sy.duration = rot.duration
        sy.beginTime = t0
        sy.timingFunctions = rot.timingFunctions
        sy.fillMode = .forwards
        sy.isRemovedOnCompletion = false

        let sx = CAKeyframeAnimation(keyPath: "transform.scale.x")
        sx.values = [1, 1.06, 1.05, 1.08, 0.94, 1] as [CGFloat]
        sx.keyTimes = rot.keyTimes
        sx.duration = rot.duration
        sx.beginTime = t0
        sx.timingFunctions = rot.timingFunctions
        sx.fillMode = .forwards
        sx.isRemovedOnCompletion = false

        // Stagger: right side lags a frame for overlap (Pixar overlapping action)
        let lag: CFTimeInterval = side == .right ? 0.05 : 0
        for a in [rot, ty, tx, sy, sx] {
            a.beginTime = t0 + lag
            layer.add(a, forKey: "pixar-\(a.keyPath ?? "x")")
        }
    }

    private func animateCenterReaction(
        layer: CALayer,
        t0: CFTimeInterval,
        anticip: CFTimeInterval,
        fall: CFTimeInterval,
        hold: CFTimeInterval,
        returnT: CFTimeInterval,
        easeAnticip: CAMediaTimingFunction,
        easeIn: CAMediaTimingFunction,
        easeOutBack: CAMediaTimingFunction
    ) {
        let total = anticip + fall + hold + returnT
        // Center ducks (squash) while sides fall, then springs up when they return
        let sy = CAKeyframeAnimation(keyPath: "transform.scale.y")
        sy.values = [1, 0.82, 0.72, 0.75, 1.18, 1] as [CGFloat]
        sy.keyTimes = [0, 0.12, 0.42, 0.52, 0.78, 1] as [NSNumber]
        sy.duration = total
        sy.beginTime = t0
        sy.timingFunctions = [
            easeAnticip, easeIn,
            CAMediaTimingFunction(name: .easeOut),
            easeOutBack,
            CAMediaTimingFunction(name: .easeOut),
        ]
        sy.fillMode = .forwards
        sy.isRemovedOnCompletion = false

        let sx = CAKeyframeAnimation(keyPath: "transform.scale.x")
        sx.values = [1, 1.12, 1.2, 1.15, 0.9, 1] as [CGFloat]
        sx.keyTimes = sy.keyTimes
        sx.duration = total
        sx.beginTime = t0
        sx.timingFunctions = sy.timingFunctions
        sx.fillMode = .forwards
        sx.isRemovedOnCompletion = false

        let ty = CAKeyframeAnimation(keyPath: "transform.translation.y")
        ty.values = [0, -2, -6, -5, 3, 0] as [CGFloat]
        ty.keyTimes = sy.keyTimes
        ty.duration = total
        ty.beginTime = t0
        ty.timingFunctions = sy.timingFunctions
        ty.fillMode = .forwards
        ty.isRemovedOnCompletion = false

        layer.add(sy, forKey: "center-sy")
        layer.add(sx, forKey: "center-sx")
        layer.add(ty, forKey: "center-ty")
    }
}

// MARK: - PillButton

/// A filled, rounded, full-width button with a hover state and a leading glyph
/// (record dot / stop square) drawn in code.
private final class PillButton: NSButton {
    enum Glyph { case record, stop }

    /// Venezuela nature backdrop: Angel Falls at rest, Catatumbo thunder ONLY
    /// while recording (the state change itself tells the story — serene falls
    /// → electric storm). `.none` = plain gradient fill (fallback when the
    /// bundled clips are missing, e.g. bare-binary runs).
    enum Scene { case none, angelFalls, thunder }

    private var fill: NSColor = PillButton.jungle
    private var glyph: Glyph = .record
    private var hovering = false
    private var pressed = false
    private static let radius: CGFloat = 10

    /// Fallback fills when the clips are missing: Canaima jungle green at
    /// rest, Catatumbo storm indigo while recording — never the stock red.
    static let jungle = NSColor(calibratedRed: 0.07, green: 0.34, blue: 0.27, alpha: 1)
    static let storm = NSColor(calibratedRed: 0.22, green: 0.20, blue: 0.55, alpha: 1)

    // Nature backdrop machinery (built lazily on first scene).
    private var scene: Scene = .none
    private var videoContainer: VideoBackdropView?
    private var videoLabel: NSTextField?
    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var currentClipURL: URL?

    /// Bundled clip URLs by basename ("angel-falls", "catatumbo", …).
    private static let clips: [String: URL] = {
        var map = [String: URL]()
        for url in IdleCinemaView.resolveIntroClips() {
            map[url.deletingPathExtension().lastPathComponent] = url
        }
        return map
    }()

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

    func configure(title: String, fill: NSColor, glyph: Glyph, scene: Scene = .none) {
        self.title = title
        self.fill = fill
        self.glyph = glyph
        layer?.shadowColor = fill.withAlphaComponent(0.5).cgColor
        applyScene(scene)
        needsDisplay = true
    }

    // MARK: - Nature backdrop

    private var videoActive: Bool { scene != .none && currentClipURL != nil }

    private func clipURL(for scene: Scene) -> URL? {
        switch scene {
        case .none: return nil
        case .angelFalls: return Self.clips["angel-falls"]
        case .thunder: return Self.clips["catatumbo"]
        }
    }

    private func applyScene(_ newScene: Scene) {
        scene = newScene
        guard let url = clipURL(for: newScene) else {
            // No clip (scene .none or resources missing) → plain fill.
            currentClipURL = nil
            queuePlayer?.pause()
            videoContainer?.isHidden = true
            return
        }
        buildVideoViewsIfNeeded()
        videoContainer?.isHidden = false
        let prefix = glyph == .record ? "\u{25CF}  " : "\u{25A0}  "
        videoLabel?.stringValue = prefix + title
        // Night-storm footage is near-black between strikes: give the thunder
        // scene an indigo base + light scrim so it reads "electric storm", and
        // let the lightning flashes punch through. Angel Falls is bright and
        // needs the darker scrim for label legibility.
        switch newScene {
        case .thunder:
            // Screen-blend the night storm over an indigo base: black sky
            // becomes the pill color and only the LIGHTNING punches through.
            videoContainer?.setTone(base: PillButton.storm, scrimTop: 0.0,
                                    scrimBottom: 0.18, screenBlend: true)
        default:
            videoContainer?.setTone(base: NSColor.black.withAlphaComponent(0.4),
                                    scrimTop: 0.30, scrimBottom: 0.52, screenBlend: false)
        }

        // Idempotent: applyMode re-configures every second while recording
        // (elapsed ticker) — only touch the player when the clip changes.
        if currentClipURL != url {
            currentClipURL = url
            let player = AVQueuePlayer()
            player.isMuted = true
            looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            queuePlayer = player
            videoContainer?.playerLayer.player = player
        }
        // Don't burn a decoder on a hidden button (compact vs expanded header).
        if window == nil || isHiddenOrHasHiddenAncestor {
            queuePlayer?.pause()
        } else {
            queuePlayer?.play()
        }
    }

    private func buildVideoViewsIfNeeded() {
        guard videoContainer == nil else { return }

        let container = VideoBackdropView()
        container.translatesAutoresizingMaskIntoConstraints = false
        addSubview(container)
        videoContainer = container

        // Label as a real NSTextField (AppKit owns redraw — no stale-layer
        // ghosting from hand-drawn text over video).
        let label = NSTextField(labelWithString: "")
        label.font = .systemFont(ofSize: 13.5, weight: .semibold)
        label.textColor = .white
        label.alignment = .center
        label.lineBreakMode = .byTruncatingTail
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.6)
        shadow.shadowOffset = NSSize(width: 0, height: -0.5)
        shadow.shadowBlurRadius = 2
        label.shadow = shadow
        label.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(label)
        videoLabel = label

        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: topAnchor),
            container.bottomAnchor.constraint(equalTo: bottomAnchor),
            container.leadingAnchor.constraint(equalTo: leadingAnchor),
            container.trailingAnchor.constraint(equalTo: trailingAnchor),
            label.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: 8),
        ])
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        // Re-evaluate playback when attached/detached (hidden pills stay paused).
        applyScene(scene)
    }

    /// Click-transparent video pill background: AVPlayerLayer + legibility
    /// scrim + hairline border, all laid out HERE (its own layout pass) so the
    /// sublayers always match the real bounds.
    final class VideoBackdropView: NSView {
        let playerLayer = AVPlayerLayer()
        private let scrim = CAGradientLayer()

        init() {
            super.init(frame: .zero)
            wantsLayer = true
            layer?.cornerRadius = 10
            layer?.masksToBounds = true
            layer?.borderWidth = 1
            layer?.borderColor = NSColor.white.withAlphaComponent(0.25).cgColor
            playerLayer.videoGravity = .resizeAspectFill
            layer?.addSublayer(playerLayer)
            scrim.startPoint = CGPoint(x: 0.5, y: 1)
            scrim.endPoint = CGPoint(x: 0.5, y: 0)
            layer?.addSublayer(scrim)
            setTone(base: NSColor.black.withAlphaComponent(0.4), scrimTop: 0.30, scrimBottom: 0.52, screenBlend: false)
        }
        required init?(coder: NSCoder) { fatalError("unused") }

        /// Scene-tuned backdrop: base color behind the clip, scrim strength,
        /// and optional screen-blend (dark clip pixels vanish into the base —
        /// used so the Catatumbo night sky reads indigo, not dead black).
        func setTone(base: NSColor, scrimTop: CGFloat, scrimBottom: CGFloat, screenBlend: Bool) {
            layer?.backgroundColor = base.cgColor
            playerLayer.compositingFilter = screenBlend ? "screenBlendMode" : nil
            scrim.colors = [
                NSColor.black.withAlphaComponent(scrimBottom).cgColor,
                NSColor.black.withAlphaComponent(scrimTop).cgColor,
            ]
        }

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func layout() {
            super.layout()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            playerLayer.frame = bounds
            scrim.frame = bounds
            CATransaction.commit()
        }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
            owner: self, userInfo: nil))
    }
    override func mouseEntered(with event: NSEvent) {
        hovering = true; needsDisplay = true
        videoContainer?.animator().alphaValue = 0.92
    }
    override func mouseExited(with event: NSEvent) {
        hovering = false; needsDisplay = true
        videoContainer?.animator().alphaValue = 1
    }
    override func mouseDown(with event: NSEvent) {
        pressed = true; needsDisplay = true
        videoContainer?.alphaValue = 0.8
        super.mouseDown(with: event)   // tracks the press + fires the action on mouse-up
        pressed = false; needsDisplay = true
        videoContainer?.alphaValue = 1
    }

    override func draw(_ dirtyRect: NSRect) {
        // With a nature clip playing, the video + scrim ARE the background and
        // PillForegroundView draws the label above them — nothing to do here.
        guard !videoActive else { return }

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
