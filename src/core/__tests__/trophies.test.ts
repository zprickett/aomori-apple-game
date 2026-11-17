import { describe, expect, it } from 'vitest';
import { APPLES, recipe } from '../content.ts';
import { commitCompletedOrder, initialStateFromSave, pendingDelivery, rewardKeys, selectors } from '../gameReducer.ts';
import { defaultSave, parseSave } from '../persistence.ts';
import { orderForIndex } from '../progression.ts';
import { evaluateDish, type StepResult } from '../scoring.ts';
import type { Grade } from '../timing.ts';
import { EMPTY_STATS, TROPHIES, addDish, skinColor, statsFromHistory, trophy, trophyTier, type TrophyInput } from '../trophies.ts';

const fresh = () => ({ ...EMPTY_STATS, storiesDone: [] as string[] });
const input = (over: Partial<TrophyInput> = {}): TrophyInput => ({ stats: fresh(), cookedApples: [], unlockedApples: [], ...over });
const gradesFor = (recipeId: string, g: Grade) => recipe(recipeId).steps.map(() => g);

describe('trophy stats', () => {
  it('counts slices, perfect stirs, rabbit plates and the Perfect streak across dishes', () => {
    const swipeRecipe = ['rabbit_apples', 'apple_jam', 'hirosaki_pie'].find((r) => recipe(r).steps.some((s) => s.gesture === 'swipe'))!;
    const circleRecipe = ['apple_jam', 'apple_compote', 'baked_apple'].find((r) => recipe(r).steps.some((s) => s.gesture === 'circle'))!;
    let s = addDish(fresh(), swipeRecipe, gradesFor(swipeRecipe, 'Perfect'));
    const swipes = recipe(swipeRecipe).steps.filter((x) => x.gesture === 'swipe').length;
    expect(s.slices).toBe(swipes);
    s = addDish(s, circleRecipe, gradesFor(circleRecipe, 'Perfect'));
    expect(s.perfectStirs).toBeGreaterThan(0);
    const run = recipe(swipeRecipe).steps.length + recipe(circleRecipe).steps.length;
    expect([s.streak, s.bestStreak]).toEqual([run, run]); // streak carries across dishes
    s = addDish(s, 'fresh_juice', ['Good']);
    expect([s.streak, s.bestStreak]).toEqual([0, run]);
    s = addDish(s, 'rabbit_apples', gradesFor('rabbit_apples', 'Miss'));
    expect(s.rabbitPlates).toBe(swipeRecipe === 'rabbit_apples' ? 2 : 1);
    expect(addDish(s, 'fresh_juice', ['OK'], 'sota').storiesDone).toEqual(['sota']);
  });

  it('older saves rebuild their stats from history', () => {
    const history = [{ recipeId: 'rabbit_apples', grades: gradesFor('rabbit_apples', 'Perfect') }, { recipeId: 'fresh_juice', grades: ['Perfect' as Grade] }];
    const s = statsFromHistory(history);
    expect(s.rabbitPlates).toBe(1);
    expect(s.bestStreak).toBe(recipe('rabbit_apples').steps.length + 1);
    const save = parseSave(JSON.stringify({ version: 3, completedOrders: 2, history: history.map((h, i) => ({ ...h, orderId: `o-000${i + 1}`, orderNumber: i + 1, appleId: 'a048', points: 1 })) }));
    expect(save.data.trophyStats?.rabbitPlates).toBe(1);
  });
});

describe('trophies', () => {
  it('eight trophies, each needing the step before', () => {
    expect(TROPHIES.map((t) => t.name)).toEqual([
      'Golden Peeler', 'Hop-Hop Warren', 'Golden Spoon', 'Perfect Streak', 'Rainbow Basket', 'Apple Encyclopedia', 'Big and Small', "Regulars' Friend",
    ]);
    const t = trophy('warren');
    expect([4, 5, 24, 25, 100].map((n) => trophyTier(t, input({ stats: { ...fresh(), rabbitPlates: n } })))).toEqual([0, 1, 1, 2, 3]);
  });

  it('Rainbow Basket: red, yellow and green, then pink inside, then every green and pink apple', () => {
    const by = (c: string) => APPLES.find((a) => skinColor(a.id) === c && !a.fleshRed)!.id;
    const t = trophy('rainbow');
    expect(trophyTier(t, input({ cookedApples: [by('red'), by('yellow')] }))).toBe(0);
    const three = [by('red'), by('yellow'), by('green')];
    expect(trophyTier(t, input({ cookedApples: three }))).toBe(1);
    const pink = APPLES.find((a) => a.fleshRed)!.id;
    expect(trophyTier(t, input({ cookedApples: [...three, pink] }))).toBe(2);
    const all = APPLES.filter((a) => a.fleshRed || skinColor(a.id) === 'green').map((a) => a.id);
    expect(trophyTier(t, input({ cookedApples: [...three, ...all] }))).toBe(3);
  });

  it('Big and Small: one of each size, five of each, then the smallest and biggest', () => {
    const t = trophy('sizes');
    const of = (s: string, n: number) => APPLES.filter((a) => a.sizeLabel === s).slice(0, n).map((a) => a.id);
    expect(trophyTier(t, input({ cookedApples: [...of('S', 1), ...of('M', 1)] }))).toBe(0);
    expect(trophyTier(t, input({ cookedApples: [...of('S', 1), ...of('M', 1), ...of('L', 1)] }))).toBe(1);
    expect(trophyTier(t, input({ cookedApples: [...of('S', 5), ...of('M', 5), ...of('L', 5)] }))).toBe(2);
    const w = [...APPLES].sort((a, b) => a.weightG - b.weightG);
    expect(trophyTier(t, input({ cookedApples: [...of('S', 5), ...of('M', 5), ...of('L', 5), w[0].id, w[w.length - 1].id] }))).toBe(3);
  });
});

describe('trophies in play', () => {
  const serve = (completed: number, recipeId: string, grade: Grade, extra: object = {}) => {
    const s = initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [], ...extra });
    const order = { ...orderForIndex(completed + 1, s.progress.seed, s.progress.rankUps), recipeId: recipeId as 'fresh_juice' };
    const results: StepResult[] = recipe(recipeId).steps.map((st) => ({ stepId: st.id, grade, error_ms: 0, attemptId: 'x', assisted: false, points: 100 }));
    const ev = evaluateDish({ appleId: 'a048', recipeId, results, assisted: false });
    return { s, order, progress: commitCompletedOrder(s.progress, order, ev) };
  };

  it('a trophy step shows once as a delivery, then never again', () => {
    const stats = { ...fresh(), rabbitPlates: 4 };
    const { order, progress } = serve(10, 'rabbit_apples', 'Good', { trophyStats: stats, rankUps: [5] });
    expect(progress.trophyStats.rabbitPlates).toBe(5);
    const d = pendingDelivery(progress, order.orderNumber, order)!;
    expect(d.trophies).toContainEqual({ id: 'warren', tier: 1 });
    const seen = { ...progress, seenUnlockRewards: [...progress.seenUnlockRewards, ...rewardKeys(d)] };
    expect(pendingDelivery(seen, order.orderNumber, order)?.trophies ?? []).not.toContainEqual({ id: 'warren', tier: 1 });
  });

  it("serving a regular's last visit finishes their story", () => {
    const os = Array.from({ length: 60 }, (_, i) => orderForIndex(i + 1, 3, [5, 15, 30, 50]));
    const last = os.filter((o) => o.visit?.who === 'sota').at(-1)!;
    expect(last.visit).toMatchObject({ step: 4, of: 4 });
    const s = initialStateFromSave({ ...defaultSave(3), completedOrders: last.orderNumber - 1, completedOrderIds: [], rankUps: [5, 15, 30] });
    const results: StepResult[] = recipe(last.recipeId).steps.map((st) => ({ stepId: st.id, grade: 'Good', error_ms: 0, attemptId: 'x', assisted: false, points: 70 }));
    const ev = evaluateDish({ appleId: 'a048', recipeId: last.recipeId, results, assisted: false });
    const p = commitCompletedOrder(s.progress, s.order, ev);
    expect(p.trophyStats.storiesDone).toEqual(['sota']);
    expect(selectors.trophies({ ...s, progress: p }).find((t) => t.id === 'friends')?.tier).toBe(1);
  });
});
