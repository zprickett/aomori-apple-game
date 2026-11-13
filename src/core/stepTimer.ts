/**
 * Pure step-lifecycle helpers: tolerance selection, grading, deadline checks and the
 * Perfect/Good/OK zones used to draw the countdown track. No clocks live here — the UI keeps a
 * monotonic active clock (paused while hidden) and passes ms in the step timebase.
 */
import type { StepDef } from './content.ts';
import { ASSIST_TOLERANCE, gradeTiming, type TimingGrade } from './timing.ts';

/** Visual count-in before each timed phase (ms). */
export const COUNT_IN_MS = 1000;
/** Alias kept for the documented API name. */
export const countInMs = COUNT_IN_MS;

export interface StepOptions {
  /** Dish-level assisted grading (+1/0): onboarding orders 1–3 or assistance mode. */
  assisted: boolean;
  /** Assistance mode is on → every window is 1.5× wider. Onboarding alone does NOT widen windows. */
  assistanceTolerance: boolean;
}

/** Tolerance multiplier for gradeTiming: ASSIST_TOLERANCE (1.5) in assistance mode, else 1. */
export function toleranceMultiplier(opts: Pick<StepOptions, 'assistanceTolerance'>): number {
  return opts.assistanceTolerance ? ASSIST_TOLERANCE : 1;
}

/**
 * Grade a submission for `step`. eventMs = recognizer result time (step timebase) or null when
 * the deadline expired without a valid gesture.
 */
export function gradeStep(step: StepDef, eventMs: number | null, toleranceMult = 1): TimingGrade {
  return gradeTiming(step.timing, eventMs, true, toleranceMult);
}

/** True once the active clock is past the step deadline (an event exactly at the deadline still counts). */
export function isExpired(step: StepDef, activeMs: number): boolean {
  return activeMs > step.timing.duration_ms;
}

/** Remaining ms until the deadline (clamped ≥ 0). */
export function remainingMs(step: StepDef, activeMs: number): number {
  return Math.max(0, step.timing.duration_ms - activeMs);
}

export interface ZoneRange {
  start: number;
  end: number;
}
export interface TrackZones {
  durationMs: number;
  targetMs: number;
  multiplier: number;
  perfect: ZoneRange;
  good: ZoneRange;
  ok: ZoneRange;
}

/**
 * Inclusive zone ranges in ms for drawing the track, clamped to [0, duration].
 * Zones are nested: perfect ⊂ good ⊂ ok, all centred on target_ms.
 */
export function trackZones(step: StepDef, multiplier = 1): TrackZones {
  const { duration_ms, target_ms, perfect_ms, good_ms, ok_ms } = step.timing;
  const zone = (w: number): ZoneRange => ({
    start: Math.max(0, target_ms - w * multiplier),
    end: Math.min(duration_ms, target_ms + w * multiplier),
  });
  return {
    durationMs: duration_ms,
    targetMs: target_ms,
    multiplier,
    perfect: zone(perfect_ms),
    good: zone(good_ms),
    ok: zone(ok_ms),
  };
}

/** Fraction 0..1 of the track elapsed (for the moving marker). */
export function trackFraction(step: StepDef, activeMs: number): number {
  return Math.max(0, Math.min(1, activeMs / step.timing.duration_ms));
}

/**
 * For circle steps the cue is the COMPLETION time; a suggested start (prompt "start mixing now")
 * is target − typical 2-turn duration. Default typical duration 2000 ms, clamped ≥ 0.
 */
export function suggestedCircleStartMs(step: StepDef, typicalMs = 2000): number {
  return Math.max(0, step.timing.target_ms - typicalMs);
}
