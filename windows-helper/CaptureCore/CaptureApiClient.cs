using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace AGB.CaptureCore;

/// <summary>
/// <see cref="HttpClient"/> client for the Call Capture Protocol v1
/// (docs/CALL-CAPTURE-PROTOCOL.md). Every request carries
/// <c>Authorization: Bearer agbcap_…</c> and <c>X-Capture-Protocol: 1</c>.
///
/// 1:1 port of <c>CaptureAPIClient.swift</c>. An <see cref="HttpMessageHandler"/>
/// can be injected (as the Swift took a custom <c>URLSession</c>) so the unit
/// tests drive it against a mock transport — exactly the seam the Swift tests
/// used with <c>MockURLProtocol</c>.
/// </summary>
public sealed class CaptureApiClient
{
    public Uri BaseUrl { get; }
    private readonly string _token;
    private readonly HttpClient _http;

    /// <summary>Finalize is synchronous server-side and may take ~1–10 min.</summary>
    public TimeSpan FinalizeTimeout { get; set; } = TimeSpan.FromMinutes(15);
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(60);

    public CaptureApiClient(Uri baseUrl, string token, HttpMessageHandler? handler = null)
    {
        BaseUrl = baseUrl;
        _token = token;
        _http = handler is not null ? new HttpClient(handler) : new HttpClient();
        // Resource-level ceiling (per-request timeouts are set on the request).
        _http.Timeout = TimeSpan.FromMinutes(16);
    }

    /// <summary>Build from config, returning null if URL/token are not usable (matches the Swift failable init).</summary>
    public static CaptureApiClient? FromConfig(HelperConfig config, HttpMessageHandler? handler = null)
    {
        if (string.IsNullOrEmpty(config.Token)) return null;
        if (!Uri.TryCreate(config.CrmBaseUrl, UriKind.Absolute, out var url)) return null;
        return new CaptureApiClient(url, config.Token, handler);
    }

    // ------------------------------------------------------------------- Endpoints

    /// <summary><c>GET /api/capture/ping</c></summary>
    public async Task<PingResponse> PingAsync(CancellationToken ct = default)
    {
        using var request = MakeRequest(HttpMethod.Get, "/api/capture/ping");
        var (body, status) = await SendAsync(request, RequestTimeout, ct).ConfigureAwait(false);
        ThrowForCommonStatus(status);
        if (status != 200) throw CaptureApiException.Http(status, BodyString(body));
        return PingResponse.Parse(TryParse(body));
    }

    /// <summary><c>POST /api/capture/sessions</c> → sessionId</summary>
    public async Task<string> CreateSessionAsync(SessionMeta meta, CancellationToken ct = default)
    {
        using var request = MakeRequest(HttpMethod.Post, "/api/capture/sessions");
        request.Content = new ByteArrayContent(meta.ToJsonBytes());
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        var (body, status) = await SendAsync(request, RequestTimeout, ct).ConfigureAwait(false);
        ThrowForCommonStatus(status);
        if (status is not (200 or 201)) throw CaptureApiException.Http(status, BodyString(body));

        string? sessionId = (TryParse(body) as JsonObject)?["sessionId"]?.GetValue<string>();
        if (string.IsNullOrEmpty(sessionId))
            throw CaptureApiException.Decoding($"no sessionId in body: {BodyString(body)}");
        return sessionId;
    }

    /// <summary>
    /// <c>PUT /api/capture/sessions/{id}/chunks/{seq}</c> — raw WAV body.
    /// Idempotent (re-uploading a seq overwrites it). Returns server-confirmed byte count.
    /// </summary>
    public async Task<int> UploadChunkAsync(string sessionId, int seq, string filePath, CancellationToken ct = default)
    {
        byte[] wav;
        try
        {
            wav = await File.ReadAllBytesAsync(filePath, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw CaptureApiException.Network($"could not read chunk file {Path.GetFileName(filePath)}: {ex.Message}");
        }

        using var request = MakeRequest(HttpMethod.Put, $"/api/capture/sessions/{sessionId}/chunks/{seq}");
        request.Content = new ByteArrayContent(wav);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");

        var (body, status) = await SendAsync(request, RequestTimeout, ct).ConfigureAwait(false);
        ThrowForCommonStatus(status);
        if (status != 200) throw CaptureApiException.Http(status, BodyString(body));

        int? bytes = (TryParse(body) as JsonObject) is { } obj ? JsonLenient.AsInt(obj["bytes"]) : null;
        return bytes ?? wav.Length;
    }

    /// <summary><c>POST /api/capture/sessions/{id}/finalize</c>. Throws <see cref="CaptureApiException"/> (MissingChunks) on 409.</summary>
    public async Task<FinalizeResult> FinalizeAsync(string sessionId, FinalizeBody body, CancellationToken ct = default)
    {
        using var request = MakeRequest(HttpMethod.Post, $"/api/capture/sessions/{sessionId}/finalize");
        request.Content = new ByteArrayContent(body.ToJsonBytes());
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        var (responseBody, status) = await SendAsync(request, FinalizeTimeout, ct).ConfigureAwait(false);
        if (status == 409)
        {
            var missing = ((TryParse(responseBody) as JsonObject)?["missing"] as JsonArray)?
                .Select(n => n?.GetValue<int>() ?? 0).ToList() ?? new List<int>();
            throw CaptureApiException.MissingChunks(missing);
        }
        ThrowForCommonStatus(status);
        if (status != 200) throw CaptureApiException.Http(status, BodyString(responseBody));

        return FinalizeResult.Parse(responseBody);
    }

    /// <summary>
    /// Finalize with the protocol's 409 recovery loop: re-upload the seqs the
    /// server reports missing (from local chunk files), then retry. Bounded so a
    /// pathological server can't loop us forever.
    /// </summary>
    public async Task<FinalizeResult> FinalizeRecoveringAsync(
        string sessionId,
        FinalizeBody body,
        Func<int, string?> chunkFilePath,
        int maxAttempts = 3,
        CancellationToken ct = default)
    {
        int attempt = 0;
        while (true)
        {
            attempt++;
            try
            {
                return await FinalizeAsync(sessionId, body, ct).ConfigureAwait(false);
            }
            catch (CaptureApiException ex) when (ex.Kind == CaptureApiErrorKind.MissingChunks)
            {
                var seqs = ex.MissingSeqs;
                if (attempt >= maxAttempts || seqs.Count == 0)
                    throw;
                foreach (int seq in seqs.OrderBy(s => s))
                {
                    string? path = chunkFilePath(seq);
                    if (path is null)
                        throw; // can't satisfy the server — surface the 409 as-is
                    await UploadChunkAsync(sessionId, seq, path, ct).ConfigureAwait(false);
                }
            }
        }
    }

    /// <summary><c>DELETE /api/capture/sessions/{id}</c> — abandon; zero artifacts persist.</summary>
    public async Task AbandonAsync(string sessionId, CancellationToken ct = default)
    {
        using var request = MakeRequest(HttpMethod.Delete, $"/api/capture/sessions/{sessionId}");
        var (body, status) = await SendAsync(request, RequestTimeout, ct).ConfigureAwait(false);
        ThrowForCommonStatus(status);
        if (status is not (200 or 204)) throw CaptureApiException.Http(status, BodyString(body));
    }

    // -------------------------------------------------------------------- Plumbing

    private HttpRequestMessage MakeRequest(HttpMethod method, string path)
    {
        // Avoid double slashes when baseURL has a trailing slash.
        string baseStr = BaseUrl.ToString().TrimEnd('/');
        string trimmed = path.StartsWith('/') ? path : "/" + path;
        var request = new HttpRequestMessage(method, new Uri(baseStr + trimmed));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.TryAddWithoutValidation("X-Capture-Protocol", AudioConstants.ProtocolVersion);
        request.Headers.TryAddWithoutValidation("User-Agent", $"AGBCaptureHelper/{AudioConstants.HelperVersion}");
        return request;
    }

    private async Task<(byte[] body, int status)> SendAsync(HttpRequestMessage request, TimeSpan timeout, CancellationToken ct)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(timeout);
        try
        {
            using HttpResponseMessage response =
                await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, timeoutCts.Token).ConfigureAwait(false);
            byte[] body = await response.Content.ReadAsByteArrayAsync(timeoutCts.Token).ConfigureAwait(false);
            return (body, (int)response.StatusCode);
        }
        catch (CaptureApiException)
        {
            throw;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw CaptureApiException.Network("request timed out");
        }
        catch (HttpRequestException ex)
        {
            throw CaptureApiException.Network(ex.Message);
        }
        catch (Exception ex)
        {
            throw CaptureApiException.Network(ex.Message);
        }
    }

    private static void ThrowForCommonStatus(int status)
    {
        switch (status)
        {
            case (int)HttpStatusCode.Unauthorized: throw CaptureApiException.Unauthorized();
            case (int)HttpStatusCode.NotFound: throw CaptureApiException.SessionNotFound();
            case (int)HttpStatusCode.RequestEntityTooLarge: throw CaptureApiException.PayloadTooLarge();
        }
    }

    private static JsonNode? TryParse(byte[] body)
    {
        try { return body.Length == 0 ? null : JsonNode.Parse(body); }
        catch { return null; }
    }

    private static string BodyString(byte[] body)
    {
        try { return body.Length == 0 ? "" : Encoding.UTF8.GetString(body); }
        catch { return $"<{body.Length} bytes>"; }
    }
}
