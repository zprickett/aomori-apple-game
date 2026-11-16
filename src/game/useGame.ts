import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createMemoryStore, createSaveStore, defaultSave, earliestRankUps, gameReducer, initialStateFromSave, orderIdFor, rewardKeys, shouldPersist, toSaveData, unlocksEarnedAt,
  type GameAction, type GameState, type SaveStore,
} from '../core/index.ts';
import { APPLE_ORDER, APPLES_FOR_GOLDEN_CHEF, GOLDEN_RECIPES_FOR_HEAD_COOK, RECIPE_ORDER, fitStars, type SaveData } from '../core/index.ts';
import { setSoundEnabled, suspendAudio, unlockAudio } from './audio.ts';

interface Boot { store: SaveStore; state: GameState; persistent: boolean }

/**
 * DEV only: `?skip=N` starts a fresh save with N orders done (all unlocks up to N already seen,
 * every rank challenge passed as early as possible). Add `&ready` to also meet every skill goal
 * (3 stars on every recipe, 30 apples cooked, 5 Golden Recipes since Cook), so the next rank-up
 * happens as soon as its order count is reached. The parameters are then removed so reloads keep
 * playing normally. Never active in production builds.
 */
function saveAfter(n: number, ready = false) {
  const s = defaultSave();
  s.completedOrders = n;
  s.completedOrderIds = Array.from({ length: n }, (_, i) => orderIdFor(i + 1));
  s.rankUps = earliestRankUps(n);
  for (let k = 1; k <= n; k++) {
    const i = s.rankUps.indexOf(k);
    const rank = i < 0 ? null : i + 2;
    s.seenUnlockRewards.push(...rewardKeys({ ...unlocksEarnedAt(k, s.rankUps), rank }));
  }
  if (ready) meetRankGoals(s);
  return s;
}

/** Fill in stars, cooked apples and Golden Recipes so every rank skill goal is met. */
function meetRankGoals(s: SaveData) {
  for (const id of RECIPE_ORDER) s.bestScores[id] = 3;
  for (const a of APPLE_ORDER.slice(0, APPLES_FOR_GOLDEN_CHEF)) s.discoveredPairings[`${a}:fresh_juice`] = { bestStars: 3, fit: fitStars(a, 'fresh_juice') };
  // Golden Recipes on the latest orders (they count once they come after reaching Cook).
  const golden = Array.from({ length: Math.min(GOLDEN_RECIPES_FOR_HEAD_COOK, s.completedOrders) }, (_, i) => s.completedOrders - i).reverse();
  s.history = golden.map((orderNumber) => ({
    orderId: orderIdFor(orderNumber), orderNumber, recipeId: 'fresh_juice', appleId: APPLE_ORDER[0],
    points: 200, golden: true, grades: ['Perfect'], fit: 3, stars: 3, newBest: false,
  }));
}

function devSkip(store: SaveStore) {
  if (!import.meta.env.DEV || typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const n = Number(params.get('skip'));
  if (!params.has('skip') || !Number.isInteger(n) || n < 0 || n > 200) return;
  store.save(saveAfter(n, params.has('ready')));
  params.delete('skip');
  params.delete('ready');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}

/** DEV review "Play": `?play=<recipeId>&apple=<appleId>` → in-memory session with everything unlocked. */
export function devPlayParams(): { recipeId: string; appleId: string | null } | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.search);
  const recipeId = p.get('play');
  return recipeId ? { recipeId, appleId: p.get('apple') } : null;
}

function bootDevPlay(play: { recipeId: string; appleId: string | null }): Boot {
  const store = createMemoryStore();
  let state = initialStateFromSave(saveAfter(120));
  state = gameReducer(state, { type: 'START_PRACTICE', recipeId: play.recipeId });
  if (play.appleId) {
    state = gameReducer(state, { type: 'PREVIEW_APPLE', appleId: play.appleId });
    state = gameReducer(state, { type: 'CONFIRM_APPLE' });
  }
  return { store, state, persistent: true };
}

function boot(saveKey?: string): Boot {
  const play = devPlayParams();
  if (play) return bootDevPlay(play);
  const store = createSaveStore(undefined, saveKey);
  devSkip(store);
  const { data, notice, persistent } = store.load();
  return { store, state: initialStateFromSave(data, notice), persistent };
}

/** Reducer + versioned local persistence + page-visibility pause. */
export function useGame(saveKey?: string) {
  const bootRef = useRef<Boot | null>(null);
  if (!bootRef.current) bootRef.current = boot(saveKey);
  const { store } = bootRef.current;
  const [persistent, setPersistent] = useState(bootRef.current.persistent);

  const reducer = useCallback((s: GameState, a: GameAction) => {
    const next = gameReducer(s, a);
    if (shouldPersist(s, next)) {
      const ok = store.save(toSaveData(next));
      if (!ok && store.persistent === false) queueMicrotask(() => setPersistent(false));
    }
    return next;
  }, [store]);

  const [state, dispatch] = useReducer(reducer, bootRef.current.state);

  useEffect(() => { setSoundEnabled(state.settings.sound); }, [state.settings.sound]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { dispatch({ type: 'VISIBILITY_HIDDEN' }); suspendAudio(); }
      else { dispatch({ type: 'RESUME' }); unlockAudio(); }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onVis); };
  }, []);

  const reducedMotion = useReducedMotion(state.settings.reducedMotion);
  return useMemo(() => ({ state, dispatch, persistent: persistent && (store.persistent || devPlayParams() !== null), reducedMotion }), [state, persistent, store, reducedMotion]);
}

function useReducedMotion(setting: 'system' | 'on' | 'off'): boolean {
  const [sys, setSys] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSys(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return setting === 'on' ? true : setting === 'off' ? false : sys;
}
