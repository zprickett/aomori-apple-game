/**
 * Explicit, pure game state machine.
 *
 *   shop ──ACCEPT_ORDER──▶ choose ──CONFIRM_APPLE──▶ cook ──(last FEEDBACK_DONE)──▶ serve
 *     ▲                     │BACK                                                    │SERVE_DONE (commits order)
 *     │                     ▼                                                        ▼
 *     └──────── DELIVERY_DONE ◀── delivery ◀── RESULT_DONE (if new unlocks or a rank-up) ◀── result
 *     └────────────────────────────────────── RESULT_DONE (no unlocks) ◀────────────┘
 *   After every DAY_LENGTH-th order, RESULT_DONE / DELIVERY_DONE go to 'day' (the day recap) and
 *   DAY_DONE returns to the shop.
 *
 * Cook sub-phases per step:
 *   bridge ─BRIDGE_DONE▶ instruction ─READY▶ countin ─COUNTIN_DONE▶ active ─SUBMIT▶ feedback | miss
 *   feedback ─FEEDBACK_DONE▶ next step's bridge (or serve)
 *   miss ─RETRY_STEP▶ countin (same step, new attemptId)   miss ─CONTINUE_WITH_HELP▶ feedback
 *
 * The reducer never reads clocks or storage. The caller persists `toSaveData(state)` after each
 * meaningful transition (any action that changes state; see `shouldPersist`).
 */
import { APPLE_ORDER, RECIPE_ORDER, apple, fitStars, isAppleId, recipe, type AppleInfo, type RecipeInfo, type StepDef } from './content.ts';
import {
  COLLECTION_COMPLETE_AT,
  customOrder,
  isCollectionComplete,
  orderForIndex,
  stallLevel,
  unlockConditionText,
  unlockedApples as scheduleApples,
  unlockedRecipes as scheduleRecipes,
  unlocksEarnedAt,
  type Order,
} from './progression.ts';
import {
  defaultSave,
  type CurrentOrderSave,
  type SaveData,
  type SaveSettings,
  type SavedPhase,
} from './persistence.ts';
import {
  evaluateDish,
  replaceStepResult,
  summarizePractice,
  type DishEvaluation,
  type PracticeSummary,
  type StepResult,
} from './scoring.ts';
import { gradeStep, toleranceMultiplier, trackZones, type TrackZones } from './stepTimer.ts';
import { GRADE_POINTS, type Grade } from './timing.ts';
import { HISTORY_LIMIT, type OrderRecord } from './points.ts';
import { advanceRank, cleanRankUps, rankOf, type Rank } from './ranks.ts';
import { newsFor, nextDayStart, type NewsItem } from './story.ts';
import { addDish, sanitizeStats, trophyKey, trophyStatus, type TrophyInput, type TrophyStats, type TrophyStatus } from './trophies.ts';

export type Phase = 'shop' | 'choose' | 'cook' | 'serve' | 'result' | 'delivery' | 'day';
export type CookSub = 'bridge' | 'instruction' | 'countin' | 'active' | 'feedback' | 'miss';
export type Mode = 'order' | 'practice';

/** Orders in one day; a recap follows the last order of each day. */
export const DAY_LENGTH = 5;

/** Number of onboarding orders with assisted grading. */
export const ASSISTED_ORDER_COUNT = 3;

export interface CookState {
  stepIndex: number;
  sub: CookSub;
  /** Accepted (committed) results, one per step, replaced on replay. */
  stepResults: StepResult[];
  attemptId: string;
  attemptSeq: number;
  /** Result being shown in feedback/miss (in 'miss' it is NOT yet committed). */
  lastResult: StepResult | null;
  /** True when the last result came from Continue with help (UI plays the automatic action). */
  helped: boolean;
}

export interface Delivery {
  apples: string[];
  recipes: string[];
  /** Rank reached with this order (shown before the unlocks), or null. */
  rank: Rank | null;
  /** Golden Trophy steps reached with this order (highest new step per trophy). */
  trophies: { id: string; tier: number }[];
  collectionComplete: boolean;
}

export interface Progress {
  seed: number;
  completedOrders: number;
  completedOrderIds: string[];
  /** Completed-order count when each rank 2..5 was reached. */
  rankUps: number[];
  unlockedApples: string[];
  unlockedRecipes: string[];
  bestScores: Record<string, number>;
  discoveredPairings: Record<string, { bestStars: number; fit: number }>;
  seenUnlockRewards: string[];
  totalPoints: number;
  bestPoints: Record<string, number>;
  history: OrderRecord[];
  /** Golden Trophy counters. */
  trophyStats: TrophyStats;
}

export interface GameState {
  progress: Progress;
  settings: SaveSettings;
  mode: Mode;
  phase: Phase;
  /** Active order (or the just-completed one while in result/delivery). */
  order: Order;
  /** Recipe being practised (mode 'practice'). */
  practiceRecipeId: string | null;
  previewAppleId: string | null;
  appleId: string | null;
  cook: CookState | null;
  result: DishEvaluation | null;
  practiceResult: PracticeSummary | null;
  delivery: Delivery | null;
  /** Page hidden (cooking paused). */
  hidden: boolean;
  notice: string | null;
}

export type GameAction =
  | { type: 'ACCEPT_ORDER' }
  | { type: 'PREVIEW_APPLE'; appleId: string }
  | { type: 'CONFIRM_APPLE' }
  | { type: 'BACK' }
  | { type: 'BRIDGE_DONE' }
  | { type: 'READY' }
  | { type: 'COUNTIN_DONE' }
  | { type: 'SUBMIT'; eventMs: number | null; assistedInput?: boolean; graded?: { grade: Grade; error_ms: number | null } }
  | { type: 'FEEDBACK_DONE' }
  | { type: 'RETRY_STEP' }
  | { type: 'CONTINUE_WITH_HELP' }
  | { type: 'SERVE_DONE' }
  | { type: 'COMPLETE_ORDER' }
  | { type: 'RESULT_DONE' }
  | { type: 'DELIVERY_DONE' }
  | { type: 'DAY_DONE' }
  /** The player closed a news card (recognition after a rank-up). */
  | { type: 'NEWS_SEEN'; rank: Rank }
  | { type: 'VISIBILITY_HIDDEN' }
  | { type: 'RESUME' }
  | { type: 'SET_SETTINGS'; settings: Partial<SaveSettings> }
  | { type: 'RESET_PROGRESS'; confirm: boolean }
  | { type: 'START_PRACTICE'; recipeId: string }
  | { type: 'EXIT_PRACTICE' }
  | { type: 'DISMISS_NOTICE' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activeRecipeId(state: GameState): string {
  return state.mode === 'practice' && state.practiceRecipeId ? state.practiceRecipeId : state.order.recipeId;
}

function attemptIdFor(state: GameState, stepIndex: number, seq: number): string {
  const prefix = state.mode === 'practice' ? `practice-${state.practiceRecipeId}` : state.order.orderId;
  return `${prefix}-s${stepIndex + 1}-a${seq}`;
}

function newCook(): CookState {
  return { stepIndex: 0, sub: 'bridge', stepResults: [], attemptId: '', attemptSeq: 0, lastResult: null, helped: false };
}

function startAttempt(state: GameState, cook: CookState, sub: CookSub): CookState {
  const attemptSeq = cook.attemptSeq + 1;
  return { ...cook, sub, attemptSeq, attemptId: attemptIdFor(state, cook.stepIndex, attemptSeq), lastResult: null, helped: false };
}

function nextOrderState(state: GameState): GameState {
  const n = state.progress.completedOrders + 1;
  return {
    ...state,
    mode: 'order',
    phase: 'shop',
    order: orderForIndex(n, state.progress.seed, state.progress.rankUps),
    practiceRecipeId: null,
    previewAppleId: null,
    appleId: null,
    cook: null,
    result: null,
    practiceResult: null,
    delivery: null,
  };
}

/** Dish-level assisted grading: onboarding orders 1–3 or assistance mode (never in practice scoring). */
export function isAssistedDish(state: GameState): boolean {
  return state.order.orderNumber <= ASSISTED_ORDER_COUNT || state.settings.assistance;
}

/** Reward keys for celebrations ('apple:a094', 'recipe:apple_jam', 'rank:3'). */
export function rewardKeys(d: { apples: readonly string[]; recipes: readonly string[]; rank?: number | null; trophies?: readonly { id: string; tier: number }[] }): string[] {
  return [
    ...(d.rank ? [`rank:${d.rank}`] : []),
    ...(d.trophies ?? []).flatMap((t) => Array.from({ length: t.tier }, (_, k) => trophyKey(t.id, k + 1))),
    ...d.apples.map((a) => `apple:${a}`),
    ...d.recipes.map((r) => `recipe:${r}`),
  ];
}

/** Rank reached exactly when the completed count was `completed`, or null. */
function rankReachedWith(progress: Progress, completed: number): Rank | null {
  const i = progress.rankUps.indexOf(completed);
  return i < 0 ? null : ((i + 2) as Rank);
}

/** Unseen unlock rewards earned when completed count reached `completed`. Null if none. */
export function pendingDelivery(progress: Progress, completed: number = progress.completedOrders, order?: Order): Delivery | null {
  const earned = unlocksEarnedAt(completed, progress.rankUps);
  // A regular's gift apple (served with this order) is revealed like a delivery.
  const gift = order && order.orderNumber === completed && order.giftAppleId ? [order.giftAppleId] : [];
  const apples = [...new Set([...gift, ...earned.apples])].filter((a) => !progress.seenUnlockRewards.includes(`apple:${a}`));
  const recipes = earned.recipes.filter((r) => !progress.seenUnlockRewards.includes(`recipe:${r}`));
  const reached = rankReachedWith(progress, completed);
  const rank = reached && !progress.seenUnlockRewards.includes(`rank:${reached}`) ? reached : null;
  // Trophies never interrupt a rank-up or Ojiichan's visit; they stay unseen and pop up after the next order.
  const holdTrophies = rank !== null || order?.visit?.who === 'ojiichan';
  const trophies = holdTrophies ? [] : trophyStatus(trophyInput(progress))
    .filter((t) => t.tier > 0 && !progress.seenUnlockRewards.includes(trophyKey(t.id, t.tier)))
    .map((t) => ({ id: t.id, tier: t.tier }));
  if (!apples.length && !recipes.length && !rank && !trophies.length) return null;
  return { apples, recipes, rank, trophies, collectionComplete: completed === COLLECTION_COMPLETE_AT };
}

/** What the Golden Trophies read from progress. */
export function trophyInput(p: Progress): TrophyInput {
  const cooked = [...new Set(Object.keys(p.discoveredPairings).map((k) => k.split(':')[0]))];
  return { stats: p.trophyStats, cookedApples: cooked, unlockedApples: p.unlockedApples };
}

/**
 * Commit a finished order to progress. Idempotent by orderId / order number: a second call (or a
 * reload on the result screen) leaves progress unchanged.
 */
export function commitCompletedOrder(progress: Progress, order: Order, evaluation: DishEvaluation): Progress {
  if (progress.completedOrderIds.includes(order.orderId) || order.orderNumber <= progress.completedOrders) return progress;
  const completedOrders = progress.completedOrders + 1;
  const key = `${evaluation.appleId}:${evaluation.recipeId}`;
  const prevPair = progress.discoveredPairings[key];
  const pts = evaluation.score.total;
  const prevBest = progress.bestPoints[evaluation.recipeId];
  const record: OrderRecord = {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    recipeId: evaluation.recipeId,
    appleId: evaluation.appleId,
    points: pts,
    golden: evaluation.score.golden,
    grades: evaluation.grades.map((g) => g.grade),
    fit: evaluation.fitStars,
    stars: evaluation.score.stars,
    // Only a real improvement: the first dish of a recipe (or a 0-point one) is not a "best".
    newBest: prevBest !== undefined && pts > prevBest,
  };
  // A regular's story is finished when their last visit is served.
  const v = order.visit;
  const storyDone = v && v.who !== 'ojiichan' && v.step === v.of ? v.who : undefined;
  const next: Progress = {
    ...progress,
    trophyStats: addDish(progress.trophyStats, evaluation.recipeId, evaluation.grades.map((g) => g.grade), storyDone),
    totalPoints: progress.totalPoints + pts,
    bestPoints: { ...progress.bestPoints, [evaluation.recipeId]: Math.max(prevBest ?? 0, pts) },
    history: [...progress.history, record].slice(-HISTORY_LIMIT),
    completedOrders,
    completedOrderIds: [...progress.completedOrderIds, order.orderId],
    unlockedApples: canonApples(progress.unlockedApples, [...scheduleApples(completedOrders), ...(order.giftAppleId ? [order.giftAppleId] : [])]),
    unlockedRecipes: canonRecipes(progress.unlockedRecipes, scheduleRecipes(completedOrders, progress.rankUps)),
    bestScores: {
      ...progress.bestScores,
      [evaluation.recipeId]: Math.max(progress.bestScores[evaluation.recipeId] ?? 0, evaluation.score.stars),
    },
    discoveredPairings: {
      ...progress.discoveredPairings,
      [key]: { bestStars: Math.max(prevPair?.bestStars ?? 0, evaluation.score.stars), fit: evaluation.fitStars },
    },
  };
  // Rank-up check after the order counts; a new rank can bring a recipe at this same count.
  const rankUps = advanceRank(next);
  if (rankUps.length === next.rankUps.length) return next;
  return { ...next, rankUps, unlockedRecipes: canonRecipes(next.unlockedRecipes, scheduleRecipes(completedOrders, rankUps)) };
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}
/** Unlocked ids in canonical content order (stable regardless of unlock order). */
function canonApples(a: readonly string[], b: readonly string[]): string[] {
  const all = union(a, b);
  return APPLE_ORDER.filter((id) => all.includes(id));
}
function canonRecipes(a: readonly string[], b: readonly string[]): string[] {
  const all = union(a, b);
  return RECIPE_ORDER.filter((id) => all.includes(id));
}

function progressFromSave(save: SaveData): Progress {
  const rankUps = cleanRankUps(save.rankUps, save.completedOrders);
  return {
    seed: save.seed,
    completedOrders: save.completedOrders,
    completedOrderIds: [...save.completedOrderIds],
    rankUps,
    unlockedApples: canonApples(save.unlockedApples, scheduleApples(save.completedOrders)),
    unlockedRecipes: canonRecipes(save.unlockedRecipes, scheduleRecipes(save.completedOrders, rankUps)),
    bestScores: { ...save.bestScores },
    discoveredPairings: { ...save.discoveredPairings },
    seenUnlockRewards: [...save.seenUnlockRewards],
    totalPoints: save.totalPoints,
    bestPoints: { ...save.bestPoints },
    history: save.history.map((h) => ({ ...h, grades: [...h.grades] })),
    trophyStats: sanitizeStats(save.trophyStats, save.history),
  };
}

// ---------------------------------------------------------------------------
// Save <-> state
// ---------------------------------------------------------------------------

/**
 * Build a coherent state from (sanitised) SaveData. Cook resumes at the saved stepIndex in
 * sub-phase 'instruction' (fresh count-in); stepIndex === steps.length resumes at 'serve';
 * result/delivery show the stored result without re-committing.
 */
export function initialStateFromSave(save: SaveData, notice: string | null = null): GameState {
  const progress = progressFromSave(save);
  const base: GameState = nextOrderState({
    progress,
    settings: { ...save.settings },
    mode: 'order',
    phase: 'shop',
    order: orderForIndex(progress.completedOrders + 1, progress.seed, progress.rankUps),
    practiceRecipeId: null,
    previewAppleId: null,
    appleId: null,
    cook: null,
    result: null,
    practiceResult: null,
    delivery: null,
    hidden: false,
    notice,
  });
  const cur = save.current;
  if (!cur) return base;

  if (cur.phase === 'result' || cur.phase === 'delivery') {
    const committed = progress.completedOrderIds.includes(cur.orderId) || cur.orderNumber <= progress.completedOrders;
    if (!committed || !cur.pendingResult || cur.orderNumber !== progress.completedOrders) return base;
    const order = customOrder(cur.orderNumber, cur.pendingResult.recipeId as Order['recipeId'], progress.seed, progress.rankUps);
    const delivery = pendingDelivery(progress, cur.orderNumber, order);
    const phase: Phase = cur.phase === 'delivery' && delivery ? 'delivery' : 'result';
    return {
      ...base,
      phase,
      order,
      appleId: cur.pendingResult.appleId,
      result: cur.pendingResult,
      delivery,
    };
  }

  if (cur.orderNumber !== progress.completedOrders + 1) return base;
  const order = customOrder(cur.orderNumber, cur.recipeId as Order['recipeId'], progress.seed, progress.rankUps);
  const state: GameState = { ...base, order };
  const appleOk = cur.appleId !== null && progress.unlockedApples.includes(cur.appleId);
  if (cur.phase === 'shop') return state;
  if (cur.phase === 'choose' || !appleOk) {
    return { ...state, phase: 'choose', previewAppleId: appleOk ? cur.appleId : null };
  }
  // cook
  const rec = recipe(order.recipeId);
  const stepIndex = Math.min(cur.stepIndex, rec.steps.length);
  const stepResults = cur.stepResults.filter((r) => rec.steps.slice(0, stepIndex).some((s) => s.id === r.stepId));
  const cook: CookState = {
    ...newCook(),
    stepIndex,
    stepResults,
    sub: 'instruction',
    attemptId: cur.attemptId,
  };
  if (stepIndex >= rec.steps.length) {
    return { ...state, phase: 'serve', appleId: cur.appleId, cook: { ...cook, stepIndex: rec.steps.length - 1, sub: 'feedback' } };
  }
  return { ...state, phase: 'cook', appleId: cur.appleId, cook };
}

/** Fresh game state (no save). */
export function initialState(seed?: number): GameState {
  return initialStateFromSave(defaultSave(seed));
}

/**
 * Serialisable SaveData for the caller to commit. Practice sessions are not persisted (the save
 * shows the underlying order's shop phase). Committed step results only; a step in feedback is
 * saved as done (stepIndex + 1); unfinished steps restart with a fresh count-in on reload.
 */
export function toSaveData(state: GameState): SaveData {
  // The day recap is not resumable: a reload goes straight to the next order.
  if (state.phase === 'day') return toSaveData(nextOrderState(state));
  const p = state.progress;
  const rec = recipe(state.order.recipeId);
  let current: CurrentOrderSave;
  const base = {
    orderId: state.order.orderId,
    orderNumber: state.order.orderNumber,
    recipeId: state.order.recipeId,
    variantId: rec.variantId,
  };
  if (state.mode === 'practice' || state.phase === 'shop') {
    current = { ...base, appleId: null, phase: 'shop', stepIndex: 0, stepResults: [], attemptId: '' };
  } else if (state.phase === 'choose') {
    current = { ...base, appleId: state.previewAppleId, phase: 'choose', stepIndex: 0, stepResults: [], attemptId: '' };
  } else if (state.phase === 'cook' || state.phase === 'serve') {
    const cook = state.cook!;
    const done = state.phase === 'serve' ? rec.steps.length : cook.stepIndex + (cook.sub === 'feedback' ? 1 : 0);
    const doneIds = rec.steps.slice(0, done).map((s) => s.id);
    current = {
      ...base,
      appleId: state.appleId,
      phase: 'cook' as SavedPhase,
      stepIndex: done,
      stepResults: cook.stepResults.filter((r) => doneIds.includes(r.stepId)).map((r) => ({ ...r })),
      attemptId: cook.attemptId,
    };
  } else {
    current = {
      ...base,
      recipeId: state.result?.recipeId ?? state.order.recipeId,
      appleId: state.appleId,
      phase: state.phase,
      stepIndex: 0,
      stepResults: [],
      attemptId: '',
      pendingResult: state.result,
    };
  }
  return {
    version: 3,
    actionSystemVersion: '2.0',
    seed: p.seed,
    completedOrders: p.completedOrders,
    completedOrderIds: [...p.completedOrderIds],
    rankUps: [...p.rankUps],
    unlockedApples: [...p.unlockedApples],
    unlockedRecipes: [...p.unlockedRecipes],
    bestScores: { ...p.bestScores },
    discoveredPairings: { ...p.discoveredPairings },
    totalPoints: p.totalPoints,
    bestPoints: { ...p.bestPoints },
    history: p.history.map((h) => ({ ...h, grades: [...h.grades] })),
    trophyStats: { ...p.trophyStats, storiesDone: [...p.trophyStats.storiesDone] },
    settings: { ...state.settings },
    seenUnlockRewards: [...p.seenUnlockRewards],
    current,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Pure reducer. Invalid actions for the current phase return the SAME state object (no-op). */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ACCEPT_ORDER':
      if (state.phase !== 'shop' || state.mode !== 'order') return state;
      return { ...state, phase: 'choose', previewAppleId: null, appleId: null };

    case 'PREVIEW_APPLE':
      if (state.phase !== 'choose' || !isAppleId(action.appleId)) return state;
      if (!state.progress.unlockedApples.includes(action.appleId)) return state;
      if (state.previewAppleId === action.appleId) return state;
      return { ...state, previewAppleId: action.appleId };

    case 'CONFIRM_APPLE':
      if (state.phase !== 'choose' || !state.previewAppleId) return state;
      return { ...state, phase: 'cook', appleId: state.previewAppleId, cook: newCook() };

    case 'BACK':
      if (state.phase !== 'choose') return state;
      if (state.mode === 'practice') return exitPractice(state);
      return { ...state, phase: 'shop', previewAppleId: null };

    case 'BRIDGE_DONE':
      return withCook(state, 'bridge', (cook) => ({ ...state, cook: { ...cook, sub: 'instruction' } }));

    case 'READY':
      return withCook(state, 'instruction', (cook) => ({ ...state, cook: startAttempt(state, cook, 'countin') }));

    case 'COUNTIN_DONE':
      return withCook(state, 'countin', (cook) => ({ ...state, cook: { ...cook, sub: 'active' } }));

    case 'SUBMIT':
      return withCook(state, 'active', (cook) => {
        const step = currentStepOf(state)!;
        const tol = toleranceMultiplier({ assistanceTolerance: state.settings.assistance });
        // Arcade beats are graded in the UI layer (see arcade.ts) and arrive pre-combined.
        const g = action.graded
          ? { grade: action.graded.grade, error_ms: action.graded.error_ms, points: GRADE_POINTS[action.graded.grade] }
          : gradeStep(step, action.eventMs, tol);
        const res: StepResult = {
          stepId: step.id,
          grade: g.grade,
          error_ms: g.error_ms,
          attemptId: cook.attemptId,
          assisted: state.settings.assistance || action.assistedInput === true,
          points: g.points,
        };
        if (g.grade === 'Miss') return { ...state, cook: { ...cook, sub: 'miss', lastResult: res, helped: false } };
        return {
          ...state,
          cook: { ...cook, sub: 'feedback', lastResult: res, helped: false, stepResults: replaceStepResult(cook.stepResults, res) },
        };
      });

    case 'RETRY_STEP':
      if (state.phase !== 'cook' || !state.cook || (state.cook.sub !== 'miss' && state.cook.sub !== 'feedback'))
        return state;
      return { ...state, cook: startAttempt(state, state.cook, 'countin') };

    case 'CONTINUE_WITH_HELP':
      return withCook(state, 'miss', (cook) => {
        const step = currentStepOf(state)!;
        // The chef helps: an assisted 'OK' ("No apples lost!"), never a Golden Recipe.
        const grade = 'OK' as const;
        const res: StepResult = {
          stepId: step.id,
          grade,
          error_ms: cook.lastResult?.error_ms ?? null,
          attemptId: cook.attemptId,
          assisted: true,
          points: GRADE_POINTS[grade],
        };
        return {
          ...state,
          cook: { ...cook, sub: 'feedback', lastResult: res, helped: true, stepResults: replaceStepResult(cook.stepResults, res) },
        };
      });

    case 'FEEDBACK_DONE':
      return withCook(state, 'feedback', (cook) => {
        const rec = recipe(activeRecipeId(state));
        if (cook.stepIndex + 1 >= rec.steps.length) return { ...state, phase: 'serve' };
        return {
          ...state,
          cook: { ...cook, stepIndex: cook.stepIndex + 1, sub: 'bridge', lastResult: null, helped: false },
        };
      });

    case 'SERVE_DONE':
    case 'COMPLETE_ORDER': {
      if (state.phase !== 'serve' || !state.cook || !state.appleId) return state;
      const recipeId = activeRecipeId(state);
      if (state.mode === 'practice') {
        return {
          ...state,
          phase: 'result',
          practiceResult: summarizePractice(state.appleId, recipeId, state.cook.stepResults),
        };
      }
      const evaluation = evaluateDish({
        appleId: state.appleId,
        recipeId,
        results: state.cook.stepResults,
        assisted: isAssistedDish(state),
        availableApples: state.progress.unlockedApples,
        availableRecipes: state.progress.unlockedRecipes,
      });
      const progress = commitCompletedOrder(state.progress, state.order, evaluation);
      return {
        ...state,
        progress,
        phase: 'result',
        result: evaluation,
        delivery: pendingDelivery(progress, state.order.orderNumber, state.order),
      };
    }

    case 'RESULT_DONE':
      if (state.phase !== 'result') return state;
      if (state.mode === 'practice') return exitPractice(state);
      if (state.delivery) return { ...state, phase: 'delivery' };
      return afterOrder(state);

    case 'DELIVERY_DONE': {
      if (state.phase !== 'delivery') return state;
      const seen = state.delivery ? rewardKeys(state.delivery) : [];
      const progress = { ...state.progress, seenUnlockRewards: union(state.progress.seenUnlockRewards, seen) };
      return afterOrder({ ...state, progress });
    }

    case 'DAY_DONE':
      if (state.phase !== 'day') return state;
      return nextOrderState(state);

    case 'NEWS_SEEN': {
      const key = `news:${action.rank}`;
      if (state.progress.seenUnlockRewards.includes(key)) return state;
      return { ...state, progress: { ...state.progress, seenUnlockRewards: [...state.progress.seenUnlockRewards, key] } };
    }

    case 'VISIBILITY_HIDDEN': {
      const cook = state.cook;
      if (state.phase === 'cook' && cook && (cook.sub === 'active' || cook.sub === 'countin')) {
        // Abandon the unfinished attempt; committed results stay. Fresh count-in on return.
        return { ...state, hidden: true, cook: { ...cook, sub: 'instruction' } };
      }
      return state.hidden ? state : { ...state, hidden: true };
    }

    case 'RESUME':
      return state.hidden ? { ...state, hidden: false } : state;

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'RESET_PROGRESS': {
      if (action.confirm !== true) return state;
      const fresh = initialStateFromSave(defaultSave(state.progress.seed, state.settings));
      return fresh;
    }

    case 'START_PRACTICE':
      if (state.phase !== 'shop' || state.mode !== 'order') return state;
      if (!state.progress.unlockedRecipes.includes(action.recipeId)) return state;
      return {
        ...state,
        mode: 'practice',
        practiceRecipeId: action.recipeId,
        phase: 'choose',
        previewAppleId: null,
        appleId: null,
        cook: null,
        practiceResult: null,
      };

    case 'EXIT_PRACTICE':
      return state.mode === 'practice' ? exitPractice(state) : state;

    case 'DISMISS_NOTICE':
      return state.notice === null ? state : { ...state, notice: null };

    default:
      return state;
  }
}

/** Day recap after the last order of a day, otherwise the next order. */
function afterOrder(state: GameState): GameState {
  const done = state.progress.completedOrders;
  if (done > 0 && done % DAY_LENGTH === 0 && state.order.orderNumber === done) return { ...state, phase: 'day' };
  return nextOrderState(state);
}

function withCook(state: GameState, sub: CookSub, fn: (cook: CookState) => GameState): GameState {
  if (state.phase !== 'cook' || !state.cook || state.cook.sub !== sub) return state;
  return fn(state.cook);
}

function exitPractice(state: GameState): GameState {
  return {
    ...state,
    mode: 'order',
    phase: 'shop',
    practiceRecipeId: null,
    previewAppleId: null,
    appleId: null,
    cook: null,
    practiceResult: null,
  };
}

function currentStepOf(state: GameState): StepDef | null {
  if (!state.cook || (state.phase !== 'cook' && state.phase !== 'serve')) return null;
  return recipe(activeRecipeId(state)).steps[state.cook.stepIndex] ?? null;
}

/**
 * True when the caller should persist after this transition (state changed and the change is
 * meaningful for a save — i.e. toSaveData output differs).
 */
export function shouldPersist(prev: GameState, next: GameState): boolean {
  if (prev === next) return false;
  return JSON.stringify(toSaveData(prev)) !== JSON.stringify(toSaveData(next));
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface AppleCard {
  apple: AppleInfo;
  unlocked: boolean;
  /** e.g. "Arrives after 6 orders" for locked cards. */
  unlockText: string;
  /** Fit stars for the active recipe (null outside an order/practice). */
  fitStars: 0 | 1 | 2 | 3 | null;
}

export const selectors = {
  /** Recipe currently being ordered/practised. */
  activeRecipe(state: GameState): RecipeInfo {
    return recipe(activeRecipeId(state));
  },
  currentOrder(state: GameState): Order {
    return state.order;
  },
  /** Current step definition while cooking (null outside cook). */
  currentStep(state: GameState): StepDef | null {
    return state.phase === 'cook' ? currentStepOf(state) : null;
  },
  /** {index (0-based), total} for the recipe progress indicator. */
  stepProgress(state: GameState): { index: number; total: number } {
    const total = recipe(activeRecipeId(state)).steps.length;
    if (state.phase === 'serve' || state.phase === 'result') return { index: total, total };
    return { index: state.cook?.stepIndex ?? 0, total };
  },
  toleranceMultiplier(state: GameState): number {
    return toleranceMultiplier({ assistanceTolerance: state.settings.assistance });
  },
  isAssistedDish,
  /** Perfect/Good/OK zones for the current step, with the active tolerance multiplier. */
  trackZones(state: GameState): TrackZones | null {
    const step = currentStepOf(state);
    return step ? trackZones(step, selectors.toleranceMultiplier(state)) : null;
  },
  /**
   * Untimed bridge text before the current step: bridges[0] before the first action, null between
   * actions (UI plays a short automatic transition). Use `serveBridgeText` for the serve phase.
   */
  bridgeText(state: GameState): string | null {
    if (state.phase !== 'cook' || !state.cook) return null;
    const rec = recipe(activeRecipeId(state));
    return state.cook.stepIndex === 0 ? (rec.bridges[0] ?? null) : null;
  },
  serveBridgeText(state: GameState): string | null {
    const rec = recipe(activeRecipeId(state));
    return rec.bridges.length > 1 ? rec.bridges[rec.bridges.length - 1] : null;
  },
  unlockedApples(state: GameState): string[] {
    return state.progress.unlockedApples;
  },
  unlockedRecipes(state: GameState): string[] {
    return state.progress.unlockedRecipes;
  },
  /**
   * Apple picker cards: every unlocked apple (best fit for the active recipe first, then unlock
   * order) followed by the next locked apple as a teaser.
   */
  appleCards(state: GameState): AppleCard[] {
    const inDish = state.phase !== 'shop' || state.mode === 'practice';
    const rid = activeRecipeId(state);
    const card = (id: string, unlocked: boolean): AppleCard => ({
      apple: apple(id),
      unlocked,
      unlockText: unlockConditionText(id),
      fitStars: inDish ? fitStars(id, rid) : null,
    });
    const open = APPLE_ORDER.filter((id) => state.progress.unlockedApples.includes(id)).map((id) => card(id, true));
    if (inDish) open.sort((a, b) => (b.fitStars ?? 0) - (a.fitStars ?? 0));
    const next = APPLE_ORDER.find((id) => !state.progress.unlockedApples.includes(id));
    return next ? [...open, card(next, false)] : open;
  },
  previewFit(state: GameState): 0 | 1 | 2 | 3 | null {
    return state.previewAppleId ? fitStars(state.previewAppleId, activeRecipeId(state)) : null;
  },
  rank(state: GameState): Rank {
    return rankOf(state.progress.rankUps);
  },
  /**
   * The news card to show now: in the shop, from the first order of the day after the rank-up,
   * oldest unseen first. Null when there is none.
   */
  pendingNews(state: GameState): NewsItem | null {
    if (state.phase !== 'shop' || state.mode !== 'order') return null;
    const p = state.progress;
    for (let i = 0; i < p.rankUps.length; i++) {
      const rank = (i + 2) as Rank;
      if (p.seenUnlockRewards.includes(`news:${rank}`)) continue;
      if (state.order.orderNumber < nextDayStart(p.rankUps[i])) continue;
      const n = newsFor(rank);
      if (n) return n;
    }
    return null;
  },
  /** Apple ids the player has cooked with at least once. */
  cookedApples(state: GameState): Set<string> {
    return new Set(Object.keys(state.progress.discoveredPairings).map((k) => k.split(':')[0]));
  },
  /** Golden Trophy progress, in cabinet order. */
  trophies(state: GameState): TrophyStatus[] {
    return trophyStatus(trophyInput(state.progress));
  },
  /** News cards already seen (the scrapbook), oldest first. */
  seenNews(state: GameState): NewsItem[] {
    return state.progress.rankUps
      .map((_, i) => newsFor((i + 2) as Rank))
      .filter((n): n is NewsItem => n !== null && state.progress.seenUnlockRewards.includes(`news:${n.rank}`));
  },
  /** 1-based day number of the current order (the finished day while in 'day'). */
  day(state: GameState): number {
    const done = state.progress.completedOrders;
    return state.phase === 'day' ? done / DAY_LENGTH : Math.floor(done / DAY_LENGTH) + 1;
  },
  /** History records of the day just finished (phase 'day'). */
  dayRecords(state: GameState): OrderRecord[] {
    const done = state.progress.completedOrders;
    const from = done - ((done - 1) % DAY_LENGTH);
    return state.progress.history.filter((h) => h.orderNumber >= from && h.orderNumber <= done);
  },
  stallLevel(state: GameState): 0 | 1 | 2 | 3 {
    return stallLevel(state.progress.completedOrders);
  },
  collectionComplete(state: GameState): boolean {
    return isCollectionComplete(state.progress.completedOrders);
  },
  /** Grade/result being shown in feedback or miss. */
  lastStepResult(state: GameState): StepResult | null {
    return state.cook?.lastResult ?? null;
  },
  /** Accepts gesture input only while the step is active (extra inputs ignored otherwise). */
  acceptsInput(state: GameState): boolean {
    return state.phase === 'cook' && state.cook?.sub === 'active' && !state.hidden;
  },
  isPractice(state: GameState): boolean {
    return state.mode === 'practice';
  },
};
