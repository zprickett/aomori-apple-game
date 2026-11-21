import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  isCollectionComplete,
  offerFor,
  orderForIndex,
  waitingAfter,
  recipeLockText,
  recipeUnlockAt,
  stallLevel,
  unlockConditionText,
  unlockedApples,
  unlockedRecipes,
  unlocksEarnedAt,
} from '../progression.ts';
import { JOURNEY_RECIPES } from '../ranks.ts';

describe('unlock schedule', () => {
  it('5 starter apples, then 3 new apples every 6 orders from order 3', () => {
    expect(unlockedApples(0)).toEqual(['a048', 'a081', 'a023', 'a066', 'a006']);
    expect(unlockedApples(2)).toHaveLength(5);
    expect(unlockedApples(3)).toHaveLength(8);
    expect(unlockedApples(3)).toContain('a094'); // Kogyoku, for the jam demo
    expect(unlockedApples(8)).toHaveLength(8);
    expect(unlockedApples(9)).toContain('a091'); // Alps Otome
    expect(unlockedApples(9)).toHaveLength(11);
    expect(unlockedApples(15)).toContain('a032');
    expect(unlockedApples(21)).toContain('a058');
    expect(unlockedApples(26)).not.toContain('a086');
    expect(unlockedApples(27)).toContain('a086');
    expect(unlockedApples(188)).toHaveLength(98);
    expect(unlockedApples(189)).toHaveLength(100);
    expect(unlockedApples(999)).toHaveLength(100);
  });

  it('recipes follow the ladder (a typical 10-year-old by default)', () => {
    expect(unlockedRecipes(0)).toEqual(['fresh_juice']);
    expect(unlockedRecipes(1)).toEqual(['fresh_juice']);
    expect(unlockedRecipes(2)).toEqual(['fresh_juice', 'rabbit_apples']);
    expect(unlockedRecipes(4)).not.toContain('apple_jam');
    expect(unlockedRecipes(5)).toContain('apple_jam');
    expect(unlockedRecipes(13)).not.toContain('ringo_ame');
    expect(unlockedRecipes(14)).toContain('ringo_ame');
    expect(unlockedRecipes(17)).not.toContain('hirosaki_pie');
    expect(unlockedRecipes(18)).toHaveLength(5);
    expect(unlockedRecipes(26)).toContain('jam_toast');
    expect(unlockedRecipes(31)).not.toContain('yogurt_parfait');
    expect(unlockedRecipes(32)).toContain('yogurt_parfait');
    expect(unlockedRecipes(37)).toContain('baked_apple');
    expect(unlockedRecipes(42)).toHaveLength(9);
  });

  it('a slow ladder delays its recipes; steps not reached keep them locked', () => {
    expect(unlockedRecipes(40, [5])).toEqual(['fresh_juice', 'rabbit_apples', 'apple_jam']);
    expect(unlockedRecipes(40, [5, 9, 12, 22])).toContain('hirosaki_pie');
    expect(recipeUnlockAt('hirosaki_pie', [5, 9, 12, 22])).toBe(22);
    expect(recipeUnlockAt('jam_toast', [5, 9, 12, 22, 25, 28])).toBe(28);
    expect(recipeUnlockAt('hirosaki_pie', [5])).toBeNull();
    expect(recipeLockText('hirosaki_pie', [5])).toBe('At Cook');
    expect(recipeLockText('jam_toast', [5])).toBe('At Cook ★★');
    expect(unlocksEarnedAt(22, [5, 9, 12, 22]).recipes).toEqual(['hirosaki_pie']);
  });

  it('each unlock is earned exactly once across 0..200', () => {
    const seen: string[] = [];
    for (let c = 0; c <= 200; c++) {
      const u = unlocksEarnedAt(c);
      seen.push(...u.apples, ...u.recipes);
      const batch = c >= 3 && c <= 189 && (c - 3) % 6 === 0;
      expect(u.apples).toHaveLength(batch ? (c === 189 ? 2 : 3) : 0);
    }
    expect(seen.filter((x) => /^a\d{3}$/.test(x))).toHaveLength(95);
    expect(seen.filter((x) => !/^a\d{3}$/.test(x)).sort()).toEqual(
      ['rabbit_apples', 'apple_jam', 'ringo_ame', 'hirosaki_pie', 'jam_toast', 'yogurt_parfait', 'baked_apple', 'apple_compote',
        ...JOURNEY_RECIPES.map((j) => j.id)].sort(),
    );
    expect(new Set(seen).size).toBe(seen.length);
    expect(unlocksEarnedAt(3).apples).toContain('a094');
    expect(unlocksEarnedAt(5).recipes).toEqual(['apple_jam']);
    expect(unlocksEarnedAt(14).recipes).toEqual(['ringo_ame']);
    expect(unlocksEarnedAt(0)).toEqual({ apples: [], recipes: [] });
    // Journey recipes: one every 3 orders from 8 orders after Golden Chef (order 51 on the typical ladder).
    expect(unlocksEarnedAt(59).recipes).toEqual(['apple_kinton']);
    expect(unlocksEarnedAt(89).recipes).toEqual(['festival_pie']);
    expect(unlocksEarnedAt(4)).toEqual({ apples: [], recipes: [] });
  });

  it('stall level and collection completion', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 40].map(stallLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(isCollectionComplete(188)).toBe(false);
    expect(isCollectionComplete(189)).toBe(true);
    expect(unlockConditionText('a091')).toBe('Arrives after 9 orders');
  });
});

describe('order queue', () => {
  it('onboarding, intro and demo sequence for orders 1–45', () => {
    for (const seed of [1, 7, DEFAULT_SEED, 123456789]) {
      const o = (n: number) => orderForIndex(n, seed);
      expect(o(1)).toMatchObject({ recipeId: 'fresh_juice', intro: true });
      expect(o(2).recipeId).toBe('fresh_juice'); // only juice is unlocked
      expect(o(3)).toMatchObject({ recipeId: 'rabbit_apples', intro: true });
      expect(o(4).recipeId).toBe('fresh_juice'); // not rabbit twice
      expect(o(6)).toMatchObject({ recipeId: 'apple_jam', intro: true, demo: true, suggestedAppleId: 'a094' });
      // Alps Otome (after order 9) is already waiting when the candy apple arrives.
      expect(o(15)).toMatchObject({ recipeId: 'ringo_ame', intro: true, demo: true, suggestedAppleId: 'a091' });
      expect(o(19)).toMatchObject({ recipeId: 'hirosaki_pie', intro: true });
      // Every demo apple gets exactly one demo order, after it arrives.
      const demos = Array.from({ length: 45 }, (_, i) => o(i + 1)).filter((x) => x.demo).map((x) => x.suggestedAppleId);
      expect(new Set(demos).size).toBe(demos.length);
      expect(demos).toEqual(expect.arrayContaining(['a094', 'a091', 'a032', 'a058', 'a086']));
      const pink = Array.from({ length: 45 }, (_, i) => o(i + 1)).find((x) => x.suggestedAppleId === 'a058')!;
      if (!pink.visit) expect(pink.line).toMatch(/pink/i);
      // Each recipe is introduced on the first order after it unlocks.
      for (const [rid, first] of [['fresh_juice', 1], ['rabbit_apples', 3], ['apple_jam', 6], ['ringo_ame', 15], ['hirosaki_pie', 19],
        ['jam_toast', 27], ['yogurt_parfait', 33], ['baked_apple', 38], ['apple_compote', 43]] as const) {
        const firstSeen = Array.from({ length: 45 }, (_, i) => o(i + 1)).find((x) => x.recipeId === rid)!;
        expect(firstSeen.orderNumber).toBe(first);
        expect(firstSeen.intro).toBe(true);
      }
      // Demo apples are unlocked by the time of their demo order.
      for (let n = 1; n <= 45; n++) {
        const x = o(n);
        if (x.suggestedAppleId) expect(unlockedApples(n - 1)).toContain(x.suggestedAppleId);
        if (!x.visit) expect(x.line).toContain(
          ({ fresh_juice: 'Apple Juice', rabbit_apples: 'Rabbit Apple Wedges', apple_jam: 'Apple Jam', hirosaki_pie: 'Hirosaki Apple Pie', ringo_ame: 'Mini Candy Apple',
            jam_toast: 'Toast', yogurt_parfait: 'arfait', baked_apple: 'Baked Apple', apple_compote: 'Compote' } as Record<string, string>)[x.recipeId],
        );
      }
    }
  });

  it('a later rank-up moves the intro and keeps earlier orders unchanged', () => {
    const early = Array.from({ length: 20 }, (_, i) => orderForIndex(i + 1, 9, [5, 9, 12]));
    const late = Array.from({ length: 20 }, (_, i) => orderForIndex(i + 1, 9, [5, 9, 12, 20]));
    expect(late).toEqual(early); // orders up to 20 never depend on a rank-up at 20
    expect(orderForIndex(21, 9, [5, 9, 12, 20])).toMatchObject({ recipeId: 'hirosaki_pie', intro: true });
    for (let n = 1; n <= 40; n++) expect(orderForIndex(n, 9, [5, 9, 12]).recipeId).not.toBe('hirosaki_pie');
  });

  it('never requests a locked recipe and avoids repeats for orders 1–60', () => {
    for (const seed of [0, 1, 2, 3, 99, DEFAULT_SEED]) {
      let prev: string | null = null;
      for (let n = 1; n <= 60; n++) {
        const o = orderForIndex(n, seed);
        expect(unlockedRecipes(n - 1)).toContain(o.recipeId);
        expect(o.orderId).toBe(`o-${String(n).padStart(4, '0')}`);
        expect(o.visit?.who === 'ojiichan' ? ['O'] : ['A', 'B', 'C', 'D']).toContain(o.customerId);
        if (n > 2) expect(o.recipeId).not.toBe(prev);
        prev = o.recipeId;
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = Array.from({ length: 60 }, (_, i) => orderForIndex(i + 1, 42));
    const b = Array.from({ length: 60 }, (_, i) => orderForIndex(i + 1, 42));
    expect(a).toEqual(b);
    // Out-of-order access gives the same result as sequential access.
    expect(orderForIndex(37, 777)).toEqual(orderForIndex(37, 777));
    const c = Array.from({ length: 60 }, (_, i) => orderForIndex(i + 1, 43));
    expect(c).not.toEqual(a);
  });

  it('rotation in free play covers all recipes', () => {
    const counts: Record<string, number> = {};
    for (let n = 101; n <= 200; n++) counts[orderForIndex(n, 5).recipeId] = (counts[orderForIndex(n, 5).recipeId] ?? 0) + 1;
    expect(Object.keys(counts)).toHaveLength(20);
    for (const v of Object.values(counts)) expect(v).toBeGreaterThanOrEqual(4);
  });
});

describe('two customers to choose from', () => {
  const L = [5, 9, 14, 18];
  it('a second customer is offered on everyday orders only', () => {
    for (let n = 1; n <= 30; n++) {
      const main = orderForIndex(n, 4, L);
      const offer = offerFor(main, 4, L, null);
      if (main.intro || main.visit || unlockedRecipes(n - 1, L).length < 2) { expect(offer).toBeNull(); continue; }
      expect(offer).not.toBeNull();
      expect(offer!).toMatchObject({ orderId: main.orderId, orderNumber: n, alt: true });
      expect(offer!.recipeId).not.toBe(main.recipeId);
      expect(offer!.customerId).not.toBe(main.customerId);
      expect(unlockedRecipes(n - 1, L)).toContain(offer!.recipeId);
      expect(offerFor(main, 4, L, null)).toEqual(offer); // deterministic
    }
  });

  it('the customer not picked waits once, then comes back as the second customer', () => {
    const n = Array.from({ length: 30 }, (_, i) => i + 1).find((k) => offerFor(orderForIndex(k, 4, L), 4, L, null))!;
    const main = orderForIndex(n, 4, L);
    const offer = offerFor(main, 4, L, null)!;
    const w = waitingAfter(main, offer, main, null)!; // served the queue's customer
    expect(w).toMatchObject({ recipeId: offer.recipeId, customerId: offer.customerId });
    const nextMain = { ...orderForIndex(n + 1, 4, L), intro: false, visit: undefined, recipeId: 'fresh_juice' as const, customerId: 'A' as const };
    const back = offerFor(nextMain, 4, L, { ...w, customerId: 'B', recipeId: 'rabbit_apples' });
    expect(back).toMatchObject({ waited: true, customerId: 'B', recipeId: 'rabbit_apples' });
    // Skipped again: they don't wait twice.
    expect(waitingAfter(nextMain, back, nextMain, w)).toBeNull();
    // Serving the second customer leaves the queue's customer waiting.
    expect(waitingAfter(main, offer, offer, null)).toMatchObject({ customerId: main.customerId, recipeId: main.recipeId });
    // No choice this turn: whoever waits keeps waiting.
    expect(waitingAfter(main, null, main, w)).toBe(w);
  });
});
