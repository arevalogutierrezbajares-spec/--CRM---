using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace AGB.CaptureHelper.Audio;

/// <summary>
/// Converts pushed capture buffers of an arbitrary input <see cref="WaveFormat"/>
/// (any sample rate, channel count, IEEE-float or PCM16) into 16 kHz mono Int16
/// little-endian bytes — the per-channel format the <c>StereoInterleaver</c>
/// expects (L = mic, R = system).
///
/// On macOS the helper used <c>AVAudioConverter</c> for exactly this. Here we
/// chain NAudio sample providers: a push buffer → IEEE-float samples → stereo→mono
/// → <see cref="WdlResamplingSampleProvider"/> (high-quality, dependency-free)
/// → Int16.
///
/// Pushed audio is buffered; <see cref="Drain"/> pulls out as many converted
/// 16 kHz frames as are currently available. Not thread-safe — call from one
/// capture callback thread (NAudio delivers each device's DataAvailable serially).
/// </summary>
public sealed class MonoResampler
{
    private const int TargetRate = 16_000;

    private readonly BufferedWaveProvider _input;
    private readonly ISampleProvider _pipeline;
    private readonly float[] _scratch = new float[TargetRate]; // 1 s of mono @16k headroom

    public MonoResampler(WaveFormat inputFormat)
    {
        // BufferedWaveProvider needs PCM/IEEE bytes; we always feed it the exact
        // bytes NAudio captured (its WaveFormat), and let ToSampleProvider handle
        // float-vs-PCM decoding.
        _input = new BufferedWaveProvider(inputFormat)
        {
            // Generous so a momentary stall in Drain() never throws; the interleaver
            // clock — not this buffer — governs how much audio survives.
            BufferDuration = TimeSpan.FromSeconds(10),
            DiscardOnBufferOverflow = true,
            ReadFully = false,
        };

        ISampleProvider samples = _input.ToSampleProvider();
        // Collapse to mono first (cheap), then resample the single channel.
        samples = samples.WaveFormat.Channels switch
        {
            1 => samples,
            2 => new StereoToMonoSampleProvider(samples) { LeftVolume = 0.5f, RightVolume = 0.5f },
            // WASAPI render endpoints can expose >2 channels (5.1/7.1). NAudio's
            // StereoToMonoSampleProvider only handles exactly 2, so average all
            // channels for the >2 case.
            _ => new AverageToMonoSampleProvider(samples),
        };

        _pipeline = samples.WaveFormat.SampleRate == TargetRate
            ? samples
            : new WdlResamplingSampleProvider(samples, TargetRate);
    }

    /// <summary>Push raw captured bytes (in the input format) into the converter.</summary>
    public void Push(byte[] buffer, int offset, int count)
    {
        if (count <= 0) return;
        _input.AddSamples(buffer, offset, count);
    }

    /// <summary>
    /// Pull all currently-available converted audio as 16 kHz mono Int16 LE bytes.
    /// Returns an empty array when nothing is ready yet.
    /// </summary>
    public byte[] Drain()
    {
        using var ms = new MemoryStream();
        int read;
        // ReadFully=false means Read returns only what is buffered; loop until drained.
        while ((read = _pipeline.Read(_scratch, 0, _scratch.Length)) > 0)
        {
            for (int i = 0; i < read; i++)
            {
                short s = FloatToInt16(_scratch[i]);
                ms.WriteByte((byte)(s & 0xFF));
                ms.WriteByte((byte)((s >> 8) & 0xFF));
            }
            if (read < _scratch.Length) break; // buffer exhausted
        }
        return ms.ToArray();
    }

    private static short FloatToInt16(float sample)
    {
        // Clamp then scale; symmetric so silence stays exactly 0.
        float clamped = Math.Clamp(sample, -1f, 1f);
        return (short)Math.Round(clamped * short.MaxValue);
    }

    /// <summary>
    /// Downmix an N-channel (N &gt; 2) float source to mono by averaging all
    /// channels per frame. NAudio ships a stereo→mono provider but nothing for
    /// surround render endpoints; this covers 5.1/7.1 system audio.
    /// </summary>
    private sealed class AverageToMonoSampleProvider : ISampleProvider
    {
        private readonly ISampleProvider _source;
        private readonly int _channels;
        private float[] _buffer = Array.Empty<float>();

        public AverageToMonoSampleProvider(ISampleProvider source)
        {
            _source = source;
            _channels = source.WaveFormat.Channels;
            WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(source.WaveFormat.SampleRate, 1);
        }

        public WaveFormat WaveFormat { get; }

        public int Read(float[] buffer, int offset, int count)
        {
            int needed = count * _channels;
            if (_buffer.Length < needed) _buffer = new float[needed];

            int read = _source.Read(_buffer, 0, needed);
            int frames = read / _channels;
            for (int frame = 0; frame < frames; frame++)
            {
                float sum = 0;
                int baseIndex = frame * _channels;
                for (int c = 0; c < _channels; c++) sum += _buffer[baseIndex + c];
                buffer[offset + frame] = sum / _channels;
            }
            return frames;
        }
    }
}
