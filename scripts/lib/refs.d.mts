export interface HtmlRef {
  url: string;
  tag: string;
  attr: string;
  rel?: string;
}
export interface JsRefs {
  moduleImports: string[];
  urlRefs: string[];
  assetLiterals: string[];
  rootAbsolute: string[];
}
export function htmlRefs(html: string): HtmlRef[];
export function inlineScripts(html: string): string[];
export function cssRefs(css: string): string[];
export function jsRefs(js: string): JsRefs;
export function isExternalOrInline(url: string): boolean;
export function isRootAbsolute(url: string): boolean;
export function resolvePackagePath(fromPath: string, ref: string): string | null;
