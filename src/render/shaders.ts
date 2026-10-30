/**
 * Small purpose-built shader materials for state-bearing overlays. Each signal has its
 * own shape language so meaning never depends on colour alone:
 *  - ribbon: soft silk strip, sheen, slow shimmer; no glow (harmless forecast)
 *  - preview: crisp ivory dots/dashes
 *  - telegraph: amber; tracking = flickering dashed hairline, locked = railed band with
 *    forward chevrons and a time-to-fire fill
 *  - lane: violet field with diagonal stripes and a hard outline
 *  - ring: generic arc/segmented ring for footprints, reticles, capacity and markers
 */
import { AdditiveBlending, Color, DoubleSide, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { color } from './palette';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function overlay(fragmentShader: string, uniforms: Record<string, { value: unknown }>, additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

export function ribbonMaterial(): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform vec3 uDark;
uniform vec3 uSheen;
uniform float uTime;
uniform float uFlow;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float v = vUv.y;
  float u = vUv.x;
  float edge = smoothstep(0.0, 0.16, v) * smoothstep(1.0, 0.84, v);
  float across = 1.0 - pow(abs(v - 0.5) * 2.0, 2.0);
  vec3 col = mix(uDark, uColor, 0.45 + 0.55 * across);
  float flowU = u + uTime * uFlow;
  float sheen = exp(-pow((v - 0.36) * 8.0, 2.0));
  float shimmer = 0.5 + 0.5 * sin(flowU * 2.6);
  col = mix(col, uSheen, sheen * (0.22 + 0.28 * shimmer));
  float weave = 0.5 + 0.5 * sin(flowU * 26.0 + v * 7.0);
  col *= 0.93 + 0.07 * weave;
  gl_FragColor = vec4(col, uOpacity * edge);
  #include <colorspace_fragment>
}
`,
    {
      uColor: { value: color('vermilion') },
      uDark: { value: color('vermilion_dark') },
      uSheen: { value: new Color('#ffb08a') },
      uTime: { value: 0 },
      uFlow: { value: 0.35 },
      uOpacity: { value: 1 },
    },
  );
}

/** Soft contact shadow for flat strips (ribbon shadow). */
export function stripShadowMaterial(opacity = 0.28): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float c = abs(vUv.y - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, c)) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`,
    { uColor: { value: color('cobalt_deep') }, uOpacity: { value: opacity } },
  );
}

/** Dotted (style 0) or dashed (style 1) path, u in world units along the strip. */
export function dotLineMaterial(c: Color, halfWidth: number, period: number, style: 0 | 1 = 0): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPeriod;
uniform float uTime;
uniform float uScroll;
uniform float uHalfWidth;
uniform float uStyle;
varying vec2 vUv;
void main() {
  float u = vUv.x - uTime * uScroll;
  float local = mod(u, uPeriod) - 0.5 * uPeriod;
  float across = (vUv.y - 0.5) * 2.0 * uHalfWidth;
  float a;
  if (uStyle < 0.5) {
    float d = length(vec2(local, across));
    a = 1.0 - smoothstep(uHalfWidth * 0.62, uHalfWidth * 0.9, d);
  } else {
    a = (1.0 - smoothstep(uPeriod * 0.28, uPeriod * 0.31, abs(local)))
      * (1.0 - smoothstep(0.75, 1.0, abs(vUv.y - 0.5) * 2.0));
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <colorspace_fragment>
}
`,
    {
      uColor: { value: c.clone() },
      uOpacity: { value: 1 },
      uPeriod: { value: period },
      uTime: { value: 0 },
      uScroll: { value: 0.6 },
      uHalfWidth: { value: halfWidth },
      uStyle: { value: style },
    },
  );
}

export function telegraphMaterial(): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLocked;
uniform float uProgress;
uniform float uLength;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
void main() {
  float u = vUv.x;
  float c = abs(vUv.y - 0.5) * 2.0;
  float a;
  if (uLocked < 0.5) {
    float dash = step(0.42, fract(u * 2.4 - uTime * 1.6 * uMotion));
    float core = 1.0 - smoothstep(0.18, 0.34, c);
    float flicker = 0.62 + 0.38 * sin(uTime * 28.0 * uMotion + u * 3.0);
    a = core * dash * mix(0.85, flicker, uMotion);
  } else {
    float rail = smoothstep(0.74, 0.8, c) * (1.0 - smoothstep(0.93, 1.0, c));
    float chev = step(0.55, fract(u * 1.5 + c * 0.6 - uTime * 2.2 * uMotion));
    float filled = 1.0 - step(uProgress * uLength, u);
    float inner = (1.0 - smoothstep(0.66, 0.74, c)) * mix(0.16, 0.62, filled) * (0.55 + 0.45 * chev);
    a = max(rail * mix(0.75, 1.0, filled), inner);
  }
  float endFade = 1.0 - smoothstep(uLength - 0.2, uLength, u);
  float startFade = smoothstep(0.0, 0.25, u);
  a *= endFade * startFade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`,
    {
      uColor: { value: color('warning_amber') },
      uOpacity: { value: 1 },
      uLocked: { value: 0 },
      uProgress: { value: 0 },
      uLength: { value: 1 },
      uTime: { value: 0 },
      uMotion: { value: 1 },
    },
  );
}

export function laneMaterial(width: number, height: number): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform vec3 uStripe;
uniform float uStatus;
uniform float uTime;
uniform vec2 uSize;
uniform float uMotion;
varying vec2 vUv;
void main() {
  vec2 p = vUv * uSize;
  float border = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
  float outline = 1.0 - smoothstep(0.05, 0.085, border);
  float diag = fract((p.x + p.y) * 1.3 - uTime * 1.1 * uMotion);
  float stripe = smoothstep(0.0, 0.05, diag) * (1.0 - smoothstep(0.4, 0.46, diag));
  vec3 col;
  float a;
  if (uStatus < 0.5) {
    col = uColor;
    a = outline * 0.4 + 0.05;
  } else if (uStatus < 1.5) {
    float blink = 0.5 + 0.5 * sin(uTime * mix(5.0, 13.0, uMotion));
    col = mix(uColor, uStripe, 0.35);
    float dashEdge = step(0.5, fract((p.x - p.y) * 2.0));
    a = outline * (0.45 + 0.55 * blink) * mix(1.0, dashEdge, 0.5) + stripe * 0.16 + 0.07;
  } else {
    col = mix(uColor, uStripe, stripe * 0.8);
    a = 0.6 + outline * 0.4;
  }
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`,
    {
      uColor: { value: color('lane_violet') },
      uStripe: { value: color('lane_stripe') },
      uStatus: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: new Vector2(width, height) },
      uMotion: { value: 1 },
    },
  );
}

export interface RingParams {
  color: Color;
  inner: number;
  outer: number;
  opacity?: number;
  arc?: number;
  start?: number;
  segments?: number;
  gap?: number;
  additive?: boolean;
}

/** Ring drawn on a quad whose half-size is the outer radius; inner/outer are 0..1 of that. */
export function ringMaterial(params: RingParams): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uInner;
uniform float uOuter;
uniform float uArc;
uniform float uStart;
uniform float uSegments;
uniform float uGap;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float soft = fwidth(r) * 1.2 + 0.004;
  float a = smoothstep(uInner - soft, uInner, r) * (1.0 - smoothstep(uOuter - soft, uOuter, r));
  float t = fract((atan(p.y, p.x) - uStart) / 6.2831853);
  if (t > uArc) a = 0.0;
  if (uSegments > 0.5) {
    float s = fract(t * uSegments);
    if (s > 1.0 - uGap) a = 0.0;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <colorspace_fragment>
}
`,
    {
      uColor: { value: params.color.clone() },
      uOpacity: { value: params.opacity ?? 1 },
      uInner: { value: params.inner },
      uOuter: { value: params.outer },
      uArc: { value: params.arc ?? 1 },
      uStart: { value: params.start ?? 0 },
      uSegments: { value: params.segments ?? 0 },
      uGap: { value: params.gap ?? 0.3 },
    },
    params.additive ?? false,
  );
}

/** Soft additive glow with optional four-point star (cut spark, gate light, soul halo). */
export function glowMaterial(c: Color, star = 0, opacity = 1): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uStar;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float g = pow(max(0.0, 1.0 - r), 2.2);
  float sx = max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x));
  float sy = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y));
  float a = (g + uStar * (sx + sy)) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`,
    { uColor: { value: c.clone() }, uOpacity: { value: opacity }, uStar: { value: star } },
    true,
  );
}

/** Fragment-free helper to set a uniform when present (keeps call sites terse). */
export function setUniform(material: ShaderMaterial, name: string, value: number): void {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}

/** Fading streak along a strip: opaque at u = 0 (the leading end), clear at uLength. */
export function streakMaterial(c: Color): ShaderMaterial {
  return overlay(
    /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLength;
varying vec2 vUv;
void main() {
  float along = clamp(1.0 - vUv.x / max(uLength, 1e-4), 0.0, 1.0);
  float c = abs(vUv.y - 0.5) * 2.0;
  float a = along * along * (1.0 - smoothstep(0.35, 1.0, c)) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`,
    { uColor: { value: c.clone() }, uOpacity: { value: 1 }, uLength: { value: 1 } },
    true,
  );
}
