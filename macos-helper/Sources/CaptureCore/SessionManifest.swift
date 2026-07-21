import Foundation

/// On-disk state of a single capture session's spool directory.
///
/// The manifest (`manifest.json`) plus the chunk files on disk are the *only*
/// source of truth for upload state — never process memory — so a crash or
/// restart resumes exactly where the files say we were (NFR-CALL-REL-3,
/// FR-CALL-OPS-5).
public struct SessionManifest: Codable, Equatable {
    /// Helper-generated id (UUID). Names the spool dir; stable across restarts.
    public var sessionLocalId: String
    /// CRM session id, once `POST /api/capture/sessions` has succeeded.
    public var serverSessionId: String?
    /// ISO-8601 call start (includes pre-roll: backdated to first buffered byte).
    public var startedAt: String
    /// App that opened the microphone, when resolvable (macOS 14.4+), else nil.
    /// For in-person meetings this is `CaptureKind.sourceAppMeeting`.
    public var sourceApp: String?
    /// `call` (default) or `meeting` (in-person, mic-only). Crash-safe.
    public var captureKind: String?
    /// Far-side participant display name (founder-labeled). Sent as finalize
    /// `contactName` so CRM dialogue + contact match use a person, not "Participant".
    /// Nil when unlabeled. Crash-safe: survives Helper restart via manifest.
    public var contactName: String?
    /// Chunk seqs written to disk (contiguous from 0 by construction).
    public var seqsWritten: [Int]
    /// Chunk seqs confirmed uploaded (200 from PUT).
    public var seqsUploaded: [Int]
    /// True once finalize succeeded (spool dir is deleted right after; a
    /// finalized manifest on disk means deletion was interrupted).
    public var finalized: Bool
    /// ISO-8601 call end. nil while recording; set by stop or crash-adoption.
    public var endedAt: String?
    /// Seconds of audio captured (PCM bytes / 64 000). Set at end.
    public var durationSecs: Int?
    /// True when this session was salvaged after a crash (FR-CALL-OPS-5).
    public var partial: Bool
    /// Chunk size in seconds used for this session (30 in production;
    /// overridable in simulate mode). Persisted so reopen chunks identically.
    public var chunkSeconds: Int
    /// Live-flagged "important moments" the operator marked during the call
    /// (hotkey / ★ button). Time-anchored to the recording; ride the finalize
    /// payload so the CRM brief can surface them. Optional so older manifests
    /// (no key) still decode — a missing key defaults to nil, never a corrupt
    /// manifest. Crash-safe: persisted like every other field.
    public var highlights: [Highlight]?

    /// One operator-flagged moment: seconds from recording start + optional note.
    public struct Highlight: Codable, Equatable {
        /// Elapsed seconds from `startedAt` when the operator flagged the moment.
        public var tSecs: Double
        /// Optional free-text the operator typed with the flag (nil = bare star).
        public var note: String?
        public init(tSecs: Double, note: String? = nil) {
            self.tSecs = tSecs
            self.note = note
        }
    }

    public init(sessionLocalId: String,
                serverSessionId: String? = nil,
                startedAt: Date,
                sourceApp: String? = nil,
                captureKind: CaptureKind = .call,
                contactName: String? = nil,
                seqsWritten: [Int] = [],
                seqsUploaded: [Int] = [],
                finalized: Bool = false,
                endedAt: Date? = nil,
                durationSecs: Int? = nil,
                partial: Bool = false,
                chunkSeconds: Int = AudioConstants.chunkSeconds,
                highlights: [Highlight]? = nil) {
        self.sessionLocalId = sessionLocalId
        self.serverSessionId = serverSessionId
        self.startedAt = ISO8601.string(from: startedAt)
        self.sourceApp = sourceApp
        self.captureKind = captureKind.rawValue
        self.contactName = contactName
        self.seqsWritten = seqsWritten
        self.seqsUploaded = seqsUploaded
        self.finalized = finalized
        self.endedAt = endedAt.map(ISO8601.string(from:))
        self.durationSecs = durationSecs
        self.partial = partial
        self.chunkSeconds = chunkSeconds
        self.highlights = highlights
    }

    public var startedAtDate: Date? { ISO8601.date(from: startedAt) }
    public var endedAtDate: Date? { endedAt.flatMap(ISO8601.date(from:)) }

    /// Resolved capture kind (defaults to call for older manifests).
    public var kind: CaptureKind {
        CaptureKind(rawValue: captureKind ?? "") ?? .call
    }

    /// Seqs written but not yet confirmed uploaded, ascending.
    public var pendingUploadSeqs: [Int] {
        let uploaded = Set(seqsUploaded)
        return seqsWritten.filter { !uploaded.contains($0) }.sorted()
    }

    /// Ready for finalize: ended, everything written is uploaded, not yet finalized.
    public var readyToFinalize: Bool {
        endedAt != nil && !finalized && pendingUploadSeqs.isEmpty && !seqsWritten.isEmpty
    }
}

/// Shared ISO-8601 formatting (fractional seconds, UTC) for the wire protocol.
public enum ISO8601 {
    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let fallback: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    public static func string(from date: Date) -> String { formatter.string(from: date) }
    public static func date(from string: String) -> Date? {
        formatter.date(from: string) ?? fallback.date(from: string)
    }
}
