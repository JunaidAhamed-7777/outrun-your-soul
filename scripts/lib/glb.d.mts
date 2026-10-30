export interface ParsedGlb {
  version: number;
  length: number;
  json: any;
  bin: Uint8Array | null;
}
export function parseGlb(bytes: Uint8Array): ParsedGlb;
export interface Budget {
  label: string;
  maxTriangles: number | null;
  maxMaterials: number | null;
}
export const BUDGETS: Readonly<Record<string, Budget & { materialsHard: boolean }>>;
export const ASSET_RULES: Readonly<Record<string, { category: string; parts: string[] }>>;
export interface GltfAnalysis {
  assetId: string;
  category: string;
  budget: Budget;
  rootNodes: string[];
  childNodes: string[];
  triangles: number;
  materials: string[];
  materialCount: number;
  meshes: number;
  nodes: number;
  animations: string[];
  extensionsUsed: string[];
  bounds: { min: number[]; max: number[]; size: number[] } | null;
  errors: string[];
  warnings: string[];
}
export function analyzeGltf(json: any, assetId: string): GltfAnalysis;
