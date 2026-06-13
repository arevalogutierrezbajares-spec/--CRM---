import Foundation

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

    // MARK: - Local audio archive (transcript-only mode)

    /// Keep a playable copy of each call on this Mac (in ~/Documents/AGB Call
    /// Recordings) after it files. Pair with the CRM's transcript-only setting
    /// to keep audio local and out of cloud storage. Default false (audio is
    /// stored in the CRM as before). The chunks still upload for transcription;
    /// this only adds a local save before the spool is cleaned up.
    public var keepAudioLocal: Bool

    public init(crmBaseUrl: String = "",
                token: String = "",
                retentionNote: String? = nil,
                neverPromptApps: [String] = [],
                helperVersion: String = AudioConstants.helperVersion,
                silenceAutoEndSeconds: Double = HelperConfig.defaultSilenceAutoEndSeconds,
                maxRecordingSeconds: Double = HelperConfig.defaultMaxRecordingSeconds,
                liveTranscript: Bool = true,
                liveTranscriptAutoShow: Bool = true,
                keepAudioLocal: Bool = false) {
        self.crmBaseUrl = crmBaseUrl
        self.token = token
        self.retentionNote = retentionNote
        self.neverPromptApps = neverPromptApps
        self.helperVersion = helperVersion
        self.silenceAutoEndSeconds = silenceAutoEndSeconds
        self.maxRecordingSeconds = maxRecordingSeconds
        self.liveTranscript = liveTranscript
        self.liveTranscriptAutoShow = liveTranscriptAutoShow
        self.keepAudioLocal = keepAudioLocal
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
        keepAudioLocal = (try? c.decodeIfPresent(Bool.self, forKey: .keepAudioLocal)) ?? false
    }

    public var isComplete: Bool {
        !token.isEmpty && URL(string: crmBaseUrl) != nil && !crmBaseUrl.isEmpty
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
