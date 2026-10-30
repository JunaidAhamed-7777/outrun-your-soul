export interface KhronosMessage {
  code: string;
  severity: string;
  message: string;
  pointer?: string;
}
export interface KhronosReport {
  validatorVersion: string;
  numErrors: number;
  numWarnings: number;
  numInfos: number;
  numHints: number;
  messages: KhronosMessage[];
  info: {
    generator: string | null;
    drawCallCount: number | null;
    totalVertexCount: number | null;
    totalTriangleCount: number | null;
    materialCount: number | null;
    animationCount: number | null;
    extensionsUsed: string[];
  } | null;
}
export function validateGlbBytes(bytes: Uint8Array, uri: string): Promise<KhronosReport>;
export function validatorVersion(): string;
