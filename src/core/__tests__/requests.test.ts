import { describe, expect, it } from 'vitest';
import { apple, recipe } from '../content.ts';
import { gameReducer, initialStateFromSave, selectors, toSaveData, type GameAction, type GameState } from '../gameReducer.ts';
import { defaultSave, parseSave } from '../persistence.ts';
import { unlockedApples } from '../progression.ts';
import { typicalLadder, typicalPoints } from '../ranks.ts';
import { REQUESTS, STAGE2_KEY, appleMatch, clueHolds, letterGap, menuCombo, menuPlan, menuPoints, requestById, sealEarned, skinFamily, twistHolds, waitingRequest } from '../requests.ts';
import { pendingDelivery } from '../gameReducer.ts';
import { DEFAULT_SEED, orderForIndex } from '../progression.ts';
import { JOURNEY_RECIPES, goldenRankOf, goldenRankPoints, ladderProgress } from '../ranks.ts';
import { RECIPE_INTROS } from '../story.ts';
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

describe('Slice B: the long-term loop', () => {
  /** Play a request start to finish with gold apples and Perfect actions. */
  function playRequest(s: GameState, id: string): GameState {
    const r = requestById(id);
    s = run(s, { type: 'OPEN_REQUEST', id }, { type: 'REQUEST_VIEW', view: 'match' });
    for (const [i, d] of r.dishes.entries()) {
      const gold = s.progress.unlockedApples.find((a) => appleMatch(a, d, r.twist.rule).gold) ?? s.progress.unlockedApples[0];
      s = run(s, { type: 'REQUEST_PICK', dish: i, appleId: gold });
    }
    s = run(s, { type: 'REQUEST_COOK' });
    while (s.phase === 'cook') s = cookDish(s);
    return run(s, { type: 'REQUEST_NEXT' }, { type: 'REQUEST_NEXT' });
  }
  const serveOrders = (s: GameState, n: number): GameState => {
    // Advance completed orders without cooking (the letter clock only reads the count).
    return { ...s, progress: { ...s.progress, completedOrders: s.progress.completedOrders + n } };
  };

  it('eight visitors, each with a crew, a gift and enough gold apples', () => {
    expect(REQUESTS.map((r) => r.visitor)).toEqual(['Captain Ingrid', 'Mr. Ōgane', 'Chef Amélie', 'Commander Leila', 'Carer Mia', 'Princess Amara', 'The Head Butler', 'Grandma Rosa']);
    expect(new Set(REQUESTS.map((r) => r.customer)).size).toBe(8);
    expect(new Set(REQUESTS.map((r) => r.gift.node)).size).toBe(8);
    REQUESTS.forEach((r, i) => {
      const have = unlockedApples(56 + i * 6);
      for (const d of r.dishes) expect(have.filter((a) => appleMatch(a, d, r.twist.rule).gold).length, `${r.id}: ${d.name}`).toBeGreaterThanOrEqual(2);
    });
  });

  it('a letter every 4–7 orders: new visitors first in story order, then returning ones', () => {
    for (let n = 1; n < 40; n++) { expect(letterGap(n)).toBeGreaterThanOrEqual(4); expect(letterGap(n)).toBeLessThanOrEqual(7); }
    let s = playRequest(afterFinale([STAGE2_KEY]), 'fjord');
    expect(s.progress.requestClock).toEqual({ at: 60, last: 'fjord' });
    expect(selectors.waitingRequest(s)).toBeNull();
    s = serveOrders(s, letterGap(1) - 1);
    expect(selectors.waitingRequest(s)).toBeNull();
    s = serveOrders(s, 1);
    expect(selectors.waitingRequest(s)?.id).toBe('tower');
    const seen = ['fjord'];
    for (const r of REQUESTS.slice(1)) {
      while (!selectors.waitingRequest(s)) s = serveOrders(s, 1);
      expect(selectors.waitingRequest(s)!.id).toBe(r.id);
      s = playRequest(s, r.id);
      seen.push(r.id);
    }
    expect(seen).toHaveLength(8);
    // Then returning visitors, never the same one twice in a row.
    let last = s.progress.requestClock.last;
    for (let k = 0; k < 6; k++) {
      while (!selectors.waitingRequest(s)) s = serveOrders(s, 1);
      const next = selectors.waitingRequest(s)!.id;
      expect(next).not.toBe(last);
      s = playRequest(s, next);
      last = next;
    }
  });

  it('request menus earn ×1.5, or ×2 with the Golden Seal', () => {
    expect(menuPoints([100, 200], false)).toEqual({ base: 300, total: 450, mult: 1.5 });
    expect(menuPoints([100, 200], true)).toEqual({ base: 300, total: 600, mult: 2 });
    const start = afterFinale([STAGE2_KEY]);
    const s = playRequest(start, 'fjord');
    expect(s.progress.requests.fjord.seal).toBe(true);
    expect(s.progress.totalPoints - start.progress.totalPoints).toBeGreaterThan(0);
  });

  it('Big party: every dish twice, the second round faster', () => {
    const tower = requestById('tower');
    expect(menuPlan(tower)).toHaveLength(6);
    let s = run(afterFinale([STAGE2_KEY]), { type: 'OPEN_REQUEST', id: 'fjord' }, { type: 'REQUEST_EXIT' });
    s = { ...s, progress: { ...s.progress, requests: { fjord: { done: true, seal: false, plays: 1, bestStars: 3 } }, requestClock: { at: 0, last: 'fjord' } } };
    s = run(s, { type: 'OPEN_REQUEST', id: 'tower' }, { type: 'REQUEST_VIEW', view: 'match' });
    tower.dishes.forEach((d, i) => { s = run(s, { type: 'REQUEST_PICK', dish: i, appleId: s.progress.unlockedApples.find((a) => appleMatch(a, d, 'none').clue)! }); });
    s = run(s, { type: 'REQUEST_COOK' });
    const first = selectors.currentStep(run(s, { type: 'BRIDGE_DONE' }))!;
    s = cookDish(s);
    expect(selectors.activeRecipe(s).id).toBe('ringo_ame');
    const second = selectors.currentStep(run(s, { type: 'BRIDGE_DONE' }))!;
    expect(second.timing.target_ms).toBeLessThan(first.timing.target_ms);
    while (s.phase === 'cook') s = cookDish(s);
    expect(s.request?.evaluations).toHaveLength(6);
  });

  it('Rush order: one "Try again" for the whole menu', () => {
    let s = afterFinale([STAGE2_KEY]);
    s = { ...s, progress: { ...s.progress, requests: { fjord: { done: true, seal: false, plays: 1, bestStars: 3 }, tower: { done: true, seal: false, plays: 1, bestStars: 3 } }, requestClock: { at: 0, last: 'tower' } } };
    s = run(s, { type: 'OPEN_REQUEST', id: 'challenge' }, { type: 'REQUEST_VIEW', view: 'match' });
    expect(s.request?.retriesLeft).toBe(1);
    s = run(s, { type: 'REQUEST_PICK', dish: 0, appleId: 'a094' }, { type: 'REQUEST_PICK', dish: 1, appleId: 'a094' }, { type: 'REQUEST_COOK' },
      { type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: null });
    expect(s.cook?.sub).toBe('miss');
    s = run(s, { type: 'RETRY_STEP' });
    expect(s.request?.retriesLeft).toBe(0);
    s = run(s, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: null });
    expect(run(s, { type: 'RETRY_STEP' })).toBe(s);
  });

  it('World Traveller, Golden Seal Master and Apple Detective count requests', () => {
    const s = playRequest(afterFinale([STAGE2_KEY]), 'fjord');
    const t = Object.fromEntries(selectors.trophies(s).map((x) => [x.id, x]));
    expect(t.traveller.next).toMatchObject({ have: 1, need: 3 });
    expect(t.seal.tier).toBe(1);
    expect(t.detective.next).toMatchObject({ have: 3, need: 10 });
  });
});

describe('after Golden Chef', () => {
  it('Golden Chef ranks: every gap 10% bigger than the one before', () => {
    expect([1, 2, 3, 4].map(goldenRankPoints)).toEqual([55000, 68200, 82720, 98692]);
    expect(goldenRankOf(54999)).toBe(0);
    expect(goldenRankOf(55000)).toBe(1);
    expect(goldenRankOf(68199)).toBe(1);
    expect(goldenRankOf(68200)).toBe(2);
    const lp = ladderProgress(70000);
    expect(lp.golden).toMatchObject({ rank: 2, next: 3, toGo: 12720 });
  });

  it('a new Golden Chef rank shows once, as a card after a dish', () => {
    const s = afterFinale();
    const p = { ...s.progress, totalPoints: 70000 };
    expect(pendingDelivery(p, p.completedOrders)?.goldenRank).toBe(2);
    expect(pendingDelivery({ ...p, seenUnlockRewards: [...p.seenUnlockRewards, 'grank:2'] }, p.completedOrders)?.goldenRank ?? null).toBeNull();
  });

  it('a regular comes back with each new recipe they found, every 3–5 orders', () => {
    const gaps = JOURNEY_RECIPES.slice(1).map((j, i) => j.after - JOURNEY_RECIPES[i].after);
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(3); expect(g).toBeLessThanOrEqual(5); }
    expect(new Set(gaps).size).toBeGreaterThan(1);
    const L = typicalLadder(120);
    for (const j of JOURNEY_RECIPES) {
      const o = orderForIndex(L[9] + j.after + 1, DEFAULT_SEED, L);
      expect(o.recipeId).toBe(j.id);
      expect(o.intro).toBe(true);
      expect(o.visit).toMatchObject({ tagline: 'Found a new recipe!', of: 0 });
      expect(o.line).toBe(RECIPE_INTROS[j.id].line);
      expect(o.customerId).toBe(RECIPE_INTROS[j.id].who);
    }
  });
});
