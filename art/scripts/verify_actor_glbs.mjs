#!/usr/bin/env node
/**
 * Verify exported actor GLBs against docs/ASSET_CONTRACT.md and record the result in
 * art/reports/<id>.json under "glb_verification". Run after the Blender generators:
 *
 *   node art/scripts/verify_actor_glbs.mjs
 *
 * Checks: single root node named after the asset, expected `<id>_<part>` nodes, no
 * cameras/lights, palette-key materials, unit node scale, ground contact at Y=0 (glTF
 * Y-up), and facing toward +Z (glTF forward == Blender -Y == simulation south).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PALETTE = Object.keys(JSON.parse(readFileSync('src/content/palette.json', 'utf8'))).filter((k) => !k.startsWith('_'));

const ACTORS = {
  courier_body: { parts: ['body', 'head', 'mask', 'scarf'], front: 'mask', back: 'scarf' },
  soul_mask: { parts: ['mask', 'wisp'], front: 'mask', back: 'wisp' },
  needler: { parts: ['base', 'head', 'muzzle'], front: 'muzzle' },
  keeper: { parts: ['base', 'head', 'muzzle'], front: 'muzzle' },
};

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  return { buf, json };
}

// Column-major 4x4 helpers.
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function worldVertices(json, buf, nodeIdx, m) {
  const binStart = 20 + buf.readUInt32LE(12) + 8;
  const out = [];
  for (const prim of json.meshes[json.nodes[nodeIdx].mesh].primitives) {
    const acc = json.accessors[prim.attributes.POSITION];
    const view = json.bufferViews[acc.bufferView];
    const stride = view.byteStride ?? 12;
    const base = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    for (let i = 0; i < acc.count; i++) {
      const o = base + i * stride;
      out.push(apply(m, [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]));
    }
  }
  return out;
}

function verify(id, spec) {
  const path = `public/assets/models/${id}.glb`;
  const { buf, json } = parseGlb(path);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  const scene = json.scenes[json.scene ?? 0];
  const roots = scene.nodes.map((i) => json.nodes[i]);
  check('single root named after asset', roots.length === 1 && roots[0].name === id, roots.map((n) => n.name));
  check('no cameras', !json.cameras, json.cameras?.length ?? 0);
  check('no lights', !json.extensionsUsed?.includes('KHR_lights_punctual'), json.extensionsUsed ?? []);
  const names = json.nodes.map((n) => n.name);
  const missing = spec.parts.map((p) => `${id}_${p}`).filter((n) => !names.includes(n));
  check('expected part nodes', missing.length === 0, { missing, nodes: names });
  const matNames = (json.materials ?? []).map((m) => m.name);
  check('palette-key materials', matNames.every((m) => PALETTE.includes(m)), matNames);
  const scaled = json.nodes.filter((n) => n.scale && n.scale.some((s) => Math.abs(s - 1) > 1e-6)).map((n) => n.name);
  check('unit node scale', scaled.length === 0, scaled);

  // World transforms and bounds.
  const world = new Map();
  const walk = (i, parent) => {
    const m = mul(parent, trs(json.nodes[i]));
    world.set(i, m);
    for (const c of json.nodes[i].children ?? []) walk(c, m);
  };
  for (const r of scene.nodes) walk(r, ident());
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const partBounds = {};
  for (const [i, m] of world) {
    const node = json.nodes[i];
    if (node.mesh === undefined) continue;
    const plo = [Infinity, Infinity, Infinity];
    const phi = [-Infinity, -Infinity, -Infinity];
    for (const prim of json.meshes[node.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      triangles += prim.indices !== undefined ? json.accessors[prim.indices].count / 3 : acc.count / 3;
      for (let k = 0; k < 8; k++) {
        const corner = [0, 1, 2].map((a) => ((k >> a) & 1 ? acc.max[a] : acc.min[a]));
        const p = apply(m, corner);
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]);
          plo[a] = Math.min(plo[a], p[a]); phi[a] = Math.max(phi[a], p[a]);
        }
      }
    }
    partBounds[node.name] = { min: plo.map((v) => +v.toFixed(3)), max: phi.map((v) => +v.toFixed(3)) };
  }
  check('stands on ground (min Y ~ 0, Y up)', Math.abs(lo[1]) < 0.03 && hi[1] > 0.5, { minY: lo[1], maxY: hi[1] });
  const nodeIndex = (n) => names.indexOf(`${id}_${n}`);
  const pos = (n) => apply(world.get(nodeIndex(n)), [0, 0, 0]);
  const front = pos(spec.front);
  if (spec.front === 'mask') {
    // A face tipped up toward the camera: its chin (lowest vertex) sits forward (+Z) of its brow.
    const verts = worldVertices(json, buf, nodeIndex('mask'), world.get(nodeIndex('mask')));
    const low = verts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const high = verts.reduce((a, b) => (b[1] > a[1] ? b : a));
    check('mask faces +Z (chin forward of brow)', low[2] > high[2] + 0.05, { chin: low.map((v) => +v.toFixed(3)), brow: high.map((v) => +v.toFixed(3)) });
  } else {
    check(`${spec.front} faces +Z (glTF forward)`, front[2] > 0.02 && Math.abs(front[0]) < 0.01, { pivot: front.map((v) => +v.toFixed(3)) });
  }
  if (spec.back) {
    const b = partBounds[`${id}_${spec.back}`];
    check(`${spec.back} trails toward -Z`, b.min[2] < -0.1, b);
  }
  return {
    file: path,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    generator: json.asset.generator,
    triangles,
    bounds_yup: { min: lo.map((v) => +v.toFixed(3)), max: hi.map((v) => +v.toFixed(3)) },
    muzzle_or_front_pivot_yup: front.map((v) => +v.toFixed(3)),
    checks,
    passed: checks.every((c) => c.ok),
  };
}

let failed = 0;
for (const [id, spec] of Object.entries(ACTORS)) {
  const result = verify(id, spec);
  const reportPath = `art/reports/${id}.json`;
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    report.glb_verification = { checked_at: new Date().toISOString(), ...result };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  const bad = result.checks.filter((c) => !c.ok);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${id}: ${result.triangles} tris, ${result.bytes} B, bounds ${JSON.stringify(result.bounds_yup)}${bad.length ? ' failing: ' + bad.map((c) => `${c.name} ${JSON.stringify(c.detail)}`).join('; ') : ''}`);
  if (!result.passed) failed++;
}
process.exit(failed ? 1 : 0);
