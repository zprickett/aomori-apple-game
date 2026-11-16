/**
 * Versioned on-device save behind an interface suitable for future account sync.
 * localStorage key 'aomori-kitchen-save'; in-memory fallback when storage is unavailable.
 * Never stores live gesture coordinates or renderer state.
 */
import { RECIPE_ORDER, isAppleId, isRecipeId, recipe, type RecipeId } from './content.ts';
import { DEFAULT_SEED, unlockedApples, unlockedRecipes } from './progression.ts';
import { cleanRankUps } from './ranks.ts';
import type { DishEvaluation, PracticeSummary, StepResult } from './scoring.ts';
import { GRADE_POINTS, GRADES, type Grade } from './timing.ts';
import { HISTORY_LIMIT, scoreDish, type OrderRecord } from './points.ts';

export const SAVE_KEY = 'aomori-kitchen-save';
export const SAVE_VERSION = 3;
export const ACTION_SYSTEM_VERSION = '2.0';

export const NOTICE_NO_STORAGE = 'Progress cannot be saved on this device';
export const NOTICE_MIGRATED = 'Cooking controls updated—let’s start this dish again.';
export const NOTICE_CORRUPT = 'Saved progress could not be read, so a new game started.';
export const NOTICE_FUTURE = 'This save is from a newer version of the game. Progress this session will not be saved.';

export type SavedPhase = 'shop' | 'choose' | 'cook' | 'result' | 'delivery';
const SAVED_PHASES: readonly SavedPhase[] = ['shop', 'choose', 'cook', 'result', 'delivery'];

export interface SaveSettings {
  sound: boolean;
  /** Assistance mode: 1.5× windows + labelled helper bonus. */
  assistance: boolean;
  /** Alternate (tap/keyboard) controls. */
  altControls: boolean;
  reducedMotion: 'system' | 'on' | 'off';
}

export interface CurrentOrderSave {
  orderId: string;
  orderNumber: number;
  recipeId: string;
  appleId: string | null;
  phase: SavedPhase;
  variantId: string;
  /** Next step to play (results for steps < stepIndex are committed). stepIndex === steps.length → serve. */
  stepIndex: number;
  stepResults: StepResult[];
  attemptId: string;
  /** Cue time for the unfinished step if jitter is ever enabled (not used: fixed JSON targets). */
  cueTime?: number;
  /** Result shown on the result/delivery screen (already committed). */
  pendingResult?: DishEvaluation | null;
}

export interface SaveData {
  version: 3;
  actionSystemVersion: '2.0';
  seed: number;
  completedOrders: number;
  /** Ids of committed orders (idempotency; together with the completedOrders high-water mark). */
  completedOrderIds: string[];
  /** Completed-order count when each rank 2..5 was reached (v3; v2 saves get the earliest schedule). */
  rankUps: number[];
  unlockedApples: string[];
  unlockedRecipes: string[];
  bestScores: Record<string, number>;
  discoveredPairings: Record<string, { bestStars: number; fit: number }>;
  /** Lifetime points (chef level). */
  totalPoints: number;
  /** Best points per recipe id. */
  bestPoints: Record<string, number>;
  /** Past orders, oldest first (capped at HISTORY_LIMIT). */
  history: OrderRecord[];
  settings: SaveSettings;
  /** Unlock celebrations already shown, e.g. 'apple:a094', 'recipe:apple_jam'. */
  seenUnlockRewards: string[];
  current: CurrentOrderSave | null;
  notices?: string[];
}

export type { PracticeSummary };

export const DEFAULT_SETTINGS: Readonly<SaveSettings> = Object.freeze({
  sound: true,
  assistance: false,
  altControls: false,
  reducedMotion: 'system',
});

export function defaultSave(seed: number = DEFAULT_SEED, settings: SaveSettings = DEFAULT_SETTINGS): SaveData {
  return {
    version: 3,
    actionSystemVersion: '2.0',
    seed,
    completedOrders: 0,
    completedOrderIds: [],
    rankUps: [],
    unlockedApples: unlockedApples(0),
    unlockedRecipes: unlockedRecipes(0),
    bestScores: {},
    discoveredPairings: {},
    totalPoints: 0,
    bestPoints: {},
    history: [],
    settings: { ...settings },
    seenUnlockRewards: [],
    current: null,
  };
}

// ---------------------------------------------------------------------------
// Sanitisation / migration
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNegInt = (v: unknown, d = 0) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function sanitizeSettings(v: unknown): SaveSettings {
  const s = isObj(v) ? v : {};
  return {
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    assistance: typeof s.assistance === 'boolean' ? s.assistance : DEFAULT_SETTINGS.assistance,
    altControls: typeof s.altControls === 'boolean' ? s.altControls : DEFAULT_SETTINGS.altControls,
    reducedMotion:
      s.reducedMotion === 'on' || s.reducedMotion === 'off' || s.reducedMotion === 'system'
        ? s.reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
  };
}

function sanitizeStepResult(v: unknown, stepIds: readonly string[]): StepResult | null {
  if (!isObj(v) || typeof v.stepId !== 'string' || !stepIds.includes(v.stepId)) return null;
  if (!GRADES.includes(v.grade as Grade)) return null;
  const grade = v.grade as Grade;
  return {
    stepId: v.stepId,
    grade,
    error_ms: typeof v.error_ms === 'number' && Number.isFinite(v.error_ms) ? v.error_ms : null,
    attemptId: typeof v.attemptId === 'string' ? v.attemptId : `${v.stepId}-restored`,
    assisted: v.assisted === true,
    points: GRADE_POINTS[grade],
  };
}

function sanitizeEvaluation(v: unknown): DishEvaluation | null {
  if (!isObj(v)) return null;
  if (!isAppleId(v.appleId) || !isRecipeId(v.recipeId)) return null;
  if (typeof v.finishedStars !== 'number' || typeof v.explanation !== 'string') return null;
  const ev = v as unknown as DishEvaluation;
  // Older saves have no points: recompute deterministically from the accepted grades.
  if (!isObj(v.score) || typeof (v.score as Record<string, unknown>).golden !== 'boolean') {
    const grades = Array.isArray(ev.grades) ? ev.grades.map((g) => g.grade).filter((g) => GRADES.includes(g)) : [];
    if (grades.length !== recipe(ev.recipeId).steps.length) return null;
    return { ...ev, score: scoreDish(ev.appleId, ev.recipeId, grades) };
  }
  return ev;
}

/**
 * Sanitise the current-order record. Returns [current, migratedNotice].
 * A variant mismatch (different action plan) resets the dish to its first action.
 */
function sanitizeCurrent(
  v: unknown,
  completed: number,
  completedIds: readonly string[],
  apples: readonly string[],
): { current: CurrentOrderSave | null; notice: string | null } {
  if (!isObj(v)) return { current: null, notice: null };
  if (!isRecipeId(v.recipeId) || typeof v.orderId !== 'string') return { current: null, notice: null };
  const rec = recipe(v.recipeId);
  const stepIds = rec.steps.map((s) => s.id);
  const orderNumber = nonNegInt(v.orderNumber, completed + 1);
  let phase: SavedPhase = SAVED_PHASES.includes(v.phase as SavedPhase) ? (v.phase as SavedPhase) : 'shop';
  const committed = completedIds.includes(v.orderId) || orderNumber <= completed;
  // Result/delivery are only valid for an already-committed order; otherwise the order is in progress.
  if ((phase === 'result' || phase === 'delivery') && !committed) phase = 'shop';
  if (phase !== 'result' && phase !== 'delivery' && committed) return { current: null, notice: null };
  if (phase !== 'result' && phase !== 'delivery' && orderNumber !== completed + 1) return { current: null, notice: null };

  let appleId: string | null = isAppleId(v.appleId) && apples.includes(v.appleId) ? v.appleId : null;
  let notice: string | null = null;
  let stepIndex = nonNegInt(v.stepIndex, 0);
  let stepResults = Array.isArray(v.stepResults)
    ? v.stepResults.map((r) => sanitizeStepResult(r, stepIds)).filter((r): r is StepResult => r !== null)
    : [];
  if (v.variantId !== rec.variantId) {
    if (phase === 'cook') notice = NOTICE_MIGRATED;
    stepIndex = 0;
    stepResults = [];
  }
  if (phase === 'cook') {
    if (!appleId) phase = 'choose';
    // Committed results must cover exactly steps [0, stepIndex); never guess beyond that.
    stepIndex = Math.min(stepIndex, rec.steps.length);
    const prefix = stepIds.slice(0, stepIndex);
    const byStep = new Map(stepResults.map((r) => [r.stepId, r] as const));
    let valid = 0;
    while (valid < prefix.length && byStep.has(prefix[valid])) valid++;
    stepIndex = valid;
    stepResults = prefix.slice(0, valid).map((id) => byStep.get(id)!);
  } else {
    stepIndex = 0;
    stepResults = [];
  }
  if (phase === 'shop' || phase === 'choose') appleId = phase === 'choose' ? appleId : null;

  let pendingResult: DishEvaluation | null = null;
  if (phase === 'result' || phase === 'delivery') {
    pendingResult = sanitizeEvaluation(v.pendingResult);
    if (!pendingResult) return { current: null, notice: null };
  }
  const current: CurrentOrderSave = {
    orderId: v.orderId,
    orderNumber,
    recipeId: v.recipeId,
    appleId: phase === 'shop' ? null : appleId,
    phase,
    variantId: rec.variantId,
    stepIndex,
    stepResults,
    attemptId: typeof v.attemptId === 'string' ? v.attemptId : `${v.orderId}-restored`,
  };
  if (typeof v.cueTime === 'number' && Number.isFinite(v.cueTime)) current.cueTime = v.cueTime;
  if (pendingResult) current.pendingResult = pendingResult;
  return { current, notice };
}

/**
 * Coerce any v2/v3-shaped object into valid SaveData: fills defaults, drops unknown apple/recipe ids,
 * recomputes unlocks from completedOrders (union with saved).
 */
export function sanitizeSave(raw: unknown): { data: SaveData; notice: string | null } {
  const v = isObj(raw) ? raw : {};
  const completedOrders = nonNegInt(v.completedOrders, 0);
  const seed = typeof v.seed === 'number' && Number.isInteger(v.seed) ? v.seed : DEFAULT_SEED;
  const completedOrderIds = uniq(strArr(v.completedOrderIds));
  const rankUps = cleanRankUps(v.rankUps, completedOrders);
  const apples = uniq([...strArr(v.unlockedApples).filter(isAppleId), ...unlockedApples(completedOrders)]);
  const recipes = uniq([...strArr(v.unlockedRecipes).filter(isRecipeId), ...unlockedRecipes(completedOrders, rankUps)]);
  const bestScores: Record<string, number> = {};
  if (isObj(v.bestScores))
    for (const [k, s] of Object.entries(v.bestScores))
      if (isRecipeId(k) && typeof s === 'number' && Number.isInteger(s) && s >= 0 && s <= 3) bestScores[k] = s;
  const discoveredPairings: SaveData['discoveredPairings'] = {};
  if (isObj(v.discoveredPairings))
    for (const [k, p] of Object.entries(v.discoveredPairings)) {
      const [a, r] = k.split(':');
      if (!isAppleId(a) || !isRecipeId(r) || !isObj(p)) continue;
      const bestStars = nonNegInt(p.bestStars, 0);
      const fit = nonNegInt(p.fit, 0);
      if (bestStars <= 3 && fit <= 3) discoveredPairings[k] = { bestStars, fit };
    }
  const { current, notice } = sanitizeCurrent(v.current, completedOrders, completedOrderIds, apples);
  const bestPoints: Record<string, number> = {};
  if (isObj(v.bestPoints))
    for (const [k, s] of Object.entries(v.bestPoints)) if (isRecipeId(k)) { const n = nonNegInt(s, -1); if (n >= 0) bestPoints[k] = n; }
  const history = (Array.isArray(v.history) ? v.history : []).map(sanitizeRecord).filter((r): r is OrderRecord => r !== null).slice(-HISTORY_LIMIT);
  const data: SaveData = {
    version: 3,
    actionSystemVersion: '2.0',
    seed,
    completedOrders,
    completedOrderIds,
    rankUps,
    unlockedApples: orderLike(apples, unlockedApples(99)),
    unlockedRecipes: orderLike(recipes, [...RECIPE_ORDER]),
    bestScores,
    discoveredPairings,
    totalPoints: nonNegInt(v.totalPoints, 0),
    bestPoints,
    history,
    settings: sanitizeSettings(v.settings),
    seenUnlockRewards: uniq(strArr(v.seenUnlockRewards)),
    current,
  };
  const notices = strArr(v.notices);
  if (notices.length) data.notices = notices;
  return { data, notice };
}

function sanitizeRecord(v: unknown): OrderRecord | null {
  if (!isObj(v) || typeof v.orderId !== 'string' || !isRecipeId(v.recipeId) || !isAppleId(v.appleId)) return null;
  const grades = strArr(v.grades).filter((g): g is Grade => GRADES.includes(g as Grade));
  const stars = typeof v.stars === 'number' && Number.isInteger(v.stars) && v.stars >= 0 && v.stars <= 3 ? v.stars : undefined;
  return {
    ...(stars !== undefined ? { stars } : {}),
    orderId: v.orderId,
    orderNumber: nonNegInt(v.orderNumber, 0),
    recipeId: v.recipeId,
    appleId: v.appleId,
    points: nonNegInt(v.points, 0),
    golden: v.golden === true || (grades.length > 0 && grades.every((g) => g === 'Perfect')),
    grades,
    fit: nonNegInt(v.fit, 0),
    newBest: v.newBest === true,
  };
}

function orderLike(ids: readonly string[], order: readonly string[]): string[] {
  return order.filter((id) => ids.includes(id));
}

/**
 * Migrate a legacy v1 save
 *   {version:1, completedOrders, unlockedApples, bestScores, settings?, current?: {orderId, recipeId, appleId, minigameStep}}
 * Preserves completed orders, unlocks, best scores and the current apple/recipe. The current recipe
 * restarts at its first v2 action (legacy minigameStep is never reinterpreted) with NOTICE_MIGRATED.
 */
export function migrateV1(raw: Record<string, unknown>): { data: SaveData; notice: string | null } {
  const completedOrders = nonNegInt(raw.completedOrders, 0);
  const legacy = isObj(raw.current) ? raw.current : null;
  let current: CurrentOrderSave | null = null;
  let notice: string | null = null;
  if (legacy && isRecipeId(legacy.recipeId)) {
    const rec = recipe(legacy.recipeId as RecipeId);
    const appleId = isAppleId(legacy.appleId) ? legacy.appleId : null;
    const orderNumber = completedOrders + 1;
    const orderId = typeof legacy.orderId === 'string' ? legacy.orderId : `o-${String(orderNumber).padStart(4, '0')}`;
    current = {
      orderId,
      orderNumber,
      recipeId: rec.id,
      appleId,
      phase: appleId ? 'cook' : 'choose',
      variantId: rec.variantId,
      stepIndex: 0,
      stepResults: [],
      attemptId: `${orderId}-migrated`,
    };
    notice = NOTICE_MIGRATED;
  }
  const { data } = sanitizeSave({
    version: 2,
    seed: DEFAULT_SEED,
    completedOrders,
    completedOrderIds: [],
    unlockedApples: raw.unlockedApples,
    unlockedRecipes: raw.unlockedRecipes,
    bestScores: raw.bestScores,
    settings: raw.settings,
    current,
  });
  // sanitizeSave may demote cook→choose if the apple is not unlocked; keep the notice either way.
  return { data, notice };
}

/** Parse a stored string into SaveData + notice. `future` = written by a newer game version. */
export function parseSave(text: string | null): { data: SaveData; notice: string | null; future: boolean } {
  if (text === null || text === undefined) return { data: defaultSave(), notice: null, future: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { data: defaultSave(), notice: NOTICE_CORRUPT, future: false };
  }
  if (!isObj(raw) || typeof raw.version !== 'number') return { data: defaultSave(), notice: NOTICE_CORRUPT, future: false };
  if (raw.version > SAVE_VERSION) {
    // Best-effort read of compatible progress; the store will not overwrite it.
    const { data } = sanitizeSave({ ...raw, current: null });
    return { data, notice: NOTICE_FUTURE, future: true };
  }
  if (raw.version === 1) {
    const m = migrateV1(raw);
    return { ...m, future: false };
  }
  if (raw.version === 2 || raw.version === 3) return { ...sanitizeSave(raw), future: false };
  return { data: defaultSave(), notice: NOTICE_CORRUPT, future: false };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface SaveStore {
  /** Load (and migrate/sanitise). notice: short player-facing message or null. */
  load(): { data: SaveData; notice: string | null; persistent: boolean };
  /** Commit. Returns true when written to persistent storage. */
  save(data: SaveData): boolean;
  /** Reset progress (keeps settings by default) and commit. */
  reset(keepSettings?: SaveSettings): SaveData;
  readonly persistent: boolean;
}

/** Minimal Storage subset used (localStorage-compatible). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/**
 * localStorage-backed store with versioned key. `storage` undefined → globalThis.localStorage;
 * null → memory only. Falls back to memory (notice NOTICE_NO_STORAGE) if storage throws.
 * Future-version saves are never overwritten; the session runs in memory with NOTICE_FUTURE.
 */
export function createSaveStore(storage?: StorageLike | null, key: string = SAVE_KEY): SaveStore {
  let backend: StorageLike | null = storage === undefined ? defaultStorage() : storage;
  let memory: string | null = null;
  let fallbackNotice: string | null = null;

  const toMemory = (notice: string) => {
    backend = null;
    fallbackNotice = notice;
  };

  if (backend) {
    try {
      const probe = `${key}__probe`;
      backend.setItem(probe, '1');
      backend.removeItem(probe);
    } catch {
      toMemory(NOTICE_NO_STORAGE);
    }
  } else {
    fallbackNotice = NOTICE_NO_STORAGE;
  }

  const store: SaveStore = {
    get persistent() {
      return backend !== null;
    },
    load() {
      let text: string | null;
      if (backend) {
        try {
          text = backend.getItem(key);
        } catch {
          toMemory(NOTICE_NO_STORAGE);
          text = memory;
        }
      } else {
        text = memory;
      }
      const parsed = parseSave(text);
      if (parsed.future) toMemory(NOTICE_FUTURE);
      const notice = parsed.future ? NOTICE_FUTURE : (parsed.notice ?? (backend ? null : fallbackNotice));
      return { data: parsed.data, notice, persistent: backend !== null };
    },
    save(data) {
      const text = JSON.stringify(data);
      memory = text;
      if (!backend) return false;
      try {
        backend.setItem(key, text);
        return true;
      } catch {
        toMemory(NOTICE_NO_STORAGE);
        return false;
      }
    },
    reset(keepSettings) {
      const fresh = defaultSave(DEFAULT_SEED, keepSettings ?? DEFAULT_SETTINGS);
      store.save(fresh);
      return fresh;
    },
  };
  return store;
}

/** In-memory store (tests / when the caller knows storage is unavailable). */
export function createMemoryStore(): SaveStore {
  return createSaveStore(null);
}
