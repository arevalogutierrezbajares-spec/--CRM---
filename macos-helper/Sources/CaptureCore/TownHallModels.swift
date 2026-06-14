import Foundation

/// Wire types for the Town Hall REST surface (`/api/capture/{lobs,projects,
/// posts,notes,reactions,notifications,action-items,files,members}`). All are
/// lenient decoders in the spirit of CaptureAPIClient — tolerate missing keys
/// and string/int id wobble so a server tweak doesn't crash the helper.
///
/// Note: the notification model is `THNotification`, NOT `Notification`, so it
/// never shadows `Foundation.Notification` (which AppDelegate's delegate
/// signatures depend on).

// MARK: - Projects & lobs

/// A file/note-owning portfolio unit (line of business). `/api/capture/lobs`.
public struct LobRef: Decodable, Identifiable, Equatable {
    public let id: String
    public let title: String
}

/// An execution unit (projects table) — action-item + #ref target.
/// `/api/capture/projects`.
public struct ProjectRef: Decodable, Identifiable, Equatable {
    public let id: String
    public let title: String
}

/// A workspace member, for the @mention picker. `/api/capture/members`.
public struct MemberRef: Decodable, Identifiable, Equatable {
    public let id: String
    public let name: String
}

// MARK: - Files

public struct ProjectFile: Decodable, Identifiable, Equatable {
    public let id: String
    public let label: String
    public let category: String?
    public let mimeType: String?
    public let sizeBytes: Int?
    public let originalFilename: String?
    public let url: String?
    public let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, label, category, mimeType, sizeBytes, originalFilename, url, createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        label = (try? c.decodeIfPresent(String.self, forKey: .label)) ?? "file"
        category = try? c.decodeIfPresent(String.self, forKey: .category)
        mimeType = try? c.decodeIfPresent(String.self, forKey: .mimeType)
        sizeBytes = try? c.decodeIfPresent(Int.self, forKey: .sizeBytes)
        originalFilename = try? c.decodeIfPresent(String.self, forKey: .originalFilename)
        url = try? c.decodeIfPresent(String.self, forKey: .url)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

// MARK: - Posts (feed)

public struct PostReference: Decodable, Equatable {
    public let kind: String          // "project" | "mention" | …
    public let id: String?
    public let label: String?
}

public struct Reaction: Decodable, Equatable {
    public let emoji: String
    public let count: Int
    public let reactedByMe: Bool

    enum CodingKeys: String, CodingKey { case emoji, count, reactedByMe }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        emoji = (try? c.decode(String.self, forKey: .emoji)) ?? "👍"
        count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? 0
        reactedByMe = (try? c.decodeIfPresent(Bool.self, forKey: .reactedByMe)) ?? false
    }
}

public struct Post: Decodable, Identifiable, Equatable {
    public let id: String
    public let author: String?
    public let body: String
    public let kind: String?         // "message" | "note"
    public let createdAt: String?
    public let references: [PostReference]
    public let reactions: [Reaction]

    enum CodingKeys: String, CodingKey {
        case id, author, body, kind, createdAt, references, reactions
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        author = try? c.decodeIfPresent(String.self, forKey: .author)
        body = (try? c.decodeIfPresent(String.self, forKey: .body)) ?? ""
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        references = (try? c.decodeIfPresent([PostReference].self, forKey: .references)) ?? []
        reactions = (try? c.decodeIfPresent([Reaction].self, forKey: .reactions)) ?? []
    }
}

// MARK: - Notifications

public struct THNotification: Decodable, Identifiable, Equatable {
    public let id: String
    public let kind: String?
    public let title: String?
    public let body: String?
    public let authorName: String?
    public let entityType: String?
    public let entityId: String?
    public let href: String?
    public let read: Bool
    public let snoozedUntil: String?
    public let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, body, authorName, entityType, entityId, href, read, snoozedUntil, createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        body = try? c.decodeIfPresent(String.self, forKey: .body)
        authorName = try? c.decodeIfPresent(String.self, forKey: .authorName)
        entityType = try? c.decodeIfPresent(String.self, forKey: .entityType)
        entityId = try? c.decodeIfPresent(String.self, forKey: .entityId)
        href = try? c.decodeIfPresent(String.self, forKey: .href)
        read = (try? c.decodeIfPresent(Bool.self, forKey: .read)) ?? false
        snoozedUntil = try? c.decodeIfPresent(String.self, forKey: .snoozedUntil)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
    }

    /// A one-line headline for banners / rows: prefer an item title, then the
    /// actor + body, falling back to the kind.
    public var headline: String {
        if let title, !title.isEmpty { return title }
        if let body, !body.isEmpty {
            return authorName.map { "\($0): \(body)" } ?? body
        }
        return (kind ?? "Notification").capitalized
    }
}

// MARK: - Action items

public struct ActionItem: Decodable, Identifiable, Equatable {
    public let id: String
    public let title: String
    public let dueDate: String?
    public let priority: String?     // now | next | later | backlog
    public let projectId: String?
    public let done: Bool

    enum CodingKeys: String, CodingKey { case id, title, dueDate, priority, projectId, done }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        dueDate = try? c.decodeIfPresent(String.self, forKey: .dueDate)
        priority = try? c.decodeIfPresent(String.self, forKey: .priority)
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        done = (try? c.decodeIfPresent(Bool.self, forKey: .done)) ?? false
    }
}

// MARK: - Request bodies (Encodable)

struct CreatePostBody: Encodable {
    let body: String
    let projectId: String?
    let mentionUserIds: [String]?
}

struct ReactionBody: Encodable {
    let postId: String
    let emoji: String
}

struct CreateActionItemBody: Encodable {
    let title: String
    let projectId: String?
    let dueDate: String?
    let priority: String?
}

struct PatchActionItemBody: Encodable {
    let done: Bool?
}

struct NotificationPatchBody: Encodable {
    let read: Bool?
    let snoozedUntil: String?
}

struct CreateNoteBody: Encodable {
    let body: String
    let lobId: String?
}

struct SignUploadBody: Encodable {
    let lobId: String
    let fileName: String
    let contentType: String?
    let sizeBytes: Int?
}

public struct SignUploadResponse: Decodable {
    public let signedUrl: String
    public let storagePath: String
    public let token: String?
}

struct FinalizeFileBody: Encodable {
    let lobId: String
    let storagePath: String
    let fileName: String
    let contentType: String?
    let sizeBytes: Int?
}
