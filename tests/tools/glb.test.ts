import { describe, expect, it } from 'vitest';
import { analyzeGltf, parseGlb } from '../../scripts/lib/glb.mjs';
import { validateGlbBytes } from '../../scripts/lib/khronos.mjs';

interface NodeSpec {
  name: string;
  children?: number[];
  mesh?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  camera?: number;
}

/** Build a minimal valid GLB: one quad (2 triangles) on the ground plane, runtime x [0,1], z [-1,0]. */
function buildGlb(options: { nodes: NodeSpec[]; roots: number[]; quadScale?: number; extraJson?: Record<string, unknown> }): Uint8Array {
  const s = options.quadScale ?? 1;
  const positions = new Float32Array([0, 0, 0, s, 0, 0, s, 0, -s, 0, 0, -s]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = {
    asset: { version: '2.0', generator: 'outrun-your-soul test' },
    scene: 0,
    scenes: [{ nodes: options.roots }],
    nodes: options.nodes,
    meshes: [{ name: 'quad', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: 'cobalt', pbrMetallicRoughness: { baseColorFactor: [0.14, 0.26, 0.64, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, -s], max: [s, 0, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    ...options.extraJson,
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) jsonBytes = new Uint8Array([...jsonBytes, ...new Array(jsonPad).fill(0x20)]);
  const binPadded = new Uint8Array(Math.ceil(bin.byteLength / 4) * 4);
  binPadded.set(bin);
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binPadded.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.byteLength;
  view.setUint32(binHeader, binPadded.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(binPadded, binHeader + 8);
  return out;
}

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
