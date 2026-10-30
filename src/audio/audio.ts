/**
 * Procedural game audio. No sample files: every sound is synthesized at runtime, so
 * provenance is entirely original. The context is created only from a user gesture
 * (unlock), everything tolerates missing WebAudio, and mute applies instantly.
 *
 * Graph: voices -> sfx bus ┐
 *  music track (or pad/bells fallback) -> music duck -> music bus ┼-> master -> compressor -> out
 *        sends -> courtyard reverb -> return ┘
 */
import { startMusic } from './music';
import type { SimEvent, SimState } from '../sim/types';
import { createCueMemory, cueContext, cuesForEvent, panFor, type CueRequest } from './cues';
import { degreeHz } from './scale';
import { SOUL_PARTIALS, Synth, courtyardImpulse, lcg, type SynthVoice } from './synth';
import { playCue } from './voicing';
import { PhaseWatch, isOpening } from './watch';
import { CUE_SPECS, VoiceLimiter } from './voices';
import { threadMeter } from '../ui/hud-logic';

/** Interface sounds the overlay may request (title, panels, stingers). */
export type UiSound = 'tap' | 'open' | 'close' | 'start' | 'select' | 'take' | 'roomIntro' | 'escaped' | 'failed';

const UI_CUES: Partial<Record<UiSound, CueRequest['cue']>> = {
  select: 'select',
  take: 'relicTake',
  roomIntro: 'roomSting',
  escaped: 'endingEscaped',
  failed: 'endingFailed',
};

export interface GameAudio {
  unlock(): Promise<void>;
  handleEvents(events: readonly SimEvent[], state: SimState): void;
  update(state: SimState, realDt: number): void;
  setMuted(muted: boolean): void;
  setVolumes(music: number, sfx: number): void;
  suspend(): void;
  resume(): void;
  ui(name: UiSound): void;
  /** Additive: audition one cue by name (labs). */
  audition?(request: Partial<CueRequest> & Pick<CueRequest, 'cue'>): void;
  /** Additive: engine status for diagnostics. */
  debug?(): { context: AudioContextState | 'none'; liveVoices: number; muted: boolean };
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
  const phases = new PhaseWatch();
  const memory = createCueMemory();
  const live = new Map<number, SynthVoice>();
  const decor = lcg(0xbe11);
  let bellTimer = 4;
  /** True once the licensed music track is looping (the procedural bells then stay quiet). */
  let trackPlaying = false;

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
    // Licensed track first; the procedural drone and distant bells only if it cannot play.
    void startMusic(ctx, musicDuck).then((ok) => {
      if (ok) trackPlaying = true;
      else buildPad(ctx, musicDuck);
    });
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

  function schedule(e: Engine, r: CueRequest, offset = 0): void {
    const spec = CUE_SPECS[r.cue];
    const now = e.ctx.currentTime;
    const admission = limiter.admit(r.cue, spec, now + r.delay, spec.duration);
    if (!admission.admit) return;
    for (const id of admission.steal) {
      live.get(id)?.stop(now);
      live.delete(id);
    }
    const voice = playCue(e.synth, r, now + 0.005 + r.delay + offset);
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
      } catch (err) {
        // Audio is optional; the game stays fully playable muted.
        console.warn('Audio unavailable:', err);
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

      // A warden opening up has no event of its own: chime the frame it happens.
      const openings = phases.observe(state.room.id, state.tick, state.enemies).filter(isOpening);
      if (openings.length > 0) {
        const live = ready();
        const ctx = cueContext(state);
        if (live) {
          for (const o of openings) {
            schedule(live, { cue: 'exposedChime', delay: 0, degree: 0, intensity: 0.85, pan: panFor(o.pos, ctx), variant: '' });
          }
        }
      }

      const bossPhase = state.boss?.phase;
      const danger =
        state.projectiles.some((p) => p.alive) ||
        state.enemies.some((en) => en.phase === 'locked') ||
        bossPhase === 'aimCharge' ||
        bossPhase === 'charge' ||
        bossPhase === 'aimFan';
      e.musicDuck.gain.setTargetAtTime(danger ? 0.45 : 1, t, danger ? 0.05 : 0.6);

      // Sparse distant bells: the funeral railway beyond the wall.
      bellTimer -= Math.max(0, realDt);
      if (bellTimer <= 0) {
        bellTimer = 5 + decor() * 5;
        if (!trackPlaying && !muted && !suspended && e.ctx.state === 'running' && !danger) {
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

    ui(name: UiSound): void {
      const e = ready();
      if (!e) return;
      const t = e.ctx.currentTime + 0.005;
      const s = e.synth;
      const mapped = UI_CUES[name];
      if (mapped) {
        playCue(s, { cue: mapped, delay: 0, degree: 4, intensity: 0.85, pan: 0, variant: '' }, t);
        return;
      }
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
          playCue(e.synth, { cue: 'dashPluck', delay: 0, degree: 4, intensity: 0.9, pan: 0.2, variant: '' }, t);
          playCue(e.synth, { cue: 'soulChime', delay: 0, degree: 4, intensity: 0.7, pan: -0.2, variant: '' }, t + 0.42);
          playCue(e.synth, { cue: 'reunionChord', delay: 0, degree: 4, intensity: 0.8, pan: 0, variant: 'contact' }, t + 1.0);
          break;
      }
    },

    debug() {
      return { context: engine ? engine.ctx.state : 'none', liveVoices: live.size, muted };
    },

    audition(request): void {
      const e = ready();
      if (!e) return;
      const full: CueRequest = { delay: 0, degree: 4, intensity: 0.85, pan: 0, variant: '', ...request };
      playCue(e.synth, full, e.ctx.currentTime + 0.005 + full.delay);
    },
  };
}
