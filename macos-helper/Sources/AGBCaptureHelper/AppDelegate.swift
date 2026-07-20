import AppKit
import UserNotifications
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
            case .idle: return ("○", .labelColor)
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
    /// Prominent "● Recording mm:ss — Stop" item, visible only while capturing.
    private let liveStopMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private var liveTranscriptMenuItem: NSMenuItem?

    /// FEATURE 2: live-transcript floating window + Deepgram stream.
    private let liveWindow = LiveTranscriptWindow()
    private var liveStreamer: LiveTranscribing?

    /// Always-visible floating Start/Stop control — works regardless of the
    /// menu-bar icon hiding behind the notch or a swallowed global hotkey.
    private let controlWindow = ControlWindow()

    /// Town Hall lives INSIDE the control panel (controlWindow.pane). This is its
    /// native-banner notifier + background poller.
    private let townHallNotifier = TownHallNotifier()
    private var townHallPoller: TownHallPoller?

    /// Wall-clock recording start, for the live menu timer + elapsed display.
    private var recordingStartedAt: Date?
    /// Ticks the live "Recording mm:ss — Stop" label once a second.
    private var liveTimer: Timer?

    private var store: SpoolStore?
    private var worker: UploadQueueWorker?
    private var workerTask: Task<Void, Never>?
    private var engine: AudioEngine?
    private var activeSpooler: ChunkSpooler?
    private let detector = MicActivityDetector()
    private let prompt = PromptController()
    private var hotKey: GlobalHotKey?
    private var detectedSourceApp: String?
    /// Far-side person name for this recording (never source app). Feeds live
    /// captions + spool contactName → CRM finalize (FR-CALL-ATT-3).
    private var activeParticipantName: String?
    /// Active session kind (call vs in-person meeting).
    private var activeCaptureKind: CaptureKind = .call
    private var labelParticipantMenuItem: NSMenuItem?
    private var startMeetingMenuItem: NSMenuItem?
    private var startSpeakerMenuItem: NSMenuItem?

    private let log = HelperLog.shared

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        log.info("AGB AI \(AudioConstants.helperVersion) launching", category: "app")
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

        // Always-on-screen Start/Stop control (notch-proof, hotkey-independent).
        controlWindow.onToggle = { [weak self] in self?.hotKeyToggled() }
        controlWindow.onStartKind = { [weak self] kind in self?.startKindFromPanel(kind) }
        controlWindow.onConfigure = { [weak self] in self?.configureTapped() }
        controlWindow.onToggleTranscript = { [weak self] in self?.liveWindow.toggle() }
        controlWindow.onOpenTownHall = { [weak self] in self?.townHallOpened() }
        configureTownHall()
        controlWindow.show()

        // R1: if already configured, start CRM sync immediately (badges without opening Town Hall).
        if HelperConfig.effective().isComplete {
            ensureTownHallPolling()
        }

        detector.arm()
        refreshUI()
    }

    /// Now that the app shows in the Dock (not LSUIElement), clicking its Dock
    /// icon — or reopening it from Finder while it's already running — surfaces
    /// the floating control so there's always a visible response.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        controlWindow.show()
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Best-effort: a quit mid-recording ends the session cleanly so the
        // worker (next launch) finalizes it rather than salvaging a "crash".
        if state == .recording || state == .paused {
            finishRecording(autoDetected: false)
        }
        worker?.stop()
        townHallPoller?.stop()
    }

    // MARK: - Town Hall

    /// Wire the embedded Town Hall pane to the API + poller. Called once at
    /// launch. The poller starts the first time Town Hall is expanded (so the
    /// helper never hits the API before it's configured) and then runs for the
    /// app's lifetime, so native banners arrive even when the panel is collapsed.
    private func configureTownHall() {
        let pane = controlWindow.pane
        pane.clientProvider = { CaptureAPIClient(config: HelperConfig.effective()) }
        pane.onMutation = { [weak self] in self?.townHallPoller?.pokeNow() }
        pane.onError = { [weak self] msg in self?.presentAlert(title: "Town Hall", text: msg) }

        let poller = TownHallPoller(clientProvider: { CaptureAPIClient(config: HelperConfig.effective()) })
        poller.onNewNotifications = { [weak self] new in self?.townHallNotifier.post(new) }
        poller.onNotifications = { [weak self] unread, items in
            self?.controlWindow.pane.applyNotifications(unread: unread, items: items)
        }
        poller.onPosts = { [weak self] posts in self?.controlWindow.pane.applyPosts(posts) }
        poller.onActionItems = { [weak self] items in
            self?.controlWindow.pane.applyActionItems(items)
        }
        poller.onTickStarted = { [weak self] in
            self?.controlWindow.pane.noteSyncStarted()
        }
        pane.onUnreadChange = { [weak self] unread in
            self?.controlWindow.setTownHallBadge(unread)
        }
        townHallPoller = poller

        // After a call files: open Action Items + CRM extract (Haiku, confirm-first).
        controlWindow.onAddActions = { [weak self] in
            guard let self else { return }
            self.controlWindow.setExpanded(true, animated: true)
            self.controlWindow.pane.showActionItems()
            if let url = HelperConfig.effective().crmWebURL(path: "/town-hall?extract=1") {
                NSWorkspace.shared.open(url)
            }
        }
    }

    /// Start Town Hall polling once CRM is configured (badges + sync without opening pane).
    private func ensureTownHallPolling() {
        guard HelperConfig.effective().isComplete else { return }
        townHallNotifier.requestAuthorizationOnce()
        controlWindow.pane.noteSyncStarted()
        townHallPoller?.start()
    }

    /// Fired the first time the panel expands into Town Hall.
    private func townHallOpened() {
        ensureTownHallPolling()
    }

    /// Menu item / hotkey: expand the control panel into Town Hall.
    @objc private func openTownHall() {
        controlWindow.setExpanded(true, animated: true)
    }

    // MARK: - Worker

    private func startWorker(store: SpoolStore) {
        // clientProvider runs on the worker's task: read config fresh each
        // pass (picks up Configure… saves) but never mutate UI state here.
        let worker = UploadQueueWorker(store: store, clientProvider: {
            CaptureAPIClient(config: HelperConfig.effective())
        })
        // Transcript-only mode: keep a local copy of the call before its spool is
        // cleared. Config is read fresh so toggling Configure… takes effect live.
        worker.archiveLocally = { spooler, finalize in
            guard HelperConfig.effective().keepAudioLocal else { return }
            do {
                let url = try LocalAudioArchive.save(spooler: spooler, title: finalize.title)
                HelperLog.shared.info("kept local audio copy: \(url.lastPathComponent)", category: "upload")
            } catch {
                HelperLog.shared.warn("local audio copy failed: \(error.localizedDescription)", category: "upload")
            }
        }
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
                case .stalled(let reason):
                    // Surfaced ⚠: a call has been unable to file for a while.
                    // It's still saved locally and still retrying.
                    self.uploaderBusy = true
                    self.state = .error
                    self.lastError = "Call stuck filing (saved locally, still retrying): \(reason)"
                }
                self.refreshUI()
            }
        }
        worker.onStalled = { [weak self] reason in
            DispatchQueue.main.async { self?.notifyUploadStalled(reason: reason) }
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

                // Visible confirmation in the floating panel that the call's
                // transcript + brief landed in the CRM (not just the menu).
                let filedTitle = outcome.finalize.title ?? "Call"
                let shortTitle = filedTitle.count > 26
                    ? String(filedTitle.prefix(25)) + "…"
                    : filedTitle
                let n = outcome.finalize.actionItemCount ?? 0
                let detail = n > 0
                    ? "\(shortTitle) · \(n) action item\(n == 1 ? "" : "s")"
                    : "\(shortTitle) · transcript + brief"
                let warn = !(outcome.finalize.suspectFlags?.isEmpty ?? true)
                // Deep-link the confirmation to this call's transcript in the CRM.
                let base = HelperConfig.effective().crmBaseUrl
                var crmURL: URL? = nil
                if let rid = outcome.finalize.recordingId, !rid.isEmpty,
                   !base.isEmpty, let b = URL(string: base) {
                    crmURL = b.appendingPathComponent("meetings/recordings/\(rid)")
                }
                // R4: offer “Add actions” after filing (open Action Items + CRM extract).
                self.controlWindow.flashFiled(
                    title: filedTitle,
                    detail: detail,
                    warning: warn,
                    url: crmURL,
                    offerAddActions: true
                )
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
            guard let self else { return }
            switch self.state {
            case .recording, .paused:
                self.log.info("auto-finalizing: call end detected", category: "app")
                self.finishRecording(autoDetected: true)
            case .detected:
                // The call ended while the prompt was still up — the founder
                // never answered it, so it goes away by itself.
                self.prompt.dismissPanel()
                self.declineRecording(reason: .callEnded)
            default:
                break
            }
        }
        prompt.onRecord = { [weak self] name in
            guard let self else { return }
            self.activeParticipantName = LiveTranscriptStreamer.normalizeParticipantName(name)
            self.affirmRecording()
        }
        prompt.onDecline = { [weak self] reason in
            self?.declineRecording(reason: reason)
        }
        controlWindow.onLabelParticipant = { [weak self] in
            self?.labelParticipantTapped()
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
            if let problem = await PermissionsManager.ensureCapturePermissions(kind: .call) {
                self.captureUnavailable(problem)
                return
            }
            let engine = AudioEngine()
            self.configureEngineCallbacks(engine)
            self.engine = engine
            do {
                self.activeCaptureKind = .call
                try await engine.startPreroll(kind: .call)
                // The prompt persists while the call is live (pre-roll keeps
                // rolling in RAM); only an absolute safety cap bounds it.
                let cap = PromptPolicy.safetyCapSeconds(
                    maxRecordingSeconds: HelperConfig.effective().maxRecordingSeconds,
                    callEndWatchAvailable: MicActivityDetector.callEndWatchAvailable
                )
                self.prompt.show(sourceApp: self.detectedSourceApp,
                                 capSeconds: cap,
                                 bufferedSeconds: { [weak engine] in engine?.preRollSeconds ?? 0 })
                // Auto-dismiss the prompt if the call ends unanswered. Detection
                // only fires because an app took the mic, so a peer is a fact here.
                self.detector.watchForCallEnd(peerAlreadyObserved: true)
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
            activeCaptureKind = .call
            let spooler = try store.createSession(startedAt: startedAt,
                                                  sourceApp: detectedSourceApp,
                                                  captureKind: .call)
            // Person name only — never sourceApp (WhatsApp/Zoom are not speakers).
            let name = activeParticipantName
            try spooler.setContactName(name)
            activeSpooler = spooler
            engine.promoteToRecording(spooler: spooler)
            state = .recording
            // Affirmed from detection: a peer app is holding the mic by definition.
            detector.watchForCallEnd(peerAlreadyObserved: true)
            beginRecordingSession(engine: engine, participant: name, kind: .call)
            worker?.kick() // chunks upload incrementally during the call
            log.info("recording affirmed (source: \(detectedSourceApp ?? "unknown"), participant: \(name ?? "unlabeled"))", category: "app")
        } catch {
            captureUnavailable("Could not create local spool: \(error.localizedDescription)")
        }
    }

    private func declineRecording(reason: PromptPolicy.DeclineReason) {
        guard state == .detected else { return }
        engine?.abortAndClear()
        engine = nil
        detectedSourceApp = nil
        activeParticipantName = nil
        activeCaptureKind = .call
        state = .idle
        let what: String
        switch reason {
        case .userDismissed: what = "prompt declined"
        case .callEnded: what = "call ended before Record was pressed"
        case .safetyCap: what = "prompt hit the safety cap"
        }
        log.info("\(what) — zero bytes persisted", category: "app")
        // A dismissed (or capped) prompt must not come back for the same
        // ongoing call — wait for the mic to be released before re-arming.
        switch PromptPolicy.rearm(after: reason) {
        case .immediately:
            detector.arm()
        case .afterMicReleased:
            detector.armAfterMicReleased()
        }
    }

    private func captureUnavailable(_ message: String) {
        engine?.abortAndClear()
        engine = nil
        prompt.dismissPanel()
        state = .error
        lastError = message
        // The failed call's mic is likely still live — re-arming immediately
        // would re-detect it in seconds and loop the error alert.
        detector.armAfterMicReleased()
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

    /// Common engine callback wiring: error surfacing, auto-end watchdog
    /// (FEATURE 1), and the best-effort live-transcript PCM tap (FEATURE 2).
    private func configureEngineCallbacks(_ engine: AudioEngine) {
        engine.onError = { [weak self] message in
            DispatchQueue.main.async { self?.handleEngineError(message) }
        }
        engine.onAutoEnd = { [weak self] reason in
            DispatchQueue.main.async { self?.handleAutoEnd(reason) }
        }
        engine.onRecordingPCM = { [weak self] pcm in
            // Best-effort, non-blocking: just enqueue onto the streamer (which
            // itself hops to its own serial queue and returns immediately).
            self?.liveStreamer?.send(pcm: pcm)
        }
    }

    /// FEATURE 1: an auto-end watchdog (silence timeout or hard duration cap)
    /// fired. Finalize as a *normal* end and tell the user it filed itself.
    private func handleAutoEnd(_ reason: CallEndMonitor.Reason) {
        guard state == .recording || state == .paused else { return }
        let note: String
        switch reason {
        case .silence(let seconds):
            note = "auto-ended after \(Int(seconds))s of two-channel silence"
            log.info("auto-finalizing: \(note)", category: "app")
        case .maxDuration(let seconds):
            note = "auto-ended at the \(Int(seconds / 60))-minute max-duration cap"
            log.warn("auto-finalizing: \(note)", category: "app")
        }
        finishRecording(autoDetected: true)
        notifyAutoEnded(reason: reason)
    }

    // MARK: - Recording session side-effects (auto-end + live transcript)

    /// Start the auto-end watchdog (FEATURE 1), the live-transcript stream +
    /// window (FEATURE 2), and the menu's elapsed-time ticker. All best-effort:
    /// the live path failing leaves capture completely intact.
    private func beginRecordingSession(engine: AudioEngine,
                                       participant: String?,
                                       kind: CaptureKind) {
        let cfg = HelperConfig.effective()
        config = cfg
        activeCaptureKind = kind

        recordingStartedAt = Date()

        // FEATURE 1: install the silence + max-duration watchdog.
        // Meeting mode: R is silent by design; signal on L (room mic) resets timer.
        let monitor = CallEndMonitor(silenceWindow: cfg.silenceAutoEndSeconds,
                                     maxDuration: cfg.maxRecordingSeconds)
        engine.installCallEndMonitor(monitor)
        log.info(
            "auto-end armed (kind=\(kind.rawValue), silence \(Int(cfg.silenceAutoEndSeconds))s, max \(Int(cfg.maxRecordingSeconds))s)",
            category: "app"
        )

        // FEATURE 2: best-effort live transcript.
        if cfg.liveTranscript {
            liveWindow.reset()
            if cfg.liveTranscriptAutoShow { liveWindow.show() }
            // On-device (Apple) by default — private, free, no token; cloud as a
            // fallback. Both emit the same Line type, so the window is agnostic.
            let engine: LiveTranscribing = cfg.liveTranscriptOnDevice
                ? OnDeviceTranscriber(participantName: participant, captureKind: kind)
                : LiveTranscriptStreamer(config: cfg, participantName: participant, captureKind: kind)
            engine.onStatus = { [weak self] status in self?.handleLiveStatus(status) }
            engine.onLine = { [weak self] line in self?.liveWindow.append(line: line) }
            liveStreamer = engine
            engine.start()
        }

        startLiveTimer()
        refreshUI()
    }

    /// Tear down the live-transcript stream + ticker (window stays where it is;
    /// the user can keep reading the final transcript). Capture-independent.
    private func endRecordingSession() {
        liveStreamer?.stop()
        liveStreamer = nil
        recordingStartedAt = nil
        stopLiveTimer()
        if liveWindow.isVisible {
            liveWindow.setStatus("■ Recording ended — filing the call…")
        }
    }

    private func handleLiveStatus(_ status: LiveTranscriptStreamer.Status) {
        guard recordingStartedAt != nil else { return }
        switch status {
        case .connecting:
            liveWindow.setStatus("● Recording — connecting live transcript…")
        case .live:
            liveWindow.setStatus(liveStatusLine())
        case .unavailable(let message):
            liveWindow.setUnavailable(message)
        case .idle:
            break
        }
    }

    private func startLiveTimer() {
        stopLiveTimer()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            self?.tickLive()
        }
        RunLoop.main.add(timer, forMode: .common)
        liveTimer = timer
        tickLive()
    }

    private func stopLiveTimer() {
        liveTimer?.invalidate()
        liveTimer = nil
    }

    private func tickLive() {
        guard recordingStartedAt != nil else { return }
        // Refresh the menu's "Recording mm:ss — Stop" label.
        liveStopMenuItem.title = liveStopTitle()
        // Keep the floating control's elapsed time current while recording.
        controlWindow.update(.capturing(elapsed: elapsedString(),
                                        participant: activeParticipantName,
                                        kind: activeCaptureKind))
        // Keep the window banner's timer current when the stream is live.
        if case .live = (liveStreamer?.status ?? .idle), liveWindow.isVisible {
            liveWindow.setStatus(liveStatusLine())
        }
    }

    private func elapsedString() -> String {
        guard let start = recordingStartedAt else { return "00:00" }
        let total = Int(Date().timeIntervalSince(start))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s)
                     : String(format: "%02d:%02d", m, s)
    }

    private func liveStopTitle() -> String {
        let verb = (state == .paused) ? "Paused" : "Recording"
        return "● \(verb) \(elapsedString()) — Stop"
    }

    private func liveStatusLine() -> String {
        "● Recording \(elapsedString()) — live"
    }

    // MARK: - Notifications (auto-end)

    /// Best-effort macOS notification when a recording auto-ends, so the user
    /// knows it filed itself (silence timeout or the max-duration cap).
    private func notifyAutoEnded(reason: CallEndMonitor.Reason) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { [weak center] granted, _ in
            guard granted, let center else { return }
            let content = UNMutableNotificationContent()
            content.title = "AGB AI — recording filed"
            switch reason {
            case .silence(let seconds):
                content.body = "Auto-ended after \(Int(seconds))s of silence (call appears to have ended). Filing now."
            case .maxDuration(let seconds):
                content.body = "Hit the \(Int(seconds / 60))-minute safety cap and auto-ended. Filing now."
            }
            content.sound = .default
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            center.add(request, withCompletionHandler: nil)
        }
    }

    private func notifyUploadStalled(reason: String) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { [weak center] granted, _ in
            guard granted, let center else { return }
            let content = UNMutableNotificationContent()
            content.title = "AGB AI — a call is stuck filing"
            content.body = "A recorded call hasn't filed yet (\(reason)). It's saved locally and will keep retrying — check the helper if this persists."
            content.sound = .default
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            center.add(request, withCompletionHandler: nil)
        }
    }

    @objc private func toggleLiveTranscriptTapped() {
        liveWindow.toggle()
        refreshUI()
    }

    // MARK: - Menu actions

    @objc private func startRecordingManually() {
        switch state {
        case .detected:
            prompt.dismissPanel()
            affirmRecording()
        case .idle, .uploading, .error:
            manualStart(kind: .call)
        default:
            break
        }
    }

    /// In-person room recording (mic only — no system-audio / call-app path).
    @objc private func startMeetingRecordingTapped() {
        switch state {
        case .idle, .uploading, .error:
            manualStart(kind: .meeting)
        default:
            break
        }
    }

    /// Capture kind chosen from the control panel's idle start menu.
    private func startKindFromPanel(_ kind: CaptureKind) {
        switch state {
        case .detected:
            // A call was already detected; honor the existing affirm path.
            prompt.dismissPanel()
            affirmRecording()
        case .idle, .uploading, .error:
            manualStart(kind: kind)
        default:
            break
        }
    }

    /// External device on speakerphone (phone, handset, another laptop): mic
    /// only, with input gain, since the far side arrives acoustically.
    @objc private func startSpeakerRecordingTapped() {
        switch state {
        case .idle, .uploading, .error:
            manualStart(kind: .speaker)
        default:
            break
        }
    }

    /// FR-CALL-TRG-4: manual start, independent of detection.
    /// - Parameter kind: `.call` = mic+system; `.meeting` = in-person room (mic only).
    private func manualStart(kind: CaptureKind) {
        guard engine == nil, let store else {
            if store == nil { presentAlert(title: "Cannot record", text: lastError ?? "Spool unavailable") }
            return
        }
        detector.disarm()
        Task { @MainActor in
            if let problem = await PermissionsManager.ensureCapturePermissions(kind: kind) {
                self.captureUnavailable(problem)
                return
            }
            let engine = AudioEngine()
            self.configureEngineCallbacks(engine)
            self.engine = engine
            do {
                try await engine.startPreroll(kind: kind)
                // Manual/hotkey start begins unlabeled so it never blocks on a modal.
                self.activeParticipantName = nil
                self.activeCaptureKind = kind
                let spooler = try store.createSession(
                    startedAt: Date(),
                    sourceApp: kind.defaultSourceApp(detected: nil),
                    captureKind: kind
                )
                try spooler.setContactName(nil)
                self.activeSpooler = spooler
                engine.promoteToRecording(spooler: spooler)
                self.state = .recording
                // Manual start carries no evidence that the call is on this Mac,
                // so the watch stays inert until a peer app actually takes the
                // mic. Without this, a speakerphone session auto-finalized ~5 s in.
                if kind.peerMicUsageIsMeaningful {
                    self.detector.watchForCallEnd(peerAlreadyObserved: false, graceSeconds: 15)
                }
                self.beginRecordingSession(engine: engine, participant: nil, kind: kind)
                self.worker?.kick()
                self.log.info(
                    "manual \(kind.rawValue) recording started (participant: unlabeled)",
                    category: "app"
                )
            } catch {
                self.captureUnavailable("Could not start capture: \(error.localizedDescription)")
            }
        }
    }

    @objc private func stopRecordingTapped() {
        finishRecording(autoDetected: false)
    }

    /// Mid-call (or pre-record) rename: updates live labels + spool for finalize.
    @objc private func labelParticipantTapped() {
        guard state == .recording || state == .paused || state == .detected else { return }
        let name = promptForParticipantName(default: activeParticipantName)
        applyParticipantName(name)
    }

    /// Modal text field for person name. Cancel keeps current. Empty clears label.
    private func promptForParticipantName(default current: String?) -> String? {
        let alert = NSAlert()
        if activeCaptureKind.isMeeting {
            alert.messageText = "Who's in the room?"
            alert.informativeText = "Name the primary contact or group so CRM notes attach correctly (e.g. “Carlos” or “Ucaima team”). Leave blank for “Room”."
        } else {
            alert.messageText = "Who's on the call?"
            alert.informativeText = "Name the other person so the transcript and CRM notes use their name (not “Participant”). Leave blank to keep unlabeled."
        }
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = current ?? ""
        field.placeholderString = activeCaptureKind.isMeeting ? "e.g. Carlos, team standup" : "e.g. Carlos"
        alert.accessoryView = field
        // Make the field first responder after the alert lays out.
        DispatchQueue.main.async { field.window?.makeFirstResponder(field) }
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return current }
        return LiveTranscriptStreamer.normalizeParticipantName(field.stringValue)
    }

    private func applyParticipantName(_ name: String?) {
        let normalized = LiveTranscriptStreamer.normalizeParticipantName(name)
        activeParticipantName = normalized
        if let spooler = activeSpooler {
            do {
                try spooler.setContactName(normalized)
            } catch {
                log.warn("setContactName failed: \(error.localizedDescription)", category: "app")
            }
        }
        liveStreamer?.setParticipantName(normalized)
        log.info("participant labeled: \(normalized ?? "(cleared)")", category: "app")
        refreshUI()
    }

    private func finishRecording(autoDetected: Bool) {
        guard state == .recording || state == .paused, let engine else { return }
        detector.disarm()
        endRecordingSession()

        let report = engine.stopAndFlush()
        self.engine = nil

        if let spooler = activeSpooler {
            do {
                // Re-assert name at end so a late edit always rides finalize.
                try spooler.setContactName(activeParticipantName)
                try spooler.markEnded(endedAt: Date(), partial: false)
            } catch {
                lastError = "Could not mark session ended: \(error.localizedDescription)"
            }
            if report.anyChannelNearSilent && report.frames > 0 {
                // FR-CALL-OPS-4 (informational here; server flags at filing).
                log.warn("near-silent channel: \(report.summary)", category: "app")
                lastResult = "Suspect audio: \(report.summary)"
            }
            log.info("recording ended (\(Int(spooler.spooledSeconds))s, auto=\(autoDetected), participant: \(activeParticipantName ?? "unlabeled")) — \(report.summary)", category: "app")
        }
        activeSpooler = nil
        detectedSourceApp = nil
        activeParticipantName = nil
        activeCaptureKind = .call
        state = .uploading
        worker?.kick()
        // Wait for the mic to be released before re-arming: a manual stop
        // mid-call (or WhatsApp holding the mic open after hangup) must not
        // re-detect the same call and prompt again seconds later. When the
        // mic is already quiet this arms within ~2 s anyway.
        detector.armAfterMicReleased()
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
                // R1: start live sync as soon as credentials are valid.
                if updated.isComplete { ensureTownHallPolling() }
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
        AGB AI diagnostics — \(ISO8601.string(from: Date()))
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
            manualStart(kind: .call)
        }
    }

    // MARK: - Status item / menu

    /// The AGB monogram (from public/logos/crm.svg, viewBox 200×200) drawn as a
    /// template image: three angular strokes. Template = the menu bar tints it
    /// for light/dark automatically, and we override the tint per state via the
    /// button's contentTintColor. Filled (not stroked) so it stays legible at
    /// menu-bar size where the brand's thin outline would disappear.
    private static func agbLogoImage(size: CGFloat = 18) -> NSImage {
        let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { _ in
            let scale = (size - 2) / 200.0
            // SVG is y-down; AppKit is y-up — map each point and flip vertically.
            func p(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
                NSPoint(x: 1 + x * scale, y: size - (1 + y * scale))
            }
            let path = NSBezierPath()
            // Left wedge.
            path.move(to: p(62, 44)); path.line(to: p(84, 44))
            path.line(to: p(44, 166)); path.line(to: p(8, 166)); path.close()
            // Center bar.
            path.move(to: p(89, 44)); path.line(to: p(111, 44))
            path.line(to: p(111, 166)); path.line(to: p(89, 166)); path.close()
            // Right wedge.
            path.move(to: p(116, 44)); path.line(to: p(138, 44))
            path.line(to: p(192, 166)); path.line(to: p(156, 166)); path.close()
            NSColor.black.setFill()
            path.fill()
            return true
        }
        image.isTemplate = true
        return image
    }

    private func buildStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem = item
        item.button?.image = Self.agbLogoImage()
        item.button?.imagePosition = .imageOnly

        stateMenuItem.isEnabled = false
        errorMenuItem.isEnabled = false
        resultMenuItem.isEnabled = false

        menu.addItem(stateMenuItem)
        menu.addItem(errorMenuItem)
        menu.addItem(resultMenuItem)

        // Prominent live "● Recording mm:ss — Stop" item, shown only while
        // capturing. Bold so it's unmistakable and always one click from Stop.
        liveStopMenuItem.target = self
        liveStopMenuItem.action = #selector(stopRecordingTapped)
        liveStopMenuItem.attributedTitle = NSAttributedString(
            string: "● Recording — Stop",
            attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                         .foregroundColor: NSColor.systemRed]
        )
        liveStopMenuItem.isHidden = true
        menu.addItem(liveStopMenuItem)

        menu.addItem(.separator())

        let start = makeItem("Start Call Recording", #selector(startRecordingManually), "r")
        startMenuItem = start
        menu.addItem(start)

        let meet = makeItem("Start Meeting Recording…", #selector(startMeetingRecordingTapped), "m")
        startMeetingMenuItem = meet
        menu.addItem(meet)

        let speaker = makeItem("Start Speakerphone Recording…", #selector(startSpeakerRecordingTapped), "k")
        startSpeakerMenuItem = speaker
        menu.addItem(speaker)

        let stop = makeItem("Stop Recording", #selector(stopRecordingTapped), "s")
        stopMenuItem = stop
        menu.addItem(stop)

        let pause = makeItem("Pause", #selector(pauseResumeTapped), "p")
        pauseMenuItem = pause
        menu.addItem(pause)

        let offRecord = makeItem("Off the record: discard last 5 min", #selector(offTheRecordTapped), "")
        offRecordMenuItem = offRecord
        menu.addItem(offRecord)

        let labelP = makeItem("Label participant…", #selector(labelParticipantTapped), "l")
        labelParticipantMenuItem = labelP
        menu.addItem(labelP)

        menu.addItem(.separator())
        let townHallItem = makeItem("Town Hall", #selector(openTownHall), "h")
        townHallItem.keyEquivalentModifierMask = [.command, .shift]
        menu.addItem(townHallItem)
        let liveItem = makeItem("Show live transcript", #selector(toggleLiveTranscriptTapped), "t")
        liveTranscriptMenuItem = liveItem
        menu.addItem(liveItem)
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
            // AGB monogram, tinted by state: adaptive (full-contrast) when idle,
            // red while recording, etc. — so it's always visible in the menu bar.
            button.contentTintColor = display.glyph.color
            button.toolTip = "AGB Capture Helper — \(display.label)"
        }

        stateMenuItem.title = "State: \(display.label)"
        errorMenuItem.title = lastError.map { "Last error: \($0.prefix(80))" } ?? ""
        errorMenuItem.isHidden = (lastError == nil)
        resultMenuItem.title = lastResult.map { String($0.prefix(80)) } ?? ""
        resultMenuItem.isHidden = (lastResult == nil)

        let isCapturing = (state == .recording || state == .paused)
        startMenuItem?.isEnabled = !isCapturing
        startMeetingMenuItem?.isEnabled = !isCapturing && state != .detected
        startSpeakerMenuItem?.isEnabled = !isCapturing && state != .detected
        stopMenuItem?.isEnabled = isCapturing
        pauseMenuItem?.isEnabled = isCapturing
        pauseMenuItem?.title = (state == .paused) ? "Resume" : "Pause"
        offRecordMenuItem?.isEnabled = isCapturing
        labelParticipantMenuItem?.isEnabled = isCapturing || state == .detected
        if let name = activeParticipantName, isCapturing || state == .detected {
            labelParticipantMenuItem?.title = activeCaptureKind.isMeeting
                ? "Label room… (\(name))"
                : "Label participant… (\(name))"
        } else {
            labelParticipantMenuItem?.title = activeCaptureKind.isMeeting
                ? "Label room…"
                : "Label participant…"
        }

        // Prominent live Stop item: visible + bold only while capturing.
        liveStopMenuItem.isHidden = !isCapturing
        liveStopMenuItem.isEnabled = isCapturing
        if isCapturing {
            liveStopMenuItem.attributedTitle = NSAttributedString(
                string: liveStopTitle(),
                attributes: [.font: NSFont.systemFont(ofSize: 13, weight: .semibold),
                             .foregroundColor: NSColor.systemRed]
            )
        }
        liveTranscriptMenuItem?.title = liveWindow.isVisible ? "Hide live transcript" : "Show live transcript"

        // Mirror state onto the always-visible floating control: its big
        // button is Start when idle, "Record This Call" while the prompt is
        // up (a second, unmissable affirm path), Stop while capturing.
        let controlMode: ControlWindow.Mode
        if isCapturing {
            controlMode = .capturing(elapsed: elapsedString(),
                                     participant: activeParticipantName,
                                     kind: activeCaptureKind)
        } else if state == .detected {
            controlMode = .detected
        } else {
            controlMode = .idle(label: display.label)
        }
        controlWindow.update(controlMode)
    }

    private func presentAlert(title: String, text: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.alertStyle = .warning
        alert.runModal()
    }
}
