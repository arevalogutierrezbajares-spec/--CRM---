import Foundation

/// Free local STT + diarization backends (WhisperX / Vibe / whisper.cpp).
/// Meeting finalize prefers these over paid Deepgram when available.
public struct LocalTranscript: Equatable {
    public let language: String?
    public let engine: String
    public let utterances: [LocalUtterance]

    public struct LocalUtterance: Equatable, Codable {
        public let speaker: String
        public let diarizationId: String?
        public let channel: Int
        public let start: Double
        public let end: Double
        public let text: String
    }
}

public enum LocalTranscribeBackendId: String, Codable, CaseIterable {
    case auto
    case whisperx
    case vibe
    case whispercpp
    case off
}

public enum LocalTranscribeRunner {

    public struct Opts {
        public var backend: LocalTranscribeBackendId
        public var explicitCommand: String?
        public var model: String
        public var timeoutSecs: TimeInterval
        public var repoRootHint: URL?

        public init(backend: LocalTranscribeBackendId = .auto,
                    explicitCommand: String? = nil,
                    model: String = "small",
                    timeoutSecs: TimeInterval = 1800,
                    repoRootHint: URL? = nil) {
            self.backend = backend
            self.explicitCommand = explicitCommand
            self.model = model
            self.timeoutSecs = timeoutSecs
            self.repoRootHint = repoRootHint
        }
    }

    public enum RunnerError: Error, LocalizedError {
        case disabled
        case noBackend
        case processFailed(Int32, String)
        case badJSON(String)
        case timeout

        public var errorDescription: String? {
            switch self {
            case .disabled: return "Local transcribe disabled"
            case .noBackend: return "No local STT backend available (install WhisperX — see scripts/local-transcribe/README.md)"
            case .processFailed(let c, let o): return "Local STT exit \(c): \(o.prefix(300))"
            case .badJSON(let m): return "Local STT bad JSON: \(m)"
            case .timeout: return "Local STT timed out"
            }
        }
    }

    /// Probe which backends are available (for Configure UI).
    public static func availableBackends(repoRootHint: URL? = nil) -> [LocalTranscribeBackendId] {
        var out: [LocalTranscribeBackendId] = []
        if resolveWhisperX(repoRootHint: repoRootHint) != nil { out.append(.whisperx) }
        if which("vibe") != nil { out.append(.vibe) }
        if which("whisper-cli") != nil || which("whisper-cpp") != nil || which("main") != nil {
            out.append(.whispercpp)
        }
        return out
    }

    public static func transcribe(wav: URL, opts: Opts) throws -> LocalTranscript {
        if opts.backend == .off { throw RunnerError.disabled }

        let plan = resolvePlan(opts: opts)
        guard let plan else { throw RunnerError.noBackend }

        HelperLog.shared.info(
            "local-stt running \(plan.engine) → \(wav.lastPathComponent)",
            category: "local-stt"
        )

        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("agb-local-stt-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: outURL) }

        var args = plan.args
        // Append output path conventions
        if plan.engine == "whisperx" {
            args.append(contentsOf: [wav.path, "-o", outURL.path, "--model", opts.model])
            if #available(macOS 14.0, *) {
                // Prefer mps when script supports it; script falls back to cpu.
                args.append(contentsOf: ["--device", "mps"])
            }
        } else if plan.engine == "vibe" {
            // Best-effort CLI shape; versions differ — user can set explicit command.
            args.append(contentsOf: ["transcribe", wav.path, "--output", outURL.path])
        } else {
            // whisper.cpp: text-only → wrap as single speaker
            args.append(contentsOf: ["-f", wav.path, "-otxt", "-of", outURL.path.deletingPathExtension])
        }

        let result = try run(executable: plan.executable, args: args, timeout: opts.timeoutSecs)

        if plan.engine == "whispercpp" {
            // whisper.cpp writes .txt next to -of prefix
            let txt = URL(fileURLWithPath: outURL.path.deletingPathExtension + ".txt")
            let text = (try? String(contentsOf: txt, encoding: .utf8)) ?? result.stdout
            let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { throw RunnerError.badJSON("empty whisper.cpp output") }
            return LocalTranscript(
                language: nil,
                engine: "whispercpp",
                utterances: [
                    .init(speaker: "SPEAKER_00", diarizationId: "SPEAKER_00",
                          channel: 0, start: 0, end: 0, text: cleaned)
                ]
            )
        }

        let data: Data
        if FileManager.default.fileExists(atPath: outURL.path) {
            data = try Data(contentsOf: outURL)
        } else if !result.stdout.isEmpty, result.stdout.first == "{" {
            data = Data(result.stdout.utf8)
        } else {
            throw RunnerError.processFailed(result.code, result.stderr + result.stdout)
        }

        return try parseJSON(data, engine: plan.engine)
    }

    // MARK: - Resolve

    private struct Plan {
        let engine: String
        let executable: String
        let args: [String]
    }

    private static func resolvePlan(opts: Opts) -> Plan? {
        if let cmd = opts.explicitCommand?.trimmingCharacters(in: .whitespacesAndNewlines),
           !cmd.isEmpty {
            // "python3 /path/to/transcribe.py" or single binary
            let parts = shellSplit(cmd)
            guard let exe = parts.first else { return nil }
            return Plan(engine: "custom", executable: exe, args: Array(parts.dropFirst()))
        }

        let order: [LocalTranscribeBackendId]
        switch opts.backend {
        case .auto:
            order = [.whisperx, .vibe, .whispercpp]
        case .whisperx, .vibe, .whispercpp:
            order = [opts.backend]
        case .off:
            return nil
        }

        for b in order {
            switch b {
            case .whisperx:
                if let p = resolveWhisperX(repoRootHint: opts.repoRootHint) {
                    return Plan(engine: "whisperx", executable: p.python, args: [p.script])
                }
            case .vibe:
                if let v = which("vibe") {
                    return Plan(engine: "vibe", executable: v, args: [])
                }
            case .whispercpp:
                if let w = which("whisper-cli") ?? which("whisper-cpp") {
                    return Plan(engine: "whispercpp", executable: w, args: [])
                }
            default:
                break
            }
        }
        return nil
    }

    private static func resolveWhisperX(repoRootHint: URL?) -> (python: String, script: String)? {
        let candidates: [URL] = {
            var u: [URL] = []
            if let root = repoRootHint {
                u.append(root.appendingPathComponent("scripts/local-transcribe/transcribe.py"))
            }
            // Common clone paths
            let home = FileManager.default.homeDirectoryForCurrentUser
            u.append(home.appendingPathComponent("AGB-CRM/scripts/local-transcribe/transcribe.py"))
            // Relative to helper binary's ancestor (dev trees)
            if let exe = Bundle.main.executableURL {
                var dir = exe.deletingLastPathComponent()
                for _ in 0..<8 {
                    let p = dir.appendingPathComponent("scripts/local-transcribe/transcribe.py")
                    u.append(p)
                    dir = dir.deletingLastPathComponent()
                }
            }
            return u
        }()

        for script in candidates {
            guard FileManager.default.isReadableFile(atPath: script.path) else { continue }
            // Prefer venv python next to script
            let venvPy = script.deletingLastPathComponent()
                .appendingPathComponent(".venv/bin/python3")
            if FileManager.default.isExecutableFile(atPath: venvPy.path) {
                return (venvPy.path, script.path)
            }
            if let py = which("python3") {
                return (py, script.path)
            }
        }
        return nil
    }

    // MARK: - Process

    private struct ProcResult {
        let code: Int32
        let stdout: String
        let stderr: String
    }

    private static func run(executable: String, args: [String], timeout: TimeInterval) throws -> ProcResult {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executable)
        proc.arguments = args
        let outPipe = Pipe()
        let errPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = errPipe

        try proc.run()

        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global().async {
            proc.waitUntilExit()
            group.leave()
        }
        let wait = group.wait(timeout: .now() + timeout)
        if wait == .timedOut {
            proc.terminate()
            throw RunnerError.timeout
        }

        let out = String(data: outPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let err = String(data: errPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return ProcResult(code: proc.terminationStatus, stdout: out, stderr: err)
    }

    private static func parseJSON(_ data: Data, engine: String) throws -> LocalTranscript {
        struct Payload: Decodable {
            let language: String?
            let engine: String?
            let utterances: [LocalTranscript.LocalUtterance]
        }
        do {
            let p = try JSONDecoder().decode(Payload.self, from: data)
            guard !p.utterances.isEmpty else { throw RunnerError.badJSON("no utterances") }
            return LocalTranscript(
                language: p.language,
                engine: p.engine ?? engine,
                utterances: p.utterances
            )
        } catch {
            throw RunnerError.badJSON(String(describing: error))
        }
    }

    private static func which(_ name: String) -> String? {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        proc.arguments = [name]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        do {
            try proc.run()
            proc.waitUntilExit()
            guard proc.terminationStatus == 0 else { return nil }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let s = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (s?.isEmpty == false) ? s : nil
        } catch {
            return nil
        }
    }

    private static func shellSplit(_ s: String) -> [String] {
        // Simple whitespace split; quoted paths with spaces should use explicitCommand as single path.
        s.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }
}

private extension String {
    var deletingPathExtension: String {
        (self as NSString).deletingPathExtension
    }
}
