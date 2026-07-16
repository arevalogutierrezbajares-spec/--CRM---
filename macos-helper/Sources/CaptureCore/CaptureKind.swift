import Foundation

/// What the helper is recording. Wire protocol stays dual-channel stereo for
/// both kinds; meeting mode simply leaves R (system) silent because there is
/// no remote call audio — the room is on the mic (L) only.
public enum CaptureKind: String, Codable, Equatable, Sendable {
    /// Mic (L) + system/call app audio (R). Default for detected VoIP/Zoom/etc.
    case call
    /// In-person room: mic only (L). sourceApp is forced to `sourceAppMeeting`.
    case meeting

    /// Value written to `sourceApp` / CRM for in-person sessions.
    public static let sourceAppMeeting = "In-Person Meeting"

    public var isMeeting: Bool { self == .meeting }

    public var displayName: String {
        switch self {
        case .call: return "Call"
        case .meeting: return "In-person meeting"
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
        }
    }

    public func secondarySpeakerLabel(participantName: String?) -> String {
        switch self {
        case .call:
            return participantName ?? "Participant"
        case .meeting:
            // R channel is silence in meeting mode — rarely used.
            return "Remote"
        }
    }
}
