using System.Buffers.Binary;
using AGB.CaptureCore;
using Xunit;

namespace AGB.CaptureCore.Tests;

/// <summary>Port of <c>WavCodecTests.swift</c> — golden header bytes, roundtrip, rejections.</summary>
public class WavCodecTests
{
    /// <summary>
    /// Golden bytes for the canonical header of a full 30 s chunk
    /// (1 920 000 PCM bytes @ 16 kHz, 2 ch, 16-bit). Identical to the Swift golden.
    /// </summary>
    [Fact]
    public void GoldenHeaderBytes()
    {
        byte[] header = WavCodec.Header(1_920_000);
        byte[] expected =
        {
            0x52, 0x49, 0x46, 0x46,             // "RIFF"
            0x24, 0x4C, 0x1D, 0x00,             // 36 + 1_920_000 = 1_920_036 LE
            0x57, 0x41, 0x56, 0x45,             // "WAVE"
            0x66, 0x6D, 0x74, 0x20,             // "fmt "
            0x10, 0x00, 0x00, 0x00,             // fmt chunk size 16
            0x01, 0x00,                         // PCM = 1
            0x02, 0x00,                         // channels = 2
            0x80, 0x3E, 0x00, 0x00,             // sample rate 16_000
            0x00, 0xFA, 0x00, 0x00,             // byte rate 64_000
            0x04, 0x00,                         // block align 4
            0x10, 0x00,                         // bits 16
            0x64, 0x61, 0x74, 0x61,             // "data"
            0x00, 0x4C, 0x1D, 0x00,             // data size 1_920_000 LE
        };
        Assert.Equal(44, header.Length);
        Assert.Equal(expected, header);
    }

    [Fact]
    public void WrapParseRoundtrip()
    {
        // 100 stereo frames of a recognizable ramp (200 Int16 samples).
        var pcm = new byte[400];
        for (int i = 0; i < 200; i++)
        {
            short sample = unchecked((short)(i * 17 - 1000));
            BinaryPrimitives.WriteInt16LittleEndian(pcm.AsSpan(i * 2), sample);
        }
        byte[] wav = WavCodec.Wrap(pcm);
        Assert.Equal(44 + pcm.Length, wav.Length);

        WavCodec.Info info = WavCodec.Parse(wav);
        Assert.Equal(16_000, info.SampleRate);
        Assert.Equal(2, info.Channels);
        Assert.Equal(16, info.BitsPerSample);
        Assert.Equal(44, info.DataOffset);
        Assert.Equal(pcm.Length, info.DataLength);
        Assert.Equal(100, info.FrameCount);
        Assert.Equal(pcm, WavCodec.PcmData(wav, info));
    }

    [Fact]
    public void RoundtripSurvivesDataSlicing()
    {
        // Parse must work on a span offset into a larger buffer.
        var pcm = new byte[400];
        Array.Fill(pcm, (byte)0x42);
        byte[] wrapped = WavCodec.Wrap(pcm);
        var padded = new byte[3 + wrapped.Length];
        padded[0] = padded[1] = padded[2] = 0xFF;
        wrapped.CopyTo(padded, 3);

        WavCodec.Info info = WavCodec.Parse(padded.AsSpan(3));
        Assert.Equal(400, info.DataLength);
    }

    [Fact]
    public void RejectsGarbage()
    {
        var data = new byte[100];
        Array.Fill(data, (byte)0xAA);
        var ex = Assert.Throws<WavCodec.WavException>(() => WavCodec.Parse(data));
        Assert.Equal(WavCodec.WavErrorKind.NotRiff, ex.Kind);
    }

    [Fact]
    public void RejectsTruncated()
    {
        var ex = Assert.Throws<WavCodec.WavException>(
            () => WavCodec.Parse("RIFF1234WAVE"u8.ToArray()));
        Assert.Equal(WavCodec.WavErrorKind.TooShort, ex.Kind);
    }

    [Fact]
    public void RejectsWrongMagicAfterRiff()
    {
        byte[] wav = WavCodec.Wrap(new byte[64]);
        "AVI "u8.ToArray().CopyTo(wav.AsSpan(8));
        var ex = Assert.Throws<WavCodec.WavException>(() => WavCodec.Parse(wav));
        Assert.Equal(WavCodec.WavErrorKind.NotWave, ex.Kind);
    }

    [Fact]
    public void RejectsNonPcmFormat()
    {
        byte[] wav = WavCodec.Wrap(new byte[64]);
        wav[20] = 0x03; // IEEE float format tag
        var ex = Assert.Throws<WavCodec.WavException>(() => WavCodec.Parse(wav));
        Assert.Equal(WavCodec.WavErrorKind.NotPcm16, ex.Kind);
        Assert.Equal(3, ex.FormatTag);
        Assert.Equal(16, ex.Bits);
    }

    [Fact]
    public void Rejects8Bit()
    {
        byte[] wav = WavCodec.Wrap(new byte[64]);
        wav[34] = 0x08; // bits per sample = 8
        var ex = Assert.Throws<WavCodec.WavException>(() => WavCodec.Parse(wav));
        Assert.Equal(WavCodec.WavErrorKind.NotPcm16, ex.Kind);
        Assert.Equal(1, ex.FormatTag);
        Assert.Equal(8, ex.Bits);
    }

    [Fact]
    public void ParsesNonCanonicalWavWithExtraChunk()
    {
        // RIFF / fmt / LIST(6 bytes) / data — what ffmpeg often emits.
        var pcm = new byte[128];
        Array.Fill(pcm, (byte)0x11);

        using var ms = new MemoryStream();
        void Ascii(string s) => ms.Write(System.Text.Encoding.ASCII.GetBytes(s));
        void U32(uint v) { Span<byte> b = stackalloc byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(b, v); ms.Write(b); }

        Ascii("RIFF");
        U32((uint)(4 + 24 + 14 + 8 + pcm.Length));
        Ascii("WAVE");
        // canonical fmt chunk lifted from our own header builder ("fmt " + size + 16-byte body)
        byte[] canonical = WavCodec.Header(pcm.Length);
        ms.Write(canonical.AsSpan(12, 24));
        // LIST chunk with 6 bytes of junk
        Ascii("LIST");
        U32(6);
        ms.Write(new byte[6]);
        // data chunk
        Ascii("data");
        U32((uint)pcm.Length);
        ms.Write(pcm);

        byte[] wav = ms.ToArray();
        WavCodec.Info info = WavCodec.Parse(wav);
        Assert.Equal(16_000, info.SampleRate);
        Assert.Equal(2, info.Channels);
        Assert.Equal(pcm.Length, info.DataLength);
        Assert.Equal(pcm, WavCodec.PcmData(wav, info));
    }
}
