import { describe, expect, it } from 'vitest';
import { RECIPE_ORDER, recipe } from '../content.ts';
import { gameReducer, initialStateFromSave, selectors, type GameAction } from '../gameReducer.ts';
import { defaultSave } from '../persistence.ts';
import { DEFAULT_SEED, appleUnlockAt, ojiichanOrder, orderForIndex } from '../progression.ts';
import { RANKS, isJourneyRecipe, rankReachedAt, recipeRank, type Rank } from '../ranks.ts';

/** A full ladder from rank-up orders: ★ steps spread between the ranks. */
export function lad(...ranks: number[]): number[] {
  const out: number[] = [];
  ranks.forEach((r, i) => {
    out.push(r);
    const nx = ranks[i + 1];
    if (nx !== undefined) out.push(r + Math.max(1, Math.floor((nx - r) / 3)), r + Math.max(1, Math.floor((2 * (nx - r)) / 3)));
  });
  return out.slice(0, 10);
}
import { GRANDPA, NEWS, NOTEBOOK, REGULARS, STORY_BACKDROPS, backdropForRank, letterFor, notebookPage, openPages, withName } from '../story.ts';

describe('story data', () => {
  it('has exactly one notebook page per rank', () => {
    expect(NOTEBOOK.map((p) => p.rank)).toEqual(RANKS.map((r) => r.rank));
  });

  it("each riddle is about exactly the recipes that page's rank brings (journey recipes come with Stage 2)", () => {
    const ladder = RECIPE_ORDER.filter((id) => !isJourneyRecipe(id));
    for (const p of NOTEBOOK) expect([...p.riddleRecipes].sort()).toEqual(ladder.filter((id) => recipeRank(id) === p.rank).sort());
    const all = NOTEBOOK.flatMap((p) => p.riddleRecipes);
    expect(all.sort()).toEqual([...ladder].sort());
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
  const orders = (ladder: number[], n = 60, seed = 3) => Array.from({ length: n }, (_, i) => orderForIndex(i + 1, seed, ladder));

  it('four regulars, four visits each, on their own models, in order', () => {
    expect(REGULARS.map((r) => [r.name, r.customer])).toEqual([['Sota', 'A'], ['Yui', 'B'], ['Grandpa Kiyoshi', 'C'], ['Mei', 'D']]);
    for (const seed of [1, 3, DEFAULT_SEED]) {
      const L = lad(5, 15, 30, 50);
      const os = orders(L, 60, seed);
      for (const r of REGULARS) {
        const mine = os.filter((o) => o.visit?.who === r.id && o.visit.of > 0);
        expect(mine).toHaveLength(4);
        mine.forEach((o, i) => {
          expect(o.customerId).toBe(r.customer);
          expect(o.orderNumber).toBeGreaterThanOrEqual(rankReachedAt(r.visits[i].rank as Rank, L)! + r.visits[i].after);
          expect(o.line).toContain(recipe(o.recipeId).name); // {dish} filled in
          expect(o.line).not.toContain('{dish}');
        });
      }
      // Visits never replace a recipe intro or an apple demo.
      for (const o of os) if (o.visit && o.visit.of > 0) expect(o.intro || o.demo).toBeFalsy();
    }
  });

  it("every regular's story ends before Golden Chef, even for fast players", () => {
    for (const ranks of [[3, 13, 23, 38], [5, 18, 32, 51], [5, 22, 40, 64]]) {
      const L = lad(...ranks);
      const os = orders(L, 70);
      for (const r of REGULARS) {
        const last = os.filter((o) => o.visit?.who === r.id && o.visit.of > 0).at(-1)!;
        expect(last.visit!.step).toBe(4);
        expect(last.orderNumber).toBeLessThanOrEqual(ranks[3]);
      }
    }
  });

  it("Mei's last visit gives the Oirase apple long before it would arrive", () => {
    const gift = orders(lad(5, 15, 30, 50)).find((o) => o.giftAppleId);
    expect(gift).toMatchObject({ customerId: 'D', giftAppleId: 'a096' });
    expect(appleUnlockAt('a096')).toBeGreaterThan(gift!.orderNumber);
    const save = { ...defaultSave(), completedOrders: gift!.orderNumber - 1, completedOrderIds: [], ladder: lad(5, 15, 30, 50).slice(0, 9), totalPoints: 40000 };
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
    expect(ojiichanOrder(lad(5, 15, 30))).toBeNull();
    expect(ojiichanOrder(lad(5, 15, 30, 50))).toBe(51);
    expect(ojiichanOrder(lad(5, 15, 30, 52))).toBe(56);
    const os = orders(lad(5, 15, 30, 52), 70);
    expect(os.filter((o) => o.customerId === 'O').map((o) => o.orderNumber)).toEqual([56]);
    expect(orders(lad(5, 15, 30), 70).some((o) => o.customerId === 'O')).toBe(false);
  });

  it('a later rank-up never changes orders already served', () => {
    expect(orders([5, 8, 11, 15, 18], 25)).toEqual(orders([5, 8, 11, 15, 18, 25], 25)); // jam toast at 25 changes only order 26 on
  });

  it('a note from a regular comes only after you have met them', () => {
    // Apprentice news shows at the start of day 2 at the earliest (after order 5).
    for (const n of NEWS) {
      const who = REGULARS.find((r) => r.name === n.from);
      if (!who) continue;
      // Even the fastest Apprentice (order 3): news on day 2, after meeting.
      const L = lad(3, 13, 23, 38);
      const firstNews = Math.ceil(rankReachedAt(n.rank, L)! / 5) * 5 + 1;
      for (const seed of [1, 3, DEFAULT_SEED]) {
        const met = orders(L, 60, seed).find((o) => o.visit?.who === who.id);
        expect(met!.orderNumber).toBeLessThan(firstNews);
      }
    }
  });

  it('news shows at the start of the day after a rank-up, once', () => {
    expect(NEWS.map((n) => n.rank)).toEqual([2, 3, 4, 5]);
    const L = [5, 9, 12, 17];
    const at = (completed: number, ladder: number[]) =>
      initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [], ladder, totalPoints: 12000 });
    expect(selectors.pendingNews(at(17, L))?.rank).toBe(2); // Apprentice note, never seen
    const s = gameReducer(at(17, L), { type: 'NEWS_SEEN', rank: 2 });
    expect(selectors.pendingNews(s)).toBeNull(); // Cook news waits for order 21
    const next = gameReducer(at(20, L), { type: 'NEWS_SEEN', rank: 2 });
    expect(selectors.pendingNews(next)?.title).toBe('Aomori Daily');
    expect(selectors.seenNews(next).map((n) => n.rank)).toEqual([2]);
  });
});


describe('news never makes a third pop-up', () => {
  it('a rank-up on the last order of a day moves its news one order later', () => {
    const at = (completed: number) =>
      initialStateFromSave({ ...defaultSave(), completedOrders: completed, completedOrderIds: [], ladder: [5], totalPoints: 1500 });
    expect(selectors.pendingNews(at(5))).toBeNull(); // order 6: right after the rank-up and the recap
    expect(selectors.pendingNews(at(6))?.rank).toBe(2);
  });
});
