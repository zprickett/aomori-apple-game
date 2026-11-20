import { describe, expect, it } from 'vitest';
import { recipe } from '../content.ts';
import { commitCompletedOrder, initialStateFromSave, selectors } from '../gameReducer.ts';
import { defaultSave } from '../persistence.ts';
import { orderForIndex } from '../progression.ts';
import { evaluateDish, type StepResult } from '../scoring.ts';
import type { Grade } from '../timing.ts';

const serve = (bestPoints: Record<string, number>, completed: number, recipeId: string, grade: Grade) => {
  const s = initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [], bestPoints });
  const order = { ...orderForIndex(completed + 1, s.progress.seed), recipeId: recipeId as 'fresh_juice' };
  const results: StepResult[] = recipe(recipeId).steps.map((st) => ({ stepId: st.id, grade, error_ms: 0, attemptId: 'x', assisted: false, points: 100 }));
  const ev = evaluateDish({ appleId: 'a048', recipeId, results, assisted: false });
  return { s, progress: commitCompletedOrder(s.progress, order, ev), total: ev.score.total };
};

describe('high score', () => {
  it('flags a dish that beats every dish ever, not the very first dish', () => {
    expect(serve({}, 0, 'fresh_juice', 'Perfect').progress.history.at(-1)!.newHigh).toBeUndefined();
    const big = serve({ fresh_juice: 100 }, 3, 'rabbit_apples', 'Perfect');
    expect(big.progress.history.at(-1)!.newHigh).toBe(true);
    const small = serve({ hirosaki_pie: 999999 }, 3, 'fresh_juice', 'Perfect');
    expect(small.progress.history.at(-1)!.newHigh).toBeUndefined();
  });

  it('records: the high score and its dish, total points, Golden Recipes, Perfect streak', () => {
    const { s, progress, total } = serve({ fresh_juice: 100 }, 3, 'rabbit_apples', 'Perfect');
    const r = selectors.records({ ...s, progress });
    expect(r.high).toEqual({ recipeId: 'rabbit_apples', points: total });
    expect(r.golden).toBe(1);
    expect(r.streak).toBe(recipe('rabbit_apples').steps.length);
  });
});
