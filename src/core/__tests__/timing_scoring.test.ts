import { describe, expect, it } from 'vitest';
import * as ref from '../../data/timing_reference.mjs';
import { createAppleScoring } from '../../data/scoring_reference.mjs';
import rawProto from '../../data/prototype_game_data.json';
import { APPLES, PROTOTYPE_APPLES, PROTOTYPE_RECIPES, RECIPES, fitStars, recipe } from '../content.ts';
import { GRADE_POINTS, gradeTiming, summarizeTechnique, type Grade, type StepTiming } from '../timing.ts';
import { acceptedResults, evaluateDish, replaceStepResult, type StepResult } from '../scoring.ts';
import { gradeStep, isExpired, trackZones } from '../stepTimer.ts';

// Deterministic PRNG for parity sweeps.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const call = <T,>(f: () => T): { ok: true; v: T } | { ok: false; e: string } => {
  try {
    return { ok: true, v: f() };
  } catch (e) {
    return { ok: false, e: (e as Error).message };
  }
};

describe('timing parity with timing_reference.mjs', () => {
  it('gradeTiming matches on many inputs (valid and invalid configs)', () => {
    const r = rng(42);
    const timings: StepTiming[] = RECIPES.flatMap((x) => x.steps.map((s) => s.timing));
    for (let i = 0; i < 300; i++) {
      const p = Math.round(r() * 800) + (r() < 0.05 ? -100 : 1);
      const g = p + Math.round(r() * 800);
      const o = g + Math.round(r() * 1000);
      const target = o + Math.round(r() * 3000) - (r() < 0.05 ? 2000 : 0);
      timings.push({ perfect_ms: p, good_ms: g, ok_ms: o, target_ms: target, duration_ms: target + o + Math.round(r() * 3000) - (r() < 0.05 ? 3000 : 0) });
    }
    let n = 0;
    for (const t of timings) {
      const events: (number | null)[] = [null, NaN, -1, 0, t.duration_ms, t.duration_ms + 1, t.target_ms];
      for (const w of [t.perfect_ms, t.good_ms, t.ok_ms]) events.push(t.target_ms + w, t.target_ms - w, t.target_ms + w + 1, t.target_ms - w - 1);
      for (let k = 0; k < 20; k++) events.push(Math.round((r() * 1.4 - 0.2) * t.duration_ms * 100) / 100);
      for (const ev of events)
        for (const geo of [true, false])
          for (const tol of [1, 1.5, 2, 0.5, NaN]) {
            expect(call(() => gradeTiming(t, ev, geo, tol))).toEqual(call(() => ref.gradeTiming(t, ev, geo, tol)));
            n++;
          }
    }
    expect(n).toBeGreaterThan(10000);
  });

  it('summarizeTechnique matches for all grade combinations of length 1–5 (+ invalid)', () => {
    const grades: Grade[] = ['Perfect', 'Good', 'OK', 'Miss'];
    let n = 0;
    const rec = (prefix: Grade[]) => {
      if (prefix.length >= 1) {
        const rs = prefix.map((grade) => ({ grade }));
        for (const assisted of [false, true]) {
          expect(summarizeTechnique(rs, { assisted })).toEqual(ref.summarizeTechnique(rs, { assisted }));
          n++;
        }
      }
      if (prefix.length < 5) for (const g of grades) rec([...prefix, g]);
    };
    rec([]);
    expect(n).toBe(2 * (4 + 16 + 64 + 256 + 1024));
    for (const bad of [[], Array(6).fill({ grade: 'Good' }), [{ grade: 'Great' }]])
      expect(call(() => summarizeTechnique(bad))).toEqual(call(() => ref.summarizeTechnique(bad)));
  });

  it('reference boundaries', () => {
    const t = recipe('hirosaki_pie').steps[0].timing;
    for (const [off, g] of [[0, 'Perfect'], [350, 'Perfect'], [-350, 'Perfect'], [351, 'Good'], [800, 'Good'], [801, 'OK'], [1300, 'OK'], [1301, 'Miss']] as const)
      expect(gradeTiming(t, t.target_ms + off).grade).toBe(g);
    expect(gradeTiming(t, t.target_ms + 1100, true, 1.5).grade).toBe('Good');
    expect(GRADE_POINTS).toEqual({ Perfect: 1, Good: 0.75, OK: 0.35, Miss: 0 });
  });
});

describe('stepTimer', () => {
  const step = recipe('apple_jam').steps[2]; // circle 8000/6000/450/1000/1600
  it('grades, expiry and zones', () => {
    expect(gradeStep(step, 6400).grade).toBe('Perfect');
    expect(gradeStep(step, 6600).grade).toBe('Good');
    expect(gradeStep(step, 6600, 1.5).grade).toBe('Perfect');
    expect(gradeStep(step, null)).toEqual({ grade: 'Miss', points: 0, error_ms: null });
    expect(isExpired(step, 8000)).toBe(false);
    expect(isExpired(step, 8000.5)).toBe(true);
    const z = trackZones(step);
    expect(z.perfect).toEqual({ start: 5550, end: 6450 });
    expect(z.good).toEqual({ start: 5000, end: 7000 });
    expect(z.ok).toEqual({ start: 4400, end: 7600 });
    const z15 = trackZones(step, 1.5);
    expect(z15.ok).toEqual({ start: 3600, end: 8000 }); // clamped to deadline
  });
});

const results = (recipeId: string, grades: Grade[], attempt = 'x'): StepResult[] =>
  recipe(recipeId).steps.map((s, i) => ({
    stepId: s.id,
    grade: grades[i],
    error_ms: grades[i] === 'Miss' ? null : 0,
    attemptId: `${attempt}${i}`,
    assisted: false,
    points: GRADE_POINTS[grades[i]],
  }));

describe('evaluateDish', () => {
  const scoringRef = createAppleScoring(rawProto);

  it('Fuji pie (fit 2) reaches 3 with good technique', () => {
    expect(fitStars('a048', 'hirosaki_pie')).toBe(2);
    const e = evaluateDish({ appleId: 'a048', recipeId: 'hirosaki_pie', results: results('hirosaki_pie', ['Good', 'Good', 'Perfect', 'Good', 'Good']), assisted: false });
    expect(e).toMatchObject({ fitStars: 2, techniqueBonus: 1, executionPenalty: 0, finishedStars: 3, label: 'Best' });
    expect(e.explanation).toBe('Apple fit: 2. Careful cooking: +1. Result: 3.');
  });

  it('assisted gives +1 even with misses, raw grades retained', () => {
    const e = evaluateDish({ appleId: 'a066', recipeId: 'apple_jam', results: results('apple_jam', ['Miss', 'Miss', 'OK']), assisted: true });
    expect(e.finishedStars).toBe(3);
    expect(e.techniqueBonus).toBe(1);
    expect(e.grades.map((g) => g.grade)).toEqual(['Miss', 'Miss', 'OK']);
    expect(e.explanation).toContain('Helper bonus: +1');
    expect(e.explanation).toContain('(3 stars is the top!)');
  });

  it('penalty path', () => {
    const e = evaluateDish({ appleId: 'a048', recipeId: 'hirosaki_pie', results: results('hirosaki_pie', ['OK', 'OK', 'Miss', 'OK', 'Good']), assisted: false });
    expect(e.mean).toBeCloseTo((0.35 * 3 + 0.75) / 5);
    expect(e).toMatchObject({ techniqueBonus: 0, executionPenalty: 1, finishedStars: 1 });
    expect(e.explanation).toBe('Apple fit: 2. Tricky timing: −1. Result: 1.');
  });

  it('middle path and clamp at 0', () => {
    const e = evaluateDish({ appleId: 'a048', recipeId: 'rabbit_apples', results: results('rabbit_apples', ['Perfect', 'Miss']), assisted: false });
    expect(e).toMatchObject({ techniqueBonus: 0, executionPenalty: 0, finishedStars: 3 });
    const z = evaluateDish({ appleId: 'a032', recipeId: 'rabbit_apples', results: results('rabbit_apples', ['Miss', 'Miss']), assisted: false });
    expect(z.finishedStars).toBe(0);
    expect(z.label).toBe('Bad fit');
    expect(z.childFeedback).toBe('Try this apple in another dish!');
    expect(z.tip).toMatch(/Apple Jam|Hirosaki Apple Pie/);
  });

  it('matches reference evaluateOrder stars for every prototype apple × recipe × technique outcome', () => {
    const patterns: Grade[][] = [['Perfect'], ['OK'], ['Miss'], ['Good']];
    for (const a of APPLES.filter((x) => (PROTOTYPE_APPLES as readonly string[]).includes(x.id)))
      for (const r of RECIPES.filter((x) => (PROTOTYPE_RECIPES as readonly string[]).includes(x.id)))
        for (const assisted of [false, true])
          for (const pat of patterns) {
            const grades = r.steps.map(() => pat[0]);
            const ours = evaluateDish({ appleId: a.id, recipeId: r.id, results: results(r.id, grades), assisted });
            const tech = ref.summarizeTechnique(grades.map((grade) => ({ grade })), { assisted });
            const theirs = scoringRef.evaluateOrder({ appleId: a.id, recipeId: r.id, techniqueBonus: tech.techniqueBonus, executionPenalty: tech.executionPenalty });
            expect(ours.finishedStars).toBe(theirs.stars);
            expect(ours.label).toBe(theirs.label);
            expect(ours.fitStars).toBe(theirs.ingredientFit);
          }
  });

  it('size mismatch for non-mini candy apple keeps recorded fit', () => {
    const e = evaluateDish({ appleId: 'a048', recipeId: 'ringo_ame', results: results('ringo_ame', ['Good', 'Good', 'Good', 'Good']), assisted: false });
    expect(e.sizeMismatch).toBe(true);
    expect(e.fitStars).toBe(1);
    expect(e.finishedStars).toBe(2);
    expect(e.tip).toMatch(/whole tiny apple/);
    const mini = evaluateDish({ appleId: 'a091', recipeId: 'ringo_ame', results: results('ringo_ame', ['Good', 'Good', 'Good', 'Good']), assisted: false });
    expect(mini.sizeMismatch).toBeUndefined();
    expect(mini.finishedStars).toBe(3);
  });

  it('a replayed step replaces its earlier result (no accumulation)', () => {
    let rs = results('rabbit_apples', ['Miss', 'Perfect']);
    const retry: StepResult = { ...rs[0], grade: 'Perfect', points: 1, attemptId: 'retry', error_ms: 10 };
    rs = replaceStepResult(rs, retry);
    expect(rs).toHaveLength(2);
    expect(acceptedResults('rabbit_apples', rs).map((r) => r.grade)).toEqual(['Perfect', 'Perfect']);
    // Even if a caller passes duplicates, last result per step wins and mean stays normalised.
    const dup = [...results('rabbit_apples', ['Miss', 'Perfect']), retry];
    const e = evaluateDish({ appleId: 'a048', recipeId: 'rabbit_apples', results: dup, assisted: false });
    expect(e.mean).toBe(1);
    expect(e.grades).toHaveLength(2);
    expect(() => evaluateDish({ appleId: 'a048', recipeId: 'rabbit_apples', results: [retry], assisted: false })).toThrow(/Missing/);
  });

  it('pink jam tip for Kurenai no Yume', () => {
    const e = evaluateDish({ appleId: 'a058', recipeId: 'apple_jam', results: results('apple_jam', ['Good', 'Good', 'Good']), assisted: false });
    expect(e.tip).toMatch(/pink jam/);
  });
});
