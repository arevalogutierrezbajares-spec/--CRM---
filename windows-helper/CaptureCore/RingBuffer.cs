namespace AGB.CaptureCore;

/// <summary>
/// Fixed-capacity byte ring buffer used for the 60 s pre-roll (FR-CALL-TRG-3).
///
/// Audio bytes are appended continuously while a detection prompt is pending.
/// - On affirm: <see cref="DrainAll"/> hands the buffered pre-roll to the spooler.
/// - On decline/timeout: <see cref="Clear"/> drops everything — bytes only ever
///   lived in memory, satisfying NFR-CALL-PRIV-2 (zero persisted artifacts).
///
/// Thread-safe: all operations take an internal lock. Appending more bytes than
/// <see cref="Capacity"/> silently discards the oldest bytes (only the most
/// recent <see cref="Capacity"/> bytes are retained).
///
/// 1:1 port of <c>RingBuffer.swift</c>.
/// </summary>
public sealed class RingBuffer
{
    private readonly object _lock = new();
    private readonly byte[] _storage;
    /// <summary>Index of the oldest byte.</summary>
    private int _head;
    /// <summary>Number of valid bytes currently stored.</summary>
    private int _stored;

    public int Capacity { get; }

    public RingBuffer(int capacity = AudioConstants.PreRollBytes)
    {
        if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity), "capacity must be positive");
        Capacity = capacity;
        _storage = new byte[capacity];
    }

    /// <summary>Number of bytes currently buffered.</summary>
    public int Count
    {
        get { lock (_lock) { return _stored; } }
    }

    public bool IsEmpty => Count == 0;

    /// <summary>Append bytes, overwriting the oldest data when the buffer is full.</summary>
    public void Append(ReadOnlySpan<byte> data)
    {
        if (data.IsEmpty) return;
        lock (_lock)
        {
            // If the incoming block alone exceeds capacity, only its tail survives.
            if (data.Length >= Capacity)
            {
                data.Slice(data.Length - Capacity, Capacity).CopyTo(_storage);
                _head = 0;
                _stored = Capacity;
                return;
            }

            int writeIndex = (_head + _stored) % Capacity;
            int offset = 0;
            int total = data.Length;
            while (offset < total)
            {
                int run = Math.Min(total - offset, Capacity - writeIndex);
                data.Slice(offset, run).CopyTo(_storage.AsSpan(writeIndex));
                writeIndex = (writeIndex + run) % Capacity;
                offset += run;
            }

            int overflow = (_stored + data.Length) - Capacity;
            if (overflow > 0)
            {
                _head = (_head + overflow) % Capacity;
                _stored = Capacity;
            }
            else
            {
                _stored += data.Length;
            }
        }
    }

    /// <summary>Remove and return everything buffered, oldest byte first.</summary>
    public byte[] DrainAll()
    {
        lock (_lock)
        {
            if (_stored == 0) return Array.Empty<byte>();

            var output = new byte[_stored];
            int firstRun = Math.Min(_stored, Capacity - _head);
            _storage.AsSpan(_head, firstRun).CopyTo(output);
            if (firstRun < _stored)
                _storage.AsSpan(0, _stored - firstRun).CopyTo(output.AsSpan(firstRun));

            _head = 0;
            _stored = 0;
            return output;
        }
    }

    /// <summary>Drop everything without returning it (declined / timed-out prompt).</summary>
    public void Clear()
    {
        lock (_lock)
        {
            _head = 0;
            _stored = 0;
        }
    }
}
