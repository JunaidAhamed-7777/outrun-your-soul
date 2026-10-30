#!/usr/bin/env node
/**
 * Verify the exported environment GLBs against docs/ASSET_CONTRACT.md by reading the
 * actual bytes (no Blender involved): single root named after the asset, expected
 * part nodes and pivots, glTF Y-up world bounds/footprints, palette-only materials,
 * no cameras/lights, triangle counts. Writes `glb_verification` into each
 * art/reports/<asset>.json and exits non-zero on any failure.
 *
 *   node art/scripts/verify_env_glb.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PALETTE = Object.keys(JSON.parse(readFileSync(join(ROOT, 'src/content/palette.json'), 'utf8'))).filter(
  (k) => !k.startsWith('_'),
);
const EPS = 1e-3;

export function parseGlb(buf) {
  if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a GLB (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error('unsupported GLB version');
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  return json;
}

// --- tiny column-major 4x4 matrix helpers (glTF convention) -----------------
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function trs(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  const s = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
  return multiply(t, multiply(r, s));
}
const apply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

export function inspect(json) {
  const scene = json.scenes[json.scene ?? 0];
  const nodes = json.nodes ?? [];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const parts = {};
  let triangles = 0;
  const walk = (index, parent) => {
    const node = nodes[index];
    const world = multiply(parent, trs(node));
    parts[node.name] = { translation: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1], world };
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        // Transform the accessor's local AABB corners (exact enough for axis/footprint checks).
        for (let i = 0; i < 8; i++) {
          const corner = [0, 1, 2].map((k) => ((i >> k) & 1 ? acc.max[k] : acc.min[k]));
          const p = apply(world, corner);
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], p[k]);
            hi[k] = Math.max(hi[k], p[k]);
          }
        }
        triangles += (prim.indices !== undefined ? json.accessors[prim.indices].count : acc.count) / 3;
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const r of scene.nodes) walk(r, identity());
  return {
    roots: scene.nodes.map((i) => nodes[i].name),
    parts,
    bounds: { min: lo.map((v) => +v.toFixed(4)), max: hi.map((v) => +v.toFixed(4)) },
    triangles,
    materials: (json.materials ?? []).map((m) => m.name),
    cameras: (json.cameras ?? []).length,
    lights: json.extensions?.KHR_lights_punctual?.lights?.length ?? 0,
    generator: json.asset?.generator,
  };
}

const near = (a, b) => Math.abs(a - b) <= EPS;

const CHECKS = {
  floor_tile: (r) => [
    ['footprint x within [0,1]', r.bounds.min[0] >= -EPS && r.bounds.max[0] <= 1 + EPS],
    ['footprint glTF z within [-1,0] (Blender +Y = sim north)', r.bounds.min[2] >= -1 - EPS && r.bounds.max[2] <= EPS],
    ['top surface at y=0', near(r.bounds.max[1], 0)],
    ['slab extends downward', r.bounds.min[1] < 0],
    ['part floor_tile_slab', 'floor_tile_slab' in r.parts],
  ],
  wall_block: (r) => [
    ['footprint x exactly [0,1]', near(r.bounds.min[0], 0) && near(r.bounds.max[0], 1)],
    ['footprint glTF z exactly [-1,0]', near(r.bounds.min[2], -1) && near(r.bounds.max[2], 0)],
    ['height along +Y from 0 to ~0.55', near(r.bounds.min[1], 0) && near(r.bounds.max[1], 0.55)],
    ['part wall_block_block', 'wall_block_block' in r.parts],
  ],
  exit_gate: (r) => [
    ['parts frame/door_left/door_right', ['exit_gate_frame', 'exit_gate_door_left', 'exit_gate_door_right'].every((p) => p in r.parts)],
    ['door_left pivot at x=-1', near(r.parts.exit_gate_door_left?.translation[0] ?? NaN, -1)],
    ['door_right pivot at x=+1', near(r.parts.exit_gate_door_right?.translation[0] ?? NaN, 1)],
    ['stands on the ground, height along +Y', near(r.bounds.min[1], 0) && r.bounds.max[1] > 1.7],
    ['opening centred on origin', near(r.bounds.min[0] + r.bounds.max[0], 0)],
  ],
  distant_engine: (r) => [
    ['parts body/train/gear_a/gear_b', ['distant_engine_body', 'distant_engine_train', 'distant_engine_gear_a', 'distant_engine_gear_b'].every((p) => p in r.parts)],
    ['gears tilted -30 deg about X (quaternion x ~ -0.2588)', ['distant_engine_gear_a', 'distant_engine_gear_b'].every((p) => near(r.parts[p]?.rotation[0] ?? NaN, -0.258819))],
    ['train pivot raised onto the rails (+Y)', (r.parts.distant_engine_train?.translation[1] ?? 0) > 2],
    ['roughly 30 m wide', r.bounds.max[0] - r.bounds.min[0] > 28 && r.bounds.max[0] - r.bounds.min[0] < 32],
  ],
  lane_emitter: (r) => [
    ['footprint x exactly [0,1]', near(r.bounds.min[0], 0) && near(r.bounds.max[0], 1)],
    ['footprint glTF z exactly [-1,0]', near(r.bounds.min[2], -1) && near(r.bounds.max[2], 0)],
    ['grounded, height <= 0.9', near(r.bounds.min[1], 0) && r.bounds.max[1] <= 0.9 + EPS],
    ['parts body + aperture', ['lane_emitter_body', 'lane_emitter_aperture'].every((p) => p in r.parts)],
    ['aperture on the front (-Y Blender) face centre', near(r.parts.lane_emitter_aperture?.translation[0] ?? NaN, 0.5) && near(r.parts.lane_emitter_aperture?.translation[2] ?? NaN, 0)],
    ['violet only as the lens (one lane_violet material)', r.materials.filter((m) => m === 'lane_violet').length === 1],
  ],
  urn: (r) => [
    ['grounded and centred on origin', near(r.bounds.min[1], 0) && near(r.bounds.min[0] + r.bounds.max[0], 0)],
    ['part urn_vessel', 'urn_vessel' in r.parts],
  ],
  banner_post: (r) => [
    ['grounded', near(r.bounds.min[1], 0)],
    ['parts post + cloth', ['banner_post_post', 'banner_post_cloth'].every((p) => p in r.parts)],
    ['cloth pivot high on the crossbar (sway hinge)', (r.parts.banner_post_cloth?.translation[1] ?? 0) > 1.6],
  ],
  lamp_post: (r) => [
    ['grounded and centred on origin', near(r.bounds.min[1], 0) && near(r.bounds.min[0] + r.bounds.max[0], 0)],
    ['part lamp_post_lamp', 'lamp_post_lamp' in r.parts],
  ],
  station_kiosk: (r) => [
    ['grounded', near(r.bounds.min[1], 0)],
    ['parts house + bell + signal_arm', ['station_kiosk_house', 'station_kiosk_bell', 'station_kiosk_signal_arm'].every((p) => p in r.parts)],
    ['bell pivot inside the belfry above the roof', (r.parts.station_kiosk_bell?.translation[1] ?? 0) > 2.4],
    ['signal arm pivot on the mast (x ~ 1.2)', near(r.parts.station_kiosk_signal_arm?.translation[0] ?? NaN, 1.2)],
    ['faces -Y (front step toward glTF +Z)', r.bounds.max[2] > 0.85],
  ],
  threshold_inlay: (r) => [
    ['footprint x exactly [0,2]', near(r.bounds.min[0], 0) && near(r.bounds.max[0], 2)],
    ['footprint glTF z exactly [-1,0]', near(r.bounds.min[2], -1) && near(r.bounds.max[2], 0)],
    ['bottom at 0, top at 0.002', Math.abs(r.bounds.min[1]) < 1e-5 && Math.abs(r.bounds.max[1] - 0.002) < 1e-5],
    ['part threshold_inlay_inlay', 'threshold_inlay_inlay' in r.parts],
  ],
};

export function verify(assetId, budget) {
  const rel = `public/assets/models/${assetId}.glb`;
  const buf = readFileSync(join(ROOT, rel));
  const r = inspect(parseGlb(buf));
  const common = [
    [`triangles within budget (${budget?.triangles})`, budget !== undefined && r.triangles <= budget.triangles],
    [`materials within budget (${budget?.materials})`, budget !== undefined && r.materials.length <= budget.materials],
    [`single root named ${assetId}`, r.roots.length === 1 && r.roots[0] === assetId],
    ['all part nodes prefixed with the asset id', Object.keys(r.parts).every((n) => n === assetId || n.startsWith(`${assetId}_`))],
    ['materials are palette keys', r.materials.every((m) => PALETTE.includes(m))],
    ['no cameras or lights', r.cameras === 0 && r.lights === 0],
  ];
  const checks = [...common, ...CHECKS[assetId](r)].map(([name, pass]) => ({ name, pass: Boolean(pass) }));
  return {
    asset_id: assetId,
    file: rel,
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
    generator: r.generator,
    triangles: r.triangles,
    materials: r.materials,
    bounds_gltf_yup: r.bounds,
    parts: Object.keys(r.parts).sort(),
    checks,
    pass: checks.every((c) => c.pass),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const id of Object.keys(CHECKS)) {
    const reportPath = join(ROOT, 'art/reports', `${id}.json`);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const result = verify(id, report.budget);
    report.glb_verification = { ...result, verified_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const bad = result.checks.filter((c) => !c.pass).map((c) => c.name);
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${id} tris=${result.triangles} bytes=${result.bytes} bounds=${JSON.stringify(result.bounds_gltf_yup)}${bad.length ? ` failed: ${bad.join('; ')}` : ''}`);
    failed ||= !result.pass;
  }
  process.exit(failed ? 1 : 0);
}
