import AppKit
import CaptureCore

/// Base class for the five Town Hall sections. Centralizes the client provider,
/// async-with-error-handling, and the appear hook. Subclasses override `reload()`
/// to (re)fetch on appearance. All work is on the main thread.
class TownHallSectionView: NSView {
    var clientProvider: () -> CaptureAPIClient? = { nil }
    var onError: ((String) -> Void)?
    var onMutation: (() -> Void)?

    /// Called by the window whenever this section becomes visible.
    func reloadIfNeeded() { reload() }

    /// Override to load data on appear. Default does nothing.
    func reload() {}

    /// Run an async API block with uniform error surfacing. No-ops (silently)
    /// when the helper isn't configured yet.
    func run(_ body: @escaping (CaptureAPIClient) async throws -> Void) {
        guard let client = clientProvider() else {
            onError?("Configure the CRM URL + token first (gear → Configure…).")
            return
        }
        Task { @MainActor in
            do {
                try await body(client)
            } catch let error as CaptureAPIClient.APIError {
                self.onError?(error.errorDescription ?? "\(error)")
            } catch {
                self.onError?(error.localizedDescription)
            }
        }
    }

    /// A standard vertical layout: a header row (title + optional accessory) on
    /// top, a body view filling the rest, with consistent insets.
    func installStandardLayout(header: NSView, body: NSView) {
        header.translatesAutoresizingMaskIntoConstraints = false
        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(header)
        addSubview(body)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            header.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),

            body.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 10),
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            body.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
        ])
    }
}

/// A reusable table cell: a vertical stack of pre-built subviews. Lets sections
/// compose rows without a bespoke NSTableCellView subclass each.
final class THStackCell: NSTableCellView {
    let stack = NSStackView()
    init(views: [NSView]) {
        super.init(frame: .zero)
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 3
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.setViews(views, in: .leading)
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 2),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -2),
        ])
    }
    required init?(coder: NSCoder) { fatalError("unused") }
}

/// A wrapping body label.
func thBodyLabel(_ text: String, weight: NSFont.Weight = .regular, size: CGFloat = 13) -> NSTextField {
    let l = NSTextField(wrappingLabelWithString: text)
    l.font = .systemFont(ofSize: size, weight: weight)
    l.textColor = .labelColor
    l.isEditable = false
    l.isSelectable = true
    l.drawsBackground = false
    l.preferredMaxLayoutWidth = 560
    return l
}

/// A small secondary metadata label (timestamps, byte sizes, author).
func thMetaLabel(_ text: String) -> NSTextField {
    let l = NSTextField(labelWithString: text)
    l.font = .systemFont(ofSize: 11, weight: .regular)
    l.textColor = .secondaryLabelColor
    return l
}

/// An empty-state placeholder label centered in a view.
func thEmptyLabel(_ text: String) -> NSTextField {
    let l = NSTextField(labelWithString: text)
    l.font = .systemFont(ofSize: 12, weight: .regular)
    l.textColor = .tertiaryLabelColor
    l.alignment = .center
    return l
}
