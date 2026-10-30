/**
 * Karplus–Strong plucked string rendered offline into a sample array. WebAudio
 * feedback delays cannot go below one render quantum (~128 samples), which caps
 * real-time loops near 344 Hz, so the body's bright high plucks are rendered once
 * per pitch and cached as buffers. Deterministic: the excitation uses a seeded LCG.
 */
export interface PluckOptions {
  /** Seconds of audio to render. */
  readonly seconds: number;
  /** 0 = dark/soft excitation, 1 = bright/hard. */
  readonly brightness: number;
  /** Seconds for the string to decay by 60 dB. */
  readonly t60: number;
  readonly seed?: number;
}

export function renderPluck(sampleRate: number, hz: number, opts: PluckOptions): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * opts.seconds));
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(sampleRate / Math.max(20, hz)));
  const line = new Float32Array(period);

  let seed = (opts.seed ?? 0x5eed) >>> 0;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Excitation: noise through a one-pole lowpass whose cutoff follows brightness.
  const k = 0.12 + 0.88 * Math.max(0, Math.min(1, opts.brightness));
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    lp += (rand() * 2 - 1 - lp) * k;
    line[i] = lp;
    mean += lp;
  }
  mean /= period;
  let peak = 0;
  for (let i = 0; i < period; i++) {
    const value = (line[i] ?? 0) - mean;
    line[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let i = 0; i < period; i++) line[i] = (line[i] ?? 0) / peak;

  // Loss per round trip so amplitude falls 60 dB after t60 seconds.
  const loss = 10 ** ((-3 * period) / (sampleRate * Math.max(0.05, opts.t60)));
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx] ?? 0;
    const next = line[(idx + 1) % period] ?? 0;
    out[i] = cur;
    line[idx] = loss * 0.5 * (cur + next);
    idx = (idx + 1) % period;
  }

  // Short fade so the buffer never ends on a click.
  const fade = Math.min(n, Math.floor(sampleRate * 0.02));
  for (let i = 0; i < fade; i++) {
    const j = n - 1 - i;
    out[j] = (out[j] ?? 0) * (i / fade);
  }
  return out;
}
