import Foundation
import CaptureCore

/// Headless E2E driver (`--simulate`): pushes a pre-recorded 16 kHz stereo
/// PCM16 WAV through the exact production path — ChunkSpooler →
/// UploadQueueWorker → createSession → chunk PUTs → finalize — against the
/// configured CRM, then prints the finalize JSON to stdout.
///
///   AGBCaptureHelper --simulate /path/to/stereo16k.wav
///       [--chunk-secs 30] [--source-app SimApp] [--no-detect]
///       [--simulate-crash-after N]   upload N chunks then exit 2, no finalize
///       [--abandon]                  upload 2 chunks then DELETE the session
///       [--note "SECS:text"]…        Call Desk note at SECS (repeatable;
///                                    #tags parse into themeKey like the UI)
///       [--term "wrong=right"]…      term correction; "right" alone = hint
///       [--agenda "Item;Item;…"]     pre-call agenda (semicolon-separated)
///       [--cover "key=done"]…        agenda coverage mark (repeatable)
///       [--kind call|meeting|speaker] session kind (speaker/meeting → local diarize)
///       [--precomputed <path.json>]  inject a pre-diarized transcript as the
///                                    finalize precomputedTranscript
///                                    --note also accepts "SECS@ANCHOR:text"
///                                    to pin a Line-Grab anchor at ANCHOR secs
///
/// Config: config.json, overridden by env AGB_CRM_URL / AGB_CRM_TOKEN.
/// Exit codes: 0 success, 1 failure, 2 simulated crash.
enum SimulatedEngine {

    struct Options {
        var wavPath: String
        var chunkSecs: Int = AudioConstants.chunkSeconds
        var sourceApp: String?
        var crashAfter: Int?
        var abandon = false
        var precomputedPath: String?
        var kind: CaptureKind = .call
        var roster: [String] = []
        /// Call Desk notes to inject: (tSecs, text). E2E for the notes spine.
        var notes: [(Double, String)] = []
        /// Term corrections to inject: (wrong?, right).
        var terms: [(String?, String)] = []
        /// Agenda labels to inject (semicolon-separated on the CLI).
        var agenda: [String] = []
        /// Coverage marks: (key, state).
        var covers: [(String, String)] = []
        /// Note index → Line-Grab anchor tSecs.
        var anchors: [Int: Double] = [:]
    }

    static func run(arguments: [String]) -> Int32 {
        let semaphore = DispatchSemaphore(value: 0)
        let box = ExitCodeBox()
        Task.detached {
            box.code = await runAsync(arguments: arguments)
            semaphore.signal()
        }
        semaphore.wait()
        return box.code
    }

    private final class ExitCodeBox: @unchecked Sendable {
        var code: Int32 = 1
    }

    // MARK: - Argument parsing

    static func parse(arguments: [String]) -> Options? {
        guard let simIndex = arguments.firstIndex(of: "--simulate"),
              simIndex + 1 < arguments.count else {
            fail("usage: AGBCaptureHelper --simulate <stereo16k.wav> [--chunk-secs N] [--source-app Name] [--no-detect] [--simulate-crash-after N] [--abandon]")
            return nil
        }
        var options = Options(wavPath: arguments[simIndex + 1])
        if options.wavPath.hasPrefix("--") {
            fail("--simulate requires a WAV path argument")
            return nil
        }

        func value(after flag: String) -> String? {
            guard let i = arguments.firstIndex(of: flag), i + 1 < arguments.count else { return nil }
            return arguments[i + 1]
        }

        if let raw = value(after: "--chunk-secs") {
            guard let secs = Int(raw), secs >= 1 else {
                fail("--chunk-secs must be a positive integer")
                return nil
            }
            options.chunkSecs = secs
        }
        options.sourceApp = value(after: "--source-app")
        if let raw = value(after: "--simulate-crash-after") {
            guard let n = Int(raw), n >= 0 else {
                fail("--simulate-crash-after must be a non-negative integer")
                return nil
            }
            options.crashAfter = n
        }
        options.abandon = arguments.contains("--abandon")
        options.precomputedPath = value(after: "--precomputed")
        if let k = value(after: "--kind"), let ck = CaptureKind(rawValue: k) { options.kind = ck }
        if let r = value(after: "--roster") {
            options.roster = r.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }

        // Repeatable flags: every occurrence's following value.
        func values(after flag: String) -> [String] {
            arguments.enumerated().compactMap { i, a in
                a == flag && i + 1 < arguments.count ? arguments[i + 1] : nil
            }
        }
        for raw in values(after: "--note") {
            // "SECS:text" or "SECS@ANCHORSECS:text" — first colon splits.
            guard let colon = raw.firstIndex(of: ":") else {
                fail("--note expects \"SECS[@ANCHOR]:text\", got \(raw)")
                return nil
            }
            let head = String(raw[..<colon])
            let text = String(raw[raw.index(after: colon)...])
            if let at = head.firstIndex(of: "@"),
               let secs = Double(head[..<at]), let anchor = Double(head[head.index(after: at)...]) {
                options.notes.append((secs, text))
                options.anchors[options.notes.count - 1] = anchor
            } else if let secs = Double(head) {
                options.notes.append((secs, text))
            } else {
                fail("--note expects \"SECS[@ANCHOR]:text\", got \(raw)")
                return nil
            }
        }
        for raw in values(after: "--cover") {
            if let eq = raw.firstIndex(of: "=") {
                options.covers.append((String(raw[..<eq]), String(raw[raw.index(after: eq)...])))
            }
        }
        for raw in values(after: "--term") {
            // "wrong=right" or just "right" (keyterm hint only).
            if let eq = raw.firstIndex(of: "=") {
                options.terms.append((String(raw[..<eq]), String(raw[raw.index(after: eq)...])))
            } else {
                options.terms.append((nil, raw))
            }
        }
        if let raw = value(after: "--agenda") {
            options.agenda = raw.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        // --no-detect is accepted for parity with real mode; simulate never detects.
        return options
    }

    // MARK: - Main flow

    static func runAsync(arguments: [String]) async -> Int32 {
        guard let options = parse(arguments: arguments) else { return 1 }

        // 1. Config (file + env overrides).
        let config = HelperConfig.effective()
        guard config.isComplete, let client = CaptureAPIClient(config: config) else {
            fail("""
            CRM not configured. Set crmBaseUrl + token in \(HelperPaths.configURL().path)
            or export AGB_CRM_URL and AGB_CRM_TOKEN.
            """)
            return 1
        }
        info("CRM: \(config.crmBaseUrl)")

        // 2. Read + validate the source WAV (must match the wire contract).
        let wavURL = URL(fileURLWithPath: options.wavPath)
        let wavData: Data
        do {
            wavData = try Data(contentsOf: wavURL)
        } catch {
            fail("cannot read \(options.wavPath): \(error.localizedDescription)")
            return 1
        }
        let pcm: Data
        do {
            let parsed = try WavCodec.parse(wavData)
            guard parsed.sampleRate == AudioConstants.sampleRate,
                  parsed.channels == AudioConstants.channels,
                  parsed.bitsPerSample == AudioConstants.bitsPerSample else {
                fail("WAV must be \(AudioConstants.sampleRate) Hz, \(AudioConstants.channels)-channel, PCM16 — got \(parsed.sampleRate) Hz / \(parsed.channels) ch / \(parsed.bitsPerSample)-bit. Convert with: ffmpeg -i in.wav -ar 16000 -ac 2 -c:a pcm_s16le out.wav")
                return 1
            }
            pcm = WavCodec.pcmData(wavData, info: parsed)
            info("input: \(String(format: "%.1f", parsed.durationSeconds))s of audio (\(pcm.count) PCM bytes)")
        } catch {
            fail("invalid WAV: \(error.localizedDescription)")
            return 1
        }
        guard !pcm.isEmpty else {
            fail("WAV contains no PCM data")
            return 1
        }

        // 3. Spool exactly like a live call (1 s slices through ChunkSpooler).
        let store: SpoolStore
        let spooler: ChunkSpooler
        do {
            store = try SpoolStore()
            let duration = Double(pcm.count) / Double(AudioConstants.bytesPerSecond)
            let startedAt = Date().addingTimeInterval(-duration)
            spooler = try store.createSession(startedAt: startedAt,
                                              sourceApp: options.sourceApp,
                                              captureKind: options.kind,
                                              chunkSeconds: options.chunkSecs)
            let meter = SilenceMeter()
            var offset = 0
            let slice = AudioConstants.bytesPerSecond
            while offset < pcm.count {
                let end = min(offset + slice, pcm.count)
                let bytes = pcm.subdata(in: offset..<end)
                try spooler.append(bytes)
                meter.feedInterleaved(bytes)
                offset = end
            }
            try spooler.flush()
            if !options.agenda.isEmpty {
                let items = options.agenda.compactMap { label -> SessionManifest.AgendaItem? in
                    let key = ThemeTags.slugify(label)
                    return key.isEmpty ? nil : SessionManifest.AgendaItem(key: key, label: label)
                }
                try spooler.setAgenda(items)
                info("agenda: \(items.map(\.key).joined(separator: ", "))")
            }
            for (i, noteEntry) in options.notes.enumerated() {
                let (secs, text) = noteEntry
                let parsed = ThemeTags.parse(text)
                let body = parsed.text.isEmpty ? text : parsed.text
                let anchor = options.anchors[i].map {
                    SessionManifest.NoteAnchor(quote: "(sim anchor)", tSecs: $0)
                }
                _ = try spooler.addNote(tSecs: secs, text: body,
                                        themeKey: parsed.tags.first, anchor: anchor)
                info("note @\(secs)s: \(body)\(parsed.tags.first.map { " #\($0)" } ?? "")\(anchor.map { " ↳@\($0.tSecs)" } ?? "")")
            }
            for (key, state) in options.covers {
                _ = try spooler.addCoverageMark(key: key, state: state, tSecs: 0)
                info("cover: \(key) = \(state)")
            }
            if !options.roster.isEmpty {
                try spooler.setRoster(options.roster)
                info("roster: \(options.roster.count) → speakerHint \(spooler.speakerHint)")
            }
            for (wrong, right) in options.terms {
                _ = try spooler.addTermCorrection(wrong: wrong, right: right)
                info("term: \(wrong ?? "(hint)") → \(right)")
            }
            try spooler.markEnded(endedAt: Date(), partial: false)
            let snap = spooler.snapshot
            info("spooled \(snap.seqsWritten.count) chunk(s) → \(spooler.directory.path)")
            info("levels: \(meter.report().summary)")
        } catch {
            fail("spooling failed: \(error.localizedDescription)")
            return 1
        }

        // 4a. Abandon mode: createSession → 2 chunks → DELETE (FR-CALL-TRG-7 path).
        if options.abandon {
            return await runAbandon(client: client, store: store, spooler: spooler)
        }

        // 4b. Normal / crash mode: drive the production upload worker.
        return await runWorker(client: client, store: store, spooler: spooler, options: options)
    }

    // MARK: - Worker-driven upload (normal + crash modes)

    private static func runWorker(client: CaptureAPIClient,
                                  store: SpoolStore,
                                  spooler: ChunkSpooler,
                                  options: Options) async -> Int32 {
        let worker = UploadQueueWorker(store: store, clientProvider: { client })
        if let path = options.precomputedPath {
            worker.precomputedOverride = loadPrecomputed(path)
        }
        let myLocalId = spooler.localId
        let uploadCounter = Counter()

        worker.onChunkUploaded = { localId, seq in
            guard localId == myLocalId else { return }
            let n = uploadCounter.increment()
            info("uploaded chunk seq=\(seq) (\(n) total)")
            if let crashAfter = options.crashAfter, n >= crashAfter {
                info("simulating crash after \(crashAfter) chunk(s) — spool left on disk, no finalize")
                exit(2)
            }
        }

        var finalOutcome: UploadQueueWorker.Outcome?
        worker.onSessionFinalized = { outcome in
            if outcome.localId == myLocalId { finalOutcome = outcome }
        }

        // Edge: --simulate-crash-after 0 — die before any upload.
        if options.crashAfter == 0 {
            info("simulating crash before any upload — spool left on disk")
            return 2
        }

        var backoff = ExponentialBackoff()
        let maxPasses = 5
        var lastErrorMessage = "unknown"
        for pass in 1...maxPasses {
            let result = await worker.processPendingOnce()
            if let outcome = finalOutcome {
                print(String(data: outcome.finalize.raw, encoding: .utf8) ?? "{\"ok\":true}")
                info("finalized: recordingId=\(outcome.finalize.recordingId ?? "?") title=\(outcome.finalize.title ?? "?")")
                return 0
            }
            if let mine = result.errors.first(where: { $0.localId == myLocalId }) {
                lastErrorMessage = mine.message
            } else if let any = result.errors.last {
                lastErrorMessage = any.message
            } else if result.abortedByNetwork {
                lastErrorMessage = "network unreachable"
            }
            if pass < maxPasses {
                let delay = backoff.nextDelay()
                info("pass \(pass) incomplete (\(lastErrorMessage)); retrying in \(Int(delay))s")
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
        fail("did not finalize after \(maxPasses) passes: \(lastErrorMessage). Spool kept at \(spooler.directory.path) — the menu-bar helper (or a re-run) will retry it.")
        return 1
    }

    // MARK: - Abandon mode

    private static func runAbandon(client: CaptureAPIClient,
                                   store: SpoolStore,
                                   spooler: ChunkSpooler) async -> Int32 {
        do {
            let snap = spooler.snapshot
            let sessionId = try await client.createSession(meta: .init(manifest: snap))
            try spooler.setServerSessionId(sessionId)
            info("server session \(sessionId)")

            for seq in snap.seqsWritten.sorted().prefix(2) {
                try await client.uploadChunk(sessionId: sessionId, seq: seq,
                                             fileURL: spooler.chunkURL(seq: seq))
                try spooler.markUploaded(seq: seq)
                info("uploaded chunk seq=\(seq)")
            }

            try await client.abandon(sessionId: sessionId)
            try store.deleteSession(spooler)
            print("{\"ok\":true,\"abandoned\":\"\(sessionId)\"}")
            info("session abandoned; server chunks deleted; local spool removed")
            return 0
        } catch {
            fail("abandon flow failed: \(error.localizedDescription). Local spool kept at \(spooler.directory.path)")
            return 1
        }
    }

    // MARK: - Helpers

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func increment() -> Int {
            lock.lock(); defer { lock.unlock() }
            value += 1
            return value
        }
    }

    private static func loadPrecomputed(_ path: String) -> CaptureAPIClient.FinalizeBody.PrecomputedTranscript? {
        guard let data = FileManager.default.contents(atPath: path) else {
            fail("--precomputed: cannot read \(path)"); return nil
        }
        struct U: Decodable {
            let speaker: String; let diarizationId: String?; let channel: Int?
            let start: Double; let end: Double; let text: String
        }
        struct T: Decodable { let language: String?; let engine: String?; let utterances: [U] }
        guard let t = try? JSONDecoder().decode(T.self, from: data) else {
            fail("--precomputed: invalid JSON in \(path)"); return nil
        }
        let us = t.utterances.map {
            CaptureAPIClient.FinalizeBody.PrecomputedTranscript.Utterance(
                speaker: $0.speaker, diarizationId: $0.diarizationId ?? $0.speaker,
                channel: $0.channel ?? 0, start: $0.start, end: $0.end, text: $0.text)
        }
        info("precomputed: \(us.count) utterances, \(Set(us.map(\.speaker)).count) speakers")
        return CaptureAPIClient.FinalizeBody.PrecomputedTranscript(
            language: t.language, engine: t.engine ?? "sim", utterances: us)
    }

    private static func info(_ message: String) {
        FileHandle.standardError.write(Data("[simulate] \(message)\n".utf8))
    }

    private static func fail(_ message: String) {
        FileHandle.standardError.write(Data("[simulate] ERROR: \(message)\n".utf8))
    }
}
