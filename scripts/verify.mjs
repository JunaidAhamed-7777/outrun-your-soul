#!/usr/bin/env node
// One-command local verification: typecheck, unit tests, production build, itch ZIP
// packaging, model validation and the nested-iframe crawl of the exact ZIP bytes.
//
//   npm run verify
//
// Automated checks only. It cannot pass the real-phone, itch.io-upload or human-play
// gates in docs/EVIDENCE.md; record those separately.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const bin = (pkg, rel) => join(root, 'node_modules', pkg, rel);

/** Steps run in order; `needs` skips a step when a prerequisite failed. */
const steps = [
  { id: 'typecheck', label: 'Typecheck (tsc --noEmit)', args: [bin('typescript', 'bin/tsc'), '--noEmit'] },
  { id: 'test', label: 'Unit tests (vitest run)', args: [bin('vitest', 'vitest.mjs'), 'run'] },
  { id: 'build', label: 'Production build (vite build)', args: [bin('vite', 'bin/vite.js'), 'build'] },
  { id: 'package', label: 'itch.io ZIP (package-itch)', args: [join(root, 'scripts', 'package-itch.mjs'), '--json'], needs: ['build'] },
  { id: 'models', label: 'Model validation (check-models)', args: [join(root, 'scripts', 'check-models.mjs')] },
  {
    id: 'nested',
    label: 'Nested iframe crawl of the ZIP (check-nested)',
    // The exact archive the package step just wrote, not "newest file in release/".
    args: () => [join(root, 'scripts', 'check-nested.mjs'), '--zip', zipInfo?.zip ?? 'latest'],
    needs: ['package'],
  },
];

const results = new Map();
let zipInfo = null;
for (const step of steps) {
  const blocked = (step.needs ?? []).filter((id) => results.get(id)?.status !== 'PASS');
  if (blocked.length > 0) {
    results.set(step.id, { status: 'SKIP', seconds: 0, detail: `needs ${blocked.join(', ')}` });
    continue;
  }
  console.log(`\n=== ${step.label} ===`);
  const started = process.hrtime.bigint();
  const args = typeof step.args === 'function' ? step.args() : step.args;
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } });
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  if (step.id === 'package' && run.status === 0) {
    const last = (run.stdout ?? '').trim().split('\n').pop();
    try {
      zipInfo = JSON.parse(last);
    } catch {
      zipInfo = null;
    }
  }
  results.set(step.id, { status: run.status === 0 ? 'PASS' : 'FAIL', seconds, detail: run.error ? run.error.message : `exit ${run.status}` });
}

console.log('\n=== Verification summary (automated checks only) ===');
for (const step of steps) {
  const r = results.get(step.id);
  console.log(`  ${r.status.padEnd(4)}  ${step.label.padEnd(48)} ${r.status === 'SKIP' ? r.detail : `${r.seconds.toFixed(1)}s`}`);
}
if (zipInfo) {
  console.log(`\n  ZIP     ${zipInfo.name}${zipInfo.dirty ? '  (DIRTY tree: not a releasable commit build)' : ''}`);
  console.log(`  bytes   ${zipInfo.bytes}`);
  console.log(`  sha256  ${zipInfo.sha256}`);
  console.log(`  commit  ${zipInfo.commit}`);
}
console.log('\n  Not covered: real phones, the uploaded itch.io page, human play, audio, performance. See docs/EVIDENCE.md.');
const ok = [...results.values()].every((r) => r.status === 'PASS');
console.log(ok ? '\nVERIFY PASS' : '\nVERIFY FAIL');
process.exit(ok ? 0 : 1);
