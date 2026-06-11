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

    public init(crmBaseUrl: String = "",
                token: String = "",
                retentionNote: String? = nil,
                neverPromptApps: [String] = [],
                helperVersion: String = AudioConstants.helperVersion) {
        self.crmBaseUrl = crmBaseUrl
        self.token = token
        self.retentionNote = retentionNote
        self.neverPromptApps = neverPromptApps
        self.helperVersion = helperVersion
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        crmBaseUrl = (try? c.decodeIfPresent(String.self, forKey: .crmBaseUrl)) ?? ""
        token = (try? c.decodeIfPresent(String.self, forKey: .token)) ?? ""
        retentionNote = try? c.decodeIfPresent(String.self, forKey: .retentionNote)
        neverPromptApps = (try? c.decodeIfPresent([String].self, forKey: .neverPromptApps)) ?? []
        helperVersion = (try? c.decodeIfPresent(String.self, forKey: .helperVersion)) ?? AudioConstants.helperVersion
    }

    public var isComplete: Bool {
        !token.isEmpty && URL(string: crmBaseUrl) != nil && !crmBaseUrl.isEmpty
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
