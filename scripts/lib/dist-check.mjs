// Static checks on a built web package (the Vite dist/ folder or an extracted ZIP),
// against itch.io's documented HTML5 ZIP rules and this project's packaging policy.
import { cssRefs, htmlRefs, inlineScripts, isExternalOrInline, isRootAbsolute, jsRefs, resolvePackagePath } from './refs.mjs';
import { extensionOf, isTextPath } from './files.mjs';

/**
 * itch.io HTML5 ZIP requirements, quoted from https://itch.io/docs/creators/html5
 * ("ZIP file requirements"), fetched 2026-10-30:
 *  - "The ZIP file should not contain more than 1,000 individual files after extraction."
 *  - "The maximum length of a file name including path should not be greater than 240 characters long."
 *  - "The size of all the extracted content should not be greater than 500MB."
 *  - "The size any single extracted file should not be greater than 200MB."
 *  - "The filenames are case sensitive and should be encoded as UTF-8"
 *  - "The ZIP file must contain a file called index.html"; absolute paths (starting with /) fail;
 *    paths ending in / return 403; other domains must be requested over HTTPS.
 * MB is taken as 10^6 bytes here; the page does not define it, and the totals we ship are far below either reading.
 */
export const ITCH_LIMITS = Object.freeze({
  source: 'https://itch.io/docs/creators/html5',
  fetched: '2026-10-30',
  maxFiles: 1000,
  maxPathLength: 240,
  maxTotalBytes: 500_000_000,
  maxFileBytes: 200_000_000,
});

/**
 * Project targets (docs/TEST_PLAN.md section 9 and docs/ART_PIPELINE.md budgets).
 * These are unmeasured proposals, reported as warnings, never as platform limits.
 */
export const PROJECT_TARGETS = Object.freeze({
  firstPlayBytes: 4_000_000, // TEST_PLAN: "<=4MB first-play payload"
  fullPayloadBytes: 10 * 1024 * 1024, // ART_PIPELINE: "<=10 MiB compressed total application payload"
});

const FORBIDDEN_FILES = [
  { test: (p) => /(^|\/)node_modules\//.test(p), why: 'dependency folder' },
  { test: (p) => /(^|\/)\.git(\/|$)/.test(p), why: 'git metadata' },
  { test: (p) => /\.blend\d*$/i.test(p), why: 'Blender source file (source-only asset)' },
  { test: (p) => /(^|\/)\.env(\.|$)/.test(p), why: 'environment/secrets file' },
  { test: (p) => /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(p), why: 'OS metadata file' },
  // Authoring fixtures (art/exports/*.glb such as calibration_tile) never ship.
  { test: (p) => /(^|\/)calibration_tile[^/]*$/i.test(p), why: 'calibration fixture (art/exports only, excluded from release)' },
  { test: (p) => /^art\//.test(p), why: 'art authoring folder (sources, exports, previews, reports)' },
];

const LOCAL_HOST_PATTERN = /\b(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/gi;
/** Non-global twin of LOCAL_HOST_PATTERN for .test() (a global regex keeps lastIndex state). */
const LOCAL_HOST_TEST = new RegExp(LOCAL_HOST_PATTERN.source, 'i');
/** XML/SVG namespace identifiers are not network requests. */
const NAMESPACE_ALLOW = /^http:\/\/(www\.w3\.org|ns\.adobe\.com|purl\.org|www\.khronos\.org|xmlns\.com)\//i;

/**
 * Check an in-memory package.
 * @param {{ path: string, data: Uint8Array, size: number, sha256?: string }[]} files POSIX relative paths
 */
export function checkPackage(files) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const decoder = new TextDecoder('utf-8');
  const text = (f) => decoder.decode(f.data);

  // --- itch.io platform limits -------------------------------------------------
  if (!byPath.has('index.html')) {
    errors.push({ code: 'missing-index', message: 'index.html is not at the package root' });
  }
  if (files.length > ITCH_LIMITS.maxFiles) {
    errors.push({ code: 'too-many-files', message: `${files.length} files exceeds itch.io limit of ${ITCH_LIMITS.maxFiles}` });
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > ITCH_LIMITS.maxTotalBytes) {
    errors.push({ code: 'too-large', message: `${totalBytes} bytes extracted exceeds itch.io limit of ${ITCH_LIMITS.maxTotalBytes}` });
  }
  for (const f of files) {
    if (f.size > ITCH_LIMITS.maxFileBytes) errors.push({ code: 'file-too-large', path: f.path, message: `${f.size} bytes exceeds per-file limit` });
    if (f.path.length > ITCH_LIMITS.maxPathLength) errors.push({ code: 'path-too-long', path: f.path, message: `path is ${f.path.length} characters (limit ${ITCH_LIMITS.maxPathLength})` });
  }

  // --- filename sanity (itch rules + project policy) ---------------------------
  const lowerSeen = new Map();
  for (const f of files) {
    const p = f.path;
    if (p.includes('\\')) errors.push({ code: 'backslash-path', path: p, message: 'backslash in path (Windows separator leaked into package)' });
    if (/\s/.test(p)) errors.push({ code: 'whitespace-path', path: p, message: 'whitespace in path (project policy: URL-safe names only)' });
    if (/[^\x20-\x7e]/.test(p)) warnings.push({ code: 'non-ascii-path', path: p, message: 'non-ASCII path; itch requires UTF-8 names, prefer ASCII' });
    if (/[#?%]/.test(p)) errors.push({ code: 'url-unsafe-path', path: p, message: 'characters #, ? or % break relative URL loading' });
    if (p.split('/').some((seg) => seg.startsWith('.'))) warnings.push({ code: 'dotfile', path: p, message: 'hidden file or folder in package' });
    for (const rule of FORBIDDEN_FILES) if (rule.test(p)) errors.push({ code: 'forbidden-file', path: p, message: `must not ship: ${rule.why}` });
    if (extensionOf(p) === '.map') warnings.push({ code: 'source-map', path: p, message: 'source map shipped; confirm it contains no unwanted source' });
    const lower = p.toLowerCase();
    const prior = lowerSeen.get(lower);
    if (prior) errors.push({ code: 'case-collision', path: p, message: `differs from ${prior} only by case (itch hosting is case-sensitive)` });
    else lowerSeen.set(lower, p);
  }

  // --- references ----------------------------------------------------------------
  const referenced = new Set();
  const missing = (from, ref, path) => errors.push({ code: 'missing-reference', path: from, message: `references ${ref} -> ${path ?? '(outside package)'} which is not in the package` });
  const requireRef = (from, ref) => {
    const path = resolvePackagePath(from, ref);
    if (path !== null && byPath.has(path)) referenced.add(path);
    else missing(from, ref, path);
  };
  /** Ambiguous-base literal: accept the document base (index.html) or the referencing file's directory. */
  const requireEither = (from, ref) => {
    const viaDoc = resolvePackagePath('index.html', ref);
    const viaFile = resolvePackagePath(from, ref);
    if (viaDoc !== null && byPath.has(viaDoc)) referenced.add(viaDoc);
    else if (viaFile !== null && byPath.has(viaFile)) referenced.add(viaFile);
    else missing(from, ref, viaDoc);
  };

  for (const f of files) {
    if (!isTextPath(f.path)) continue;
    const body = text(f);
    const ext = extensionOf(f.path);

    for (const m of body.matchAll(LOCAL_HOST_PATTERN)) {
      errors.push({ code: 'localhost-reference', path: f.path, message: `development host reference ${m[0]}` });
    }
    for (const m of body.matchAll(/\bhttp:\/\/[^\s"'`<>)]+/gi)) {
      if (NAMESPACE_ALLOW.test(m[0]) || LOCAL_HOST_TEST.test(m[0])) continue;
      warnings.push({ code: 'insecure-url', path: f.path, message: `plain http URL ${m[0]} (itch.io requires HTTPS for other domains)` });
    }

    if (ext === '.html' || ext === '.htm') {
      for (const ref of htmlRefs(body)) {
        if (ref.tag === 'a') continue;
        if (isRootAbsolute(ref.url)) {
          errors.push({ code: 'root-absolute', path: f.path, message: `<${ref.tag} ${ref.attr}="${ref.url}"> is root-absolute; fails under an itch nested URL` });
        } else if (ref.url.startsWith('//')) {
          warnings.push({ code: 'protocol-relative', path: f.path, message: `<${ref.tag} ${ref.attr}="${ref.url}"> loads from another host` });
        } else if (/^https?:/i.test(ref.url)) {
          warnings.push({ code: 'external-runtime-request', path: f.path, message: `<${ref.tag} ${ref.attr}="${ref.url}"> loads from the network; bundle it locally` });
        } else if (!isExternalOrInline(ref.url)) {
          requireRef(f.path, ref.url);
        }
      }
      for (const script of inlineScripts(body)) checkJs(f.path, script);
    } else if (ext === '.css') {
      for (const ref of cssRefs(body)) {
        if (isRootAbsolute(ref)) errors.push({ code: 'root-absolute', path: f.path, message: `CSS reference ${ref} is root-absolute` });
        else if (/^https?:/i.test(ref) || ref.startsWith('//')) warnings.push({ code: 'external-runtime-request', path: f.path, message: `CSS loads ${ref} from the network` });
        else if (!isExternalOrInline(ref)) requireRef(f.path, ref);
      }
    } else if (ext === '.js' || ext === '.mjs') {
      checkJs(f.path, body);
    }
  }

  function checkJs(from, body) {
    const refs = jsRefs(body);
    for (const spec of refs.moduleImports) requireRef(from, spec);
    for (const spec of refs.urlRefs) {
      if (isRootAbsolute(spec)) errors.push({ code: 'root-absolute', path: from, message: `new URL("${spec}") is root-absolute` });
      else if (!isExternalOrInline(spec)) requireRef(from, spec);
    }
    for (const lit of refs.assetLiterals) requireEither(from, lit);
    for (const lit of refs.rootAbsolute) {
      errors.push({ code: 'root-absolute', path: from, message: `string literal "${lit}" is root-absolute; use a relative base (import.meta.env.BASE_URL with base './')` });
    }
  }

  // --- project payload targets (warnings only) ------------------------------------
  if (totalBytes > PROJECT_TARGETS.fullPayloadBytes) {
    warnings.push({ code: 'payload-target', message: `extracted payload ${totalBytes} bytes exceeds the ${PROJECT_TARGETS.fullPayloadBytes}-byte project target (ART_PIPELINE, unmeasured proposal)` });
  } else if (totalBytes > PROJECT_TARGETS.firstPlayBytes) {
    notes.push(`extracted payload ${totalBytes} bytes is above the 4 MB first-play target in TEST_PLAN (compressed transfer may still be below it)`);
  }

  const unreferenced = files.map((f) => f.path).filter((p) => p !== 'index.html' && !referenced.has(p));
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    notes,
    totals: { files: files.length, bytes: totalBytes },
    referenced: [...referenced].sort(),
    unreferenced,
  };
}
