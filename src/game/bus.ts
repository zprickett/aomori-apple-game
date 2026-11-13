/**
 * Tiny scene ↔ UI bridge. The reducer state drives both sides; this carries only
 * things that are naturally imperative: projected screen anchors, live pointer
 * position for the 3D tool, and one-shot animation cues. No per-frame React state.
 */
import { useSyncExternalStore } from 'react';

export interface Anchor { x: number; y: number; r: number }
export type AnchorMap = Record<string, Anchor>;

type Listener = () => void;

class Store<T> {
  private v: T;
  private ls = new Set<Listener>();
  constructor(v: T) { this.v = v; }
  get = () => this.v;
  set(v: T) { this.v = v; this.ls.forEach((l) => l()); }
  subscribe = (l: Listener) => { this.ls.add(l); return () => { this.ls.delete(l); }; };
}

export const anchorStore = new Store<{ anchors: AnchorMap; w: number; h: number }>({ anchors: {}, w: 0, h: 0 });

export function useAnchors() {
  return useSyncExternalStore(anchorStore.subscribe, anchorStore.get, anchorStore.get);
}

export function publishAnchors(anchors: AnchorMap, w: number, h: number) {
  const prev = anchorStore.get();
  let changed = prev.w !== w || prev.h !== h || Object.keys(prev.anchors).length !== Object.keys(anchors).length;
  if (!changed) {
    for (const k of Object.keys(anchors)) {
      const a = anchors[k], b = prev.anchors[k];
      if (!b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.r - b.r) > 0.5) { changed = true; break; }
    }
  }
  if (changed) anchorStore.set({ anchors, w, h });
}

/** Live pointer in CSS px relative to the game frame (null when no active stroke). */
export const pointer = { active: false, x: 0, y: 0, t: 0 };

/** Circle progress (0..1) and direction for the spoon / ring visuals. */
export const mixing = { progress: 0, angle: 0 };

/** Active step clock shared with the 3D diegetic cues (oven glow, syrup colour…). */
export const stepClock = { running: false, startPerf: 0, targetMs: 3500, durationMs: 6000 };

export type Cue =
  | { type: 'chef'; anim: 'wave' | 'cheer' | 'nod' | 'tilt' | 'serve' | 'clap' }
  | { type: 'customer'; anim: 'happy' | 'joy' | 'think' }
  | { type: 'action'; event: string; grade: string }
  | { type: 'wobble' }
  | { type: 'sparkle'; x?: number; y?: number };

const cueListeners = new Set<(c: Cue) => void>();
export function emitCue(c: Cue) { cueListeners.forEach((l) => l(c)); }
export function onCue(l: (c: Cue) => void) { cueListeners.add(l); return () => { cueListeners.delete(l); }; }
