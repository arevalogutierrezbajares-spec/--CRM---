import Foundation

/// Which engine powers the live transcript window.
///  • `auto`  — on-device first (private, free); if it fails mid-call the helper
///    switches to the cloud engine automatically and keeps going.
///  • `local` — Apple on-device only; never sends live audio to the cloud, even
///    if the engine fails (the filed transcript is unaffected either way).
///  • `cloud` — Deepgram streaming via the CRM-minted token.
public enum LiveEngineChoice: String, Codable, CaseIterable {
    case auto
    case local
    case cloud

    public var displayName: String {
        switch self {
        case .auto: return "Auto — on-device, cloud fallback"
        case .local: return "On-device only (Apple, private)"
        case .cloud: return "Cloud (Deepgram)"
        }
    }
}

/// Helper configuration, persisted as JSON at
/// `~/Library/Application Support/AGBCaptureHelper/config.json` (mode 0600).
///
/// The token is the revocable, founder-scoped `agbcap_…` credential minted in
/// CRM Settings (server stores only its SHA-256 — NFR-CALL-SEC-2). Env vars
/// `AGB_CRM_URL` / `AGB_CRM_TOKEN` override the file (used by simulate mode
/// and CI).
public struct HelperConfig: Codable, Equatable {
    public var crmBaseUrl: String
    public var token: String
    /// Default consent posture note (FR-CALL-RET-5), e.g. "participant informed verbally".
    public var retentionNote: String?
    /// Apps that never trigger the record prompt (FR-CALL-TRG-6).
    public var neverPromptApps: [String]
    public var helperVersion: String

    // MARK: - Auto-end tunables (FEATURE 1)

    /// Continuous near-silence on BOTH channels for this many seconds
    /// auto-finalizes the call as a normal end. Guards against runaway
    /// recordings when the OS mic-release signal never fires (e.g. WhatsApp
    /// holding the mic open after hangup). Default 90 s.
    public var silenceAutoEndSeconds: Double
    /// Hard ceiling: a single recording is auto-finalized after this many
    /// seconds no matter what, so nothing ever runs forever. Default 2 h.
    public var maxRecordingSeconds: Double

    // MARK: - Live transcript (FEATURE 2)

    /// Open a best-effort Deepgram live-transcript stream during recording and
    /// show it in a floating window. Purely additive; never affects capture or
    /// post-call filing. Default true.
    public var liveTranscript: Bool
    /// Auto-show the floating transcript window when a recording starts.
    /// Default true (only meaningful when `liveTranscript` is on).
    public var liveTranscriptAutoShow: Bool

    /// Use Apple's on-device speech recognition for the live transcript (free,
    /// private, offline, no Deepgram token) instead of the cloud stream.
    /// Default true. Falls back to the cloud engine when false.
    /// LEGACY — superseded by `liveTranscriptEngine`; kept so old config.json
    /// files (and any external tooling that flips this bool) still work.
    public var liveTranscriptOnDevice: Bool

    /// Live-transcript engine selection (auto | local | cloud). When the key is
    /// absent from config.json, derived from the legacy `liveTranscriptOnDevice`
    /// bool if that was explicitly set, else `auto`.
    public var liveTranscriptEngine: LiveEngineChoice

    // MARK: - Local audio archive (transcript-only mode)

    /// Keep a playable copy of each call on this Mac (in ~/Documents/AGB Call
    /// Recordings) after it files. Pair with the CRM's transcript-only setting
    /// to keep audio local and out of cloud storage. Default false (audio is
    /// stored in the CRM as before). The chunks still upload for transcription;
    /// this only adds a local save before the spool is cleaned up.
    public var keepAudioLocal: Bool

    // MARK: - Local free STT + diarization (meetings)

    /// Run WhisperX / Vibe / whisper.cpp on meeting stop before finalize.
    public var localTranscribeEnabled: Bool
    /// auto | whisperx | vibe | whispercpp | off
    public var localTranscribeBackend: String
    /// Optional full command override, e.g. "/path/.venv/bin/python /path/transcribe.py"
    public var localTranscribeCommand: String?
    public var localTranscribeModel: String
    public var localTranscribeTimeoutSecs: Double

    public init(crmBaseUrl: String = "",
                token: String = "",
                retentionNote: String? = nil,
                neverPromptApps: [String] = [],
                helperVersion: String = AudioConstants.helperVersion,
                silenceAutoEndSeconds: Double = HelperConfig.defaultSilenceAutoEndSeconds,
                maxRecordingSeconds: Double = HelperConfig.defaultMaxRecordingSeconds,
                liveTranscript: Bool = true,
                liveTranscriptAutoShow: Bool = true,
                liveTranscriptOnDevice: Bool = true,
                liveTranscriptEngine: LiveEngineChoice = .auto,
                keepAudioLocal: Bool = false,
                localTranscribeEnabled: Bool = true,
                localTranscribeBackend: String = "auto",
                localTranscribeCommand: String? = nil,
                localTranscribeModel: String = "small",
                localTranscribeTimeoutSecs: Double = 1800) {
        self.crmBaseUrl = crmBaseUrl
        self.token = token
        self.retentionNote = retentionNote
        self.neverPromptApps = neverPromptApps
        self.helperVersion = helperVersion
        self.silenceAutoEndSeconds = silenceAutoEndSeconds
        self.maxRecordingSeconds = maxRecordingSeconds
        self.liveTranscript = liveTranscript
        self.liveTranscriptAutoShow = liveTranscriptAutoShow
        self.liveTranscriptOnDevice = liveTranscriptOnDevice
        self.liveTranscriptEngine = liveTranscriptEngine
        self.keepAudioLocal = keepAudioLocal
        self.localTranscribeEnabled = localTranscribeEnabled
        self.localTranscribeBackend = localTranscribeBackend
        self.localTranscribeCommand = localTranscribeCommand
        self.localTranscribeModel = localTranscribeModel
        self.localTranscribeTimeoutSecs = localTranscribeTimeoutSecs
    }

    /// 90 s of two-channel silence ≈ a clearly-ended call, well past any natural pause.
    public static let defaultSilenceAutoEndSeconds: Double = 90
    /// 2 h ceiling — long enough for any real call, short of "runs forever".
    public static let defaultMaxRecordingSeconds: Double = 2 * 60 * 60

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        crmBaseUrl = (try? c.decodeIfPresent(String.self, forKey: .crmBaseUrl)) ?? ""
        token = (try? c.decodeIfPresent(String.self, forKey: .token)) ?? ""
        retentionNote = try? c.decodeIfPresent(String.self, forKey: .retentionNote)
        neverPromptApps = (try? c.decodeIfPresent([String].self, forKey: .neverPromptApps)) ?? []
        helperVersion = (try? c.decodeIfPresent(String.self, forKey: .helperVersion)) ?? AudioConstants.helperVersion
        // New keys default to the safe values when absent so existing config.json
        // files keep working without a rewrite. Non-positive overrides fall back.
        let silence = (try? c.decodeIfPresent(Double.self, forKey: .silenceAutoEndSeconds)) ?? HelperConfig.defaultSilenceAutoEndSeconds
        silenceAutoEndSeconds = silence > 0 ? silence : HelperConfig.defaultSilenceAutoEndSeconds
        let maxDur = (try? c.decodeIfPresent(Double.self, forKey: .maxRecordingSeconds)) ?? HelperConfig.defaultMaxRecordingSeconds
        maxRecordingSeconds = maxDur > 0 ? maxDur : HelperConfig.defaultMaxRecordingSeconds
        liveTranscript = (try? c.decodeIfPresent(Bool.self, forKey: .liveTranscript)) ?? true
        liveTranscriptAutoShow = (try? c.decodeIfPresent(Bool.self, forKey: .liveTranscriptAutoShow)) ?? true
        let legacyOnDevice = try? c.decodeIfPresent(Bool.self, forKey: .liveTranscriptOnDevice)
        liveTranscriptOnDevice = legacyOnDevice ?? true
        // Engine choice: explicit key wins; else honor a legacy explicit bool
        // (true → local, false → cloud) so an existing setup keeps its behavior;
        // else default to auto (on-device with automatic cloud fallback).
        if let raw = try? c.decodeIfPresent(String.self, forKey: .liveTranscriptEngine),
           let choice = LiveEngineChoice(rawValue: raw) {
            liveTranscriptEngine = choice
        } else if let legacy = legacyOnDevice {
            liveTranscriptEngine = legacy ? .local : .cloud
        } else {
            liveTranscriptEngine = .auto
        }
        keepAudioLocal = (try? c.decodeIfPresent(Bool.self, forKey: .keepAudioLocal)) ?? false
        localTranscribeEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .localTranscribeEnabled)) ?? true
        localTranscribeBackend = (try? c.decodeIfPresent(String.self, forKey: .localTranscribeBackend)) ?? "auto"
        localTranscribeCommand = try? c.decodeIfPresent(String.self, forKey: .localTranscribeCommand)
        localTranscribeModel = (try? c.decodeIfPresent(String.self, forKey: .localTranscribeModel)) ?? "small"
        let lt = (try? c.decodeIfPresent(Double.self, forKey: .localTranscribeTimeoutSecs)) ?? 1800
        localTranscribeTimeoutSecs = lt > 0 ? lt : 1800
    }

    public var isComplete: Bool {
        !token.isEmpty && URL(string: crmBaseUrl) != nil && !crmBaseUrl.isEmpty
    }

    /// Absolute web URL for a CRM path (e.g. `/town-hall`, `/dashboard?x=1`).
    /// Handles trailing slashes and query strings (unlike `appendingPathComponent`).
    public func crmWebURL(path: String) -> URL? {
        guard !crmBaseUrl.isEmpty else { return nil }
        var base = crmBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while base.hasSuffix("/") { base.removeLast() }
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: base + p)
    }

    /// URL of the CRM live-transcript token-grant endpoint, derived from
    /// `crmBaseUrl`. Returns nil when the base URL is unusable.
    public var liveTokenURL: URL? {
        guard !crmBaseUrl.isEmpty, let base = URL(string: crmBaseUrl) else { return nil }
        return base.appendingPathComponent("api/capture/live-token")
    }

    // MARK: - Load / save

    public static func load(from url: URL = HelperPaths.configURL()) -> HelperConfig? {
        guard let data = FileManager.default.contents(atPath: url.path) else { return nil }
        return try? JSONDecoder().decode(HelperConfig.self, from: data)
    }

    public func save(to url: URL = HelperPaths.configURL()) throws {
        try HelperPaths.ensureDirectory(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(self)
        let tmp = url.deletingLastPathComponent().appendingPathComponent(".config.json.tmp")
        guard FileManager.default.createFile(atPath: tmp.path,
                                             contents: data,
                                             attributes: [.posixPermissions: 0o600]) else {
            throw CocoaError(.fileWriteUnknown)
        }
        _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
        // replaceItemAt can carry over the destination's old mode; re-assert 0600.
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    /// Config with env overrides applied: `AGB_CRM_URL` / `AGB_CRM_TOKEN`
    /// take precedence over config.json (simulate mode / CI).
    public static func effective(from url: URL = HelperPaths.configURL(),
                                 environment: [String: String] = ProcessInfo.processInfo.environment) -> HelperConfig {
        var config = load(from: url) ?? HelperConfig()
        if let envURL = environment["AGB_CRM_URL"], !envURL.isEmpty {
            config.crmBaseUrl = envURL
        }
        if let envToken = environment["AGB_CRM_TOKEN"], !envToken.isEmpty {
            config.token = envToken
        }
        return config
    }
}
