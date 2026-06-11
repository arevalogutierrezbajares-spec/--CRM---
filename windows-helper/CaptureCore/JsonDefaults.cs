using System.Text.Json;

namespace AGB.CaptureCore;

/// <summary>
/// Shared System.Text.Json settings. The macOS helper encoded the manifest and
/// config with <c>.prettyPrinted</c> + <c>.sortedKeys</c>; we match that so the
/// on-disk files are human-diffable and stable. Property names come from the
/// explicit <c>[JsonPropertyName]</c> attributes on the models.
/// </summary>
public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        // Stable, alphabetical key order to mirror Swift's `.sortedKeys`.
        TypeInfoResolver = new SortedPropertiesResolver(),
        // Swift's Codable omits nil optionals; match that so a null serverSessionId /
        // endedAt / sourceApp is absent from the file rather than written as null.
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public static readonly JsonSerializerOptions Lenient = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}
