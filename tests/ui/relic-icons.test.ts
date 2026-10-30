import { describe, expect, it } from 'vitest';
import { RELIC_IDS } from '../../src/run/relics';
import { RELIC_ICON_IDS, relicFamily, relicIconSvg } from '../../src/ui/relic-icons';

describe('relic icons', () => {
  it('has a distinct symbol for every relic', () => {
    expect([...RELIC_ICON_IDS].sort()).toEqual([...RELIC_IDS].sort());
    const bodies = RELIC_IDS.map((id) => relicIconSvg(id).replace(/fam-\w+/, ''));
    expect(new Set(bodies).size).toBe(RELIC_IDS.length);
  });

  it('produces balanced, sized, decorative SVG markup', () => {
    for (const id of RELIC_IDS) {
      const svg = relicIconSvg(id, 64);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('width="64"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toMatch(/oys-acc-[sf]/);
      expect(svg).not.toMatch(/<script|on\w+=/i);
    }
  });

  it('colours by family and degrades gracefully for unknown ids', () => {
    expect(relicFamily('needlesong')).toBe('interception');
    expect(relicFamily('long_silk')).toBe('reach');
    expect(relicFamily('mourning_bell')).toBe('reunion');
    expect(relicIconSvg('mystery')).toContain('fam-unknown');
  });
});
