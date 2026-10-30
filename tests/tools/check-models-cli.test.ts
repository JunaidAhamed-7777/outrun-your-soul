import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildGlb } from './glb-builder';

const script = join(process.cwd(), 'scripts', 'check-models.mjs');
let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function run(models: string, fixtures: string, out: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [script, '--models', models, '--fixtures', fixtures, '--out', out], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, stdout: e.stdout };
  }
}

describe('check-models CLI', () => {
  it('passes conforming models, records fixtures as non-shipping and writes the JSON report', () => {
    dir = mkdtempSync(join(tmpdir(), 'oys-models-'));
    const models = join(dir, 'models');
    const fixtures = join(dir, 'exports');
    mkdirSync(models);
    mkdirSync(fixtures);
    writeFileSync(join(models, 'floor_tile.glb'), buildGlb({ nodes: [{ name: 'floor_tile', children: [1] }, { name: 'floor_tile_slab', mesh: 0 }], roots: [0] }));
    writeFileSync(join(fixtures, 'calibration_tile.glb'), buildGlb({ nodes: [{ name: 'calibration_tile', mesh: 0 }], roots: [0] }));
    const out = join(dir, 'report.json');
    const result = run(models, fixtures, out);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PASS: 2 model file(s) checked');
    const report = JSON.parse(readFileSync(out, 'utf8'));
    expect(report.summary).toMatchObject({ shipping: 1, fixtures: 1, failed: 0, shippingTriangles: 2 });
    expect(report.models[1]).toMatchObject({ assetId: 'calibration_tile', shipping: false, status: 'pass' });
    expect(report.models[0].khronos.numErrors).toBe(0);
    expect(JSON.stringify(report)).not.toMatch(/"(timestamp|createdAt|generatedAt)"/);
  });

  it('fails when a calibration fixture is placed in the shipping folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'oys-models-'));
    const models = join(dir, 'models');
    mkdirSync(models);
    writeFileSync(join(models, 'calibration_tile.glb'), buildGlb({ nodes: [{ name: 'calibration_tile', mesh: 0 }], roots: [0] }));
    const result = run(models, join(dir, 'none'), join(dir, 'report.json'));
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/must not be in the shipping models folder/);
  });

  it('fails a malformed GLB without crashing', () => {
    dir = mkdtempSync(join(tmpdir(), 'oys-models-'));
    const models = join(dir, 'models');
    mkdirSync(models);
    writeFileSync(join(models, 'wall_block.glb'), 'not a glb at all');
    const result = run(models, join(dir, 'none'), join(dir, 'report.json'));
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/malformed GLB/);
  });
});
