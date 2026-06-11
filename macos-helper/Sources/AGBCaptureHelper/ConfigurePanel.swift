import AppKit
import CaptureCore

/// Small modal NSPanel with the two fields the helper needs: CRM base URL and
/// the `agbcap_…` capture token (minted once in CRM Settings → /settings).
/// Saved to config.json with mode 0600 by the caller.
final class ConfigurePanel {

    private let panel: NSPanel
    private let urlField = NSTextField(string: "")
    private let tokenField = NSSecureTextField(string: "")
    private let neverPromptField = NSTextField(string: "")
    private var saved = false
    private var original: HelperConfig

    init(config: HelperConfig) {
        self.original = config

        urlField.placeholderString = "https://x.caneycloud.com"
        urlField.stringValue = config.crmBaseUrl
        tokenField.placeholderString = "agbcap_…"
        tokenField.stringValue = config.token
        neverPromptField.placeholderString = "Dictation, SuperWhisper (comma-separated)"
        neverPromptField.stringValue = config.neverPromptApps.joined(separator: ", ")

        for field in [urlField, tokenField, neverPromptField] {
            field.translatesAutoresizingMaskIntoConstraints = false
            field.widthAnchor.constraint(greaterThanOrEqualToConstant: 320).isActive = true
        }

        func row(_ label: String, _ field: NSTextField) -> NSStackView {
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

        let stack = NSStackView(views: [
            row("CRM base URL", urlField),
            row("Capture token", tokenField),
            row("Never-prompt apps", neverPromptField),
            hint,
            buttons,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 16, right: 20)

        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 380, height: 260),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        panel.title = "Configure AGB Capture Helper"
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
