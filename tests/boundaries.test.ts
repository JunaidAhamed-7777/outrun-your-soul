import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Collect every .ts file under a directory. */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const importPattern = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Source text with comments removed, so prose like "time window" is not flagged. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(importPattern)].map((m) => m[1] ?? m[2] ?? '');
}

describe('architecture boundaries', () => {
  it('simulation never imports Three.js, the renderer, input, audio, UI or assets', () => {
    const offenders: string[] = [];
    for (const file of tsFiles('src/sim')) {
      for (const spec of importsOf(file)) {
        const external = !spec.startsWith('.');
        const leavesSim = spec.startsWith('..');
        if ((external && spec !== 'vitest') || leavesSim) offenders.push(`${file} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('simulation never touches DOM or wall-clock globals', () => {
    const banned = /\b(window|document|performance\.now|Date\.now|Math\.random|requestAnimationFrame|localStorage)\b/;
    const offenders = tsFiles('src/sim').filter((file) => banned.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
