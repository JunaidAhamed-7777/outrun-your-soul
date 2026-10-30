// Deterministic ZIP creation for the itch.io HTML5 upload.
// - Entry names are POSIX paths (forward slashes), never Windows backslashes.
// - Entries are written in byte order with one fixed timestamp, so the same files
//   always produce the same archive bytes (and therefore the same SHA-256) with the
//   pinned fflate version, independent of machine timezone or file mtimes.
import { unzipSync, zipSync } from 'fflate';
import { compareBytes, extensionOf } from './files.mjs';

/**
 * Fixed DOS timestamp. fflate encodes local-time fields from a Date, so build the
 * Date from local components: the stored fields are 1980-01-01 00:00 everywhere.
 */
export const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

/** Already-compressed formats are stored rather than deflated again. */
const STORED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.ogg', '.m4a', '.woff', '.woff2', '.ktx2', '.zip']);

/**
 * @param {{ path: string, data: Uint8Array }[]} entries POSIX relative paths
 * @returns {Uint8Array}
 */
export function buildZip(entries) {
  const seen = new Set();
  const tree = {};
  for (const entry of [...entries].sort((a, b) => compareBytes(a.path, b.path))) {
    if (entry.path.includes('\\')) throw new Error(`ZIP entry uses a backslash: ${entry.path}`);
    if (entry.path.startsWith('/') || entry.path.split('/').includes('..')) throw new Error(`ZIP entry escapes the root: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`Duplicate ZIP entry: ${entry.path}`);
    seen.add(entry.path);
    const level = STORED_EXTENSIONS.has(extensionOf(entry.path)) ? 0 : 9;
    // Flat keys with '/' are treated by fflate as paths; insertion order is preserved.
    tree[entry.path] = [entry.data, { level, mtime: FIXED_ZIP_DATE }];
  }
  return zipSync(tree, { mtime: FIXED_ZIP_DATE });
}

/** @returns {{ path: string, data: Uint8Array, size: number }[]} directory entries omitted */
export function readZip(bytes) {
  const files = unzipSync(bytes);
  return Object.keys(files)
    .filter((name) => !name.endsWith('/'))
    .sort(compareBytes)
    .map((name) => ({ path: name, data: files[name], size: files[name].byteLength }));
}

/** Raw entry names as stored in the central directory, in archive order (for separator checks). */
export function zipEntryNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find the end-of-central-directory record (signature 0x06054b50) scanning backwards.
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: end of central directory not found');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const names = [];
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Corrupt central directory');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
