using System.Net;
using System.Text;
using System.Text.Json;
using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>
/// Port of <c>CaptureAPIClientTests.swift</c>. The Swift suite injected a custom
/// URLSession with a <c>MockURLProtocol</c>; here we inject a
/// <see cref="MockHttpMessageHandler"/> into the client — the same testing seam.
/// </summary>
public class CaptureApiClientTests : IDisposable
{
    private sealed record RecordedRequest(string Method, Uri Url, IReadOnlyDictionary<string, string> Headers, byte[]? Body);

    private sealed class Stub
    {
        public int Status { get; init; } = 200;
        public byte[] Body { get; init; } = Array.Empty<byte>();
    }

    private sealed class MockHttpMessageHandler : HttpMessageHandler
    {
        public Func<RecordedRequest, Stub>? Handler { get; set; }
        public List<RecordedRequest> Recorded { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            byte[]? body = request.Content is null ? null : await request.Content.ReadAsByteArrayAsync(ct);
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in request.Headers)
                headers[h.Key] = string.Join(",", h.Value);
            if (request.Content is not null)
                foreach (var h in request.Content.Headers)
                    headers[h.Key] = string.Join(",", h.Value);

            var recorded = new RecordedRequest(request.Method.Method, request.RequestUri!, headers, body);
            Recorded.Add(recorded);

            Stub stub = Handler?.Invoke(recorded) ?? new Stub { Status = 500, Body = "no handler installed"u8.ToArray() };
            return new HttpResponseMessage((HttpStatusCode)stub.Status)
            {
                Content = new ByteArrayContent(stub.Body),
            };
        }
    }

    private readonly MockHttpMessageHandler _handler = new();
    private readonly CaptureApiClient _client;
    private readonly string _tempDir;

    public CaptureApiClientTests()
    {
        _client = new CaptureApiClient(
            new Uri("https://crm.example.com"),
            "agbcap_deadbeef",
            _handler);
        _tempDir = Path.Combine(Path.GetTempPath(), $"agb-client-tests-{Guid.NewGuid()}");
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { /* ignore */ }
    }

    private string WriteChunkFile(int seq, int pcmBytes = 640)
    {
        string path = Path.Combine(_tempDir, ChunkSpooler.ChunkFileName(seq));
        var pcm = new byte[pcmBytes];
        Array.Fill(pcm, (byte)(seq + 1));
        File.WriteAllBytes(path, WavCodec.Wrap(pcm));
        return path;
    }

    // ------------------------------------------------------------------- ping

    [Fact]
    public async Task PingSendsAuthAndProtocolHeaders()
    {
        _handler.Handler = _ => new Stub
        {
            Status = 200,
            Body = """{"ok":true,"workspaceId":"ws1","userId":"u1","retentionDays":30}"""u8.ToArray(),
        };
        var pong = await _client.PingAsync();
        Assert.True(pong.Ok);
        Assert.Equal("ws1", pong.WorkspaceId);
        Assert.Equal("u1", pong.UserId);
        Assert.Equal(30, pong.RetentionDays);

        var request = _handler.Recorded[0];
        Assert.Equal("GET", request.Method);
        Assert.Equal("/api/capture/ping", request.Url.AbsolutePath);
        Assert.Equal("Bearer agbcap_deadbeef", request.Headers["Authorization"]);
        Assert.Equal("1", request.Headers["X-Capture-Protocol"]);
    }

    [Fact]
    public async Task Ping401MapsToUnauthorized()
    {
        _handler.Handler = _ => new Stub { Status = 401 };
        var ex = await Assert.ThrowsAsync<CaptureApiException>(() => _client.PingAsync());
        Assert.Equal(CaptureApiErrorKind.Unauthorized, ex.Kind);
    }

    // -------------------------------------------------------------- createSession

    [Fact]
    public async Task CreateSessionBodyMatchesProtocol()
    {
        _handler.Handler = _ => new Stub { Status = 201, Body = """{"sessionId":"sess-42"}"""u8.ToArray() };
        string sessionId = await _client.CreateSessionAsync(new SessionMeta(DateTimeOffset.UtcNow, "WhatsApp"));
        Assert.Equal("sess-42", sessionId);

        var request = _handler.Recorded[0];
        Assert.Equal("POST", request.Method);
        Assert.Equal("/api/capture/sessions", request.Url.AbsolutePath);

        using var doc = JsonDocument.Parse(request.Body!);
        var root = doc.RootElement;
        Assert.Equal(16_000, root.GetProperty("sampleRate").GetInt32());
        Assert.Equal(2, root.GetProperty("channels").GetInt32());
        Assert.Equal("wav-pcm16", root.GetProperty("format").GetString());
        Assert.Equal(AudioConstants.HelperVersion, root.GetProperty("helperVersion").GetString());
        Assert.Equal("WhatsApp", root.GetProperty("sourceApp").GetString());
        Assert.Equal(JsonValueKind.String, root.GetProperty("startedAt").ValueKind);
    }

    [Fact]
    public async Task CreateSessionEncodesNullSourceApp()
    {
        _handler.Handler = _ => new Stub { Status = 201, Body = """{"sessionId":"s"}"""u8.ToArray() };
        await _client.CreateSessionAsync(new SessionMeta(DateTimeOffset.UtcNow, null));

        using var doc = JsonDocument.Parse(_handler.Recorded[0].Body!);
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("sourceApp").ValueKind);
    }

    // ----------------------------------------------------------------- uploadChunk

    [Fact]
    public async Task UploadChunkPutsWavBodyWithContentType()
    {
        string filePath = WriteChunkFile(seq: 3, pcmBytes: 1_000);
        byte[] expectedBody = File.ReadAllBytes(filePath);

        _handler.Handler = _ => new Stub { Status = 200, Body = """{"ok":true,"bytes":1044}"""u8.ToArray() };
        int bytes = await _client.UploadChunkAsync("sess-1", 3, filePath);
        Assert.Equal(1_044, bytes);

        var request = _handler.Recorded[0];
        Assert.Equal("PUT", request.Method);
        Assert.Equal("/api/capture/sessions/sess-1/chunks/3", request.Url.AbsolutePath);
        Assert.Equal("audio/wav", request.Headers["Content-Type"]);
        Assert.Equal("Bearer agbcap_deadbeef", request.Headers["Authorization"]);
        Assert.Equal(expectedBody, request.Body); // raw body must be the exact WAV bytes
    }

    [Fact]
    public async Task UploadChunk413MapsToPayloadTooLarge()
    {
        string filePath = WriteChunkFile(seq: 0);
        _handler.Handler = _ => new Stub { Status = 413 };
        var ex = await Assert.ThrowsAsync<CaptureApiException>(
            () => _client.UploadChunkAsync("s", 0, filePath));
        Assert.Equal(CaptureApiErrorKind.PayloadTooLarge, ex.Kind);
    }

    // ----------------------------------------------------- finalize + 409 recovery

    [Fact]
    public async Task Finalize409ThrowsMissingChunks()
    {
        _handler.Handler = _ => new Stub { Status = 409, Body = """{"missing":[1,3]}"""u8.ToArray() };
        var ex = await Assert.ThrowsAsync<CaptureApiException>(
            () => _client.FinalizeAsync("s", new FinalizeBody(DateTimeOffset.UtcNow, 90, 4, false)));
        Assert.Equal(CaptureApiErrorKind.MissingChunks, ex.Kind);
        Assert.Equal(new[] { 1, 3 }, ex.MissingSeqs);
    }

    [Fact]
    public async Task FinalizeRecoveringReuploadsMissingThenRetries()
    {
        string chunk1 = WriteChunkFile(seq: 1);
        int finalizeCalls = 0;
        var gate = new object();

        _handler.Handler = request =>
        {
            if (request.Url.AbsolutePath.EndsWith("/finalize", StringComparison.Ordinal))
            {
                int n;
                lock (gate) { n = ++finalizeCalls; }
                if (n == 1)
                    return new Stub { Status = 409, Body = """{"missing":[1]}"""u8.ToArray() };
                return new Stub
                {
                    Status = 200,
                    Body = """{"ok":true,"recordingId":"rec-9","title":"Test call","brief":"b","actionItemCount":2,"contact":null,"suspectFlags":[]}"""u8.ToArray(),
                };
            }
            return new Stub { Status = 200, Body = """{"ok":true,"bytes":1}"""u8.ToArray() };
        };

        var result = await _client.FinalizeRecoveringAsync(
            "sess-1",
            new FinalizeBody(DateTimeOffset.UtcNow, 60, 2, false),
            chunkFilePath: seq => seq == 1 ? chunk1 : null);

        Assert.True(result.Ok);
        Assert.Equal("rec-9", result.RecordingId);
        Assert.Equal("Test call", result.Title);
        Assert.Equal(2, result.ActionItemCount);
        Assert.NotEmpty(result.Raw);

        var paths = _handler.Recorded.Select(r => $"{r.Method} {r.Url.AbsolutePath}").ToArray();
        Assert.Equal(new[]
        {
            "POST /api/capture/sessions/sess-1/finalize",
            "PUT /api/capture/sessions/sess-1/chunks/1",
            "POST /api/capture/sessions/sess-1/finalize",
        }, paths); // 409 → re-upload missing seq → retry finalize
    }

    [Fact]
    public async Task FinalizeRecoveringGivesUpWhenChunkFileMissing()
    {
        _handler.Handler = request =>
            request.Url.AbsolutePath.EndsWith("/finalize", StringComparison.Ordinal)
                ? new Stub { Status = 409, Body = """{"missing":[7]}"""u8.ToArray() }
                : new Stub { Status = 200 };

        var ex = await Assert.ThrowsAsync<CaptureApiException>(
            () => _client.FinalizeRecoveringAsync(
                "s",
                new FinalizeBody(DateTimeOffset.UtcNow, 10, 8, false),
                chunkFilePath: _ => null));
        Assert.Equal(CaptureApiErrorKind.MissingChunks, ex.Kind);
        Assert.Equal(new[] { 7 }, ex.MissingSeqs);
    }

    // ----------------------------------------------------------------- abandon

    [Fact]
    public async Task AbandonSendsDelete()
    {
        _handler.Handler = _ => new Stub { Status = 200, Body = """{"ok":true}"""u8.ToArray() };
        await _client.AbandonAsync("sess-1");
        var request = _handler.Recorded[0];
        Assert.Equal("DELETE", request.Method);
        Assert.Equal("/api/capture/sessions/sess-1", request.Url.AbsolutePath);
    }

    // ----------------------------------------------------------------- backoff

    [Fact]
    public void ExponentialBackoffSequenceCappedAt60()
    {
        var backoff = new ExponentialBackoff();
        var delays = new List<double>();
        for (int i = 0; i < 9; i++) delays.Add(backoff.NextDelay().TotalSeconds);
        Assert.Equal(new double[] { 1, 2, 4, 8, 16, 32, 60, 60, 60 }, delays);

        backoff.Reset();
        Assert.Equal(1, backoff.NextDelay().TotalSeconds);
    }
}
