#!/usr/bin/env node
// Validate runtime models (public/assets/models/*.glb) and authoring fixtures
// (art/exports/*.glb) with the Khronos glTF Validator plus project structure rules
// (docs/ASSET_CONTRACT.md) and budgets (docs/ART_PIPELINE.md). Writes
// art/reports/models-validation.json deterministically (no timestamps).
//
//   npm run check:models
//   node scripts/check-models.mjs [--models public/assets/models] [--fixtures art/exports] [--out art/reports/models-validation.json]
//
// Exit 1 on: Khronos errors, malformed GLB, contract errors (root naming, cameras,
// lights, tile pivots, scale slips), budget overruns, or a fixture in the shipping folder.
// Validator warnings and contract warnings are printed and recorded for review.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { sha256 } from './lib/files.mjs';
import { analyzeGltf, parseGlb } from './lib/glb.mjs';
import { validateGlbBytes, validatorVersion } from './lib/khronos.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const root = process.cwd();
const modelsDir = resolve(root, args.models ?? 'public/assets/models');
const fixturesDir = resolve(root, args.fixtures ?? 'art/exports');
const outPath = resolve(root, args.out ?? 'art/reports/models-validation.json');
const posix = (p) => relative(root, p).split('\\').join('/');

function glbsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.glb'))
    .sort()
    .map((n) => join(dir, n));
}

/** MODEL_IDS requested by the renderer (src/render/contract.ts), when present. */
function runtimeModelIds() {
  const contract = join(root, 'src', 'render', 'contract.ts');
  if (!existsSync(contract)) return null;
  const match = /MODEL_IDS\s*=\s*\[([\s\S]*?)\]/.exec(readFileSync(contract, 'utf8'));
  return match ? [...match[1].matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]) : null;
}

async function checkFile(path, shipping, modelIds) {
  const file = posix(path);
  const assetId = path.replace(/\\/g, '/').split('/').pop().replace(/\.glb$/i, '');
  const bytes = new Uint8Array(readFileSync(path));
  const result = { assetId, file, shipping, bytes: bytes.byteLength, sha256: sha256(bytes), status: 'pass', errors: [], warnings: [] };
  if (assetId !== assetId.toLowerCase() || /[^a-z0-9_]/.test(assetId)) result.errors.push('asset ID must be lowercase [a-z0-9_] (stable naming contract)');
  if (shipping && assetId === 'calibration_tile') result.errors.push('calibration_tile is a disposable fixture and must not be in the shipping models folder');
  if (shipping && modelIds && !modelIds.includes(assetId)) result.warnings.push('not in MODEL_IDS (src/render/contract.ts): the runtime never requests it; remove it or add it to the contract');

  try {
    const analysis = analyzeGltf(parseGlb(bytes).json, assetId);
    const { errors, warnings, ...stats } = analysis;
    result.stats = stats;
    result.errors.push(...errors);
    result.warnings.push(...warnings);
  } catch (error) {
    result.errors.push(`malformed GLB: ${error instanceof Error ? error.message : String(error)}`);
  }
  const khronos = await validateGlbBytes(bytes, file);
  result.khronos = khronos;
  if (khronos.numErrors > 0) result.errors.push(`Khronos glTF Validator: ${khronos.numErrors} error(s)`);
  if (khronos.numWarnings > 0) result.warnings.push(`Khronos glTF Validator: ${khronos.numWarnings} warning(s) to review and record`);
  result.status = result.errors.length > 0 ? 'fail' : 'pass';
  return result;
}

const modelIds = runtimeModelIds();
const shippingFiles = glbsIn(modelsDir);
const fixtureFiles = glbsIn(fixturesDir);
const results = [];
for (const path of shippingFiles) results.push(await checkFile(path, true, modelIds));
for (const path of fixtureFiles) results.push(await checkFile(path, false, modelIds));

const failed = results.filter((r) => r.status === 'fail');
const shippingIds = new Set(results.filter((r) => r.shipping).map((r) => r.assetId));
const report = {
  tool: { script: 'scripts/check-models.mjs', khronosValidator: validatorVersion() },
  sources: {
    contract: 'docs/ASSET_CONTRACT.md',
    budgets: 'docs/ART_PIPELINE.md#initial-budgets-and-measurement (proposed guardrails, not platform limits)',
  },
  folders: { shipping: posix(modelsDir), fixtures: posix(fixturesDir) },
  note:
    results.length === 0
      ? 'no models yet: public/assets/models and art/exports contain no .glb files; the renderer uses placeholders'
      : 'Structural and spec checks only. Visual quality, browser appearance and phone performance need separate evidence (docs/EVIDENCE.md).',
  runtimeModelIds: modelIds,
  missingRuntimeModels: modelIds ? modelIds.filter((id) => !shippingIds.has(id)) : null,
  summary: {
    shipping: shippingFiles.length,
    fixtures: fixtureFiles.length,
    failed: failed.length,
    shippingTriangles: results.filter((r) => r.shipping).reduce((s, r) => s + (r.stats?.triangles ?? 0), 0),
  },
  models: results,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Khronos glTF Validator ${report.tool.khronosValidator}; budgets from docs/ART_PIPELINE.md`);
if (results.length === 0) console.log(`No models yet in ${posix(modelsDir)} or ${posix(fixturesDir)} (renderer placeholders in use).`);
for (const r of results) {
  const s = r.stats;
  const dims = s?.bounds ? s.bounds.size.join(' x ') : 'n/a';
  console.log(
    `\n${r.status === 'pass' ? 'PASS' : 'FAIL'} ${r.file}${r.shipping ? '' : ' (fixture, never ships)'}\n` +
      `  ${s ? `${s.triangles} tris, ${s.materialCount} material(s) [${s.materials.join(', ')}], ${s.nodes} nodes; size ${dims} (x, y-up, z)` : 'unparsed'}; ` +
      `Khronos ${r.khronos.numErrors}E/${r.khronos.numWarnings}W/${r.khronos.numInfos}I`,
  );
  for (const e of r.errors) console.log(`  error: ${e}`);
  for (const w of r.warnings) console.log(`  warn:  ${w}`);
}
if (report.missingRuntimeModels?.length) console.log(`\nRuntime models not yet exported (placeholders): ${report.missingRuntimeModels.join(', ')}`);
console.log(`\nReport: ${posix(outPath)}`);
console.log(failed.length === 0 ? `PASS: ${results.length} model file(s) checked` : `FAIL: ${failed.length} of ${results.length} model file(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
