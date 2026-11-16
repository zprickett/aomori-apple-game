import { describe, expect, it } from 'vitest';
import { APPLE_ORDER, RECIPE_ORDER, fitStars, recipe } from '../content.ts';
import { commitCompletedOrder, initialStateFromSave } from '../gameReducer.ts';
import { defaultSave } from '../persistence.ts';
import { orderForIndex } from '../progression.ts';
import { evaluateDish } from '../scoring.ts';
import {
  EARLIEST_RANK_UPS,
  RANKS,
  advanceRank,
  cleanRankUps,
  nextRankGoals,
  rankOf,
  recipeRank,
  type RankProgressInput,
} from '../ranks.ts';

const base = (over: Partial<RankProgressInput> = {}): RankProgressInput => ({
  completedOrders: 0,
  rankUps: [],
  bestScores: {},
  discoveredPairings: {},
  history: [],
  ...over,
});

describe('ranks', () => {
  it('five ranks, every playable recipe belongs to exactly one', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['Helper', 'Apprentice', 'Cook', 'Head Cook', 'Golden Chef']);
    expect(EARLIEST_RANK_UPS).toEqual([5, 15, 30, 50]);
    expect(RECIPE_ORDER.map(recipeRank).sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4]);
    expect(rankOf([])).toBe(1);
    expect(rankOf([5, 15, 30, 50])).toBe(5);
  });

  it('Apprentice needs 5 orders only', () => {
    expect(nextRankGoals(base({ completedOrders: 4 })).map((g) => g.done)).toEqual([false]);
    expect(advanceRank(base({ completedOrders: 4 }))).toEqual([]);
    expect(advanceRank(base({ completedOrders: 5 }))).toEqual([5]);
  });

  it('Cook needs 15 orders and 3 stars on juice and rabbit wedges', () => {
    const p = base({ completedOrders: 15, rankUps: [5], bestScores: { fresh_juice: 3, rabbit_apples: 2 } });
    expect(nextRankGoals(p).map((g) => [g.id, g.done])).toEqual([
      ['orders', true], ['stars:fresh_juice', true], ['stars:rabbit_apples', false],
    ]);
    expect(advanceRank(p)).toEqual([5]);
    // Passing later records the later count.
    expect(advanceRank({ ...p, completedOrders: 19, bestScores: { fresh_juice: 3, rabbit_apples: 3 } })).toEqual([5, 19]);
  });

  it('Head Cook counts Golden Recipes earned since reaching Cook', () => {
    const golden = (orderNumber: number) => ({ orderNumber, golden: true });
    const p = base({ completedOrders: 30, rankUps: [5, 15], history: [golden(3), golden(10), golden(16), golden(20), golden(25), golden(29)] });
    const g = nextRankGoals(p).find((x) => x.id === 'golden')!;
    expect([g.have, g.need, g.done]).toEqual([4, 5, false]);
    expect(advanceRank({ ...p, history: [...p.history, golden(30)] })).toEqual([5, 15, 30]);
  });

  it('Golden Chef needs 3 stars on every recipe and 30 different apples', () => {
    const allStars = Object.fromEntries(RECIPE_ORDER.map((id) => [id, 3]));
    const pairs = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`a${String(i + 1).padStart(3, '0')}:fresh_juice`, {}]));
    const p = base({ completedOrders: 50, rankUps: [5, 15, 30], bestScores: allStars, discoveredPairings: pairs });
    expect(advanceRank(p)).toEqual([5, 15, 30, 50]);
    expect(advanceRank({ ...p, bestScores: { ...allStars, apple_compote: 2 } })).toEqual([5, 15, 30]);
    // Several recipes with one apple count once.
    const one = { 'a001:fresh_juice': {}, 'a001:apple_jam': {} };
    expect(nextRankGoals({ ...p, discoveredPairings: one }).find((g) => g.id === 'apples')!.have).toBe(1);
    expect(nextRankGoals({ ...p, rankUps: [5, 15, 30, 50] })).toEqual([]);
  });

  it('cleanRankUps defaults missing history to the earliest schedule', () => {
    expect(cleanRankUps(undefined, 16)).toEqual([5, 15]);
    expect(cleanRankUps([7], 16)).toEqual([7]);
  });
});

describe('rank-up on commit', () => {
  it('a 3-star rabbit plate at order 16 brings Cook and the pie together', () => {
    const save = { ...defaultSave(), completedOrders: 15, completedOrderIds: [], rankUps: [5], bestScores: { fresh_juice: 3, rabbit_apples: 2 } };
    const state = initialStateFromSave(save);
    expect(state.progress.unlockedRecipes).not.toContain('hirosaki_pie');
    const order = { ...orderForIndex(16, save.seed, [5]), recipeId: 'rabbit_apples' as const };
    const appleId = APPLE_ORDER.find((id) => fitStars(id, 'rabbit_apples') === 3)!;
    const results = recipe('rabbit_apples').steps.map((s) => ({
      stepId: s.id, grade: 'Perfect' as const, error_ms: 0, attemptId: 'x', assisted: false, points: 100,
    }));
    const evaluation = evaluateDish({ appleId, recipeId: 'rabbit_apples', results, assisted: false });
    expect(evaluation.finishedStars).toBe(3);
    const p = commitCompletedOrder(state.progress, order, evaluation);
    expect(p.rankUps).toEqual([5, 16]);
    expect(p.unlockedRecipes).toContain('hirosaki_pie');
    expect(p.history.at(-1)!.stars).toBe(3);
  });
});
