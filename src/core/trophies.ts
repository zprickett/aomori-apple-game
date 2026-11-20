/**
 * Golden Trophies (story phase 5): long-term collections, each with bronze, silver and gold steps.
 * Counters that can't be rebuilt from progress (slices, stirs, streaks, finished stories) live in
 * TrophyStats; the rest is read from progress (apples cooked and discovered). Pure functions.
 *
 * Trophies tied to Golden Requests (World Traveller, Golden Seal Master, Collector's Crown) come
 * with Stage 2.
 */
import { APPLES, apple, recipe } from './content.ts';
import type { Grade } from './timing.ts';

export interface TrophyStats {
  /** Swipe (slice) actions done, not missed. */
  slices: number;
  /** Rabbit Apple Wedges plates served. */
  rabbitPlates: number;
  /** Circle (stir) actions graded Perfect. */
  perfectStirs: number;
  /** Perfect actions in a row right now, across dishes. */
  streak: number;
  bestStreak: number;
  /** Regulars whose last story visit was served. */
  storiesDone: string[];
}

export const EMPTY_STATS: Readonly<TrophyStats> = Object.freeze({ slices: 0, rabbitPlates: 0, perfectStirs: 0, streak: 0, bestStreak: 0, storiesDone: [] });

/** Add one served dish to the stats. `storyDone` = a regular whose story just finished. */
export function addDish(stats: TrophyStats, recipeId: string, grades: readonly Grade[], storyDone?: string): TrophyStats {
  const steps = recipe(recipeId).steps;
  let { slices, perfectStirs, streak, bestStreak } = stats;
  grades.forEach((g, i) => {
    const gesture = steps[i]?.gesture;
    if (gesture === 'swipe' && g !== 'Miss') slices += 1;
    if (gesture === 'circle' && g === 'Perfect') perfectStirs += 1;
    streak = g === 'Perfect' ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  });
  const storiesDone = storyDone && !stats.storiesDone.includes(storyDone) ? [...stats.storiesDone, storyDone] : stats.storiesDone;
  return { slices, perfectStirs, streak, bestStreak, storiesDone, rabbitPlates: stats.rabbitPlates + (recipeId === 'rabbit_apples' ? 1 : 0) };
}

/** Rebuild what we can from order history (older saves had no stats). */
export function statsFromHistory(history: ReadonlyArray<{ recipeId: string; grades: readonly Grade[] }>): TrophyStats {
  return history.reduce<TrophyStats>((s, h) => addDish(s, h.recipeId, h.grades), { ...EMPTY_STATS, storiesDone: [] });
}

export function sanitizeStats(v: unknown, history: ReadonlyArray<{ recipeId: string; grades: readonly Grade[] }>): TrophyStats {
  if (typeof v !== 'object' || v === null) return statsFromHistory(history);
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);
  return {
    slices: n(o.slices), rabbitPlates: n(o.rabbitPlates), perfectStirs: n(o.perfectStirs),
    streak: n(o.streak), bestStreak: n(o.bestStreak),
    storiesDone: Array.isArray(o.storiesDone) ? [...new Set(o.storiesDone.filter((x): x is string => typeof x === 'string'))] : [],
  };
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

export type TrophyTier = 0 | 1 | 2 | 3;
export const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold'] as const;

/** What the trophy reads from the player. */
export interface TrophyInput {
  stats: TrophyStats;
  /** Apple ids cooked at least once. */
  cookedApples: readonly string[];
  unlockedApples: readonly string[];
}

export interface TrophyStep {
  /** e.g. "Slice 25 apples". */
  goal: string;
  have: number;
  need: number;
}

export interface TrophyDef {
  id: string;
  /** What counts, in one kid-friendly line (shown when the trophy is tapped). */
  about?: string;
  name: string;
  icon: string;
  /** The three steps (bronze, silver, gold) with progress. */
  steps(p: TrophyInput): [TrophyStep, TrophyStep, TrophyStep];
}

const count = (goal: string, have: number, need: number): TrophyStep => ({ goal, have: Math.min(have, need), need });
const counter = (id: string, name: string, icon: string, read: (p: TrophyInput) => number, needs: [number, number, number], goal: (n: number) => string): TrophyDef => ({
  id, name, icon,
  steps: (p) => needs.map((n) => count(goal(n), read(p), n)) as [TrophyStep, TrophyStep, TrophyStep],
});

/** Skin colour group for the Rainbow Basket (from the painted skin's hue). */
export function skinColor(appleId: string): 'red' | 'yellow' | 'green' {
  const h = apple(appleId).skin.base.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return hue < 25 || hue > 330 ? 'red' : hue < 65 ? 'yellow' : 'green';
}

const GREENS = APPLES.filter((a) => skinColor(a.id) === 'green').map((a) => a.id);
const PINKS = APPLES.filter((a) => a.fleshRed).map((a) => a.id);
const byWeight = [...APPLES].sort((a, b) => a.weightG - b.weightG);
const SMALLEST = byWeight[0].id;
const BIGGEST = byWeight[byWeight.length - 1].id;

export const TROPHIES: readonly TrophyDef[] = Object.freeze([
  counter('peeler', 'Golden Peeler', '🔪', (p) => p.stats.slices, [25, 150, 500], (n) => `Slice ${n} apples`),
  counter('warren', 'Hop-Hop Warren', '🐇', (p) => p.stats.rabbitPlates, [5, 25, 100], (n) => `Serve ${n} rabbit apple plates`),
  counter('spoon', 'Golden Spoon', '🥄', (p) => p.stats.perfectStirs, [15, 75, 250], (n) => `Stir ${n} perfect circles`),
  counter('streak', 'Perfect Streak', '🔥', (p) => p.stats.bestStreak, [10, 25, 50], (n) => `${n} Perfect actions in a row`),
  {
    id: 'rainbow', name: 'Rainbow Basket', icon: '🌈',
    steps: (p) => {
      const has = (c: string) => p.cookedApples.some((a) => skinColor(a) === c);
      const three = ['red', 'yellow', 'green'].filter(has).length;
      const pink = p.cookedApples.some((a) => PINKS.includes(a));
      const every = [...GREENS, ...PINKS].filter((a) => p.cookedApples.includes(a)).length;
      return [
        count('Cook with a red, a yellow and a green apple', three, 3),
        count('Add a pink-inside apple', three + (pink ? 1 : 0), 4),
        count('Cook with every green and pink-inside apple', every, GREENS.length + PINKS.length),
      ];
    },
  },
  counter('encyclopedia', 'Apple Encyclopedia', '📚', (p) => p.unlockedApples.length, [25, 50, 100], (n) => (n === 100 ? 'Discover all 100 apples' : `Discover ${n} apples`)),
  {
    id: 'sizes', name: 'Big and Small', icon: '⚖️',
    steps: (p) => {
      const of = (s: string) => p.cookedApples.filter((a) => apple(a).sizeLabel === s).length;
      const kinds = ['S', 'M', 'L'].filter((s) => of(s) > 0).length;
      const fives = ['S', 'M', 'L'].reduce((n, s) => n + Math.min(5, of(s)), 0);
      const ends = [SMALLEST, BIGGEST].filter((a) => p.cookedApples.includes(a)).length;
      return [
        count('Cook with an S, an M and an L apple', kinds, 3),
        count('Cook with 5 apples of each size', fives, 15),
        count('Cook with the smallest and the biggest apple', ends, 2),
      ];
    },
  },
  counter('friends', "Regulars' Friend", '💛', (p) => p.stats.storiesDone.length, [1, 2, 4], (n) => (n === 1 ? "Finish a regular's story" : n === 4 ? "Finish all 4 regulars' stories" : `Finish ${n} regulars' stories`)),
]);

/** What each trophy counts (shown when a kid taps it). */
const ABOUT: Readonly<Record<string, string>> = {
  peeler: 'Every apple you slice counts, in any recipe.',
  warren: 'Every plate of Rabbit Apple Wedges you serve counts.',
  spoon: 'Every stir that lands on Perfect counts.',
  streak: 'Perfect actions in a row, even across different dishes. One miss starts it again!',
  rainbow: 'Cook with apples of every colour: red, yellow, green, and the rare pink-inside ones.',
  encyclopedia: 'Every new apple that arrives at your stall counts.',
  sizes: 'Cook with small, medium and large apples. Can you find the tiniest and the biggest?',
  friends: "Serve each regular's last story visit to finish their story.",
};
for (const t of TROPHIES as TrophyDef[]) t.about = ABOUT[t.id];

export function trophy(id: string): TrophyDef {
  const t = TROPHIES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown trophy ${id}`);
  return t;
}

/** Highest step reached (each step needs the one before). */
export function trophyTier(t: TrophyDef, p: TrophyInput): TrophyTier {
  const steps = t.steps(p);
  let tier = 0;
  while (tier < 3 && steps[tier].have >= steps[tier].need) tier++;
  return tier as TrophyTier;
}

export interface TrophyStatus {
  id: string;
  name: string;
  icon: string;
  tier: TrophyTier;
  /** The next step to aim for, or null at gold. */
  next: TrophyStep | null;
  /** The step just reached (for the pop-up), or null at none. */
  reached: TrophyStep | null;
}

export function trophyStatus(p: TrophyInput): TrophyStatus[] {
  return TROPHIES.map((t) => {
    const steps = t.steps(p);
    const tier = trophyTier(t, p);
    const list: TrophyStep[] = steps;
    return { id: t.id, name: t.name, icon: t.icon, tier, next: tier < 3 ? list[tier] : null, reached: tier > 0 ? list[tier - 1] : null };
  });
}

/** Reward key for one trophy step, e.g. 'trophy:peeler:1'. */
export const trophyKey = (id: string, tier: number) => `trophy:${id}:${tier}`;
