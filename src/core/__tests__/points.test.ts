import { describe, expect, it } from 'vitest';
import { APPLE_ORDER, RECIPE_ORDER, fitStars, recipe } from '../content.ts';
import { dishStars, maxDishPoints, recipeDifficulty, scoreDish } from '../points.ts';
import { initialState, gameReducer, commitCompletedOrder } from '../gameReducer.ts';
import { evaluateDish, type StepResult } from '../scoring.ts';
import { orderForIndex } from '../progression.ts';
import { parseSave, defaultSave } from '../persistence.ts';
import type { Grade } from '../timing.ts';

const all = (id: string, g: Grade) => recipe(id).steps.map(() => g);

describe('points scoring', () => {
  it('scales difficulty with action count', () => {
    expect(RECIPE_ORDER.map(recipeDifficulty)).toEqual([1, 1.5, 2, 3, 2.5, 1, 2.5, 2, 2, 2, 2.5, 2, 2.5, 3, 2.5, 2.5, 3, 3, 3, 3]);
  });

  it('harder recipes are worth more at their best', () => {
    expect(maxDishPoints('fresh_juice')).toBe(200);
    expect(maxDishPoints('hirosaki_pie')).toBe(3600);
    expect(maxDishPoints('hirosaki_pie')).toBeGreaterThan(maxDishPoints('ringo_ame'));
  });

  it('applies combo and apple multiplier', () => {
    // Alps Otome (a091) is a Best fit for the mini candy apple.
    const s = scoreDish('a091', 'ringo_ame', ['Perfect', 'Perfect', 'Good', 'Good']);
    expect(s.cooking).toBe(Math.round(340 * 2.5));
    expect(s.combo).toBe(Math.round(25 * 1 * 2.5));
    expect(s.appleMultiplier).toBe(2);
    expect(s.total).toBe(Math.round((s.cooking + s.combo) * 2));
    expect(s.bestStreak).toBe(2);
  });

  it('Golden Recipe only when every action is Perfect', () => {
    expect(scoreDish('a091', 'ringo_ame', all('ringo_ame', 'Perfect')).golden).toBe(true);
    expect(scoreDish('a048', 'ringo_ame', all('ringo_ame', 'Perfect')).golden).toBe(true);
    expect(scoreDish('a091', 'ringo_ame', ['Perfect', 'Perfect', 'Perfect', 'Good']).golden).toBe(false);
    const miss = scoreDish('a091', 'ringo_ame', all('ringo_ame', 'Miss'));
    expect(miss.total).toBe(0);
    expect(miss.golden).toBe(false);
  });

});

describe('history and totals', () => {
  const results = (id: string, g: Grade): StepResult[] =>
    recipe(id).steps.map((s) => ({ stepId: s.id, grade: g, error_ms: 0, attemptId: 'x', assisted: false, points: 1 }));

  it('commit records history, totals and new bests (idempotent)', () => {
    let p = initialState().progress;
    const o1 = orderForIndex(1);
    const e1 = evaluateDish({ appleId: 'a048', recipeId: o1.recipeId, results: results(o1.recipeId, 'Good'), assisted: false });
    p = commitCompletedOrder(p, o1, e1);
    expect(p.history).toHaveLength(1);
    expect(p.history[0]).toMatchObject({ orderId: o1.orderId, points: e1.score.total, newBest: false }); // first try is not a "best"
    expect(p.totalPoints).toBe(e1.score.total);
    expect(p.bestPoints[o1.recipeId]).toBe(e1.score.total);
    expect(commitCompletedOrder(p, o1, e1)).toBe(p);
    const o2 = orderForIndex(2);
    const e2 = evaluateDish({ appleId: 'a048', recipeId: o2.recipeId, results: results(o2.recipeId, 'Miss'), assisted: false });
    p = commitCompletedOrder(p, o2, e2);
    expect(p.totalPoints).toBe(e1.score.total + e2.score.total);
    expect(p.history[1].newBest).toBe(false); // a Miss dish is never a new best
    const e3 = evaluateDish({ appleId: 'a048', recipeId: o1.recipeId, results: results(o1.recipeId, 'Perfect'), assisted: false });
    p = commitCompletedOrder(p, { ...orderForIndex(3), recipeId: o1.recipeId }, e3);
    expect(p.history[2].newBest).toBe(e3.score.total > e1.score.total);
  });

  it('saves round-trip points and history; old saves load with empty history', () => {
    const s0 = initialState();
    const json = JSON.stringify({ ...defaultSave(), totalPoints: 1234, bestPoints: { fresh_juice: 200, bogus: 5 }, history: [{ orderId: 'o-0001', orderNumber: 1, recipeId: 'fresh_juice', appleId: 'a048', points: 200, rank: 'golden', grades: ['Perfect'], fit: 3, newBest: true }, { junk: true }] });
    const { data } = parseSave(json);
    expect(data.totalPoints).toBe(1234);
    expect(data.bestPoints).toEqual({ fresh_juice: 200 });
    expect(data.history).toHaveLength(1);
    expect(data.history[0].golden).toBe(true);
    const legacy = JSON.parse(JSON.stringify(defaultSave()));
    delete legacy.totalPoints; delete legacy.bestPoints; delete legacy.history;
    expect(parseSave(JSON.stringify(legacy)).data).toMatchObject({ totalPoints: 0, bestPoints: {}, history: [] });
    expect(gameReducer(s0, { type: 'DISMISS_NOTICE' }).progress.history).toEqual([]);
  });
});

describe('dish stars', () => {
  it('come from the share of the best possible points; Golden is at least 2', () => {
    expect(dishStars(0, 200, false)).toBe(0);
    expect(dishStars(1, 200, false)).toBe(1);
    expect(dishStars(80, 200, false)).toBe(2);
    expect(dishStars(140, 200, false)).toBe(3);
    expect(dishStars(50, 200, true)).toBe(2);
  });

  it('a Miss-only dish earns no stars even with the best apple; timing and apple both count', () => {
    const best = APPLE_ORDER.find((id) => fitStars(id, 'rabbit_apples') === 3)!;
    const worst = [...APPLE_ORDER].sort((a, b) => fitStars(a, 'rabbit_apples') - fitStars(b, 'rabbit_apples'))[0];
    expect(scoreDish(best, 'rabbit_apples', ['Miss', 'Miss']).stars).toBe(0);
    expect(scoreDish(best, 'rabbit_apples', ['Perfect', 'Good']).stars).toBe(3);
    expect(scoreDish(best, 'rabbit_apples', ['Good', 'Good']).stars).toBe(2);
    // A Golden Recipe with the least-suited apple still shows 2 stars, never 3.
    expect(fitStars(worst, 'rabbit_apples')).toBeLessThanOrEqual(1);
    expect(scoreDish(worst, 'rabbit_apples', ['Perfect', 'Perfect'])).toMatchObject({ golden: true, stars: 2 });
    expect(scoreDish(best, 'fresh_juice', ['Good']).stars).toBe(3);
  });
});
