#!/usr/bin/env node
/**
 * Local client for the official Blender MCP add-on's JSON-over-TCP bridge
 * (ahujasid/blender-mcp@febcd90, add-on 1.8), started by art/scripts/bootstrap.py.
 * Loopback only. Never enables third-party asset or generation services.
 *
 *   node scripts/blender-mcp.mjs ping
 *   node scripts/blender-mcp.mjs info
 *   node scripts/blender-mcp.mjs exec art/scripts/<file>.py [key=value ...]
 *   node scripts/blender-mcp.mjs screenshot <out.png> [maxSize]
 *
 * BLENDER_MCP_PORT selects a dedicated instance (default 9876).
 * `exec` prepends MCP_ARGS (the key=value pairs), __file__, and puts the script's
 * directory on sys.path so authoring scripts can `import oys_blender`. Cached oys_*
 * modules are dropped first so every run uses the code on disk.
 */
import { connect } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function blenderPort(value = process.env.BLENDER_MCP_PORT) {
  if (value === undefined || value === '') return 9876;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('BLENDER_MCP_PORT must be an unprivileged TCP port');
  }
  return port;
}

export function blenderCommand(type, params = {}, { port = blenderPort(), timeoutMs = 180000 } = {}) {
  return new Promise((accept, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    const decoder = new StringDecoder('utf8');
    let data = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => socket.write(JSON.stringify({ type, params })));
    socket.on('data', (chunk) => {
      data += decoder.write(chunk);
      if (data.length > MAX_RESPONSE_BYTES) {
        socket.destroy();
        finish(reject, new Error('oversized Blender MCP response'));
        return;
      }
      let response;
      try {
        response = JSON.parse(data);
      } catch {
        return; // wait for the rest of the JSON document
      }
      socket.end();
      if (response.status === 'error') finish(reject, new Error(response.message));
      else finish(accept, response.result);
    });
    socket.on('error', (err) => finish(reject, err));
    socket.on('timeout', () => {
      socket.destroy();
      finish(reject, new Error(`Blender MCP command '${type}' timed out after ${timeoutMs} ms`));
    });
    socket.on('end', () => {
      if (!data) finish(reject, new Error('Blender MCP closed before responding'));
    });
  });
}

/** Build the code string sent to execute_code for a project script. */
export async function scriptPayload(path, args = {}) {
  const abs = resolve(path);
  const source = await readFile(abs, 'utf8');
  const header = [
    'import json as _oys_json, sys as _oys_sys',
    `MCP_ARGS = _oys_json.loads(${JSON.stringify(JSON.stringify(args))})`,
    `__file__ = ${JSON.stringify(abs)}`,
    `_oys_dir = ${JSON.stringify(dirname(abs))}`,
    'if _oys_dir not in _oys_sys.path: _oys_sys.path.insert(0, _oys_dir)',
    "for _oys_name in [n for n in list(_oys_sys.modules) if n.startswith('oys_')]: del _oys_sys.modules[_oys_name]",
    '',
  ].join('\n');
  return header + source;
}

function parseArgs(pairs) {
  const out = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new Error(`expected key=value, got '${pair}'`);
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

async function main() {
  const [command = 'info', ...rest] = process.argv.slice(2);
  let result;
  if (command === 'ping') result = await blenderCommand('ping');
  else if (command === 'info') result = await blenderCommand('get_scene_info');
  else if (command === 'exec') {
    const [file, ...pairs] = rest;
    if (!file) throw new Error('exec needs a script path');
    result = await blenderCommand('execute_code', { code: await scriptPayload(file, parseArgs(pairs)) });
    if (result && typeof result.result === 'string') {
      process.stdout.write(result.result);
      return;
    }
  } else if (command === 'screenshot') {
    const [out, maxSize = '900'] = rest;
    if (!out) throw new Error('screenshot needs an output path');
    result = await blenderCommand('get_viewport_screenshot', { filepath: resolve(out), max_size: Number(maxSize) });
  } else {
    throw new Error(`unknown command '${command}'`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
