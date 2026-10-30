#!/usr/bin/env node
/**
 * Launch a dedicated Blender GUI instance running the pinned MCP bridge and wait
 * until it answers on 127.0.0.1.
 *
 *   node scripts/blender-launch.mjs --port 9876 --blend actors.blend [--root <dir>] [--addon <addon.py>]
 *
 * Defaults: root = current directory, addon = $OYS_BLENDER_ADDON or
 * <root>/.tools/blender-mcp-febcd90/addon.py, Blender = $BLENDER_EXE or the
 * standard Windows install path. The add-on hash is verified by bootstrap.py.
 */
import { spawn } from 'node:child_process';
import { existsSync, openSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { blenderCommand } from './blender-mcp.mjs';

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = resolve(option('root', process.cwd()));
const port = Number(option('port', '9876'));
const blend = option('blend', 'outrun_assets.blend');
const addon = resolve(option('addon', process.env.OYS_BLENDER_ADDON ?? join(root, '.tools', 'blender-mcp-febcd90', 'addon.py')));
const exe = process.env.BLENDER_EXE ?? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';

if (!existsSync(exe)) throw new Error(`Blender not found at ${exe}; set BLENDER_EXE`);
if (!existsSync(addon)) throw new Error(`pinned add-on not found at ${addon}; pass --addon`);

try {
  await blenderCommand('ping', {}, { port, timeoutMs: 1500 });
  console.log(`port ${port} already answers; reuse that instance or pick another port`);
  process.exit(2);
} catch {
  // nothing listening yet: launch
}

mkdirSync(join(root, 'art', 'logs'), { recursive: true });
const log = openSync(join(root, 'art', 'logs', `blender-${port}.log`), 'a');
const child = spawn(
  exe,
  ['--factory-startup', '--python', join(root, 'art', 'scripts', 'bootstrap.py'), '--', '--root', root, '--addon', addon, '--port', String(port), '--blend', blend],
  { detached: true, stdio: ['ignore', log, log], windowsHide: false },
);
child.unref();
console.log(`launched Blender pid ${child.pid} (log art/logs/blender-${port}.log)`);

const deadline = Date.now() + 120000;
for (;;) {
  try {
    await blenderCommand('ping', {}, { port, timeoutMs: 2000 });
    const info = await blenderCommand('get_scene_info', {}, { port, timeoutMs: 10000 });
    console.log(`ready on 127.0.0.1:${port}: scene '${info?.name ?? '?'}', ${info?.object_count ?? '?'} objects`);
    break;
  } catch {
    if (Date.now() > deadline) throw new Error('Blender MCP bridge did not answer within 120 s; see the log');
    await new Promise((r) => setTimeout(r, 1500));
  }
}
