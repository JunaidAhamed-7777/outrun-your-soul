/**
 * Timing for the title-screen vignette: a body that dashes in quick bursts and a soul
 * that follows the same route slowly, then the two meet. Positions are fractions of
 * the drawn path. Pure so it can be tested and rendered at any frame rate.
 */
export interface DemoDash {
  /** Seconds into the cycle. */
  readonly at: number;
  /** Path fraction covered. */
  readonly length: number;
}

export const DEMO = {
  dashes: [
    { at: 0.5, length: 0.24 },
    { at: 1.25, length: 0.22 },
    { at: 2.0, length: 0.26 },
  ] as readonly DemoDash[],
  /** Body path-fraction per second while dashing (fast). */
  dashSpeed: 2.4,
  /** Soul path-fraction per second (slow), starting with the first dash. */
  soulSpeed: 0.17,
  reunionSeconds: 0.9,
  fadeOutSeconds: 0.6,
  fadeInSeconds: 0.4,
} as const;

export interface DemoFrame {
  /** Body position along the path, 0..1. */
  readonly body: number;
  /** Soul position along the path, 0..1, never ahead of the body. */
  readonly soul: number;
  /** Reunion glow, 0..1. */
  readonly reunion: number;
  /** Overall opacity for the loop fade, 0..1. */
  readonly opacity: number;
}

function bodyAt(t: number): number {
  let s = 0;
  for (const d of DEMO.dashes) {
    if (t <= d.at) break;
    s += Math.min(d.length, (t - d.at) * DEMO.dashSpeed);
  }
  return s;
}

const totalBody = DEMO.dashes.reduce((sum, d) => sum + d.length, 0);
const firstDash = DEMO.dashes[0]?.at ?? 0;
/** Time at which the soul reaches the resting body. */
export const DEMO_MEET_TIME = firstDash + totalBody / DEMO.soulSpeed;
export const DEMO_CYCLE = DEMO_MEET_TIME + DEMO.reunionSeconds + DEMO.fadeOutSeconds + DEMO.fadeInSeconds;

export function demoFrame(time: number): DemoFrame {
  const t = ((time % DEMO_CYCLE) + DEMO_CYCLE) % DEMO_CYCLE;
  const fadeInStart = DEMO_CYCLE - DEMO.fadeInSeconds;
  if (t >= fadeInStart) {
    return { body: 0, soul: 0, reunion: 0, opacity: (t - fadeInStart) / DEMO.fadeInSeconds };
  }
  const body = bodyAt(t);
  const soul = Math.min(body, Math.max(0, (t - firstDash) * DEMO.soulSpeed));
  let reunion = 0;
  let opacity = 1;
  if (t >= DEMO_MEET_TIME) {
    const since = t - DEMO_MEET_TIME;
    reunion = Math.max(0, 1 - since / DEMO.reunionSeconds);
    const fadeStart = DEMO.reunionSeconds;
    if (since >= fadeStart) opacity = Math.max(0, 1 - (since - fadeStart) / DEMO.fadeOutSeconds);
  }
  return { body, soul, reunion, opacity };
}

/** Static composition for reduced motion: separated pair mid-route. */
export const DEMO_STATIC: DemoFrame = { body: totalBody, soul: totalBody * 0.38, reunion: 0, opacity: 1 };
