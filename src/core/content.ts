/**
 * Typed adapter over the authored content:
 *   - src/data/prototype_game_data.json  (10 apples, 5 recipes, 50 fit ratings, scoring text)
 *   - src/data/recipe_actions_20.json    (v2 action plans for 20 recipes; RECIPE_ORDER lists the playable ones)
 *   - src/data/apples_expansion.json     (90 more apples, provisional details; 100-apple unlock order)
 *   - src/data/apple_visuals.json        (skin/flesh/size visuals for all 100 apples)
 *   - src/data/fit_matrix.json           (fit stars for 100 apples × 20 recipes)
 *   - src/data/recipe_action_overrides.json (design changes to action plans; the research pack stays unchanged)
 *
 * Importing this module validates the data (throws on a broken catalog) — no other side effects.
 */
import rawPrototype from '../data/prototype_game_data.json';
import rawCatalog from '../data/recipe_actions_20.json';
import rawExpansion from '../data/apples_expansion.json';
import rawVisuals from '../data/apple_visuals.json';
import rawMatrix from '../data/fit_matrix.json';
import rawOverrides from '../data/recipe_action_overrides.json';
import { validateActionCatalog } from '../data/timing_reference.mjs';
import { gradeTiming, type StepTiming } from './timing.ts';

// ---------------------------------------------------------------------------
// Raw JSON shapes (only the fields we rely on)
// ---------------------------------------------------------------------------

export interface RawApple {
  id: string;
  name_en: string;
  name_ja: string;
  overview_for_kids: string;
  game_size_class: string;
  flesh_color: string;
  browning_behavior: string | null;
  heat_behavior: { value: string | null; status: string } | null;
  game_stats_1to5: Record<StatKey, number>;
  size_source_text?: string;
  gameplay_tip?: string;
  [k: string]: unknown;
}
export interface RawRecipe {
  id: string;
  name_en: string;
  name_ja: string;
  profile: string;
  cultural_context: string;
  action_plan_id: string;
  action_count: number;
  [k: string]: unknown;
}
export interface RawPairing {
  apple_id: string;
  recipe_id: string;
  fit_stars: number;
  fit_label: string;
  rating_status: string;
  evidence_basis: string;
  confidence: string;
  reason: string;
  uncertain_inputs: string[];
  adaptation: string | null;
  [k: string]: unknown;
}
export interface RawPrototype {
  schema_version: string;
  apples: RawApple[];
  recipes: RawRecipe[];
  pairings: RawPairing[];
  scoring: { rating_scale: Record<string, string>; child_feedback: Record<string, string>; [k: string]: unknown };
  prototype_scope: { apple_order: string[]; recipe_order: string[] };
  [k: string]: unknown;
}
export interface RawStep {
  id: string;
  gesture: string;
  label: string;
  prompt: string;
  target_object: string;
  animation_event: string;
  timing: StepTiming;
  geometry_profile?: string;
  timing_event: string;
  failure_animation?: string;
}
export interface RawActionRecipe {
  recipe_id: string;
  name: string;
  prototype_playable: boolean;
  action_count: number;
  apple_form: string;
  preserve_whole_apple: boolean;
  variant_id: string;
  automatic_preparation_and_bridges: string[];
  source_urls: string[];
  research_note: string;
  steps: RawStep[];
  [k: string]: unknown;
}
export interface RawCatalog {
  schema_version: string;
  gesture_vocabulary: string[];
  recipes: RawActionRecipe[];
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Gesture = 'tap' | 'swipe' | 'circle';
export const GESTURES: readonly Gesture[] = ['swipe', 'tap', 'circle'];
export type StatKey = 'sweetness' | 'tartness' | 'juiciness' | 'raw_firmness' | 'aroma';
export type FitStars = 0 | 1 | 2 | 3;
export type SizeClass = 'standard' | 'small' | 'mini' | string;

export interface StepDef {
  id: string;
  recipeId: string;
  /** 0-based position within the recipe. */
  index: number;
  gesture: Gesture;
  label: string;
  prompt: string;
  target_object: string;
  animation_event: string;
  timing: StepTiming;
  timing_event: string;
  geometry_profile?: string;
  failure_animation?: string;
}

export interface RecipeInfo {
  id: string;
  /** Player-facing English name (build prompt), e.g. "Mini Candy Apple". */
  name: string;
  nameJa: string;
  /** name_en as stored in the data (e.g. "Mini Ringo Ame"); for developer views. */
  dataName: string;
  variantId: string;
  actionCount: number;
  preserveWholeApple: boolean;
  appleForm: string;
  /** automatic_preparation_and_bridges: [0] = before the first action, [1] = between/after actions. */
  bridges: string[];
  steps: StepDef[];
  profile: string;
  culturalContext: string;
  researchNote: string;
}

export interface SkinVisual {
  base: string;
  second: string;
  pattern: 'streak' | 'blush' | 'solid';
}

export interface AppleInfo {
  id: string;
  nameEn: string;
  nameJa: string;
  overviewForKids: string;
  /** One-line, child-facing trait hint (from overview_for_kids). */
  traitHint: string;
  stats: Record<StatKey, number>;
  sizeClass: SizeClass;
  /** True only for flesh_color 'pink_or_red' (red skin never implies red flesh). */
  fleshRed: boolean;
  /** browning_behavior from data (e.g. 'resistant') or null when unknown. */
  browning: string | null;
  /** Documented heat behaviour (e.g. 'retains_shape') or null = unknown. */
  heatBehavior: string | null;
  sizeText: string | null;
  /** S / M / L from the typical weight (S < 250 g ≤ M < 350 g ≤ L). */
  sizeLabel: 'S' | 'M' | 'L';
  /** Typical weight in grams (midpoint of the researched range, or an estimate). */
  weightG: number;
  /** True when the weight is an estimate (no researched size found). */
  sizeEstimated: boolean;
  skin: SkinVisual;
  flesh: string;
  scale: number;
}

export interface Pairing {
  appleId: string;
  recipeId: string;
  fitStars: FitStars;
  fitLabel: string;
  reason: string;
  confidence: string;
  evidenceBasis: string;
  ratingStatus: string;
  uncertainInputs: string[];
  adaptation: string | null;
}

// ---------------------------------------------------------------------------
// Authored constants
// ---------------------------------------------------------------------------

export interface RawExpansion {
  unlock_order: string[];
  apple_unlocks: { at: number; ids: string[] }[];
  apples: RawApple[];
}
export interface RawMatrix {
  recipes: string[];
  apples: Record<string, number[]>;
}
export const EXPANSION_DATA = rawExpansion as unknown as RawExpansion;
const ACTION_OVERRIDES = (rawOverrides as unknown as { recipes: Record<string, Partial<RawActionRecipe>> }).recipes;
export const FIT_MATRIX = rawMatrix as unknown as RawMatrix;

/** The 10 researched prototype apples (their data in prototype_game_data.json is authoritative). */
export const PROTOTYPE_APPLES = ['a048', 'a081', 'a023', 'a066', 'a006', 'a094', 'a091', 'a032', 'a058', 'a086'] as const;
/** All 100 apples in unlock order. */
export const APPLE_ORDER: readonly string[] = Object.freeze([...EXPANSION_DATA.unlock_order]);
/** Playable recipes, in unlock order. Add a recipe here once its stations and models exist. */
export const RECIPE_ORDER = [
  'fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame',
  'jam_toast', 'yogurt_parfait', 'baked_apple', 'apple_compote',
] as const;
export const PROTOTYPE_RECIPES = ['fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame'] as const;
export type AppleId = string;
export type RecipeId = (typeof RECIPE_ORDER)[number];

/** Names and short context for recipes beyond the prototype five (data has action plans only). */
const EXTRA_RECIPE_META: Readonly<Record<string, { name: string; nameJa: string; profile: string; context: string }>> = {
  jam_toast: { name: 'Apple Jam Toast', nameJa: 'りんごジャムトースト', profile: 'spread', context: 'Thick Japanese shokupan toast with apple jam.' },
  yogurt_parfait: { name: 'Apple Yogurt Parfait', nameJa: 'りんごヨーグルトパフェ', profile: 'raw', context: 'Layers of yogurt, diced apple and crunchy topping.' },
  baked_apple: { name: 'Baked Apple', nameJa: '焼きりんご', profile: 'baked_whole', context: 'A whole cored apple filled with butter and sugar, heated until soft.' },
  apple_compote: { name: 'Shiny Apple Compote', nameJa: 'りんごのコンポート', profile: 'cooked', context: 'Apple wedges gently cooked with sugar until glossy.' },
  apple_dorayaki: { name: 'Apple Nama Dorayaki', nameJa: 'りんご生どら焼き', profile: 'wagashi', context: 'Fluffy pancakes sandwiching cream and apple.' },
  apple_daifuku: { name: 'Azuki Apple Daifuku', nameJa: 'りんご大福', profile: 'wagashi', context: 'Soft mochi wrapped around apple and sweet azuki beans.' },
  apple_jelly: { name: 'Fresh Apple Jelly', nameJa: 'りんごゼリー', profile: 'chilled', context: 'Apple juice jelly with little apple cubes.' },
  whole_apple_pie: { name: 'Whole Apple Pie', nameJa: 'まるごとりんごパイ', profile: 'baked_whole', context: 'A whole apple wrapped in pastry and baked.' },
  apple_cheesecake: { name: 'Apple Cheesecake', nameJa: 'りんごのチーズケーキ', profile: 'baked', context: 'A cheesecake made in a rice cooker, topped with apples.' },
  apple_kinton: { name: 'Golden Apple Kinton', nameJa: 'りんごきんとん', profile: 'cooked', context: 'Sweet potato and apple mashed into golden balls.' },
  apple_keema: { name: 'Apple Keema Curry', nameJa: 'りんごキーマカレー', profile: 'savoury', context: 'Mild curry with apple for a gentle sweetness.' },
  apple_shumai: { name: 'Fluffy Apple Shumai', nameJa: 'りんごシュウマイ', profile: 'savoury', context: 'Steamed dumplings with a little apple in the filling.' },
  apple_pork: { name: 'Apple Pork Rolls', nameJa: 'りんごの豚肉巻き', profile: 'savoury', context: 'Pork rolled around apple and potato.' },
  red_flesh_tart: { name: 'Pink Apple Tart', nameJa: '赤果肉りんごのタルト', profile: 'chilled', context: 'A tart that shows off pink-fleshed apples.' },
  festival_pie: { name: 'Festival Pie', nameJa: '百りんごフェスティバルパイ', profile: 'festival', context: 'A celebration pie made with three different apples.' },
};

/** Player-facing names from the build prompt. */
export const RECIPE_DISPLAY_NAMES: Readonly<Record<RecipeId, string>> = {
  fresh_juice: 'Fresh Apple Juice',
  rabbit_apples: 'Rabbit Apple Wedges',
  apple_jam: 'Apple Jam',
  hirosaki_pie: 'Hirosaki Apple Pie',
  ringo_ame: 'Mini Candy Apple',
  jam_toast: EXTRA_RECIPE_META.jam_toast.name,
  yogurt_parfait: EXTRA_RECIPE_META.yogurt_parfait.name,
  baked_apple: EXTRA_RECIPE_META.baked_apple.name,
  apple_compote: EXTRA_RECIPE_META.apple_compote.name,
};

/** Required timed-action counts per playable recipe. */
export const REQUIRED_ACTION_COUNTS: Readonly<Record<RecipeId, number>> = {
  fresh_juice: 1,
  rabbit_apples: 2,
  apple_jam: 3,
  hirosaki_pie: 5,
  ringo_ame: 4,
  jam_toast: 1,
  yogurt_parfait: 4,
  baked_apple: 3,
  apple_compote: 3,
};

/** Recipes that cook the apple (used for "try a cooked dish" suggestions). */
export const COOKED_RECIPES: readonly RecipeId[] = ['apple_jam', 'hirosaki_pie', 'baked_apple', 'apple_compote'];
const RAW_RECIPES: readonly string[] = ['fresh_juice', 'rabbit_apples', 'yogurt_parfait'];

export const DEFAULT_FLESH = '#FFF1C9';

const VISUALS = rawVisuals as unknown as Record<string, {
  skin: SkinVisual; flesh?: string; scale?: number; weight_g?: number; size?: 'S' | 'M' | 'L'; size_basis?: string;
}>;

const SIZE_SCALE: Record<string, number> = { mini: 0.65, small: 0.85, standard: 1, large: 1.15 };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const PROTOTYPE_DATA = rawPrototype as unknown as RawPrototype;
export const ACTION_CATALOG = rawCatalog as unknown as RawCatalog;

function fail(msg: string): never {
  throw new Error(`Content validation failed: ${msg}`);
}

/**
 * Validate content. Throws on: not exactly 10 apples / 5 recipes / 50 unique pairings,
 * duplicate IDs, scores outside 0–3, gestures outside the vocabulary, swipe in a
 * preserve_whole_apple recipe, circle in ringo_ame, wrong action counts (1/2/3/5/4),
 * missing interaction bindings or invalid timing. Then runs the reference
 * `validateActionCatalog` from timing_reference.mjs.
 * Pass mutated copies to test failure cases; defaults validate the shipped data.
 */
export function validateContent(
  proto: RawPrototype = PROTOTYPE_DATA,
  catalog: RawCatalog = ACTION_CATALOG,
): { apples: number; recipes: number; pairings: number; timedSteps: number } {
  if (!proto || !Array.isArray(proto.apples) || !Array.isArray(proto.recipes) || !Array.isArray(proto.pairings))
    fail('prototype data malformed');
  if (!catalog || !Array.isArray(catalog.recipes)) fail('action catalog malformed');

  const appleIds = new Set<string>();
  for (const a of proto.apples) {
    if (appleIds.has(a.id)) fail(`duplicate apple id ${a.id}`);
    appleIds.add(a.id);
  }
  if (proto.apples.length !== 10) fail(`expected exactly 10 apples, got ${proto.apples.length}`);
  for (const id of PROTOTYPE_APPLES) if (!appleIds.has(id)) fail(`missing apple ${id}`);

  const recipeIds = new Set<string>();
  for (const r of proto.recipes) {
    if (recipeIds.has(r.id)) fail(`duplicate recipe id ${r.id}`);
    recipeIds.add(r.id);
  }
  if (proto.recipes.length !== 5) fail(`expected exactly 5 recipes, got ${proto.recipes.length}`);
  for (const id of PROTOTYPE_RECIPES) if (!recipeIds.has(id)) fail(`missing recipe ${id}`);

  const pairKeys = new Set<string>();
  for (const p of proto.pairings) {
    const key = `${p.apple_id}:${p.recipe_id}`;
    if (pairKeys.has(key)) fail(`duplicate pairing ${key}`);
    pairKeys.add(key);
    if (!appleIds.has(p.apple_id) || !recipeIds.has(p.recipe_id)) fail(`pairing ${key} references unknown id`);
    if (!Number.isInteger(p.fit_stars) || p.fit_stars < 0 || p.fit_stars > 3)
      fail(`pairing ${key} score ${String(p.fit_stars)} outside 0–3`);
  }
  if (proto.pairings.length !== 50 || pairKeys.size !== 50) fail('expected exactly 50 unique pairings');

  const vocab = new Set<string>(GESTURES);
  const catalogIds = new Set<string>();
  const stepIds = new Set<string>();
  for (const r of catalog.recipes) {
    if (catalogIds.has(r.recipe_id)) fail(`duplicate action recipe ${r.recipe_id}`);
    catalogIds.add(r.recipe_id);
    for (const s of r.steps) {
      if (stepIds.has(s.id)) fail(`duplicate step id ${s.id}`);
      stepIds.add(s.id);
      if (!vocab.has(s.gesture)) fail(`step ${s.id} gesture '${s.gesture}' outside vocabulary`);
      if (r.preserve_whole_apple && s.gesture === 'swipe') fail(`swipe in whole-apple recipe ${r.recipe_id}`);
      if (r.recipe_id === 'ringo_ame' && s.gesture === 'circle') fail('circle (syrup stirring) in ringo_ame');
    }
  }
  for (const id of PROTOTYPE_RECIPES) {
    const r = catalog.recipes.find((x) => x.recipe_id === id);
    if (!r || !r.prototype_playable) fail(`playable action plan missing for ${id}`);
    if (r.steps.length !== REQUIRED_ACTION_COUNTS[id] || r.action_count !== REQUIRED_ACTION_COUNTS[id])
      fail(`${id} must have ${REQUIRED_ACTION_COUNTS[id]} actions, has ${r.steps.length}`);
    for (const s of r.steps) {
      if (!s.target_object || !s.animation_event || !s.timing_event) fail(`step ${s.id} missing binding`);
      try {
        gradeTiming(s.timing, s.timing.target_ms);
      } catch {
        fail(`step ${s.id} has invalid timing`);
      }
    }
  }
  const ref = validateActionCatalog(catalog, proto) as { appleRecipePairings: number; timedSteps: number };
  return { apples: 10, recipes: 5, pairings: ref.appleRecipePairings, timedSteps: ref.timedSteps };
}

/**
 * Validate the expansion layer: 100 unique apples with visuals, a complete 100×20 fit matrix that
 * agrees with the 50 researched prototype pairings, and an action plan + name for every playable recipe.
 */
export function validateExpansion(
  proto: RawPrototype = PROTOTYPE_DATA,
  exp: RawExpansion = EXPANSION_DATA,
  matrix: RawMatrix = FIT_MATRIX,
  catalog: RawCatalog = ACTION_CATALOG,
): { apples: number; recipes: number; pairings: number } {
  const ids = [...proto.apples.map((a) => a.id), ...exp.apples.map((a) => a.id)];
  if (new Set(ids).size !== ids.length) fail('duplicate apple id across prototype and expansion');
  if (ids.length !== 100) fail(`expected 100 apples, got ${ids.length}`);
  const order = exp.unlock_order;
  if (order.length !== 100 || new Set(order).size !== 100 || order.some((id) => !ids.includes(id))) fail('unlock order must list each apple once');
  for (const a of exp.apples) {
    if (!a.name_en || !a.name_ja || !a.overview_for_kids) fail(`apple ${a.id} missing text`);
    for (const v of Object.values(a.game_stats_1to5)) if (!Number.isInteger(v) || v < 1 || v > 5) fail(`apple ${a.id} stat outside 1–5`);
  }
  for (const id of ids) if (!VISUALS[id]) fail(`apple ${id} has no visuals`);
  for (const r of RECIPE_ORDER) if (!matrix.recipes.includes(r)) fail(`fit matrix missing recipe ${r}`);
  let pairs = 0;
  for (const id of ids) {
    const row = matrix.apples[id];
    if (!row || row.length !== matrix.recipes.length) fail(`fit matrix row missing for ${id}`);
    for (const v of row) if (!Number.isInteger(v) || v < 0 || v > 3) fail(`fit for ${id} outside 0–3`);
    pairs += row.length;
  }
  for (const p of proto.pairings) {
    if (matrix.apples[p.apple_id][matrix.recipes.indexOf(p.recipe_id)] !== p.fit_stars) fail(`matrix disagrees with researched pairing ${p.apple_id}:${p.recipe_id}`);
  }
  void catalog;
  const vocab = new Set<string>(GESTURES);
  for (const r of RECIPE_ORDER) {
    const plan = activePlan(r);
    if (!plan) fail(`no action plan for playable recipe ${r}`);
    if (plan.steps.length !== REQUIRED_ACTION_COUNTS[r] || plan.action_count !== plan.steps.length) fail(`${r} must have ${REQUIRED_ACTION_COUNTS[r]} actions`);
    for (const st of plan.steps) {
      if (!vocab.has(st.gesture)) fail(`step ${st.id} gesture outside vocabulary`);
      if (plan.preserve_whole_apple && st.gesture === 'swipe') fail(`swipe in whole-apple recipe ${r}`);
      if (!st.target_object || !st.animation_event || !st.timing_event) fail(`step ${st.id} missing binding`);
      try { gradeTiming(st.timing, st.timing.target_ms); } catch { fail(`step ${st.id} has invalid timing`); }
    }
    if (!(PROTOTYPE_RECIPES as readonly string[]).includes(r) && !EXTRA_RECIPE_META[r]) fail(`no name for recipe ${r}`);
  }
  return { apples: ids.length, recipes: RECIPE_ORDER.length, pairings: pairs };
}

// Validate at import time (the only import side effect).
export const CONTENT_SUMMARY = validateContent();
export const EXPANSION_SUMMARY = validateExpansion();

// ---------------------------------------------------------------------------
// Build typed content
// ---------------------------------------------------------------------------

function buildApple(raw: RawApple): AppleInfo {
  const vis = VISUALS[raw.id];
  const sizeClass = raw.game_size_class;
  return {
    id: raw.id,
    nameEn: raw.name_en,
    nameJa: raw.name_ja,
    overviewForKids: raw.overview_for_kids,
    traitHint: raw.overview_for_kids.split('\n')[0].trim(),
    stats: { ...raw.game_stats_1to5 },
    sizeClass,
    fleshRed: raw.flesh_color === 'pink_or_red',
    browning: raw.browning_behavior ?? null,
    heatBehavior: raw.heat_behavior && raw.heat_behavior.status === 'documented' ? raw.heat_behavior.value : null,
    sizeText: typeof raw.size_source_text === 'string' ? raw.size_source_text : null,
    sizeLabel: vis.size ?? 'M',
    weightG: vis.weight_g ?? 300,
    sizeEstimated: vis.size_basis === 'estimate',
    skin: { ...vis.skin },
    flesh: vis.flesh ?? DEFAULT_FLESH,
    scale: vis.scale ?? SIZE_SCALE[sizeClass] ?? 1,
  };
}

/** Action plan used by the game: the research pack's plan with any design override applied. */
export function activePlan(id: string): RawActionRecipe | undefined {
  const base = ACTION_CATALOG.recipes.find((r) => r.recipe_id === id);
  const o = ACTION_OVERRIDES[id];
  return base && o ? { ...base, ...o, recipe_id: base.recipe_id, variant_id: `${base.variant_id}_override` } : base;
}

function buildRecipe(id: RecipeId): RecipeInfo {
  const plan = activePlan(id)!;
  const proto = PROTOTYPE_DATA.recipes.find((r) => r.id === id);
  const extra = EXTRA_RECIPE_META[id];
  const raw = proto ?? { name_ja: extra.nameJa, name_en: plan.name, profile: extra.profile, cultural_context: extra.context };
  return {
    id,
    name: RECIPE_DISPLAY_NAMES[id],
    nameJa: raw.name_ja,
    dataName: raw.name_en,
    variantId: plan.variant_id,
    actionCount: plan.action_count,
    preserveWholeApple: plan.preserve_whole_apple,
    appleForm: plan.apple_form,
    bridges: [...plan.automatic_preparation_and_bridges],
    profile: raw.profile,
    culturalContext: raw.cultural_context,
    researchNote: plan.research_note,
    steps: plan.steps.map((s, index) => ({
      id: s.id,
      recipeId: id,
      index,
      gesture: s.gesture as Gesture,
      label: s.label,
      prompt: s.prompt,
      target_object: s.target_object,
      animation_event: s.animation_event,
      timing: { ...s.timing },
      timing_event: s.timing_event,
      geometry_profile: s.geometry_profile,
      failure_animation: s.failure_animation,
    })),
  };
}

const RAW_APPLES = new Map<string, RawApple>([...PROTOTYPE_DATA.apples, ...EXPANSION_DATA.apples].map((a) => [a.id, a]));
/** All 100 apples in unlock order. */
export const APPLES: readonly AppleInfo[] = Object.freeze(APPLE_ORDER.map((id) => buildApple(RAW_APPLES.get(id)!)));
/** The 5 playable recipes in order fresh_juice, rabbit_apples, apple_jam, hirosaki_pie, ringo_ame. */
export const RECIPES: readonly RecipeInfo[] = Object.freeze(RECIPE_ORDER.map(buildRecipe));

const MATRIX_PAIRINGS: Array<[string, Pairing]> = [];
for (const [appleId, row] of Object.entries(FIT_MATRIX.apples)) {
  row.forEach((fit, i) => {
    const recipeId = FIT_MATRIX.recipes[i];
    MATRIX_PAIRINGS.push([`${appleId}:${recipeId}`, {
      appleId, recipeId, fitStars: fit as FitStars,
      fitLabel: String(PROTOTYPE_DATA.scoring.rating_scale[String(fit)] ?? ''),
      reason: 'Fit from the 100-apple × 20-recipe matrix.',
      confidence: 'matrix', evidenceBasis: 'apple_recipe_matrix', ratingStatus: 'matrix',
      uncertainInputs: [], adaptation: null,
    }]);
  });
}
/** Matrix fits for every apple × recipe, overridden by the 50 researched prototype pairings. */
const PAIRINGS = new Map<string, Pairing>([...MATRIX_PAIRINGS,
  ...PROTOTYPE_DATA.pairings.map((p) => [
    `${p.apple_id}:${p.recipe_id}`,
    {
      appleId: p.apple_id,
      recipeId: p.recipe_id,
      fitStars: p.fit_stars as FitStars,
      fitLabel: p.fit_label,
      reason: p.reason,
      confidence: p.confidence,
      evidenceBasis: p.evidence_basis,
      ratingStatus: p.rating_status,
      uncertainInputs: [...p.uncertain_inputs],
      adaptation: p.adaptation,
    },
  ] as [string, Pairing]),
]);

/** Rating words for 0–3 (from data): 0 'Bad fit', 1 'OK', 2 'Good', 3 'Best'. */
export const RATING_LABELS: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(Object.entries(PROTOTYPE_DATA.scoring.rating_scale).map(([k, v]) => [Number(k), v])),
);
/** Data child feedback for finished stars 0–3. */
export const CHILD_FEEDBACK: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(Object.entries(PROTOTYPE_DATA.scoring.child_feedback).map(([k, v]) => [Number(k), v])),
);

export const ZERO_FIT_FEEDBACK = 'Try this apple in another dish!';

export function isAppleId(id: unknown): id is AppleId {
  return typeof id === 'string' && (APPLE_ORDER as readonly string[]).includes(id);
}
export function isRecipeId(id: unknown): id is RecipeId {
  return typeof id === 'string' && (RECIPE_ORDER as readonly string[]).includes(id);
}

/** Lookup an apple; throws on unknown id. */
export function apple(id: string): AppleInfo {
  const a = APPLES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown apple ${id}`);
  return a;
}
/** Lookup a recipe; throws on unknown id. */
export function recipe(id: string): RecipeInfo {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown recipe ${id}`);
  return r;
}
/** Full pairing record (reason, confidence, evidence…). Throws on unknown ids. */
export function pairing(appleId: string, recipeId: string): Pairing {
  const p = PAIRINGS.get(`${appleId}:${recipeId}`);
  if (!p) throw new Error(`Unknown apple or recipe ID: ${appleId}:${recipeId}`);
  return { ...p, uncertainInputs: [...p.uncertainInputs] };
}
/** Researched apple-fit stars (0–3), exactly as stored in the data. */
export function fitStars(appleId: string, recipeId: string): FitStars {
  return pairing(appleId, recipeId).fitStars;
}

/** "A", "A or B", "A, B or C". */
export function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function bestRecipesFor(appleId: string, pool: readonly RecipeInfo[]): RecipeInfo[] {
  for (const level of [3, 2, 1] as const) {
    const hits = pool.filter((r) => fitStars(appleId, r.id) === level);
    if (hits.length) return hits;
  }
  return [];
}

function poolFrom(available?: readonly string[], exclude?: string): RecipeInfo[] {
  let pool = RECIPES.filter((r) => r.id !== exclude);
  if (available) {
    const filtered = pool.filter((r) => available.includes(r.id));
    if (filtered.length) pool = filtered;
  }
  return pool;
}

/**
 * Child-facing tip naming only PLAYABLE recipes (the data's gameplay_tip mentions future dishes).
 * Picks this apple's fit-3 playable recipes (else fit-2, else fit-1), optionally restricted to
 * `available` (e.g. unlocked) recipe ids. Adds qualitative, data-backed notes for red flesh
 * (Kurenai no Yume) and browning resistance (Chiyuki). Never invents numbers.
 */
export function gameplayTipFor(appleId: string, available?: readonly string[]): string {
  const a = apple(appleId);
  const best = bestRecipesFor(appleId, poolFrom(available));
  let tip = `Try ${a.nameEn} in ${joinOr(best.map((r) => r.name))}!`;
  if (a.fleshRed) tip += ' Its pink flesh can make pink jam.';
  if (a.browning === 'resistant') tip += ' Its cut flesh resists browning.';
  return tip;
}

/**
 * Tip for a 0-fit pairing: "Try this apple in another dish!" plus the apple's best playable
 * alternative. For raw dishes (rabbit wedges / juice) cooked recipes are preferred,
 * e.g. Bramley × rabbit → "…Bramley is Best in Apple Jam or Hirosaki Apple Pie."
 */
export function zeroFitTip(appleId: string, recipeId: string, available?: readonly string[]): string {
  const a = apple(appleId);
  let pool = poolFrom(available, recipeId);
  if (RAW_RECIPES.includes(recipeId)) {
    const cooked = pool.filter((r) => (COOKED_RECIPES as readonly string[]).includes(r.id));
    if (cooked.length && bestRecipesFor(appleId, cooked).length) pool = cooked;
  }
  const best = bestRecipesFor(appleId, pool);
  if (!best.length) return ZERO_FIT_FEEDBACK;
  const level = RATING_LABELS[fitStars(appleId, best[0].id)];
  return `${ZERO_FIT_FEEDBACK} ${a.nameEn} is ${level} in ${joinOr(best.map((r) => r.name))}.`;
}

/** Apples ranked best-first for a recipe (fit desc, then prototype order). */
export function bestApplesFor(recipeId: string, pool: readonly string[] = APPLE_ORDER): AppleInfo[] {
  return APPLES.filter((a) => pool.includes(a.id))
    .map((a, i) => ({ a, i, f: fitStars(a.id, recipeId) }))
    .sort((x, y) => y.f - x.f || x.i - y.i)
    .map((x) => x.a);
}

// ---------------------------------------------------------------------------
// Why an apple fits a dish (apple picker)
// ---------------------------------------------------------------------------

/** What each dish wants most from an apple, most important first. */
const DISH_WANTS: Readonly<Record<string, readonly StatKey[]>> = Object.freeze({
  fresh_juice: ['juiciness', 'sweetness'],
  rabbit_apples: ['raw_firmness', 'sweetness'],
  apple_jam: ['tartness', 'aroma'],
  ringo_ame: ['raw_firmness', 'tartness'],
  hirosaki_pie: ['tartness', 'raw_firmness'],
  jam_toast: ['tartness', 'sweetness'],
  yogurt_parfait: ['raw_firmness', 'sweetness'],
  baked_apple: ['tartness', 'raw_firmness'],
  apple_compote: ['raw_firmness', 'tartness'],
});
const STRONG: Readonly<Record<StatKey, string>> = { sweetness: 'sweet', tartness: 'tangy', juiciness: 'juicy', raw_firmness: 'crunchy', aroma: 'smells lovely' };
const WEAK: Readonly<Record<StatKey, string>> = { sweetness: 'not very sweet', tartness: 'not very tangy', juiciness: 'not very juicy', raw_firmness: 'a bit soft', aroma: 'light on smell' };
const SHORT_DISH: Readonly<Record<string, string>> = {
  fresh_juice: 'juice', rabbit_apples: 'rabbit wedges', apple_jam: 'jam', ringo_ame: 'a candy apple', hirosaki_pie: 'pie',
  jam_toast: 'jam toast', yogurt_parfait: 'a parfait', baked_apple: 'baking', apple_compote: 'compote',
};

/**
 * One short, kid-friendly line on why this apple suits (or doesn't suit) a dish, from the apple's
 * taste stats and what the dish wants. Agrees with the fit stars; never invents numbers.
 */
export function fitReason(appleId: string, recipeId: string): string {
  const a = apple(appleId);
  const fit = fitStars(appleId, recipeId);
  const wants = DISH_WANTS[recipeId] ?? [];
  const dish = SHORT_DISH[recipeId] ?? recipe(recipeId).name;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (recipeId === 'ringo_ame' && a.sizeClass === 'mini') return 'Tiny enough for a candy apple stick!';
  const strong = wants.filter((k) => a.stats[k] >= 4);
  const weak = wants.filter((k) => a.stats[k] <= 2);
  if (fit >= 3) return strong.length ? `${cap(strong.map((k) => STRONG[k]).join(' and '))}: perfect for ${dish}!` : `A great pick for ${dish}!`;
  if (fit === 2) return strong.length ? `Nice and ${STRONG[strong[0]]}. Good for ${dish}.` : `Good for ${dish}.`;
  if (fit === 1) return weak.length ? `${cap(WEAK[weak[0]])} for ${dish}. It works!` : `It works for ${dish}.`;
  return weak.length ? `${cap(WEAK[weak[0]])} for ${dish}. Try another apple!` : `Not great for ${dish}. Try another apple!`;
}
