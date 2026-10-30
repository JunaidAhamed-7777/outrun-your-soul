import { describe, expect, it } from 'vitest';
import { MUSIC_TRACK, pickMusicUrl } from '../../src/audio/music';
import { existsSync } from 'node:fs';

describe('music track', () => {
  it('prefers Ogg Vorbis and falls back to AAC for browsers without it', () => {
    const all = () => 'probably';
    const aacOnly = (m: string) => (m.startsWith('audio/mp4') ? 'maybe' : '');
    expect(pickMusicUrl(MUSIC_TRACK, all, './')).toBe('./assets/audio/cathedral_in_the_forest.ogg');
    expect(pickMusicUrl(MUSIC_TRACK, aacOnly, './')).toBe('./assets/audio/cathedral_in_the_forest.m4a');
    expect(pickMusicUrl(MUSIC_TRACK, () => '', './')).toBeNull();
  });

  it('ships every listed file and records a CC0 licence', () => {
    for (const [path] of MUSIC_TRACK.files) expect(existsSync(`public/assets/audio/${path}`)).toBe(true);
    expect(MUSIC_TRACK.license).toMatch(/CC0/);
  });
});
