import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  isCollectionComplete,
  orderForIndex,
  recipeLockText,
  recipeUnlockAt,
  stallLevel,
  unlockConditionText,
  unlockedApples,
  unlockedRecipes,
  unlocksEarnedAt,
} from '../progression.ts';

describe('unlock schedule', () => {
  it('5 starter apples, then one new apple per order (prototype apples keep 3/6/9/12/15)', () => {
    expect(unlockedApples(0)).toEqual(['a048', 'a081', 'a023', 'a066', 'a006']);
    expect(unlockedApples(1)).toEqual(['a048', 'a081', 'a023', 'a066', 'a006', 'a045']);
    expect(unlockedApples(2)).toHaveLength(7);
    expect(unlockedApples(2)).not.toContain('a094');
    expect(unlockedApples(3)).toContain('a094');
    expect(unlockedApples(5)).not.toContain('a091');
    expect(unlockedApples(6)).toContain('a091');
    expect(unlockedApples(9)).toContain('a032');
    expect(unlockedApples(12)).toContain('a058');
    expect(unlockedApples(14)).not.toContain('a086');
    expect(unlockedApples(15)).toHaveLength(20);
    expect(unlockedApples(94)).toHaveLength(99);
    expect(unlockedApples(95)).toHaveLength(100);
    expect(unlockedApples(999)).toHaveLength(100);
  });

  it('recipes follow the rank schedule (earliest ranks at 5/15/30/50 by default)', () => {
    expect(unlockedRecipes(0)).toEqual(['fresh_juice']);
    expect(unlockedRecipes(1)).toEqual(['fresh_juice']);
    expect(unlockedRecipes(2)).toEqual(['fresh_juice', 'rabbit_apples']);
    expect(unlockedRecipes(4)).not.toContain('apple_jam');
    expect(unlockedRecipes(5)).toContain('apple_jam');
    expect(unlockedRecipes(8)).toContain('ringo_ame');
    expect(unlockedRecipes(14)).not.toContain('hirosaki_pie');
    expect(unlockedRecipes(15)).toHaveLength(5);
    expect(unlockedRecipes(21)).toContain('jam_toast');
    expect(unlockedRecipes(29)).not.toContain('yogurt_parfait');
    expect(unlockedRecipes(30)).toContain('yogurt_parfait');
    expect(unlockedRecipes(36)).toContain('baked_apple');
    expect(unlockedRecipes(42)).toHaveLength(9);
  });

  it('a late rank-up delays its recipes; no rank-up keeps them locked', () => {
    expect(unlockedRecipes(40, [5])).toEqual(['fresh_juice', 'rabbit_apples', 'apple_jam', 'ringo_ame']);
    expect(unlockedRecipes(40, [5, 22])).toContain('hirosaki_pie');
    expect(recipeUnlockAt('hirosaki_pie', [5, 22])).toBe(22);
    expect(recipeUnlockAt('jam_toast', [5, 22])).toBe(28);
    expect(recipeUnlockAt('hirosaki_pie', [5])).toBeNull();
    expect(recipeLockText('hirosaki_pie', [5])).toBe('Rank: Cook');
    expect(recipeLockText('jam_toast', [5, 22])).toBe('After 28 orders');
    expect(unlocksEarnedAt(22, [5, 22]).recipes).toEqual(['hirosaki_pie']);
  });

  it('each unlock is earned exactly once across 0..120', () => {
    const seen: string[] = [];
    for (let c = 0; c <= 120; c++) {
      const u = unlocksEarnedAt(c);
      seen.push(...u.apples, ...u.recipes);
      if (c >= 1 && c <= 95) expect(u.apples).toHaveLength(1);
    }
    expect(seen.filter((x) => x.startsWith('a') && /^a\d{3}$/.test(x))).toHaveLength(95);
    expect(seen.filter((x) => !/^a\d{3}$/.test(x)).sort()).toEqual(
      ['rabbit_apples', 'apple_jam', 'ringo_ame', 'hirosaki_pie', 'jam_toast', 'yogurt_parfait', 'baked_apple', 'apple_compote'].sort(),
    );
    expect(new Set(seen).size).toBe(seen.length);
    expect(unlocksEarnedAt(3)).toEqual({ apples: ['a094'], recipes: [] });
    expect(unlocksEarnedAt(5).recipes).toEqual(['apple_jam']);
    expect(unlocksEarnedAt(8).recipes).toEqual(['ringo_ame']);
    expect(unlocksEarnedAt(0)).toEqual({ apples: [], recipes: [] });
    expect(unlocksEarnedAt(96)).toEqual({ apples: [], recipes: [] });
  });

  it('stall level and collection completion', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 40].map(stallLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(isCollectionComplete(94)).toBe(false);
    expect(isCollectionComplete(95)).toBe(true);
    expect(unlockConditionText('a091')).toBe('Arrives after 6 orders');
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
      expect(o(9)).toMatchObject({ recipeId: 'ringo_ame', intro: true, demo: true, suggestedAppleId: 'a091' });
      expect(o(10)).toMatchObject({ recipeId: 'apple_jam', demo: true, suggestedAppleId: 'a032' });
      expect(o(13)).toMatchObject({ recipeId: 'apple_jam', demo: true, suggestedAppleId: 'a058' });
      expect(o(13).line).toMatch(/pink/i);
      expect(o(16)).toMatchObject({ recipeId: 'hirosaki_pie', intro: true });
      expect(o(17)).toMatchObject({ recipeId: 'rabbit_apples', demo: true, suggestedAppleId: 'a086' });
      // Each recipe is introduced on the first order after it unlocks.
      for (const [rid, first] of [['fresh_juice', 1], ['rabbit_apples', 3], ['apple_jam', 6], ['ringo_ame', 9], ['hirosaki_pie', 16],
        ['jam_toast', 22], ['yogurt_parfait', 31], ['baked_apple', 37], ['apple_compote', 43]] as const) {
        const firstSeen = Array.from({ length: 45 }, (_, i) => o(i + 1)).find((x) => x.recipeId === rid)!;
        expect(firstSeen.orderNumber).toBe(first);
        expect(firstSeen.intro).toBe(true);
      }
      // Demo apples are unlocked by the time of their demo order.
      for (let n = 1; n <= 45; n++) {
        const x = o(n);
        if (x.suggestedAppleId) expect(unlockedApples(n - 1)).toContain(x.suggestedAppleId);
        expect(x.line).toContain(
          ({ fresh_juice: 'Apple Juice', rabbit_apples: 'Rabbit Apple Wedges', apple_jam: 'Apple Jam', hirosaki_pie: 'Hirosaki Apple Pie', ringo_ame: 'Mini Candy Apple',
            jam_toast: 'Toast', yogurt_parfait: 'arfait', baked_apple: 'Baked Apple', apple_compote: 'Compote' } as Record<string, string>)[x.recipeId],
        );
      }
    }
  });

  it('a later rank-up moves the intro and keeps earlier orders unchanged', () => {
    const early = Array.from({ length: 20 }, (_, i) => orderForIndex(i + 1, 9, [5]));
    const late = Array.from({ length: 20 }, (_, i) => orderForIndex(i + 1, 9, [5, 20]));
    expect(late).toEqual(early); // orders up to 20 never depend on a rank-up at 20
    expect(orderForIndex(21, 9, [5, 20])).toMatchObject({ recipeId: 'hirosaki_pie', intro: true });
    for (let n = 1; n <= 40; n++) expect(orderForIndex(n, 9, [5]).recipeId).not.toBe('hirosaki_pie');
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
    for (let n = 41; n <= 100; n++) counts[orderForIndex(n, 5).recipeId] = (counts[orderForIndex(n, 5).recipeId] ?? 0) + 1;
    expect(Object.keys(counts)).toHaveLength(9);
    for (const v of Object.values(counts)) expect(v).toBeGreaterThanOrEqual(5);
  });
});
