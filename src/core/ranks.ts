/**
 * The chef's ladder (Golden Chef Journey, Stage 1): ONE progression, driven by lifetime points.
 * Every dish earns points, so every dish moves the chef up; better cooking only makes it faster.
 *
 * The ladder has ten steps. Every third step is a story rank (Apprentice, Cook, Head Cook,
 * Golden Chef: rank-up page, notebook page, backdrop, outfit piece); the two ★ steps between
 * ranks bring a stall piece or a recipe. Rank 1 (Helper) is the start.
 *
 * `ladder[i]` = completed-order count when step i was reached (non-decreasing). Recipes unlock
 * when their step is reached, so the order queue follows the player's own ladder.
 * Pure functions only.
 */
import { RECIPE_ORDER, type RecipeId } from './content.ts';

export type Rank = 1 | 2 | 3 | 4 | 5;
export const MAX_RANK: Rank = 5;

export interface RankInfo {
  rank: Rank;
  name: string;
  nameJa: string;
}

export const RANKS: readonly RankInfo[] = Object.freeze([
  { rank: 1, name: 'Helper', nameJa: '見習い' },
  { rank: 2, name: 'Apprentice', nameJa: '弟子' },
  { rank: 3, name: 'Cook', nameJa: '料理人' },
  { rank: 4, name: 'Head Cook', nameJa: '料理長' },
  { rank: 5, name: 'Golden Chef', nameJa: '金の料理人' },
]);

export function rankInfo(rank: number): RankInfo {
  return RANKS[Math.min(MAX_RANK, Math.max(1, Math.floor(rank))) - 1];
}

export interface LadderStep {
  index: number;
  /** Lifetime points needed. */
  points: number;
  rank: Rank;
  /** 0 = the rank itself; 1, 2 = the ★ steps inside that rank. */
  star: 0 | 1 | 2;
  /** Recipes this step brings (the next order introduces them). */
  recipes: readonly RecipeId[];
}

/**
 * Tuned by simulation (real order queue, two-customer choice and scoring, child timing models) so a
 * typical 10-year-old reaches the ranks around orders 5 / 18 / 32 / 51, a 7-year-old around
 * 5 / 22 / 40 / 64 and an adult around 3 / 13 / 23 / 38.
 */
export const LADDER: readonly LadderStep[] = Object.freeze(([
  [1200, 2, 0, ['apple_jam']],
  [4000, 2, 1, []],
  [7500, 2, 2, ['ringo_ame']],
  [11500, 3, 0, ['hirosaki_pie']],
  [17000, 3, 1, []],
  [23000, 3, 2, ['jam_toast']],
  [30000, 4, 0, ['yogurt_parfait']],
  [36000, 4, 1, ['baked_apple']],
  [43000, 4, 2, ['apple_compote']],
  [55000, 5, 0, []],
] as const).map(([points, rank, star, recipes], index) => ({ index, points, rank, star, recipes: [...recipes] })) as LadderStep[]);

/** Helper's recipes, by orders served (no points needed). */
export const START_RECIPES: ReadonlyArray<{ id: RecipeId; after: number }> = Object.freeze([
  { id: 'fresh_juice', after: 0 },
  { id: 'rabbit_apples', after: 2 },
]);

/**
 * Journey recipes come after Golden Chef, by orders served after reaching it (no points needed):
 * one every 3 orders, starting after Ojiichan's visit (the first order of the next day).
 * Placeholder pacing until Stage 2's story places them.
 */
export const JOURNEY_RECIPES: ReadonlyArray<{ id: RecipeId; after: number }> = Object.freeze(([
  'apple_kinton', 'apple_jelly', 'whole_apple_pie', 'apple_daifuku', 'apple_dorayaki', 'apple_keema',
  'apple_shumai', 'apple_cheesecake', 'apple_pork', 'red_flesh_tart', 'festival_pie',
] as const).map((id, i) => ({ id, after: 8 + i * 3 })));
const GOLDEN_STEP = 9;

/** Ladder step index of each rank 2..5. */
const RANK_STEP: Readonly<Record<number, number>> = Object.freeze({ 2: 0, 3: 3, 4: 6, 5: 9 });

/** A typical 10-year-old's ladder (dev skip, test defaults). */
export const TYPICAL_LADDER: readonly number[] = Object.freeze([5, 9, 14, 18, 21, 26, 32, 37, 42, 51]);
/** Points a typical player has after `completed` orders (dev skip): linear between ladder steps. */
export function typicalPoints(completed: number): number {
  const pts = [0, ...LADDER.map((s) => s.points)];
  const at = [0, ...TYPICAL_LADDER];
  for (let i = 1; i < at.length; i++) {
    if (completed <= at[i]) return Math.round(pts[i - 1] + ((completed - at[i - 1]) / (at[i] - at[i - 1])) * (pts[i] - pts[i - 1]));
  }
  return pts[pts.length - 1] + (completed - at[at.length - 1]) * 1100;
}
/** The typical ladder up to `completed` orders. */
export function typicalLadder(completed: number): number[] {
  return TYPICAL_LADDER.filter((at) => at <= completed);
}

export function rankOf(ladder: readonly number[]): Rank {
  return (1 + LADDER.slice(0, ladder.length).filter((s) => s.star === 0).length) as Rank;
}

/** Completed-order count when `rank` was reached (0 for rank 1), or null if not reached. */
export function rankReachedAt(rank: Rank, ladder: readonly number[]): number | null {
  if (rank === 1) return 0;
  return ladder[RANK_STEP[rank]] ?? null;
}

/** Completed-order counts of rank-ups 2..5 reached so far. */
export function rankUpsOf(ladder: readonly number[]): number[] {
  return [2, 3, 4, 5].map((r) => rankReachedAt(r as Rank, ladder)).filter((x): x is number => x !== null);
}

/** Ladder step that brings a recipe, or null for Helper's start recipes. */
export function recipeStep(recipeId: string): LadderStep | null {
  const s = LADDER.find((x) => (x.recipes as readonly string[]).includes(recipeId));
  if (s) return s;
  if (START_RECIPES.some((x) => x.id === recipeId) || JOURNEY_RECIPES.some((x) => x.id === recipeId)) return null;
  throw new Error(`Unknown recipe ${recipeId}`);
}

/** Completed-order count at which a recipe unlocks, or null while its step is not reached. */
export function recipeUnlockAtFor(recipeId: string, ladder: readonly number[]): number | null {
  const start = START_RECIPES.find((x) => x.id === recipeId);
  if (start) return start.after;
  const journey = JOURNEY_RECIPES.find((x) => x.id === recipeId);
  if (journey) {
    const golden = ladder[GOLDEN_STEP];
    return golden === undefined ? null : golden + journey.after;
  }
  const step = recipeStep(recipeId)!;
  return ladder[step.index] ?? null;
}

/** The rank that brings a recipe. */
export function recipeRank(recipeId: string): Rank {
  if (JOURNEY_RECIPES.some((x) => x.id === recipeId)) return 5;
  return recipeStep(recipeId)?.rank ?? 1;
}

/** Ladder after `points` lifetime points at `completed` orders: every newly passed step is recorded now. */
export function advanceLadder(ladder: readonly number[], points: number, completed: number): number[] {
  const out = [...ladder];
  while (out.length < LADDER.length && points >= LADDER[out.length].points) out.push(completed);
  return out;
}

/** Steps reached by points alone. */
export function stepsForPoints(points: number): number {
  return LADDER.filter((s) => points >= s.points).length;
}

/** Sanitise a stored ladder: integers ≤ completed, non-decreasing, at most LADDER.length. */
export function cleanLadder(v: unknown, completed: number): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    if (out.length >= LADDER.length) break;
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 1 || x > completed) break;
    if (out.length && x < out[out.length - 1]) break;
    out.push(x);
  }
  return out;
}

/** v3 rules (rank goals): when each recipe unlocked, relative to its rank-up. */
const V3_RECIPES: Record<string, [rankIndex: number, after: number]> = {
  apple_jam: [0, 0], ringo_ame: [0, 3], hirosaki_pie: [1, 0], jam_toast: [1, 6],
  yogurt_parfait: [2, 0], baked_apple: [2, 6], apple_compote: [2, 12],
};

/**
 * A v3 save (rank-goal `rankUps`) on the ladder. Nobody moves down: the ladder covers the old
 * rank and every recipe the player already had, plus whatever their points reach. Recipe steps
 * keep their old unlock counts so no old recipe is introduced again.
 */
export function ladderFromRankUps(rankUps: readonly number[], completed: number, points: number): number[] {
  const old = (Array.isArray(rankUps) ? rankUps : []).filter((x) => Number.isInteger(x) && x >= 1 && x <= completed);
  const oldRecipeAt = (id: string): number | null => {
    const [ri, after] = V3_RECIPES[id];
    const base = old[ri];
    return base === undefined || base + after > completed ? null : base + after;
  };
  let len = stepsForPoints(points);
  if (old.length) len = Math.max(len, RANK_STEP[old.length + 1] + 1);
  LADDER.forEach((s) => { if (s.recipes.some((r) => oldRecipeAt(r) !== null)) len = Math.max(len, s.index + 1); });
  const known = LADDER.slice(0, len).map((s) => (s.recipes.length ? oldRecipeAt(s.recipes[0]) : s.star === 0 ? old[s.rank - 2] ?? null : null));
  const lastKnown = known.reduce((m, k, i) => (k !== null ? i : m), -1);
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    // Between known steps: the step before; beyond them (points only): now, so new recipes get an intro.
    const prev = out[i - 1] ?? 1;
    const at = known[i] ?? (i > lastKnown ? completed : prev);
    out.push(Math.min(completed, Math.max(prev, at)));
  }
  return out;
}

export interface LadderProgress {
  rank: Rank;
  /** ★ steps reached inside the current rank (0–2). */
  stars: number;
  /** The next step, or null at Golden Chef. */
  next: LadderStep | null;
  /** Points at the current step and still needed for the next. */
  from: number;
  toGo: number;
  /** 0–1 along the way to the next step. */
  frac: number;
}

/** Where `points` sit on the ladder (`steps` = steps reached; defaults to what the points reach). */
export function ladderProgress(points: number, steps: number = stepsForPoints(points)): LadderProgress {
  const reached = LADDER.slice(0, steps);
  const rank = (1 + reached.filter((s) => s.star === 0).length) as Rank;
  const last = reached[reached.length - 1];
  const stars = last && last.rank === rank ? last.star : 0;
  const next = LADDER[steps] ?? null;
  const from = last?.points ?? 0;
  if (!next) return { rank, stars, next, from, toGo: 0, frac: 1 };
  return { rank, stars, next, from, toGo: Math.max(0, next.points - points), frac: Math.min(1, Math.max(0, (points - from) / (next.points - from))) };
}

/** Short label for a step, e.g. "Cook", "Cook ★★". */
export function stepLabel(step: LadderStep): string {
  return `${rankInfo(step.rank).name}${step.star ? ` ${'★'.repeat(step.star)}` : ''}`;
}

/** Every recipe in RECIPE_ORDER is reachable (checked by tests). */
export const LADDER_RECIPES: readonly RecipeId[] = Object.freeze(RECIPE_ORDER.filter((id) => recipeStep(id) !== null || START_RECIPES.some((x) => x.id === id) || JOURNEY_RECIPES.some((x) => x.id === id)));
/** Recipes after Golden Chef (not on the notebook's riddle pages). */
export const isJourneyRecipe = (id: string): boolean => JOURNEY_RECIPES.some((x) => x.id === id);
