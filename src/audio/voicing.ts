/**
 * Cue voicing: how each named cue sounds, built from Synth primitives. Separate from
 * the engine so every cue can be rendered offline (OfflineAudioContext) for checks.
 */
import type { CueRequest } from './cues';
import { degreeHz, REUNION_BRIGHT, REUNION_CHORD } from './scale';
import { GLASS_PARTIALS, SOUL_PARTIALS, group, type Synth, type SynthVoice } from './synth';

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
    case 'wake':
      return group([
        s.blip(t, { from: 98, to: 87, dur: 0.45, attack: 0.08, gain: 0.16 * k }),
        s.sweep(t, { type: 'bandpass', from: 240, to: 180, q: 2, attack: 0.1, dur: 0.35, gain: 0.05 * k }),
      ]);
  }
}
