'use client';

// Audio for the Voice Studio: capture raw microphone samples, then turn each take into the format
// Piper training expects (22,050 Hz, mono, 16-bit WAV) with silence trimmed and a quality check.

export const TARGET_RATE = 22050;

// Copies microphone samples to the main thread. Loaded from a Blob URL so no extra file is served.
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('voice-studio-capture', Capture);
`;

export type Recorder = {
  start(): void;
  stop(): Float32Array;
  level(): number; // current input level 0..1, for the meter
  sampleRate: number;
  close(): Promise<void>;
};

// Opens the microphone with browser processing off: training wants the voice as it really sounds.
export async function openRecorder(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'voice-studio-capture');
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph running without playing the mic back
  source.connect(node).connect(mute).connect(ctx.destination);

  let chunks: Float32Array[] = [];
  let recording = false;
  let lastLevel = 0;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const block = e.data;
    let peak = 0;
    for (let i = 0; i < block.length; i++) peak = Math.max(peak, Math.abs(block[i]));
    lastLevel = peak;
    if (recording) chunks.push(block);
  };

  return {
    sampleRate: ctx.sampleRate,
    start() {
      chunks = [];
      recording = true;
      void ctx.resume();
    },
    stop() {
      recording = false;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Float32Array(total);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      chunks = [];
      return out;
    },
    level: () => lastLevel,
    async close() {
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}

export async function resample(samples: Float32Array, fromRate: number, toRate = TARGET_RATE): Promise<Float32Array> {
  if (fromRate === toRate || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const offline = new OfflineAudioContext(1, length, toRate);
  const buffer = offline.createBuffer(1, samples.length, fromRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0).slice();
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);

export type TakeCheck = { ok: boolean; issues: string[]; speechDb: number; noiseDb: number; peak: number };

// Trims leading/trailing silence (keeping a little air) and checks the take is usable for training.
export function trimAndCheck(samples: Float32Array, rate = TARGET_RATE): { audio: Float32Array; check: TakeCheck } {
  const frame = Math.round(rate * 0.01); // 10 ms
  const rms: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j] * samples[j];
    rms.push(Math.sqrt(sum / frame));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.1)] || 0; // quietest frames
  const threshold = Math.max(noise * 3, 10 ** (-48 / 20));
  const first = rms.findIndex((r) => r > threshold);
  const last = rms.length - 1 - [...rms].reverse().findIndex((r) => r > threshold);

  const issues: string[] = [];
  if (first < 0) {
    return { audio: new Float32Array(0), check: { ok: false, issues: ['Nothing was heard. Check the microphone.'], speechDb: -120, noiseDb: db(noise), peak: 0 } };
  }
  const pad = Math.round(rate * 0.15);
  const start = Math.max(0, first * frame - pad);
  const end = Math.min(samples.length, (last + 1) * frame + pad);
  const audio = samples.slice(start, end);

  let peak = 0;
  for (let i = 0; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
  const voiced = rms.slice(first, last + 1).filter((r) => r > threshold);
  const speech = voiced.length ? Math.sqrt(voiced.reduce((s, r) => s + r * r, 0) / voiced.length) : 0;

  if (peak >= 0.99) issues.push('Too loud: the sound is distorted. Move back a little or lower the mic volume.');
  if (db(speech) < -32) issues.push('Too quiet. Move closer to the microphone or speak up a little.');
  if (db(noise) > -50) issues.push('Background noise is noticeable. A quieter room gives a cleaner voice.');
  if (audio.length / rate < 0.8) issues.push('Very short. Was the whole sentence recorded?');
  return { audio, check: { ok: issues.length === 0, issues, speechDb: Math.round(db(speech)), noiseDb: Math.round(db(noise)), peak } };
}

export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Uint8Array<ArrayBuffer> {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(view.buffer);
}
