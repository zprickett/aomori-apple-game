/**
 * Points scoring (shown to players) layered on top of the star evaluation (kept for the pack's
 * scoring contract and unlock logic).
 *
 *   cooking  = Σ step points × recipe difficulty
 *   combo    = COMBO_POINTS × (extra Perfects in a row) × recipe difficulty
 *   total    = (cooking + combo) × apple multiplier (from the apple's fit for this recipe)
 *              × GOLDEN_BONUS for a Golden Recipe (every action Perfect)
 *
 * Harder recipes have more actions *and* a bigger multiplier, so a great pie is worth far more
 * than a great juice. The apple multiplier keeps the apple choice front and centre.
 */
import { fitStars, recipe, type FitStars } from './content.ts';
import type { Grade } from './timing.ts';

export const STEP_POINTS: Readonly<Record<Grade, number>> = Object.freeze({ Perfect: 100, Good: 70, OK: 40, Miss: 0 });
export const COMBO_POINTS = 25;
/** Index = fit stars (0–3). */
export const APPLE_MULTIPLIER: readonly number[] = Object.freeze([0.5, 1, 1.5, 2]);
/** A Golden Recipe (every action Perfect) earns this much more. */
export const GOLDEN_BONUS = 1.25;

/** Every action Perfect: the dish earns the Golden Recipe label. */
export const GOLDEN_LABEL = 'Golden Recipe';

export interface DishScore {
  cooking: number;
  combo: number;
  /** Longest run of Perfects. */
  bestStreak: number;
  fit: FitStars;
  appleMultiplier: number;
  difficulty: number;
  total: number;
  /** Best possible total for this recipe (all Perfect, best-fit apple, before the golden bonus). */
  max: number;
  /** All actions Perfect. */
  golden: boolean;
  /** Points added by the Golden Recipe bonus (0 if not golden). */
  goldenBonus: number;
  /** Stars shown to the player (0–3), from total / max (see dishStars). */
  stars: 0 | 1 | 2 | 3;
}

/** Share of the best possible total needed for 3 / 2 stars (any points earn 1). */
export const STAR_THRESHOLDS = Object.freeze({ three: 0.7, two: 0.4 });

/**
 * Player-facing stars for a dish from its share of the best possible points, so both timing and
 * apple choice count. A Golden Recipe (every action Perfect) is never below 2 stars.
 */
export function dishStars(total: number, max: number, golden: boolean): 0 | 1 | 2 | 3 {
  const f = max > 0 ? total / max : 0;
  const s = f >= STAR_THRESHOLDS.three ? 3 : f >= STAR_THRESHOLDS.two ? 2 : f > 0 ? 1 : 0;
  return golden ? (Math.max(2, s) as 2 | 3) : s;
}

/** 1 action → ×1, each extra action +0.5 (juice 1, rabbit 1.5, jam 2, candy 2.5, pie 3). */
export function recipeDifficulty(recipeId: string): number {
  return 1 + 0.5 * (recipe(recipeId).steps.length - 1);
}

function raw(grades: readonly Grade[], difficulty: number) {
  let streak = 0;
  let bestStreak = 0;
  let extra = 0;
  let sum = 0;
  for (const g of grades) {
    sum += STEP_POINTS[g];
    if (g === 'Perfect') { streak += 1; if (streak > 1) extra += 1; } else streak = 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return { cooking: Math.round(sum * difficulty), combo: Math.round(COMBO_POINTS * extra * difficulty), bestStreak };
}

export function maxDishPoints(recipeId: string): number {
  const d = recipeDifficulty(recipeId);
  const all = recipe(recipeId).steps.map(() => 'Perfect' as Grade);
  const r = raw(all, d);
  return Math.round((r.cooking + r.combo) * APPLE_MULTIPLIER[3]);
}

/** Score a finished dish from its accepted grades (recipe step order). */
export function scoreDish(appleId: string, recipeId: string, grades: readonly Grade[]): DishScore {
  const difficulty = recipeDifficulty(recipeId);
  const fit = fitStars(appleId, recipeId);
  const appleMultiplier = APPLE_MULTIPLIER[fit];
  const r = raw(grades, difficulty);
  const base = Math.round((r.cooking + r.combo) * appleMultiplier);
  const max = maxDishPoints(recipeId);
  const golden = grades.length > 0 && grades.every((g) => g === 'Perfect');
  const total = golden ? Math.round(base * GOLDEN_BONUS) : base;
  return { ...r, fit, appleMultiplier, difficulty, total, max, golden, goldenBonus: total - base, stars: dishStars(base, max, golden) };
}

// ---------------------------------------------------------------------------
// Order history
// ---------------------------------------------------------------------------

export interface OrderRecord {
  orderId: string;
  orderNumber: number;
  recipeId: string;
  appleId: string;
  points: number;
  golden: boolean;
  grades: Grade[];
  fit: number;
  /** Finished stars 0–3 (absent on records saved before stars were shown). */
  stars?: number;
  /** Beat (or set) the best points for this recipe. */
  newBest: boolean;
  /** Beat the best score of any dish ever (the chef's high score). */
  newHigh?: boolean;
}

export const HISTORY_LIMIT = 300;
