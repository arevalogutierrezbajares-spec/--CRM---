import CoreGraphics

/// Single source of truth for where the helper's floating panels sit on
/// screen. Every panel position is computed here from the screen's visible
/// frame and the panels' *actual* frame sizes, so the windows can never
/// overlap each other — the regression that buried the record prompt under
/// the Start/Stop control during a live call (2026-06-12).
///
/// Layout (right edge of the screen, AppKit coordinates — y grows upward):
///
///   ┌─ visibleFrame.maxY ───────────────┐
///   │                    [ control ]    │  ← top-right, edgeInset
///   │                    [ prompt  ]    │  ← directly below control, panelGap
///   │                                   │
///   │                    [transcript]   │  ← bottom-right, transcriptInset
///   └─ visibleFrame.minY ───────────────┘
public enum PanelLayout {
    /// Inset from the screen's visible edges for the top-right stack.
    public static let edgeInset: CGFloat = 16
    /// Vertical gap between the control window and the prompt below it.
    public static let panelGap: CGFloat = 12
    /// Inset for the live-transcript window in the bottom-right corner.
    public static let transcriptInset: CGFloat = 24

    /// Top-right corner, just under the menu bar (and clear of the notch).
    public static func controlFrame(visible: CGRect, size: CGSize) -> CGRect {
        CGRect(
            x: visible.maxX - size.width - edgeInset,
            y: visible.maxY - size.height - edgeInset,
            width: size.width,
            height: size.height
        )
    }

    /// Right-aligned, stacked directly below the control window so the two
    /// can never cover each other. If the control frame is unknown the prompt
    /// takes the control's top-right slot itself. Clamped to stay on screen.
    public static func promptFrame(visible: CGRect, size: CGSize, below controlFrame: CGRect?) -> CGRect {
        let top = controlFrame.map { $0.minY - panelGap } ?? (visible.maxY - edgeInset)
        let y = max(visible.minY + edgeInset, top - size.height)
        return CGRect(
            x: visible.maxX - size.width - edgeInset,
            y: y,
            width: size.width,
            height: size.height
        )
    }

    /// Bottom-right corner, far from the control/prompt stack.
    public static func transcriptFrame(visible: CGRect, size: CGSize) -> CGRect {
        CGRect(
            x: visible.maxX - size.width - transcriptInset,
            y: visible.minY + transcriptInset,
            width: size.width,
            height: size.height
        )
    }
}
