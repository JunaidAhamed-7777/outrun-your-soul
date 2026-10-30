import { describe, expect, it } from 'vitest';
import { analyzeGltf, parseGlb } from '../../scripts/lib/glb.mjs';
import { validateGlbBytes } from '../../scripts/lib/khronos.mjs';
import { buildGlb, type NodeSpec } from './glb-builder';

const floorTile = () =>
  buildGlb({ nodes: [{ name: 'floor_tile', children: [1] }, { name: 'floor_tile_slab', mesh: 0 }], roots: [0] });

describe('GLB parsing', () => {
  it('parses header, JSON and BIN chunks', () => {
    const glb = parseGlb(floorTile());
    expect(glb.version).toBe(2);
    expect(glb.json.nodes[0].name).toBe('floor_tile');
    expect(glb.bin?.byteLength).toBe(60);
  });

  it('rejects bad magic, wrong version and truncated files', () => {
    const bytes = floorTile();
    const badMagic = bytes.slice();
    badMagic[0] = 0;
    expect(() => parseGlb(badMagic)).toThrow(/magic/);
    const badVersion = bytes.slice();
    new DataView(badVersion.buffer).setUint32(4, 1, true);
    expect(() => parseGlb(badVersion)).toThrow(/version/);
    expect(() => parseGlb(bytes.subarray(0, bytes.byteLength - 4))).toThrow(/length/);
  });
});

describe('asset contract analysis', () => {
  it('passes a contract-conforming floor tile and reports stats', () => {
    const a = analyzeGltf(parseGlb(floorTile()).json, 'floor_tile');
    expect(a.errors).toEqual([]);
    expect(a.warnings).toEqual([]);
    expect(a.triangles).toBe(2);
    expect(a.materials).toEqual(['cobalt']);
    expect(a.bounds?.size).toEqual([1, 0, 1]);
    expect(a.category).toBe('module');
  });

  it('requires exactly one root node named after the asset ID', () => {
    const wrongName = analyzeGltf(parseGlb(floorTile()).json, 'wall_block');
    expect(wrongName.errors.join()).toMatch(/root node is named "floor_tile", expected "wall_block"/);
    const twoRoots = buildGlb({ nodes: [{ name: 'floor_tile', mesh: 0 }, { name: 'floor_tile_b', mesh: 0 }], roots: [0, 1] });
    expect(analyzeGltf(parseGlb(twoRoots).json, 'floor_tile').errors.join()).toMatch(/exactly one root node/);
  });

  it('rejects cameras and lights', () => {
    const withCamera = buildGlb({
      nodes: [{ name: 'floor_tile', children: [1, 2] }, { name: 'floor_tile_slab', mesh: 0 }, { name: 'floor_tile_cam', camera: 0 }],
      roots: [0],
      extraJson: { cameras: [{ type: 'orthographic', orthographic: { xmag: 1, ymag: 1, znear: 0.1, zfar: 10 } }] },
    });
    expect(analyzeGltf(parseGlb(withCamera).json, 'floor_tile').errors.join()).toMatch(/cameras/);
    const withLight = buildGlb({
      nodes: [{ name: 'floor_tile', mesh: 0 }],
      roots: [0],
      extraJson: { extensionsUsed: ['KHR_lights_punctual'], extensions: { KHR_lights_punctual: { lights: [{ type: 'directional' }] } } },
    });
    expect(analyzeGltf(parseGlb(withLight).json, 'floor_tile').errors.join()).toMatch(/lights/);
  });

  it('flags tile modules outside the [0,1] grid cell and unit-scale slips', () => {
    const shifted = buildGlb({ nodes: [{ name: 'wall_block', mesh: 0, translation: [-0.5, 0, 0.5] }], roots: [0] });
    expect(analyzeGltf(parseGlb(shifted).json, 'wall_block').errors.join()).toMatch(/\[0,1\]x\[0,1\]/);
    const centimetres = buildGlb({ nodes: [{ name: 'floor_tile', mesh: 0 }], roots: [0], quadScale: 100.5 });
    expect(analyzeGltf(parseGlb(centimetres).json, 'floor_tile').errors.join()).toMatch(/scale slip/);
  });

  it('warns on unprefixed parts, missing contract parts, root rotation and mirrored transforms', () => {
    const glb = buildGlb({
      nodes: [
        { name: 'needler', rotation: [0, 0.7071068, 0, 0.7071068], children: [1, 2] },
        { name: 'Cube.046', mesh: 0 },
        { name: 'needler_head', mesh: 0, scale: [-0.3, 0.3, 0.3] },
      ],
      roots: [0],
      quadScale: 0.3,
    });
    const a = analyzeGltf(parseGlb(glb).json, 'needler');
    const warnings = a.warnings.join('\n');
    expect(warnings).toMatch(/not named "needler_<part>": Cube\.046/);
    expect(warnings).toMatch(/needler_base, needler_muzzle/);
    expect(warnings).toMatch(/root node has a rotation/);
    expect(warnings).toMatch(/negative scale/);
  });

  it('holds the boss to the Warden row: materials over 3 warn, triangles over 4000 fail', () => {
    const json = parseGlb(buildGlb({ nodes: [{ name: 'last_warden_heart', mesh: 0 }], roots: [0], quadScale: 0.5 })).json;
    json.meshes[0].primitives = [0, 1, 2, 3].map((material) => ({ ...json.meshes[0].primitives[0], material }));
    json.materials = ['gold', 'gold_dark', 'vermilion', 'vermilion_dark'].map((name) => ({ name }));
    const a = analyzeGltf(json, 'last_warden_heart');
    expect(a.category).toBe('boss');
    expect(a.errors).toEqual([]);
    expect(a.warnings.join()).toMatch(/4 materials exceeds 3/);
  });

  it('enforces triangle budgets and counts instanced meshes per node', () => {
    // 401 instances of a 2-triangle quad = 802 triangles > 800 module budget.
    const children = Array.from({ length: 401 }, (_, i) => i + 1);
    const nodes: NodeSpec[] = [{ name: 'wall_block', children }];
    for (let i = 0; i < 401; i++) nodes.push({ name: `wall_block_part${i}`, mesh: 0, scale: [0.01, 1, 0.01] });
    const a = analyzeGltf(parseGlb(buildGlb({ nodes, roots: [0] })).json, 'wall_block');
    expect(a.triangles).toBe(802);
    expect(a.errors.join()).toMatch(/802 triangles exceeds budget 800/);
  });
});

describe('Khronos glTF Validator integration', () => {
  it('reports zero errors for the hand-built tile', async () => {
    const report = await validateGlbBytes(floorTile(), 'floor_tile.glb');
    expect(report.numErrors).toBe(0);
    expect(report.validatorVersion).toMatch(/^2\./);
  });

  it('reports errors for a structurally broken GLB', async () => {
    const bytes = floorTile();
    new DataView(bytes.buffer).setUint32(8, bytes.byteLength + 4, true);
    const report = await validateGlbBytes(bytes, 'broken.glb');
    expect(report.numErrors).toBeGreaterThan(0);
  });
});
