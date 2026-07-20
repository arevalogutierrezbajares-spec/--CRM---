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
    /// <summary>
    /// Whether another process has been observed capturing during the current
    /// call-end watch. Gates auto-finalize — see <see cref="EvaluateCallEnd"/>.
    /// </summary>
    private bool _sawPeerCapturer;
    private DateTimeOffset? _watchStartedAt;
    private TimeSpan _watchGrace = TimeSpan.Zero;

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
    /// <param name="peerAlreadyObserved">
    /// Whether another process was <em>already</em> seen capturing (true on the
    /// detection path, which only fires because an app took the mic). When
    /// false, this watch cannot end the session until a peer appears and then
    /// leaves — see <see cref="EvaluateCallEnd"/>. Defaults to the safe value:
    /// defaulting to true would make the speakerphone auto-finalize the silent
    /// fallback for every future call site.
    /// </param>
    /// <param name="grace">
    /// Minimum watch age before an end may be declared, so a session can never
    /// auto-finalize in its first seconds.
    /// </param>
    public void WatchForCallEnd(bool peerAlreadyObserved = false, TimeSpan grace = default)
    {
        lock (_gate)
        {
            _armed = false;
            _watchingForEnd = true;
            _quietSince = null;
            _sawPeerCapturer = peerAlreadyObserved;
            _watchStartedAt = DateTimeOffset.UtcNow;
            _watchGrace = grace;
            StartPolling();
        }
        HelperLog.Shared.Info(
            $"watching for call end (capture sessions; peerObserved={peerAlreadyObserved}, grace={(int)grace.TotalSeconds}s)",
            category: "detect");
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
        if (others.Count > 0)
        {
            if (!_sawPeerCapturer)
            {
                _sawPeerCapturer = true;
                HelperLog.Shared.Info("peer capturer observed — call-end watch now live", category: "detect");
            }
            _quietSince = null;
            return;
        }

        // A session where no other process was *ever* seen capturing is not
        // evidence of a call that ended — it is a call that was never on this
        // machine (phone on speakerphone, desk handset, another laptop). Firing
        // here auto-finalized speakerphone sessions ~5s after they started.
        if (!_sawPeerCapturer)
        {
            _quietSince = null;
            return;
        }

        // The quiet timer accumulates during the grace window — grace gates the
        // *firing*, not the measurement. Returning early here instead would
        // serialize the two, so a call that ended at t=8s could not finalize
        // until grace+EndQuiet, well past the FR-CALL-TRG-5 5s budget.
        _quietSince ??= DateTimeOffset.UtcNow;
        bool graceElapsed = _watchStartedAt is null
            || DateTimeOffset.UtcNow - _watchStartedAt.Value >= _watchGrace;
        if (graceElapsed && DateTimeOffset.UtcNow - _quietSince >= EndQuietSeconds)
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
