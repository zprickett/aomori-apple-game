import { describe, expect, it } from 'vitest';
import { recipe } from '../content.ts';
import {
  gameReducer,
  initialState,
  initialStateFromSave,
  selectors,
  shouldPersist,
  toSaveData,
  type GameAction,
  type GameState,
} from '../gameReducer.ts';
import { createSaveStore, defaultSave, parseSave, type StorageLike } from '../persistence.ts';
import { orderForIndex, unlocksEarnedAt } from '../progression.ts';

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const play = (s: GameState, actions: GameAction[]) => actions.reduce(gameReducer, s);
/** Simulate a reload: serialise → JSON → parse/sanitise → rebuild. */
const reload = (s: GameState) => {
  const parsed = parseSave(JSON.stringify(toSaveData(s)));
  return initialStateFromSave(parsed.data, parsed.notice);
};
const startCooking = (s: GameState, appleId: string) =>
  play(s, [{ type: 'ACCEPT_ORDER' }, { type: 'PREVIEW_APPLE', appleId }, { type: 'CONFIRM_APPLE' }]);
const toActive = (s: GameState) => play(s, [{ type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }]);

describe('full order loop', () => {
  it('plays 15 orders (reloading after every action) with a delivery after each', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    let state = initialStateFromSave(store.load().data);
    const deliveries: Record<number, { apples: string[]; recipes: string[] }> = {};
    const dispatch = (a: GameAction) => {
      const next = gameReducer(state, a);
      expect(next).not.toBe(state); // every scripted action is valid
      if (shouldPersist(state, next)) store.save(toSaveData(next));
      // Reload from storage after every transition; the restored state must be coherent.
      const loaded = createSaveStore(storage).load();
      const restored = initialStateFromSave(loaded.data, loaded.notice);
      expect(restored.progress).toEqual(next.progress);
      expect(restored.order.orderId).toBe(next.order.orderId);
      state = next;
    };

    for (let n = 1; n <= 15; n++) {
      expect(state.phase).toBe('shop');
      expect(state.order.orderNumber).toBe(n);
      expect(state.order).toEqual(orderForIndex(n, state.progress.seed));
      expect(state.progress.unlockedRecipes).toContain(state.order.recipeId);
      dispatch({ type: 'ACCEPT_ORDER' });
      const appleId = state.order.suggestedAppleId ?? state.progress.unlockedApples[n % state.progress.unlockedApples.length];
      dispatch({ type: 'PREVIEW_APPLE', appleId });
      expect(selectors.previewFit(state)).not.toBeNull();
      dispatch({ type: 'CONFIRM_APPLE' });
      const steps = recipe(state.order.recipeId).steps;
      for (const step of steps) {
        expect(selectors.currentStep(state)?.id).toBe(step.id);
        dispatch({ type: 'BRIDGE_DONE' });
        dispatch({ type: 'READY' });
        dispatch({ type: 'COUNTIN_DONE' });
        expect(selectors.acceptsInput(state)).toBe(true);
        dispatch({ type: 'SUBMIT', eventMs: step.timing.target_ms + 600 }); // Good
        dispatch({ type: 'FEEDBACK_DONE' });
      }
      expect(state.phase).toBe('serve');
      dispatch({ type: 'SERVE_DONE' });
      expect(state.phase).toBe('result');
      expect(state.progress.completedOrders).toBe(n);
      expect(state.result!.assisted).toBe(n <= 3);
      expect(state.result!.finishedStars).toBe(Math.min(3, state.result!.fitStars + 1));
      dispatch({ type: 'RESULT_DONE' });
      if (state.phase === 'delivery') {
        deliveries[n] = { apples: state.delivery!.apples, recipes: state.delivery!.recipes };
        expect(state.delivery!.collectionComplete).toBe(false);
        dispatch({ type: 'DELIVERY_DONE' });
      }
    }
    const expected: Record<number, { apples: string[]; recipes: string[] }> = {};
    for (let n = 1; n <= 15; n++) expected[n] = unlocksEarnedAt(n);
    expect(deliveries).toEqual(expected);
    expect(deliveries[2].recipes).toEqual(['rabbit_apples']);
    expect(deliveries[3].apples).toEqual(['a094']);
    expect(deliveries[13].recipes).toEqual(['jam_toast']);
    expect(state.progress.completedOrders).toBe(15);
    expect(state.progress.unlockedApples).toHaveLength(20);
    expect(state.progress.unlockedRecipes).toHaveLength(6);
    expect(selectors.collectionComplete(state)).toBe(false);
    expect(selectors.stallLevel(state)).toBe(3);
    expect(Object.keys(state.progress.bestScores).sort()).toEqual(['apple_jam', 'fresh_juice', 'hirosaki_pie', 'jam_toast', 'rabbit_apples', 'ringo_ame']);
    expect(state.progress.discoveredPairings['a091:ringo_ame']).toEqual({ bestStars: 3, fit: 3 });
    // Free play continues.
    expect(state.phase).toBe('shop');
    expect(state.order.orderNumber).toBe(16);
  });
});

describe('cook lifecycle', () => {
  const pieAt = (completed: number) =>
    initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [] });

  it('Miss → Retry replaces only that step’s result', () => {
    let s = startCooking(initialState(), 'a048'); // order 1 juice
    s = toActive(s);
    const attempt1 = s.cook!.attemptId;
    s = gameReducer(s, { type: 'SUBMIT', eventMs: null }); // deadline expired
    expect(s.cook!.sub).toBe('miss');
    expect(s.cook!.lastResult!.grade).toBe('Miss');
    expect(s.cook!.stepResults).toEqual([]); // not committed until a choice is made
    // Extra input is ignored while in miss.
    expect(gameReducer(s, { type: 'SUBMIT', eventMs: 3500 })).toBe(s);
    s = gameReducer(s, { type: 'RETRY_STEP' });
    expect(s.cook!.sub).toBe('countin');
    expect(s.cook!.attemptId).not.toBe(attempt1);
    s = play(s, [{ type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: 3500 }]);
    expect(s.cook!.stepResults).toHaveLength(1);
    expect(s.cook!.stepResults[0]).toMatchObject({ grade: 'Perfect', error_ms: 0, attemptId: s.cook!.attemptId });
  });

  it('replaying a completed step from feedback replaces its result', () => {
    let s = startCooking(pieAt(7), 'a048'); // order 8 pie
    expect(s.order.recipeId).toBe('hirosaki_pie');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 + 1000 }]); // OK
    expect(s.cook!.stepResults[0].grade).toBe('OK');
    s = play(s, [{ type: 'RETRY_STEP' }, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: 3500 }]);
    expect(s.cook!.stepResults).toHaveLength(1);
    expect(s.cook!.stepResults[0].grade).toBe('Perfect');
  });

  it('Continue with help records Miss (normal) and advances', () => {
    let s = startCooking(pieAt(7), 'a048');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 100 }]); // far too early → Miss
    expect(s.cook!.sub).toBe('miss');
    expect(s.cook!.lastResult!.error_ms).toBe(100 - 3500);
    s = gameReducer(s, { type: 'CONTINUE_WITH_HELP' });
    expect(s.cook!.sub).toBe('feedback');
    expect(s.cook!.helped).toBe(true);
    expect(s.cook!.stepResults[0]).toMatchObject({ grade: 'Miss', assisted: true, points: 0 });
    s = gameReducer(s, { type: 'FEEDBACK_DONE' });
    expect(s.cook).toMatchObject({ stepIndex: 1, sub: 'bridge' });
  });

  it('Continue with help in assistance mode records an assisted grade; windows are 1.5×', () => {
    let s = gameReducer(pieAt(7), { type: 'SET_SETTINGS', settings: { assistance: true } });
    s = startCooking(s, 'a048');
    expect(selectors.toleranceMultiplier(s)).toBe(1.5);
    expect(selectors.trackZones(s)!.good).toEqual({ start: 2300, end: 4700 });
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 + 1100 }]);
    expect(s.cook!.lastResult).toMatchObject({ grade: 'Good', assisted: true });
    s = play(s, [{ type: 'FEEDBACK_DONE' }, ...toActiveActions(), { type: 'SUBMIT', eventMs: null }, { type: 'CONTINUE_WITH_HELP' }]);
    expect(s.cook!.stepResults[1]).toMatchObject({ grade: 'OK', assisted: true });
  });

  it('visibility hidden mid-step returns to instruction with a fresh count-in and keeps prior steps', () => {
    let s = startCooking(pieAt(7), 'a048');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 }, { type: 'FEEDBACK_DONE' }]);
    s = toActive(s);
    const attempt = s.cook!.attemptId;
    s = gameReducer(s, { type: 'VISIBILITY_HIDDEN' });
    expect(s.hidden).toBe(true);
    expect(s.cook).toMatchObject({ stepIndex: 1, sub: 'instruction' });
    expect(s.cook!.stepResults).toHaveLength(1);
    expect(selectors.acceptsInput(s)).toBe(false);
    // A late SUBMIT from the abandoned attempt is ignored.
    expect(gameReducer(s, { type: 'SUBMIT', eventMs: 3500 })).toBe(s);
    s = play(s, [{ type: 'RESUME' }, { type: 'READY' }]);
    expect(s.hidden).toBe(false);
    expect(s.cook!.sub).toBe('countin');
    expect(s.cook!.attemptId).not.toBe(attempt);
    // Hidden during countin also restarts.
    s = gameReducer(s, { type: 'VISIBILITY_HIDDEN' });
    expect(s.cook!.sub).toBe('instruction');
  });

  it('reload mid-cook resumes the same step at instruction with committed results', () => {
    let s = startCooking(pieAt(7), 'a048');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 }, { type: 'FEEDBACK_DONE' }]);
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3700 }]); // step 2 in feedback
    let r = reload(s);
    expect(r.phase).toBe('cook');
    expect(r.cook).toMatchObject({ stepIndex: 2, sub: 'instruction' });
    expect(r.cook!.stepResults.map((x) => x.grade)).toEqual(['Perfect', 'Perfect']);
    s = play(r, [{ type: 'READY' }, { type: 'COUNTIN_DONE' }]);
    r = reload(s); // reload during active → same step again
    expect(r.cook).toMatchObject({ stepIndex: 2, sub: 'instruction' });
    s = play(r, [{ type: 'READY' }, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: null }]);
    r = reload(s); // reload during miss → Miss not committed, retry the step
    expect(r.cook).toMatchObject({ stepIndex: 2, sub: 'instruction' });
    expect(r.cook!.stepResults).toHaveLength(2);
  });

  it('reload in serve resumes serve; choose restores the preview', () => {
    let s = startCooking(initialState(), 'a023');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 }, { type: 'FEEDBACK_DONE' }]);
    expect(s.phase).toBe('serve');
    const r = reload(s);
    expect(r.phase).toBe('serve');
    expect(gameReducer(r, { type: 'SERVE_DONE' }).result!.appleId).toBe('a023');
    const c = play(initialState(), [{ type: 'ACCEPT_ORDER' }, { type: 'PREVIEW_APPLE', appleId: 'a066' }]);
    expect(reload(c)).toMatchObject({ phase: 'choose', previewAppleId: 'a066' });
  });

  it('invalid actions are no-ops', () => {
    const s = initialState();
    expect(gameReducer(s, { type: 'SUBMIT', eventMs: 3500 })).toBe(s);
    expect(gameReducer(s, { type: 'CONFIRM_APPLE' })).toBe(s);
    const c = gameReducer(s, { type: 'ACCEPT_ORDER' });
    expect(gameReducer(c, { type: 'PREVIEW_APPLE', appleId: 'a086' })).toBe(c); // locked
    expect(gameReducer(c, { type: 'PREVIEW_APPLE', appleId: 'nope' })).toBe(c);
    expect(gameReducer(c, { type: 'CONFIRM_APPLE' })).toBe(c); // nothing previewed
    expect(gameReducer(c, { type: 'BACK' }).phase).toBe('shop');
    expect(gameReducer(s, { type: 'START_PRACTICE', recipeId: 'hirosaki_pie' })).toBe(s); // locked recipe
  });

  it('onboarding orders use assisted grading but keep raw grades', () => {
    let s = startCooking(initialState(), 'a048');
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: 3500 + 1200 }, { type: 'FEEDBACK_DONE' }, { type: 'SERVE_DONE' }]);
    expect(s.result).toMatchObject({ assisted: true, techniqueBonus: 1, finishedStars: 3 });
    expect(s.result!.grades[0].grade).toBe('OK');
    expect(s.result!.explanation).toContain('Helper bonus');
  });

  it('after onboarding, timing matters (penalty path)', () => {
    let s = startCooking(pieAt(3), 'a048'); // order 4 (juice), not assisted
    expect(s.order.orderNumber).toBe(4);
    s = play(toActive(s), [{ type: 'SUBMIT', eventMs: null }, { type: 'CONTINUE_WITH_HELP' }, { type: 'FEEDBACK_DONE' }, { type: 'SERVE_DONE' }]);
    expect(s.result).toMatchObject({ assisted: false, executionPenalty: 1, fitStars: 3, finishedStars: 2 });
  });
});

function toActiveActions(): GameAction[] {
  return [{ type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }];
}

describe('practice mode', () => {
  it('cooks any unlocked recipe unscored and awards no progress', () => {
    const start = initialStateFromSave({ ...defaultSave(), completedOrders: 4, completedOrderIds: [] });
    let s = gameReducer(start, { type: 'START_PRACTICE', recipeId: 'apple_jam' });
    expect(s).toMatchObject({ mode: 'practice', phase: 'choose', practiceRecipeId: 'apple_jam' });
    expect(selectors.activeRecipe(s).id).toBe('apple_jam');
    // Persisted state during practice is the underlying order's shop.
    expect(toSaveData(s).current).toMatchObject({ phase: 'shop', orderNumber: 5 });
    s = play(s, [{ type: 'PREVIEW_APPLE', appleId: 'a094' }, { type: 'CONFIRM_APPLE' }]);
    for (const step of recipe('apple_jam').steps) s = play(toActive(s), [{ type: 'SUBMIT', eventMs: step.timing.target_ms }, { type: 'FEEDBACK_DONE' }]);
    s = gameReducer(s, { type: 'SERVE_DONE' });
    expect(s.phase).toBe('result');
    expect(s.result).toBeNull();
    expect(s.practiceResult).toMatchObject({ recipeId: 'apple_jam', mean: 1 });
    expect(s.progress).toEqual(start.progress);
    s = gameReducer(s, { type: 'RESULT_DONE' });
    expect(s).toMatchObject({ mode: 'order', phase: 'shop' });
    expect(s.order).toEqual(start.order);
    expect(s.progress).toEqual(start.progress);
    // EXIT_PRACTICE from mid-cook and BACK from choose also return to the shop.
    const mid = play(start, [{ type: 'START_PRACTICE', recipeId: 'fresh_juice' }, { type: 'PREVIEW_APPLE', appleId: 'a048' }, { type: 'CONFIRM_APPLE' }]);
    expect(gameReducer(mid, { type: 'EXIT_PRACTICE' })).toMatchObject({ mode: 'order', phase: 'shop', cook: null });
    expect(play(start, [{ type: 'START_PRACTICE', recipeId: 'fresh_juice' }, { type: 'BACK' }])).toMatchObject({ mode: 'order', phase: 'shop' });
  });
});

describe('settings and reset', () => {
  it('RESET_PROGRESS requires confirm: true and keeps settings', () => {
    let s = initialStateFromSave({ ...defaultSave(), completedOrders: 9, completedOrderIds: [] });
    s = gameReducer(s, { type: 'SET_SETTINGS', settings: { sound: false, reducedMotion: 'on' } });
    expect(gameReducer(s, { type: 'RESET_PROGRESS', confirm: false })).toBe(s);
    const r = gameReducer(s, { type: 'RESET_PROGRESS', confirm: true });
    expect(r.progress.completedOrders).toBe(0);
    expect(r.progress.unlockedApples).toHaveLength(5);
    expect(r.settings).toMatchObject({ sound: false, reducedMotion: 'on' });
    expect(r.phase).toBe('shop');
    expect(r.order.orderNumber).toBe(1);
  });

  it('selectors expose unlocked apple cards (best fit first) plus the next locked one', () => {
    const s = play(initialStateFromSave({ ...defaultSave(), completedOrders: 6, completedOrderIds: [] }), [{ type: 'ACCEPT_ORDER' }]);
    expect(s.order.recipeId).toBe('ringo_ame');
    const cards = selectors.appleCards(s);
    expect(cards).toHaveLength(12);
    expect(cards[0]).toMatchObject({ unlocked: true, fitStars: 3 });
    expect(cards[0].apple.id).toBe('a091');
    expect(cards.filter((c) => !c.unlocked)).toHaveLength(1);
    expect(cards[11]).toMatchObject({ unlocked: false, unlockText: 'Arrives after 7 orders' });
    expect(selectors.bridgeText(startCooking(initialState(), 'a048'))).toMatch(/Chef washes/);
  });
});
