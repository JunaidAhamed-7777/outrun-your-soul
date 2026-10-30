/**
 * Procedural game audio. No sample files: every sound is synthesized at runtime, so
 * provenance is entirely original. The context is created only from a user gesture
 * (unlock), everything tolerates missing WebAudio, and mute applies instantly.
 *
 * Graph: voices -> sfx bus ┐
 *        pad/bells -> music duck -> music bus ┼-> master -> compressor -> out
 *        sends -> courtyard reverb -> return ┘
 */
import type { SimEvent, SimState } from '../sim/types';
import { createCueMemory, cueContext, cuesForEvent, panFor, type CueRequest } from './cues';
import { degreeHz, REUNION_BRIGHT, REUNION_CHORD } from './scale';
import {
  GLASS_PARTIALS,
  SOUL_PARTIALS,
  Synth,
  courtyardImpulse,
  group,
  lcg,
  type SynthVoice,
} from './synth';
import { CUE_SPECS, VoiceLimiter } from './voices';
import { threadMeter } from '../ui/hud-logic';

export interface GameAudio {
  unlock(): Promise<void>;
  handleEvents(events: readonly SimEvent[], state: SimState): void;
  update(state: SimState, realDt: number): void;
  setMuted(muted: boolean): void;
  setVolumes(music: number, sfx: number): void;
  suspend(): void;
  resume(): void;
  ui(name: 'tap' | 'open' | 'close' | 'start'): void;
  /** Additive: audition one cue by name (labs). */
  audition?(request: Partial<CueRequest> & Pick<CueRequest, 'cue'>): void;
}

type AudioCtor = new (options?: AudioContextOptions) => AudioContext;

function audioCtor(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Silent stand-in when WebAudio is unavailable. */
function silentAudio(): GameAudio {
  const noop = (): void => {};
  return {
    unlock: () => Promise.resolve(),
    handleEvents: noop,
    update: noop,
    setMuted: noop,
    setVolumes: noop,
    suspend: noop,
    resume: noop,
    ui: noop,
    audition: noop,
  };
}

interface Engine {
  ctx: AudioContext;
  synth: Synth;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  musicDuck: GainNode;
  hum: { gain: GainNode; pan: StereoPannerNode | null; oscs: OscillatorNode[] };
  lane: { gain: GainNode; started: boolean; oscs: OscillatorNode[] } | null;
}

export function createAudio(): GameAudio {
  const Ctor = audioCtor();
  if (!Ctor) return silentAudio();

  let engine: Engine | null = null;
  let muted = false;
  let musicVolume = 0.6;
  let sfxVolume = 0.9;
  let suspended = false;
  const limiter = new VoiceLimiter();
  const memory = createCueMemory();
  const live = new Map<number, SynthVoice>();
  const decor = lcg(0xbe11);
  let bellTimer = 4;

  function build(ctx: AudioContext): Engine {
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);

    const sfx = ctx.createGain();
    sfx.gain.value = sfxVolume;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = musicVolume * 0.8;
    music.connect(master);
    const musicDuck = ctx.createGain();
    musicDuck.gain.value = 1;
    musicDuck.connect(music);

    const reverb = ctx.createConvolver();
    reverb.buffer = courtyardImpulse(ctx);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.32;
    reverb.connect(reverbReturn).connect(master);

    const synth = new Synth(ctx, sfx, reverb);
    const hum = buildSoulHum(ctx, synth, sfx);
    buildPad(ctx, musicDuck);
    return { ctx, synth, master, sfx, music, musicDuck, hum, lane: null };
  }

  /** Soul presence: a breathy two-tone hum that swells with outstanding thread. */
  function buildSoulHum(ctx: AudioContext, synth: Synth, out: AudioNode): Engine['hum'] {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(lp.frequency);
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = degreeHz(0, -1);
    const b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.value = degreeHz(4, -1);
    b.detune.value = 5;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    a.connect(lp);
    b.connect(bGain).connect(lp);
    const air = ctx.createBufferSource();
    air.buffer = synth.noise;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 1500;
    airFilter.Q.value = 0.8;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.22;
    air.connect(airFilter).connect(airGain).connect(lp);
    let pan: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      pan = ctx.createStereoPanner();
      lp.connect(gain).connect(pan).connect(out);
    } else {
      lp.connect(gain).connect(out);
    }
    const t = ctx.currentTime;
    for (const node of [lfo, a, b, air]) node.start(t);
    return { gain, pan, oscs: [a, b] };
  }

  /** Sparse warm drone in D: the courtyard's air, ducked whenever danger is live. */
  function buildPad(ctx: AudioContext, out: AudioNode): void {
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0.0001, ctx.currentTime);
    pad.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = ctx.createGain();
    depth.gain.value = 240;
    lfo.connect(depth).connect(lp.frequency);
    const voices: [number, number, OscillatorType][] = [
      [degreeHz(0, -2), 0.5, 'sine'],
      [degreeHz(4, -2), 0.32, 'sine'],
      [degreeHz(0, -1), 0.12, 'triangle'],
      [degreeHz(3, -1), 0.05, 'sine'], // the raised fourth, barely there: Lydian light
    ];
    for (const [hz, level, type] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      osc.detune.value = (decor() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(lp);
      osc.start();
    }
    lfo.start();
    lp.connect(pad).connect(out);
  }

  function ensureLane(e: Engine): NonNullable<Engine['lane']> {
    if (e.lane) return e.lane;
    const ctx = e.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 4;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(trem.gain);
    const oscs = [degreeHz(0, -3), degreeHz(4, -3)].map((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = i * 7;
      o.connect(lp);
      o.start();
      return o;
    });
    lfo.start();
    lp.connect(trem).connect(gain).connect(e.sfx);
    e.lane = { gain, started: true, oscs };
    return e.lane;
  }

  // ------------------------------------------------------------------ cues
  function play(e: Engine, r: CueRequest, t: number): SynthVoice | null {
    const s = e.synth;
    const k = r.intensity;
    const pan = r.pan;
    switch (r.cue) {
      case 'dashPluck': {
        const hz = degreeHz(r.degree, 0);
        return group([
          s.pluck(t, hz, { gain: 0.5 * k, brightness: 0.55 + 0.4 * k, t60: 0.9, pan, send: 0.16 }),
          s.pluck(t, hz * 2, { gain: 0.14 * k, brightness: 0.9, t60: 0.45, pan, send: 0.1 }),
          s.tick(t, { hz: 3400, q: 1.2, dur: 0.012, gain: 0.1 * k, pan }),
        ]);
      }
      case 'soulChime':
        return s.bell(t, degreeHz(r.degree, -1), {
          gain: 0.2 * k,
          decay: 1.5,
          attack: 0.03,
          partials: SOUL_PARTIALS,
          pan,
          send: 0.5,
        });
      case 'tug':
        return group([
          s.blip(t, { from: degreeHz(0, -2), to: degreeHz(1, -2), dur: 0.3, attack: 0.05, gain: 0.14 * k, pan }),
          s.sweep(t, { type: 'bandpass', from: 380, to: 620, q: 1.5, attack: 0.08, dur: 0.22, gain: 0.05 * k, swell: true, pan }),
        ]);
      case 'reunionChord': {
        const bright = r.variant === 'contact';
        const soft = r.variant === 'exhaustion';
        const voices: SynthVoice[] = [
          // Body and soul tones slide together into one pitch before the chord blooms.
          s.bell(t, degreeHz(r.degree, 0), { gain: 0.12 * k, decay: 0.7, attack: 0.01, partials: SOUL_PARTIALS, detuneFrom: 55, glide: 0.12, pan, send: 0.3 }),
          s.bell(t, degreeHz(r.degree, -1), { gain: 0.12 * k, decay: 0.8, attack: 0.01, partials: SOUL_PARTIALS, detuneFrom: -55, glide: 0.12, pan, send: 0.3 }),
        ];
        const tones = bright ? REUNION_BRIGHT : REUNION_CHORD;
        tones.forEach((deg, i) => {
          voices.push(
            s.bell(t + 0.1 + i * (soft ? 0.05 : 0.03), degreeHz(deg, 0), {
              gain: (bright ? 0.085 : 0.065) * k,
              decay: soft ? 1.6 : 1.9,
              attack: soft ? 0.03 : 0.006,
              partials: bright ? undefined : SOUL_PARTIALS,
              pan: pan * 0.6,
              send: 0.4,
            }),
          );
        });
        return group(voices);
      }
      case 'returnSwell':
        return group([
          s.sweep(t, { type: 'lowpass', from: 280, to: 2400, q: 2.2, attack: 0.34, dur: 0.05, gain: 0.2 * k, swell: true, pan, send: 0.25 }),
          s.blip(t, { from: degreeHz(0, -1), to: degreeHz(4, -1), dur: 0.05, attack: 0.32, gain: 0.07 * k, pan }),
        ]);
      case 'cutTing':
        return group([
          s.bell(t, 1980, { gain: 0.14 * k, decay: 0.5, attack: 0.001, partials: GLASS_PARTIALS, pan, send: 0.3 }),
          s.tick(t, { hz: 6500, type: 'highpass', dur: 0.018, gain: 0.14 * k, pan }),
        ]);
      case 'killThock':
        return group([
          s.blip(t, { from: 260, to: 78, dur: 0.15, gain: 0.34 * k, pan }),
          s.tick(t, { hz: 1100, q: 3, dur: 0.035, gain: 0.2 * k, pan }),
          s.bell(t + 0.05, degreeHz(4, 2), { gain: 0.035 * k, decay: 0.6, pan, send: 0.4 }),
          s.bell(t + 0.08, degreeHz(2, 2), { gain: 0.03 * k, decay: 0.55, pan, send: 0.4 }),
        ]);
      case 'trackTick': {
        // Keeper (soul-targeting) ticks sit lower than needler ticks.
        const hz = r.variant === 'soul' ? 1320 : 1760;
        return s.blip(t, { from: hz, to: hz * 0.97, dur: 0.025, attack: 0.001, gain: 0.08 * k });
      }
      case 'lockTick': {
        const second = r.variant === 'soul' ? 990 : 1320;
        return group([
          s.tick(t, { hz: 2600, q: 6, dur: 0.03, gain: 0.24 * k }),
          s.blip(t, { from: 1320, to: 1250, dur: 0.04, attack: 0.001, gain: 0.12 * k, type: 'square', lowpass: 3200 }),
          s.tick(t + 0.075, { hz: 2600, q: 6, dur: 0.03, gain: 0.24 * k }),
          s.blip(t + 0.075, { from: second, to: second * 0.95, dur: 0.05, attack: 0.001, gain: 0.12 * k, type: 'square', lowpass: 3200 }),
        ]);
      }
      case 'fireWhoosh':
        return s.sweep(t, { type: 'bandpass', from: 700, to: 2800, q: 1.4, attack: 0.02, dur: 0.24, gain: 0.18 * k, pan, send: 0.15 });
      case 'hitCrunch': {
        const voices = [
          s.crunch(t, { gain: 0.3 * k, dur: 0.17, pan }),
          s.blip(t, { from: r.variant === 'soul' ? 180 : 120, to: 42, dur: 0.28, gain: 0.42 * k, pan }),
        ];
        if (r.variant === 'soul') {
          // The soul cracks like glass: a dissonant pair over the thud.
          voices.push(s.bell(t, 1244, { gain: 0.06 * k, decay: 0.4, attack: 0.001, partials: GLASS_PARTIALS, pan, send: 0.3 }));
          voices.push(s.bell(t + 0.01, 1760, { gain: 0.05 * k, decay: 0.35, attack: 0.001, partials: GLASS_PARTIALS, pan, send: 0.3 }));
        }
        return group(voices);
      }
      case 'shieldTick':
        return r.variant === 'dash'
          ? s.sweep(t, { type: 'highpass', from: 3000, to: 6500, q: 0.8, attack: 0.01, dur: 0.12, gain: 0.06 * k, pan })
          : s.tick(t, { hz: 700, q: 1, dur: 0.03, gain: 0.08 * k, pan });
      case 'fizzle':
        return s.tick(t, { hz: 4200, q: 2, dur: 0.025, gain: 0.04 * k, pan });
      case 'laneWarn':
        return group([
          s.buzz(t, { freqs: [98], from: 380, to: 300, attack: 0.02, dur: 0.18, gain: 0.12 * k }),
          s.buzz(t + 0.25, { freqs: [98], from: 380, to: 300, attack: 0.02, dur: 0.18, gain: 0.12 * k }),
        ]);
      case 'laneOn':
        return s.buzz(t, { freqs: [degreeHz(0, -2), degreeHz(4, -2)], from: 200, to: 1100, attack: 0.06, dur: 0.5, gain: 0.14 * k, send: 0.2 });
      case 'laneOff':
        return s.buzz(t, { freqs: [degreeHz(0, -2)], from: 900, to: 150, attack: 0.01, dur: 0.4, gain: 0.07 * k });
      case 'gateReady':
        return group(
          [0, 2, 4, 8].map((deg, i) =>
            s.bell(t + i * 0.06, degreeHz(deg, 0), { gain: 0.06 * k, decay: 1.6, attack: 0.01, send: 0.45 }),
          ),
        );
      case 'gateOpen':
        return group(
          [0, 2, 4, 7, 9].map((deg, i) =>
            s.bell(t + i * 0.09, degreeHz(deg, 0), { gain: 0.07 * k, decay: 1.8, attack: 0.004, send: 0.45 }),
          ),
        );
      case 'victory': {
        const voices = [0, 2, 4, 6, 8].map((deg, i) =>
          s.pluck(t + i * 0.11, degreeHz(deg, 0), { gain: 0.32 * k, brightness: 0.8, t60: 1.1, send: 0.3 }),
        );
        for (const [i, deg] of [7, 9, 11, 15].entries()) {
          voices.push(s.bell(t + 0.62 + i * 0.02, degreeHz(deg, 0), { gain: 0.06 * k, decay: 2.6, attack: 0.02, send: 0.5 }));
        }
        return group(voices);
      }
      case 'defeat': {
        const fall = [440, 349.23, 293.66, 220];
        const voices = fall.map((hz, i) =>
          s.bell(t + i * 0.28, hz, { gain: 0.08 * k, decay: 1.3, attack: 0.02, partials: SOUL_PARTIALS, send: 0.5 }),
        );
        // The soul's tone slides away and fades.
        voices.push(s.blip(t, { from: degreeHz(0, 0), to: degreeHz(0, -1), dur: 1.6, attack: 0.05, gain: 0.08 * k }));
        return group(voices);
      }
      case 'rejectClick':
        return group([
          s.blip(t, { from: 160, to: 118, dur: 0.05, gain: 0.11 * k }),
          s.tick(t, { hz: 420, type: 'lowpass', dur: 0.02, gain: 0.05 * k }),
        ]);
      case 'queuedTick':
        return s.blip(t, { from: 2093, to: 2093, dur: 0.02, attack: 0.001, gain: 0.05 * k });
      case 'wake':
        return group([
          s.blip(t, { from: 98, to: 87, dur: 0.45, attack: 0.08, gain: 0.16 * k }),
          s.sweep(t, { type: 'bandpass', from: 240, to: 180, q: 2, attack: 0.1, dur: 0.35, gain: 0.05 * k }),
        ]);
    }
  }

  function schedule(e: Engine, r: CueRequest, offset = 0): void {
    const spec = CUE_SPECS[r.cue];
    const now = e.ctx.currentTime;
    const admission = limiter.admit(r.cue, spec, now + r.delay, spec.duration);
    if (!admission.admit) return;
    for (const id of admission.steal) {
      live.get(id)?.stop(now);
      live.delete(id);
    }
    const voice = play(e, r, now + 0.005 + r.delay + offset);
    if (!voice) return;
    live.set(admission.id, voice);
    if (live.size > 64) {
      // Bounded bookkeeping: drop handles for voices that have finished.
      for (const [id, v] of live) if (v.end < now) live.delete(id);
    }
  }

  function ready(): Engine | null {
    if (!engine || muted || suspended || engine.ctx.state !== 'running') return null;
    return engine;
  }

  return {
    async unlock(): Promise<void> {
      try {
        if (!engine) engine = build(new Ctor({ latencyHint: 'interactive' }));
        const ctx = engine.ctx;
        // iOS: a silent buffer started inside the gesture fully unlocks output.
        const blank = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = blank;
        src.connect(ctx.destination);
        src.start();
        if (ctx.state !== 'running' && !suspended) await ctx.resume();
      } catch {
        // Audio is optional; the game stays fully playable muted.
      }
    },

    handleEvents(events: readonly SimEvent[], state: SimState): void {
      const ctx = cueContext(state);
      const e = ready();
      events.forEach((ev, i) => {
        const cues = cuesForEvent(ev, ctx, memory); // keeps pitch memory current even when silent
        if (!e) return;
        for (const c of cues) schedule(e, c, i * 0.002);
      });
    },

    update(state: SimState, realDt: number): void {
      if (!engine) return;
      const e = engine;
      const t = e.ctx.currentTime;
      const separated = state.route.points.length > 0 && state.outcome === 'playing';
      const meter = threadMeter(state.route.length, state.params.tetherCapacity);
      const humTarget = separated ? 0.03 + 0.08 * meter.fraction : 0;
      e.hum.gain.gain.setTargetAtTime(humTarget, t, 0.09);
      for (const o of e.hum.oscs) o.detune.setTargetAtTime(meter.fraction * 70, t, 0.2);
      e.hum.pan?.pan.setTargetAtTime(panFor(state.soul.pos, cueContext(state)), t, 0.1);

      if (state.lanes.length > 0) {
        const lane = ensureLane(e);
        const active = state.lanes.some((l) => l.status === 'active');
        const warning = state.lanes.some((l) => l.status === 'warning');
        lane.gain.gain.setTargetAtTime(active ? 0.09 : warning ? 0.025 : 0, t, 0.06);
      } else if (e.lane) {
        e.lane.gain.gain.setTargetAtTime(0, t, 0.1);
      }

      const danger =
        state.projectiles.some((p) => p.alive) || state.enemies.some((en) => en.phase === 'locked');
      e.musicDuck.gain.setTargetAtTime(danger ? 0.45 : 1, t, danger ? 0.05 : 0.6);

      // Sparse distant bells: the funeral railway beyond the wall.
      bellTimer -= Math.max(0, realDt);
      if (bellTimer <= 0) {
        bellTimer = 5 + decor() * 5;
        if (!muted && !suspended && e.ctx.state === 'running' && !danger) {
          const deg = [0, 1, 2, 4, 5][Math.floor(decor() * 5)] ?? 0;
          e.synth.bell(t + 0.01, degreeHz(deg, 1), {
            gain: 0.03,
            decay: 3,
            attack: 0.02,
            partials: SOUL_PARTIALS,
            pan: (decor() - 0.5) * 1.2,
            send: 0.7,
            out: e.musicDuck,
          });
        }
      }
    },

    setMuted(m: boolean): void {
      muted = m;
      if (engine) engine.master.gain.setTargetAtTime(m ? 0 : 1, engine.ctx.currentTime, 0.012);
      if (m) {
        const now = engine?.ctx.currentTime ?? 0;
        for (const v of live.values()) v.stop(now);
        live.clear();
        limiter.reset();
      }
    },

    setVolumes(music: number, sfx: number): void {
      musicVolume = clamp01(music);
      sfxVolume = clamp01(sfx);
      if (!engine) return;
      const t = engine.ctx.currentTime;
      engine.music.gain.setTargetAtTime(musicVolume * 0.8, t, 0.05);
      engine.sfx.gain.setTargetAtTime(sfxVolume, t, 0.05);
    },

    suspend(): void {
      suspended = true;
      if (engine && engine.ctx.state === 'running') void engine.ctx.suspend().catch(() => {});
    },

    resume(): void {
      suspended = false;
      if (engine && engine.ctx.state !== 'running') void engine.ctx.resume().catch(() => {});
    },

    ui(name: 'tap' | 'open' | 'close' | 'start'): void {
      const e = ready();
      if (!e) return;
      const t = e.ctx.currentTime + 0.005;
      const s = e.synth;
      switch (name) {
        case 'tap':
          s.tick(t, { hz: 1800, q: 1.5, dur: 0.02, gain: 0.06 });
          break;
        case 'open':
          s.bell(t, degreeHz(0, 1), { gain: 0.05, decay: 0.45, send: 0.3 });
          s.bell(t + 0.06, degreeHz(4, 1), { gain: 0.05, decay: 0.5, send: 0.3 });
          break;
        case 'close':
          s.bell(t, degreeHz(4, 1), { gain: 0.05, decay: 0.45, send: 0.3 });
          s.bell(t + 0.06, degreeHz(0, 1), { gain: 0.05, decay: 0.5, send: 0.3 });
          break;
        case 'start':
          // The premise as a motif: body pluck, the soul's late answer, then union.
          play(e, { cue: 'dashPluck', delay: 0, degree: 4, intensity: 0.9, pan: 0.2, variant: '' }, t);
          play(e, { cue: 'soulChime', delay: 0, degree: 4, intensity: 0.7, pan: -0.2, variant: '' }, t + 0.42);
          play(e, { cue: 'reunionChord', delay: 0, degree: 4, intensity: 0.8, pan: 0, variant: 'contact' }, t + 1.0);
          break;
      }
    },

    audition(request): void {
      const e = ready();
      if (!e) return;
      const full: CueRequest = { delay: 0, degree: 4, intensity: 0.85, pan: 0, variant: '', ...request };
      play(e, full, e.ctx.currentTime + 0.005 + full.delay);
    },
  };
}
