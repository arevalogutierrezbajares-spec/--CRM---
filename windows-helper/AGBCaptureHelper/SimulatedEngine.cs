using System.Text;
using AGB.CaptureCore;

namespace AGB.CaptureHelper;

/// <summary>
/// Headless E2E driver (<c>--simulate</c>): pushes a pre-recorded 16 kHz stereo
/// PCM16 WAV through the exact production path — ChunkSpooler →
/// UploadQueueWorker → createSession → chunk PUTs → finalize — against the
/// configured CRM, then prints the finalize JSON to stdout.
///
/// 1:1 port of <c>SimulatedEngine.swift</c>. No tray, no WASAPI, no Windows
/// mic-privacy permission needed — so this CAN be run on a real Windows box to
/// prove the protocol end-to-end without an audio stack.
///
///   AGBCaptureHelper --simulate &lt;stereo16k.wav&gt;
///       [--chunk-secs 30] [--source-app SimApp] [--no-detect]
///       [--simulate-crash-after N]   upload N chunks then exit 2, no finalize
///       [--abandon]                  upload 2 chunks then DELETE the session
///
/// Exit codes: 0 success, 1 failure, 2 simulated crash.
/// </summary>
public static class SimulatedEngine
{
    private sealed class Options
    {
        public required string WavPath { get; init; }
        public int ChunkSecs { get; set; } = AudioConstants.ChunkSeconds;
        public string? SourceApp { get; set; }
        public int? CrashAfter { get; set; }
        public bool Abandon { get; set; }
    }

    public static int Run(string[] arguments) => RunAsync(arguments).GetAwaiter().GetResult();

    // ------------------------------------------------------------ Argument parsing

    private static Options? Parse(string[] arguments)
    {
        int simIndex = Array.IndexOf(arguments, "--simulate");
        if (simIndex < 0 || simIndex + 1 >= arguments.Length)
        {
            Fail("usage: AGBCaptureHelper --simulate <stereo16k.wav> [--chunk-secs N] [--source-app Name] [--no-detect] [--simulate-crash-after N] [--abandon]");
            return null;
        }

        string wavPath = arguments[simIndex + 1];
        if (wavPath.StartsWith("--", StringComparison.Ordinal))
        {
            Fail("--simulate requires a WAV path argument");
            return null;
        }

        var options = new Options { WavPath = wavPath };

        string? ValueAfter(string flag)
        {
            int i = Array.IndexOf(arguments, flag);
            return i >= 0 && i + 1 < arguments.Length ? arguments[i + 1] : null;
        }

        if (ValueAfter("--chunk-secs") is { } rawChunk)
        {
            if (!int.TryParse(rawChunk, out int secs) || secs < 1)
            {
                Fail("--chunk-secs must be a positive integer");
                return null;
            }
            options.ChunkSecs = secs;
        }

        options.SourceApp = ValueAfter("--source-app");

        if (ValueAfter("--simulate-crash-after") is { } rawCrash)
        {
            if (!int.TryParse(rawCrash, out int n) || n < 0)
            {
                Fail("--simulate-crash-after must be a non-negative integer");
                return null;
            }
            options.CrashAfter = n;
        }

        options.Abandon = arguments.Contains("--abandon");
        // --no-detect is accepted for parity with real mode; simulate never detects.
        return options;
    }

    // ------------------------------------------------------------------- Main flow

    private static async Task<int> RunAsync(string[] arguments)
    {
        Options? options = Parse(arguments);
        if (options is null) return 1;

        // 1. Config (file + env overrides).
        HelperConfig config = HelperConfig.Effective();
        CaptureApiClient? client = CaptureApiClient.FromConfig(config);
        if (!config.IsComplete || client is null)
        {
            Fail(
                $"CRM not configured. Set crmBaseUrl + token in {HelperPaths.ConfigPath()} " +
                "or set AGB_CRM_URL and AGB_CRM_TOKEN.");
            return 1;
        }
        Info($"CRM: {config.CrmBaseUrl}");

        // 2. Read + validate the source WAV (must match the wire contract).
        byte[] wavData;
        try
        {
            wavData = await File.ReadAllBytesAsync(options.WavPath);
        }
        catch (Exception ex)
        {
            Fail($"cannot read {options.WavPath}: {ex.Message}");
            return 1;
        }

        byte[] pcm;
        try
        {
            WavCodec.Info parsed = WavCodec.Parse(wavData);
            if (parsed.SampleRate != AudioConstants.SampleRate ||
                parsed.Channels != AudioConstants.Channels ||
                parsed.BitsPerSample != AudioConstants.BitsPerSample)
            {
                Fail(
                    $"WAV must be {AudioConstants.SampleRate} Hz, {AudioConstants.Channels}-channel, PCM16 — got " +
                    $"{parsed.SampleRate} Hz / {parsed.Channels} ch / {parsed.BitsPerSample}-bit. " +
                    "Convert with: ffmpeg -i in.wav -ar 16000 -ac 2 -c:a pcm_s16le out.wav");
                return 1;
            }
            pcm = WavCodec.PcmData(wavData, parsed);
            Info($"input: {parsed.DurationSeconds:F1}s of audio ({pcm.Length} PCM bytes)");
        }
        catch (WavCodec.WavException ex)
        {
            Fail($"invalid WAV: {ex.Message}");
            return 1;
        }

        if (pcm.Length == 0)
        {
            Fail("WAV contains no PCM data");
            return 1;
        }

        // 3. Spool exactly like a live call (1 s slices through ChunkSpooler).
        SpoolStore store;
        ChunkSpooler spooler;
        try
        {
            store = new SpoolStore();
            double duration = (double)pcm.Length / AudioConstants.BytesPerSecond;
            DateTimeOffset startedAt = DateTimeOffset.UtcNow.AddSeconds(-duration);
            spooler = store.CreateSession(startedAt: startedAt, sourceApp: options.SourceApp, chunkSeconds: options.ChunkSecs);

            var meter = new SilenceMeter();
            int offset = 0;
            int slice = AudioConstants.BytesPerSecond;
            while (offset < pcm.Length)
            {
                int end = Math.Min(offset + slice, pcm.Length);
                var bytes = pcm.AsSpan(offset, end - offset);
                spooler.Append(bytes);
                meter.FeedInterleaved(bytes);
                offset = end;
            }
            spooler.Flush();
            spooler.MarkEnded(endedAt: DateTimeOffset.UtcNow, partial: false);
            var snap = spooler.Snapshot;
            Info($"spooled {snap.SeqsWritten.Count} chunk(s) → {spooler.Directory}");
            Info($"levels: {meter.GetReport().Summary}");
        }
        catch (Exception ex)
        {
            Fail($"spooling failed: {ex.Message}");
            return 1;
        }

        // 4a. Abandon mode: createSession → 2 chunks → DELETE (FR-CALL-TRG-7 path).
        if (options.Abandon)
            return await RunAbandon(client, store, spooler);

        // 4b. Normal / crash mode: drive the production upload worker.
        return await RunWorker(client, store, spooler, options);
    }

    // ------------------------------------ Worker-driven upload (normal + crash modes)

    private static async Task<int> RunWorker(CaptureApiClient client, SpoolStore store, ChunkSpooler spooler, Options options)
    {
        var worker = new UploadQueueWorker(store, () => client);
        string myLocalId = spooler.LocalId;
        int uploadCount = 0;
        var gate = new object();

        worker.OnChunkUploaded = (localId, seq) =>
        {
            if (localId != myLocalId) return;
            int n;
            lock (gate) { n = ++uploadCount; }
            Info($"uploaded chunk seq={seq} ({n} total)");
            if (options.CrashAfter is { } crashAfter && n >= crashAfter)
            {
                Info($"simulating crash after {crashAfter} chunk(s) — spool left on disk, no finalize");
                Environment.Exit(2);
            }
        };

        UploadQueueWorker.Outcome? finalOutcome = null;
        worker.OnSessionFinalized = outcome =>
        {
            if (outcome.LocalId == myLocalId) finalOutcome = outcome;
        };

        // Edge: --simulate-crash-after 0 — die before any upload.
        if (options.CrashAfter == 0)
        {
            Info("simulating crash before any upload — spool left on disk");
            return 2;
        }

        var backoff = new ExponentialBackoff();
        const int maxPasses = 5;
        string lastErrorMessage = "unknown";
        for (int pass = 1; pass <= maxPasses; pass++)
        {
            UploadQueueWorker.PassResult result = await worker.ProcessPendingOnceAsync();
            if (finalOutcome is { } outcome)
            {
                Console.WriteLine(Encoding.UTF8.GetString(outcome.Finalize.Raw is { Length: > 0 } ? outcome.Finalize.Raw : "{\"ok\":true}"u8.ToArray()));
                Info($"finalized: recordingId={outcome.Finalize.RecordingId ?? "?"} title={outcome.Finalize.Title ?? "?"}");
                return 0;
            }

            var mine = result.Errors.FirstOrDefault(e => e.LocalId == myLocalId);
            if (mine.Message is not null) lastErrorMessage = mine.Message;
            else if (result.Errors.Count > 0) lastErrorMessage = result.Errors[^1].Message;
            else if (result.AbortedByNetwork) lastErrorMessage = "network unreachable";

            if (pass < maxPasses)
            {
                TimeSpan delay = backoff.NextDelay();
                Info($"pass {pass} incomplete ({lastErrorMessage}); retrying in {(int)delay.TotalSeconds}s");
                await Task.Delay(delay);
            }
        }

        Fail($"did not finalize after {maxPasses} passes: {lastErrorMessage}. " +
             $"Spool kept at {spooler.Directory} — the tray helper (or a re-run) will retry it.");
        return 1;
    }

    // ------------------------------------------------------------- Abandon mode

    private static async Task<int> RunAbandon(CaptureApiClient client, SpoolStore store, ChunkSpooler spooler)
    {
        try
        {
            var snap = spooler.Snapshot;
            string sessionId = await client.CreateSessionAsync(new SessionMeta(snap));
            spooler.SetServerSessionId(sessionId);
            Info($"server session {sessionId}");

            foreach (int seq in snap.SeqsWritten.OrderBy(s => s).Take(2))
            {
                await client.UploadChunkAsync(sessionId, seq, spooler.ChunkPath(seq));
                spooler.MarkUploaded(seq);
                Info($"uploaded chunk seq={seq}");
            }

            await client.AbandonAsync(sessionId);
            store.DeleteSession(spooler);
            Console.WriteLine($"{{\"ok\":true,\"abandoned\":\"{sessionId}\"}}");
            Info("session abandoned; server chunks deleted; local spool removed");
            return 0;
        }
        catch (Exception ex)
        {
            Fail($"abandon flow failed: {ex.Message}. Local spool kept at {spooler.Directory}");
            return 1;
        }
    }

    // ------------------------------------------------------------------- Helpers

    private static void Info(string message) => Console.Error.WriteLine($"[simulate] {message}");
    private static void Fail(string message) => Console.Error.WriteLine($"[simulate] ERROR: {message}");
}
