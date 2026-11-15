import { describe, expect, it } from 'vitest';
import {
  NOTICE_CORRUPT,
  NOTICE_FUTURE,
  NOTICE_MIGRATED,
  NOTICE_NO_STORAGE,
  SAVE_KEY,
  createSaveStore,
  defaultSave,
  type SaveData,
  type StorageLike,
} from '../persistence.ts';
import { gameReducer, initialStateFromSave, toSaveData, type GameAction, type GameState } from '../gameReducer.ts';
import { recipe } from '../content.ts';
import { unlockedApples } from '../progression.ts';

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceeded');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

/** Storage that works for the probe but fails on real writes (e.g. quota). */
class QuotaStorage extends FakeStorage {
  setItem(k: string, v: string) {
    if (k === SAVE_KEY) throw new Error('QuotaExceeded');
    super.setItem(k, v);
  }
}

describe('save store', () => {
  it('round-trips through localStorage-like storage', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    expect(store.persistent).toBe(true);
    const first = store.load();
    expect(first.notice).toBeNull();
    expect(first.data).toEqual(defaultSave());
    const data: SaveData = {
      ...defaultSave(),
      completedOrders: 4,
      completedOrderIds: ['o-0001', 'o-0002', 'o-0003', 'o-0004'],
      bestScores: { fresh_juice: 3, rabbit_apples: 2 },
      discoveredPairings: { 'a048:fresh_juice': { bestStars: 3, fit: 3 } },
      settings: { sound: false, assistance: true, altControls: true, reducedMotion: 'on' },
      seenUnlockRewards: ['recipe:rabbit_apples', 'apple:a094', 'recipe:apple_jam'],
    };
    data.unlockedApples = unlockedApples(4);
    data.unlockedRecipes = ['fresh_juice', 'rabbit_apples', 'apple_jam'];
    expect(store.save(data)).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(2);
    const again = createSaveStore(storage).load();
    expect(again.data).toEqual(data);
    expect(again.persistent).toBe(true);
  });

  it('invalid JSON → defaults with notice; next save overwrites', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const store = createSaveStore(storage);
    const r = store.load();
    expect(r.data).toEqual(defaultSave());
    expect(r.notice).toBe(NOTICE_CORRUPT);
    expect(store.save(r.data)).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(2);
    storage.setItem(SAVE_KEY, '"just a string"');
    expect(createSaveStore(storage).load().notice).toBe(NOTICE_CORRUPT);
  });

  it('fills missing fields with defaults and recomputes unlocks from completedOrders', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, completedOrders: 7 }));
    const { data, notice } = createSaveStore(storage).load();
    expect(notice).toBeNull();
    expect(data.settings).toEqual(defaultSave().settings);
    expect(data.unlockedApples).toEqual(unlockedApples(7));
    expect(data.unlockedApples).toEqual(expect.arrayContaining(['a094', 'a091']));
    expect(data.unlockedApples).toHaveLength(12);
    expect(data.unlockedRecipes).toHaveLength(5);
    expect(data.bestScores).toEqual({});
    expect(data.current).toBeNull();
    expect(data.actionSystemVersion).toBe('2.0');
  });

  it('drops unknown apple/recipe ids and invalid values', () => {
    const storage = new FakeStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        completedOrders: 1,
        unlockedApples: ['a048', 'a999', 'a091', 42],
        unlockedRecipes: ['fresh_juice', 'festival_pie'],
        bestScores: { fresh_juice: 2, festival_pie: 3, rabbit_apples: 7 },
        discoveredPairings: { 'a048:fresh_juice': { bestStars: 2, fit: 3 }, 'a999:fresh_juice': { bestStars: 1, fit: 1 } },
        settings: { sound: 'loud', reducedMotion: 'sometimes' },
        current: { orderId: 'o-0002', orderNumber: 2, recipeId: 'curry', appleId: 'a048', phase: 'cook' },
      }),
    );
    const { data } = createSaveStore(storage).load();
    expect(data.unlockedApples).not.toContain('a999');
    expect(data.unlockedApples).toContain('a091'); // known id saved as unlocked is preserved (union)
    expect(data.unlockedRecipes).toEqual(['fresh_juice']);
    expect(data.bestScores).toEqual({ fresh_juice: 2 });
    expect(Object.keys(data.discoveredPairings)).toEqual(['a048:fresh_juice']);
    expect(data.settings.sound).toBe(true);
    expect(data.settings.reducedMotion).toBe('system');
    expect(data.current).toBeNull();
  });

  it('future versions are not overwritten; runs in memory with a notice', () => {
    const storage = new FakeStorage();
    const future = JSON.stringify({ version: 3, completedOrders: 9, newThing: true });
    storage.setItem(SAVE_KEY, future);
    const store = createSaveStore(storage);
    const r = store.load();
    expect(r.notice).toBe(NOTICE_FUTURE);
    expect(r.persistent).toBe(false);
    expect(store.persistent).toBe(false);
    expect(r.data.completedOrders).toBe(9); // compatible progress readable for the session
    expect(store.save({ ...r.data, completedOrders: 10 })).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(future);
    expect(store.load().data.completedOrders).toBe(10); // in-memory session continues
  });

  it('storage throwing → memory fallback with notice', () => {
    const store = createSaveStore(new ThrowingStorage());
    expect(store.persistent).toBe(false);
    const r = store.load();
    expect(r.notice).toBe(NOTICE_NO_STORAGE);
    expect(r.persistent).toBe(false);
    expect(store.save({ ...r.data, completedOrders: 2 })).toBe(false);
    expect(store.load().data.completedOrders).toBe(2);
    const none = createSaveStore(null);
    expect(none.load().notice).toBe(NOTICE_NO_STORAGE);
  });

  it('write failure mid-session switches to memory', () => {
    const store = createSaveStore(new QuotaStorage());
    expect(store.persistent).toBe(true);
    expect(store.save(defaultSave())).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.load().notice).toBe(NOTICE_NO_STORAGE);
  });

  it('reset keeps settings and writes defaults', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    store.save({ ...defaultSave(), completedOrders: 5 });
    const fresh = store.reset({ sound: false, assistance: true, altControls: false, reducedMotion: 'off' });
    expect(fresh.completedOrders).toBe(0);
    expect(fresh.settings.sound).toBe(false);
    expect(createSaveStore(storage).load().data.completedOrders).toBe(0);
  });
});

describe('legacy v1 migration', () => {
  it('preserves progress, resets the current dish to its first v2 action with a notice', () => {
    const storage = new FakeStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        completedOrders: 8,
        unlockedApples: ['a048', 'a081', 'a023', 'a066', 'a006', 'a094', 'a091', 'aXXX'],
        bestScores: { hirosaki_pie: 3, fresh_juice: 2 },
        settings: { sound: false },
        current: { orderId: 'legacy-9', recipeId: 'hirosaki_pie', appleId: 'a094', minigameStep: 2 },
      }),
    );
    const { data, notice } = createSaveStore(storage).load();
    expect(notice).toBe(NOTICE_MIGRATED);
    expect(data.version).toBe(2);
    expect(data.completedOrders).toBe(8);
    expect(data.unlockedApples).not.toContain('aXXX');
    expect(data.unlockedApples).toContain('a091');
    expect(data.unlockedRecipes).toHaveLength(5); // recomputed from 8 completed orders
    expect(data.bestScores).toEqual({ hirosaki_pie: 3, fresh_juice: 2 });
    expect(data.settings.sound).toBe(false);
    expect(data.current).toMatchObject({
      orderId: 'legacy-9',
      orderNumber: 9,
      recipeId: 'hirosaki_pie',
      appleId: 'a094',
      phase: 'cook',
      stepIndex: 0, // NOT the legacy minigameStep 2
      stepResults: [],
      variantId: 'hirosaki_pie_game_v2',
    });
    // The restored game resumes at the first pie action with a fresh count-in.
    const state = initialStateFromSave(data, notice);
    expect(state.phase).toBe('cook');
    expect(state.cook).toMatchObject({ stepIndex: 0, sub: 'instruction', stepResults: [] });
    expect(state.order.recipeId).toBe('hirosaki_pie');
    expect(state.appleId).toBe('a094');
    expect(state.notice).toBe(NOTICE_MIGRATED);
  });

  it('migrates a v1 save without a current order and without a notice', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, completedOrders: 2, unlockedApples: [], bestScores: {} }));
    const { data, notice } = createSaveStore(storage).load();
    expect(notice).toBeNull();
    expect(data.unlockedRecipes).toEqual(['fresh_juice', 'rabbit_apples']);
    expect(data.current).toBeNull();
  });

  it('a v2 save whose current variant differs restarts the dish', () => {
    const storage = new FakeStorage();
    const base = defaultSave();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...base,
        current: {
          orderId: 'o-0001', orderNumber: 1, recipeId: 'fresh_juice', appleId: 'a048', phase: 'cook',
          variantId: 'fresh_juice_game_v1', stepIndex: 1, stepResults: [{ stepId: 'fresh_juice_01', grade: 'Good' }], attemptId: 'x',
        },
      }),
    );
    const { data, notice } = createSaveStore(storage).load();
    expect(notice).toBe(NOTICE_MIGRATED);
    expect(data.current).toMatchObject({ stepIndex: 0, stepResults: [], variantId: 'fresh_juice_game_v2' });
  });
});

// ---------------------------------------------------------------------------
function play(state: GameState, actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}
function cookAll(state: GameState, offset = 0): GameState {
  const steps = recipe(state.mode === 'practice' ? state.practiceRecipeId! : state.order.recipeId).steps;
  let s = state;
  for (const step of steps) {
    s = play(s, [{ type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: step.timing.target_ms + offset }, { type: 'FEEDBACK_DONE' }]);
  }
  return s;
}

describe('idempotent completion through save/reload', () => {
  it('reloading on the result / delivery screen never double counts or re-grants rewards', () => {
    const storage = new FakeStorage();
    let store = createSaveStore(storage);
    // Fast-forward to 2 completed orders.
    let state = initialStateFromSave({ ...defaultSave(), completedOrders: 2, completedOrderIds: ['o-0001', 'o-0002'], seenUnlockRewards: ['recipe:rabbit_apples'] });
    state = play(state, [{ type: 'ACCEPT_ORDER' }, { type: 'PREVIEW_APPLE', appleId: 'a048' }, { type: 'CONFIRM_APPLE' }]);
    state = cookAll(state);
    expect(state.phase).toBe('serve');
    state = gameReducer(state, { type: 'SERVE_DONE' });
    expect(state.phase).toBe('result');
    expect(state.progress.completedOrders).toBe(3);
    expect(state.delivery?.apples).toEqual(['a094']);
    store.save(toSaveData(state));

    // Second SERVE_DONE / COMPLETE_ORDER is a no-op.
    expect(gameReducer(state, { type: 'SERVE_DONE' })).toBe(state);
    expect(gameReducer(state, { type: 'COMPLETE_ORDER' })).toBe(state);

    // Reload on result screen (twice).
    for (let i = 0; i < 2; i++) {
      store = createSaveStore(storage);
      const loaded = store.load();
      const re = initialStateFromSave(loaded.data, loaded.notice);
      expect(re.phase).toBe('result');
      expect(re.progress.completedOrders).toBe(3);
      expect(re.result).toEqual(state.result);
      expect(re.delivery?.apples).toEqual(['a094']);
      store.save(toSaveData(re));
    }

    // Go to delivery, reload there, finish delivery, reload: reward not shown again.
    state = gameReducer(initialStateFromSave(store.load().data), { type: 'RESULT_DONE' });
    expect(state.phase).toBe('delivery');
    store.save(toSaveData(state));
    state = initialStateFromSave(createSaveStore(storage).load().data);
    expect(state.phase).toBe('delivery');
    state = gameReducer(state, { type: 'DELIVERY_DONE' });
    expect(state.phase).toBe('shop');
    expect(state.order.orderNumber).toBe(4);
    expect(state.progress.seenUnlockRewards).toContain('apple:a094');
    store.save(toSaveData(state));
    const after = initialStateFromSave(createSaveStore(storage).load().data);
    expect(after.phase).toBe('shop');
    expect(after.progress.completedOrders).toBe(3);
    expect(after.delivery).toBeNull();
  });

  it('never persists live gesture data', () => {
    let state = initialStateFromSave(defaultSave());
    state = play(state, [{ type: 'ACCEPT_ORDER' }, { type: 'PREVIEW_APPLE', appleId: 'a048' }, { type: 'CONFIRM_APPLE' }, { type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }]);
    const json = JSON.stringify(toSaveData(state));
    expect(json).not.toMatch(/"x"|"y"|pointer|sample/i);
  });
});
