/**
 * AudioWorklet: converts the mic's Float32 PCM frames to 16-bit linear PCM
 * (the format Deepgram streaming expects) and ships each frame to the main
 * thread, which forwards it over the WebSocket. Runs off the main thread so
 * the UI stays smooth while recording.
 */
class DGPCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0]; // Float32Array, [-1, 1]
      const out = new Int16Array(channel.length);
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}

registerProcessor("dg-pcm-processor", DGPCMProcessor);
