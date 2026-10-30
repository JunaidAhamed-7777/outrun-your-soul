import { describe, expect, it } from 'vitest';
import { CONTINUE_LABEL } from '../../src/save/checkpoint';
import { CONTINUE_CAPTION, ROOM_INTRO_MS } from '../../src/ui/ui';
import { ESCAPED_LINE, atlasLine } from '../../src/ui/run-panels';

describe('run panel copy', () => {
  it('uses the exact checkpoint wording under Continue', () => {
    expect(CONTINUE_CAPTION).toBe(CONTINUE_LABEL);
  });

  it('keeps the escaped ending line', () => {
    expect(ESCAPED_LINE).toBe('Body and soul pass the last gate together.');
  });

  it('summarises new atlas discoveries in one line', () => {
    expect(atlasLine([])).toBe('No new atlas entries this time.');
    expect(atlasLine(['Glass Crossing', 'Mourning Bell'])).toBe('New in the atlas: Glass Crossing, Mourning Bell.');
  });

  it('keeps the room intro brief', () => {
    expect(ROOM_INTRO_MS).toBeGreaterThanOrEqual(1200);
    expect(ROOM_INTRO_MS).toBeLessThanOrEqual(2000);
  });
});
