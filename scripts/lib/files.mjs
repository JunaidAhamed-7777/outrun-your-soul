// Small filesystem helpers shared by the release scripts. Paths returned here are
// always POSIX-style (forward slashes) and relative to the scanned root, sorted by
// byte order so every consumer (ZIP writer, manifest, crawler) sees one ordering.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Recursively list files under `root` as sorted POSIX relative paths. */
export function listFiles(root) {
  const out = [];
  const visit = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(abs).isDirectory()) visit(abs, rel);
      else out.push(rel);
    }
  };
  visit(root, '');
  return out.sort(compareBytes);
}

/** Deterministic byte-order comparison (locale-independent). */
export function compareBytes(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** Read every file under `root` into memory: [{ path, data, size, sha256 }]. */
export function readTree(root) {
  return listFiles(root).map((path) => {
    const data = readFileSync(join(root, ...path.split('/')));
    return { path, data: new Uint8Array(data), size: data.byteLength, sha256: sha256(data) };
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.svg', '.webmanifest', '.txt', '.xml', '.map']);

export function extensionOf(path) {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

export function isTextPath(path) {
  return TEXT_EXTENSIONS.has(extensionOf(path));
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(path) {
  return CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream';
}
