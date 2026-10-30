import { describe, expect, it } from 'vitest';
import { checkPackage, type PackageFile } from '../../scripts/lib/dist-check.mjs';
import { cssRefs, htmlRefs, jsRefs, resolvePackagePath } from '../../scripts/lib/refs.mjs';
import { buildZip, readZip, zipEntryNames } from '../../scripts/lib/zip.mjs';
import { sha256 } from '../../scripts/lib/files.mjs';

const enc = new TextEncoder();
const file = (path: string, body: string | Uint8Array): PackageFile => {
  const data = typeof body === 'string' ? enc.encode(body) : body;
  return { path, data, size: data.byteLength };
};

/** Shape of a Vite build with base './'. */
function viteLikePackage(): PackageFile[] {
  return [
    file(
      'index.html',
      `<!doctype html><html><head>
        <script type="module" crossorigin src="./assets/index-abc123.js"></script>
        <link rel="modulepreload" crossorigin href="./assets/three-def456.js">
        <link rel="stylesheet" crossorigin href="./assets/index-777.css">
        <!-- <script src="/old.js"></script> -->
      </head><body><div id="app"></div></body></html>`,
    ),
    file(
      'assets/index-abc123.js',
      `import{a as t}from"./three-def456.js";const u=new URL("logo-1.png",import.meta.url).href;` +
        `const m=["assets/lazy-9.js"];const ns="http://www.w3.org/2000/svg";` +
        `const base="./";fetch(base+"assets/models/"+id+".glb");`,
    ),
    file('assets/three-def456.js', 'export const a=1;'),
    file('assets/lazy-9.js', 'export default 1;'),
    file('assets/logo-1.png', new Uint8Array([137, 80, 78, 71])),
    file('assets/index-777.css', 'body{background:url(./logo-1.png)}'),
    file('assets/models/courier_body.glb', new Uint8Array([103, 108, 84, 70])),
  ];
}

describe('reference extraction', () => {
  it('finds HTML script, preload and stylesheet references but ignores comments', () => {
    const refs = htmlRefs(new TextDecoder().decode(viteLikePackage()[0]!.data));
    expect(refs.map((r) => r.url)).toEqual(['./assets/index-abc123.js', './assets/three-def456.js', './assets/index-777.css']);
    expect(refs[1]?.rel).toBe('modulepreload');
  });

  it('finds JS static imports, dynamic imports, URL refs, asset literals and root-absolute literals', () => {
    const refs = jsRefs(
      `import x from "./a.js";export{y}from'./b.js';import("./c.js");import "./side.js";` +
        `new URL("img.png", import.meta.url);const p="assets/models/x.glb";const bad='/assets/y.glb';import "three";`,
    );
    expect(refs.moduleImports).toEqual(['./a.js', './b.js', './side.js', './c.js']);
    expect(refs.urlRefs).toEqual(['img.png']);
    expect(refs.assetLiterals).toEqual(['assets/models/x.glb']);
    expect(refs.rootAbsolute).toEqual(['/assets/y.glb']);
  });

  it('finds CSS url() and @import references, skipping data URLs', () => {
    expect(cssRefs(`@import "./base.css";a{background:url('x.png')}b{background:url(data:image/png;base64,AAA)}`)).toEqual([
      'x.png',
      './base.css',
    ]);
  });

  it('resolves package paths and refuses to escape the root', () => {
    expect(resolvePackagePath('assets/index.js', './three.js')).toBe('assets/three.js');
    expect(resolvePackagePath('assets/index.js', '../index.html')).toBe('index.html');
    expect(resolvePackagePath('index.html', './assets/a.js?v=1#x')).toBe('assets/a.js');
    expect(resolvePackagePath('index.html', '../escape.js')).toBeNull();
  });
});

describe('package checks', () => {
  it('passes a well-formed relative-base Vite package', () => {
    const report = checkPackage(viteLikePackage());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.referenced).toContain('assets/lazy-9.js');
    expect(report.referenced).toContain('assets/logo-1.png');
    // Runtime-constructed model URLs cannot be resolved statically; they are reported, not failed.
    expect(report.unreferenced).toEqual(['assets/models/courier_body.glb']);
  });

  it('fails without a root index.html', () => {
    const report = checkPackage(viteLikePackage().filter((f) => f.path !== 'index.html'));
    expect(report.errors.map((e) => e.code)).toContain('missing-index');
  });

  it('fails root-absolute references that break under an itch nested URL', () => {
    const files = viteLikePackage();
    files.push(file('assets/bad.js', 'fetch("/assets/models/x.glb")'));
    files[0] = file('index.html', '<script type="module" src="/assets/index-abc123.js"></script>');
    const codes = checkPackage(files).errors.map((e) => e.code);
    expect(codes.filter((c) => c === 'root-absolute')).toHaveLength(2);
  });

  it('fails development host references and warns on plain http, but allows XML namespaces', () => {
    const files = viteLikePackage();
    files.push(file('assets/dev.js', 'const a="http://localhost:5173/x";const b="http://example.com/y";'));
    const report = checkPackage(files);
    expect(report.errors.map((e) => e.code)).toEqual(['localhost-reference']);
    expect(report.warnings.map((w) => w.message).join('\n')).toContain('http://example.com/y');
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('w3.org');
  });

  it('fails missing references', () => {
    const files = viteLikePackage().filter((f) => f.path !== 'assets/three-def456.js');
    const missing = checkPackage(files).errors.filter((e) => e.code === 'missing-reference');
    expect(missing.length).toBeGreaterThanOrEqual(2); // modulepreload + static import
  });

  it('fails case collisions, whitespace, backslashes and source-only files', () => {
    const files = viteLikePackage();
    files.push(file('assets/Logo-1.png', new Uint8Array([1])));
    files.push(file('assets/my file.png', new Uint8Array([1])));
    files.push(file('assets\\win.js', ''));
    files.push(file('art/courier.blend', new Uint8Array([1])));
    files.push(file('.env', 'SECRET=1'));
    files.push(file('assets/models/calibration_tile.glb', new Uint8Array([1])));
    const codes = checkPackage(files).errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['case-collision', 'whitespace-path', 'backslash-path', 'forbidden-file']));
    // .blend (also under art/), .env and the calibration fixture
    expect(checkPackage(files).errors.filter((e) => e.code === 'forbidden-file').map((e) => e.path)).toEqual([
      'art/courier.blend',
      'art/courier.blend',
      '.env',
      'assets/models/calibration_tile.glb',
    ]);
  });

  it('enforces itch.io file count and path length limits', () => {
    const files = viteLikePackage();
    for (let i = 0; i < 1000; i++) files.push(file(`assets/f${i}.txt`, ''));
    files.push(file(`assets/${'a'.repeat(240)}.txt`, ''));
    const codes = checkPackage(files).errors.map((e) => e.code);
    expect(codes).toContain('too-many-files');
    expect(codes).toContain('path-too-long');
  });
});

describe('deterministic ZIP', () => {
  it('produces identical bytes regardless of input order', () => {
    const files = viteLikePackage();
    const a = buildZip(files);
    const b = buildZip([...files].reverse());
    expect(sha256(a)).toBe(sha256(b));
  });

  it('stores forward-slash entry names in byte order and round-trips content', () => {
    const files = viteLikePackage();
    const zip = buildZip(files);
    const names = zipEntryNames(zip);
    expect(names).toEqual([...names].sort());
    expect(names.every((n) => !n.includes('\\'))).toBe(true);
    expect(names).toContain('assets/models/courier_body.glb');
    const back = readZip(zip);
    expect(back.map((f) => f.path)).toEqual(files.map((f) => f.path).sort());
    for (const f of back) {
      const original = files.find((o) => o.path === f.path)!;
      expect(sha256(f.data)).toBe(sha256(original.data));
    }
  });

  it('rejects backslash, escaping and duplicate entries', () => {
    expect(() => buildZip([{ path: 'a\\b.js', data: new Uint8Array() }])).toThrow(/backslash/);
    expect(() => buildZip([{ path: '../x.js', data: new Uint8Array() }])).toThrow(/escapes/);
    expect(() =>
      buildZip([
        { path: 'x.js', data: new Uint8Array() },
        { path: 'x.js', data: new Uint8Array() },
      ]),
    ).toThrow(/Duplicate/);
  });
});
