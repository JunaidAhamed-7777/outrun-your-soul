/**
 * Fixed portrait camera framing. Pure math so it can be unit tested without WebGL.
 *
 * The camera is orthographic, looks north (-Z in Three) and pitches down by PITCH_DEG.
 * "Screen height" s of a point at simulation y with height h is y*sin(pitch) + h*cos(pitch):
 * ground depth is foreshortened, heights are shortened by cos(pitch).
 */
export const PITCH_DEG = 55;
/** Tiles of floor visible beside the room on narrow (width-limited) screens. */
export const SIDE_MARGIN = 0.35;
/** Minimum screen-space room below the south edge (thumb rest area, outer plaza). */
export const BOTTOM_MIN = 0.9;
/** Minimum screen-space room above the north floor edge (north wall, gate, skyline). */
export const TOP_MIN = 2.6;
/** Share of spare vertical space given to the bottom (thumb) area on tall phones. */
export const BOTTOM_SHARE = 0.36;

export interface CameraFitInput {
  readonly roomWidth: number;
  readonly roomHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pitchDeg?: number;
}

export interface CameraFit {
  /** Orthographic frustum width and height in world units. */
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly pitch: number;
  /** Ground point (simulation coordinates) at the centre of the screen. */
  readonly target: { readonly x: number; readonly y: number };
  /** Screen-space extent (s units) of the visible area. */
  readonly sBottom: number;
  readonly sTop: number;
  /** Camera position in Three world coordinates for a given distance. */
  position(distance: number): [number, number, number];
}

export function screenS(y: number, height: number, pitch: number): number {
  return y * Math.sin(pitch) + height * Math.cos(pitch);
}

export function fitCamera(input: CameraFitInput): CameraFit {
  const pitch = ((input.pitchDeg ?? PITCH_DEG) * Math.PI) / 180;
  const aspect = Math.max(1e-3, input.viewportWidth) / Math.max(1e-3, input.viewportHeight);
  const roomS = screenS(input.roomHeight, 0, pitch);
  const neededW = input.roomWidth + SIDE_MARGIN * 2;
  const neededH = roomS + TOP_MIN + BOTTOM_MIN;

  let viewWidth: number;
  let viewHeight: number;
  if (neededW / aspect >= neededH) {
    viewWidth = neededW;
    viewHeight = neededW / aspect;
  } else {
    viewHeight = neededH;
    viewWidth = neededH * aspect;
  }
  const spare = viewHeight - neededH;
  const sBottom = -(BOTTOM_MIN + spare * BOTTOM_SHARE);
  const sTop = sBottom + viewHeight;
  const sCentre = (sBottom + sTop) / 2;
  const target = { x: input.roomWidth / 2, y: sCentre / Math.sin(pitch) };

  return {
    viewWidth,
    viewHeight,
    pitch,
    target,
    sBottom,
    sTop,
    position(distance: number): [number, number, number] {
      return [target.x, distance * Math.sin(pitch), -target.y + distance * Math.cos(pitch)];
    },
  };
}
