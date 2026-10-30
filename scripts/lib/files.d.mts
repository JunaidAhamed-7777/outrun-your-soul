export interface TreeFile {
  path: string;
  data: Uint8Array;
  size: number;
  sha256: string;
}
export function listFiles(root: string): string[];
export function compareBytes(a: string, b: string): number;
export function sha256(data: Uint8Array | string): string;
export function readTree(root: string): TreeFile[];
export function formatBytes(bytes: number): string;
export function extensionOf(path: string): string;
export function isTextPath(path: string): boolean;
export function contentTypeFor(path: string): string;
