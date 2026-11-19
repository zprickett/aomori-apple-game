import { describe, expect, it } from 'vitest';
import {
  CircleRecognizer,
  FREEFORM_CIRCLE,
  SwipeRecognizer,
  TapRecognizer,
  createRecognizer,
  sampleFromPointer,
  type PointerSample,
  type Recognizer,
} from '../recognizers.ts';

const S = (x: number, y: number, t: number, pointerId = 1): PointerSample => ({ x, y, t, pointerId });

/** Feed a stroke: down on first, move on middle, up on last (unless keepDown). */
function stroke(r: Recognizer, pts: PointerSample[], keepDown = false) {
  r.down(pts[0]);
  for (const p of pts.slice(1, keepDown ? undefined : -1)) r.move(p);
  if (!keepDown) r.up(pts[pts.length - 1]);
}

function line(x0: number, y0: number, x1: number, y1: number, t0: number, t1: number, n: number, id = 1) {
  return Array.from({ length: n + 1 }, (_, i) => S(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, t0 + ((t1 - t0) * i) / n, id));
}

// ---------------------------------------------------------------------------
describe('TapRecognizer', () => {
  const mk = () => new TapRecognizer({ x: 0.5, y: 0.5, radius: 0.1 });

  it('accepts down inside the target with eventMs = down time', () => {
    const r = mk();
    r.down(S(0.55, 0.52, 3412));
    expect(r.result).toEqual({ eventMs: 3412, kind: 'tap', detail: { x: 0.55, y: 0.52 } });
    expect(r.progress).toBe(1);
  });

  it('down outside sets missed_target and does not submit; later inside tap submits', () => {
    const r = mk();
    r.down(S(0.8, 0.8, 1000));
    expect(r.result).toBeNull();
    expect(r.feedback).toBe('missed_target');
    r.up(S(0.8, 0.8, 1050));
    r.down(S(0.5, 0.5, 2000));
    expect(r.result?.eventMs).toBe(2000);
    expect(r.feedback).toBeNull();
  });

  it('ignores a second pointer while one is active', () => {
    const r = mk();
    r.down(S(0.9, 0.9, 100, 1)); // miss, pointer 1 still down
    r.down(S(0.5, 0.5, 150, 2)); // second finger on target → ignored
    expect(r.result).toBeNull();
    r.up(S(0.9, 0.9, 200, 2)); // other pointer's up ignored
    r.down(S(0.5, 0.5, 250, 2)); // still ignored (pointer 1 active)
    expect(r.result).toBeNull();
    r.up(S(0.9, 0.9, 300, 1));
    r.down(S(0.5, 0.5, 400, 2));
    expect(r.result?.eventMs).toBe(400);
  });

  it('rapid tap spam submits exactly once (first valid tap)', () => {
    const r = mk();
    for (let i = 0; i < 50; i++) {
      r.down(S(0.5, 0.5, 1000 + i * 30));
      r.up(S(0.5, 0.5, 1010 + i * 30));
    }
    expect(r.result?.eventMs).toBe(1000);
  });

  it('never needs hold or drag; reset allows a new submission', () => {
    const r = mk();
    r.down(S(0.5, 0.5, 10));
    expect(r.result).not.toBeNull();
    r.reset();
    expect(r.result).toBeNull();
    expect(r.progress).toBe(0);
    r.down(S(0.5, 0.5, 20));
    expect(r.result?.eventMs).toBe(20);
  });
});

// ---------------------------------------------------------------------------
describe('SwipeRecognizer', () => {
  // Horizontal guide, checkpoint is the vertical line x = 0.5 through (0.5, 0.5).
  const mk = () => new SwipeRecognizer({ x1: 0.2, y1: 0.5, x2: 0.8, y2: 0.5, crossX: 0.5, crossY: 0.5 });

  it('submits with interpolated time at the first checkpoint crossing (not pointer-up)', () => {
    const r = mk();
    // x: 0.31, 0.35, …, 0.47 (t=1080), 0.51 (t=1100) → crossing at f=0.75 → t=1095
    const pts = Array.from({ length: 11 }, (_, i) => S(0.31 + 0.04 * i, 0.5, 1000 + 20 * i));
    r.down(pts[0]);
    for (const p of pts.slice(1, 6)) r.move(p);
    expect(r.result).not.toBeNull();
    expect(r.result!.eventMs).toBeCloseTo(1095, 6);
    expect(r.result!.kind).toBe('swipe');
    // Later samples / up don't change it.
    for (const p of pts.slice(6)) r.move(p);
    r.up(S(0.9, 0.5, 5000));
    expect(r.result!.eventMs).toBeCloseTo(1095, 6);
  });

  it('crossing before 0.12 length submits later in the stroke but keeps the crossing time', () => {
    const r = mk();
    // x = 0.47 + 0.025k every 20 ms from t=500; crossing between k=1 (0.495) and k=2 (0.52) → t=524.
    const pts = line(0.47, 0.5, 0.67, 0.5, 500, 660, 8);
    r.down(pts[0]);
    for (const p of pts.slice(1, 5)) r.move(p); // length 0.10 after k=4
    expect(r.result).toBeNull();
    r.move(pts[5]); // length 0.125 → submit
    expect(r.result?.eventMs).toBeCloseTo(524, 6);
  });

  it('too short: no submission, feedback too_short', () => {
    const r = mk();
    stroke(r, line(0.46, 0.5, 0.54, 0.5, 0, 80, 4));
    expect(r.result).toBeNull();
    expect(r.feedback).toBe('too_short');
  });

  it('short tap is not a swipe', () => {
    const r = mk();
    r.down(S(0.5, 0.5, 100));
    r.up(S(0.5, 0.5, 130));
    expect(r.result).toBeNull();
    expect(r.feedback).toBe('too_short');
  });

  it('too slow (> 1000 ms from down) is rejected', () => {
    const r = mk();
    // crossing happens at ~t=1200 after down at 0
    stroke(r, line(0.26, 0.5, 0.66, 0.5, 0, 2000, 40));
    expect(r.result).toBeNull();
    expect(r.feedback).toBe('too_slow');
  });

  it('crossing more than 0.08 from the point is rejected (off_guide); 0.07 is accepted', () => {
    const off = mk();
    stroke(off, line(0.3, 0.59, 0.7, 0.59, 0, 200, 10));
    expect(off.result).toBeNull();
    expect(off.feedback).toBe('off_guide');
    const ok = mk();
    stroke(ok, line(0.3, 0.57, 0.7, 0.57, 0, 200, 10));
    expect(ok.result).not.toBeNull();
    expect((ok.result!.detail as { offset: number }).offset).toBeCloseTo(0.07, 6);
  });

  it('direction more than 35° from the guide is rejected; 30° accepted', () => {
    const at = (deg: number) => {
      const r = mk();
      const a = (deg * Math.PI) / 180;
      const L = 0.3;
      stroke(r, line(0.5 - (Math.cos(a) * L) / 2, 0.5 - (Math.sin(a) * L) / 2, 0.5 + (Math.cos(a) * L) / 2, 0.5 + (Math.sin(a) * L) / 2, 0, 200, 10));
      return r;
    };
    const bad = at(45);
    expect(bad.result).toBeNull();
    expect(bad.feedback).toBe('wrong_angle');
    const good = at(30);
    expect(good.result).not.toBeNull();
    expect((good.result!.detail as { angleDeg: number }).angleDeg).toBeCloseTo(30, 4);
  });

  it('reverse direction is accepted', () => {
    const r = mk();
    stroke(r, line(0.7, 0.5, 0.3, 0.5, 2000, 2200, 10));
    expect(r.result).not.toBeNull();
    expect(r.result!.eventMs).toBeCloseTo(2100, 6);
    expect((r.result!.detail as { direction: number }).direction).toBe(-1);
  });

  it('ignores other pointers and submits once; reset re-arms', () => {
    const r = mk();
    r.down(S(0.3, 0.5, 0, 1));
    r.down(S(0.3, 0.3, 5, 2));
    r.move(S(0.7, 0.3, 50, 2)); // pointer 2 crossing ignored
    expect(r.result).toBeNull();
    for (const p of line(0.3, 0.5, 0.7, 0.5, 0, 200, 10, 1).slice(1)) r.move(p);
    const first = r.result!.eventMs;
    r.up(S(0.7, 0.5, 210, 1));
    stroke(r, line(0.3, 0.5, 0.7, 0.5, 1000, 1200, 10));
    expect(r.result!.eventMs).toBe(first);
    r.reset();
    expect(r.result).toBeNull();
    stroke(r, line(0.3, 0.5, 0.7, 0.5, 1000, 1200, 10));
    expect(r.result!.eventMs).toBeCloseTo(1100, 6);
  });

  it('a dead stroke stays dead until lifted; the next stroke can succeed', () => {
    const r = mk();
    stroke(r, line(0.3, 0.65, 0.7, 0.65, 0, 200, 10), true); // off guide, still down
    expect(r.feedback).toBe('off_guide');
    r.move(S(0.3, 0.5, 250));
    r.move(S(0.7, 0.5, 300)); // same stroke: still invalid
    expect(r.result).toBeNull();
    r.up(S(0.7, 0.5, 310));
    stroke(r, line(0.3, 0.5, 0.7, 0.5, 400, 600, 10));
    expect(r.result!.eventMs).toBeCloseTo(500, 6);
  });

  it('cancel discards the unfinished stroke', () => {
    const r = mk();
    r.down(S(0.3, 0.5, 0));
    r.move(S(0.45, 0.5, 50));
    r.cancel();
    r.move(S(0.7, 0.5, 100)); // no active pointer → ignored
    expect(r.result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
const CX = 0.5;
const CY = 0.5;
/** Samples on a circle of radius rr: angle(t) = a0 + w·(t − t0) (w in rad/ms). */
function arc(a0: number, w: number, t0: number, t1: number, dt: number, rr = 0.2, id = 1) {
  const out: PointerSample[] = [];
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const a = a0 + w * (t - t0);
    out.push(S(CX + rr * Math.cos(a), CY + rr * Math.sin(a), t, id));
  }
  return out;
}
const TWO_TURNS_PER_2S = (4 * Math.PI) / 2000; // rad/ms

describe('CircleRecognizer', () => {
  const mk = () => new CircleRecognizer({ cx: CX, cy: CY });

  it('completes after two net turns with interpolated completion time', () => {
    const r = mk();
    // Start t=100, 70 ms samples; 4π is reached at t=2100 between samples.
    const pts = arc(0.1, TWO_TURNS_PER_2S, 100, 2600, 70);
    r.down(pts[0]);
    for (const p of pts.slice(1)) {
      r.move(p);
      if (r.result) break;
    }
    expect(r.result).not.toBeNull();
    expect(r.result!.eventMs).toBeCloseTo(2100, 6);
    expect(r.progress).toBe(1);
    expect((r.result!.detail as { direction: number }).direction).toBe(1);
  });

  it('handles angle wraparound across ±π (anticlockwise, starting near π)', () => {
    const r = mk();
    const pts = arc(Math.PI - 0.05, -TWO_TURNS_PER_2S, 0, 3000, 50);
    stroke(r, pts, true);
    expect(r.result?.eventMs).toBeCloseTo(2000, 6);
    expect((r.result!.detail as { direction: number }).direction).toBe(-1);
  });

  it('progress is net-turn fraction and backtracking subtracts', () => {
    const r = mk();
    const fwd = arc(0, TWO_TURNS_PER_2S, 0, 1500, 50); // 1.5 turns
    stroke(r, fwd, true);
    expect(r.progress).toBeCloseTo(0.75, 2);
    const back = arc(3 * Math.PI, -TWO_TURNS_PER_2S, 1550, 2550, 50); // back 1 turn
    for (const p of back) r.move(p);
    expect(r.progress).toBeCloseTo(0.25, 1);
    expect(r.result).toBeNull();
  });

  it('cannot farm progress by wiggling back and forth', () => {
    const r = mk();
    r.down(S(CX + 0.2, CY, 0));
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 40;
      const a = i % 2 === 0 ? 0.4 : 0;
      r.move(S(CX + 0.2 * Math.cos(a), CY + 0.2 * Math.sin(a), t));
    }
    expect(r.result).toBeNull();
    expect(r.progress).toBeLessThan(0.05);
  });

  it('ignores samples near the centre or outside the annulus', () => {
    for (const rr of [0.05, 0.11, 0.29, 0.4]) {
      const r = mk();
      stroke(r, arc(0, TWO_TURNS_PER_2S, 0, 5000, 50, rr), true);
      expect(r.result).toBeNull();
      expect(r.progress).toBe(0);
      expect(r.feedback).toBe('outside_ring');
    }
    // Inner/outer edges of the annulus are accepted.
    for (const rr of [0.125, 0.275]) {
      const r = mk();
      stroke(r, arc(0, TWO_TURNS_PER_2S, 0, 3000, 50, rr), true);
      expect(r.result).not.toBeNull();
    }
  });

  it('samples outside the annulus break arc continuity', () => {
    const r = mk();
    const pts = arc(0, TWO_TURNS_PER_2S, 0, 6000, 40);
    // every other sample dips to the centre → each valid sample re-anchors, no arc accumulates
    r.down(pts[0]);
    pts.slice(1).forEach((p, i) => r.move(i % 2 === 0 ? S(CX + 0.02, CY, p.t) : p));
    expect(r.result).toBeNull();
    expect(r.progress).toBe(0);
  });

  it('clamps angular speed: very fast spinning cannot finish before 1 s and waits for 1200 ms', () => {
    const r = mk();
    // 5 turns per second, samples every 20 ms (0.63 rad per sample, clamped to 0.25).
    const pts = arc(0, (10 * Math.PI) / 1000, 0, 3000, 20);
    r.down(pts[0]);
    for (const p of pts.slice(1)) {
      r.move(p);
      if (p.t === 500) expect(r.progress).toBeLessThanOrEqual(0.5 + 1e-9);
      if (p.t <= 1000) expect(r.result).toBeNull();
      if (r.result) break;
    }
    expect(r.result).not.toBeNull();
    expect(r.result!.eventMs).toBeGreaterThanOrEqual(1200);
    expect(r.result!.eventMs).toBeLessThan(1260);
  });

  it('rejects teleports (> 0.2 units between samples) without adding arc', () => {
    const r = mk();
    // Bounce between opposite points of the ring: every move is a teleport.
    r.down(S(CX + 0.2, CY, 0));
    for (let i = 1; i < 200; i++) r.move(S(CX + (i % 2 ? -0.2 : 0.2), CY + (i % 3) * 0.001, i * 30));
    expect(r.progress).toBe(0);
    expect(r.result).toBeNull();

    const r2 = mk();
    stroke(r2, arc(0, TWO_TURNS_PER_2S, 0, 500, 50), true); // half a turn
    const before = r2.progress;
    const a = Math.PI + 1.2; // jump 1.2 rad (chord 0.226 > 0.2)
    r2.move(S(CX + 0.2 * Math.cos(a), CY + 0.2 * Math.sin(a), 550));
    expect(r2.progress).toBeCloseTo(before, 10);
  });

  it('pointer-up mid-way discards the attempt; a new down starts fresh', () => {
    const r = mk();
    stroke(r, arc(0, TWO_TURNS_PER_2S, 0, 1500, 50));
    expect(r.result).toBeNull();
    expect(r.progress).toBe(0);
    expect(r.feedback).toBe('incomplete');
    const pts = arc(0, TWO_TURNS_PER_2S, 2000, 4500, 50);
    stroke(r, pts, true);
    expect(r.result?.eventMs).toBeCloseTo(4000, 6);
  });

  it('cancel discards the unfinished arc', () => {
    const r = mk();
    stroke(r, arc(0, TWO_TURNS_PER_2S, 0, 1800, 50), true);
    expect(r.progress).toBeGreaterThan(0.8);
    r.cancel(1);
    expect(r.progress).toBe(0);
    r.move(S(CX + 0.2, CY, 1900)); // no active pointer
    expect(r.result).toBeNull();
  });

  it('requires at least 12 valid samples', () => {
    const r = mk();
    // 2 turns in 2000 ms with 200 ms samples = 11 samples, each 1.26 rad. Radius 0.15 keeps the
    // chord (0.18) under the 0.2 teleport limit (at r = 0.20 it would be a teleport).
    const pts = arc(0, TWO_TURNS_PER_2S, 0, 2000, 200, 0.15);
    expect(pts).toHaveLength(11);
    stroke(r, pts, true);
    expect(r.progress).toBeGreaterThan(0.99); // arc is there…
    expect(r.result).toBeNull(); // …but only 11 samples
    r.up(pts[pts.length - 1]);
    expect(r.result).toBeNull();
    // With one more sample (still ≥ 4π) it submits at that sample's time.
    const r2 = mk();
    stroke(r2, arc(0, TWO_TURNS_PER_2S, 0, 2200, 200, 0.15), true);
    expect(r2.result?.eventMs).toBe(2200);
  });

  it('ignores a second finger', () => {
    const r = mk();
    const pts = arc(0, TWO_TURNS_PER_2S, 0, 3000, 50);
    r.down(pts[0]);
    pts.slice(1).forEach((p, i) => {
      r.down(S(0.9, 0.1, p.t, 2));
      r.move(S(CX - 0.2, CY, p.t, 2));
      r.move(p);
      if (i === 5) r.up(S(0.9, 0.1, p.t, 2));
    });
    expect(r.result?.eventMs).toBeCloseTo(2000, 6);
  });

  it('is frame-rate independent (dense and sparse sampling agree)', () => {
    const times = [16, 33, 50, 90].map((dt) => {
      const r = mk();
      stroke(r, arc(0.3, TWO_TURNS_PER_2S, 0, 3000, dt), true);
      return r.result!.eventMs;
    });
    for (const t of times) expect(t).toBeCloseTo(2000, 6);
  });
});

describe('helpers', () => {
  it('createRecognizer and sampleFromPointer', () => {
    expect(createRecognizer({ gesture: 'tap', x: 0, y: 0, radius: 0.1 }).kind).toBe('tap');
    expect(createRecognizer({ gesture: 'swipe', x1: 0, y1: 0, x2: 1, y2: 0, crossX: 0.5, crossY: 0 }).kind).toBe('swipe');
    expect(createRecognizer({ gesture: 'circle', cx: 0.5, cy: 0.5 }).kind).toBe('circle');
    const s = sampleFromPointer({ clientX: 150, clientY: 250, timeStamp: 5000, pointerId: 3 }, { left: 50, top: 50, width: 400, height: 400 }, 1500);
    expect(s).toEqual({ x: 0.25, y: 0.5, t: 3500, pointerId: 3 });
  });
});

describe('CircleRecognizer freeform (game stirring)', () => {
  /** Points around (ox, oy) with radius r, `turns` turns over `ms`, every 16 ms. */
  const loop = (ox: number, oy: number, r: number, turns: number, ms: number, t0 = 0, dir = 1) =>
    Array.from({ length: Math.round(ms / 16) + 1 }, (_, i) => {
      const a = dir * (i / Math.round(ms / 16)) * turns * 2 * Math.PI;
      return { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a), t: t0 + i * 16, pointerId: 1 };
    });
  const run = (rec: CircleRecognizer, pts: { x: number; y: number; t: number; pointerId: number }[], lift = true) => {
    rec.down(pts[0]);
    for (const p of pts.slice(1)) rec.move(p);
    if (lift) rec.up(pts[pts.length - 1]);
  };

  it('counts two circles drawn anywhere, at any size, either way round', () => {
    for (const [ox, oy, r, dir] of [[0.8, 0.1, 0.06, 1], [0.2, 0.9, 0.35, -1], [0.5, 0.5, 0.15, 1]] as const) {
      const rec = new CircleRecognizer({ cx: 0.5, cy: 0.5, ...FREEFORM_CIRCLE });
      run(rec, loop(ox, oy, r, 2.3, 1600, 0, dir));
      expect(rec.result?.kind).toBe('circle');
      expect(rec.result!.eventMs).toBeGreaterThan(1200);
      expect(rec.result!.eventMs).toBeLessThan(1600);
    }
  });

  it('keeps the turns when the finger lifts between strokes', () => {
    const rec = new CircleRecognizer({ cx: 0.5, cy: 0.5, ...FREEFORM_CIRCLE });
    run(rec, loop(0.5, 0.5, 0.15, 1.2, 900));
    expect(rec.result).toBeNull();
    expect(rec.progress).toBeGreaterThan(0.5);
    run(rec, loop(0.3, 0.6, 0.12, 1.2, 900, 1000));
    expect(rec.result?.kind).toBe('circle');
  });

  it('a straight line or a back-and-forth scribble is not stirring', () => {
    const line = new CircleRecognizer({ cx: 0.5, cy: 0.5, ...FREEFORM_CIRCLE });
    run(line, Array.from({ length: 80 }, (_, i) => ({ x: 0.1 + i * 0.01, y: 0.5, t: i * 16, pointerId: 1 })));
    expect(line.result).toBeNull();
    const zig = new CircleRecognizer({ cx: 0.5, cy: 0.5, ...FREEFORM_CIRCLE });
    run(zig, Array.from({ length: 120 }, (_, i) => ({ x: 0.5 + (i % 2 ? 0.05 : -0.05), y: 0.5, t: i * 16, pointerId: 1 })));
    expect(zig.result).toBeNull();
  });
});
