/**
 * Gesture recognizers for the three primitives (tap / swipe / circle).
 *
 * Coordinates: normalized work-surface units on a SQUARE surface, x,y in 0..1, y pointing down.
 * Times: active-clock ms in the step timebase (ms since the step's timed phase started; may be
 * negative before the start). Recognizers use ONLY sample timestamps, so they are frame-rate
 * independent. Feed every pointerdown / pointermove (including coalesced events) / pointerup /
 * pointercancel.
 *
 * Every recognizer submits at most once (`result` is set once and never changes) until `reset()`.
 * Only one pointer is tracked; a second pointer's down is ignored while one is active and samples
 * from other pointerIds are ignored.
 */

export interface PointerSample {
  x: number;
  y: number;
  /** Active-clock ms in the step timebase. */
  t: number;
  pointerId: number;
}

export type RecognizerKind = 'tap' | 'swipe' | 'circle';

export interface RecognizerResult {
  /** Scored event time (step timebase): tap = down time; swipe = first valid cut-line crossing; circle = 4π reached. */
  eventMs: number;
  kind: RecognizerKind;
  detail?: TapDetail | SwipeDetail | CircleDetail;
}

export interface TapDetail {
  x: number;
  y: number;
}
export interface SwipeDetail {
  /** Interpolated crossing point on the checkpoint line. */
  crossX: number;
  crossY: number;
  /** Distance of the crossing from the highlighted crossing point. */
  offset: number;
  /** Angle (deg) between stroke direction and guide axis (0..90; either direction allowed). */
  angleDeg: number;
  /** +1 = stroke went from (x1,y1) towards (x2,y2); −1 = reverse. */
  direction: 1 | -1;
  /** Path length at submission. */
  length: number;
}
export interface CircleDetail {
  /** +1 = positive atan2 direction (clockwise on screen, y down); −1 = anticlockwise. */
  direction: 1 | -1;
  validSamples: number;
  trackedMs: number;
}

/** Soft rejection reasons for UI hints. */
export type RecognizerFeedback =
  | 'missed_target'
  | 'too_short'
  | 'off_guide'
  | 'wrong_angle'
  | 'too_slow'
  | 'outside_ring'
  | 'too_fast'
  | 'incomplete';

export interface Recognizer {
  down(s: PointerSample): void;
  move(s: PointerSample): void;
  up(s: PointerSample): void;
  /** Pointer cancel: discards the unfinished gesture (does not touch the step clock). */
  cancel(pointerId?: number): void;
  readonly result: RecognizerResult | null;
  /** 0..1 (circle net-turn progress; swipe and tap 0/1). */
  readonly progress: number;
  readonly feedback: RecognizerFeedback | null;
  /** Fresh recognizer state (for Retry). */
  reset(): void;
  readonly kind: RecognizerKind;
}

function finite(s: PointerSample): boolean {
  return Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.t);
}

/** Shared single-pointer bookkeeping. */
abstract class BaseRecognizer implements Recognizer {
  abstract readonly kind: RecognizerKind;
  protected activePointer: number | null = null;
  protected _result: RecognizerResult | null = null;
  protected _feedback: RecognizerFeedback | null = null;

  get result(): RecognizerResult | null {
    return this._result;
  }
  get feedback(): RecognizerFeedback | null {
    return this._feedback;
  }
  abstract get progress(): number;

  down(s: PointerSample): void {
    if (this._result || !finite(s)) return;
    if (this.activePointer !== null && this.activePointer !== s.pointerId) return; // extra finger
    this.activePointer = s.pointerId;
    this.onDown(s);
  }
  move(s: PointerSample): void {
    if (this._result || this.activePointer === null || s.pointerId !== this.activePointer || !finite(s)) return;
    this.onMove(s);
  }
  up(s: PointerSample): void {
    if (this.activePointer === null || s.pointerId !== this.activePointer) return;
    if (!this._result && finite(s)) this.onUp(s);
    this.activePointer = null;
  }
  cancel(pointerId?: number): void {
    if (this.activePointer === null) return;
    if (pointerId !== undefined && pointerId !== this.activePointer) return;
    this.activePointer = null;
    if (!this._result) this.onCancel();
  }
  reset(): void {
    this.activePointer = null;
    this._result = null;
    this._feedback = null;
    this.onReset();
  }
  protected abstract onDown(s: PointerSample): void;
  protected abstract onMove(s: PointerSample): void;
  protected abstract onUp(s: PointerSample): void;
  protected abstract onCancel(): void;
  protected abstract onReset(): void;
}

// ---------------------------------------------------------------------------
// Tap
// ---------------------------------------------------------------------------

export interface TapConfig {
  x: number;
  y: number;
  /** Radius in work units (UI guarantees the target is ≥ 48 CSS px across). */
  radius: number;
}

/** Pointer-down inside the circular target submits immediately with eventMs = down time. */
export class TapRecognizer extends BaseRecognizer {
  readonly kind = 'tap' as const;
  readonly config: TapConfig;
  constructor(config: TapConfig) {
    super();
    this.config = { ...config };
  }
  get progress(): number {
    return this._result ? 1 : 0;
  }
  protected onDown(s: PointerSample): void {
    const { x, y, radius } = this.config;
    if (Math.hypot(s.x - x, s.y - y) <= radius) {
      this._result = { eventMs: s.t, kind: 'tap', detail: { x: s.x, y: s.y } };
      this._feedback = null;
    } else {
      this._feedback = 'missed_target';
    }
  }
  protected onMove(): void {}
  protected onUp(): void {}
  protected onCancel(): void {}
  protected onReset(): void {}
}

// ---------------------------------------------------------------------------
// Swipe
// ---------------------------------------------------------------------------

export interface SwipeConfig {
  /** Guide segment (dashed line over the food). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Highlighted crossing point; the checkpoint ("cut") line passes through it perpendicular to the guide. */
  crossX: number;
  crossY: number;
  /** Optional overrides (defaults are the contract values). */
  minLength?: number;
  maxDurationMs?: number;
  crossTolerance?: number;
  maxAngleDeg?: number;
}

export const SWIPE_DEFAULTS = Object.freeze({
  minLength: 0.12,
  maxDurationMs: 1000,
  crossTolerance: 0.08,
  maxAngleDeg: 35,
});

/**
 * Guided cut. A valid swipe is one continuous stroke (one pointer) with:
 *  - path length ≥ 0.12 units,
 *  - submission < 1000 ms after pointer-down,
 *  - its FIRST crossing of the checkpoint line within 0.08 units of the crossing point,
 *  - direction within 35° of the guide axis in either direction.
 * Direction choice: the OVERALL stroke vector from the down point to the current submission
 * point (the interpolated crossing point, or the later sample at which the length requirement
 * is met). If that vector is degenerate (< 1e-6) the local segment direction is used.
 * eventMs = linearly interpolated time of the first crossing (not pointer-up). If the crossing
 * happens before 0.12 length is travelled, the swipe submits on the first later sample of the
 * same stroke that satisfies the length (still < 1000 ms), with eventMs = crossing time.
 * An invalid stroke never submits; it sets `feedback` and is dead until the pointer lifts.
 */
export class SwipeRecognizer extends BaseRecognizer {
  readonly kind = 'swipe' as const;
  readonly config: Required<SwipeConfig>;
  private readonly ux: number;
  private readonly uy: number;

  private start: PointerSample | null = null;
  private last: PointerSample | null = null;
  private length = 0;
  private dead = false;
  private crossing: { x: number; y: number; t: number; offset: number } | null = null;

  constructor(config: SwipeConfig) {
    super();
    this.config = { ...SWIPE_DEFAULTS, ...config };
    const dx = config.x2 - config.x1;
    const dy = config.y2 - config.y1;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) throw new Error('Swipe guide must have non-zero length');
    this.ux = dx / len;
    this.uy = dy / len;
  }

  get progress(): number {
    return this._result ? 1 : 0;
  }

  /** Signed distance of a point from the checkpoint line (along the guide axis). */
  private along(x: number, y: number): number {
    return (x - this.config.crossX) * this.ux + (y - this.config.crossY) * this.uy;
  }

  protected onDown(s: PointerSample): void {
    this.beginStroke(s);
  }

  private beginStroke(s: PointerSample): void {
    this.start = s;
    this.last = s;
    this.length = 0;
    this.dead = false;
    this.crossing = null;
  }

  protected onMove(s: PointerSample): void {
    this.step(s);
  }

  protected onUp(s: PointerSample): void {
    this.step(s);
    if (!this._result && !this.dead) {
      if (this.length < this.config.minLength) this._feedback = 'too_short';
      else if (!this.crossing) this._feedback = 'off_guide';
    }
    this.start = this.last = this.crossing = null;
  }

  protected onCancel(): void {
    this.start = this.last = this.crossing = null;
    this.dead = false;
  }
  protected onReset(): void {
    this.onCancel();
    this.length = 0;
  }

  private kill(reason: RecognizerFeedback): void {
    this.dead = true;
    this._feedback = reason;
  }

  private step(s: PointerSample): void {
    if (this.dead || !this.start || !this.last || this._result) return;
    const prev = this.last;
    if (s.t < prev.t) return; // out-of-order sample
    const segLen = Math.hypot(s.x - prev.x, s.y - prev.y);
    this.length += segLen;
    this.last = s;
    const { maxDurationMs, minLength, crossTolerance } = this.config;

    if (!this.crossing) {
      const d0 = this.along(prev.x, prev.y);
      const d1 = this.along(s.x, s.y);
      const crossed = (d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0) || (d0 === 0 && d1 !== 0 && prev === this.start);
      if (crossed) {
        const f = d0 === d1 ? 0 : d0 / (d0 - d1);
        const cx = prev.x + (s.x - prev.x) * f;
        const cy = prev.y + (s.y - prev.y) * f;
        const ct = prev.t + (s.t - prev.t) * f;
        const offset = Math.hypot(cx - this.config.crossX, cy - this.config.crossY);
        if (ct - this.start.t >= maxDurationMs) return this.kill('too_slow');
        if (offset > crossTolerance) return this.kill('off_guide');
        this.crossing = { x: cx, y: cy, t: ct, offset };
        // Length travelled up to the crossing point.
        const lenAtCross = this.length - segLen * (1 - f);
        if (lenAtCross >= minLength) {
          this.trySubmit(cx, cy, s);
          return;
        }
      }
    }
    if (this.crossing) {
      if (s.t - this.start.t >= maxDurationMs) return this.kill('too_slow');
      if (this.length >= minLength) this.trySubmit(s.x, s.y, s);
    } else if (s.t - this.start.t >= maxDurationMs) {
      this.kill('too_slow');
    }
  }

  private trySubmit(px: number, py: number, s: PointerSample): void {
    const start = this.start!;
    const crossing = this.crossing!;
    let vx = px - start.x;
    let vy = py - start.y;
    if (Math.hypot(vx, vy) < 1e-6) {
      const prev = this.last!;
      vx = s.x - prev.x;
      vy = s.y - prev.y;
    }
    const vlen = Math.hypot(vx, vy);
    if (vlen < 1e-9) return;
    const cos = (vx * this.ux + vy * this.uy) / vlen;
    const angleDeg = (Math.acos(Math.min(1, Math.abs(cos))) * 180) / Math.PI;
    if (angleDeg > this.config.maxAngleDeg) return this.kill('wrong_angle');
    this._feedback = null;
    this._result = {
      eventMs: crossing.t,
      kind: 'swipe',
      detail: {
        crossX: crossing.x,
        crossY: crossing.y,
        offset: crossing.offset,
        angleDeg,
        direction: cos >= 0 ? 1 : -1,
        length: this.length,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Circle
// ---------------------------------------------------------------------------

export interface CircleConfig {
  cx: number;
  cy: number;
  /** Displayed ring radius (default 0.20). */
  radius?: number;
  /** Accepted annulus (defaults 0.12–0.28). */
  inner?: number;
  outer?: number;
  /** Optional overrides of the contract values. */
  requiredRad?: number;
  minSamples?: number;
  minTrackedMs?: number;
  maxAngularSpeed?: number;
  teleportDist?: number;
  directionLockRad?: number;
  /**
   * Forgiving mode for the game: count how much the finger's path turns, anywhere on screen
   * (any size, any centre), instead of the angle around (cx, cy) inside the ring band. Lifting the
   * finger keeps the progress; the next stroke carries on.
   */
  freeform?: boolean;
  /** Freeform: ignore moves shorter than this (units) when reading the path's heading. */
  minStep?: number;
}

/** Forgiving stir used in the game (see CircleConfig.freeform). */
export const FREEFORM_CIRCLE = Object.freeze({
  freeform: true,
  minSamples: 8,
  minTrackedMs: 900,
  maxAngularSpeed: 8 * Math.PI,
  minStep: 0.012,
});

export const CIRCLE_DEFAULTS = Object.freeze({
  radius: 0.2,
  inner: 0.12,
  outer: 0.28,
  requiredRad: 4 * Math.PI,
  minSamples: 12,
  minTrackedMs: 1200,
  maxAngularSpeed: 4 * Math.PI, // rad/s
  teleportDist: 0.2,
  directionLockRad: 0.35,
  freeform: false,
  minStep: 0.012,
});

/**
 * Mixing gesture: two net full turns (4π) in one direction around (cx, cy).
 *  - Samples outside the annulus [inner, outer] are ignored and break arc continuity
 *    (the next valid sample re-anchors without adding arc). feedback = 'outside_ring'.
 *  - Angle deltas are unwrapped into (−π, π].
 *  - Accepted angular speed is clamped: |Δθ| ≤ 4π·Δt/1000.
 *  - Teleports (> 0.2 units between consecutive valid samples) re-anchor and add nothing.
 *  - Direction is locked by the first |net| ≥ 0.35 rad; afterwards arc against it subtracts.
 *  - Requires ≥ 12 valid samples and ≥ 1200 ms tracked motion (= time spanned by valid samples
 *    of this attempt: last valid t − first valid t).
 *  - eventMs = interpolated time at which net arc first reaches 4π. If the sample/time
 *    requirements are not met at that moment, the recognizer submits at the first later valid
 *    sample where they are met (and net is still ≥ 4π), with eventMs = that sample's time.
 *  - Pointer-up before completion discards the attempt (a new down starts fresh);
 *    cancel() also discards the unfinished arc.
 */
export class CircleRecognizer extends BaseRecognizer {
  readonly kind = 'circle' as const;
  readonly config: Required<CircleConfig>;

  private anchor: { angle: number; x: number; y: number; t: number } | null = null;
  private net = 0;
  private dir: 0 | 1 | -1 = 0;
  private validSamples = 0;
  private firstValidT: number | null = null;
  private lastValidT: number | null = null;
  private reachedEarly = false;
  /** Freeform: last point and heading of the current stroke. */
  private last: { x: number; y: number; t: number; heading: number | null } | null = null;

  constructor(config: CircleConfig) {
    super();
    this.config = { ...CIRCLE_DEFAULTS, ...config };
  }

  get progress(): number {
    if (this._result) return 1;
    const signed = this.dir === 0 ? Math.abs(this.net) : this.net * this.dir;
    return Math.max(0, Math.min(1, signed / this.config.requiredRad));
  }

  /** Signed net arc (rad) of the current attempt, for debugging/visuals. */
  get netRadians(): number {
    return this.net;
  }
  get direction(): 0 | 1 | -1 {
    return this.dir;
  }

  private clearAttempt(): void {
    this.anchor = null;
    this.net = 0;
    this.dir = 0;
    this.validSamples = 0;
    this.firstValidT = null;
    this.lastValidT = null;
    this.reachedEarly = false;
    this.last = null;
  }

  protected onDown(s: PointerSample): void {
    if (this.config.freeform) this.last = null;
    else this.clearAttempt();
    this.sample(s);
  }
  protected onMove(s: PointerSample): void {
    this.sample(s);
  }
  protected onUp(s: PointerSample): void {
    this.sample(s);
    if (this.config.freeform) {
      // Lifting the finger keeps the turns so far; the next stroke starts a fresh heading.
      this.last = null;
      if (!this._result) this._feedback = this.reachedEarly ? 'too_fast' : 'incomplete';
      return;
    }
    if (!this._result) {
      this._feedback = this.reachedEarly ? 'too_fast' : 'incomplete';
      this.clearAttempt();
    }
  }
  protected onCancel(): void {
    this.clearAttempt();
  }
  protected onReset(): void {
    this.clearAttempt();
  }

  /** Requirements at time atT; the current sample only counts if atT is at/after it. */
  private requirementsMet(atT: number, currentT: number = atT): boolean {
    const samples = this.validSamples - (atT < currentT ? 1 : 0);
    return (
      samples >= this.config.minSamples &&
      this.firstValidT !== null &&
      atT - this.firstValidT >= this.config.minTrackedMs
    );
  }

  /** Freeform: add how much the path turned since the last step (any position, any size). */
  private sampleFreeform(s: PointerSample): void {
    const { minStep, maxAngularSpeed } = this.config;
    const l = this.last;
    if (!l) {
      this.last = { x: s.x, y: s.y, t: s.t, heading: null };
      this.countSample(s.t);
      return;
    }
    if (s.t < l.t) return;
    const dx = s.x - l.x, dy = s.y - l.y;
    if (Math.hypot(dx, dy) < minStep) return; // too small to read a direction
    this.countSample(s.t);
    const heading = Math.atan2(dy, dx);
    let d = 0;
    if (l.heading !== null) {
      d = heading - l.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d <= -Math.PI) d += 2 * Math.PI;
      // A sudden U-turn is a scribble, not stirring: ignore it.
      if (Math.abs(d) > (2 * Math.PI) / 3) d = 0;
      const maxD = (maxAngularSpeed * Math.max(1, s.t - l.t)) / 1000;
      d = Math.max(-maxD, Math.min(maxD, d));
    }
    this.last = { x: s.x, y: s.y, t: s.t, heading };
    this.addTurn(d, l.t, s.t);
  }

  private countSample(t: number): void {
    this.validSamples += 1;
    if (this.firstValidT === null) this.firstValidT = t;
    this.lastValidT = t;
  }

  /** Add signed turn d (rad) over [t0, t1] and submit when two turns are done. */
  private addTurn(d: number, t0: number, t1: number): void {
    const { requiredRad, directionLockRad } = this.config;
    const before = this.net;
    this.net += d;
    if (this.dir === 0 && Math.abs(this.net) >= directionLockRad) this.dir = this.net > 0 ? 1 : -1;
    if (this.dir === 0) return;
    const signedBefore = before * this.dir;
    const signedNow = this.net * this.dir;
    if (signedNow < requiredRad) { this.reachedEarly = false; return; }
    if (signedBefore < requiredRad) {
      const f = (requiredRad - signedBefore) / (signedNow - signedBefore);
      const tReach = t0 + (t1 - t0) * f;
      if (this.requirementsMet(tReach, t1) || this.requirementsMet(t1)) return this.submit(this.requirementsMet(tReach, t1) ? tReach : t1);
      this.reachedEarly = true;
      this._feedback = 'too_fast';
      return;
    }
    if (this.requirementsMet(t1)) this.submit(t1);
  }

  private sample(s: PointerSample): void {
    if (this._result) return;
    if (this.config.freeform) return this.sampleFreeform(s);
    const { cx, cy, inner, outer, teleportDist, maxAngularSpeed, requiredRad, directionLockRad } = this.config;
    const r = Math.hypot(s.x - cx, s.y - cy);
    if (r < inner || r > outer) {
      this.anchor = null;
      this._feedback = 'outside_ring';
      return;
    }
    const angle = Math.atan2(s.y - cy, s.x - cx);
    const a = this.anchor;
    if (a && s.t < a.t) return; // out-of-order sample
    this.validSamples += 1;
    if (this.firstValidT === null) this.firstValidT = s.t;
    this.lastValidT = s.t;
    if (this._feedback === 'outside_ring') this._feedback = null;

    if (!a || Math.hypot(s.x - a.x, s.y - a.y) > teleportDist) {
      // (Re-)anchor: first valid sample, after leaving the ring, or after a teleport.
      this.anchor = { angle, x: s.x, y: s.y, t: s.t };
      return;
    }
    let d = angle - a.angle;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    const dt = s.t - a.t;
    const maxD = (maxAngularSpeed * Math.max(0, dt)) / 1000;
    if (d > maxD) d = maxD;
    else if (d < -maxD) d = -maxD;

    const before = this.net;
    this.net += d;
    this.anchor = { angle, x: s.x, y: s.y, t: s.t };
    if (this.dir === 0 && Math.abs(this.net) >= directionLockRad) this.dir = this.net > 0 ? 1 : -1;
    if (this.dir === 0) return;

    const signedBefore = before * this.dir;
    const signedNow = this.net * this.dir;
    if (signedNow < requiredRad) {
      this.reachedEarly = false; // backtracked below 4π
      return;
    }
    if (signedBefore < requiredRad) {
      // First reached 4π on this segment: interpolate.
      const f = (requiredRad - signedBefore) / (signedNow - signedBefore);
      const tReach = a.t + dt * f;
      if (this.requirementsMet(tReach, s.t) || this.requirementsMet(s.t)) {
        const eventMs = this.requirementsMet(tReach, s.t) ? tReach : s.t;
        return this.submit(eventMs);
      }
      this.reachedEarly = true;
      this._feedback = 'too_fast';
      return;
    }
    // Already at/over 4π but requirements were pending.
    if (this.requirementsMet(s.t)) this.submit(s.t);
  }

  private submit(eventMs: number): void {
    this._feedback = null;
    this._result = {
      eventMs,
      kind: 'circle',
      detail: {
        direction: this.dir === -1 ? -1 : 1,
        validSamples: this.validSamples,
        trackedMs: (this.lastValidT ?? 0) - (this.firstValidT ?? 0),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type RecognizerConfig =
  | ({ gesture: 'tap' } & TapConfig)
  | ({ gesture: 'swipe' } & SwipeConfig)
  | ({ gesture: 'circle' } & CircleConfig);

/** Convenience factory keyed by StepDef.gesture. */
export function createRecognizer(config: RecognizerConfig): Recognizer {
  switch (config.gesture) {
    case 'tap':
      return new TapRecognizer(config);
    case 'swipe':
      return new SwipeRecognizer(config);
    case 'circle':
      return new CircleRecognizer(config);
  }
}

/**
 * Map a DOM pointer event to a sample. `rect` is the square work surface's client rect;
 * `activeStartPerf` is the performance.now()/event.timeStamp value when the step's timed phase
 * started (adjusted for any pauses), so t = event.timeStamp − activeStartPerf.
 */
export function sampleFromPointer(
  e: { clientX: number; clientY: number; timeStamp: number; pointerId: number },
  rect: { left: number; top: number; width: number; height: number },
  activeStartPerf: number,
): PointerSample {
  const size = Math.min(rect.width, rect.height) || 1;
  return {
    x: (e.clientX - rect.left) / size,
    y: (e.clientY - rect.top) / size,
    t: e.timeStamp - activeStartPerf,
    pointerId: e.pointerId,
  };
}

/** Convert a CSS-pixel length to work units for a surface of `surfacePx` CSS px. */
export function pxToUnits(px: number, surfacePx: number): number {
  return surfacePx > 0 ? px / surfacePx : 0;
}
