/**
 * Story ranks (Golden Chef Journey, Stage 1). Five ranks; each rank-up needs both experience
 * (orders served) and skill (stars, Golden Recipes, apples cooked). Pure functions only.
 *
 * `rankUps[i]` = completed-order count at which rank i + 2 was reached (strictly increasing).
 * Recipes unlock relative to the rank-up that brings them, so the recipe schedule depends on
 * the player's own rank history (see RANK_RECIPES).
 *
 * Ranks sit alongside the point-based chef levels (points.ts); they are a separate, deliberate
 * story layer.
 */
import { RECIPE_ORDER, type RecipeId } from './content.ts';

export type Rank = 1 | 2 | 3 | 4 | 5;
export const MAX_RANK: Rank = 5;

export interface RankInfo {
  rank: Rank;
  name: string;
  nameJa: string;
  /** Orders that must be served before this rank can be reached. */
  minOrders: number;
}

export const RANKS: readonly RankInfo[] = Object.freeze([
  { rank: 1, name: 'Helper', nameJa: '見習い', minOrders: 0 },
  { rank: 2, name: 'Apprentice', nameJa: '弟子', minOrders: 5 },
  { rank: 3, name: 'Cook', nameJa: '料理人', minOrders: 15 },
  { rank: 4, name: 'Head Cook', nameJa: '料理長', minOrders: 30 },
  { rank: 5, name: 'Golden Chef', nameJa: '金の料理人', minOrders: 50 },
]);

export function rankInfo(rank: number): RankInfo {
  const r = RANKS[Math.min(MAX_RANK, Math.max(1, Math.floor(rank))) - 1];
  return r;
}

/** Recipes each rank brings: `after` = orders served after reaching the rank. */
export const RANK_RECIPES: Readonly<Record<Rank, ReadonlyArray<{ id: RecipeId; after: number }>>> = Object.freeze({
  1: [{ id: 'fresh_juice', after: 0 }, { id: 'rabbit_apples', after: 2 }],
  2: [{ id: 'apple_jam', after: 0 }, { id: 'ringo_ame', after: 3 }],
  3: [{ id: 'hirosaki_pie', after: 0 }, { id: 'jam_toast', after: 6 }],
  4: [{ id: 'yogurt_parfait', after: 0 }, { id: 'baked_apple', after: 6 }, { id: 'apple_compote', after: 12 }],
  5: [],
});

/** Rank history when every challenge is passed as early as possible: [5, 15, 30, 50]. */
export const EARLIEST_RANK_UPS: readonly number[] = Object.freeze(RANKS.slice(1).map((r) => r.minOrders));

/** Earliest-possible rank-ups up to `completed` (legacy saves, dev skip, default schedule). */
export function earliestRankUps(completed: number): number[] {
  return EARLIEST_RANK_UPS.filter((at) => at <= completed);
}

export function rankOf(rankUps: readonly number[]): Rank {
  return Math.min(MAX_RANK, 1 + rankUps.length) as Rank;
}

/** Completed-order count when `rank` was reached (0 for rank 1), or null if not reached. */
export function rankReachedAt(rank: Rank, rankUps: readonly number[]): number | null {
  if (rank === 1) return 0;
  return rankUps[rank - 2] ?? null;
}

/** Completed-order count at which a recipe unlocks, or null while its rank is not reached. */
export function recipeUnlockAtFor(recipeId: string, rankUps: readonly number[]): number | null {
  for (const r of RANKS) {
    const hit = RANK_RECIPES[r.rank].find((x) => x.id === recipeId);
    if (!hit) continue;
    const base = rankReachedAt(r.rank, rankUps);
    return base === null ? null : base + hit.after;
  }
  throw new Error(`Unknown recipe ${recipeId}`);
}

/** The rank that brings a recipe. */
export function recipeRank(recipeId: string): Rank {
  const r = RANKS.find((x) => RANK_RECIPES[x.rank].some((y) => y.id === recipeId));
  if (!r) throw new Error(`Unknown recipe ${recipeId}`);
  return r.rank;
}

/** Sanitise a stored rank history against the completed count. */
export function cleanRankUps(v: unknown, completed: number): number[] {
  if (!Array.isArray(v)) return earliestRankUps(completed);
  const out: number[] = [];
  for (const x of v) {
    const i = out.length;
    if (i >= EARLIEST_RANK_UPS.length) break;
    if (typeof x !== 'number' || !Number.isInteger(x) || x < EARLIEST_RANK_UPS[i] || x > completed) break;
    if (i > 0 && x <= out[i - 1]) break;
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/** What the challenge check needs from progress (structural, so ranks.ts has no reducer import). */
export interface RankProgressInput {
  completedOrders: number;
  rankUps: readonly number[];
  /** Best dish stars (0–3, points-based) per recipe id. */
  bestScores: Readonly<Record<string, number>>;
  /** Keys 'appleId:recipeId' of every pairing cooked. */
  discoveredPairings: Readonly<Record<string, unknown>>;
  history: ReadonlyArray<{ orderNumber: number; golden: boolean }>;
}

export interface RankGoal {
  id: string;
  label: string;
  have: number;
  need: number;
  done: boolean;
}

export const GOLDEN_RECIPES_FOR_HEAD_COOK = 5;
export const APPLES_FOR_GOLDEN_CHEF = 20;

const goal = (id: string, label: string, have: number, need: number): RankGoal => ({
  id, label, have: Math.min(have, need), need, done: have >= need,
});

const recipeName: Record<string, string> = { fresh_juice: 'Fresh Apple Juice', rabbit_apples: 'Rabbit Apple Wedges' };

/** Goals for the next rank-up (empty at Golden Chef). */
export function nextRankGoals(p: RankProgressInput): RankGoal[] {
  const rank = rankOf(p.rankUps);
  if (rank >= MAX_RANK) return [];
  const next = rankInfo(rank + 1);
  const goals: RankGoal[] = [goal('orders', `Serve ${next.minOrders} orders`, p.completedOrders, next.minOrders)];
  const stars = (id: string) => goal(`stars:${id}`, `3 stars on ${recipeName[id] ?? id}`, (p.bestScores[id] ?? 0) >= 3 ? 1 : 0, 1);
  if (next.rank === 3) goals.push(stars('fresh_juice'), stars('rabbit_apples'));
  if (next.rank === 4) {
    const since = rankReachedAt(3, p.rankUps) ?? Infinity;
    const golden = p.history.filter((h) => h.golden && h.orderNumber > since).length;
    goals.push(goal('golden', `${GOLDEN_RECIPES_FOR_HEAD_COOK} Golden Recipes`, golden, GOLDEN_RECIPES_FOR_HEAD_COOK));
  }
  if (next.rank === 5) {
    const threeStar = RECIPE_ORDER.filter((id) => (p.bestScores[id] ?? 0) >= 3).length;
    goals.push(goal('all-stars', '3 stars on every recipe', threeStar, RECIPE_ORDER.length));
    const apples = new Set(Object.keys(p.discoveredPairings).map((k) => k.split(':')[0])).size;
    goals.push(goal('apples', `Cook with ${APPLES_FOR_GOLDEN_CHEF} different apples`, apples, APPLES_FOR_GOLDEN_CHEF));
  }
  return goals;
}

/** Rank history after a check: one rank-up at most per call, recorded at the current count. */
export function advanceRank(p: RankProgressInput): number[] {
  const goals = nextRankGoals(p);
  if (!goals.length || !goals.every((g) => g.done)) return [...p.rankUps];
  return [...p.rankUps, p.completedOrders];
}
