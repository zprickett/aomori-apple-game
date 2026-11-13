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
  zeroFitTip,
  type RawCatalog,
  type RawPrototype,
} from '../content.ts';

const proto = () => structuredClone(rawProto) as unknown as RawPrototype;
const catalog = () => structuredClone(rawCatalog) as unknown as RawCatalog;

describe('content counts and matrix', () => {
  it('has exactly 10 apples, 5 recipes and 50 pairings in prototype order', () => {
    expect(APPLES.map((a) => a.id)).toEqual(['a048', 'a081', 'a023', 'a066', 'a006', 'a094', 'a091', 'a032', 'a058', 'a086']);
    expect(RECIPES.map((r) => r.id)).toEqual(['fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame']);
    expect(validateContent()).toEqual({ apples: 10, recipes: 5, pairings: 50, timedSteps: 71 });
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
    ]);
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
    expect(apple('a091').scale).toBe(0.65);
    expect(apple('a094').scale).toBe(0.85);
    expect(apple('a032').scale).toBe(1.12);
    expect(apple('a048').scale).toBe(1);
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
      expect(tip).not.toMatch(/Whole Apple Pie|Parfait|Dorayaki|Daifuku|Kinton|Jelly|Baked Apple/);
      expect(names.some((n) => tip.includes(n))).toBe(true);
    }
    expect(gameplayTipFor('a048')).toBe('Try Fuji in Fresh Apple Juice or Rabbit Apple Wedges!');
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
