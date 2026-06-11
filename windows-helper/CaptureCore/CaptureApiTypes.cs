using System.Text.Json;
using System.Text.Json.Nodes;

namespace AGB.CaptureCore;

/// <summary>
/// Wire types for the Call Capture Protocol v1 (docs/CALL-CAPTURE-PROTOCOL.md),
/// ported from the nested types in <c>CaptureAPIClient.swift</c>. The decoders
/// are deliberately lenient (accept string-or-int for ids, tolerate missing
/// fields) to match the Swift lenient decoders.
/// </summary>

/// <summary>Response of <c>GET /api/capture/ping</c>.</summary>
public sealed record PingResponse(bool Ok, string? WorkspaceId, string? UserId, int? RetentionDays)
{
    public static PingResponse Parse(JsonNode? root)
    {
        var obj = root as JsonObject ?? new JsonObject();
        return new PingResponse(
            Ok: obj["ok"]?.GetValue<bool>() ?? false,
            WorkspaceId: JsonLenient.AsString(obj["workspaceId"]),
            UserId: JsonLenient.AsString(obj["userId"]),
            RetentionDays: JsonLenient.AsInt(obj["retentionDays"]));
    }
}

/// <summary>Body of <c>POST /api/capture/sessions</c>. Encodes an explicit null sourceApp per the protocol.</summary>
public sealed class SessionMeta
{
    public string StartedAt { get; }
    public string? SourceApp { get; }
    public int SampleRate { get; } = AudioConstants.SampleRate;
    public int Channels { get; } = AudioConstants.Channels;
    public string Format { get; } = "wav-pcm16";
    public string HelperVersion { get; }

    public SessionMeta(DateTimeOffset startedAt, string? sourceApp, string helperVersion = AudioConstants.HelperVersion)
    {
        StartedAt = Iso8601.String(startedAt);
        SourceApp = sourceApp;
        HelperVersion = helperVersion;
    }

    public SessionMeta(SessionManifest manifest, string helperVersion = AudioConstants.HelperVersion)
    {
        StartedAt = manifest.StartedAt;
        SourceApp = manifest.SourceApp;
        HelperVersion = helperVersion;
    }

    /// <summary>Serialize with an explicit JSON null for a missing sourceApp (the protocol shows <c>"sourceApp": … | null</c>).</summary>
    public byte[] ToJsonBytes()
    {
        var obj = new JsonObject
        {
            ["startedAt"] = StartedAt,
            ["sourceApp"] = SourceApp is null ? null : JsonValue.Create(SourceApp),
            ["sampleRate"] = SampleRate,
            ["channels"] = Channels,
            ["format"] = Format,
            ["helperVersion"] = HelperVersion,
        };
        return JsonSerializer.SerializeToUtf8Bytes(obj);
    }
}

/// <summary>Body of <c>POST /api/capture/sessions/{id}/finalize</c>.</summary>
public sealed class FinalizeBody
{
    public string EndedAt { get; }
    public int DurationSecs { get; }
    public int TotalChunks { get; }
    public bool Partial { get; }
    public string? ContactName { get; }

    public FinalizeBody(DateTimeOffset endedAt, int durationSecs, int totalChunks, bool partial, string? contactName = null)
        : this(Iso8601.String(endedAt), durationSecs, totalChunks, partial, contactName) { }

    public FinalizeBody(string endedAtIso, int durationSecs, int totalChunks, bool partial, string? contactName = null)
    {
        EndedAt = endedAtIso;
        DurationSecs = durationSecs;
        TotalChunks = totalChunks;
        Partial = partial;
        ContactName = contactName;
    }

    public byte[] ToJsonBytes()
    {
        var obj = new JsonObject
        {
            ["endedAt"] = EndedAt,
            ["durationSecs"] = DurationSecs,
            ["totalChunks"] = TotalChunks,
            ["partial"] = Partial,
            ["contactName"] = ContactName is null ? null : JsonValue.Create(ContactName),
        };
        return JsonSerializer.SerializeToUtf8Bytes(obj);
    }
}

public sealed record ContactRef(string? Id, string? Name);

/// <summary>Result of a successful finalize.</summary>
public sealed class FinalizeResult
{
    public bool Ok { get; init; }
    public string? RecordingId { get; init; }
    public string? Title { get; init; }
    public string? Brief { get; init; }
    public int? ActionItemCount { get; init; }
    public ContactRef? Contact { get; init; }
    public IReadOnlyList<string>? SuspectFlags { get; init; }
    /// <summary>Raw response body, for printing / diagnostics.</summary>
    public byte[] Raw { get; set; } = Array.Empty<byte>();

    public static FinalizeResult Parse(byte[] body)
    {
        JsonNode? root = null;
        try { root = JsonNode.Parse(body); } catch { /* leave null */ }
        var obj = root as JsonObject ?? new JsonObject();

        ContactRef? contact = null;
        if (obj["contact"] is JsonObject c)
        {
            contact = new ContactRef(JsonLenient.AsString(c["id"]), JsonLenient.AsString(c["name"]));
        }

        List<string>? flags = null;
        if (obj["suspectFlags"] is JsonArray arr)
        {
            flags = arr.Select(n => n?.GetValue<string>()).Where(s => s is not null).Select(s => s!).ToList();
        }

        return new FinalizeResult
        {
            Ok = obj["ok"]?.GetValue<bool>() ?? false,
            RecordingId = JsonLenient.AsString(obj["recordingId"]),
            Title = JsonLenient.AsString(obj["title"]),
            Brief = JsonLenient.AsString(obj["brief"]),
            ActionItemCount = JsonLenient.AsInt(obj["actionItemCount"]),
            Contact = contact,
            SuspectFlags = flags,
            Raw = body,
        };
    }
}

/// <summary>Lenient JSON value coercion mirroring the Swift "string or int" decoders.</summary>
internal static class JsonLenient
{
    public static string? AsString(JsonNode? node)
    {
        if (node is null) return null;
        if (node is JsonValue v)
        {
            if (v.TryGetValue(out string? s)) return s;
            if (v.TryGetValue(out int i)) return i.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (v.TryGetValue(out long l)) return l.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        return null;
    }

    public static int? AsInt(JsonNode? node)
    {
        if (node is JsonValue v)
        {
            if (v.TryGetValue(out int i)) return i;
            if (v.TryGetValue(out long l)) return (int)l;
            if (v.TryGetValue(out string? s) && int.TryParse(s, out int parsed)) return parsed;
        }
        return null;
    }
}
