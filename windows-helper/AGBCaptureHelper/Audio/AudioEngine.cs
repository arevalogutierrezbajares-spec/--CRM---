using System.Diagnostics;
using AGB.CaptureCore;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace AGB.CaptureHelper.Audio;

/// <summary>
/// The capture core: microphone (WASAPI <see cref="WasapiCapture"/> on the
/// default capture device) + system audio (WASAPI
/// <see cref="WasapiLoopbackCapture"/> on the default render endpoint = whatever
/// the user hears, headphones included), both resampled to 16 kHz mono Int16 and
/// interleaved into stereo frames (L = mic, R = system) on a wall-clock sample
/// pump.
///
/// This is the Windows analogue of the macOS <c>AudioEngine.swift</c>:
///   preroll   — interleaved bytes feed the 60 s RingBuffer only (FR-CALL-TRG-3)
///   recording — bytes feed the ChunkSpooler (pre-roll drained in first)
///   paused    — bytes are discarded; no silence padding (FR-CALL-CAP-7)
///
/// TODO (per-process loopback, documented fast-follow): v1 loopback grabs the
/// whole system render mix (every app you hear), which is acceptable per the
/// brief. The targeted version uses ActivateAudioInterfaceAsync with
/// AUDIOCLIENT_ACTIVATION_PARAMS / PROCESS_LOOPBACK (Win10 2004+) to capture only
/// the call app's audio — see README "Per-process loopback".
/// </summary>
public sealed class AudioEngine : IDisposable
{
    public enum Mode { Stopped, Preroll, Recording, Paused }

    /// <summary>Delivered off the audio thread; hop to the UI thread before touching UI.</summary>
    public Action<string>? OnError { get; set; }

    public SilenceMeter SilenceMeter { get; } = new();

    private readonly RingBuffer _ring = new(AudioConstants.PreRollBytes);
    private readonly StereoInterleaver _interleaver = new();
    private readonly object _stateLock = new();

    private WasapiCapture? _micCapture;
    private WasapiLoopbackCapture? _systemCapture;
    private MonoResampler? _micResampler;
    private MonoResampler? _systemResampler;
    private System.Threading.Timer? _pumpTimer;
    private readonly Stopwatch _clock = new();

    private Mode _mode = Mode.Stopped;
    private ChunkSpooler? _spooler;
    private bool _spoolFailureReported;

    public Mode CurrentMode
    {
        get { lock (_stateLock) { return _mode; } }
        private set { lock (_stateLock) { _mode = value; } }
    }

    /// <summary>Seconds of audio currently in the pre-roll ring buffer.</summary>
    public double PreRollSeconds => (double)_ring.Count / AudioConstants.BytesPerSecond;

    // ---------------------------------------------------------------- Lifecycle

    /// <summary>
    /// Start both capture paths in pre-roll mode (detection fired; prompt up).
    /// Audio flows only into the in-memory ring buffer (NFR-CALL-PRIV-2).
    /// </summary>
    public void StartPreroll()
    {
        if (CurrentMode != Mode.Stopped) return;
        SilenceMeter.Reset();
        _interleaver.Reset();
        _ring.Clear();
        _spoolFailureReported = false;
        CurrentMode = Mode.Preroll;

        StartMicCapture();
        StartSystemCapture();
        _clock.Restart();
        StartPump();
        HelperLog.Shared.Info("engine started (preroll)", category: "audio");
    }

    /// <summary>
    /// Founder affirmed (or started manually): drain the pre-roll ring into the
    /// spooler, then feed it directly.
    /// </summary>
    public void PromoteToRecording(ChunkSpooler spooler)
    {
        lock (_stateLock) { _spooler = spooler; }
        byte[] preroll = _ring.DrainAll();
        if (preroll.Length > 0)
        {
            try { spooler.Append(preroll); }
            catch (Exception ex) { ReportSpoolFailure(ex); }
        }
        CurrentMode = Mode.Recording;
        HelperLog.Shared.Info($"recording (pre-roll drained: {preroll.Length} bytes)", category: "audio");
    }

    /// <summary>FR-CALL-CAP-7: stop feeding audio; do not pad silence.</summary>
    public void Pause()
    {
        if (CurrentMode != Mode.Recording) return;
        CurrentMode = Mode.Paused;
        HelperLog.Shared.Info("paused", category: "audio");
    }

    public void Resume()
    {
        if (CurrentMode != Mode.Paused) return;
        CurrentMode = Mode.Recording;
        HelperLog.Shared.Info("resumed", category: "audio");
    }

    /// <summary>
    /// Stop capture, flush remaining audio into the spooler, return the silence
    /// report. The caller marks the manifest ended + kicks the uploader.
    /// </summary>
    public SilenceMeter.Report StopAndFlush()
    {
        ChunkSpooler? current;
        Mode mode;
        lock (_stateLock) { current = _spooler; mode = _mode; }

        // Stop the periodic pump first so no concurrent tick races the final
        // drain (the Swift original did this inside a serial queue.sync).
        _pumpTimer?.Dispose();
        _pumpTimer = null;

        // Final interleaver drain so the tail isn't lost.
        byte[] tail = _interleaver.FlushRemaining();
        if (tail.Length > 0 && mode is Mode.Recording or Mode.Paused)
        {
            SilenceMeter.FeedInterleaved(tail);
            if (mode == Mode.Recording && current is not null)
            {
                try { current.Append(tail); } catch (Exception ex) { ReportSpoolFailure(ex); }
            }
        }

        Teardown();

        if (current is not null)
        {
            try { current.Flush(); } catch (Exception ex) { ReportSpoolFailure(ex); }
        }
        lock (_stateLock) { _spooler = null; }
        HelperLog.Shared.Info("engine stopped + flushed", category: "audio");
        return SilenceMeter.GetReport();
    }

    /// <summary>
    /// Declined / timed-out prompt: tear down and drop the ring buffer.
    /// Zero bytes persisted (FR-CALL-TRG-7, NFR-CALL-PRIV-2).
    /// </summary>
    public void AbortAndClear()
    {
        Teardown();
        _ring.Clear();
        _interleaver.Reset();
        lock (_stateLock) { _spooler = null; }
        HelperLog.Shared.Info("engine aborted; pre-roll cleared (0 bytes persisted)", category: "audio");
    }

    private void Teardown()
    {
        CurrentMode = Mode.Stopped;
        _clock.Stop();

        _pumpTimer?.Dispose();
        _pumpTimer = null;

        StopCapture(ref _micCapture);
        StopCapture(ref _systemCapture);
        _micResampler = null;
        _systemResampler = null;
    }

    private static void StopCapture<T>(ref T? capture) where T : class, IWaveIn
    {
        if (capture is null) return;
        try
        {
            capture.StopRecording();
            capture.Dispose();
        }
        catch
        {
            // Teardown must not throw.
        }
        capture = null;
    }

    // ---------------------------------------- Microphone path (WASAPI → 16k mono → L)

    private void StartMicCapture()
    {
        var enumerator = new MMDeviceEnumerator();
        MMDevice device;
        try
        {
            device = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"No usable microphone input device: {ex.Message}", ex);
        }

        var capture = new WasapiCapture(device) { ShareMode = AudioClientShareMode.Shared };
        _micResampler = new MonoResampler(capture.WaveFormat);
        capture.DataAvailable += (_, e) =>
        {
            if (CurrentMode == Mode.Stopped) return;
            _micResampler!.Push(e.Buffer, 0, e.BytesRecorded);
            byte[] mono = _micResampler.Drain();
            if (mono.Length > 0) _interleaver.AppendMic(mono);
        };
        capture.RecordingStopped += (_, e) => HandleCaptureStopped("microphone", e);
        capture.StartRecording();
        _micCapture = capture;
    }

    // --------------------------------- System audio path (WASAPI loopback → 16k mono → R)

    private void StartSystemCapture()
    {
        // Default render endpoint = what the user is currently hearing, including
        // headphones (NAudio loopback follows the active output device).
        var capture = new WasapiLoopbackCapture();
        _systemResampler = new MonoResampler(capture.WaveFormat);
        capture.DataAvailable += (_, e) =>
        {
            if (CurrentMode == Mode.Stopped) return;
            // Loopback delivers silence frames as 0; WASAPI may also flag silence,
            // but feeding zeros keeps the channels time-aligned, which is correct.
            _systemResampler!.Push(e.Buffer, 0, e.BytesRecorded);
            byte[] mono = _systemResampler.Drain();
            if (mono.Length > 0) _interleaver.AppendSystem(mono);
        };
        capture.RecordingStopped += (_, e) => HandleCaptureStopped("system audio", e);
        capture.StartRecording();
        _systemCapture = capture;
    }

    private void HandleCaptureStopped(string which, StoppedEventArgs e)
    {
        if (CurrentMode == Mode.Stopped) return; // expected teardown
        if (e.Exception is { } ex)
        {
            HelperLog.Shared.Warn($"{which} capture stopped with error: {ex.Message}", category: "audio");
            OnError?.Invoke(
                $"{which} capture failed mid-call: {ex.Message}. " +
                "Audio from one side may be missing. Check the Windows microphone-privacy and device settings.");
        }
    }

    // ----------------------------------------------- Sample pump (100 ms cadence)

    private void StartPump()
    {
        _pumpTimer = new System.Threading.Timer(_ => PumpOnce(), null,
            dueTime: TimeSpan.FromMilliseconds(100), period: TimeSpan.FromMilliseconds(100));
    }

    private void PumpOnce()
    {
        byte[] bytes = _interleaver.Pump(_clock.Elapsed.TotalSeconds);
        if (bytes.Length == 0) return;

        switch (CurrentMode)
        {
            case Mode.Preroll:
                SilenceMeter.FeedInterleaved(bytes);
                _ring.Append(bytes);
                break;
            case Mode.Recording:
                SilenceMeter.FeedInterleaved(bytes);
                ChunkSpooler? current;
                lock (_stateLock) { current = _spooler; }
                if (current is null) return;
                try { current.Append(bytes); }
                catch (Exception ex) { ReportSpoolFailure(ex); }
                break;
            case Mode.Paused:
            case Mode.Stopped:
                break; // discarded — paused intervals are absent, not silent
        }
    }

    private void ReportSpoolFailure(Exception error)
    {
        // FR-CALL-OPS-3: surface within seconds; only alert once per session.
        if (_spoolFailureReported) return;
        _spoolFailureReported = true;
        HelperLog.Shared.Error($"spool write failed: {error.Message}", category: "audio");
        OnError?.Invoke($"Recording is failing to write to disk: {error.Message}");
    }

    public void Dispose() => Teardown();
}
