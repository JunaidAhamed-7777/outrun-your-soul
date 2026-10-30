/**
 * Centralised gameplay tuning. COMBAT_SPEC lists these as illustrative, untested
 * starting values; change them here (never inline) and record evidence when you do.
 * Units: tiles, seconds, tiles/second.
 */
export const TUNING = {
  /** Fixed simulation rate. 120 Hz keeps per-step travel small; events are still swept. */
  stepHz: 120,
  /** Upper bound on simulated time per rendered frame; excess wall time is dropped, not replayed. */
  maxCatchUpSeconds: 0.1,

  bodyRadius: 0.3,
  /** Soul radius must not exceed body radius: the soul follows routes validated for the body. */
  soulRadius: 0.3,
  /** Extra separation beyond combined radii required before contact reunion arms. */
  contactArmTolerance: 0.12,
  /** Clearance kept between a truncated dash endpoint and the wall it hit. */
  wallSkin: 0.02,

  dashMaxDistance: 3,
  dashSpeed: 15,
  /** Dashes shorter than this are rejected as invalid instead of spending an action. */
  dashMinDistance: 0.35,
  recoverySeconds: 0.15,
  /** A release within this window before recovery ends is held as one visible queued intent. */
  inputBufferSeconds: 0.18,

  soulSpeed: 2,
  returnSpeed: 9,

  tetherCapacity: 6,
  /** Representation bound on stored route vertices (unmeasured proposal from COMBAT_SPEC). */
  maxRouteVertices: 64,

  maxHealth: 5,
  /** Brief global damage grace after any hit. Not dash protection, not return invulnerability. */
  hitGraceSeconds: 0.75,

  /** Numeric tolerance for event-time comparison. Events within this many seconds are a tie. */
  timeEpsilon: 1e-7,
  /** Geometric tolerance for position comparisons and invariant checks. */
  geomEpsilon: 1e-6,
} as const;

export type Tuning = typeof TUNING;
export const STEP_SECONDS = 1 / TUNING.stepHz;
