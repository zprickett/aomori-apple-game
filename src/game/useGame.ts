import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createSaveStore, gameReducer, initialStateFromSave, shouldPersist, toSaveData,
  type GameAction, type GameState, type SaveStore,
} from '../core/index.ts';
import { setSoundEnabled, suspendAudio, unlockAudio } from './audio.ts';

interface Boot { store: SaveStore; state: GameState; persistent: boolean }

function boot(): Boot {
  const store = createSaveStore();
  const { data, notice, persistent } = store.load();
  return { store, state: initialStateFromSave(data, notice), persistent };
}

/** Reducer + versioned local persistence + page-visibility pause. */
export function useGame() {
  const bootRef = useRef<Boot | null>(null);
  if (!bootRef.current) bootRef.current = boot();
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
  return useMemo(() => ({ state, dispatch, persistent: persistent && store.persistent, reducedMotion }), [state, persistent, store, reducedMotion]);
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
