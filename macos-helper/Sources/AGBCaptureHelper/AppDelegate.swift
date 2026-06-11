import AppKit
import CaptureCore

/// Menu-bar shell. Owns the state machine and wires detector → prompt →
/// engine → spooler → upload worker. All UI mutation happens on the main
/// thread. The recording state is always visible in the menu bar
/// (FR-CALL-RET-3, FR-CALL-OPS-1).
final class AppDelegate: NSObject, NSApplicationDelegate {

    enum HelperState: Equatable {
        case idle
        case detected
        case recording
        case paused
        case uploading
        case error

        var glyph: (symbol: String, color: NSColor) {
            switch self {
            case .idle: return ("○", .secondaryLabelColor)
            case .detected: return ("?", .systemYellow)
            case .recording: return ("●", .systemRed)
            case .paused: return ("‖", .systemOrange)
            case .uploading: return ("↑", .systemBlue)
            case .error: return ("⚠", .systemYellow)
            }
        }

        var label: String {
            switch self {
            case .idle: return "Idle — watching for calls"
            case .detected: return "Call detected — waiting for your answer"
            case .recording: return "Recording"
            case .paused: return "Paused"
            case .uploading: return "Uploading"
            case .error: return "Error"
            }
        }
    }

    // MARK: - State

    private var state: HelperState = .idle { didSet { refreshUI() } }
    private var lastError: String? { didSet { refreshUI() } }
    private var lastResult: String?
    private var uploaderBusy = false
    private var config = HelperConfig.effective()

    // MARK: - Components

    private var statusItem: NSStatusItem?
    private let menu = NSMenu()
    private let stateMenuItem = NSMenuItem(title: "State: …", action: nil, keyEquivalent: "")
    private let errorMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let resultMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private var startMenuItem: NSMenuItem?
    private var stopMenuItem: NSMenuItem?
    private var pauseMenuItem: NSMenuItem?
    private var offRecordMenuItem: NSMenuItem?

    private var store: SpoolStore?
    private var worker: UploadQueueWorker?
    private var workerTask: Task<Void, Never>?
    private var engine: AudioEngine?
    private var activeSpooler: ChunkSpooler?
    private let detector = MicActivityDetector()
    private let prompt = PromptController()
    private var hotKey: GlobalHotKey?
    private var detectedSourceApp: String?

    private let log = HelperLog.shared

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        log.info("AGBCaptureHelper \(AudioConstants.helperVersion) launching", category: "app")
        buildStatusItem()

        do {
            let store = try SpoolStore()
            self.store = store
            // Crash salvage (FR-CALL-OPS-5): mark any leftover recording
            // sessions as ended+partial so the worker finalizes them.
            let adopted = try store.adoptOrphans()
            if !adopted.isEmpty {
                log.info("adopted \(adopted.count) orphaned session(s) from a previous run", category: "app")
            }
            startWorker(store: store)
        } catch {
            lastError = "Spool unavailable: \(error.localizedDescription)"
            state = .error
        }

        wireDetectorAndPrompt()
        hotKey = GlobalHotKey()
        hotKey?.onPressed = { [weak self] in self?.hotKeyToggled() }

        detector.arm()
        refreshUI()
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Best-effort: a quit mid-recording ends the session cleanly so the
        // worker (next launch) finalizes it rather than salvaging a "crash".
        if state == .recording || state == .paused {
            finishRecording(autoDetected: false)
        }
        worker?.stop()
    }

    // MARK: - Worker

    private func startWorker(store: SpoolStore) {
        // clientProvider runs on the worker's task: read config fresh each
        // pass (picks up Configure… saves) but never mutate UI state here.
        let worker = UploadQueueWorker(store: store, clientProvider: {
            CaptureAPIClient(config: HelperConfig.effective())
        })
        worker.onStateChange = { [weak self] workerState in
            DispatchQueue.main.async {
                guard let self else { return }
                switch workerState {
                case .uploading:
                    self.uploaderBusy = true
                case .idle:
                    self.uploaderBusy = false
                    if self.state == .uploading { self.state = .idle }
                    if self.lastError?.hasPrefix("Upload") == true { self.lastError = nil }
                case .waitingRetry(_, let reason):
                    self.uploaderBusy = true
                    self.lastError = "Upload retrying: \(reason)"
                }
                self.refreshUI()
            }
        }
        worker.onSessionFinalized = { [weak self] outcome in
            DispatchQueue.main.async {
                guard let self else { return }
                let title = outcome.finalize.title ?? "call"
                let items = outcome.finalize.actionItemCount.map { " — \($0) action item(s)" } ?? ""
                self.lastResult = "Filed: \(title)\(items)"
                if let flags = outcome.finalize.suspectFlags, !flags.isEmpty {
                    self.lastResult = (self.lastResult ?? "") + " ⚠ \(flags.joined(separator: ", "))"
                }
                self.refreshUI()
            }
        }
        worker.onError = { [weak self] message in
            DispatchQueue.main.async {
                self?.lastError = "Upload: \(message)"
            }
        }
        self.worker = worker
        workerTask = Task.detached {
            await worker.runForever()
        }
    }

    // MARK: - Detection → prompt → record

    private func wireDetectorAndPrompt() {
        detector.onActivity = { [weak self] sourceApp in
            self?.handleDetection(sourceApp: sourceApp)
        }
        detector.onCallLikelyEnded = { [weak self] in
            guard let self, self.state == .recording || self.state == .paused else { return }
            self.log.info("auto-finalizing: call end detected", category: "app")
            self.finishRecording(autoDetected: true)
        }
        prompt.onRecord = { [weak self] in
            self?.affirmRecording()
        }
        prompt.onDismiss = { [weak self] timedOut in
            self?.declineRecording(timedOut: timedOut)
        }
    }

    private func handleDetection(sourceApp: String?) {
        guard state == .idle else {
            detector.arm()
            return
        }
        // FR-CALL-TRG-6: never-prompt apps.
        if let app = sourceApp,
           config.neverPromptApps.contains(where: { $0.caseInsensitiveCompare(app) == .orderedSame }) {
            log.info("mic activity from never-prompt app \(app) — ignoring", category: "app")
            detector.arm()
            return
        }

        detectedSourceApp = sourceApp
        state = .detected

        // Start pre-roll capture immediately so affirming later loses nothing
        // (FR-CALL-TRG-3). Bytes stay in memory until affirmation.
        Task { @MainActor in
            if let problem = await PermissionsManager.ensureCapturePermissions() {
                self.captureUnavailable(problem)
                return
            }
            let engine = AudioEngine()
            engine.onError = { [weak self] message in
                DispatchQueue.main.async { self?.handleEngineError(message) }
            }
            self.engine = engine
            do {
                try await engine.startPreroll()
                self.prompt.show(sourceApp: self.detectedSourceApp)
            } catch {
                self.captureUnavailable("Could not start capture: \(error.localizedDescription)\n\n\(PermissionsManager.statusReport())")
            }
        }
    }

    private func affirmRecording() {
        guard let engine, let store, state == .detected else { return }
        do {
            // Backdate startedAt to the first pre-rolled byte.
            let startedAt = Date().addingTimeInterval(-engine.preRollSeconds)
            let spooler = try store.createSession(startedAt: startedAt,
                                                  sourceApp: detectedSourceApp)
            activeSpooler = spooler
            engine.promoteToRecording(spooler: spooler)
            state = .recording
            detector.watchForCallEnd()
            worker?.kick() // chunks upload incrementally during the call
            log.info("recording affirmed (source: \(detectedSourceApp ?? "unknown"))", category: "app")
        } catch {
            captureUnavailable("Could not create local spool: \(error.localizedDescription)")
        }
    }

    private func declineRecording(timedOut: Bool) {
        guard state == .detected else { return }
        engine?.abortAndClear()
        engine = nil
        detectedSourceApp = nil
        state = .idle
        log.info("prompt \(timedOut ? "timed out" : "declined") — zero bytes persisted", category: "app")
        detector.arm()
    }

    private func captureUnavailable(_ message: String) {
        engine?.abortAndClear()
        engine = nil
        prompt.dismissPanel()
        state = .error
        lastError = message
        detector.arm()
        presentAlert(title: "Capture unavailable", text: message)
    }

    /// Mid-call failure: FR-CALL-OPS-3 — visible within 10 s.
    private func handleEngineError(_ message: String) {
        lastError = message
        if state == .recording || state == .paused {
            presentAlert(title: "Capture problem mid-call", text: message)
        }
        refreshUI()
    }

    // MARK: - Menu actions

    @objc private func startRecordingManually() {
        switch state {
        case .detected:
            prompt.dismissPanel()
            affirmRecording()
        case .idle, .uploading, .error:
            manualStart()
        default:
            break
        }
    }

    /// FR-CALL-TRG-4: manual start, independent of detection.
    private func manualStart() {
        guard engine == nil, let store else {
            if store == nil { presentAlert(title: "Cannot record", text: lastError ?? "Spool unavailable") }
            return
        }
        detector.disarm()
        Task { @MainActor in
            if let problem = await PermissionsManager.ensureCapturePermissions() {
                self.captureUnavailable(problem)
                return
            }
            let engine = AudioEngine()
            engine.onError = { [weak self] message in
                DispatchQueue.main.async { self?.handleEngineError(message) }
            }
            self.engine = engine
            do {
                try await engine.startPreroll()
                let spooler = try store.createSession(startedAt: Date(), sourceApp: nil)
                self.activeSpooler = spooler
                engine.promoteToRecording(spooler: spooler)
                self.state = .recording
                self.detector.watchForCallEnd()
                self.worker?.kick()
                self.log.info("manual recording started", category: "app")
            } catch {
                self.captureUnavailable("Could not start capture: \(error.localizedDescription)")
            }
        }
    }

    @objc private func stopRecordingTapped() {
        finishRecording(autoDetected: false)
    }

    private func finishRecording(autoDetected: Bool) {
        guard state == .recording || state == .paused, let engine else { return }
        detector.disarm()

        let report = engine.stopAndFlush()
        self.engine = nil

        if let spooler = activeSpooler {
            do {
                try spooler.markEnded(endedAt: Date(), partial: false)
            } catch {
                lastError = "Could not mark session ended: \(error.localizedDescription)"
            }
            if report.anyChannelNearSilent && report.frames > 0 {
                // FR-CALL-OPS-4 (informational here; server flags at filing).
                log.warn("near-silent channel: \(report.summary)", category: "app")
                lastResult = "Suspect audio: \(report.summary)"
            }
            log.info("recording ended (\(Int(spooler.spooledSeconds))s, auto=\(autoDetected)) — \(report.summary)", category: "app")
        }
        activeSpooler = nil
        detectedSourceApp = nil
        state = .uploading
        worker?.kick()
        detector.arm()
    }

    @objc private func pauseResumeTapped() {
        guard let engine else { return }
        if state == .recording {
            engine.pause()
            state = .paused
        } else if state == .paused {
            engine.resume()
            state = .recording
        }
    }

    /// FR-CALL-CAP-8 v1: drop the un-uploaded tail (up to last 5 minutes).
    @objc private func offTheRecordTapped() {
        guard state == .recording || state == .paused, let spooler = activeSpooler else { return }
        do {
            let dropped = try spooler.discardUnuploadedTail(seconds: 5 * 60)
            let seconds = dropped / AudioConstants.bytesPerSecond
            lastResult = "Off the record: dropped last \(seconds)s (un-uploaded tail)"
            log.info("off-the-record: dropped \(seconds)s (\(dropped) bytes)", category: "app")
            refreshUI()
        } catch {
            lastError = "Off-the-record failed: \(error.localizedDescription)"
        }
    }

    @objc private func testConnectionTapped() {
        let cfg = HelperConfig.effective()
        config = cfg
        guard cfg.isComplete, let client = CaptureAPIClient(config: cfg) else {
            presentAlert(title: "Not configured",
                         text: "Set the CRM URL and capture token first (Configure…). Mint a token in CRM Settings → /settings.")
            return
        }
        Task { @MainActor in
            do {
                let pong = try await client.ping()
                self.lastError = nil
                self.presentAlert(
                    title: "Connected",
                    text: "CRM reachable at \(cfg.crmBaseUrl)\nWorkspace: \(pong.workspaceId ?? "?")\nAudio retention: \(pong.retentionDays.map { "\($0) days" } ?? "?")"
                )
            } catch {
                self.lastError = error.localizedDescription
                self.presentAlert(title: "Connection failed", text: error.localizedDescription)
            }
            self.refreshUI()
        }
    }

    @objc private func configureTapped() {
        let current = HelperConfig.effective()
        let panel = ConfigurePanel(config: current)
        if let updated = panel.runModal() {
            do {
                try updated.save()
                config = updated
                lastError = nil
                log.info("configuration saved (url: \(updated.crmBaseUrl))", category: "app")
            } catch {
                presentAlert(title: "Could not save config", text: error.localizedDescription)
            }
            refreshUI()
        }
    }

    /// FR-CALL-OPS-6: one-click diagnostics bundle.
    @objc private func diagnosticsTapped() {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop/agb-capture-diagnostics.txt")
        let text = buildDiagnostics()
        let ok = FileManager.default.createFile(atPath: url.path,
                                                contents: Data(text.utf8),
                                                attributes: [.posixPermissions: 0o600])
        if ok {
            NSWorkspace.shared.activateFileViewerSelecting([url])
            presentAlert(title: "Diagnostics written", text: url.path)
        } else {
            presentAlert(title: "Diagnostics failed", text: "Could not write \(url.path)")
        }
    }

    private func buildDiagnostics() -> String {
        let cfg = HelperConfig.effective()
        let maskedToken = cfg.token.isEmpty
            ? "(not set)"
            : "\(cfg.token.prefix(10))…(\(cfg.token.count) chars)"

        var spoolSummary = "(spool unavailable)"
        if let store {
            let pending = (try? store.pendingSessions()) ?? []
            if pending.isEmpty {
                spoolSummary = "no pending sessions"
            } else {
                spoolSummary = pending.map { spooler in
                    let s = spooler.snapshot
                    return "- \(s.sessionLocalId): started \(s.startedAt), written \(s.seqsWritten.count), uploaded \(s.seqsUploaded.count), ended \(s.endedAt ?? "no"), partial \(s.partial), server \(s.serverSessionId ?? "-")"
                }.joined(separator: "\n")
            }
        }

        let outcomes = (worker?.recentOutcomes ?? []).suffix(5).map { outcome in
            "- \(ISO8601.string(from: outcome.at)) \(outcome.localId) → \(outcome.finalize.recordingId ?? "?") \(outcome.finalize.title ?? "")"
        }.joined(separator: "\n")

        return """
        AGB Capture Helper diagnostics — \(ISO8601.string(from: Date()))
        Helper version: \(AudioConstants.helperVersion) (protocol \(AudioConstants.protocolVersion))
        macOS: \(ProcessInfo.processInfo.operatingSystemVersionString)

        == State ==
        \(state.label)
        Last error: \(lastError ?? "none")
        Last result: \(lastResult ?? "none")
        Uploader busy: \(uploaderBusy)

        == Permissions ==
        \(PermissionsManager.statusReport())

        == Config ==
        CRM URL: \(cfg.crmBaseUrl.isEmpty ? "(not set)" : cfg.crmBaseUrl)
        Token: \(maskedToken)
        Never-prompt apps: \(cfg.neverPromptApps.isEmpty ? "(none)" : cfg.neverPromptApps.joined(separator: ", "))

        == Spool ==
        \(spoolSummary)

        == Recent upload results ==
        \(outcomes.isEmpty ? "(none this run)" : outcomes)
        Worker last error: \(worker?.lastError ?? "none")

        == Log tail ==
        \(log.tail(lines: 200))
        """
    }

    @objc private func quitTapped() {
        NSApp.terminate(nil)
    }

    private func hotKeyToggled() {
        switch state {
        case .recording, .paused:
            finishRecording(autoDetected: false)
        case .detected:
            prompt.dismissPanel()
            affirmRecording()
        case .idle, .uploading, .error:
            manualStart()
        }
    }

    // MARK: - Status item / menu

    private func buildStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem = item

        stateMenuItem.isEnabled = false
        errorMenuItem.isEnabled = false
        resultMenuItem.isEnabled = false

        menu.addItem(stateMenuItem)
        menu.addItem(errorMenuItem)
        menu.addItem(resultMenuItem)
        menu.addItem(.separator())

        let start = makeItem("Start Recording", #selector(startRecordingManually), "r")
        startMenuItem = start
        menu.addItem(start)

        let stop = makeItem("Stop Recording", #selector(stopRecordingTapped), "s")
        stopMenuItem = stop
        menu.addItem(stop)

        let pause = makeItem("Pause", #selector(pauseResumeTapped), "p")
        pauseMenuItem = pause
        menu.addItem(pause)

        let offRecord = makeItem("Off the record: discard last 5 min", #selector(offTheRecordTapped), "")
        offRecordMenuItem = offRecord
        menu.addItem(offRecord)

        menu.addItem(.separator())
        menu.addItem(makeItem("Test Connection", #selector(testConnectionTapped), ""))
        menu.addItem(makeItem("Configure…", #selector(configureTapped), ","))
        menu.addItem(makeItem("Diagnostics", #selector(diagnosticsTapped), "d"))
        menu.addItem(.separator())
        menu.addItem(makeItem("Quit AGB Capture Helper", #selector(quitTapped), "q"))

        menu.autoenablesItems = false
        item.menu = menu
        refreshUI()
    }

    private func makeItem(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }

    private func refreshUI() {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in self?.refreshUI() }
            return
        }

        // Effective display state: an error shows ⚠ unless actively recording;
        // background uploads show ↑ only when otherwise idle.
        var display = state
        if state == .idle {
            if lastError != nil { display = .error }
            else if uploaderBusy { display = .uploading }
        }
        if state == .uploading && !uploaderBusy {
            state = .idle
            return // didSet re-enters refreshUI
        }

        if let button = statusItem?.button {
            let glyph = display.glyph
            button.attributedTitle = NSAttributedString(
                string: glyph.symbol,
                attributes: [
                    .foregroundColor: glyph.color,
                    .font: NSFont.systemFont(ofSize: 14, weight: .bold),
                ]
            )
            button.toolTip = "AGB Capture Helper — \(display.label)"
        }

        stateMenuItem.title = "State: \(display.label)"
        errorMenuItem.title = lastError.map { "Last error: \($0.prefix(80))" } ?? ""
        errorMenuItem.isHidden = (lastError == nil)
        resultMenuItem.title = lastResult.map { String($0.prefix(80)) } ?? ""
        resultMenuItem.isHidden = (lastResult == nil)

        let isCapturing = (state == .recording || state == .paused)
        startMenuItem?.isEnabled = !isCapturing
        stopMenuItem?.isEnabled = isCapturing
        pauseMenuItem?.isEnabled = isCapturing
        pauseMenuItem?.title = (state == .paused) ? "Resume" : "Pause"
        offRecordMenuItem?.isEnabled = isCapturing
    }

    private func presentAlert(title: String, text: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.alertStyle = .warning
        alert.runModal()
    }
}
