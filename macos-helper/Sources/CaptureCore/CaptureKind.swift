import Foundation

/// What the helper is recording. Wire protocol stays dual-channel stereo for
/// every kind; the mic-only kinds simply leave R (system) silent because there
/// is no Mac-side call audio — the speech is on the mic (L) only.
public enum CaptureKind: String, Codable, Equatable, Sendable {
    /// Mic (L) + system/call app audio (R). Default for detected VoIP/Zoom/etc.
    case call
    /// In-person room: mic only (L). sourceApp is forced to `sourceAppMeeting`.
    case meeting
    /// An external device — phone, handset, another laptop — on speakerphone,
    /// captured acoustically through the room mic. The far side never touches
    /// Mac output, so *both* parties land mixed on L and R stays silent by
    /// design. Channel-based diarization is impossible here; see
    /// `isAcousticMixed`.
    case speaker

    /// Value written to `sourceApp` / CRM for in-person sessions.
    public static let sourceAppMeeting = "In-Person Meeting"
    /// Value written to `sourceApp` / CRM for speakerphone sessions.
    public static let sourceAppSpeaker = "Speakerphone"

    public var isMeeting: Bool { self == .meeting }

    /// Whether the system-audio (ScreenCaptureKit process tap) path is used.
    /// Only `.call` routes the far side through Mac output. Tapping in the
    /// mic-only kinds costs an aggregate device and guarantees a spurious
    /// "near-silent channel" warning, so it is skipped.
    public var capturesSystemAudio: Bool { self == .call }

    /// Whether the far side arrives acoustically through the room mic, mixed
    /// with the near side on L. Enables input gain and suppresses per-channel
    /// speaker attribution (which would otherwise label everyone "You").
    public var isAcousticMixed: Bool { self == .speaker }

    /// Whether an *other* Mac process holding the mic is meaningful evidence
    /// about this session's lifetime. False when the call is off-Mac: with a
    /// phone on speaker, "no other process using the mic" is the normal steady
    /// state, not a signal that the call ended.
    public var peerMicUsageIsMeaningful: Bool { self == .call }

    /// sourceApp to record when the caller doesn't supply a detected one.
    public func defaultSourceApp(detected: String?) -> String? {
        switch self {
        case .call: return detected
        case .meeting: return Self.sourceAppMeeting
        case .speaker: return Self.sourceAppSpeaker
        }
    }

    public var displayName: String {
        switch self {
        case .call: return "Call"
        case .meeting: return "In-person meeting"
        case .speaker: return "Speakerphone call"
        }
    }

    /// Human label for the primary speech channel in live transcript / dialogue.
    public func primarySpeakerLabel(participantName: String?) -> String {
        switch self {
        case .call:
            return "You"
        case .meeting:
            if let n = participantName?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty {
                return "Room (\(n))"
            }
            return "Room"
        case .speaker:
            // Both parties share this channel — attributing it to "You" would
            // put the other side's words in the founder's mouth.
            if let n = participantName?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty {
                return "Call (\(n))"
            }
            return "Call"
        }
    }

    public func secondarySpeakerLabel(participantName: String?) -> String {
        switch self {
        case .call:
            return participantName ?? "Participant"
        case .meeting:
            // R channel is silence in meeting mode — rarely used.
            return "Remote"
        case .speaker:
            // R channel is silence in speakerphone mode — rarely used.
            return "Remote"
        }
    }
}
