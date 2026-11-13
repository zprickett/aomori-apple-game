/**
 * Typed port of `src/data/timing_reference.mjs` (gradeTiming / summarizeTechnique).
 * Semantics are identical to the reference; `__tests__/timing.test.ts` runs a parity
 * check against the .mjs on thousands of inputs.
 */

export type Grade = 'Perfect' | 'Good' | 'OK' | 'Miss';

export const GRADES: readonly Grade[] = ['Perfect', 'Good', 'OK', 'Miss'];

/** Action points per grade (contract: 1 / 0.75 / 0.35 / 0). */
export const GRADE_POINTS: Readonly<Record<Grade, number>> = Object.freeze({
  Perfect: 1,
  Good: 0.75,
  OK: 0.35,
  Miss: 0,
});

/** Assistance mode broadens every timing window by this factor. */
export const ASSIST_TOLERANCE = 1.5;

/** Timing block of one step, in active-clock milliseconds (as stored in recipe_actions_20.json). */
export interface StepTiming {
  duration_ms: number;
  target_ms: number;
  perfect_ms: number;
  good_ms: number;
  ok_ms: number;
}

export interface TimingGrade {
  grade: Grade;
  points: number;
  /** eventMs − target_ms (signed; negative = early). null when there was no valid event. */
  error_ms: number | null;
}

export interface TechniqueSummary {
  mean: number;
  techniqueBonus: 0 | 1;
  executionPenalty: 0 | 1;
  assisted: boolean;
}

/**
 * Grade one timed action.
 * @param eventMs ms since the step's timed phase started; null = no valid action before the deadline.
 * @param geometryValid false grades Miss (kept for parity; recognizers never submit invalid geometry).
 * @param toleranceMultiplier ≥ 1; ASSIST_TOLERANCE in assistance mode.
 * @throws Error on invalid timing configuration or tolerance (same messages as the reference).
 */
export function gradeTiming(
  timing: StepTiming,
  eventMs: number | null,
  geometryValid = true,
  toleranceMultiplier = 1,
): TimingGrade {
  const { duration_ms: deadline, target_ms: target, perfect_ms: p, good_ms: g, ok_ms: o } = timing;
  if (
    ![deadline, target, p, g, o].every(Number.isFinite) ||
    !(0 < p && p <= g && g <= o && target >= o && target + o <= deadline)
  )
    throw Error('Invalid timing configuration');
  if (!Number.isFinite(toleranceMultiplier) || toleranceMultiplier < 1) throw Error('Invalid tolerance');
  if (eventMs === null || !Number.isFinite(eventMs) || eventMs < 0 || eventMs > deadline || !geometryValid)
    return { grade: 'Miss', points: 0, error_ms: null };
  const error = eventMs - target;
  const abs = Math.abs(error);
  const grade: Grade =
    abs <= p * toleranceMultiplier
      ? 'Perfect'
      : abs <= g * toleranceMultiplier
        ? 'Good'
        : abs <= o * toleranceMultiplier
          ? 'OK'
          : 'Miss';
  return { grade, points: GRADE_POINTS[grade], error_ms: error };
}

/**
 * Normalised technique for a recipe's 1–5 accepted steps (mean of points; mutually exclusive outcomes):
 * mean ≥ 0.75 and no Miss → +1/0; mean ≥ 0.40 → 0/0; else 0/1. Assisted → always +1/0.
 */
export function summarizeTechnique(
  results: ReadonlyArray<{ grade: Grade | string }>,
  { assisted = false }: { assisted?: boolean } = {},
): TechniqueSummary {
  if (!Array.isArray(results) || results.length < 1 || results.length > 5)
    throw Error('Expected 1–5 accepted steps');
  const values: Record<string, number> = GRADE_POINTS;
  if (results.some((r) => !Object.hasOwn(values, r.grade))) throw Error('Invalid grade');
  const mean = results.reduce((sum, r) => sum + values[r.grade], 0) / results.length;
  if (assisted) return { mean, techniqueBonus: 1, executionPenalty: 0, assisted: true };
  return {
    mean,
    techniqueBonus: mean >= 0.75 && results.every((r) => r.grade !== 'Miss') ? 1 : 0,
    executionPenalty: mean < 0.4 ? 1 : 0,
    assisted: false,
  };
}
