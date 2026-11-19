import { describe, expect, it } from 'vitest';
import { APPLE_ORDER, RECIPE_ORDER, fitStars, recipe } from '../content.ts';
import { commitCompletedOrder, initialStateFromSave } from '../gameReducer.ts';
import { defaultSave } from '../persistence.ts';
import { orderForIndex } from '../progression.ts';
import { evaluateDish } from '../scoring.ts';
import {
  LADDER,
  RANKS,
  TYPICAL_LADDER,
  advanceLadder,
  cleanLadder,
  ladderFromRankUps,
  ladderProgress,
  rankOf,
  rankReachedAt,
  rankUpsOf,
  recipeRank,
  recipeUnlockAtFor,
  stepLabel,
  stepsForPoints,
  typicalPoints,
} from '../ranks.ts';

describe('the ladder', () => {
  it('five ranks; ten steps (a rank, then two ★ steps); every recipe on it once', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['Helper', 'Apprentice', 'Cook', 'Head Cook', 'Golden Chef']);
    expect(LADDER.map(stepLabel)).toEqual([
      'Apprentice', 'Apprentice ★', 'Apprentice ★★', 'Cook', 'Cook ★', 'Cook ★★',
      'Head Cook', 'Head Cook ★', 'Head Cook ★★', 'Golden Chef',
    ]);
    for (let i = 1; i < LADDER.length; i++) expect(LADDER[i].points).toBeGreaterThan(LADDER[i - 1].points);
    expect(RECIPE_ORDER.map(recipeRank).sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4]);
    expect(TYPICAL_LADDER).toHaveLength(LADDER.length);
  });

  it('points alone move the chef up; every passed step is recorded at that order', () => {
    expect(advanceLadder([], LADDER[0].points - 1, 4)).toEqual([]);
    expect(advanceLadder([], LADDER[0].points, 4)).toEqual([4]);
    expect(advanceLadder([4], LADDER[2].points, 9)).toEqual([4, 9, 9]);
    expect(advanceLadder(TYPICAL_LADDER, 10 ** 9, 99)).toEqual(TYPICAL_LADDER);
    expect(stepsForPoints(0)).toBe(0);
    expect(stepsForPoints(LADDER[9].points)).toBe(10);
  });

  it('ranks come from the ladder', () => {
    expect(rankOf([])).toBe(1);
    expect(rankOf([5, 9])).toBe(2);
    expect(rankOf(TYPICAL_LADDER.slice(0, 4))).toBe(3);
    expect(rankOf(TYPICAL_LADDER)).toBe(5);
    expect(rankUpsOf(TYPICAL_LADDER)).toEqual([5, 18, 32, 51]);
    expect(rankReachedAt(1, [])).toBe(0);
    expect(rankReachedAt(3, [5, 9])).toBeNull();
  });

  it('recipes unlock with their step; Helper has juice from the start and rabbit wedges after 2 orders', () => {
    expect(recipeUnlockAtFor('fresh_juice', [])).toBe(0);
    expect(recipeUnlockAtFor('rabbit_apples', [])).toBe(2);
    expect(recipeUnlockAtFor('apple_jam', [])).toBeNull();
    expect(recipeUnlockAtFor('apple_jam', [6])).toBe(6);
    expect(recipeUnlockAtFor('ringo_ame', [6, 10, 13])).toBe(13);
    expect(recipeUnlockAtFor('apple_compote', TYPICAL_LADDER)).toBe(42);
  });

  it('progress shows rank, ★ steps, points to go and the bar fill', () => {
    const p = ladderProgress(LADDER[4].points + 100);
    expect([p.rank, p.stars, p.next?.index]).toEqual([3, 1, 5]);
    expect(p.toGo).toBe(LADDER[5].points - LADDER[4].points - 100);
    expect(p.frac).toBeGreaterThan(0);
    const top = ladderProgress(LADDER[9].points + 5000);
    expect([top.rank, top.next, top.frac]).toEqual([5, null, 1]);
    expect(ladderProgress(0)).toMatchObject({ rank: 1, stars: 0, from: 0, toGo: LADDER[0].points });
  });

  it('cleanLadder keeps a valid, non-decreasing history only', () => {
    expect(cleanLadder(undefined, 10)).toEqual([]);
    expect(cleanLadder([5, 9, 9, 12], 10)).toEqual([5, 9, 9]);
    expect(cleanLadder([5, 3], 10)).toEqual([5]);
    expect(cleanLadder([5, 'x'], 10)).toEqual([5]);
  });

  it('v3 rank histories move onto the ladder without losing rank or recipes', () => {
    // Cook at 15 (from v3 goals) with only a few points: still Cook, recipes keep their old counts.
    const l = ladderFromRankUps([5, 15], 22, 3000);
    expect(rankOf(l)).toBe(3);
    expect(recipeUnlockAtFor('apple_jam', l)).toBe(5);
    expect(recipeUnlockAtFor('ringo_ame', l)).toBe(8);
    expect(recipeUnlockAtFor('hirosaki_pie', l)).toBe(15);
    expect(recipeUnlockAtFor('jam_toast', l)).toBe(21);
    // Many points push them further up.
    expect(ladderFromRankUps([5], 30, LADDER[6].points).length).toBe(7);
    expect(ladderFromRankUps([], 0, 0)).toEqual([]);
  });

  it('typical points follow the typical ladder (dev skip)', () => {
    expect(typicalPoints(0)).toBe(0);
    for (let i = 0; i < LADDER.length; i++) expect(typicalPoints(TYPICAL_LADDER[i])).toBe(LADDER[i].points);
  });
});

describe('ladder on commit', () => {
  it('the points that pass Cook bring the pie at that same order', () => {
    const save = { ...defaultSave(), completedOrders: 15, completedOrderIds: [], ladder: [5, 9, 13], totalPoints: LADDER[3].points - 50 };
    const state = initialStateFromSave(save);
    expect(state.progress.unlockedRecipes).not.toContain('hirosaki_pie');
    const order = { ...orderForIndex(16, save.seed, [5, 9, 13]), recipeId: 'rabbit_apples' as const };
    const appleId = APPLE_ORDER.find((id) => fitStars(id, 'rabbit_apples') === 3)!;
    const results = recipe('rabbit_apples').steps.map((s) => ({
      stepId: s.id, grade: 'Perfect' as const, error_ms: 0, attemptId: 'x', assisted: false, points: 100,
    }));
    const evaluation = evaluateDish({ appleId, recipeId: 'rabbit_apples', results, assisted: false });
    const p = commitCompletedOrder(state.progress, order, evaluation);
    expect(p.ladder).toEqual([5, 9, 13, 16]);
    expect(rankOf(p.ladder)).toBe(3);
    expect(p.unlockedRecipes).toContain('hirosaki_pie');
  });

  it('a Golden Recipe earns 25% more points; stars ignore the bonus', () => {
    const appleId = APPLE_ORDER.find((id) => fitStars(id, 'fresh_juice') === 3)!;
    const res = (grade: 'Perfect' | 'Good') => [{ stepId: recipe('fresh_juice').steps[0].id, grade, error_ms: 0, attemptId: 'x', assisted: false, points: 1 }];
    const gold = evaluateDish({ appleId, recipeId: 'fresh_juice', results: res('Perfect'), assisted: false }).score;
    expect(gold.golden).toBe(true);
    expect(gold.total).toBe(250);
    expect(gold.goldenBonus).toBe(50);
    expect(gold.stars).toBe(3);
    expect(evaluateDish({ appleId, recipeId: 'fresh_juice', results: res('Good'), assisted: false }).score.goldenBonus).toBe(0);
  });
});
