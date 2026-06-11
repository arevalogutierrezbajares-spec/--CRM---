namespace AGB.CaptureCore;

/// <summary>Categories of failure from <see cref="CaptureApiClient"/>, ported from Swift's <c>APIError</c>.</summary>
public enum CaptureApiErrorKind
{
    /// <summary>401 — token invalid or revoked; helper surfaces "reconnect" (FR-CALL-OPS-2).</summary>
    Unauthorized,
    /// <summary>404 — unknown or closed session.</summary>
    SessionNotFound,
    /// <summary>413 — chunk over the 4 MB cap.</summary>
    PayloadTooLarge,
    /// <summary>409 from finalize — server lists missing seqs to re-upload.</summary>
    MissingChunks,
    Http,
    Network,
    InvalidResponse,
    Decoding,
}

/// <summary>
/// Typed transport error for the capture protocol. Mirrors Swift's
/// <c>CaptureAPIClient.APIError</c> including the network-vs-request distinction
/// the upload worker keys on (a network failure aborts the whole pass).
/// </summary>
public sealed class CaptureApiException : Exception
{
    public CaptureApiErrorKind Kind { get; }
    public int Status { get; }
    public IReadOnlyList<int> MissingSeqs { get; }

    private CaptureApiException(CaptureApiErrorKind kind, string message, int status = 0, IReadOnlyList<int>? missing = null)
        : base(message)
    {
        Kind = kind;
        Status = status;
        MissingSeqs = missing ?? Array.Empty<int>();
    }

    /// <summary>Network-level failures (likely whole-link down) vs per-request errors.</summary>
    public bool IsNetworkFailure => Kind == CaptureApiErrorKind.Network;

    public static CaptureApiException Unauthorized() =>
        new(CaptureApiErrorKind.Unauthorized,
            "401 — capture token invalid or revoked; re-mint in CRM Settings");
    public static CaptureApiException SessionNotFound() =>
        new(CaptureApiErrorKind.SessionNotFound, "404 — session unknown or closed on server");
    public static CaptureApiException PayloadTooLarge() =>
        new(CaptureApiErrorKind.PayloadTooLarge, "413 — chunk exceeded server body limit");
    public static CaptureApiException MissingChunks(IReadOnlyList<int> seqs) =>
        new(CaptureApiErrorKind.MissingChunks, $"409 — server missing chunks [{string.Join(", ", seqs)}]", missing: seqs);
    public static CaptureApiException Http(int status, string body) =>
        new(CaptureApiErrorKind.Http, $"HTTP {status}: {Truncate(body, 300)}", status);
    public static CaptureApiException Network(string why) =>
        new(CaptureApiErrorKind.Network, $"Network: {why}");
    public static CaptureApiException InvalidResponse() =>
        new(CaptureApiErrorKind.InvalidResponse, "Invalid (non-HTTP) response");
    public static CaptureApiException Decoding(string why) =>
        new(CaptureApiErrorKind.Decoding, $"Response decode failed: {why}");

    private static string Truncate(string s, int max) => s.Length <= max ? s : s.Substring(0, max);
}
