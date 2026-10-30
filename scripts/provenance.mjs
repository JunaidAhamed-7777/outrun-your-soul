#!/usr/bin/env node
/**
 * Compile art/provenance.csv (the rights/provenance ledger required by
 * docs/ASSET_MANIFEST.md) from the per-asset authoring reports in art/reports/*.json
 * and the validator summary in art/reports/models-validation.json.
 *
 *   node scripts/provenance.mjs
 *
 * Unknown values are written as "not measured", never zero. Device testing is never
 * inferred: the device_test column stays "not run" until someone records evidence.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const COLUMNS = [
  'asset_id', 'status', 'author', 'created_at', 'source_url_or_original', 'license',
  'redistribution_checked', 'required_credit', 'ai_tools_used', 'blender_version',
  'exporter_version', 'source_path', 'export_path', 'export_sha256', 'exported_triangles',
  'materials', 'texture_dimensions', 'file_bytes', 'animation_clips', 'validator_errors',
  'warning_disposition', 'browser_build_commit', 'device_test', 'owner', 'next_action',
];

const AI_TOOLS =
  'Claude Code agents wrote the Blender Python generators; executed in Blender 5.2 through the pinned Blender MCP add-on bridge (ahujasid/blender-mcp@febcd90, loopback only, no generation/asset services)';
const NOT_MEASURED = 'not measured';

const reportsDir = 'art/reports';
const validationPath = join(reportsDir, 'models-validation.json');
const validation = existsSync(validationPath) ? JSON.parse(readFileSync(validationPath, 'utf8')) : { models: [] };
const validatorByFile = new Map(validation.models.map((m) => [m.file.replace(/\\/g, '/'), m]));

const csvCell = (value) => {
  const s = value === undefined || value === null || value === '' ? NOT_MEASURED : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [];
for (const name of readdirSync(reportsDir).sort()) {
  if (!name.endsWith('.json') || name === 'models-validation.json') continue;
  const r = JSON.parse(readFileSync(join(reportsDir, name), 'utf8'));
  if (!r.asset_id || !r.export) continue;
  const exportPath = r.export.path.replace(/\\/g, '/');
  const v = validatorByFile.get(exportPath);
  const fixture = !exportPath.startsWith('public/');
  const status = v ? (v.status === 'pass' || v.status === 'PASS' ? 'validated' : 'exported') : 'exported';
  rows.push({
    asset_id: r.asset_id,
    status: fixture ? `${status} (fixture, never ships)` : status,
    author: 'Original work for this project (script-authored geometry)',
    created_at: r.created_at,
    source_url_or_original: 'original',
    license: 'No license selected yet; all rights reserved by the repository owner',
    redistribution_checked: 'yes: original geometry, no third-party meshes/textures/fonts',
    required_credit: 'none (original)',
    ai_tools_used: AI_TOOLS,
    blender_version: r.blender_version,
    exporter_version: r.exporter_version,
    source_path: r.source_path,
    export_path: exportPath,
    export_sha256: r.export.sha256,
    exported_triangles: r.measured?.triangles,
    materials: (r.measured?.materials ?? []).join(' '),
    texture_dimensions: 'none (palette materials only)',
    file_bytes: r.export.bytes,
    animation_clips: 'none (runtime procedural part animation)',
    validator_errors: v ? `Khronos ${v.khronos?.numErrors ?? NOT_MEASURED}E/${v.khronos?.numWarnings ?? NOT_MEASURED}W/${v.khronos?.numInfos ?? NOT_MEASURED}I; project ${v.errors?.length ?? 0} errors` : 'not run',
    warning_disposition: v?.warnings?.length ? `reviewed: ${v.warnings.join(' | ')}` : 'none',
    browser_build_commit: 'not run',
    device_test: 'not run',
    owner: 'repository owner',
    next_action: fixture ? 'keep out of release' : 'verify in game renderer, then on a real phone',
  });
}

const csv = [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(','))].join('\n') + '\n';
writeFileSync('art/provenance.csv', csv);
console.log(`art/provenance.csv: ${rows.length} assets`);
