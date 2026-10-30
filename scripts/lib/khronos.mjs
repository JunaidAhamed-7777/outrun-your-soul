// Thin wrapper over the Khronos glTF Validator (npm `gltf-validator`, pinned in
// package.json). Its report covers glTF spec conformance, not visual quality or
// phone performance (docs/ART_PIPELINE.md "Export acceptance").
import validator from 'gltf-validator';

const SEVERITY = ['error', 'warning', 'info', 'hint'];

/**
 * @param {Uint8Array} bytes GLB file bytes
 * @param {string} uri name used in messages
 */
export async function validateGlbBytes(bytes, uri) {
  const report = await validator.validateBytes(bytes, {
    uri,
    format: 'glb',
    maxIssues: 500,
    writeTimestamp: false,
    // Shipped GLBs must be self-contained; any external URI is a failure.
    externalResourceFunction: (externalUri) => Promise.reject(new Error(`external resource not allowed: ${externalUri}`)),
  });
  const issues = report.issues ?? {};
  return {
    validatorVersion: validator.version(),
    numErrors: issues.numErrors ?? 0,
    numWarnings: issues.numWarnings ?? 0,
    numInfos: issues.numInfos ?? 0,
    numHints: issues.numHints ?? 0,
    messages: (issues.messages ?? []).map((m) => ({
      code: m.code,
      severity: SEVERITY[m.severity] ?? String(m.severity),
      message: m.message,
      ...(m.pointer ? { pointer: m.pointer } : {}),
    })),
    info: report.info
      ? {
          generator: report.info.generator ?? null,
          drawCallCount: report.info.drawCallCount ?? null,
          totalVertexCount: report.info.totalVertexCount ?? null,
          totalTriangleCount: report.info.totalTriangleCount ?? null,
          materialCount: report.info.materialCount ?? null,
          animationCount: report.info.animationCount ?? null,
          extensionsUsed: report.info.extensionsUsed ?? [],
        }
      : null,
  };
}

export function validatorVersion() {
  return validator.version();
}
