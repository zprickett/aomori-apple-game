/**
 * Points scoring (shown to players) layered on top of the star evaluation (kept for the pack's
 * scoring contract and unlock logic).
 *
 *   cooking  = Σ step points × recipe difficulty
 *   combo    = COMBO_POINTS × (extra Perfects in a row) × recipe difficulty
 *   total    = (cooking + combo) × apple multiplier (from the apple's fit for this recipe)
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
  /** Best possible total for this recipe (all Perfect, best-fit apple). */
  max: number;
  /** All actions Perfect. */
  golden: boolean;
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
  const total = Math.round((r.cooking + r.combo) * appleMultiplier);
  const max = maxDishPoints(recipeId);
  return { ...r, fit, appleMultiplier, difficulty, total, max, golden: grades.length > 0 && grades.every((g) => g === 'Perfect') };
}

// ---------------------------------------------------------------------------
// Chef level (lifetime points)
// ---------------------------------------------------------------------------

export const LEVEL_TITLES: readonly string[] = Object.freeze([
  'Apple Sprout', 'Apple Helper', 'Stall Helper', 'Junior Cook', 'Apple Cook',
  'Orchard Cook', 'Stall Chef', 'Orchard Chef', 'Aomori Chef', 'Apple Master', 'Apple Legend',
]);
/** Points needed to reach level i+1 (index 0 = level 1). After the table, +10,000 per level. */
const LEVEL_FLOORS = [0, 400, 1200, 2500, 4500, 7000, 10000, 14000, 19000, 25000, 32000];

export interface ChefLevel {
  level: number;
  title: string;
  floor: number;
  next: number;
  /** 0–1 progress to the next level. */
  frac: number;
}

function floorOf(level: number): number {
  const i = level - 1;
  return i < LEVEL_FLOORS.length ? LEVEL_FLOORS[i] : LEVEL_FLOORS[LEVEL_FLOORS.length - 1] + (i - LEVEL_FLOORS.length + 1) * 10000;
}

export function chefLevel(totalPoints: number): ChefLevel {
  const t = Math.max(0, totalPoints);
  let level = 1;
  while (floorOf(level + 1) <= t) level += 1;
  const floor = floorOf(level);
  const next = floorOf(level + 1);
  return { level, title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)], floor, next, frac: (t - floor) / (next - floor) };
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
  /** Beat (or set) the best points for this recipe. */
  newBest: boolean;
}

export const HISTORY_LIMIT = 300;
