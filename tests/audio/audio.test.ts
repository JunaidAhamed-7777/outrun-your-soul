import { describe, expect, it } from 'vitest';
import { createAudio } from '../../src/audio/audio';

describe('createAudio without WebAudio', () => {
  it('returns a silent implementation that never throws', async () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    const audio = createAudio();
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => {
      audio.setMuted(true);
      audio.setVolumes(0.5, 0.5);
      audio.suspend();
      audio.resume();
      audio.ui('start');
      audio.handleEvents([], {} as never);
      audio.update({} as never, 0.016);
    }).not.toThrow();
  });
});
