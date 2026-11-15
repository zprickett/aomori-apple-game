/**
 * Explicit, pure game state machine.
 *
 *   shop ──ACCEPT_ORDER──▶ choose ──CONFIRM_APPLE──▶ cook ──(last FEEDBACK_DONE)──▶ serve
 *     ▲                     │BACK                                                    │SERVE_DONE (commits order)
 *     │                     ▼                                                        ▼
 *     └──────── DELIVERY_DONE ◀── delivery ◀── RESULT_DONE (if new unlocks) ◀── result
 *     └────────────────────────────────────── RESULT_DONE (no unlocks) ◀────────────┘
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

export type Phase = 'shop' | 'choose' | 'cook' | 'serve' | 'result' | 'delivery';
export type CookSub = 'bridge' | 'instruction' | 'countin' | 'active' | 'feedback' | 'miss';
export type Mode = 'order' | 'practice';

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
  collectionComplete: boolean;
}

export interface Progress {
  seed: number;
  completedOrders: number;
  completedOrderIds: string[];
  unlockedApples: string[];
  unlockedRecipes: string[];
  bestScores: Record<string, number>;
  discoveredPairings: Record<string, { bestStars: number; fit: number }>;
  seenUnlockRewards: string[];
  totalPoints: number;
  bestPoints: Record<string, number>;
  history: OrderRecord[];
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
    order: orderForIndex(n, state.progress.seed),
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

/** Reward keys for celebrations ('apple:a094', 'recipe:apple_jam'). */
export function rewardKeys(d: { apples: readonly string[]; recipes: readonly string[] }): string[] {
  return [...d.apples.map((a) => `apple:${a}`), ...d.recipes.map((r) => `recipe:${r}`)];
}

/** Unseen unlock rewards earned when completed count reached `completed`. Null if none. */
export function pendingDelivery(progress: Progress, completed: number = progress.completedOrders): Delivery | null {
  const earned = unlocksEarnedAt(completed);
  const apples = earned.apples.filter((a) => !progress.seenUnlockRewards.includes(`apple:${a}`));
  const recipes = earned.recipes.filter((r) => !progress.seenUnlockRewards.includes(`recipe:${r}`));
  if (!apples.length && !recipes.length) return null;
  return { apples, recipes, collectionComplete: completed === 15 && isCollectionComplete(completed) };
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
    newBest: prevBest === undefined || pts > prevBest,
  };
  return {
    ...progress,
    totalPoints: progress.totalPoints + pts,
    bestPoints: { ...progress.bestPoints, [evaluation.recipeId]: Math.max(prevBest ?? 0, pts) },
    history: [...progress.history, record].slice(-HISTORY_LIMIT),
    completedOrders,
    completedOrderIds: [...progress.completedOrderIds, order.orderId],
    unlockedApples: canonApples(progress.unlockedApples, scheduleApples(completedOrders)),
    unlockedRecipes: canonRecipes(progress.unlockedRecipes, scheduleRecipes(completedOrders)),
    bestScores: {
      ...progress.bestScores,
      [evaluation.recipeId]: Math.max(progress.bestScores[evaluation.recipeId] ?? 0, evaluation.finishedStars),
    },
    discoveredPairings: {
      ...progress.discoveredPairings,
      [key]: { bestStars: Math.max(prevPair?.bestStars ?? 0, evaluation.finishedStars), fit: evaluation.fitStars },
    },
  };
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
  return {
    seed: save.seed,
    completedOrders: save.completedOrders,
    completedOrderIds: [...save.completedOrderIds],
    unlockedApples: canonApples(save.unlockedApples, scheduleApples(save.completedOrders)),
    unlockedRecipes: canonRecipes(save.unlockedRecipes, scheduleRecipes(save.completedOrders)),
    bestScores: { ...save.bestScores },
    discoveredPairings: { ...save.discoveredPairings },
    seenUnlockRewards: [...save.seenUnlockRewards],
    totalPoints: save.totalPoints,
    bestPoints: { ...save.bestPoints },
    history: save.history.map((h) => ({ ...h, grades: [...h.grades] })),
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
    order: orderForIndex(progress.completedOrders + 1, progress.seed),
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
    const order = customOrder(cur.orderNumber, cur.pendingResult.recipeId as Order['recipeId'], progress.seed);
    const delivery = pendingDelivery(progress, cur.orderNumber);
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
  const order = customOrder(cur.orderNumber, cur.recipeId as Order['recipeId'], progress.seed);
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
    version: 2,
    actionSystemVersion: '2.0',
    seed: p.seed,
    completedOrders: p.completedOrders,
    completedOrderIds: [...p.completedOrderIds],
    unlockedApples: [...p.unlockedApples],
    unlockedRecipes: [...p.unlockedRecipes],
    bestScores: { ...p.bestScores },
    discoveredPairings: { ...p.discoveredPairings },
    totalPoints: p.totalPoints,
    bestPoints: { ...p.bestPoints },
    history: p.history.map((h) => ({ ...h, grades: [...h.grades] })),
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
        // Assistance mode explicitly on → an assisted 'OK'; otherwise the Miss is recorded.
        const grade = state.settings.assistance ? ('OK' as const) : ('Miss' as const);
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
        delivery: pendingDelivery(progress, state.order.orderNumber),
      };
    }

    case 'RESULT_DONE':
      if (state.phase !== 'result') return state;
      if (state.mode === 'practice') return exitPractice(state);
      if (state.delivery) return { ...state, phase: 'delivery' };
      return nextOrderState(state);

    case 'DELIVERY_DONE': {
      if (state.phase !== 'delivery') return state;
      const seen = state.delivery ? rewardKeys(state.delivery) : [];
      const progress = { ...state.progress, seenUnlockRewards: union(state.progress.seenUnlockRewards, seen) };
      return nextOrderState({ ...state, progress });
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
  /** All 10 apple cards in prototype order with lock state and fit for the active recipe. */
  appleCards(state: GameState): AppleCard[] {
    const inDish = state.phase !== 'shop' || state.mode === 'practice';
    const rid = activeRecipeId(state);
    return APPLE_ORDER.map((id) => ({
      apple: apple(id),
      unlocked: state.progress.unlockedApples.includes(id),
      unlockText: unlockConditionText(id),
      fitStars: inDish ? fitStars(id, rid) : null,
    }));
  },
  previewFit(state: GameState): 0 | 1 | 2 | 3 | null {
    return state.previewAppleId ? fitStars(state.previewAppleId, activeRecipeId(state)) : null;
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
