using System.Globalization;

namespace AGB.CaptureCore;

/// <summary>
/// Shared ISO-8601 formatting (fractional seconds, UTC) for the wire protocol.
///
/// Port of the Swift <c>ISO8601</c> enum. Swift used
/// <c>ISO8601DateFormatter</c> with <c>.withInternetDateTime</c> +
/// <c>.withFractionalSeconds</c>, producing e.g. <c>2026-06-11T18:04:09.123Z</c>
/// (millisecond precision, UTC "Z"). We match that exactly so the CRM sees an
/// identical timestamp shape from either helper.
/// </summary>
public static class Iso8601
{
    // Millisecond precision, UTC. Matches Apple's fractional-seconds output.
    private const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public static string String(DateTimeOffset date) =>
        date.ToUniversalTime().ToString(Format, CultureInfo.InvariantCulture);

    /// <summary>
    /// Parse an ISO-8601 timestamp, tolerating both fractional-seconds and
    /// whole-second forms (Swift kept a non-fractional fallback formatter).
    /// Returns null on anything unparseable.
    /// </summary>
    public static DateTimeOffset? Date(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        if (DateTimeOffset.TryParse(
                value,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            return parsed;
        }
        return null;
    }
}
