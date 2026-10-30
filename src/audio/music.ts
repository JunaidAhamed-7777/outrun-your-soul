/**
 * Background music: one licensed, seamlessly looping track played into the music bus
 * (so danger ducking, mute, volume and suspend apply). If it cannot be fetched or
 * decoded, the caller falls back to the procedural drone.
 *
 * Provenance lives in art/provenance-audio.csv; credit is shown in the README.
 */

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly license: string;
  readonly source: string;
  /** Published files, best first: [path under assets/audio, MIME type for canPlayType]. */
  readonly files: readonly (readonly [string, string])[];
}

export const MUSIC_TRACK: MusicTrack = {
  id: 'cathedral_in_the_forest',
  title: 'Cathedral in the forest (ambient loop)',
  author: 'congusbongus',
  license: 'CC0 1.0 (public domain dedication)',
  source: 'https://opengameart.org/content/cathedral-in-the-forest-ambient-loop',
  files: [
    ['cathedral_in_the_forest.ogg', 'audio/ogg; codecs="vorbis"'],
    // AAC copy for browsers without Ogg Vorbis (older iOS Safari).
    ['cathedral_in_the_forest.m4a', 'audio/mp4; codecs="mp4a.40.2"'],
  ],
};

/** Relative level of the track inside the music bus (the bus applies the user's volume). */
export const MUSIC_LEVEL = 0.55;
/** Fade-in after the first decode, seconds. */
export const MUSIC_FADE_IN = 3;

/** First file the browser reports it can play, as a base-relative URL; null if none. */
export function pickMusicUrl(
  track: MusicTrack,
  canPlayType: (mime: string) => string,
  base: string,
): string | null {
  for (const [path, mime] of track.files) {
    if (canPlayType(mime) !== '') return `${base}assets/audio/${path}`;
  }
  return null;
}

function browserCanPlay(mime: string): string {
  try {
    return typeof document === 'undefined' ? '' : document.createElement('audio').canPlayType(mime);
  } catch {
    return '';
  }
}

/**
 * Fetch, decode and loop the track into `out`. Resolves true once playing; false (never
 * throws) when the browser can play none of the files or loading fails.
 */
export async function startMusic(ctx: AudioContext, out: AudioNode, track: MusicTrack = MUSIC_TRACK): Promise<boolean> {
  const url = pickMusicUrl(track, browserCanPlay, import.meta.env.BASE_URL);
  if (!url) return false;
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, t + MUSIC_FADE_IN);
    source.connect(gain).connect(out);
    source.start();
    return true;
  } catch {
    return false;
  }
}
