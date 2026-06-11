using System.Diagnostics;
using AGB.CaptureCore;
using NAudio.CoreAudioApi;

namespace AGB.CaptureHelper.Audio;

/// <summary>
/// Detects "some app started using the microphone" (FR-CALL-TRG-1) by polling
/// the default *capture* device's audio sessions
/// (<c>IAudioSessionManager2</c> → <see cref="AudioSessionControl"/> states):
/// when any session belonging to a process other than ourselves is
/// <see cref="AudioSessionState.AudioSessionStateActive"/>, the mic is in use.
/// Activity must persist for 2 s (debounce) before firing.
///
/// This is the Windows analogue of the macOS <c>MicActivityDetector.swift</c>,
/// which used CoreAudio process objects + <c>kAudioDevicePropertyDeviceIsRunningSomewhere</c>.
/// Windows exposes per-process capture state directly via WASAPI sessions, so
/// (unlike macOS &lt;14.4) the triggering app name and call-end detection work on
/// every supported Windows version.
///
/// The detector must only be armed while the helper is idle: our own
/// <see cref="AudioEngine"/> opens a capture session during preroll/recording,
/// which would otherwise re-trigger detection — so we always exclude our own PID
/// and the caller disarms before starting the engine.
/// </summary>
public sealed class MicActivityDetector : IDisposable
{
    /// <summary>Fired (on a thread-pool thread) when mic activity is detected while armed.</summary>
    public Action<string?>? OnActivity { get; set; }
    /// <summary>Fired when, during a recording watch, no *other* process has used the mic for the quiet window (FR-CALL-TRG-5).</summary>
    public Action? OnCallLikelyEnded { get; set; }

    private readonly object _gate = new();
    private System.Threading.Timer? _pollTimer;
    private bool _armed;
    private bool _watchingForEnd;

    private static readonly TimeSpan DebounceSeconds = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan EndQuietSeconds = TimeSpan.FromSeconds(5);
    private DateTimeOffset? _runningSince;
    private DateTimeOffset? _quietSince;

    private readonly int _ownPid = Environment.ProcessId;

    // ---------------------------------------------------------------- Arm / disarm

    /// <summary>Arm idle-state detection. Call only when the helper is NOT capturing.</summary>
    public void Arm()
    {
        lock (_gate)
        {
            if (_armed) return;
            _armed = true;
            _watchingForEnd = false;
            _runningSince = null;
            StartPolling();
        }
        HelperLog.Shared.Info("detector armed", category: "detect");
    }

    public void Disarm()
    {
        lock (_gate)
        {
            _armed = false;
            _watchingForEnd = false;
            StopPolling();
        }
        HelperLog.Shared.Info("detector disarmed", category: "detect");
    }

    /// <summary>
    /// While recording, watch for the *other* app releasing the mic so the
    /// capture can auto-finalize (FR-CALL-TRG-5).
    /// </summary>
    public void WatchForCallEnd()
    {
        lock (_gate)
        {
            _armed = false;
            _watchingForEnd = true;
            _quietSince = null;
            StartPolling();
        }
        HelperLog.Shared.Info("watching for call end (capture sessions)", category: "detect");
    }

    // ----------------------------------------------------------- Polling + evaluation

    private void StartPolling()
    {
        _pollTimer ??= new System.Threading.Timer(_ => Evaluate(), null,
            dueTime: TimeSpan.FromSeconds(1), period: TimeSpan.FromSeconds(1));
    }

    private void StopPolling()
    {
        _pollTimer?.Dispose();
        _pollTimer = null;
    }

    private void Evaluate()
    {
        bool armed, watching;
        lock (_gate) { armed = _armed; watching = _watchingForEnd; }
        try
        {
            if (armed) EvaluateDetection();
            else if (watching) EvaluateCallEnd();
        }
        catch (Exception ex)
        {
            // Polling must never crash the helper; surface once and keep going.
            HelperLog.Shared.Warn($"detector poll error: {ex.Message}", category: "detect");
        }
    }

    private void EvaluateDetection()
    {
        var others = ProcessesCapturing(excludingPid: _ownPid);
        if (others.Count > 0)
        {
            _runningSince ??= DateTimeOffset.UtcNow;
            if (DateTimeOffset.UtcNow - _runningSince >= DebounceSeconds)
            {
                lock (_gate)
                {
                    _armed = false; // one-shot until re-armed
                    StopPolling();
                }
                string? app = ResolveAppName(others[0]);
                HelperLog.Shared.Info($"mic activity detected (source: {app ?? "unknown"})", category: "detect");
                OnActivity?.Invoke(app);
            }
        }
        else
        {
            _runningSince = null;
        }
    }

    private void EvaluateCallEnd()
    {
        var others = ProcessesCapturing(excludingPid: _ownPid);
        if (others.Count == 0)
        {
            _quietSince ??= DateTimeOffset.UtcNow;
            if (DateTimeOffset.UtcNow - _quietSince >= EndQuietSeconds)
            {
                lock (_gate)
                {
                    _watchingForEnd = false;
                    StopPolling();
                }
                HelperLog.Shared.Info(
                    $"no other process using mic for {(int)EndQuietSeconds.TotalSeconds}s — call likely ended",
                    category: "detect");
                OnCallLikelyEnded?.Invoke();
            }
        }
        else
        {
            _quietSince = null;
        }
    }

    // ----------------------------------------------- Capture-session enumeration

    /// <summary>
    /// PIDs of processes (other than <paramref name="excludingPid"/>) with an
    /// active capture session on the default communications capture device.
    /// </summary>
    private static List<uint> ProcessesCapturing(int excludingPid)
    {
        var pids = new List<uint>();
        using var enumerator = new MMDeviceEnumerator();
        MMDevice device;
        try
        {
            device = enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
        }
        catch
        {
            return pids; // no capture device → nothing is recording
        }

        using (device)
        {
            SessionCollection sessions = device.AudioSessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                AudioSessionControl session = sessions[i];
                if (session.State != AudioSessionState.AudioSessionStateActive) continue;
                uint pid = session.GetProcessID;
                if (pid != 0 && pid != (uint)excludingPid)
                    pids.Add(pid);
            }
        }
        return pids;
    }

    private static string? ResolveAppName(uint pid)
    {
        try
        {
            using Process process = Process.GetProcessById((int)pid);
            // ProcessName is the executable base name (e.g. "WhatsApp", "Zoom").
            return string.IsNullOrEmpty(process.ProcessName) ? null : process.ProcessName;
        }
        catch
        {
            return null;
        }
    }

    public void Dispose() => StopPolling();
}
