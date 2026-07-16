import AppKit
import CaptureCore

/// Modal NSPanel for CRM URL/token, live transcript prefs, local archive, and
/// free local STT+diarization (meetings). Saved to config.json mode 0600.
final class ConfigurePanel {

    private let panel: NSPanel
    private let urlField = NSTextField(string: "")
    private let tokenField = NSSecureTextField(string: "")
    private let neverPromptField = NSTextField(string: "")
    private let keepAudioLocalCheck = NSButton(
        checkboxWithTitle: "Keep call audio on this Mac (don’t store in CRM)",
        target: nil, action: nil)
    private let onDeviceLiveCheck = NSButton(
        checkboxWithTitle: "On-device live transcript (Apple, private — no cloud)",
        target: nil, action: nil)
    private let localSTTCheck = NSButton(
        checkboxWithTitle: "Local free STT + diarization for meetings (skip Deepgram when available)",
        target: nil, action: nil)
    private let backendPopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let modelField = NSTextField(string: "")
    private let commandField = NSTextField(string: "")
    private let backendsStatus = NSTextField(wrappingLabelWithString: "")
    private var saved = false
    private var original: HelperConfig

    private static let backendChoices: [(title: String, value: String)] = [
        ("Auto (WhisperX → Vibe → whisper.cpp)", "auto"),
        ("WhisperX", "whisperx"),
        ("Vibe CLI", "vibe"),
        ("whisper.cpp (STT only)", "whispercpp"),
        ("Off", "off"),
    ]

    init(config: HelperConfig) {
        self.original = config

        urlField.placeholderString = "https://x.caneycloud.com"
        urlField.stringValue = config.crmBaseUrl
        tokenField.placeholderString = "agbcap_…"
        tokenField.stringValue = config.token
        neverPromptField.placeholderString = "Dictation, SuperWhisper (comma-separated)"
        neverPromptField.stringValue = config.neverPromptApps.joined(separator: ", ")
        keepAudioLocalCheck.state = config.keepAudioLocal ? .on : .off
        onDeviceLiveCheck.state = config.liveTranscriptOnDevice ? .on : .off
        localSTTCheck.state = config.localTranscribeEnabled ? .on : .off
        modelField.placeholderString = "small"
        modelField.stringValue = config.localTranscribeModel
        commandField.placeholderString =
            "optional: /path/.venv/bin/python3 /path/scripts/local-transcribe/transcribe.py"
        commandField.stringValue = config.localTranscribeCommand ?? ""

        backendPopup.removeAllItems()
        for (title, _) in Self.backendChoices {
            backendPopup.addItem(withTitle: title)
        }
        let want = config.localTranscribeBackend
        if let idx = Self.backendChoices.firstIndex(where: { $0.value == want }) {
            backendPopup.selectItem(at: idx)
        } else {
            backendPopup.selectItem(at: 0)
        }

        let available = LocalTranscribeRunner.availableBackends()
        let availNames = available.map(\.rawValue).joined(separator: ", ")
        backendsStatus.stringValue = available.isEmpty
            ? "No local backend detected. Install WhisperX under scripts/local-transcribe/ (see README) or set a custom command."
            : "Detected: \(availNames). Meetings use these on Stop; calls stay dual-channel (no ML)."
        backendsStatus.font = .systemFont(ofSize: 11)
        backendsStatus.textColor = .secondaryLabelColor

        for field in [urlField, tokenField, neverPromptField, modelField, commandField] {
            field.translatesAutoresizingMaskIntoConstraints = false
            field.widthAnchor.constraint(greaterThanOrEqualToConstant: 340).isActive = true
        }
        backendPopup.translatesAutoresizingMaskIntoConstraints = false
        backendPopup.widthAnchor.constraint(greaterThanOrEqualToConstant: 340).isActive = true

        func row(_ label: String, _ field: NSView) -> NSStackView {
            let l = NSTextField(labelWithString: label)
            l.font = .systemFont(ofSize: 12)
            let stack = NSStackView(views: [l, field])
            stack.orientation = .vertical
            stack.alignment = .leading
            stack.spacing = 4
            return stack
        }

        let saveButton = NSButton(title: "Save", target: nil, action: nil)
        saveButton.bezelStyle = .rounded
        saveButton.keyEquivalent = "\r"
        let cancelButton = NSButton(title: "Cancel", target: nil, action: nil)
        cancelButton.bezelStyle = .rounded
        cancelButton.keyEquivalent = "\u{1b}"

        let buttons = NSStackView(views: [cancelButton, saveButton])
        buttons.orientation = .horizontal
        buttons.spacing = 8

        let hint = NSTextField(wrappingLabelWithString:
            "Mint a capture token in CRM Settings (shown once). Stored locally with file mode 0600.")
        hint.font = .systemFont(ofSize: 11)
        hint.textColor = .secondaryLabelColor

        let audioHint = NSTextField(wrappingLabelWithString:
            "Saves a .wav per call to ~/Documents/AGB Call Recordings. Turn on the CRM’s transcript-only setting to stop storing audio in the cloud — calls are still transcribed.")
        audioHint.font = .systemFont(ofSize: 11)
        audioHint.textColor = .secondaryLabelColor

        let meetingHint = NSTextField(wrappingLabelWithString:
            "In-person meetings (⌘M): on Stop, assembles mono mic audio and runs local STT+diarization when enabled. CRM maps SPEAKER_00… to names on /record.")
        meetingHint.font = .systemFont(ofSize: 11)
        meetingHint.textColor = .secondaryLabelColor

        let stack = NSStackView(views: [
            row("CRM base URL", urlField),
            row("Capture token", tokenField),
            row("Never-prompt apps", neverPromptField),
            onDeviceLiveCheck,
            keepAudioLocalCheck,
            audioHint,
            localSTTCheck,
            row("Local STT backend", backendPopup),
            row("Model (WhisperX)", modelField),
            row("Custom command (optional)", commandField),
            backendsStatus,
            meetingHint,
            hint,
            buttons,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 10
        stack.edgeInsets = NSEdgeInsets(top: 16, left: 20, bottom: 14, right: 20)

        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 560),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        panel.title = "Configure AGB AI"
        panel.contentView = stack
        panel.isReleasedWhenClosed = false
        panel.center()

        saveButton.target = self
        saveButton.action = #selector(saveTapped)
        cancelButton.target = self
        cancelButton.action = #selector(cancelTapped)
    }

    /// Run modally. Returns the updated config on Save, nil on Cancel.
    func runModal() -> HelperConfig? {
        saved = false
        NSApp.activate(ignoringOtherApps: true)
        NSApp.runModal(for: panel)
        panel.orderOut(nil)
        guard saved else { return nil }

        var updated = original
        updated.crmBaseUrl = urlField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.token = tokenField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.neverPromptApps = neverPromptField.stringValue
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        updated.keepAudioLocal = keepAudioLocalCheck.state == .on
        updated.liveTranscriptOnDevice = onDeviceLiveCheck.state == .on
        updated.localTranscribeEnabled = localSTTCheck.state == .on
        let idx = max(0, backendPopup.indexOfSelectedItem)
        updated.localTranscribeBackend = Self.backendChoices[min(idx, Self.backendChoices.count - 1)].value
        let model = modelField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.localTranscribeModel = model.isEmpty ? "small" : model
        let cmd = commandField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.localTranscribeCommand = cmd.isEmpty ? nil : cmd
        updated.helperVersion = AudioConstants.helperVersion
        return updated
    }

    @objc private func saveTapped() {
        saved = true
        NSApp.stopModal()
    }

    @objc private func cancelTapped() {
        saved = false
        NSApp.stopModal()
    }
}
