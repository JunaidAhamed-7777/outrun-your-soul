/** Minimal GLB writer for tests: one quad on the ground plane plus caller-supplied nodes. */
export interface NodeSpec {
  name: string;
  children?: number[];
  mesh?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  camera?: number;
}

/** Build a minimal valid GLB: one quad (2 triangles) on the ground plane, runtime x [0,1], z [-1,0]. */
export function buildGlb(options: { nodes: NodeSpec[]; roots: number[]; quadScale?: number; extraJson?: Record<string, unknown> }): Uint8Array {
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
