import Foundation

/// Wire types for the filed-call browsing surface
/// (`/api/capture/recordings[/{id}]`). Lenient decoders in the spirit of
/// TownHallModels — tolerate missing keys so a server tweak never crashes the
/// helper.

/// One speaker-attributed utterance of a filed transcript.
public struct CallUtterance: Decodable, Equatable {
    public let speaker: String
    public let channel: Int
    public let start: Double
    public let end: Double
    public let text: String
    public let diarizationId: String?

    enum CodingKeys: String, CodingKey {
        case speaker, channel, start, end, text, diarizationId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        speaker = (try? c.decodeIfPresent(String.self, forKey: .speaker)) ?? "Speaker"
        channel = (try? c.decodeIfPresent(Int.self, forKey: .channel)) ?? 0
        start = (try? c.decodeIfPresent(Double.self, forKey: .start)) ?? 0
        end = (try? c.decodeIfPresent(Double.self, forKey: .end)) ?? 0
        text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? ""
        diarizationId = try? c.decodeIfPresent(String.self, forKey: .diarizationId)
    }
}

/// A filed call in the list view. `/api/capture/recordings`.
public struct CallRecordingSummary: Decodable, Identifiable, Equatable {
    public let id: String
    public let title: String
    public let createdAt: String?
    public let durationSecs: Int?
    public let sourceApp: String?
    public let contactName: String?
    public let actionItemCount: Int
    public let hasBrief: Bool
    public let participants: [String]
    public let partial: Bool
    public let suspectFlags: [String]

    enum CodingKeys: String, CodingKey {
        case id, title, createdAt, durationSecs, sourceApp, contactName
        case actionItemCount, hasBrief, participants, partial, suspectFlags
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "Call"
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        durationSecs = try? c.decodeIfPresent(Int.self, forKey: .durationSecs)
        sourceApp = try? c.decodeIfPresent(String.self, forKey: .sourceApp)
        contactName = try? c.decodeIfPresent(String.self, forKey: .contactName)
        actionItemCount = (try? c.decodeIfPresent(Int.self, forKey: .actionItemCount)) ?? 0
        hasBrief = (try? c.decodeIfPresent(Bool.self, forKey: .hasBrief)) ?? false
        participants = (try? c.decodeIfPresent([String].self, forKey: .participants)) ?? []
        partial = (try? c.decodeIfPresent(Bool.self, forKey: .partial)) ?? false
        suspectFlags = (try? c.decodeIfPresent([String].self, forKey: .suspectFlags)) ?? []
    }
}

/// Full detail for one filed call. `/api/capture/recordings/{id}`.
public struct CallRecordingDetail: Decodable {
    public let id: String
    public let title: String
    public let createdAt: String?
    public let durationSecs: Int?
    public let sourceApp: String?
    public let contactName: String?
    public let brief: String?
    public let transcript: String
    public let utterances: [CallUtterance]
    public let speakerMap: [String: String]
    public let transcriptEngine: String?
    public let suspectFlags: [String]
    public let partial: Bool
    public let language: String?
    public let actionItemCount: Int
    public let meetingId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, createdAt, durationSecs, sourceApp, contactName
        case brief, transcript, utterances, speakerMap, transcriptEngine
        case suspectFlags, partial, language, actionItemCount, meetingId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "Call"
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        durationSecs = try? c.decodeIfPresent(Int.self, forKey: .durationSecs)
        sourceApp = try? c.decodeIfPresent(String.self, forKey: .sourceApp)
        contactName = try? c.decodeIfPresent(String.self, forKey: .contactName)
        brief = try? c.decodeIfPresent(String.self, forKey: .brief)
        transcript = (try? c.decodeIfPresent(String.self, forKey: .transcript)) ?? ""
        utterances = (try? c.decodeIfPresent([CallUtterance].self, forKey: .utterances)) ?? []
        speakerMap = (try? c.decodeIfPresent([String: String].self, forKey: .speakerMap)) ?? [:]
        transcriptEngine = try? c.decodeIfPresent(String.self, forKey: .transcriptEngine)
        suspectFlags = (try? c.decodeIfPresent([String].self, forKey: .suspectFlags)) ?? []
        partial = (try? c.decodeIfPresent(Bool.self, forKey: .partial)) ?? false
        language = try? c.decodeIfPresent(String.self, forKey: .language)
        actionItemCount = (try? c.decodeIfPresent(Int.self, forKey: .actionItemCount)) ?? 0
        meetingId = try? c.decodeIfPresent(String.self, forKey: .meetingId)
    }

    /// Display name for an utterance's speaker: mapped cluster name when the
    /// founder named the voice, else the stored label ("You", "Participant",
    /// "SPEAKER_01", …) with the raw cluster id prettified.
    public func displayName(for utterance: CallUtterance) -> String {
        if let d = utterance.diarizationId, let mapped = speakerMap[d], !mapped.isEmpty {
            return mapped
        }
        if let mapped = speakerMap[utterance.speaker], !mapped.isEmpty {
            return mapped
        }
        if utterance.speaker.hasPrefix("SPEAKER_"),
           let n = Int(utterance.speaker.dropFirst("SPEAKER_".count)) {
            return "Speaker \(n + 1)"
        }
        return utterance.speaker
    }
}
