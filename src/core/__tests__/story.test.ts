import { describe, expect, it } from 'vitest';
import { RECIPE_ORDER, recipe } from '../content.ts';
import { gameReducer, initialStateFromSave, selectors, type GameAction } from '../gameReducer.ts';
import { defaultSave } from '../persistence.ts';
import { DEFAULT_SEED, appleUnlockAt, ojiichanOrder, orderForIndex } from '../progression.ts';
import { RANKS, RANK_RECIPES } from '../ranks.ts';
import { GRANDPA, NEWS, NOTEBOOK, REGULARS, STORY_BACKDROPS, backdropForRank, letterFor, notebookPage, openPages, withName } from '../story.ts';

describe('story data', () => {
  it('has exactly one notebook page per rank', () => {
    expect(NOTEBOOK.map((p) => p.rank)).toEqual(RANKS.map((r) => r.rank));
  });

  it("each riddle is about exactly the recipes that page's rank brings", () => {
    for (const p of NOTEBOOK) expect([...p.riddleRecipes].sort()).toEqual(RANK_RECIPES[p.rank].map((x) => x.id).sort());
    const all = NOTEBOOK.flatMap((p) => p.riddleRecipes);
    expect(all.sort()).toEqual([...RECIPE_ORDER].sort());
    for (const p of NOTEBOOK) expect(p.riddle === null).toBe(p.riddleRecipes.length === 0);
  });

  it('the stall tours Aomori City → Lake Towada → Takayama Inari', () => {
    for (const p of NOTEBOOK) expect(STORY_BACKDROPS).toContain(p.backdrop);
    expect(RANKS.map((r) => backdropForRank(r.rank))).toEqual(['aomori_city', 'aomori_city', 'lake_towada', 'takayama_inari', 'takayama_inari']);
    // A page that moves the stall says so.
    for (let i = 1; i < NOTEBOOK.length; i++) {
      if (NOTEBOOK[i].backdrop !== NOTEBOOK[i - 1].backdrop) expect(NOTEBOOK[i].where).toBeTruthy();
    }
  });

  it('pages open with rank; the first is open from the start', () => {
    expect(openPages(1).map((p) => p.rank)).toEqual([1]);
    expect(openPages(4).map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(notebookPage(5).title).toBe('The last page');
  });

  it('letter and pages use the chef name and never he/she for the chef', () => {
    const l = letterFor('Mika');
    expect(l.greeting).toBe('Dear Mika,');
    expect(withName('{name}!', '  ')).toBe('Chef!');
    expect(withName(notebookPage(5).where!, 'Mika')).toContain('Mika');
    const text = JSON.stringify({ l, NOTEBOOK });
    expect(text).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    expect(GRANDPA.name).toBe('Ojiichan');
  });
});

describe('regulars, news and Ojiichan', () => {
  const orders = (rankUps: number[], n = 60, seed = 3) => Array.from({ length: n }, (_, i) => orderForIndex(i + 1, seed, rankUps));

  it('four regulars, four visits each, on their own models, in order', () => {
    expect(REGULARS.map((r) => [r.name, r.customer])).toEqual([['Sota', 'A'], ['Yui', 'B'], ['Grandpa Kiyoshi', 'C'], ['Mei', 'D']]);
    for (const seed of [1, 3, DEFAULT_SEED]) {
      const os = orders([5, 15, 30, 50], 60, seed);
      for (const r of REGULARS) {
        const mine = os.filter((o) => o.visit?.who === r.id);
        expect(mine).toHaveLength(4);
        mine.forEach((o, i) => {
          expect(o.customerId).toBe(r.customer);
          expect(o.orderNumber).toBeGreaterThanOrEqual(r.visits[i].at);
          expect(o.line).toContain(recipe(o.recipeId).name); // {dish} filled in
          expect(o.line).not.toContain('{dish}');
        });
      }
      // Visits never replace a recipe intro or an apple demo.
      for (const o of os) if (o.visit) expect(o.intro || o.demo).toBeFalsy();
    }
  });

  it("Mei's last visit gives the Oirase apple long before it would arrive", () => {
    const gift = orders([5, 15, 30, 50]).find((o) => o.giftAppleId);
    expect(gift).toMatchObject({ customerId: 'D', giftAppleId: 'a096' });
    expect(appleUnlockAt('a096')).toBeGreaterThan(gift!.orderNumber);
    const save = { ...defaultSave(), completedOrders: gift!.orderNumber - 1, completedOrderIds: [], rankUps: [5, 15, 30] };
    let s = initialStateFromSave(save);
    expect(s.order.giftAppleId).toBe('a096');
    s = gameReducer(s, { type: 'ACCEPT_ORDER' });
    s = gameReducer(s, { type: 'PREVIEW_APPLE', appleId: s.progress.unlockedApples[0] });
    s = gameReducer(s, { type: 'CONFIRM_APPLE' });
    for (const st of recipe(s.order.recipeId).steps) {
      s = [{ type: 'BRIDGE_DONE' }, { type: 'READY' }, { type: 'COUNTIN_DONE' }, { type: 'SUBMIT', eventMs: st.timing.target_ms }, { type: 'FEEDBACK_DONE' }]
        .reduce((x, a) => gameReducer(x, a as GameAction), s);
    }
    s = gameReducer(s, { type: 'SERVE_DONE' });
    expect(s.progress.unlockedApples).toContain('a096');
    expect(s.delivery?.apples).toContain('a096');
  });

  it('Ojiichan visits on the first order of the day after Golden Chef, and only then', () => {
    expect(ojiichanOrder([5, 15, 30])).toBeNull();
    expect(ojiichanOrder([5, 15, 30, 50])).toBe(51);
    expect(ojiichanOrder([5, 15, 30, 52])).toBe(56);
    const os = orders([5, 15, 30, 52], 70);
    expect(os.filter((o) => o.customerId === 'O').map((o) => o.orderNumber)).toEqual([56]);
    expect(orders([5, 15, 30], 70).some((o) => o.customerId === 'O')).toBe(false);
  });

  it('a later rank-up never changes orders already served', () => {
    expect(orders([5, 15], 25)).toEqual(orders([5, 15, 25], 25));
  });

  it('news shows at the start of the day after a rank-up, once', () => {
    expect(NEWS.map((n) => n.rank)).toEqual([2, 3, 4, 5]);
    const at = (completed: number, rankUps: number[]) =>
      initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [], rankUps });
    expect(selectors.pendingNews(at(17, [5, 17]))?.rank).toBe(2); // Apprentice note, never seen
    const s = gameReducer(at(17, [5, 17]), { type: 'NEWS_SEEN', rank: 2 });
    expect(selectors.pendingNews(s)).toBeNull(); // Cook news waits for order 21
    const next = gameReducer(at(20, [5, 17]), { type: 'NEWS_SEEN', rank: 2 });
    expect(selectors.pendingNews(next)?.title).toBe('Aomori Daily');
    expect(selectors.seenNews(next).map((n) => n.rank)).toEqual([2]);
  });
});
