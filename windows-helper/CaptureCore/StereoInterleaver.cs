using System.Buffers.Binary;

namespace AGB.CaptureCore;

/// <summary>
/// Merges two mono Int16 16 kHz streams — mic (L) and system audio (R) — into
/// interleaved stereo frames on a wall-clock sample clock (FR-CALL-CAP-3).
///
/// Each side queues bytes as its capture callback delivers them. <see cref="Pump"/>
/// emits exactly the number of frames the elapsed time dictates (minus a small
/// jitter cushion); a side with no queued data for that span is filled with
/// silence so the two channels stay time-aligned even when one source stalls
/// (e.g. WASAPI restarting across an output-device switch, FR-CALL-CAP-5).
///
/// 1:1 port of <c>StereoInterleaver.swift</c>. The Swift used <c>Data.removeFirst</c>;
/// here each side is a <see cref="MonoQueue"/> (a byte FIFO with O(1) amortized
/// dequeue) to keep the same semantics without per-frame array shifting.
/// </summary>
public sealed class StereoInterleaver
{
    private readonly object _lock = new();
    private readonly MonoQueue _micQueue = new();
    private readonly MonoQueue _sysQueue = new();
    private double? _startTime;
    private long _framesEmitted;

    public int SampleRate { get; }
    /// <summary>Frames held back to absorb delivery jitter before declaring a side silent.</summary>
    public int CushionFrames { get; }
    /// <summary>Per-side queue bound; overflow drops the *oldest* bytes (clock drift guard).</summary>
    public int MaxQueueBytes { get; }

    public StereoInterleaver(
        int sampleRate = AudioConstants.SampleRate,
        double cushionSeconds = 0.5,
        double maxQueueSeconds = 5.0)
    {
        SampleRate = sampleRate;
        CushionFrames = (int)(cushionSeconds * sampleRate);
        MaxQueueBytes = (int)(maxQueueSeconds * sampleRate) * 2;
    }

    public void AppendMic(ReadOnlySpan<byte> monoPcm16)
    {
        lock (_lock)
        {
            _micQueue.Enqueue(monoPcm16);
            Trim(_micQueue);
        }
    }

    public void AppendSystem(ReadOnlySpan<byte> monoPcm16)
    {
        lock (_lock)
        {
            _sysQueue.Enqueue(monoPcm16);
            Trim(_sysQueue);
        }
    }

    /// <summary>
    /// Emit interleaved stereo bytes for the wall-clock time elapsed since the
    /// first pump, minus the jitter cushion. Returns empty when no frames are
    /// due yet. <paramref name="now"/> is a monotonic seconds clock.
    /// </summary>
    public byte[] Pump(double now)
    {
        lock (_lock)
        {
            _startTime ??= now;
            double start = _startTime.Value;

            long target = (long)((now - start) * SampleRate) - CushionFrames;
            long frames = target - _framesEmitted;
            return frames > 0 ? Emit((int)frames) : Array.Empty<byte>();
        }
    }

    /// <summary>
    /// Emit everything still queued (call end): output length = the longer side,
    /// the shorter side padded with silence.
    /// </summary>
    public byte[] FlushRemaining()
    {
        lock (_lock)
        {
            int frames = Math.Max(_micQueue.Count, _sysQueue.Count) / 2;
            return frames > 0 ? Emit(frames) : Array.Empty<byte>();
        }
    }

    /// <summary>Reset the clock and drop queued audio (new session / after decline).</summary>
    public void Reset()
    {
        lock (_lock)
        {
            _micQueue.Clear();
            _sysQueue.Clear();
            _startTime = null;
            _framesEmitted = 0;
        }
    }

    // ------------------------------------------------- Internals (lock held)

    private byte[] Emit(int frames)
    {
        int bytesPerSide = frames * 2;
        var output = new byte[frames * 4];
        var outSpan = output.AsSpan();

        ReadOnlySpan<byte> mic = _micQueue.PeekSpan();
        ReadOnlySpan<byte> sys = _sysQueue.PeekSpan();
        int micAvail = mic.Length / 2;
        int sysAvail = sys.Length / 2;

        for (int i = 0; i < frames; i++)
        {
            short left = i < micAvail ? BinaryPrimitives.ReadInt16LittleEndian(mic.Slice(i * 2)) : (short)0;
            short right = i < sysAvail ? BinaryPrimitives.ReadInt16LittleEndian(sys.Slice(i * 2)) : (short)0;
            BinaryPrimitives.WriteInt16LittleEndian(outSpan.Slice(i * 4), left);
            BinaryPrimitives.WriteInt16LittleEndian(outSpan.Slice(i * 4 + 2), right);
        }

        _micQueue.Discard(Math.Min(bytesPerSide, _micQueue.Count));
        _sysQueue.Discard(Math.Min(bytesPerSide, _sysQueue.Count));
        _framesEmitted += frames;
        return output;
    }

    private void Trim(MonoQueue queue)
    {
        int overflow = queue.Count - MaxQueueBytes;
        if (overflow > 0) queue.Discard(overflow);
    }

    /// <summary>
    /// A byte FIFO backed by a growable array with a read cursor. Mirrors the
    /// Swift <c>Data</c> append/removeFirst usage with amortized O(1) dequeue and
    /// zero-copy <see cref="PeekSpan"/> for the interleave loop.
    /// </summary>
    private sealed class MonoQueue
    {
        private byte[] _buffer = new byte[4096];
        private int _start; // read cursor
        private int _end;   // write cursor (exclusive)

        public int Count => _end - _start;

        public void Enqueue(ReadOnlySpan<byte> data)
        {
            if (data.IsEmpty) return;
            EnsureCapacity(data.Length);
            data.CopyTo(_buffer.AsSpan(_end));
            _end += data.Length;
        }

        /// <summary>Live view of the currently-queued bytes (no copy).</summary>
        public ReadOnlySpan<byte> PeekSpan() => _buffer.AsSpan(_start, Count);

        public void Discard(int count)
        {
            if (count <= 0) return;
            _start += Math.Min(count, Count);
            if (_start == _end) { _start = 0; _end = 0; } // fully drained — reset cursors
        }

        public void Clear() { _start = 0; _end = 0; }

        private void EnsureCapacity(int additional)
        {
            // Compact first: slide live bytes to the front when there is dead
            // space at the head, before growing the backing array.
            if (_end + additional > _buffer.Length)
            {
                int live = Count;
                if (_start > 0 && live + additional <= _buffer.Length)
                {
                    _buffer.AsSpan(_start, live).CopyTo(_buffer);
                    _start = 0;
                    _end = live;
                    return;
                }
                int newSize = Math.Max(_buffer.Length * 2, live + additional);
                var grown = new byte[newSize];
                _buffer.AsSpan(_start, live).CopyTo(grown);
                _buffer = grown;
                _start = 0;
                _end = live;
            }
        }
    }
}
