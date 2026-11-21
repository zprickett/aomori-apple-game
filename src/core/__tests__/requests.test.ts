import { describe, expect, it } from 'vitest';
import { apple, recipe } from '../content.ts';
import { gameReducer, initialStateFromSave, selectors, toSaveData, type GameAction, type GameState } from '../gameReducer.ts';
import { defaultSave, parseSave } from '../persistence.ts';
import { unlockedApples } from '../progression.ts';
import { typicalLadder, typicalPoints } from '../ranks.ts';
import { REQUESTS, STAGE2_KEY, appleMatch, clueHolds, menuCombo, requestById, sealEarned, skinFamily, twistHolds, waitingRequest } from '../requests.ts';
import type { StepResult } from '../scoring.ts';

const ingrid = requestById('fjord');

/** A chef past Golden Chef and Ojiichan's ending. */
function afterFinale(extraSeen: string[] = []): GameState {
  const s = defaultSave();
  s.completedOrders = 60;
  s.completedOrderIds = Array.from({ length: 60 }, (_, i) => `order-${String(i + 1).padStart(4, '0')}`);
  s.ladder = typicalLadder(60);
  s.totalPoints = typicalPoints(60);
  s.unlockedApples = unlockedApples(60);
  s.seenUnlockRewards = ['finale', 'news:2', 'news:3', 'news:4', 'news:5', ...extraSeen];
  return initialStateFromSave(s);
}

const run = (s: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, s);

/** Cook the current dish with every action graded `grade`, then serve it. */
function cookDish(s: GameState, grade: 'Perfect' | 'Good' | 'OK' = 'Perfect'): GameState {
  expect(s.phase).toBe('cook');
  while (s.phase === 'cook') {
    s = run(s, { type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' },
      { type: 'SUBMIT', eventMs: 0, graded: { grade, error_ms: 0 } }, { type: 'FEEDBACK_DONE' });
  }
  expect(s.phase).toBe('serve');
  return run(s, { type: 'SERVE_DONE' });
}

const goldFor = (i: number, s: GameState) =>
  s.progress.unlockedApples.find((id) => appleMatch(id, ingrid.dishes[i], ingrid.twist.rule).gold)!;

describe('Golden Request data and apple clues', () => {
  it("Captain Ingrid's menu uses playable recipes and has a picky twist", () => {
    expect(ingrid.visitor).toBe('Captain Ingrid');
    expect(ingrid.dishes.map((d) => d.recipe)).toEqual(['rabbit_apples', 'apple_jam', 'fresh_juice']);
    for (const d of ingrid.dishes) expect(recipe(d.recipe).name).toBeTruthy();
    expect(ingrid.twist.rule).toBe('notVerySweet');
    expect(REQUESTS.map((r) => r.id)).toContain('fjord');
  });

  it('reads clues from the apple stats, skin and flesh', () => {
    expect(skinFamily(apple('a048'))).toBe('red'); // Fuji
    expect(skinFamily(apple('a006'))).toBe('yellow'); // Toki
    expect(skinFamily(apple('a032'))).toBe('green'); // Bramley
    expect(clueHolds(apple('a094'), 'tart')).toBe(true); // Kogyoku
    expect(clueHolds(apple('a023'), 'tart')).toBe(false); // Orin
    expect(clueHolds(apple('a058'), 'pinkInside')).toBe(true); // Kurenai no Yume
    expect(twistHolds(apple('a006'), 'notVerySweet')).toBe(false); // Toki is very sweet
    expect(twistHolds(apple('a094'), 'notVerySweet')).toBe(true);
  });

  it('every dish has at least two gold apples by the time requests begin', () => {
    const have = unlockedApples(56);
    for (const d of ingrid.dishes) {
      const gold = have.filter((id) => appleMatch(id, d, ingrid.twist.rule).gold);
      expect(gold.length, d.name).toBeGreaterThanOrEqual(2);
    }
    // A juicy apple that is too sweet fits the clue but not the twist.
    const m = appleMatch('a006', ingrid.dishes[2], ingrid.twist.rule);
    expect(m).toEqual({ clue: true, twist: false, gold: false });
  });

  it('the Golden Seal needs gold apples and a combo that never breaks', () => {
    const r = (grade: StepResult['grade'], assisted = false): StepResult => ({ stepId: 's', grade, error_ms: 0, attemptId: 'a', assisted, points: 1 });
    expect(sealEarned([true, true], [[r('Perfect')], [r('Good'), r('Perfect')]])).toBe(true);
    expect(sealEarned([true, false], [[r('Perfect')], [r('Perfect')]])).toBe(false);
    expect(sealEarned([true, true], [[r('Perfect')], [r('OK')]])).toBe(false);
    expect(sealEarned([true, true], [[r('Perfect')], [r('Good', true)]])).toBe(false);
    expect(menuCombo([[r('Perfect'), r('OK')], [r('Good'), r('Perfect')]])).toBe(2);
  });
});

describe('Golden Request flow', () => {
  it('no letter before the Stage 2 intro; the intro plays the day after Ojiichan, then the letter waits', () => {
    const s = afterFinale();
    expect(waitingRequest(s.progress.seenUnlockRewards, s.progress.requests)).toBeNull();
    expect(run(s, { type: 'OPEN_REQUEST', id: 'fjord' })).toBe(s);
    expect(selectors.pendingStage2(s)).toBe(true);
    const seen = run(s, { type: 'STAGE2_SEEN' });
    expect(selectors.pendingStage2(seen)).toBe(false);
    expect(selectors.waitingRequest(seen)?.id).toBe('fjord');
    // Before Ojiichan's ending there is no intro.
    const early = initialStateFromSave({ ...defaultSave(), completedOrders: 20, ladder: typicalLadder(20), totalPoints: typicalPoints(20) });
    expect(selectors.pendingStage2(early)).toBe(false);
  });

  it('letter → menu → apples → three dishes back to back → reveal → rewards → back to the stall', () => {
    let s = run(afterFinale([STAGE2_KEY]), { type: 'OPEN_REQUEST', id: 'fjord' });
    expect(s.mode).toBe('request');
    expect(s.request?.view).toBe('letter');
    s = run(s, { type: 'REQUEST_VIEW', view: 'brief' }, { type: 'REQUEST_VIEW', view: 'match' });
    expect(run(s, { type: 'REQUEST_COOK' })).toBe(s); // apples first
    s = run(s, ...ingrid.dishes.map((_, i) => ({ type: 'REQUEST_PICK', dish: i, appleId: goldFor(i, s) }) as GameAction), { type: 'REQUEST_COOK' });
    expect(s.phase).toBe('cook');
    expect(selectors.activeRecipe(s).id).toBe('rabbit_apples');
    s = cookDish(s);
    expect(s.phase).toBe('cook');
    expect(selectors.activeRecipe(s).id).toBe('apple_jam');
    expect(s.appleId).toBe(s.request!.apples[1]);
    s = cookDish(s);
    s = cookDish(s);
    expect(s.phase).toBe('request');
    expect(s.request?.view).toBe('reveal');
    expect(s.request?.seal).toBe(true);
    expect(s.request?.evaluations).toHaveLength(3);
    const before = s.progress;
    s = run(s, { type: 'REQUEST_NEXT' });
    expect(s.request?.view).toBe('rewards');
    s = run(s, { type: 'REQUEST_NEXT' });
    expect(s.mode).toBe('order');
    expect(s.phase).toBe('shop');
    expect(s.progress.requests.fjord).toEqual({ done: true, seal: true, plays: 1, bestStars: 9 });
    expect(s.progress.totalPoints).toBeGreaterThan(before.totalPoints);
    expect(s.progress.completedOrders).toBe(before.completedOrders);
    expect(selectors.waitingRequest(s)).toBeNull();
    // A finished request can be replayed (from the passport); it is no longer a first play.
    const again = run(s, { type: 'OPEN_REQUEST', id: 'fjord' });
    expect(again.request?.first).toBe(false);
  });

  it('a non-matching apple or a broken combo means no seal, but the request still counts', () => {
    let s = run(afterFinale([STAGE2_KEY]), { type: 'OPEN_REQUEST', id: 'fjord' }, { type: 'REQUEST_VIEW', view: 'match' });
    s = run(s, { type: 'REQUEST_PICK', dish: 0, appleId: goldFor(0, s) }, { type: 'REQUEST_PICK', dish: 1, appleId: goldFor(1, s) },
      { type: 'REQUEST_PICK', dish: 2, appleId: 'a006' }, { type: 'REQUEST_COOK' });
    s = cookDish(cookDish(cookDish(s)));
    expect(s.request?.seal).toBe(false);
    s = run(s, { type: 'REQUEST_NEXT' }, { type: 'REQUEST_NEXT' });
    expect(s.progress.requests.fjord.done).toBe(true);
    expect(s.progress.requests.fjord.seal).toBe(false);
  });

  it('leaving before cooking changes nothing; a reload mid-request goes back to the shop', () => {
    const start = afterFinale([STAGE2_KEY]);
    let s = run(start, { type: 'OPEN_REQUEST', id: 'fjord' }, { type: 'REQUEST_EXIT' });
    expect(s.mode).toBe('order');
    expect(s.progress).toEqual(start.progress);
    s = run(start, { type: 'OPEN_REQUEST', id: 'fjord' }, { type: 'REQUEST_VIEW', view: 'match' });
    s = run(s, ...ingrid.dishes.map((_, i) => ({ type: 'REQUEST_PICK', dish: i, appleId: goldFor(i, s) }) as GameAction), { type: 'REQUEST_COOK' });
    const saved = toSaveData(s);
    expect(saved.current?.phase).toBe('shop');
    expect(initialStateFromSave(saved).mode).toBe('order');
  });

  it('saves are v5 with request records; v4 saves load with none', () => {
    let s = run(afterFinale([STAGE2_KEY]), { type: 'OPEN_REQUEST', id: 'fjord' }, { type: 'REQUEST_VIEW', view: 'match' });
    s = run(s, ...ingrid.dishes.map((_, i) => ({ type: 'REQUEST_PICK', dish: i, appleId: goldFor(i, s) }) as GameAction), { type: 'REQUEST_COOK' });
    s = run(cookDish(cookDish(cookDish(s))), { type: 'REQUEST_NEXT' }, { type: 'REQUEST_NEXT' });
    const text = JSON.stringify(toSaveData(s));
    const back = parseSave(text);
    expect(back.data.version).toBe(5);
    expect(back.data.requests.fjord.done).toBe(true);
    const v4 = parseSave(JSON.stringify({ ...JSON.parse(text), version: 4, requests: undefined }));
    expect(v4.notice).toBeNull();
    expect(v4.data.requests).toEqual({});
    const junk = parseSave(JSON.stringify({ ...JSON.parse(text), requests: { fjord: { done: 'yes', plays: -2 }, nope: { done: true } } }));
    expect(junk.data.requests).toEqual({ fjord: { done: false, seal: false, plays: 0, bestStars: 0 } });
  });
});
