export interface PackageFile {
  path: string;
  data: Uint8Array;
  size: number;
  sha256?: string;
}
export interface Finding {
  code: string;
  path?: string;
  message: string;
}
export interface PackageReport {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  notes: string[];
  totals: { files: number; bytes: number };
  referenced: string[];
  unreferenced: string[];
}
export const ITCH_LIMITS: Readonly<{
  source: string;
  fetched: string;
  maxFiles: number;
  maxPathLength: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}>;
export const PROJECT_TARGETS: Readonly<{ firstPlayBytes: number; fullPayloadBytes: number }>;
export function checkPackage(files: PackageFile[]): PackageReport;
