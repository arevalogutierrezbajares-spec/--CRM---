namespace AGB.CaptureCore;

/// <summary>
/// Exponential backoff: 1 s, 2 s, 4 s, … capped at 60 s (FR-CALL-TRX-2).
/// 1:1 port of the Swift <c>ExponentialBackoff</c> struct — a mutable struct in
/// Swift, here a small mutable class so callers share one instance like the
/// reference loop does.
/// </summary>
public sealed class ExponentialBackoff
{
    public double BaseDelaySeconds { get; }
    public double MaxDelaySeconds { get; }
    private int _attempt;

    public ExponentialBackoff(double baseDelaySeconds = 1, double maxDelaySeconds = 60)
    {
        BaseDelaySeconds = baseDelaySeconds;
        MaxDelaySeconds = maxDelaySeconds;
    }

    /// <summary>Delay to wait before the next retry. First call returns the base delay.</summary>
    public TimeSpan NextDelay()
    {
        double delay = Math.Min(BaseDelaySeconds * Math.Pow(2, _attempt), MaxDelaySeconds);
        if (delay < MaxDelaySeconds) _attempt++;
        return TimeSpan.FromSeconds(delay);
    }

    public void Reset() => _attempt = 0;
}
