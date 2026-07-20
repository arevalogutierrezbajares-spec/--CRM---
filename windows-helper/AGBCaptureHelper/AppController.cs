using System.Diagnostics;
using System.Drawing;
using System.Runtime.Versioning;
using System.Text;
using System.Windows.Forms;
using AGB.CaptureCore;
using AGB.CaptureHelper.Audio;
using AGB.CaptureHelper.Platform;
using AGB.CaptureHelper.UI;

namespace AGB.CaptureHelper;

/// <summary>
/// Tray shell. Owns the state machine and wires detector → prompt → engine →
/// spooler → upload worker. All UI mutation happens on the WinForms UI thread.
/// The recording state is always visible in the tray (FR-CALL-RET-3,
/// FR-CALL-OPS-1). Windows analogue of <c>AppDelegate.swift</c>.
///
/// End conditions mirror the macOS fix, all configurable via
/// <see cref="EndConditions"/>: stop on mic-release, on sustained both-channel
/// silence (default 90 s), and a hard max-duration cap (default 2 h).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class AppController : IDisposable
{
    /// <summary>Tunable auto-stop conditions (see class summary).</summary>
    public sealed class EndConditions
    {
        public bool StopOnMicRelease { get; init; } = true;
        public TimeSpan SilenceTimeout { get; init; } = TimeSpan.FromSeconds(90);
        public TimeSpan MaxDuration { get; init; } = TimeSpan.FromHours(2);
        public bool SilenceTimeoutEnabled { get; init; } = true;
    }

    private enum HelperState { Idle, Detected, Recording, Paused, Uploading, Error }

    // ---------------------------------------------------------------- State

    private HelperState _state = HelperState.Idle;
    private string? _lastError;
    private string? _lastResult;
    private bool _uploaderBusy;
    private HelperConfig _config = HelperConfig.Effective();
    private readonly EndConditions _end;

    private HelperState State
    {
        get => _state;
        set { _state = value; RefreshUi(); }
    }

    // ---------------------------------------------------------------- Components

    private readonly NotifyIcon _tray = new();
    private readonly ContextMenuStrip _menu = new();
    private ToolStripMenuItem _stateItem = null!;
    private ToolStripMenuItem _startItem = null!;
    private ToolStripMenuItem _stopItem = null!;
    private ToolStripMenuItem _pauseItem = null!;
    private ToolStripMenuItem _offRecordItem = null!;

    private readonly SpoolStore? _store;
    private UploadQueueWorker? _worker;
    private Task? _workerTask;
    private readonly CancellationTokenSource _workerCts = new();

    private AudioEngine? _engine;
    private ChunkSpooler? _activeSpooler;
    private readonly MicActivityDetector _detector = new();
    private readonly PromptController _prompt = new();
    private GlobalHotKey? _hotKey;
    private string? _detectedSourceApp;

    // End-condition watchdog.
    private System.Windows.Forms.Timer? _watchdog;
    private DateTimeOffset _recordingStartedAt;
    private DateTimeOffset? _silentSince;

    /// <summary>Marshals callbacks from worker/detector/audio threads onto the UI thread.</summary>
    private readonly SynchronizationContext _ui;

    private readonly HelperLog _log = HelperLog.Shared;

    public AppController(EndConditions? end = null)
    {
        _end = end ?? new EndConditions();
        _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

        BuildTray();

        try
        {
            var store = new SpoolStore();
            _store = store;
            // Crash salvage (FR-CALL-OPS-5).
            var adopted = store.AdoptOrphans();
            if (adopted.Count > 0)
                _log.Info($"adopted {adopted.Count} orphaned session(s) from a previous run", category: "app");
            StartWorker(store);
        }
        catch (Exception ex)
        {
            _lastError = $"Spool unavailable: {ex.Message}";
            State = HelperState.Error;
        }

        WireDetectorAndPrompt();
        _hotKey = new GlobalHotKey { OnPressed = HotKeyToggled };
        _hotKey.Register();

        _detector.Arm();
        RefreshUi();
        _log.Info($"AGBCaptureHelper {AudioConstants.HelperVersion} launched", category: "app");
    }

    // ---------------------------------------------------------------- Worker

    private void StartWorker(SpoolStore store)
    {
        // clientProvider runs on the worker task: read config fresh each pass
        // (picks up Configure… saves) but never touch UI here.
        var worker = new UploadQueueWorker(store, () => CaptureApiClient.FromConfig(HelperConfig.Effective()));

        worker.OnStateChange = workerState => Post(() =>
        {
            switch (workerState)
            {
                case UploadQueueWorker.WorkerState.Uploading:
                    _uploaderBusy = true;
                    break;
                case UploadQueueWorker.WorkerState.Idle:
                    _uploaderBusy = false;
                    if (State == HelperState.Uploading) State = HelperState.Idle;
                    if (_lastError?.StartsWith("Upload", StringComparison.Ordinal) == true) _lastError = null;
                    break;
                case UploadQueueWorker.WorkerState.WaitingRetry retry:
                    _uploaderBusy = true;
                    _lastError = $"Upload retrying: {retry.Reason}";
                    break;
            }
            RefreshUi();
        });

        worker.OnSessionFinalized = outcome => Post(() =>
        {
            string title = outcome.Finalize.Title ?? "call";
            string items = outcome.Finalize.ActionItemCount is { } n ? $" — {n} action item(s)" : "";
            _lastResult = $"Filed: {title}{items}";
            if (outcome.Finalize.SuspectFlags is { Count: > 0 } flags)
                _lastResult += $" ⚠ {string.Join(", ", flags)}";
            RefreshUi();
        });

        worker.OnError = message => Post(() => { _lastError = $"Upload: {message}"; });

        _worker = worker;
        _workerTask = Task.Run(() => worker.RunForeverAsync(ct: _workerCts.Token));
    }

    // ------------------------------------------------ Detection → prompt → record

    private void WireDetectorAndPrompt()
    {
        _detector.OnActivity = sourceApp => Post(() => HandleDetection(sourceApp));
        _detector.OnCallLikelyEnded = () => Post(() =>
        {
            if (_end.StopOnMicRelease && State is HelperState.Recording or HelperState.Paused)
            {
                _log.Info("auto-finalizing: call end detected (mic released)", category: "app");
                FinishRecording(autoDetected: true);
            }
        });
        _prompt.OnRecord = () => Post(AffirmRecording);
        _prompt.OnDismiss = timedOut => Post(() => DeclineRecording(timedOut));
    }

    private void HandleDetection(string? sourceApp)
    {
        if (State != HelperState.Idle)
        {
            _detector.Arm();
            return;
        }
        // FR-CALL-TRG-6: never-prompt apps.
        if (sourceApp is { } app &&
            _config.NeverPromptApps.Any(a => string.Equals(a, app, StringComparison.OrdinalIgnoreCase)))
        {
            _log.Info($"mic activity from never-prompt app {app} — ignoring", category: "app");
            _detector.Arm();
            return;
        }

        _detectedSourceApp = sourceApp;
        State = HelperState.Detected;

        // Start pre-roll capture immediately so affirming later loses nothing.
        try
        {
            var engine = new AudioEngine();
            engine.OnError = message => Post(() => HandleEngineError(message));
            _engine = engine;
            engine.StartPreroll();
            _prompt.Show(_detectedSourceApp);
        }
        catch (Exception ex)
        {
            CaptureUnavailable($"Could not start capture: {ex.Message}\n\n{MicPrivacyHint}");
        }
    }

    private void AffirmRecording()
    {
        if (_engine is not { } engine || _store is not { } store || State != HelperState.Detected) return;
        try
        {
            // Backdate startedAt to the first pre-rolled byte.
            DateTimeOffset startedAt = DateTimeOffset.UtcNow.AddSeconds(-engine.PreRollSeconds);
            ChunkSpooler spooler = store.CreateSession(startedAt: startedAt, sourceApp: _detectedSourceApp);
            _activeSpooler = spooler;
            engine.PromoteToRecording(spooler);
            BeginRecordingWatchdog();
            State = HelperState.Recording;
            // Affirmed from detection: a peer app is holding the mic by definition.
            _detector.WatchForCallEnd(peerAlreadyObserved: true);
            _worker?.Kick(); // chunks upload incrementally during the call
            _log.Info($"recording affirmed (source: {_detectedSourceApp ?? "unknown"})", category: "app");
        }
        catch (Exception ex)
        {
            CaptureUnavailable($"Could not create local spool: {ex.Message}");
        }
    }

    private void DeclineRecording(bool timedOut)
    {
        if (State != HelperState.Detected) return;
        _engine?.AbortAndClear();
        _engine?.Dispose();
        _engine = null;
        _detectedSourceApp = null;
        State = HelperState.Idle;
        _log.Info($"prompt {(timedOut ? "timed out" : "declined")} — zero bytes persisted", category: "app");
        _detector.Arm();
    }

    private void CaptureUnavailable(string message)
    {
        _engine?.AbortAndClear();
        _engine?.Dispose();
        _engine = null;
        _prompt.DismissPanel();
        _lastError = message;
        State = HelperState.Error;
        _detector.Arm();
        ShowAlert("Capture unavailable", message);
    }

    private void HandleEngineError(string message)
    {
        _lastError = message;
        if (State is HelperState.Recording or HelperState.Paused)
            ShowAlert("Capture problem mid-call", message);
        RefreshUi();
    }

    // ---------------------------------------------------------------- Manual start/stop

    private void StartRecordingManually()
    {
        switch (State)
        {
            case HelperState.Detected:
                _prompt.DismissPanel();
                AffirmRecording();
                break;
            case HelperState.Idle:
            case HelperState.Uploading:
            case HelperState.Error:
                ManualStart();
                break;
        }
    }

    /// <summary>FR-CALL-TRG-4: manual start, independent of detection.</summary>
    private void ManualStart()
    {
        if (_engine is not null) return;
        if (_store is not { } store)
        {
            ShowAlert("Cannot record", _lastError ?? "Spool unavailable");
            return;
        }
        _detector.Disarm();
        try
        {
            var engine = new AudioEngine();
            engine.OnError = message => Post(() => HandleEngineError(message));
            _engine = engine;
            engine.StartPreroll();
            ChunkSpooler spooler = store.CreateSession(startedAt: DateTimeOffset.UtcNow, sourceApp: null);
            _activeSpooler = spooler;
            engine.PromoteToRecording(spooler);
            BeginRecordingWatchdog();
            State = HelperState.Recording;
            // Manual start carries no evidence that the call is on this machine,
            // so the watch stays inert until a peer app actually captures.
            // Without this, a speakerphone session auto-finalized ~5s in.
            _detector.WatchForCallEnd(peerAlreadyObserved: false, grace: TimeSpan.FromSeconds(15));
            _worker?.Kick();
            _log.Info("manual recording started", category: "app");
        }
        catch (Exception ex)
        {
            CaptureUnavailable($"Could not start capture: {ex.Message}");
        }
    }

    private void FinishRecording(bool autoDetected)
    {
        if (State is not (HelperState.Recording or HelperState.Paused) || _engine is not { } engine) return;
        StopRecordingWatchdog();
        _detector.Disarm();

        SilenceMeter.Report report = engine.StopAndFlush();
        engine.Dispose();
        _engine = null;

        if (_activeSpooler is { } spooler)
        {
            try { spooler.MarkEnded(endedAt: DateTimeOffset.UtcNow, partial: false); }
            catch (Exception ex) { _lastError = $"Could not mark session ended: {ex.Message}"; }

            if (report.AnyChannelNearSilent && report.Frames > 0)
            {
                _log.Warn($"near-silent channel: {report.Summary}", category: "app");
                _lastResult = $"Suspect audio: {report.Summary}";
            }
            _log.Info($"recording ended ({(int)spooler.SpooledSeconds}s, auto={autoDetected}) — {report.Summary}", category: "app");
        }
        _activeSpooler = null;
        _detectedSourceApp = null;
        State = HelperState.Uploading;
        _worker?.Kick();
        _detector.Arm();
    }

    private void PauseResume()
    {
        if (_engine is not { } engine) return;
        if (State == HelperState.Recording) { engine.Pause(); State = HelperState.Paused; }
        else if (State == HelperState.Paused) { engine.Resume(); State = HelperState.Recording; }
    }

    /// <summary>FR-CALL-CAP-8 v1: drop the un-uploaded tail (up to last 5 minutes).</summary>
    private void OffTheRecord()
    {
        if (State is not (HelperState.Recording or HelperState.Paused) || _activeSpooler is not { } spooler) return;
        try
        {
            int dropped = spooler.DiscardUnuploadedTail(TimeSpan.FromMinutes(5));
            int seconds = dropped / AudioConstants.BytesPerSecond;
            _lastResult = $"Off the record: dropped last {seconds}s (un-uploaded tail)";
            _log.Info($"off-the-record: dropped {seconds}s ({dropped} bytes)", category: "app");
            RefreshUi();
        }
        catch (Exception ex)
        {
            _lastError = $"Off-the-record failed: {ex.Message}";
        }
    }

    private void HotKeyToggled() => Post(() =>
    {
        switch (State)
        {
            case HelperState.Recording:
            case HelperState.Paused:
                FinishRecording(autoDetected: false);
                break;
            case HelperState.Detected:
                _prompt.DismissPanel();
                AffirmRecording();
                break;
            default:
                ManualStart();
                break;
        }
    });

    // ---------------------------------------------- End-condition watchdog (silence / cap)

    private void BeginRecordingWatchdog()
    {
        _recordingStartedAt = DateTimeOffset.UtcNow;
        _silentSince = null;
        _watchdog?.Dispose();
        _watchdog = new System.Windows.Forms.Timer { Interval = 1000 };
        _watchdog.Tick += (_, _) => WatchdogTick();
        _watchdog.Start();
    }

    private void StopRecordingWatchdog()
    {
        _watchdog?.Stop();
        _watchdog?.Dispose();
        _watchdog = null;
    }

    private void WatchdogTick()
    {
        if (State is not (HelperState.Recording or HelperState.Paused) || _engine is null) return;

        // Hard max-duration cap.
        if (DateTimeOffset.UtcNow - _recordingStartedAt >= _end.MaxDuration)
        {
            _log.Info($"max-duration cap ({_end.MaxDuration.TotalHours:F1}h) reached — stopping", category: "app");
            _lastResult = "Stopped: maximum recording duration reached";
            FinishRecording(autoDetected: true);
            return;
        }

        // Sustained both-channel silence (only while actively recording, not paused).
        if (_end.SilenceTimeoutEnabled && State == HelperState.Recording)
        {
            SilenceMeter.Report report = _engine.SilenceMeter.GetReport();
            bool bothSilent = report.Frames > 0 && report.LeftNearSilent && report.RightNearSilent;
            if (bothSilent)
            {
                _silentSince ??= DateTimeOffset.UtcNow;
                if (DateTimeOffset.UtcNow - _silentSince >= _end.SilenceTimeout)
                {
                    _log.Info($"sustained silence ({_end.SilenceTimeout.TotalSeconds:F0}s) — stopping", category: "app");
                    _lastResult = "Stopped: sustained silence on both channels";
                    FinishRecording(autoDetected: true);
                }
            }
            else
            {
                _silentSince = null;
            }
        }
    }

    // ---------------------------------------------------------------- Menu actions

    private void TestConnection()
    {
        HelperConfig cfg = HelperConfig.Effective();
        _config = cfg;
        CaptureApiClient? client = CaptureApiClient.FromConfig(cfg);
        if (!cfg.IsComplete || client is null)
        {
            ShowAlert("Not configured",
                "Set the CRM URL and capture token first (Configure…). Mint a token in CRM Settings → Call capture.");
            return;
        }

        Task.Run(async () =>
        {
            try
            {
                PingResponse pong = await client.PingAsync();
                Post(() =>
                {
                    _lastError = null;
                    ShowAlert("Connected",
                        $"CRM reachable at {cfg.CrmBaseUrl}\n" +
                        $"Workspace: {pong.WorkspaceId ?? "?"}\n" +
                        $"Audio retention: {(pong.RetentionDays is { } d ? $"{d} days" : "?")}");
                    RefreshUi();
                });
            }
            catch (Exception ex)
            {
                Post(() =>
                {
                    _lastError = ex.Message;
                    ShowAlert("Connection failed", ex.Message);
                    RefreshUi();
                });
            }
        });
    }

    private void Configure()
    {
        HelperConfig current = HelperConfig.Effective();
        using var form = new ConfigureForm(current);
        if (form.ShowDialog() == DialogResult.OK && form.Result is { } updated)
        {
            try
            {
                updated.Save();
                _config = updated;
                _lastError = null;
                _log.Info($"configuration saved (url: {updated.CrmBaseUrl})", category: "app");
            }
            catch (Exception ex)
            {
                ShowAlert("Could not save config", ex.Message);
            }
            RefreshUi();
        }
    }

    /// <summary>FR-CALL-OPS-6: one-click diagnostics bundle to the Desktop.</summary>
    private void Diagnostics()
    {
        string path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            "agb-capture-diagnostics.txt");
        try
        {
            File.WriteAllText(path, BuildDiagnostics(), Encoding.UTF8);
            FilePermissions.RestrictToCurrentUser(path, isDirectory: false);
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
            ShowAlert("Diagnostics written", path);
        }
        catch (Exception ex)
        {
            ShowAlert("Diagnostics failed", $"Could not write {path}: {ex.Message}");
        }
    }

    private string BuildDiagnostics()
    {
        HelperConfig cfg = HelperConfig.Effective();
        string maskedToken = string.IsNullOrEmpty(cfg.Token)
            ? "(not set)"
            : $"{cfg.Token[..Math.Min(10, cfg.Token.Length)]}…({cfg.Token.Length} chars)";

        string spoolSummary = "(spool unavailable)";
        if (_store is { } store)
        {
            var pending = store.PendingSessions();
            spoolSummary = pending.Count == 0
                ? "no pending sessions"
                : string.Join("\n", pending.Select(s =>
                {
                    var m = s.Snapshot;
                    return $"- {m.SessionLocalId}: started {m.StartedAt}, written {m.SeqsWritten.Count}, " +
                           $"uploaded {m.SeqsUploaded.Count}, ended {m.EndedAt ?? "no"}, partial {m.Partial}, server {m.ServerSessionId ?? "-"}";
                }));
        }

        string outcomes = string.Join("\n", (_worker?.RecentOutcomes ?? Array.Empty<UploadQueueWorker.Outcome>())
            .TakeLast(5)
            .Select(o => $"- {Iso8601.String(o.At)} {o.LocalId} → {o.Finalize.RecordingId ?? "?"} {o.Finalize.Title ?? ""}"));

        return $"""
        AGB Capture Helper diagnostics — {Iso8601.String(DateTimeOffset.UtcNow)}
        Helper version: {AudioConstants.HelperVersion} (protocol {AudioConstants.ProtocolVersion})
        OS: {Environment.OSVersion}
        Autostart: {(Autostart.IsEnabled() ? "enabled" : "disabled")}

        == State ==
        {State}
        Last error: {_lastError ?? "none"}
        Last result: {_lastResult ?? "none"}
        Uploader busy: {_uploaderBusy}

        == End conditions ==
        Stop on mic release: {_end.StopOnMicRelease}
        Silence timeout: {(_end.SilenceTimeoutEnabled ? $"{_end.SilenceTimeout.TotalSeconds:F0}s" : "disabled")}
        Max duration: {_end.MaxDuration.TotalHours:F1}h

        == Config ==
        CRM URL: {(string.IsNullOrEmpty(cfg.CrmBaseUrl) ? "(not set)" : cfg.CrmBaseUrl)}
        Token: {maskedToken}
        Never-prompt apps: {(cfg.NeverPromptApps.Count == 0 ? "(none)" : string.Join(", ", cfg.NeverPromptApps))}

        == Spool ==
        {spoolSummary}

        == Recent upload results ==
        {(string.IsNullOrEmpty(outcomes) ? "(none this run)" : outcomes)}
        Worker last error: {_worker?.LastError ?? "none"}

        == Log tail ==
        {_log.Tail(200)}
        """;
    }

    private void Quit() => Application.Exit();

    // ---------------------------------------------------------------- Tray / menu

    private void BuildTray()
    {
        _stateItem = new ToolStripMenuItem("State: …") { Enabled = false };
        _menu.Items.Add(_stateItem);
        _menu.Items.Add(new ToolStripSeparator());

        _startItem = new ToolStripMenuItem("Start Recording", null, (_, _) => StartRecordingManually());
        _stopItem = new ToolStripMenuItem("Stop Recording", null, (_, _) => FinishRecording(autoDetected: false));
        _pauseItem = new ToolStripMenuItem("Pause", null, (_, _) => PauseResume());
        _offRecordItem = new ToolStripMenuItem("Off the record: discard last 5 min", null, (_, _) => OffTheRecord());
        _menu.Items.Add(_startItem);
        _menu.Items.Add(_stopItem);
        _menu.Items.Add(_pauseItem);
        _menu.Items.Add(_offRecordItem);
        _menu.Items.Add(new ToolStripSeparator());

        _menu.Items.Add(new ToolStripMenuItem("Test Connection", null, (_, _) => TestConnection()));
        _menu.Items.Add(new ToolStripMenuItem("Configure…", null, (_, _) => Configure()));
        _menu.Items.Add(new ToolStripMenuItem("Diagnostics", null, (_, _) => Diagnostics()));
        var autostartItem = new ToolStripMenuItem("Launch at login", null, (_, _) =>
        {
            Autostart.Toggle();
            RefreshUi();
        });
        autostartItem.Name = "autostart";
        _menu.Items.Add(autostartItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(new ToolStripMenuItem("Quit AGB Capture Helper", null, (_, _) => Quit()));

        _tray.ContextMenuStrip = _menu;
        _tray.Visible = true;
        _tray.Text = "AGB Capture Helper";
        RefreshUi();
    }

    private void RefreshUi()
    {
        // Effective display state: an error shows ⚠ unless actively recording;
        // background uploads show ↑ only when otherwise idle.
        HelperState display = State;
        if (State == HelperState.Idle)
        {
            if (_lastError is not null) display = HelperState.Error;
            else if (_uploaderBusy) display = HelperState.Uploading;
        }
        if (State == HelperState.Uploading && !_uploaderBusy)
        {
            State = HelperState.Idle; // setter re-enters RefreshUi
            return;
        }

        (string label, Color color) = display switch
        {
            HelperState.Idle => ("Idle — watching for calls", Color.Gray),
            HelperState.Detected => ("Call detected — waiting for your answer", Color.Goldenrod),
            HelperState.Recording => RecordingLabel(),
            HelperState.Paused => ("Paused", Color.Orange),
            HelperState.Uploading => ("Uploading", Color.SteelBlue),
            HelperState.Error => ("Error", Color.Goldenrod),
            _ => ("…", Color.Gray),
        };

        SetTrayIcon(display, color);
        _tray.Text = Truncate($"AGB Capture Helper — {label}", 60); // NotifyIcon.Text max ~63 chars

        _stateItem.Text = $"State: {label}";

        bool capturing = State is HelperState.Recording or HelperState.Paused;
        _startItem.Enabled = !capturing;
        _stopItem.Enabled = capturing;
        _pauseItem.Enabled = capturing;
        _pauseItem.Text = State == HelperState.Paused ? "Resume" : "Pause";
        _offRecordItem.Enabled = capturing;

        if (_menu.Items["autostart"] is ToolStripMenuItem auto)
            auto.Checked = SafeAutostartEnabled();
    }

    private (string, Color) RecordingLabel()
    {
        var elapsed = DateTimeOffset.UtcNow - _recordingStartedAt;
        return ($"Recording ({(int)elapsed.TotalMinutes:D2}:{elapsed.Seconds:D2})", Color.Red);
    }

    private static bool SafeAutostartEnabled()
    {
        try { return Autostart.IsEnabled(); } catch { return false; }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr handle);

    private Icon? _currentIcon;
    private IntPtr _currentIconHandle;

    /// <summary>
    /// Render a tiny colored glyph as the tray icon (no external assets needed)
    /// and swap it in, destroying the previous HICON so a long-running tray app
    /// doesn't leak GDI handles on every state change.
    /// </summary>
    private void SetTrayIcon(HelperState state, Color color)
    {
        string glyph = state switch
        {
            HelperState.Idle => "○",
            HelperState.Detected => "?",
            HelperState.Recording => "●",
            HelperState.Paused => "‖",
            HelperState.Uploading => "↑",
            HelperState.Error => "⚠",
            _ => "○",
        };

        using var bmp = new Bitmap(32, 32);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.Transparent);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
            using var font = new Font("Segoe UI Symbol", 20, FontStyle.Bold, GraphicsUnit.Pixel);
            using var brush = new SolidBrush(color);
            g.DrawString(glyph, font, brush, new RectangleF(-2, 0, 36, 36));
        }

        IntPtr handle = bmp.GetHicon();
        Icon icon = Icon.FromHandle(handle);
        _tray.Icon = icon;

        // Now safe to release the previous icon + its native handle.
        Icon? oldIcon = _currentIcon;
        IntPtr oldHandle = _currentIconHandle;
        _currentIcon = icon;
        _currentIconHandle = handle;
        oldIcon?.Dispose();
        if (oldHandle != IntPtr.Zero) DestroyIcon(oldHandle);
    }

    // ---------------------------------------------------------------- Plumbing

    private void Post(Action action) => _ui.Post(_ => action(), null);

    private void ShowAlert(string title, string text) =>
        MessageBox.Show(text, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    private static readonly string MicPrivacyHint =
        "If capture won't start, check Windows Settings → Privacy & security → Microphone: " +
        "ensure microphone access and \"Let desktop apps access your microphone\" are on, then relaunch.";

    /// <summary>Called from Program on Application.Exit to wind down cleanly.</summary>
    public void ShutDown()
    {
        // A quit mid-recording ends the session cleanly so the worker (next
        // launch) finalizes it rather than salvaging a "crash".
        if (State is HelperState.Recording or HelperState.Paused)
            FinishRecording(autoDetected: false);
        _worker?.Stop();
        _workerCts.Cancel();
    }

    public void Dispose()
    {
        ShutDown();
        StopRecordingWatchdog();
        _detector.Dispose();
        _engine?.Dispose();
        _hotKey?.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        _menu.Dispose();
        _workerCts.Dispose();
        _currentIcon?.Dispose();
        if (_currentIconHandle != IntPtr.Zero) DestroyIcon(_currentIconHandle);
    }
}
