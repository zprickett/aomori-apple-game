/**
 * Typed adapter over the authored content:
 *   - src/data/prototype_game_data.json  (10 apples, 5 recipes, 50 fit ratings, scoring text)
 *   - src/data/recipe_actions_20.json    (v2 action plans; only the 5 prototype_playable ones are used)
 *
 * Importing this module validates the data (throws on a broken catalog) — no other side effects.
 */
import rawPrototype from '../data/prototype_game_data.json';
import rawCatalog from '../data/recipe_actions_20.json';
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

export const APPLE_ORDER = ['a048', 'a081', 'a023', 'a066', 'a006', 'a094', 'a091', 'a032', 'a058', 'a086'] as const;
export const RECIPE_ORDER = ['fresh_juice', 'rabbit_apples', 'apple_jam', 'hirosaki_pie', 'ringo_ame'] as const;
export type AppleId = (typeof APPLE_ORDER)[number];
export type RecipeId = (typeof RECIPE_ORDER)[number];

/** Player-facing names from the build prompt. */
export const RECIPE_DISPLAY_NAMES: Readonly<Record<RecipeId, string>> = {
  fresh_juice: 'Fresh Apple Juice',
  rabbit_apples: 'Rabbit Apple Wedges',
  apple_jam: 'Apple Jam',
  hirosaki_pie: 'Hirosaki Apple Pie',
  ringo_ame: 'Mini Candy Apple',
};

/** Required timed-action counts per playable recipe. */
export const REQUIRED_ACTION_COUNTS: Readonly<Record<RecipeId, number>> = {
  fresh_juice: 1,
  rabbit_apples: 2,
  apple_jam: 3,
  hirosaki_pie: 5,
  ringo_ame: 4,
};

/** Recipes that cook the apple (used for "try a cooked dish" suggestions). */
export const COOKED_RECIPES: readonly RecipeId[] = ['apple_jam', 'hirosaki_pie'];
const RAW_RECIPES: readonly string[] = ['fresh_juice', 'rabbit_apples'];

export const DEFAULT_FLESH = '#FFF1C9';

const VISUALS: Record<AppleId, { skin: SkinVisual; flesh?: string; scale?: number }> = {
  a048: { skin: { base: '#D9473A', second: '#F2B35A', pattern: 'streak' } },
  a081: { skin: { base: '#D9503F', second: '#E9C25A', pattern: 'blush' } },
  a023: { skin: { base: '#C9C85A', second: '#E3D873', pattern: 'solid' } },
  a066: { skin: { base: '#E0603C', second: '#F0C04A', pattern: 'blush' } },
  a006: { skin: { base: '#F2CC4E', second: '#F0A060', pattern: 'blush' } },
  a094: { skin: { base: '#B3202A', second: '#8E1520', pattern: 'solid' } },
  a091: { skin: { base: '#D93A33', second: '#F2B35A', pattern: 'blush' } },
  a032: { skin: { base: '#8DB54A', second: '#B7CF68', pattern: 'solid' }, scale: 1.12 },
  a058: { skin: { base: '#A8182A', second: '#7E0F1E', pattern: 'solid' }, flesh: '#F29AA6' },
  a086: { skin: { base: '#CF3A3A', second: '#E8B850', pattern: 'streak' } },
};

const SIZE_SCALE: Record<string, number> = { mini: 0.65, small: 0.85, standard: 1 };

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
  for (const id of APPLE_ORDER) if (!appleIds.has(id)) fail(`missing apple ${id}`);

  const recipeIds = new Set<string>();
  for (const r of proto.recipes) {
    if (recipeIds.has(r.id)) fail(`duplicate recipe id ${r.id}`);
    recipeIds.add(r.id);
  }
  if (proto.recipes.length !== 5) fail(`expected exactly 5 recipes, got ${proto.recipes.length}`);
  for (const id of RECIPE_ORDER) if (!recipeIds.has(id)) fail(`missing recipe ${id}`);

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
  for (const id of RECIPE_ORDER) {
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

// Validate at import time (the only import side effect).
export const CONTENT_SUMMARY = validateContent();

// ---------------------------------------------------------------------------
// Build typed content
// ---------------------------------------------------------------------------

function buildApple(raw: RawApple): AppleInfo {
  const vis = VISUALS[raw.id as AppleId];
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
    skin: { ...vis.skin },
    flesh: vis.flesh ?? DEFAULT_FLESH,
    scale: vis.scale ?? SIZE_SCALE[sizeClass] ?? 1,
  };
}

function buildRecipe(id: RecipeId): RecipeInfo {
  const raw = PROTOTYPE_DATA.recipes.find((r) => r.id === id)!;
  const plan = ACTION_CATALOG.recipes.find((r) => r.recipe_id === id)!;
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

/** The 10 playable apples in prototype order. */
export const APPLES: readonly AppleInfo[] = Object.freeze(
  APPLE_ORDER.map((id) => buildApple(PROTOTYPE_DATA.apples.find((a) => a.id === id)!)),
);
/** The 5 playable recipes in order fresh_juice, rabbit_apples, apple_jam, hirosaki_pie, ringo_ame. */
export const RECIPES: readonly RecipeInfo[] = Object.freeze(RECIPE_ORDER.map(buildRecipe));

const PAIRINGS = new Map<string, Pairing>(
  PROTOTYPE_DATA.pairings.map((p) => [
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
  ]),
);

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
