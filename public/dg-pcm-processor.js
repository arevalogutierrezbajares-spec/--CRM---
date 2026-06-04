/**
 * AudioWorklet: converts the mic's Float32 PCM frames to 16-bit linear PCM
 * (the format Deepgram streaming expects) and ships them to the main thread,
 * which forwards them over the WebSocket. Runs off the main thread so the UI
 * stays smooth.
 *
 * Frames arrive in 128-sample blocks (~2.7ms at 48kHz). We batch to ~85ms
 * before posting so we send ~12 WS messages/sec instead of ~375.
 */
const BATCH = 4096; // samples (~85ms @ 48kHz)

class DGPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(BATCH);
    this._n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0]; // Float32Array, [-1, 1]
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        this._buf[this._n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this._n === BATCH) {
          this.port.postMessage(this._buf.slice(0).buffer);
          this._n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("dg-pcm-processor", DGPCMProcessor);
