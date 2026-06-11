import Foundation
import os

/// Unified logging (`os.Logger`, subsystem `com.agb.capture-helper`) plus a
/// rotating plain-text file in Application Support so the diagnostics bundle
/// (FR-CALL-OPS-6) can include a log tail without Console.app access.
public final class HelperLog {
    public static let subsystem = "com.agb.capture-helper"
    nonisolated(unsafe) public static let shared = HelperLog()

    private let osLogger = Logger(subsystem: HelperLog.subsystem, category: "helper")
    private let lock = NSLock()
    private let maxFileBytes = 1_000_000
    private let rotations = 3
    private let timestampFormatter: DateFormatter

    private var logFileURL: URL {
        HelperPaths.logsDir().appendingPathComponent("helper.log")
    }

    public init() {
        timestampFormatter = DateFormatter()
        timestampFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        timestampFormatter.locale = Locale(identifier: "en_US_POSIX")
        timestampFormatter.timeZone = TimeZone.current
    }

    public func info(_ message: String, category: String = "helper") {
        osLogger.info("[\(category, privacy: .public)] \(message, privacy: .public)")
        write(level: "INFO", category: category, message: message)
    }

    public func warn(_ message: String, category: String = "helper") {
        osLogger.warning("[\(category, privacy: .public)] \(message, privacy: .public)")
        write(level: "WARN", category: category, message: message)
    }

    public func error(_ message: String, category: String = "helper") {
        osLogger.error("[\(category, privacy: .public)] \(message, privacy: .public)")
        write(level: "ERROR", category: category, message: message)
    }

    /// Last `lines` lines of the plain-text log (diagnostics bundle).
    public func tail(lines: Int = 200) -> String {
        lock.lock(); defer { lock.unlock() }
        guard let data = FileManager.default.contents(atPath: logFileURL.path),
              let text = String(data: data, encoding: .utf8) else {
            return "(no log file)"
        }
        let all = text.split(separator: "\n", omittingEmptySubsequences: false)
        return all.suffix(lines).joined(separator: "\n")
    }

    // MARK: - File writing + rotation

    private func write(level: String, category: String, message: String) {
        lock.lock(); defer { lock.unlock() }
        let line = "\(timestampFormatter.string(from: Date())) [\(level)] [\(category)] \(message)\n"
        guard let data = line.data(using: .utf8) else { return }

        let fm = FileManager.default
        do {
            try HelperPaths.ensureDirectory(HelperPaths.logsDir())
        } catch {
            return // logging must never crash the helper
        }

        if !fm.fileExists(atPath: logFileURL.path) {
            fm.createFile(atPath: logFileURL.path, contents: nil,
                          attributes: [.posixPermissions: 0o600])
        }

        guard let handle = FileHandle(forWritingAtPath: logFileURL.path) else { return }
        defer { try? handle.close() }
        do {
            let size = try handle.seekToEnd()
            try handle.write(contentsOf: data)
            if size + UInt64(data.count) > UInt64(maxFileBytes) {
                try? handle.close()
                rotate()
            }
        } catch {
            // Swallow: logging is best-effort.
        }
    }

    private func rotate() {
        let fm = FileManager.default
        let dir = HelperPaths.logsDir()
        let oldest = dir.appendingPathComponent("helper.log.\(rotations)")
        try? fm.removeItem(at: oldest)
        for i in stride(from: rotations - 1, through: 1, by: -1) {
            let src = dir.appendingPathComponent("helper.log.\(i)")
            let dst = dir.appendingPathComponent("helper.log.\(i + 1)")
            if fm.fileExists(atPath: src.path) {
                try? fm.moveItem(at: src, to: dst)
            }
        }
        let first = dir.appendingPathComponent("helper.log.1")
        try? fm.moveItem(at: logFileURL, to: first)
    }
}
