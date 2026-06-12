import CoreGraphics
import Testing
@testable import CaptureCore

/// Regression guard for the 2026-06-12 incident: the record prompt and the
/// Start/Stop control window were both parked in the top-right corner and
/// overlapped, burying the Record button while a call rang — the prompt
/// expired 8 times and the first 8.5 minutes of the call were lost. All
/// panel frames now come from PanelLayout and must be pairwise disjoint.
@Suite struct PanelLayoutTests {

    /// MacBook Air 13" visible frame (menu bar already excluded).
    private let visible = CGRect(x: 0, y: 0, width: 1470, height: 880)

    /// Real-world sizes including title bars (control 230×96 content + HUD
    /// titlebar; prompt grows with a long app name; transcript at minimum).
    private let controlSize = CGSize(width: 230, height: 120)
    private let promptSize = CGSize(width: 320, height: 112)
    private let transcriptSize = CGSize(width: 360, height: 300)

    private func frames() -> (control: CGRect, prompt: CGRect, transcript: CGRect) {
        let control = PanelLayout.controlFrame(visible: visible, size: controlSize)
        let prompt = PanelLayout.promptFrame(visible: visible, size: promptSize, below: control)
        let transcript = PanelLayout.transcriptFrame(visible: visible, size: transcriptSize)
        return (control, prompt, transcript)
    }

    @Test func panelsNeverOverlap() {
        let f = frames()
        #expect(!f.control.intersects(f.prompt))
        #expect(!f.control.intersects(f.transcript))
        #expect(!f.prompt.intersects(f.transcript))
    }

    @Test func promptSitsDirectlyBelowControl() {
        let f = frames()
        #expect(f.prompt.maxY <= f.control.minY - PanelLayout.panelGap + 0.5)
        // Both right-aligned to the same edge.
        #expect(abs(f.prompt.maxX - (visible.maxX - PanelLayout.edgeInset)) < 0.5)
        #expect(abs(f.control.maxX - (visible.maxX - PanelLayout.edgeInset)) < 0.5)
    }

    @Test func allPanelsStayOnScreen() {
        let f = frames()
        for frame in [f.control, f.prompt, f.transcript] {
            #expect(visible.contains(frame))
        }
    }

    @Test func promptWithoutControlFrameTakesTopCorner() {
        let prompt = PanelLayout.promptFrame(visible: visible, size: promptSize, below: nil)
        #expect(visible.contains(prompt))
        #expect(abs(prompt.maxY - (visible.maxY - PanelLayout.edgeInset)) < 0.5)
    }

    @Test func promptClampsOnTinyScreens() {
        let tiny = CGRect(x: 0, y: 0, width: 800, height: 250)
        let control = PanelLayout.controlFrame(visible: tiny, size: controlSize)
        let prompt = PanelLayout.promptFrame(visible: tiny, size: promptSize, below: control)
        // Never pushed below the visible area.
        #expect(prompt.minY >= tiny.minY)
    }
}
