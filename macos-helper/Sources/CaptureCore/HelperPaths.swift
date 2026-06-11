import Foundation

/// Canonical filesystem locations for the helper. Everything lives under
/// `~/Library/Application Support/AGBCaptureHelper/` with founder-only
/// permissions (dirs 0700, files 0600 — NFR-CALL-SEC-1).
public enum HelperPaths {
    /// Overridable root for tests / sandboxing (set before first use).
    nonisolated(unsafe) public static var overrideRoot: URL?

    public static func appSupportDir() -> URL {
        if let overrideRoot { return overrideRoot }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("AGBCaptureHelper", isDirectory: true)
    }

    public static func spoolDir() -> URL {
        appSupportDir().appendingPathComponent("spool", isDirectory: true)
    }

    public static func logsDir() -> URL {
        appSupportDir().appendingPathComponent("logs", isDirectory: true)
    }

    public static func configURL() -> URL {
        appSupportDir().appendingPathComponent("config.json")
    }

    /// Create a directory (and intermediates) with 0700 permissions.
    @discardableResult
    public static func ensureDirectory(_ url: URL) throws -> URL {
        try FileManager.default.createDirectory(
            at: url,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        return url
    }
}
