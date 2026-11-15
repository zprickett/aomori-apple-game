import { describe, expect, it } from 'vitest';
import rawProto from '../../data/prototype_game_data.json';
import rawCatalog from '../../data/recipe_actions_20.json';
import {
  APPLES,
  RECIPES,
  apple,
  fitStars,
  gameplayTipFor,
  pairing,
  recipe,
  validateContent,
  validateExpansion,
  zeroFitTip,
  type RawCatalog,
  type RawPrototype,
} from '../content.ts';

const proto = () => structuredClone(rawProto) as unknown as RawPrototype;
const catalog = () => structuredClone(rawCatalog) as unknown as RawCatalog;

describe('content counts and matrix', () => {
  it('keeps the researched prototype data valid (10 apples, 5 recipes, 50 pairings)', () => {
    expect(validateContent()).toEqual({ apples: 10, recipes: 5, pairings: 50, timedSteps: 71 });
  });

  it('has 100 apples in unlock order and 9 playable recipes', () => {
    expect(APPLES).toHaveLength(100);
    expect(new Set(APPLES.map((a) => a.id)).size).toBe(100);
    expect(APPLES.slice(0, 5).map((a) => a.id)).toEqual(['a048', 'a081', 'a023', 'a066', 'a006']);
    expect(RECIPES.map((r) => r.id)).toEqual([
      'fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame',
      'jam_toast', 'yogurt_parfait', 'baked_apple', 'apple_compote',
    ]);
    expect(validateExpansion()).toEqual({ apples: 100, recipes: 9, pairings: 2000 });
  });

  it('uses the 100×20 matrix for new apples and recipes', () => {
    expect(fitStars('a028', 'hirosaki_pie')).toBe(3); // Granny Smith
    expect(fitStars('a021', 'red_flesh_tart')).toBe(3); // Rose Pearl
    expect(fitStars('a094', 'baked_apple')).toBe(3); // Kogyoku
    expect(fitStars('a032', 'yogurt_parfait')).toBe(0); // Bramley
    expect(apple('a021').fleshRed).toBe(true);
    expect(apple('a005')).toMatchObject({ sizeLabel: 'M', weightG: 300 }); // Kio "300g程"
    expect(apple('a059')).toMatchObject({ sizeLabel: 'L', weightG: 850, sizeClass: 'large' });
    expect(apple('a091')).toMatchObject({ sizeLabel: 'S', sizeClass: 'mini' });
    expect(apple('a084').sizeEstimated).toBe(true);
    expect(APPLES.every((a) => ['S', 'M', 'L'].includes(a.sizeLabel) && a.weightG > 0)).toBe(true);
    for (const a of APPLES) expect(a.sizeLabel).toBe(a.weightG < 250 ? 'S' : a.weightG < 350 ? 'M' : 'L');
  });

  it('matrix values equal the JSON for all 50 pairings', () => {
    const p = proto();
    expect(p.pairings).toHaveLength(50);
    let checked = 0;
    for (const row of p.pairings) {
      expect(fitStars(row.apple_id, row.recipe_id)).toBe(row.fit_stars);
      expect(pairing(row.apple_id, row.recipe_id).reason).toBe(row.reason);
      checked++;
    }
    expect(checked).toBe(50);
    for (const a of APPLES) for (const r of RECIPES) expect([0, 1, 2, 3]).toContain(fitStars(a.id, r.id));
  });

  it('keeps the key recorded fits', () => {
    expect(fitStars('a032', 'rabbit_apples')).toBe(0);
    expect(fitStars('a091', 'ringo_ame')).toBe(3);
    expect(fitStars('a048', 'hirosaki_pie')).toBe(2);
  });

  it('throws on unknown ids', () => {
    expect(() => fitStars('a999', 'fresh_juice')).toThrow();
    expect(() => apple('nope')).toThrow();
    expect(() => recipe('festival_pie')).toThrow();
  });
});

describe('recipes', () => {
  it('uses player-facing names and 1/2/3/5/4 actions', () => {
    expect(RECIPES.map((r) => [r.name, r.steps.length])).toEqual([
      ['Fresh Apple Juice', 1],
      ['Rabbit Apple Wedges', 2],
      ['Apple Jam', 3],
      ['Hirosaki Apple Pie', 5],
      ['Mini Candy Apple', 4],
      ['Apple Jam Toast', 1],
      ['Apple Yogurt Parfait', 4],
      ['Baked Apple', 3],
      ['Shiny Apple Compote', 3],
    ]);
    expect(recipe('baked_apple').preserveWholeApple).toBe(true);
    expect(recipe('baked_apple').nameJa).toBe('焼きりんご');
    expect(recipe('yogurt_parfait').steps.map((s) => s.gesture)).toEqual(['tap', 'swipe', 'tap', 'tap']);
    expect(recipe('yogurt_parfait').variantId).toBe('yogurt_parfait_game_v2_override');
    expect(recipe('ringo_ame').preserveWholeApple).toBe(true);
    expect(recipe('ringo_ame').steps.every((s) => s.gesture === 'tap')).toBe(true);
    expect(recipe('hirosaki_pie').steps.map((s) => s.gesture)).toEqual(['swipe', 'tap', 'circle', 'tap', 'tap']);
    expect(recipe('apple_jam').steps[2].timing).toEqual({ duration_ms: 8000, target_ms: 6000, perfect_ms: 450, good_ms: 1000, ok_ms: 1600 });
    expect(recipe('fresh_juice').bridges).toHaveLength(2);
    expect(recipe('ringo_ame').nameJa).toBe('ミニりんご飴');
  });
});

describe('apples', () => {
  it('has authored visuals, size scale and flesh colour', () => {
    expect(apple('a048').skin).toEqual({ base: '#D9473A', second: '#F2B35A', pattern: 'streak' });
    expect(apple('a058').flesh).toBe('#F29AA6');
    expect(apple('a058').fleshRed).toBe(true);
    expect(apple('a094').fleshRed).toBe(false); // red skin ≠ red flesh
    expect(apple('a048').flesh).toBe('#FFF1C9');
    // 3D scale follows the typical weight (cube root vs a 300 g apple, clamped 0.6–1.3)
    expect(apple('a091').scale).toBe(0.6); // Alps Otome ~38 g
    expect(apple('a094').scale).toBeCloseTo(0.874, 3); // Kogyoku ~200 g
    expect(apple('a032').scale).toBe(1); // Bramley ~300 g
    expect(apple('a059').scale).toBe(1.3); // Stark Jumbo ~850 g
    expect(apple('a086').browning).toBe('resistant');
    expect(apple('a091').sizeClass).toBe('mini');
    expect(APPLES.every((a) => a.traitHint.length > 0 && !a.traitHint.includes('\n'))).toBe(true);
  });
});

describe('tips', () => {
  it('names only playable recipes', () => {
    const names = RECIPES.map((r) => r.name);
    for (const a of APPLES) {
      const tip = gameplayTipFor(a.id);
      expect(tip).not.toMatch(/Whole Apple Pie|Dorayaki|Daifuku|Kinton|Jelly|Cheesecake|Shumai|Keema/);
      expect(names.some((n) => tip.includes(n))).toBe(true);
    }
    expect(gameplayTipFor('a048', ['fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame'])).toBe('Try Fuji in Fresh Apple Juice or Rabbit Apple Wedges!');
    expect(gameplayTipFor('a086')).toContain('resists browning');
    expect(gameplayTipFor('a086')).not.toMatch(/\d/);
  });

  it('can restrict to available recipes', () => {
    expect(gameplayTipFor('a066', ['fresh_juice', 'rabbit_apples'])).toBe('Try Jonagold in Fresh Apple Juice!');
  });

  it('suggests a cooked dish for Bramley rabbit zero', () => {
    const tip = zeroFitTip('a032', 'rabbit_apples');
    expect(tip.startsWith('Try this apple in another dish!')).toBe(true);
    expect(tip).toContain('Apple Jam');
    expect(tip).toContain('Hirosaki Apple Pie');
  });
});

describe('validateContent rejects mutated catalogs', () => {
  it('swipe in whole-apple recipe', () => {
    const c = catalog();
    c.recipes.find((r) => r.recipe_id === 'ringo_ame')!.steps[0].gesture = 'swipe';
    expect(() => validateContent(proto(), c)).toThrow(/swipe in whole-apple/);
    const c2 = catalog();
    c2.recipes.find((r) => r.recipe_id === 'baked_apple')!.steps[0].gesture = 'swipe';
    expect(() => validateContent(proto(), c2)).toThrow(/whole-apple/);
  });
  it('circle in ringo_ame', () => {
    const c = catalog();
    c.recipes.find((r) => r.recipe_id === 'ringo_ame')!.steps[1].gesture = 'circle';
    expect(() => validateContent(proto(), c)).toThrow(/circle/);
  });
  it('unknown gesture', () => {
    const c = catalog();
    c.recipes[0].steps[0].gesture = 'hold';
    expect(() => validateContent(proto(), c)).toThrow(/vocabulary/);
  });
  it('duplicate ids', () => {
    const p = proto();
    p.apples[1].id = p.apples[0].id;
    expect(() => validateContent(p, catalog())).toThrow(/duplicate apple/);
    const p2 = proto();
    p2.recipes[1].id = p2.recipes[0].id;
    expect(() => validateContent(p2, catalog())).toThrow(/duplicate recipe/);
    const p3 = proto();
    p3.pairings[1] = { ...p3.pairings[0] };
    expect(() => validateContent(p3, catalog())).toThrow(/duplicate pairing/);
    const c = catalog();
    c.recipes[1].steps[0].id = c.recipes[0].steps[0].id;
    expect(() => validateContent(proto(), c)).toThrow(/duplicate step/);
  });
  it('score 4 or -1', () => {
    const p = proto();
    p.pairings[0].fit_stars = 4;
    expect(() => validateContent(p, catalog())).toThrow(/outside 0–3/);
    const p2 = proto();
    p2.pairings[0].fit_stars = -1;
    expect(() => validateContent(p2, catalog())).toThrow(/outside 0–3/);
  });
  it('wrong counts', () => {
    const p = proto();
    p.apples.pop();
    expect(() => validateContent(p, catalog())).toThrow(/10 apples/);
    const p2 = proto();
    p2.pairings.pop();
    expect(() => validateContent(p2, catalog())).toThrow(/50/);
    const c = catalog();
    const jam = c.recipes.find((r) => r.recipe_id === 'apple_jam')!;
    jam.steps.pop();
    jam.action_count = 2;
    expect(() => validateContent(proto(), c)).toThrow(/apple_jam must have 3/);
  });
});
