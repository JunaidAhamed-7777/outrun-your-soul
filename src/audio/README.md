# Procedural audio

Every sound in the game is synthesized at runtime with the Web Audio API. There are
no sample files, loops or third-party sound assets, so audio provenance is entirely
original code in this directory.

- `cues.ts` maps each simulation event to named cues (exhaustive over `SimEvent`).
- `voicing.ts` defines how each cue sounds from the primitives in `synth.ts`.
- `pluck.ts` renders Karplus–Strong plucks offline (seeded, deterministic).
- `voices.ts` budgets polyphony: group caps, per-cue debounce, priority stealing.
- `audio.ts` owns the context, buses, courtyard reverb, the soul hum (louder as the
  thread lengthens), the lane hum, and a sparse ducked drone in D Lydian.

Identity: an outward dash plucks a bright string for the body; the soul answers the
same pitch class an octave lower a moment later; a reunion slides both tones into
unison before a chord blooms. RETURN is a gathering swell with no transient, never an
attack sound. Needler (body-targeting) warning ticks sit higher than Keeper
(soul-targeting) ticks; a locked warning is a sharp double tick.

The game is fully playable muted. Without Web Audio, `createAudio()` returns a silent
implementation. Use `ui-lab.html` (dev server) to audition every cue; its
`labRenderCues()` renders each cue through an `OfflineAudioContext` and reports
peak/RMS so voicing can be checked without a user gesture.
