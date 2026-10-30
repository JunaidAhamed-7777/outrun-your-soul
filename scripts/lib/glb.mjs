// Structural GLB checks against docs/ASSET_CONTRACT.md and the budgets in
// docs/ART_PIPELINE.md ("Initial budgets and measurement"). Complements the Khronos
// glTF Validator (spec conformance) with project rules: naming, pivots, scale,
// triangle/material budgets. Pure functions over bytes; no Three.js dependency.

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Parse a GLB container. Throws with a specific message when malformed. */
export function parseGlb(bytes) {
  if (bytes.byteLength < 20) throw new Error('GLB too small for a header and JSON chunk');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB: bad magic (expected "glTF")');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version} (expected 2)`);
  const length = view.getUint32(8, true);
  if (length !== bytes.byteLength) throw new Error(`GLB header length ${length} != file size ${bytes.byteLength}`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > length) throw new Error('GLB chunk overruns file');
    const data = bytes.subarray(start, start + chunkLength);
    if (chunkType === CHUNK_JSON && json === null) json = JSON.parse(new TextDecoder('utf-8').decode(data));
    else if (chunkType === CHUNK_BIN && bin === null) bin = data;
    offset = start + chunkLength;
  }
  if (json === null) throw new Error('GLB has no JSON chunk');
  return { version, length, json, bin };
}

/**
 * Budgets quoted from docs/ART_PIPELINE.md (proposed guardrails, not platform limits).
 * `maxMaterials` breaches are errors except where the doc says "normally" (warning).
 */
export const BUDGETS = Object.freeze({
  actor: { label: 'Courier or soul', maxTriangles: 2000, maxMaterials: 3, materialsHard: true },
  enemy: { label: 'Ordinary enemy', maxTriangles: 2500, maxMaterials: 3, materialsHard: true },
  warden: { label: 'Warden', maxTriangles: 4000, maxMaterials: 3, materialsHard: true },
  boss: { label: 'Last Warden boss (body or heart)', maxTriangles: 4000, maxMaterials: 4, materialsHard: true },
  module: { label: 'Small prop / modular wall', maxTriangles: 800, maxMaterials: 3, materialsHard: true },
  setPiece: { label: 'No per-asset budget documented; counts toward the <=60,000-triangle visible room', maxTriangles: 60000, maxMaterials: null, materialsHard: false },
  fixture: { label: 'Calibration fixture (never ships)', maxTriangles: null, maxMaterials: null, materialsHard: false },
  unknown: { label: 'Unknown asset ID: no documented budget', maxTriangles: 60000, maxMaterials: null, materialsHard: false },
});

/** Asset ID -> category, expected part nodes and footprint rules (docs/ASSET_CONTRACT.md). */
export const ASSET_RULES = Object.freeze({
  courier_body: { category: 'actor', parts: ['body', 'head', 'mask', 'scarf'], grounded: true, maxHalfExtent: 0.3 * 1.3, height: [0.4, 1.6] },
  soul_mask: { category: 'actor', parts: ['mask', 'wisp'], grounded: false, maxHalfExtent: 0.3 * 1.3, height: [0.2, 1.8] },
  needler: { category: 'enemy', parts: ['base', 'head', 'muzzle'], grounded: true, maxHalfExtent: 0.42 * 1.3, height: [0.3, 2.0] },
  keeper: { category: 'enemy', parts: ['base', 'head', 'muzzle'], grounded: true, maxHalfExtent: 0.42 * 1.3, height: [0.3, 2.2] },
  warden: { category: 'warden', parts: [], grounded: true, height: [0.4, 3.0] },
  last_warden_body: { category: 'boss', parts: ['body', 'head', 'mantle', 'mask'], grounded: true, height: [0.6, 3.5] },
  last_warden_heart: { category: 'boss', parts: ['cage', 'core'], grounded: false },
  floor_tile: { category: 'module', parts: [], tile: true },
  wall_block: { category: 'module', parts: [], tile: true },
  exit_gate: { category: 'setPiece', parts: ['frame', 'door_left', 'door_right'], grounded: true, gateWidth: 2 },
  distant_engine: { category: 'setPiece', parts: [] },
  // Nonblocking courtyard dress and runtime props (ASSET_MANIFEST `courtyard_dress`):
  // held to the "Small prop" row, without the tile-footprint rule.
  urn: { category: 'module', parts: [] },
  banner_post: { category: 'module', parts: [] },
  lamp_post: { category: 'module', parts: [] },
  lane_emitter: { category: 'module', parts: [] },
  threshold_inlay: { category: 'module', parts: [] },
  // Signal House station backdrop: a set piece like the distant engine.
  station_kiosk: { category: 'setPiece', parts: [] },
  calibration_tile: { category: 'fixture', parts: [] },
});

// --- small matrix helpers (column-major 4x4, like glTF) ---------------------------
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function localMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transformPoint(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

function determinant3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

function primitiveTriangles(json, prim) {
  const mode = prim.mode ?? 4;
  const count = prim.indices !== undefined ? json.accessors?.[prim.indices]?.count : json.accessors?.[prim.attributes?.POSITION]?.count;
  if (typeof count !== 'number') return 0;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0; // points / lines
}

const round = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Analyse parsed glTF JSON for one asset.
 * @param {any} json
 * @param {string} assetId expected root node name (file name without .glb)
 */
export function analyzeGltf(json, assetId) {
  const errors = [];
  const warnings = [];
  const nodes = json.nodes ?? [];
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  const rule = ASSET_RULES[assetId];
  const category = rule?.category ?? 'unknown';
  const budget = BUDGETS[category];
  if (!rule) warnings.push(`asset ID "${assetId}" is not in the asset contract`);

  if (!scene) errors.push('no default scene');
  const roots = scene?.nodes ?? [];
  const rootNames = roots.map((i) => nodes[i]?.name ?? `#${i}`);
  if (roots.length !== 1) errors.push(`expected exactly one root node, found ${roots.length} (${rootNames.join(', ') || 'none'})`);
  else if (rootNames[0] !== assetId) errors.push(`root node is named "${rootNames[0]}", expected "${assetId}"`);

  if ((json.cameras ?? []).length > 0 || nodes.some((n) => n.camera !== undefined)) errors.push('contains cameras (exports must not include cameras)');
  const lights = json.extensions?.KHR_lights_punctual?.lights ?? [];
  if (lights.length > 0 || nodes.some((n) => n.extensions?.KHR_lights_punctual)) errors.push('contains lights (exports must not include lights)');

  const rootNode = roots.length === 1 ? nodes[roots[0]] : null;
  if (rootNode) {
    const r = rootNode.rotation;
    if (r && (Math.abs(r[0]) > 1e-6 || Math.abs(r[1]) > 1e-6 || Math.abs(r[2]) > 1e-6)) warnings.push('root node has a rotation (contract forbids per-asset corrective rotations)');
    if (Array.isArray(rootNode.matrix)) warnings.push('root node uses a matrix transform; prefer identity TRS at the root');
  }

  // Traverse the default scene: world matrices, triangles, materials, bounds, names.
  let triangles = 0;
  const materialsUsed = new Set();
  let usesDefaultMaterial = false;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const names = [];
  const negativeScale = [];
  let missingBounds = false;
  const visited = new Set();
  const visit = (index, parent) => {
    if (visited.has(index)) {
      errors.push(`node ${index} is reachable twice (cycle or shared child)`);
      return;
    }
    visited.add(index);
    const node = nodes[index];
    if (!node) {
      errors.push(`missing node ${index}`);
      return;
    }
    const world = multiply(parent, localMatrix(node));
    if (node.name !== undefined && index !== roots[0]) names.push(node.name);
    if (determinant3(world) < 0) negativeScale.push(node.name ?? `#${index}`);
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      for (const prim of mesh?.primitives ?? []) {
        triangles += primitiveTriangles(json, prim);
        if (prim.material === undefined) usesDefaultMaterial = true;
        else materialsUsed.add(json.materials?.[prim.material]?.name ?? `#${prim.material}`);
        const pos = json.accessors?.[prim.attributes?.POSITION];
        if (pos?.min && pos?.max) {
          for (let corner = 0; corner < 8; corner++) {
            const p = [corner & 1 ? pos.max[0] : pos.min[0], corner & 2 ? pos.max[1] : pos.min[1], corner & 4 ? pos.max[2] : pos.min[2]];
            const w = transformPoint(world, p);
            for (let k = 0; k < 3; k++) {
              min[k] = Math.min(min[k], w[k]);
              max[k] = Math.max(max[k], w[k]);
            }
          }
        } else missingBounds = true;
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const r of roots) visit(r, IDENTITY);

  if (negativeScale.length > 0) warnings.push(`negative scale / mirrored transform on: ${negativeScale.join(', ')}`);
  if (missingBounds) warnings.push('a POSITION accessor lacks min/max; bounds are incomplete');
  const unprefixed = names.filter((n) => !n.startsWith(`${assetId}_`));
  if (unprefixed.length > 0) warnings.push(`child nodes not named "${assetId}_<part>": ${unprefixed.join(', ')}`);
  const missingParts = (rule?.parts ?? []).filter((p) => !names.includes(`${assetId}_${p}`));
  if (missingParts.length > 0) warnings.push(`expected part nodes missing (runtime animates less): ${missingParts.map((p) => `${assetId}_${p}`).join(', ')}`);

  const materialNames = [...materialsUsed].sort();
  const materialCount = materialNames.length + (usesDefaultMaterial ? 1 : 0);
  if (usesDefaultMaterial) warnings.push('a primitive has no material (glTF default material); assign a palette material');
  if ((json.images ?? []).length > 0) warnings.push(`${json.images.length} image texture(s); P0 contract uses palette materials only`);

  // Budgets.
  if (budget.maxTriangles !== null && triangles > budget.maxTriangles) {
    errors.push(`${triangles} triangles exceeds budget ${budget.maxTriangles} (${budget.label}, docs/ART_PIPELINE.md)`);
  }
  if (budget.maxMaterials !== null && materialCount > budget.maxMaterials) {
    const msg = `${materialCount} materials exceeds ${budget.maxMaterials} (${budget.label}, docs/ART_PIPELINE.md)`;
    if (budget.materialsHard) errors.push(msg);
    else warnings.push(msg);
  }

  // Scale / pivot sanity (runtime Y-up, ground XZ; Blender XY [0,1]^2 -> x in [0,1], z in [-1,0]).
  const hasBounds = Number.isFinite(min[0]);
  const size = hasBounds ? [max[0] - min[0], max[1] - min[1], max[2] - min[2]] : null;
  if (size) {
    if (Math.max(...size) > 100) errors.push(`largest dimension ${round(Math.max(...size))} units: likely a unit/scale slip (1 tile = 1 unit)`);
    if (Math.max(...size) < 0.01) errors.push(`largest dimension ${round(Math.max(...size))} units: asset is microscopic (1 tile = 1 unit)`);
    if (rule?.tile) {
      const tol = 0.02;
      if (min[0] < -tol || max[0] > 1 + tol || min[2] < -1 - tol || max[2] > tol) {
        errors.push(`tile module must occupy Blender XY [0,1]x[0,1] (runtime x [0,1], z [-1,0]); bounds x [${round(min[0])}, ${round(max[0])}] z [${round(min[2])}, ${round(max[2])}]`);
      }
    }
    if (rule?.grounded && (min[1] < -0.05 || min[1] > 0.3)) warnings.push(`lowest point y=${round(min[1])}: origin should sit at ground level under the footprint`);
    if (rule?.height && (size[1] < rule.height[0] || size[1] > rule.height[1])) warnings.push(`height ${round(size[1])} outside expected ${rule.height[0]}..${rule.height[1]} units`);
    if (rule?.maxHalfExtent) {
      const half = Math.max(Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[2]), Math.abs(max[2]));
      if (half > rule.maxHalfExtent + 1e-6) warnings.push(`widest half-extent ${round(half)} exceeds ~1.3x collision radius (${round(rule.maxHalfExtent)}); ground ring may misread the footprint`);
    }
    if (rule?.gateWidth && Math.abs(size[0] - rule.gateWidth) > 0.6) warnings.push(`gate width ${round(size[0])} far from ${rule.gateWidth} tiles`);
  }

  return {
    assetId,
    category,
    budget: { label: budget.label, maxTriangles: budget.maxTriangles, maxMaterials: budget.maxMaterials },
    rootNodes: rootNames,
    childNodes: names,
    triangles,
    materials: materialNames,
    materialCount,
    meshes: (json.meshes ?? []).length,
    nodes: nodes.length,
    animations: (json.animations ?? []).map((a) => a.name ?? '(unnamed)'),
    extensionsUsed: json.extensionsUsed ?? [],
    bounds: hasBounds ? { min: min.map(round), max: max.map(round), size: size.map(round) } : null,
    errors,
    warnings,
  };
}
