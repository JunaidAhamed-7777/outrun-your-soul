/**
 * Small WebAudio synthesis kit: every game sound is built from these primitives
 * (offline-rendered plucks, additive bells, filtered noise, pitched blips, buzzes).
 * Each call schedules one voice at time `t` and returns a handle the engine can use
 * to fade it early when the voice budget needs room.
 */
import { renderPluck } from './pluck';

export interface SynthVoice {
  /** Context time after which the voice is silent. */
  readonly end: number;
  stop(at: number): void;
}

export interface VoiceOut {
  /** -1..1 */
  pan?: number;
  /** Reverb send level 0..1. */
  send?: number;
  /** Destination override (defaults to the sfx bus). */
  out?: AudioNode;
}

const SILENT = 0.0001;

/** Exponential attack/decay envelope on a gain param. */
export function envelope(param: AudioParam, t: number, attack: number, peak: number, decay: number): number {
  const p = Math.max(peak, SILENT * 2);
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(p, t + Math.max(0.001, attack));
  param.exponentialRampToValueAtTime(SILENT, t + Math.max(0.001, attack) + Math.max(0.005, decay));
  return t + attack + decay;
}

/** Combine several voices into one handle. */
export function group(voices: SynthVoice[]): SynthVoice {
  return {
    end: voices.reduce((m, v) => Math.max(m, v.end), 0),
    stop(at: number) {
      for (const v of voices) v.stop(at);
    },
  };
}

/** Decorative randomness only (never gameplay): seeded LCG. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Synth {
  readonly noise: AudioBuffer;
  private readonly pluckCache = new Map<string, AudioBuffer>();
  private readonly crunchCurve: Float32Array<ArrayBuffer>;
  private readonly rand = lcg(0xa11ce);

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly sfxOut: AudioNode,
    private readonly reverbIn: AudioNode,
  ) {
    const len = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    const r = lcg(0x0015e);
    for (let i = 0; i < len; i++) data[i] = r() * 2 - 1;
    const n = 1024;
    this.crunchCurve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      this.crunchCurve[i] = Math.tanh(x * 6) * 0.9;
    }
  }

  /** Voice gain -> panner -> destination, plus a reverb send. */
  private chain(t: number, opts: VoiceOut): { input: GainNode; voiceGain: GainNode; release(): void } {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(1, t);
    input.connect(voiceGain);
    let tail: AudioNode = voiceGain;
    const pan = opts.pan ?? 0;
    if (pan !== 0 && typeof (ctx as AudioContext).createStereoPanner === 'function') {
      const panner = (ctx as AudioContext).createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      voiceGain.connect(panner);
      tail = panner;
    }
    tail.connect(opts.out ?? this.sfxOut);
    const send = opts.send ?? 0;
    let sendGain: GainNode | null = null;
    if (send > 0) {
      sendGain = ctx.createGain();
      sendGain.gain.setValueAtTime(send, t);
      tail.connect(sendGain);
      sendGain.connect(this.reverbIn);
    }
    return {
      input,
      voiceGain,
      release() {
        try {
          tail.disconnect();
          sendGain?.disconnect();
        } catch {
          /* already disconnected */
        }
      },
    };
  }

  private finish(
    sources: AudioScheduledSourceNode[],
    chain: ReturnType<Synth['chain']>,
    t: number,
    end: number,
  ): SynthVoice {
    const stopAt = end + 0.05;
    for (const s of sources) {
      s.start(t);
      s.stop(stopAt);
    }
    const last = sources[sources.length - 1];
    if (last) last.onended = () => chain.release();
    return {
      end: stopAt,
      stop(at: number) {
        chain.voiceGain.gain.cancelScheduledValues(at);
        chain.voiceGain.gain.setTargetAtTime(0, at, 0.012);
        for (const s of sources) {
          try {
            s.stop(at + 0.08);
          } catch {
            /* already stopped */
          }
        }
      },
    };
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = this.noise.duration;
    // Random phase so repeated bursts don't sound identical.
    (src as AudioBufferSourceNode & { _offset?: number })._offset = this.rand() * (this.noise.duration - 0.5);
    return src;
  }

  private startNoise(src: AudioBufferSourceNode, t: number, end: number): void {
    const offset = (src as AudioBufferSourceNode & { _offset?: number })._offset ?? 0;
    src.start(t, offset);
    src.stop(end + 0.05);
  }

  /** Plucked string (offline Karplus–Strong, cached per pitch/brightness). */
  pluck(t: number, hz: number, o: VoiceOut & { gain: number; brightness: number; t60: number; seconds?: number }): SynthVoice {
    const seconds = o.seconds ?? Math.min(2, o.t60 * 1.3);
    const key = `${hz.toFixed(1)}|${o.brightness.toFixed(2)}|${o.t60.toFixed(2)}|${seconds.toFixed(2)}`;
    let buffer = this.pluckCache.get(key);
    if (!buffer) {
      const data = renderPluck(this.ctx.sampleRate, hz, { seconds, brightness: o.brightness, t60: o.t60 });
      buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buffer.getChannelData(0).set(data);
      this.pluckCache.set(key, buffer);
    }
    const chain = this.chain(t, o);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain, t);
    src.connect(g).connect(chain.input);
    return this.finish([src], chain, t, t + seconds);
  }

  /**
   * Additive bell. partials: [ratio, amplitude, decayScale]. Optional detune glide
   * (cents -> 0) lets two tones converge into unison, as at a reunion.
   */
  bell(
    t: number,
    hz: number,
    o: VoiceOut & {
      gain: number;
      decay: number;
      attack?: number;
      partials?: readonly (readonly [number, number, number])[];
      detuneFrom?: number;
      glide?: number;
    },
  ): SynthVoice {
    const partials = o.partials ?? BELL_PARTIALS;
    const attack = o.attack ?? 0.004;
    const chain = this.chain(t, o);
    const sources: OscillatorNode[] = [];
    let end = t;
    for (const [ratio, amp, decayScale] of partials) {
      const f = hz * ratio;
      if (f > this.ctx.sampleRate * 0.45) continue;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      if (o.detuneFrom) {
        osc.detune.setValueAtTime(o.detuneFrom, t);
        osc.detune.linearRampToValueAtTime(0, t + (o.glide ?? 0.12));
      }
      const g = this.ctx.createGain();
      end = Math.max(end, envelope(g.gain, t, attack, o.gain * amp, o.decay * decayScale));
      osc.connect(g).connect(chain.input);
      sources.push(osc);
    }
    return this.finish(sources, chain, t, end);
  }

  /** Filtered noise click/burst. */
  tick(t: number, o: VoiceOut & { hz: number; q?: number; dur: number; gain: number; type?: BiquadFilterType; attack?: number }): SynthVoice {
    const chain = this.chain(t, o);
    const src = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.hz, t);
    f.Q.setValueAtTime(o.q ?? 1, t);
    const g = this.ctx.createGain();
    const end = envelope(g.gain, t, o.attack ?? 0.001, o.gain, o.dur);
    src.connect(f).connect(g).connect(chain.input);
    this.startNoise(src, t, end);
    src.onended = () => chain.release();
    return this.noiseVoice(src, chain, end);
  }

  /** Noise through a sweeping filter. swell=true builds slowly with no transient. */
  sweep(
    t: number,
    o: VoiceOut & { type: BiquadFilterType; from: number; to: number; q?: number; attack: number; dur: number; gain: number; swell?: boolean },
  ): SynthVoice {
    const chain = this.chain(t, o);
    const src = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.setValueAtTime(o.q ?? 1, t);
    f.frequency.setValueAtTime(o.from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.attack + o.dur);
    const g = this.ctx.createGain();
    let end: number;
    if (o.swell) {
      g.gain.setValueAtTime(SILENT, t);
      g.gain.exponentialRampToValueAtTime(Math.max(o.gain, SILENT * 2), t + o.attack);
      g.gain.exponentialRampToValueAtTime(SILENT, t + o.attack + o.dur);
      end = t + o.attack + o.dur;
    } else {
      end = envelope(g.gain, t, o.attack, o.gain, o.dur);
    }
    src.connect(f).connect(g).connect(chain.input);
    this.startNoise(src, t, end);
    src.onended = () => chain.release();
    return this.noiseVoice(src, chain, end);
  }

  /** Pitched oscillator with an exponential pitch glide (thocks, thuds, tugs). */
  blip(
    t: number,
    o: VoiceOut & { from: number; to: number; dur: number; gain: number; attack?: number; type?: OscillatorType; lowpass?: number },
  ): SynthVoice {
    const chain = this.chain(t, o);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.attack ?? 0.002) + o.dur);
    const g = this.ctx.createGain();
    const end = envelope(g.gain, t, o.attack ?? 0.002, o.gain, o.dur);
    let head: AudioNode = osc;
    if (o.lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lowpass, t);
      head.connect(f);
      head = f;
    }
    head.connect(g).connect(chain.input);
    return this.finish([osc], chain, t, end);
  }

  /** Low filtered buzz for environmental lanes: saw stack through a sweeping lowpass. */
  buzz(
    t: number,
    o: VoiceOut & { freqs: readonly number[]; from: number; to: number; q?: number; attack: number; dur: number; gain: number },
  ): SynthVoice {
    const chain = this.chain(t, o);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.setValueAtTime(o.q ?? 3, t);
    f.frequency.setValueAtTime(o.from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + o.attack + o.dur);
    const g = this.ctx.createGain();
    const end = envelope(g.gain, t, o.attack, o.gain, o.dur);
    f.connect(g).connect(chain.input);
    const sources = o.freqs.map((hz, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, t);
      osc.detune.setValueAtTime(i * 6, t);
      osc.connect(f);
      return osc;
    });
    return this.finish(sources, chain, t, end);
  }

  /** Distorted noise crunch (damage). */
  crunch(t: number, o: VoiceOut & { gain: number; dur: number; lowpass?: number }): SynthVoice {
    const chain = this.chain(t, o);
    const src = this.noiseSource();
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.crunchCurve;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.lowpass ?? 2400, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + o.dur);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(180, t);
    const g = this.ctx.createGain();
    const end = envelope(g.gain, t, 0.002, o.gain, o.dur);
    src.connect(shaper).connect(lp).connect(hp).connect(g).connect(chain.input);
    this.startNoise(src, t, end);
    src.onended = () => chain.release();
    return this.noiseVoice(src, chain, end);
  }

  private noiseVoice(src: AudioBufferSourceNode, chain: ReturnType<Synth['chain']>, end: number): SynthVoice {
    return {
      end: end + 0.05,
      stop(at: number) {
        chain.voiceGain.gain.cancelScheduledValues(at);
        chain.voiceGain.gain.setTargetAtTime(0, at, 0.012);
        try {
          src.stop(at + 0.08);
        } catch {
          /* already stopped */
        }
      },
    };
  }
}

/** Default bell partials: slightly inharmonic, upper partials die first. */
export const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.42, 0.7],
  [2.76, 0.22, 0.5],
  [4.07, 0.12, 0.35],
  [5.43, 0.06, 0.25],
];

/** Soft, nearly pure partials for the soul's voice. */
export const SOUL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.28, 0.6],
  [3.01, 0.08, 0.4],
];

/** Glassy partials for cuts. */
export const GLASS_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.32, 0.6, 0.7],
  [4.25, 0.35, 0.45],
  [6.8, 0.15, 0.3],
];

/** Stereo impulse response for a sunlit stone courtyard (decorative randomness). */
export function courtyardImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    const r = lcg(0xc0be + ch * 977);
    const pre = Math.floor(ctx.sampleRate * 0.012);
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      data[i] = (r() * 2 - 1) * (1 - x) ** decay;
    }
  }
  return ir;
}
