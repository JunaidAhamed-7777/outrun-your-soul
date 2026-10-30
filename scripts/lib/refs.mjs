// Reference extraction for built web output. Deliberately regex-based and
// conservative: it must find every static reference Vite emits (scripts, styles,
// module imports, `new URL(x, import.meta.url)`, relative "assets/..." literals)
// without executing code. Runtime-constructed URLs (for example a model ID
// concatenated onto BASE_URL) cannot be resolved statically; callers cover those
// by also requesting every packaged file.

const ATTR_TAGS = ['script', 'link', 'img', 'iframe', 'source', 'audio', 'video', 'track', 'embed', 'object', 'image', 'use'];

/** Strip HTML comments so commented-out tags are not treated as live references. */
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * References in an HTML document.
 * @returns {{ url: string, tag: string, attr: string, rel?: string }[]}
 */
export function htmlRefs(html) {
  const refs = [];
  const text = stripHtmlComments(html);
  const tagPattern = new RegExp(`<(${ATTR_TAGS.join('|')})\\b([^>]*)>`, 'gi');
  for (const match of text.matchAll(tagPattern)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.toLowerCase();
    for (const attrMatch of attrs.matchAll(/\b(src|href|data|poster|xlink:href)\s*=\s*(["'])(.*?)\2/gi)) {
      const url = attrMatch[3].trim();
      if (url) refs.push({ url, tag, attr: attrMatch[1].toLowerCase(), ...(rel ? { rel } : {}) });
    }
  }
  return refs;
}

/** Inline <script> bodies (module or classic) for JS reference scanning. */
export function inlineScripts(html) {
  const text = stripHtmlComments(html);
  return [...text.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

/** url(...) and @import references in CSS. */
export function cssRefs(css) {
  const refs = [];
  for (const m of css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) refs.push(m[2].trim());
  for (const m of css.matchAll(/@import\s+(["'])([^"']+)\1/gi)) refs.push(m[2].trim());
  return refs.filter((u) => u && !u.startsWith('data:') && !u.startsWith('#'));
}

/**
 * References in a JavaScript module.
 * - moduleImports: static/dynamic import specifiers (resolve against the module URL)
 * - urlRefs: `new URL("x", import.meta.url)` (resolve against the module URL)
 * - assetLiterals: quoted relative "assets/..." / "./assets/..." paths with a file extension
 *   (Vite preload lists and BASE_URL-relative literals; resolution base is ambiguous,
 *   so callers accept either the document or the module as base)
 * - rootAbsolute: quoted literals starting with "/assets/" (fail on a nested itch URL)
 */
export function jsRefs(js) {
  const moduleImports = [];
  for (const m of js.matchAll(/\b(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?(["'])([^"'\n]+)\1/g)) {
    if (isRelativeSpecifier(m[2])) moduleImports.push(m[2]);
  }
  for (const m of js.matchAll(/\bimport\(\s*(["'`])([^"'`\n]+)\1\s*\)/g)) {
    if (isRelativeSpecifier(m[2])) moduleImports.push(m[2]);
  }
  const urlRefs = [];
  for (const m of js.matchAll(/new\s+URL\(\s*(["'`])([^"'`\n]+)\1\s*,\s*import\.meta\.url\s*\)/g)) urlRefs.push(m[2]);
  const assetLiterals = [];
  for (const m of js.matchAll(/(["'`])((?:\.\/)?assets\/[^"'`\s$]+\.[A-Za-z0-9]{1,8})\1/g)) assetLiterals.push(m[2]);
  const rootAbsolute = [];
  for (const m of js.matchAll(/(["'`])(\/assets\/[^"'`\s]*)\1/g)) rootAbsolute.push(m[2]);
  return {
    moduleImports: unique(moduleImports),
    urlRefs: unique(urlRefs),
    assetLiterals: unique(assetLiterals),
    rootAbsolute: unique(rootAbsolute),
  };
}

function isRelativeSpecifier(spec) {
  return spec.startsWith('./') || spec.startsWith('../');
}

function unique(list) {
  return [...new Set(list)];
}

/** True when a URL leaves the package (scheme or protocol-relative), or is a data/blob/anchor URL. */
export function isExternalOrInline(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#');
}

export function isRootAbsolute(url) {
  return url.startsWith('/') && !url.startsWith('//');
}

/**
 * Resolve a package-relative reference against the POSIX path of the referencing file.
 * Returns the package path (no leading slash), or null when it escapes the package root.
 */
export function resolvePackagePath(fromPath, ref) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')).split('/') : [];
  const parts = [...baseDir];
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(decodeURIComponentSafe(seg));
  }
  return parts.join('/');
}

function decodeURIComponentSafe(seg) {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
