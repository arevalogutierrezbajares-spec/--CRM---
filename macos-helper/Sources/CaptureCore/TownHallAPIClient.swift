import Foundation

/// Town Hall endpoints, layered onto the existing CaptureAPIClient so they share
/// its auth (`Bearer agbcap_…`), plumbing (makeRequest/send/decode), and error
/// model. Kept in its own file so CaptureAPIClient.swift stays about call capture.
///
/// Every method mirrors the existing style: build the request, JSON-encode any
/// body, `send`, `throwForCommonStatus`, then `decode`. The one exception is
/// `putBytesToSignedURL`, which talks to an external Supabase URL and must NOT
/// carry our auth headers.
extension CaptureAPIClient {

    // MARK: - Wrapper decoders

    private struct LobsResponse: Decodable { let lobs: [LobRef] }
    private struct ProjectsResponse: Decodable { let projects: [ProjectRef] }
    private struct MembersResponse: Decodable { let members: [MemberRef] }
    private struct FilesResponse: Decodable { let files: [ProjectFile] }
    private struct PostsResponse: Decodable { let posts: [Post] }
    private struct PostResponse: Decodable { let post: Post }
    private struct ActionItemsResponse: Decodable { let actionItems: [ActionItem] }
    private struct RecordingsResponse: Decodable { let recordings: [CallRecordingSummary] }
    private struct RecordingResponse: Decodable { let recording: CallRecordingDetail }
    private struct NotificationsResponse: Decodable {
        let unreadCount: Int
        let notifications: [THNotification]
    }

    /// A GET returning JSON we decode into `T`. Centralizes the status dance.
    private func getDecoding<T: Decodable>(_ type: T.Type, path: String) async throws -> T {
        let request = makeRequest(path: path, method: "GET")
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 200 else { throw APIError.http(status: status, body: bodyString(data)) }
        return try decode(type, from: data)
    }

    /// A POST/PATCH with a JSON body, decoding the response into `T`. Accepts
    /// 200 or 201 (creates return 201).
    private func sendDecoding<T: Decodable, B: Encodable>(
        _ type: T.Type, path: String, method: String, body: B
    ) async throws -> T {
        var request = makeRequest(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 200 || status == 201 else {
            throw APIError.http(status: status, body: bodyString(data))
        }
        return try decode(type, from: data)
    }

    /// A POST/PATCH with a JSON body where the response body is ignored.
    @discardableResult
    private func sendVoid<B: Encodable>(path: String, method: String, body: B) async throws -> Int {
        var request = makeRequest(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, status) = try await send(request)
        try throwForCommonStatus(status, data: data)
        guard status == 200 || status == 201 else {
            throw APIError.http(status: status, body: bodyString(data))
        }
        return status
    }

    // MARK: - Projects, lobs, members

    public func getLobs() async throws -> [LobRef] {
        try await getDecoding(LobsResponse.self, path: "/api/capture/lobs").lobs
    }

    public func getProjects() async throws -> [ProjectRef] {
        try await getDecoding(ProjectsResponse.self, path: "/api/capture/projects").projects
    }

    public func getMembers() async throws -> [MemberRef] {
        try await getDecoding(MembersResponse.self, path: "/api/capture/members").members
    }

    public func getLobFiles(lobId: String) async throws -> [ProjectFile] {
        try await getDecoding(FilesResponse.self, path: "/api/capture/lobs/\(lobId)/files").files
    }

    /// Download file bytes and write to a temp path with the correct extension.
    ///
    /// HTML decks: Supabase signed URLs force `text/plain`, so opening them in a
    /// browser shows raw source. We download the bytes (proxy preferred; signed
    /// URL fallback) and open a **local `.html` file** so Safari/Chrome render
    /// the presentation correctly.
    public func downloadProjectFile(_ file: ProjectFile) async throws -> URL {
        let data = try await fetchProjectFileBytes(file)

        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("AGB-Files", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let folder = dir.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        var name = file.preferredFilename
        // Ensure HTML decks keep a browser-friendly extension.
        if file.isHTMLPresentation {
            let lower = name.lowercased()
            if !(lower.hasSuffix(".html") || lower.hasSuffix(".htm")) {
                name += ".html"
            }
        }
        let local = folder.appendingPathComponent(name)
        try data.write(to: local, options: .atomic)
        return local
    }

    private func fetchProjectFileBytes(_ file: ProjectFile) async throws -> Data {
        // 1) Capture view proxy (correct Content-Type for HTML/MD when deployed).
        if file.needsViewProxy {
            do {
                let request = makeRequest(path: "/api/capture/files/\(file.id)/view", method: "GET")
                let (body, status) = try await send(request)
                if status == 200, !body.isEmpty { return body }
            } catch {
                // Fall through to signed URL download.
            }
        }
        // 2) Signed Supabase URL — bytes are still the real HTML/PDF content.
        if let urlStr = file.url, let remote = URL(string: urlStr) {
            let (body, response) = try await URLSession.shared.data(from: remote)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 200, !body.isEmpty { return body }
        }
        // 3) Last resort: capture view again (clear error).
        let request = makeRequest(path: "/api/capture/files/\(file.id)/view", method: "GET")
        let (body, status) = try await send(request)
        try throwForCommonStatus(status, data: body)
        guard status == 200, !body.isEmpty else {
            throw APIError.http(status: status, body: "Could not download file")
        }
        return body
    }

    // MARK: - Feed

    public func getPosts() async throws -> [Post] {
        // No query string: makeRequest builds the path with appendingPathComponent,
        // which would percent-encode a "?". The server defaults the limit to 50.
        try await getDecoding(PostsResponse.self, path: "/api/capture/posts").posts
    }

    @discardableResult
    public func createPost(body: String, projectId: String?, mentionUserIds: [String]) async throws -> Post {
        try await sendDecoding(
            PostResponse.self,
            path: "/api/capture/posts",
            method: "POST",
            body: CreatePostBody(
                body: body,
                projectId: projectId,
                mentionUserIds: mentionUserIds.isEmpty ? nil : mentionUserIds
            )
        ).post
    }

    public func toggleReaction(postId: String, emoji: String) async throws {
        try await sendVoid(
            path: "/api/capture/reactions",
            method: "POST",
            body: ReactionBody(postId: postId, emoji: emoji)
        )
    }

    // MARK: - Notes

    /// A Town Hall note-post (lobId nil) or a note attached to a project.
    public func createNote(body: String, lobId: String?) async throws {
        try await sendVoid(
            path: "/api/capture/notes",
            method: "POST",
            body: CreateNoteBody(body: body, lobId: lobId)
        )
    }

    // MARK: - Filed calls

    /// Recent filed call recordings, newest first. `/api/capture/recordings`.
    public func getRecordings(limit: Int = 30) async throws -> [CallRecordingSummary] {
        try await getDecoding(RecordingsResponse.self,
                              path: "/api/capture/recordings?limit=\(limit)").recordings
    }

    /// Full detail (brief + speaker-attributed transcript) for one filed call.
    public func getRecording(id: String) async throws -> CallRecordingDetail {
        try await getDecoding(RecordingResponse.self,
                              path: "/api/capture/recordings/\(id)").recording
    }

    /// File an unfiled (or re-file a themed) evidence item under a theme.
    /// Exactly one of `themeKey` / `newThemeLabel`.
    public func assignTheme(recordingId: String, tSecs: Double, type: String,
                            themeKey: String? = nil,
                            newThemeLabel: String? = nil) async throws -> CallRecordingDetail {
        struct Body: Encodable {
            let tSecs: Double
            let type: String
            let themeKey: String?
            let newTheme: NewTheme?
            struct NewTheme: Encodable { let label: String }
        }
        return try await sendDecoding(
            RecordingResponse.self,
            path: "/api/capture/recordings/\(recordingId)/assign-theme",
            method: "PATCH",
            body: Body(tSecs: tSecs, type: type, themeKey: themeKey,
                       newTheme: newThemeLabel.map(Body.NewTheme.init))
        ).recording
    }

    /// Strike an AI block from the filed doc (theme's extractions, or the
    /// call sentence). The operator's own content is untouchable.
    public func strikeAI(recordingId: String, themeKey: String?) async throws -> CallRecordingDetail {
        struct Body: Encodable { let target: String; let themeKey: String? }
        return try await sendDecoding(
            RecordingResponse.self,
            path: "/api/capture/recordings/\(recordingId)/strike",
            method: "POST",
            body: Body(target: themeKey == nil ? "callSentence" : "theme", themeKey: themeKey)
        ).recording
    }

    // MARK: - Notifications

    /// Returns the active inbox + the live unread count.
    public func getNotifications() async throws -> (unread: Int, items: [THNotification]) {
        let res = try await getDecoding(NotificationsResponse.self, path: "/api/capture/notifications")
        return (res.unreadCount, res.notifications)
    }

    public func markNotificationRead(id: String) async throws {
        try await sendVoid(
            path: "/api/capture/notifications/\(id)",
            method: "PATCH",
            body: NotificationPatchBody(read: true, snoozedUntil: nil)
        )
    }

    /// Snooze until an ISO-8601 timestamp (or pass nil to unsnooze).
    public func snoozeNotification(id: String, until: Date?) async throws {
        try await sendVoid(
            path: "/api/capture/notifications/\(id)",
            method: "PATCH",
            body: NotificationPatchBody(read: nil, snoozedUntil: until.map { ISO8601.string(from: $0) })
        )
    }

    // MARK: - Action items

    public func getActionItems() async throws -> [ActionItem] {
        try await getDecoding(ActionItemsResponse.self, path: "/api/capture/action-items").actionItems
    }

    @discardableResult
    public func createActionItem(title: String, projectId: String?, dueDate: String?, priority: String?) async throws -> ActionItem {
        try await sendDecoding(
            ActionItem.self,
            path: "/api/capture/action-items",
            method: "POST",
            body: CreateActionItemBody(title: title, projectId: projectId, dueDate: dueDate, priority: priority)
        )
    }

    public func setActionItemDone(id: String, done: Bool) async throws {
        try await sendVoid(
            path: "/api/capture/action-items/\(id)",
            method: "PATCH",
            body: PatchActionItemBody(done: done)
        )
    }

    // MARK: - File upload (3-step: sign → PUT to Supabase → finalize)

    public func signFileUpload(lobId: String, fileName: String, contentType: String?, sizeBytes: Int?) async throws -> SignUploadResponse {
        try await sendDecoding(
            SignUploadResponse.self,
            path: "/api/capture/files/sign",
            method: "POST",
            body: SignUploadBody(lobId: lobId, fileName: fileName, contentType: contentType, sizeBytes: sizeBytes)
        )
    }

    /// Raw PUT of the file bytes directly to the Supabase signed URL. This does
    /// NOT use makeRequest: the signed URL is external and must carry neither the
    /// `agbcap_` Bearer nor `X-Capture-Protocol` header. Body is the raw bytes
    /// (NOT multipart).
    public func putBytesToSignedURL(_ signedUrl: String, fileURL: URL, contentType: String?) async throws {
        guard let url = URL(string: signedUrl) else { throw APIError.network("bad signed URL") }
        let bytes: Data
        do {
            bytes = try Data(contentsOf: fileURL)
        } catch {
            throw APIError.network("could not read \(fileURL.lastPathComponent): \(error.localizedDescription)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType ?? "application/octet-stream", forHTTPHeaderField: "Content-Type")
        do {
            let (data, response) = try await URLSession.shared.upload(for: request, from: bytes)
            guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
            guard (200...299).contains(http.statusCode) else {
                throw APIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error.localizedDescription)
        }
    }

    public func finalizeFileUpload(lobId: String, storagePath: String, fileName: String, contentType: String?, sizeBytes: Int?) async throws -> ProjectFile {
        try await sendDecoding(
            ProjectFile.self,
            path: "/api/capture/files/finalize",
            method: "POST",
            body: FinalizeFileBody(lobId: lobId, storagePath: storagePath, fileName: fileName, contentType: contentType, sizeBytes: sizeBytes)
        )
    }

    /// Convenience: the whole 3-step upload of a local file to a lob.
    @discardableResult
    public func uploadFile(_ fileURL: URL, toLob lobId: String) async throws -> ProjectFile {
        let name = fileURL.lastPathComponent
        let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? nil
        let contentType = MimeType.guess(forFilename: name)
        let signed = try await signFileUpload(lobId: lobId, fileName: name, contentType: contentType, sizeBytes: size)
        try await putBytesToSignedURL(signed.signedUrl, fileURL: fileURL, contentType: contentType)
        return try await finalizeFileUpload(
            lobId: lobId,
            storagePath: signed.storagePath,
            fileName: name,
            contentType: contentType,
            sizeBytes: size
        )
    }
}

/// Minimal extension → MIME mapping for the upload Content-Type (Supabase stores
/// what we send). Unknown types fall back to octet-stream.
enum MimeType {
    static func guess(forFilename name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        switch ext {
        case "pdf": return "application/pdf"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "txt": return "text/plain"
        case "md": return "text/markdown"
        case "csv": return "text/csv"
        case "html", "htm": return "text/html"
        case "json": return "application/json"
        case "doc": return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls": return "application/vnd.ms-excel"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "ppt": return "application/vnd.ms-powerpoint"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "zip": return "application/zip"
        default: return "application/octet-stream"
        }
    }
}
