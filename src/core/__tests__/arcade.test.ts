import { describe, expect, it } from 'vitest';
import { recipe } from '../content.ts';
import {
  ARCADE_WINDOWS, FOLLOW_LEAD_MS, SliceRecognizer, nextBeatTarget, beatCount, beatExpiresAt, beatTargets, combineBeats, gradeBeat,
} from '../arcade.ts';
import { initialState, gameReducer } from '../gameReducer.ts';

const step = (rid: string, i: number) => recipe(rid).steps[i];
const S = (x: number, y: number, t: number, pointerId = 1) => ({ x, y, t, pointerId });

describe('beat schedule', () => {
  it('cuts are 3 slices, rabbit ears 2, taps and circles 1', () => {
    expect(beatCount(step('hirosaki_pie', 0))).toBe(3);
    expect(beatCount(step('rabbit_apples', 0))).toBe(3);
    expect(beatCount(step('rabbit_apples', 1))).toBe(2);
    expect(beatCount(step('fresh_juice', 0))).toBe(1);
    expect(beatCount(step('apple_jam', 2))).toBe(1);
  });
  it('is deterministic per attempt but varies between attempts', () => {
    const s = step('apple_jam', 0);
    expect(beatTargets(s, 'a1')).toEqual(beatTargets(s, 'a1'));
    const all = new Set(['a1', 'a2', 'a3', 'a4', 'a5'].map((a) => beatTargets(s, a).join(',')));
    expect(all.size).toBeGreaterThan(1);
  });
  it('keeps targets inside the authored ranges and in order', () => {
    for (let k = 0; k < 50; k++) {
      const t = beatTargets(step('apple_jam', 0), `x${k}`);
      expect(t[0]).toBeGreaterThanOrEqual(820); expect(t[0]).toBeLessThanOrEqual(1020);
      for (let i = 1; i < t.length; i++) { const g = t[i] - t[i - 1]; expect(g).toBeGreaterThanOrEqual(480); expect(g).toBeLessThanOrEqual(640); }
      const c = beatTargets(step('apple_jam', 2), `x${k}`)[0];
      expect(c).toBeGreaterThanOrEqual(2500); expect(c).toBeLessThanOrEqual(2800);
    }
  });
});

describe('beat grading', () => {
  it('uses tight inclusive windows, symmetric early/late', () => {
    const w = ARCADE_WINDOWS.swipe;
    expect(gradeBeat('swipe', 1000, 1000 + w.perfect).grade).toBe('Perfect');
    expect(gradeBeat('swipe', 1000, 1000 - w.perfect - 1).grade).toBe('Good');
    expect(gradeBeat('swipe', 1000, 1000 + w.good + 1).grade).toBe('OK');
    expect(gradeBeat('swipe', 1000, 1000 - w.ok - 1).grade).toBe('Miss');
    expect(gradeBeat('swipe', 1000, null)).toEqual({ grade: 'Miss', points: 0, error_ms: null });
  });
  it('assistance widens windows', () => {
    const w = ARCADE_WINDOWS.tap;
    expect(gradeBeat('tap', 1000, 1000 + w.ok + 50).grade).toBe('Miss');
    expect(gradeBeat('tap', 1000, 1000 + w.ok + 50, 1.5).grade).not.toBe('Miss');
    expect(beatExpiresAt('tap', 1000, 1.5)).toBeGreaterThan(beatExpiresAt('tap', 1000));
  });
  it('combines beats into one step grade', () => {
    const P = gradeBeat('swipe', 0, 0), G = gradeBeat('swipe', 0, 120), O = gradeBeat('swipe', 0, 250), M = gradeBeat('swipe', 0, null);
    expect(combineBeats([P, P, P]).grade).toBe('Perfect');
    expect(combineBeats([P, P, G]).grade).toBe('Perfect'); // two Perfect slices and one Good still count
    expect(combineBeats([P, G, G]).grade).toBe('Good');
    expect(combineBeats([P, P, M]).grade).toBe('Good'); // one miss caps Perfect
    expect(combineBeats([O, O, O]).grade).toBe('OK');
    expect(combineBeats([P, M, M]).grade).toBe('Miss'); // most beats missed
    expect(combineBeats([M]).grade).toBe('Miss');
    expect(combineBeats([P, G]).error_ms).toBe(60);
    expect([ARCADE_WINDOWS.tap.perfect, ARCADE_WINDOWS.swipe.perfect]).toEqual([90, 100]);
  });
});

describe('SliceRecognizer', () => {
  const fruit = { cx: 0.5, cy: 0.5, r: 0.1 };
  it('a fast stroke through the fruit cuts once, timed at closest approach', () => {
    const r = new SliceRecognizer(fruit);
    r.down(S(0.2, 0.5, 0)); r.move(S(0.4, 0.5, 40)); r.move(S(0.6, 0.5, 80)); r.up(S(0.8, 0.5, 120));
    const cuts = r.take();
    expect(cuts).toHaveLength(1);
    expect(cuts[0].t).toBeCloseTo(60, 5);
  });
  it('works in any direction (diagonal, reversed)', () => {
    const r = new SliceRecognizer(fruit);
    r.down(S(0.75, 0.75, 0)); r.move(S(0.25, 0.25, 60)); r.up(S(0.2, 0.2, 70));
    expect(r.take()).toHaveLength(1);
  });
  it('a zig-zag stroke slices again only after leaving the fruit', () => {
    const r = new SliceRecognizer(fruit);
    r.down(S(0.2, 0.5, 0)); r.move(S(0.8, 0.5, 60)); r.move(S(0.2, 0.52, 120)); r.move(S(0.8, 0.48, 180));
    expect(r.take()).toHaveLength(3);
  });
  it('slow drags, taps, misses beside the fruit and resting inside do not cut', () => {
    const slow = new SliceRecognizer(fruit);
    slow.down(S(0.3, 0.5, 0)); slow.move(S(0.5, 0.5, 900)); slow.move(S(0.7, 0.5, 1800));
    expect(slow.take()).toHaveLength(0);
    expect(slow.feedback).toBe('too_slow');
    const tap = new SliceRecognizer(fruit);
    tap.down(S(0.5, 0.5, 0)); tap.up(S(0.5, 0.5, 50));
    expect(tap.take()).toHaveLength(0);
    const beside = new SliceRecognizer(fruit);
    beside.down(S(0.2, 0.75, 0)); beside.move(S(0.8, 0.75, 60));
    expect(beside.take()).toHaveLength(0);
    const inside = new SliceRecognizer(fruit);
    inside.down(S(0.5, 0.5, 0)); inside.move(S(0.53, 0.5, 10)); inside.move(S(0.47, 0.5, 20));
    expect(inside.take()).toHaveLength(0);
  });
  it('a slash that starts on the apple still cuts', () => {
    const r = new SliceRecognizer(fruit);
    r.down(S(0.52, 0.5, 0)); r.move(S(0.6, 0.5, 30)); r.move(S(0.75, 0.5, 60)); r.up(S(0.8, 0.5, 70));
    expect(r.take()).toHaveLength(1);
  });
  it('follow-up beats are scheduled just after the previous one resolves', () => {
    const st = step('apple_jam', 0);
    for (let k = 0; k < 20; k++) {
      const t = nextBeatTarget(st, `a${k}`, 1, 1000);
      expect(t - 1000).toBeGreaterThanOrEqual(FOLLOW_LEAD_MS.swipe + 60);
      expect(t - 1000).toBeLessThanOrEqual(FOLLOW_LEAD_MS.swipe + 200);
    }
  });
  it('ignores a second pointer and discards on cancel', () => {
    const r = new SliceRecognizer(fruit);
    r.down(S(0.2, 0.5, 0, 1));
    r.down(S(0.2, 0.3, 0, 2)); r.move(S(0.8, 0.5, 40, 2));
    expect(r.take()).toHaveLength(0);
    r.cancel(); r.move(S(0.8, 0.5, 60, 1));
    expect(r.take()).toHaveLength(0);
  });
});

describe('reducer accepts arcade-graded submissions', () => {
  it('uses the pre-combined grade', () => {
    let s = initialState(1);
    for (const a of [{ type: 'ACCEPT_ORDER' }, { type: 'PREVIEW_APPLE', appleId: 'a048' }, { type: 'CONFIRM_APPLE' }, { type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }] as const)
      s = gameReducer(s, a as never);
    s = gameReducer(s, { type: 'SUBMIT', eventMs: null, graded: { grade: 'Good', error_ms: 120 } });
    expect(s.cook?.sub).toBe('feedback');
    expect(s.cook?.lastResult?.grade).toBe('Good');
    expect(s.cook?.lastResult?.error_ms).toBe(120);
  });
});
