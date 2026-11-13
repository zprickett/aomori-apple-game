/**
 * Arcade pacing layer (v2.1 tuning, requested after first playtest: "faster and harder").
 *
 * Each timed step is played as 1–3 quick *beats*. A coloured ring closes on the food and the
 * player acts when it meets the target outline. Cutting steps are Fruit-Ninja style slices:
 * any fast stroke through the apple counts, scored at the moment of closest approach.
 * Beat grades are averaged into ONE step grade (Perfect/Good/OK/Miss), so the recipe still
 * records one result per authored step and the existing technique/score rules are unchanged.
 *
 * All values are authored game tuning, not cooking times, and still need child playtesting.
 */
import type { Gesture, StepDef } from './content.ts';
import { GRADE_POINTS, type Grade } from './timing.ts';
import type { PointerSample } from './recognizers.ts';

export interface BeatWindow { perfect: number; good: number; ok: number }

/** Tight absolute-error windows (ms) per gesture. */
export const ARCADE_WINDOWS: Readonly<Record<Gesture, BeatWindow>> = Object.freeze({
  tap: { perfect: 70, good: 150, ok: 260 },
  swipe: { perfect: 80, good: 170, ok: 290 },
  circle: { perfect: 170, good: 350, ok: 560 },
});

/** How long the closing ring is visible before its beat (ms). */
export const RING_LEAD_MS: Readonly<Record<Gesture, number>> = Object.freeze({ tap: 820, swipe: 760, circle: 2600 });
/** Ring time for follow-up beats (slice 2, slice 3…): a fresh ring always starts just after the previous hit. */
export const FOLLOW_LEAD_MS: Readonly<Record<Gesture, number>> = Object.freeze({ tap: 600, swipe: 600, circle: 2600 });

/** Ring lead for beat i (first beat gets a little longer to read the cue). */
export function beatLead(gesture: Gesture, i: number): number {
  return i === 0 ? RING_LEAD_MS[gesture] : FOLLOW_LEAD_MS[gesture];
}

/**
 * Follow-up beats are scheduled from the moment the previous beat resolved (hit or expired),
 * so every slice gets its own clearly visible closing ring: the next ring appears 60–200 ms after
 * the previous slice and closes 600 ms later. Deterministic per attempt.
 */
export function nextBeatTarget(step: StepDef, attemptId: string, i: number, resolvedAtMs: number): number {
  const r = rand(hash(`${step.id}|${attemptId}|next${i}`));
  return Math.round(resolvedAtMs + FOLLOW_LEAD_MS[step.gesture] + 60 + r() * 140);
}

/** Short automatic pauses (ms) — everything between actions is kept snappy. */
export const PACE = Object.freeze({
  bridgeFrameMs: 560,
  bridgeFrameReducedMs: 420,
  promptMs: 650,
  firstTimePromptMs: 1200,
  countInMs: 300,
  feedbackMs: 720,
  missAfterOkMs: 180,
});

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand(seed: number) {
  let s = seed || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Number of beats for a step: 3 slices for whole-fruit cuts, 2 for rabbit ears, else 1. */
export function beatCount(step: StepDef): number {
  if (step.gesture !== 'swipe') return 1;
  return step.animation_event === 'rabbit_ears_cut' ? 2 : 3;
}

/**
 * Beat target times (ms after the active phase starts). Deterministic per attempt id, with
 * jitter so the rhythm can't be memorised: first cue 820–1020 ms (tap/swipe), slice gaps 480–640 ms;
 * circle cue 2500–2800 ms (needs ~1.2 s of real stirring).
 */
export function beatTargets(step: StepDef, attemptId: string): number[] {
  const r = rand(hash(`${step.id}|${attemptId}`));
  const n = beatCount(step);
  if (step.gesture === 'circle') return [Math.round(2500 + r() * 300)];
  const out: number[] = [];
  let t = Math.round(RING_LEAD_MS[step.gesture] + 60 + r() * 200);
  for (let i = 0; i < n; i++) { out.push(t); t += Math.round(480 + r() * 160); }
  return out;
}

export interface BeatResult { grade: Grade; points: number; error_ms: number | null }

/** Grade one beat. `eventMs` null = no action before the beat expired. */
export function gradeBeat(gesture: Gesture, targetMs: number, eventMs: number | null, multiplier = 1): BeatResult {
  if (eventMs === null || !Number.isFinite(eventMs)) return { grade: 'Miss', points: 0, error_ms: null };
  const w = ARCADE_WINDOWS[gesture];
  const err = eventMs - targetMs, a = Math.abs(err);
  const grade: Grade = a <= w.perfect * multiplier ? 'Perfect' : a <= w.good * multiplier ? 'Good' : a <= w.ok * multiplier ? 'OK' : 'Miss';
  return { grade, points: GRADE_POINTS[grade], error_ms: err };
}

/** A beat is still open until its OK window (plus a small grace) has passed. */
export function beatExpiresAt(gesture: Gesture, targetMs: number, multiplier = 1): number {
  return targetMs + ARCADE_WINDOWS[gesture].ok * multiplier + PACE.missAfterOkMs;
}

/** Inputs earlier than this (before the ring is up) are ignored rather than counted as Miss. */
export function beatOpensAt(gesture: Gesture, targetMs: number, i = 0): number {
  return targetMs - beatLead(gesture, i);
}

/**
 * Combine beats into the single step grade. Mean of beat points: ≥0.92 with no Miss → Perfect,
 * ≥0.66 → Good, ≥0.3 → OK, else Miss. Missing more than half the beats is always a Miss.
 */
export function combineBeats(beats: readonly BeatResult[]): BeatResult {
  if (!beats.length) return { grade: 'Miss', points: 0, error_ms: null };
  const mean = beats.reduce((s, b) => s + b.points, 0) / beats.length;
  const misses = beats.filter((b) => b.grade === 'Miss').length;
  let grade: Grade = mean >= 0.92 && misses === 0 ? 'Perfect' : mean >= 0.66 ? 'Good' : mean >= 0.3 ? 'OK' : 'Miss';
  if (misses * 2 > beats.length) grade = 'Miss';
  const errs = beats.map((b) => b.error_ms).filter((e): e is number => e !== null);
  const error_ms = errs.length ? Math.round(errs.reduce((s, e) => s + e, 0) / errs.length) : null;
  return { grade, points: GRADE_POINTS[grade], error_ms };
}

// ---------------------------------------------------------------------------
// Fruit-Ninja style slice recognizer
// ---------------------------------------------------------------------------
export interface SliceConfig {
  cx: number; cy: number;
  /** Radius of the fruit in work units. */
  r: number;
  /** Minimum blade speed (work units / s) for a stroke segment to cut. */
  minSpeed?: number;
  /** Minimum stroke length travelled before the cut (units) — a tap never cuts. */
  minLength?: number;
}

export interface SliceEvent { t: number; x: number; y: number; angle: number }

/**
 * Any fast stroke that passes through the fruit circle cuts it, in any direction. The event time
 * is interpolated at the stroke's closest approach to the fruit centre. After a cut the blade must
 * leave the fruit before it can cut again, so one continuous zig-zag can slice repeatedly
 * (Fruit Ninja style) but resting a finger inside the fruit cannot.
 */
export class SliceRecognizer {
  readonly cfg: Required<SliceConfig>;
  private pid: number | null = null;
  private last: PointerSample | null = null;
  private travelled = 0;
  private armed = true;
  private queue: SliceEvent[] = [];
  private pending: { ev: SliceEvent; d: number } | null = null;
  feedback: 'too_slow' | 'missed_fruit' | null = null;

  constructor(cfg: SliceConfig) {
    this.cfg = { minSpeed: 0.9, minLength: Math.max(0.07, cfg.r * 1.1), ...cfg };
  }

  down(s: PointerSample) {
    if (this.pid !== null && this.pid !== s.pointerId) return;
    this.pid = s.pointerId; this.last = s; this.travelled = 0;
    // A stroke may start on the fruit (kids often begin the swipe on the apple); speed and
    // travelled-length checks still stop taps and slow drags from cutting.
    this.armed = true;
  }

  move(s: PointerSample) {
    if (this.pid === null || s.pointerId !== this.pid || !this.last) return;
    const p0 = this.last, p1 = s;
    this.last = s;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    const dt = Math.max(1, p1.t - p0.t);
    this.travelled += len;
    if (len < 1e-6) return;
    // closest approach of the segment to the centre
    let u = ((this.cfg.cx - p0.x) * dx + (this.cfg.cy - p0.y) * dy) / (len * len);
    u = Math.min(1, Math.max(0, u));
    const qx = p0.x + u * dx, qy = p0.y + u * dy;
    const d = Math.hypot(qx - this.cfg.cx, qy - this.cfg.cy);
    if (d <= this.cfg.r && this.armed) {
      const speed = (len / dt) * 1000;
      if (speed < this.cfg.minSpeed) { this.feedback = 'too_slow'; this.pending = null; }
      else if (this.travelled >= this.cfg.minLength) {
        const ev = { t: p0.t + u * (p1.t - p0.t), x: qx, y: qy, angle: Math.atan2(dy, dx) };
        if (u >= 1 && !(this.pending && this.pending.d < d)) {
          // still heading toward the centre: wait for the true closest approach
          this.pending = { ev, d };
        } else {
          this.commit(this.pending && this.pending.d < d ? this.pending.ev : ev);
        }
      }
    } else if (this.pending && this.armed) {
      this.commit(this.pending.ev);
    }
    if (!this.armed && this.dist(p1) > this.cfg.r) this.armed = true;
  }

  up(s: PointerSample) {
    if (s.pointerId !== this.pid) return;
    this.move(s);
    if (this.pending && this.armed) this.commit(this.pending.ev);
    this.pid = null; this.last = null; this.pending = null;
  }

  cancel() { this.pid = null; this.last = null; this.travelled = 0; this.pending = null; }

  private commit(ev: SliceEvent) {
    this.queue.push(ev);
    this.armed = false;
    this.pending = null;
    this.feedback = null;
  }

  /** Cuts recognised since the last call. */
  take(): SliceEvent[] { const q = this.queue; this.queue = []; return q; }

  private dist(s: { x: number; y: number }) { return Math.hypot(s.x - this.cfg.cx, s.y - this.cfg.cy); }
}
