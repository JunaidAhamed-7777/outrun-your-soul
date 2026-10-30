export const FIXED_ZIP_DATE: Date;
export function buildZip(entries: { path: string; data: Uint8Array }[]): Uint8Array;
export function readZip(bytes: Uint8Array): { path: string; data: Uint8Array; size: number }[];
export function zipEntryNames(bytes: Uint8Array): string[];
