/**
 * Cue voicing: how each named cue sounds, built from Synth primitives. Separate from
 * the engine so every cue can be rendered offline (OfflineAudioContext) for checks.
 */
import type { CueRequest } from './cues';
import { degreeHz, REUNION_BRIGHT, REUNION_CHORD } from './scale';
import { BELL_PARTIALS, GLASS_PARTIALS, SOUL_PARTIALS, group, type Synth, type SynthVoice } from './synth';

/** Low, inharmonic, quickly damped partials: metal struck through armour. */
const CLANG_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.41, 0.55, 0.6],
  [3.93, 0.3, 0.4],
  [5.17, 0.16, 0.3],
];

export function playCue(s: Synth, r: CueRequest, t: number): SynthVoice {
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
      return group([
        s.sweep(t, { type: 'bandpass', from: 700, to: 2800, q: 1.1, attack: 0.02, dur: 0.24, gain: 0.55 * k, pan, send: 0.15 }),
        s.blip(t, { from: 900, to: 1500, dur: 0.12, attack: 0.004, gain: 0.05 * k, pan }),
      ]);
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
        : s.tick(t, { hz: 700, q: 1, dur: 0.035, gain: 0.22 * k, pan });
    case 'fizzle':
      return s.tick(t, { hz: 4200, q: 2, dur: 0.03, gain: 0.09 * k, pan });
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
    case 'select':
      return group([
        s.pluck(t, degreeHz(4, 0), { gain: 0.22 * k, brightness: 0.6, t60: 0.5, pan, send: 0.2 }),
        s.bell(t + 0.04, degreeHz(4, 1), { gain: 0.03 * k, decay: 0.4, partials: SOUL_PARTIALS, pan, send: 0.3 }),
      ]);
    case 'relicTake':
      return group([
        s.bell(t, degreeHz(0, -1), { gain: 0.09 * k, decay: 1.4, attack: 0.01, partials: SOUL_PARTIALS, send: 0.4 }),
        ...[4, 7, 9, 11].map((deg, i) =>
          s.bell(t + 0.05 + i * 0.045, degreeHz(deg, 0), { gain: 0.05 * k, decay: 1.1, attack: 0.003, partials: BELL_PARTIALS, pan: (i - 1.5) * 0.25, send: 0.45 }),
        ),
      ]);
    case 'roomSting':
      return group([
        s.bell(t, degreeHz(0, -1), { gain: 0.1 * k, decay: 1.3, attack: 0.015, send: 0.5 }),
        s.bell(t + 0.2, degreeHz(4, -1), { gain: 0.08 * k, decay: 1.1, attack: 0.03, partials: SOUL_PARTIALS, send: 0.55 }),
        s.sweep(t, { type: 'bandpass', from: 300, to: 900, q: 0.9, attack: 0.25, dur: 0.6, gain: 0.05 * k, swell: true, send: 0.3 }),
      ]);
    case 'endingEscaped': {
      const voices = [0, 2, 4, 6, 7, 9, 11, 14].map((deg, i) =>
        s.pluck(t + i * 0.085, degreeHz(deg, 0), { gain: 0.26 * k, brightness: 0.75, t60: 1.2, pan: (i / 7 - 0.5) * 0.8, send: 0.3 }),
      );
      voices.push(s.bell(t + 0.7, degreeHz(0, 0), { gain: 0.1 * k, decay: 1.2, partials: SOUL_PARTIALS, detuneFrom: 60, glide: 0.2, send: 0.4 }));
      voices.push(s.bell(t + 0.7, degreeHz(0, -1), { gain: 0.1 * k, decay: 1.2, partials: SOUL_PARTIALS, detuneFrom: -60, glide: 0.2, send: 0.4 }));
      for (const [i, deg] of [0, 4, 7, 9, 14].entries()) {
        voices.push(s.bell(t + 0.95 + i * 0.03, degreeHz(deg, 0), { gain: 0.06 * k, decay: 3, attack: 0.02, send: 0.55 }));
      }
      return group(voices);
    }
    case 'endingFailed': {
      const fall = [440, 392, 349.23, 293.66, 220, 146.83];
      const voices = fall.map((hz, i) =>
        s.bell(t + i * 0.34, hz, { gain: 0.075 * k, decay: 1.4, attack: 0.02, partials: SOUL_PARTIALS, send: 0.55 }),
      );
      voices.push(s.blip(t + 0.2, { from: degreeHz(0, 0), to: degreeHz(0, -2), dur: 2.6, attack: 0.1, gain: 0.07 * k }));
      voices.push(s.sweep(t, { type: 'lowpass', from: 900, to: 160, q: 0.6, attack: 0.4, dur: 2.4, gain: 0.05 * k, send: 0.3 }));
      return group(voices);
    }
    case 'boost':
      return group([
        s.blip(t, { from: degreeHz(0, 0), to: degreeHz(4, 1), dur: 0.22, attack: 0.01, gain: 0.08 * k, pan }),
        s.sweep(t, { type: 'highpass', from: 1800, to: 5200, q: 0.8, attack: 0.03, dur: 0.25, gain: 0.07 * k, pan, send: 0.2 }),
      ]);
    case 'bellCharge':
      // A small struck bell per kill, rising with progress; the full charge rings out.
      return r.variant === 'full'
        ? group([
            s.bell(t, degreeHz(0, 0), { gain: 0.13 * k, decay: 1.4, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.45 }),
            s.bell(t + 0.03, degreeHz(4, 0), { gain: 0.06 * k, decay: 1.1, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.45 }),
            s.bell(t + 0.06, degreeHz(7, 0), { gain: 0.04 * k, decay: 0.9, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.45 }),
          ])
        : s.bell(t, degreeHz(r.degree, 1), { gain: 0.07 * k, decay: 0.6, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.35 });
    case 'bellBurst':
      // The Mourning Bell tolls: a deep struck bell with a long hum, then the air moves.
      return group([
        s.bell(t, degreeHz(0, -2), { gain: 0.26 * k, decay: 3.2, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.6 }),
        s.bell(t, degreeHz(0, -1), { gain: 0.14 * k, decay: 2.4, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.6 }),
        s.bell(t + 0.01, degreeHz(4, -1), { gain: 0.05 * k, decay: 1.8, attack: 0.002, partials: SOUL_PARTIALS, pan, send: 0.6 }),
        s.sweep(t + 0.02, { type: 'lowpass', from: 200, to: 2600, q: 0.9, attack: 0.03, dur: 0.6, gain: 0.3 * k, pan }),
        s.blip(t, { from: 120, to: 45, dur: 0.4, gain: 0.3 * k, pan }),
      ]);
    case 'decoyPlace':
      return group([
        s.pluck(t, degreeHz(2, 1), { gain: 0.2 * k, brightness: 0.8, t60: 0.4, pan, send: 0.2 }),
        s.tick(t + 0.06, { hz: 2200, q: 2, dur: 0.02, gain: 0.08 * k, pan }),
      ]);
    case 'decoyTake':
      return group([
        s.pluck(t, degreeHz(5, 0), { gain: 0.24 * k, brightness: 0.7, t60: 0.5, pan, send: 0.2 }),
        s.blip(t + 0.02, { from: degreeHz(5, 0), to: degreeHz(1, 0), dur: 0.18, attack: 0.005, gain: 0.05 * k, pan }),
      ]);
    case 'guardClang':
      return group([
        s.bell(t, 196, { gain: 0.2 * k, decay: 0.45, attack: 0.001, partials: CLANG_PARTIALS, pan, send: 0.25 }),
        s.crunch(t, { gain: 0.12 * k, dur: 0.08, lowpass: 1200, pan }),
        s.blip(t, { from: 110, to: 60, dur: 0.16, gain: 0.25 * k, pan }),
      ]);
    case 'sweepWhoosh':
      return group([
        s.sweep(t, { type: 'lowpass', from: 300, to: 2600, q: 1.2, attack: 0.08, dur: 0.42, gain: 0.62 * k, pan, send: 0.2 }),
        s.buzz(t, { freqs: [degreeHz(0, -3)], from: 160, to: 420, attack: 0.08, dur: 0.35, gain: 0.07 * k }),
      ]);
    case 'exposedChime':
      return group([
        s.bell(t, degreeHz(4, 1), { gain: 0.09 * k, decay: 0.7, attack: 0.002, partials: GLASS_PARTIALS, pan, send: 0.35 }),
        s.bell(t + 0.09, degreeHz(7, 1), { gain: 0.09 * k, decay: 0.8, attack: 0.002, partials: GLASS_PARTIALS, pan, send: 0.35 }),
      ]);
    case 'boostEnd':
      return s.blip(t, { from: degreeHz(4, 1), to: degreeHz(0, 0), dur: 0.22, attack: 0.02, gain: 0.035 * k, pan });
    case 'haloShimmer':
      // Barely there: the halo is shown visually; sound only hints that a bolt slowed.
      return s.bell(t, degreeHz(r.variant === 'exit' ? 4 : 6, 2), {
        gain: 0.014 * k,
        decay: 0.28,
        attack: 0.01,
        partials: GLASS_PARTIALS,
        pan,
        send: 0.4,
      });
    case 'knotMark':
      return group([
        s.pluck(t, degreeHz(1, 1), { gain: 0.14 * k, brightness: 0.7, t60: 0.35, pan, send: 0.2 }),
        s.pluck(t + 0.07, degreeHz(3, 1), { gain: 0.14 * k, brightness: 0.7, t60: 0.4, pan, send: 0.2 }),
      ]);
    case 'decoyClaim':
      // A sentry's eye drawn to the knot: a falling lure call.
      return group([
        s.blip(t, { from: degreeHz(5, 1), to: degreeHz(2, 1), dur: 0.2, attack: 0.01, gain: 0.07 * k, pan }),
        s.tick(t, { hz: 2400, q: 3, dur: 0.02, gain: 0.06 * k, pan }),
      ]);
    case 'wardenWindup':
      // Metal drawn across stone: low, scraping and slow, nothing like a sentry tick.
      return group([
        s.sweep(t, { type: 'bandpass', from: 380, to: 1500, q: 6, attack: 0.55, dur: 0.15, gain: 0.32 * k, swell: true, pan, send: 0.2 }),
        s.buzz(t, { freqs: [82.4, 87.3], from: 180, to: 520, attack: 0.5, dur: 0.25, gain: 0.12 * k }),
      ]);
    case 'bossWake':
      return group([
        s.buzz(t, { freqs: [degreeHz(0, -3), degreeHz(4, -3)], from: 110, to: 700, attack: 1.0, dur: 0.9, gain: 0.2 * k, send: 0.4 }),
        s.bell(t + 0.2, degreeHz(0, -2), { gain: 0.18 * k, decay: 2.6, attack: 0.01, partials: CLANG_PARTIALS, send: 0.6 }),
        s.bell(t + 0.2, 77.78, { gain: 0.1 * k, decay: 2.2, attack: 0.01, partials: CLANG_PARTIALS, send: 0.6 }),
      ]);
    case 'bossTelegraph': {
      // Ominous low tolls a semitone apart under a rising rumble; a fan tolls three times.
      const rumble = s.sweep(t, { type: 'lowpass', from: 80, to: 620, q: 1.4, attack: 0.9, dur: 0.15, gain: 0.22 * k, swell: true, pan, send: 0.3 });
      if (r.variant === 'fan') {
        return group([
          rumble,
          ...[146.83, 138.59, 130.81].map((hz, i) =>
            s.bell(t + i * 0.16, hz, { gain: 0.12 * k, decay: 1.0, attack: 0.004, partials: CLANG_PARTIALS, pan: (i - 1) * 0.4, send: 0.5 }),
          ),
        ]);
      }
      return group([
        rumble,
        s.bell(t, 73.42, { gain: 0.2 * k, decay: 1.6, attack: 0.004, partials: CLANG_PARTIALS, pan, send: 0.5 }),
        s.bell(t + 0.02, 77.78, { gain: 0.12 * k, decay: 1.4, attack: 0.004, partials: CLANG_PARTIALS, pan, send: 0.5 }),
      ]);
    }
    case 'bossCharge':
      return group([
        s.sweep(t, { type: 'lowpass', from: 150, to: 1900, q: 1.1, attack: 0.05, dur: 0.55, gain: 0.55 * k, pan, send: 0.25 }),
        s.blip(t, { from: 92, to: 40, dur: 0.45, gain: 0.4 * k, pan }),
        s.crunch(t, { gain: 0.1 * k, dur: 0.12, lowpass: 900, pan }),
      ]);
    case 'bossFan':
      return group([
        ...[-0.55, 0, 0.55].map((p, i) =>
          s.sweep(t + i * 0.03, { type: 'bandpass', from: 600, to: 2400, q: 1.2, attack: 0.02, dur: 0.26, gain: 0.4 * k, pan: p, send: 0.15 }),
        ),
        s.blip(t, { from: 110, to: 60, dur: 0.18, gain: 0.25 * k, pan }),
      ]);
    case 'bossHeartHit':
      // A deep resonant strike on the warden's heart: the room rings.
      return group([
        s.bell(t, 55, { gain: 0.36 * k, decay: 3.0, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.7 }),
        s.bell(t, 110, { gain: 0.16 * k, decay: 2.2, attack: 0.002, partials: BELL_PARTIALS, pan, send: 0.7 }),
        s.bell(t + 0.01, 1661, { gain: 0.05 * k, decay: 0.6, attack: 0.001, partials: GLASS_PARTIALS, pan, send: 0.4 }),
        s.crunch(t, { gain: 0.18 * k, dur: 0.07, lowpass: 2000, pan }),
        s.blip(t, { from: 160, to: 38, dur: 0.5, gain: 0.35 * k, pan }),
      ]);
    case 'bossStagger':
      return group([
        s.blip(t, { from: 180, to: 55, dur: 0.85, attack: 0.02, gain: 0.13 * k, type: 'sawtooth', lowpass: 600, pan }),
        s.bell(t, 146.83, { gain: 0.12 * k, decay: 0.7, attack: 0.002, partials: CLANG_PARTIALS, pan, send: 0.35 }),
      ]);
    case 'bossReunite':
      // A dark mirror of the player's reunion: two tones converge into a low minor chord.
      return group([
        s.bell(t, 146.83, { gain: 0.07 * k, decay: 0.9, partials: SOUL_PARTIALS, detuneFrom: 60, glide: 0.15, pan, send: 0.4 }),
        s.bell(t, 73.42, { gain: 0.07 * k, decay: 1.0, partials: SOUL_PARTIALS, detuneFrom: -60, glide: 0.15, pan, send: 0.4 }),
        ...[146.83, 174.61, 220].map((hz, i) =>
          s.bell(t + 0.14 + i * 0.04, hz, { gain: 0.045 * k, decay: 1.4, attack: 0.02, partials: SOUL_PARTIALS, pan, send: 0.5 }),
        ),
      ]);
    case 'bossDefeated': {
      // Dissonance, the dominant, then a wide resolving tonic with the pair's motif on top.
      const voices = [
        s.bell(t, 73.42, { gain: 0.14 * k, decay: 1.2, attack: 0.004, partials: CLANG_PARTIALS, send: 0.6 }),
        s.bell(t, 77.78, { gain: 0.1 * k, decay: 1.0, attack: 0.004, partials: CLANG_PARTIALS, send: 0.6 }),
      ];
      for (const [i, hz] of [110, 138.59, 164.81, 220].entries()) {
        voices.push(s.bell(t + 0.6 + i * 0.05, hz, { gain: 0.06 * k, decay: 1.2, attack: 0.01, send: 0.5 }));
      }
      for (const [i, deg] of [-7, -3, 0, 2, 4, 8].entries()) {
        voices.push(s.bell(t + 1.3 + i * 0.03, degreeHz(deg, 0), { gain: 0.06 * k, decay: 3.6, attack: 0.02, send: 0.6 }));
      }
      for (const [i, deg] of [0, 2, 4, 7].entries()) {
        voices.push(s.pluck(t + 1.35 + i * 0.09, degreeHz(deg, 1), { gain: 0.18 * k, brightness: 0.75, t60: 1.2, pan: (i - 1.5) * 0.3, send: 0.35 }));
      }
      voices.push(s.blip(t + 1.3, { from: 55, to: 36.7, dur: 1.5, attack: 0.05, gain: 0.2 * k }));
      return group(voices);
    }
    case 'wake':
      return group([
        s.blip(t, { from: 98, to: 87, dur: 0.45, attack: 0.08, gain: 0.16 * k }),
        s.sweep(t, { type: 'bandpass', from: 240, to: 180, q: 2, attack: 0.1, dur: 0.35, gain: 0.05 * k }),
      ]);
  }
}
