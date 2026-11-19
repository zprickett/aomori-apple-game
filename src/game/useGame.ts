import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createMemoryStore, createSaveStore, defaultSave, LADDER, gameReducer, ojiichanVisitAt, rankUpsOf, typicalLadder, typicalPoints, initialStateFromSave, orderIdFor, rewardKeys, shouldPersist, toSaveData, unlocksEarnedAt,
  type GameAction, type GameState, type SaveStore,
} from '../core/index.ts';
import { setSoundEnabled, suspendAudio, unlockAudio } from './audio.ts';

interface Boot { store: SaveStore; state: GameState; persistent: boolean }

/**
 * DEV only: `?skip=N` starts a fresh save with N orders done, on a typical 10-year-old's ladder
 * (TYPICAL_LADDER and typicalPoints), with every unlock up to N already seen. Add `&ready` to put
 * the points just below the next ladder step, so the next dish reaches it. The parameters are then
 * removed so reloads keep playing normally. Never active in production builds.
 */
function saveAfter(n: number, ready = false) {
  const s = defaultSave();
  s.completedOrders = n;
  s.completedOrderIds = Array.from({ length: n }, (_, i) => orderIdFor(i + 1));
  s.ladder = typicalLadder(n);
  s.totalPoints = typicalPoints(n);
  const ups = rankUpsOf(s.ladder);
  for (let k = 1; k <= n; k++) {
    const i = ups.indexOf(k);
    const steps = s.ladder.flatMap((at, j) => (at === k && LADDER[j].star > 0 ? [j] : []));
    s.seenUnlockRewards.push(...rewardKeys({ ...unlocksEarnedAt(k, s.ladder), rank: i < 0 ? null : i + 2, steps }));
  }
  const oj = ojiichanVisitAt(s.seed, s.ladder);
  if (oj !== null && oj <= n) s.seenUnlockRewards.push('finale');
  if (ready && s.ladder.length < LADDER.length) s.totalPoints = LADDER[s.ladder.length].points - 1;
  return s;
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

  // No in-game motion setting for now: follow the device's "reduce motion" preference only.
  // (settings.reducedMotion is still saved for when an option comes back.)
  const reducedMotion = useReducedMotion('system');
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
