using System.Buffers.Binary;
using System.Text;

namespace AGB.CaptureCore;

/// <summary>
/// Canonical 44-byte PCM WAV header building + parsing (pure functions).
///
/// The wire contract (CALL-CAPTURE-PROTOCOL.md) requires every chunk to be a
/// standalone valid WAV file with a *canonical* 44-byte header (PCM fmt chunk,
/// no extra chunks) — the server strips exactly 44 bytes and concatenates PCM.
///
/// 1:1 port of <c>WavCodec.swift</c>. Building is strictly canonical; parsing is
/// tolerant of extra chunks (LIST/INFO) so simulate mode can read ffmpeg WAVs.
/// </summary>
public static class WavCodec
{
    /// <summary>Parsed view of a WAV's format + PCM data location.</summary>
    public readonly record struct Info(
        int SampleRate,
        int Channels,
        int BitsPerSample,
        int DataOffset,
        int DataLength)
    {
        public int FrameCount
        {
            get
            {
                int blockAlign = Channels * (BitsPerSample / 8);
                return blockAlign > 0 ? DataLength / blockAlign : 0;
            }
        }

        public double DurationSeconds =>
            SampleRate > 0 ? (double)FrameCount / SampleRate : 0;
    }

    public enum WavErrorKind
    {
        TooShort,
        NotRiff,
        NotWave,
        MissingFmtChunk,
        MissingDataChunk,
        NotPcm16,
        Malformed,
    }

    /// <summary>Mirrors Swift's <c>WavCodec.WavError</c> enum with associated data.</summary>
    public sealed class WavException : Exception
    {
        public WavErrorKind Kind { get; }
        public int FormatTag { get; }
        public int Bits { get; }

        public WavException(WavErrorKind kind, string message, int formatTag = 0, int bits = 0)
            : base(message)
        {
            Kind = kind;
            FormatTag = formatTag;
            Bits = bits;
        }

        public static WavException TooShort() =>
            new(WavErrorKind.TooShort, "WAV data shorter than a 44-byte header");
        public static WavException NotRiff() =>
            new(WavErrorKind.NotRiff, "Missing RIFF magic");
        public static WavException NotWave() =>
            new(WavErrorKind.NotWave, "Missing WAVE magic");
        public static WavException MissingFmt() =>
            new(WavErrorKind.MissingFmtChunk, "No fmt chunk found");
        public static WavException MissingData() =>
            new(WavErrorKind.MissingDataChunk, "No data chunk found");
        public static WavException NotPcm16(int format, int bits) =>
            new(WavErrorKind.NotPcm16, $"Not PCM16 (format tag {format}, {bits} bits)", format, bits);
        public static WavException Malformed(string why) =>
            new(WavErrorKind.Malformed, $"Malformed WAV: {why}");
    }

    // ----------------------------------------------------------------- Building

    /// <summary>Build the canonical 44-byte header for a PCM16 payload of <paramref name="dataBytes"/> bytes.</summary>
    public static byte[] Header(
        int dataBytes,
        int sampleRate = AudioConstants.SampleRate,
        int channels = AudioConstants.Channels,
        int bitsPerSample = AudioConstants.BitsPerSample)
    {
        int byteRate = sampleRate * channels * (bitsPerSample / 8);
        int blockAlign = channels * (bitsPerSample / 8);

        var d = new byte[44];
        var span = d.AsSpan();

        WriteAscii(span, 0, "RIFF");
        // RIFF chunk size = 36 + data, clamped to uint range (Swift UInt32(clamping:)).
        BinaryPrimitives.WriteUInt32LittleEndian(span.Slice(4), ClampToUInt32(36L + dataBytes));
        WriteAscii(span, 8, "WAVE");
        WriteAscii(span, 12, "fmt ");
        BinaryPrimitives.WriteUInt32LittleEndian(span.Slice(16), 16);             // fmt chunk size (PCM)
        BinaryPrimitives.WriteUInt16LittleEndian(span.Slice(20), 1);             // audio format = PCM
        BinaryPrimitives.WriteUInt16LittleEndian(span.Slice(22), (ushort)channels);
        BinaryPrimitives.WriteUInt32LittleEndian(span.Slice(24), (uint)sampleRate);
        BinaryPrimitives.WriteUInt32LittleEndian(span.Slice(28), (uint)byteRate);
        BinaryPrimitives.WriteUInt16LittleEndian(span.Slice(32), (ushort)blockAlign);
        BinaryPrimitives.WriteUInt16LittleEndian(span.Slice(34), (ushort)bitsPerSample);
        WriteAscii(span, 36, "data");
        BinaryPrimitives.WriteUInt32LittleEndian(span.Slice(40), ClampToUInt32(dataBytes));
        return d;
    }

    /// <summary>Wrap raw interleaved PCM16 bytes into a standalone WAV chunk file body.</summary>
    public static byte[] Wrap(
        ReadOnlySpan<byte> pcm,
        int sampleRate = AudioConstants.SampleRate,
        int channels = AudioConstants.Channels,
        int bitsPerSample = AudioConstants.BitsPerSample)
    {
        byte[] header = Header(pcm.Length, sampleRate, channels, bitsPerSample);
        var output = new byte[header.Length + pcm.Length];
        header.CopyTo(output, 0);
        pcm.CopyTo(output.AsSpan(header.Length));
        return output;
    }

    // ----------------------------------------------------------------- Parsing

    /// <summary>
    /// Parse + validate a WAV header. Tolerates non-canonical files (extra
    /// chunks such as LIST/INFO before the data chunk) so simulate mode can read
    /// WAVs from ffmpeg etc. Requires PCM (format tag 1), 16-bit.
    /// </summary>
    public static Info Parse(ReadOnlySpan<byte> data)
    {
        if (data.Length < 44) throw WavException.TooShort();
        if (FourCc(data, 0) != "RIFF") throw WavException.NotRiff();
        if (FourCc(data, 8) != "WAVE") throw WavException.NotWave();

        int offset = 12;
        (int format, int channels, int sampleRate, int bits)? fmt = null;
        (int offset, int length)? dataRange = null;

        while (offset + 8 <= data.Length)
        {
            string id = FourCc(data, offset);
            int size = (int)BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(offset + 4));
            int body = offset + 8;

            if (id == "fmt ")
            {
                if (size < 16 || body + 16 > data.Length)
                    throw WavException.Malformed("fmt chunk truncated");
                fmt = (
                    format: BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(body)),
                    channels: BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(body + 2)),
                    sampleRate: (int)BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(body + 4)),
                    bits: BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(body + 14)));
            }
            else if (id == "data")
            {
                int available = data.Length - body;
                // Some writers leave a 0 / 0xFFFFFFFF placeholder size; clamp.
                int length = (size == 0 || size > available) ? available : size;
                dataRange = (offset: body, length: length);
                break; // data is the payload; stop scanning
            }

            // Chunks are word-aligned (pad byte after odd sizes).
            offset = body + size + (size % 2);
            if (size <= 0 && id != "data")
                throw WavException.Malformed($"zero/negative chunk size for '{id}'");
        }

        if (fmt is not { } f) throw WavException.MissingFmt();
        if (dataRange is not { } dr) throw WavException.MissingData();
        if (f.format != 1 || f.bits != 16) throw WavException.NotPcm16(f.format, f.bits);
        if (f.channels <= 0 || f.sampleRate <= 0)
            throw WavException.Malformed($"channels={f.channels} sampleRate={f.sampleRate}");

        return new Info(f.sampleRate, f.channels, f.bits, dr.offset, dr.length);
    }

    /// <summary>Extract the PCM payload of a parsed WAV.</summary>
    public static byte[] PcmData(ReadOnlySpan<byte> data, Info info)
    {
        int start = info.DataOffset;
        int end = Math.Min(start + info.DataLength, data.Length);
        return start < end ? data.Slice(start, end - start).ToArray() : Array.Empty<byte>();
    }

    // --------------------------------------------------------------- Internals

    private static void WriteAscii(Span<byte> span, int offset, string fourCc)
    {
        for (int i = 0; i < fourCc.Length; i++)
            span[offset + i] = (byte)fourCc[i];
    }

    private static string FourCc(ReadOnlySpan<byte> d, int offset)
    {
        if (offset + 4 > d.Length) return string.Empty;
        return Encoding.ASCII.GetString(d.Slice(offset, 4));
    }

    private static uint ClampToUInt32(long value)
    {
        if (value < 0) return 0;
        if (value > uint.MaxValue) return uint.MaxValue;
        return (uint)value;
    }
}
