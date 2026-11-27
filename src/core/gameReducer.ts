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
  offerFor,
  ojiichanVisitAt,
  orderForIndex,
  waitingAfter,
  stallLevel,
  unlockConditionText,
  unlockedApples as scheduleApples,
  unlockedRecipes as scheduleRecipes,
  unlocksEarnedAt,
  type Order,
  type WaitingCustomer,
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
import { LADDER, advanceLadder, cleanLadder, goldenRankOf, rankOf, rankUpsOf, type Rank } from './ranks.ts';
import { newsFor, nextDayStart, type NewsItem } from './story.ts';
import { addDish, sanitizeStats, trophyKey, trophyStatus, type TrophyInput, type TrophyStats, type TrophyStatus } from './trophies.ts';
import { PIE_APPLES, PIE_RECIPE, REQUESTS, ROUND_SPEED, STAGE2_KEY, isFeast, menuGolds, menuPlan, menuPoints, requestById, sanitizeClock, sanitizeRequests, sealEarned, waitingRequest, type RequestClock, type RequestRecord } from './requests.ts';

export type Phase = 'shop' | 'choose' | 'cook' | 'serve' | 'result' | 'delivery' | 'day' | 'request';
export type CookSub = 'bridge' | 'instruction' | 'countin' | 'active' | 'feedback' | 'miss';
export type Mode = 'order' | 'practice' | 'request';

/** Screens of a Golden Request outside cooking. */
export type RequestView = 'letter' | 'brief' | 'match' | 'reveal' | 'rewards';

/** A Golden Request being played (not saved: a reload goes back to the shop). */
export interface RequestRun {
  id: string;
  view: RequestView;
  /** Apple picked for each dish (null = not yet). */
  apples: (string | null)[];
  /** Position in the cooking plan (menuPlan: each dish, once per Big party round). */
  dishIndex: number;
  /** Rush order: retries left for the whole menu (null = no limit). */
  retriesLeft: number | null;
  /** Accepted step results of each finished dish. */
  steps: StepResult[][];
  evaluations: DishEvaluation[];
  /** Festival Pie's three apples (a dish of the World Apple Feast). */
  pie: string[];
  /** First time this request is played (rewards and the tip show). */
  first: boolean;
  /** Golden Seal earned on this play (set at the reveal). */
  seal: boolean;
}

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
  /** Ladder ★ steps (not ranks) reached with this order: a stall piece or recipe arrives. */
  steps: number[];
  /** Ojiichan's order: his tasting and the group photo play first. */
  finale: boolean;
  /** A new Golden Chef rank (2+) reached, or null. */
  goldenRank?: number | null;
  collectionComplete: boolean;
}

export interface Progress {
  seed: number;
  completedOrders: number;
  completedOrderIds: string[];
  /** Completed-order count when each ladder step was reached (ranks.ts LADDER). */
  ladder: number[];
  /** The everyday customer not picked last turn, waiting to be served. */
  waiting: WaitingCustomer | null;
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
  /** Golden Requests played. */
  requests: Record<string, RequestRecord>;
  /** When the last request was finished (paces the next letter). */
  requestClock: RequestClock;
}

export interface GameState {
  progress: Progress;
  settings: SaveSettings;
  mode: Mode;
  phase: Phase;
  /** Active order (or the just-completed one while in result/delivery). */
  order: Order;
  /** This turn's customers: the queue's order and, when the kid can choose, a second one. */
  choice: { main: Order; offer: Order | null };
  /** Recipe being practised (mode 'practice'). */
  practiceRecipeId: string | null;
  previewAppleId: string | null;
  /** Festival Pie orders: the three apples picked (appleId is the first). */
  pieApples: string[];
  appleId: string | null;
  cook: CookState | null;
  result: DishEvaluation | null;
  practiceResult: PracticeSummary | null;
  delivery: Delivery | null;
  /** Golden Request being played (mode 'request'). */
  request: RequestRun | null;
  /** Page hidden (cooking paused). */
  hidden: boolean;
  notice: string | null;
}

export type GameAction =
  /** `pick: 'offer'` serves the second customer. */
  | { type: 'ACCEPT_ORDER'; pick?: 'main' | 'offer' }
  | { type: 'PREVIEW_APPLE'; appleId: string }
  | { type: 'CONFIRM_APPLE' }
  | { type: 'BACK' }
  | { type: 'BRIDGE_DONE' }
  | { type: 'READY' }
  | { type: 'COUNTIN_DONE' }
  | { type: 'SUBMIT'; eventMs: number | null; assistedInput?: boolean; graded?: { grade: Grade; error_ms: number | null } }
  | { type: 'FEEDBACK_DONE' }
  | { type: 'RETRY_STEP' }
  /** The guided first try of a new gesture is over (it is never scored): start the real attempt. */
  | { type: 'TRIAL_DONE' }
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
  | { type: 'DISMISS_NOTICE' }
  | { type: 'STAGE2_SEEN' }
  | { type: 'OPEN_REQUEST'; id: string }
  | { type: 'REQUEST_VIEW'; view: 'letter' | 'brief' | 'match' }
  | { type: 'REQUEST_PICK'; dish: number; appleId: string }
  | { type: 'REQUEST_COOK' }
  | { type: 'REQUEST_NEXT' }
  | { type: 'REQUEST_EXIT' }
  /** Festival Pie orders: add an apple to the three, or take it out again. */
  | { type: 'PIE_PICK'; appleId: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activeRecipeId(state: GameState): string {
  if (state.mode === 'request' && state.request) {
    const r = requestById(state.request.id);
    return r.dishes[menuPlan(r)[state.request.dishIndex].dish].recipe;
  }
  return state.mode === 'practice' && state.practiceRecipeId ? state.practiceRecipeId : state.order.recipeId;
}

function attemptIdFor(state: GameState, stepIndex: number, seq: number): string {
  const prefix = state.mode === 'practice' ? `practice-${state.practiceRecipeId}`
    : state.mode === 'request' && state.request ? `request-${state.request.id}-d${state.request.dishIndex + 1}` : state.order.orderId;
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
  const choice = choiceFor(state.progress);
  return {
    ...state,
    mode: 'order',
    phase: 'shop',
    order: choice.main,
    choice,
    practiceRecipeId: null,
    previewAppleId: null,
    pieApples: [],
    appleId: null,
    cook: null,
    result: null,
    practiceResult: null,
    delivery: null,
    request: null,
  };
}

/** This turn's customers for the next order. */
export function choiceFor(p: Progress): { main: Order; offer: Order | null } {
  const main = orderForIndex(p.completedOrders + 1, p.seed, p.ladder);
  return { main, offer: offerFor(main, p.seed, p.ladder, p.waiting) };
}

/** Dish-level assisted grading: onboarding orders 1–3 or assistance mode (never in practice scoring). */
export function isAssistedDish(state: GameState): boolean {
  return state.order.orderNumber <= ASSISTED_ORDER_COUNT || state.settings.assistance;
}

/** Reward keys for celebrations ('apple:a094', 'recipe:apple_jam', 'rank:3'). */
export function rewardKeys(d: { apples: readonly string[]; recipes: readonly string[]; rank?: number | null; steps?: readonly number[]; finale?: boolean; goldenRank?: number | null }): string[] {
  return [
    ...(d.rank ? [`rank:${d.rank}`] : []),
    ...(d.goldenRank ? [`grank:${d.goldenRank}`] : []),
    ...(d.steps ?? []).map((i) => `step:${i}`),
    ...(d.finale ? ['finale'] : []),
    ...d.apples.map((a) => `apple:${a}`),
    ...d.recipes.map((r) => `recipe:${r}`),
  ];
}

/** Rank reached exactly when the completed count was `completed`, or null. */
function rankReachedWith(progress: Progress, completed: number): Rank | null {
  const i = rankUpsOf(progress.ladder).indexOf(completed);
  return i < 0 ? null : ((i + 2) as Rank);
}

/** The order served when `completed` was reached was Ojiichan's visit. */
function finaleAt(progress: Progress, completed: number): boolean {
  return completed > 0 && ojiichanVisitAt(progress.seed, progress.ladder) === completed;
}

/**
 * Unseen rewards earned when the completed count reached `completed`. Null if none.
 * At most two pop-ups between orders: a rank-up (rank page + notebook) or Ojiichan's finale keeps
 * that order's apple delivery for the next order; a recipe that comes with a rank is shown by its
 * notebook page; Golden Trophies wait for the day recap.
 */
export function pendingDelivery(progress: Progress, completed: number = progress.completedOrders, order?: Order): Delivery | null {
  const reached = rankReachedWith(progress, completed);
  const rank = reached && !progress.seenUnlockRewards.includes(`rank:${reached}`) ? reached : null;
  const finale = finaleAt(progress, completed) && !progress.seenUnlockRewards.includes('finale');
  const hold = reached !== null || finaleAt(progress, completed);
  const earned = unlocksEarnedAt(completed, progress.ladder);
  // A regular's gift apple (served with this order) is revealed like a delivery.
  const gift = order && order.orderNumber === completed && order.giftAppleId ? [order.giftAppleId] : [];
  const prevHeld = completed > 1 && (rankReachedWith(progress, completed - 1) !== null || finaleAt(progress, completed - 1));
  const carried = prevHeld ? unlocksEarnedAt(completed - 1, progress.ladder).apples : [];
  const apples = hold ? [] : [...new Set([...carried, ...gift, ...earned.apples])].filter((a) => !progress.seenUnlockRewards.includes(`apple:${a}`));
  const recipes = earned.recipes.filter((r) => !progress.seenUnlockRewards.includes(`recipe:${r}`));
  const steps = progress.ladder.flatMap((at, i) => (at === completed && LADDER[i].star > 0 ? [i] : []))
    .filter((i) => !progress.seenUnlockRewards.includes(`step:${i}`));
  const g = goldenRankOf(progress.totalPoints);
  const goldenRank = g >= 2 && !progress.seenUnlockRewards.includes(`grank:${g}`) ? g : null;
  if (!apples.length && !recipes.length && !rank && !finale && !steps.length && !goldenRank) return null;
  return { apples, recipes, rank, steps, finale, goldenRank, collectionComplete: completed === COLLECTION_COMPLETE_AT };
}

export function trophyInput(p: Progress): TrophyInput {
  const cooked = [...new Set(Object.keys(p.discoveredPairings).map((k) => k.split(':')[0]))];
  // The World Apple Feast is not a passport stamp or a seal of the twelve requests.
  const recs = REQUESTS.map((r) => p.requests[r.id]).filter((r): r is RequestRecord => !!r);
  return { stats: p.trophyStats, cookedApples: cooked, unlockedApples: p.unlockedApples,
    stamps: recs.filter((r) => r.done).length, seals: recs.filter((r) => r.seal).length, requestCount: REQUESTS.length };
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
  // The chef's high score: beats every dish ever served (not the very first dish).
  const prevHigh = Math.max(0, ...Object.values(progress.bestPoints));
  if (progress.completedOrders > 0 && prevHigh > 0 && pts > prevHigh) record.newHigh = true;
  // A regular's story is finished when their last visit is served.
  const v = order.visit;
  const storyDone = v && v.who !== 'ojiichan' && v.of > 0 && v.step === v.of ? v.who : undefined;
  const next: Progress = {
    ...progress,
    trophyStats: addDish(progress.trophyStats, evaluation.recipeId, evaluation.grades.map((g) => g.grade), storyDone),
    totalPoints: progress.totalPoints + pts,
    bestPoints: { ...progress.bestPoints, [evaluation.recipeId]: Math.max(prevBest ?? 0, pts) },
    history: [...progress.history, record].slice(-HISTORY_LIMIT),
    completedOrders,
    completedOrderIds: [...progress.completedOrderIds, order.orderId],
    unlockedApples: canonApples(progress.unlockedApples, [...scheduleApples(completedOrders), ...(order.giftAppleId ? [order.giftAppleId] : [])]),
    unlockedRecipes: canonRecipes(progress.unlockedRecipes, scheduleRecipes(completedOrders, progress.ladder)),
    bestScores: {
      ...progress.bestScores,
      [evaluation.recipeId]: Math.max(progress.bestScores[evaluation.recipeId] ?? 0, evaluation.score.stars),
    },
    discoveredPairings: {
      ...progress.discoveredPairings,
      [key]: { bestStars: Math.max(prevPair?.bestStars ?? 0, evaluation.score.stars), fit: evaluation.fitStars },
    },
  };
  // Ladder check after the points count; a new step can bring a recipe at this same count.
  const ladder = advanceLadder(next.ladder, next.totalPoints, completedOrders);
  if (ladder.length === next.ladder.length) return next;
  return { ...next, ladder, unlockedRecipes: canonRecipes(next.unlockedRecipes, scheduleRecipes(completedOrders, ladder)) };
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
  const ladder = cleanLadder(save.ladder, save.completedOrders);
  return {
    seed: save.seed,
    completedOrders: save.completedOrders,
    completedOrderIds: [...save.completedOrderIds],
    ladder,
    waiting: save.waiting ? { ...save.waiting } : null,
    unlockedApples: canonApples(save.unlockedApples, scheduleApples(save.completedOrders)),
    unlockedRecipes: canonRecipes(save.unlockedRecipes, scheduleRecipes(save.completedOrders, ladder)),
    bestScores: { ...save.bestScores },
    discoveredPairings: { ...save.discoveredPairings },
    seenUnlockRewards: [...save.seenUnlockRewards],
    totalPoints: save.totalPoints,
    bestPoints: { ...save.bestPoints },
    history: save.history.map((h) => ({ ...h, grades: [...h.grades] })),
    trophyStats: sanitizeStats(save.trophyStats, save.history),
    requests: sanitizeRequests(save.requests),
    requestClock: sanitizeClock(save.requestClock),
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
    order: orderForIndex(progress.completedOrders + 1, progress.seed, progress.ladder),
    choice: { main: orderForIndex(progress.completedOrders + 1, progress.seed, progress.ladder), offer: null },
    practiceRecipeId: null,
    previewAppleId: null,
    pieApples: [],
    appleId: null,
    cook: null,
    result: null,
    practiceResult: null,
    delivery: null,
    request: null,
    hidden: false,
    notice,
  });
  const cur = save.current;
  if (!cur) return base;

  if (cur.phase === 'result' || cur.phase === 'delivery') {
    const committed = progress.completedOrderIds.includes(cur.orderId) || cur.orderNumber <= progress.completedOrders;
    if (!committed || !cur.pendingResult || cur.orderNumber !== progress.completedOrders) return base;
    const order = customOrder(cur.orderNumber, cur.pendingResult.recipeId as Order['recipeId'], progress.seed, progress.ladder);
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
  const picked = cur.pick === 'offer' ? base.choice.offer : base.choice.main;
  const order = picked && picked.recipeId === cur.recipeId
    ? picked : customOrder(cur.orderNumber, cur.recipeId as Order['recipeId'], progress.seed, progress.ladder);
  const state: GameState = { ...base, order, pieApples: order.recipeId === PIE_RECIPE && cur.pieApples ? [...cur.pieApples] : [] };
  const appleOk = cur.appleId !== null && progress.unlockedApples.includes(cur.appleId);
  if (cur.phase === 'shop') return state;
  // A pie being cooked without its three apples goes back to picking them.
  if (cur.phase === 'choose' || !appleOk || (order.recipeId === PIE_RECIPE && state.pieApples.length !== PIE_APPLES)) {
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
    ...(state.order.alt ? { pick: 'offer' as const } : {}),
  };
  if (state.mode === 'practice' || state.mode === 'request' || state.phase === 'shop') {
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
      ...(isPieOrder(state) && state.pieApples.length === PIE_APPLES ? { pieApples: [...state.pieApples] } : {}),
    };
  } else {
    current = {
      ...base,
      recipeId: state.result?.recipeId ?? state.order.recipeId,
      appleId: state.appleId,
      phase: state.phase as 'result' | 'delivery',
      stepIndex: 0,
      stepResults: [],
      attemptId: '',
      pendingResult: state.result,
    };
  }
  return {
    version: 5,
    actionSystemVersion: '2.0',
    seed: p.seed,
    completedOrders: p.completedOrders,
    completedOrderIds: [...p.completedOrderIds],
    ladder: [...p.ladder],
    waiting: p.waiting ? { ...p.waiting } : null,
    unlockedApples: [...p.unlockedApples],
    unlockedRecipes: [...p.unlockedRecipes],
    bestScores: { ...p.bestScores },
    discoveredPairings: { ...p.discoveredPairings },
    totalPoints: p.totalPoints,
    bestPoints: { ...p.bestPoints },
    history: p.history.map((h) => ({ ...h, grades: [...h.grades] })),
    trophyStats: { ...p.trophyStats, storiesDone: [...p.trophyStats.storiesDone] },
    requests: Object.fromEntries(Object.entries(p.requests).map(([k, r]) => [k, { ...r }])),
    requestClock: { ...p.requestClock },
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
      if (action.pick === 'offer' && !state.choice.offer) return state;
      return { ...state, order: action.pick === 'offer' ? state.choice.offer! : state.choice.main, phase: 'choose', previewAppleId: null, pieApples: [], appleId: null };

    case 'PREVIEW_APPLE':
      if (state.phase !== 'choose' || !isAppleId(action.appleId)) return state;
      if (!state.progress.unlockedApples.includes(action.appleId)) return state;
      if (state.previewAppleId === action.appleId) return state;
      return { ...state, previewAppleId: action.appleId };

    case 'PIE_PICK': {
      // Festival Pie orders take three different apples: a tap adds an apple, or takes it out again.
      if (state.phase !== 'choose' || !isPieOrder(state) || !state.progress.unlockedApples.includes(action.appleId)) return state;
      const has = state.pieApples.includes(action.appleId);
      if (!has && state.pieApples.length >= PIE_APPLES) return state;
      const pieApples = has ? state.pieApples.filter((a) => a !== action.appleId) : [...state.pieApples, action.appleId];
      return { ...state, pieApples, previewAppleId: has ? pieApples[pieApples.length - 1] ?? null : action.appleId };
    }

    case 'CONFIRM_APPLE':
      if (state.phase !== 'choose' || !state.previewAppleId) return state;
      if (isPieOrder(state)) {
        if (state.pieApples.length !== PIE_APPLES) return state;
        return { ...state, phase: 'cook', appleId: state.pieApples[0], cook: newCook() };
      }
      return { ...state, phase: 'cook', appleId: state.previewAppleId, cook: newCook() };

    case 'BACK':
      if (state.phase !== 'choose') return state;
      if (state.mode === 'practice') return exitPractice(state);
      return { ...state, phase: 'shop', order: state.choice.main, previewAppleId: null, pieApples: [] };

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

    case 'RETRY_STEP': {
      if (state.phase !== 'cook' || !state.cook || (state.cook.sub !== 'miss' && state.cook.sub !== 'feedback'))
        return state;
      // Rush order: one retry for the whole menu.
      const run = state.mode === 'request' ? state.request : null;
      if (run && run.retriesLeft !== null) {
        if (run.retriesLeft <= 0) return state;
        return { ...state, request: { ...run, retriesLeft: run.retriesLeft - 1 }, cook: startAttempt(state, state.cook, 'countin') };
      }
      return { ...state, cook: startAttempt(state, state.cook, 'countin') };
    }

    case 'TRIAL_DONE':
      return withCook(state, 'active', (cook) => {
        const step = currentStepOf(state);
        const key = step ? `try:${step.gesture}` : null;
        const seen = state.progress.seenUnlockRewards;
        return {
          ...state,
          cook: startAttempt(state, cook, 'countin'),
          progress: key && !seen.includes(key) ? { ...state.progress, seenUnlockRewards: [...seen, key] } : state.progress,
        };
      });

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
      if (state.mode === 'request' && state.request) return serveRequestDish(state, state.request, recipeId);
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
        ...(isPieOrder(state) && state.pieApples.length === PIE_APPLES ? { pieApples: state.pieApples } : {}),
      });
      const committed = commitCompletedOrder(state.progress, state.order, evaluation);
      const progress = committed === state.progress ? committed
        : { ...committed, waiting: waitingAfter(state.choice.main, state.choice.offer, state.order, state.progress.waiting) };
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

    case 'DAY_DONE': {
      if (state.phase !== 'day') return state;
      // The recap showed the day's new Golden Trophy steps.
      const seen = selectors.newTrophies(state).flatMap((t) => Array.from({ length: t.tier }, (_, k) => trophyKey(t.id, k + 1)));
      return nextOrderState({ ...state, progress: { ...state.progress, seenUnlockRewards: union(state.progress.seenUnlockRewards, seen) } });
    }

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

    case 'STAGE2_SEEN':
      if (state.progress.seenUnlockRewards.includes(STAGE2_KEY)) return state;
      return { ...state, progress: { ...state.progress, seenUnlockRewards: [...state.progress.seenUnlockRewards, STAGE2_KEY],
        requestClock: { at: state.progress.completedOrders, last: null } } };

    case 'OPEN_REQUEST': {
      if (state.phase !== 'shop' || state.mode !== 'order') return state;
      if (!state.progress.seenUnlockRewards.includes(STAGE2_KEY) || !(REQUESTS.some((r) => r.id === action.id) || isFeast(action.id))) return state;
      const r = requestById(action.id);
      // A new request opens only when it is the one waiting; finished ones can be replayed.
      const rec = state.progress.requests[r.id];
      if (!rec?.done && selectors.waitingRequest(state)?.id !== r.id) return state;
      return {
        ...state,
        mode: 'request',
        phase: 'request',
        appleId: null,
        previewAppleId: null,
        cook: null,
        request: { id: r.id, view: 'letter', apples: r.dishes.map(() => null), pie: [], dishIndex: 0, steps: [], evaluations: [], first: !rec?.done, seal: false,
          retriesLeft: r.twist.kind === 'rush' ? r.twist.retries ?? 1 : null },
      };
    }

    case 'REQUEST_VIEW': {
      const run = state.request;
      if (state.phase !== 'request' || !run || !['letter', 'brief', 'match'].includes(run.view)) return state;
      return run.view === action.view ? state : { ...state, request: { ...run, view: action.view } };
    }

    case 'REQUEST_PICK': {
      const run = state.request;
      if (state.phase !== 'request' || !run || run.view !== 'match') return state;
      if (action.dish < 0 || action.dish >= run.apples.length || !state.progress.unlockedApples.includes(action.appleId)) return state;
      if (requestById(run.id).dishes[action.dish].recipe === PIE_RECIPE) {
        // Festival Pie: three different apples; a tap adds one or takes it out again.
        const has = run.pie.includes(action.appleId);
        if (!has && run.pie.length >= PIE_APPLES) return state;
        const pie = has ? run.pie.filter((a) => a !== action.appleId) : [...run.pie, action.appleId];
        const apples = run.apples.map((a, i) => (i === action.dish ? (pie.length === PIE_APPLES ? pie[0] : null) : a));
        return { ...state, request: { ...run, pie, apples } };
      }
      if (run.apples[action.dish] === action.appleId) return state;
      const apples = run.apples.map((a, i) => (i === action.dish ? action.appleId : a));
      return { ...state, request: { ...run, apples } };
    }

    case 'REQUEST_COOK': {
      const run = state.request;
      if (state.phase !== 'request' || !run || run.view !== 'match' || run.apples.some((a) => a === null)) return state;
      const r0 = requestById(run.id);
      return { ...state, phase: 'cook', appleId: run.apples[menuPlan(r0)[0].dish], cook: newCook(),
        request: { ...run, dishIndex: 0, steps: [], evaluations: [], retriesLeft: r0.twist.kind === 'rush' ? r0.twist.retries ?? 1 : null } };
    }

    case 'REQUEST_NEXT': {
      const run = state.request;
      if (state.phase !== 'request' || !run) return state;
      if (run.view === 'reveal') return { ...state, request: { ...run, view: 'rewards' } };
      if (run.view === 'rewards') return finishRequest(state, run);
      return state;
    }

    case 'REQUEST_EXIT': {
      const run = state.request;
      if (state.mode !== 'request' || !run) return state;
      // Leaving before cooking changes nothing; a played menu is finished properly.
      if (run.view === 'reveal' || run.view === 'rewards') return finishRequest(state, run);
      if (state.phase !== 'request') return state;
      return leaveRequest(state);
    }

    default:
      return state;
  }
}

/** Something was celebrated after the order that reached `completed` (rank, finale or unlock). */
function deliveredAt(p: Progress, completed: number): boolean {
  if (completed < 1) return false;
  const u = unlocksEarnedAt(completed, p.ladder);
  return u.apples.length > 0 || u.recipes.length > 0 || p.ladder.includes(completed) || finaleAt(p, completed);
}

/** Day recap after the last order of a day, otherwise the next order. */
function afterOrder(state: GameState): GameState {
  const done = state.progress.completedOrders;
  if (done > 0 && done % DAY_LENGTH === 0 && state.order.orderNumber === done) return { ...state, phase: 'day' };
  return nextOrderState(state);
}

/** A dish of the menu is served: score it, then cook the next one or go to the reveal. */
function serveRequestDish(state: GameState, run: RequestRun, recipeId: string): GameState {
  const evaluation = evaluateDish({
    appleId: state.appleId!,
    recipeId,
    results: state.cook!.stepResults,
    assisted: state.settings.assistance,
    availableApples: state.progress.unlockedApples,
    availableRecipes: state.progress.unlockedRecipes,
    ...(recipeId === PIE_RECIPE && run.pie.length === PIE_APPLES ? { pieApples: run.pie } : {}),
  });
  const steps = [...run.steps, state.cook!.stepResults.map((r) => ({ ...r }))];
  const evaluations = [...run.evaluations, evaluation];
  const r = requestById(run.id);
  const plan = menuPlan(r);
  if (run.dishIndex + 1 < plan.length) {
    const dishIndex = run.dishIndex + 1;
    return { ...state, phase: 'cook', appleId: run.apples[plan[dishIndex].dish], cook: newCook(), request: { ...run, dishIndex, steps, evaluations } };
  }
  const golds = menuGolds(r, run.apples, run.pie);
  return { ...state, phase: 'request', cook: null, request: { ...run, steps, evaluations, view: 'reveal', seal: sealEarned(golds, steps) } };
}

/** Commit a played menu (points, trophies, the request record) and go back to the shop. */
function finishRequest(state: GameState, run: RequestRun): GameState {
  const p = state.progress;
  const prev = p.requests[run.id];
  const stars = run.evaluations.reduce((n, e) => n + e.score.stars, 0);
  let trophyStats = p.trophyStats;
  const discoveredPairings = { ...p.discoveredPairings };
  run.evaluations.forEach((e, i) => {
    trophyStats = addDish(trophyStats, e.recipeId, run.steps[i].map((s) => s.grade));
    const key = `${e.appleId}:${e.recipeId}`;
    discoveredPairings[key] = { bestStars: Math.max(discoveredPairings[key]?.bestStars ?? 0, e.score.stars), fit: e.fitStars };
  });
  const req = requestById(run.id);
  const golds = menuGolds(req, run.apples, run.pie).filter(Boolean).length;
  trophyStats = { ...trophyStats, goldMatches: trophyStats.goldMatches + golds };
  const totalPoints = p.totalPoints + menuPoints(run.evaluations.map((e) => e.score.total), run.seal).total;
  const record: RequestRecord = {
    done: true,
    seal: (prev?.seal ?? false) || run.seal,
    plays: (prev?.plays ?? 0) + 1,
    bestStars: Math.max(prev?.bestStars ?? 0, stars),
  };
  const progress: Progress = { ...p, trophyStats, discoveredPairings, totalPoints, requests: { ...p.requests, [run.id]: record },
    requestClock: { at: p.completedOrders, last: run.id } };
  return leaveRequest({ ...state, progress });
}

/** A Festival Pie order (not practice): it takes three apples. */
function isPieOrder(state: GameState): boolean {
  return state.mode === 'order' && state.order.recipeId === PIE_RECIPE;
}

function leaveRequest(state: GameState): GameState {
  return { ...state, mode: 'order', phase: 'shop', request: null, cook: null, appleId: null, previewAppleId: null };
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
  const step = recipe(activeRecipeId(state)).steps[state.cook.stepIndex] ?? null;
  // Big party: later rounds run faster (the ring closes sooner; the windows stay the same).
  const run = state.mode === 'request' ? state.request : null;
  if (step && run) {
    const item = menuPlan(requestById(run.id))[run.dishIndex];
    if (item && item.round > 1) {
      const k = Math.pow(ROUND_SPEED, item.round - 1);
      return { ...step, timing: { ...step.timing, duration_ms: Math.round(step.timing.duration_ms * k), target_ms: Math.round(step.timing.target_ms * k) } };
    }
  }
  return step;
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
  /**
   * The current step's gesture is new to this chef: its first attempt is a guided, unscored try.
   * Orders only. A gesture counts as known once tried, or once any served dish used it (older saves
   * with orders but no history know them all).
   */
  needsTrial(state: GameState): boolean {
    if (state.mode !== 'order' || !state.cook) return false;
    const step = currentStepOf(state);
    if (!step) return false;
    const p = state.progress;
    if (p.seenUnlockRewards.includes(`try:${step.gesture}`)) return false;
    if (p.completedOrders > 0 && p.history.length === 0) return false;
    return !p.history.some((o) => recipe(o.recipeId).steps.some((st) => st.gesture === step.gesture));
  },
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
    return rankOf(state.progress.ladder);
  },
  /** Customer model on the left: the one not (yet) picked, or the one waiting from last turn. */
  sideCustomer(state: GameState): string | null {
    const { main, offer } = state.choice;
    if (offer) return state.order.alt ? main.customerId : offer.customerId;
    const w = state.progress.waiting?.customerId ?? null;
    return w && w !== state.order.customerId ? w : null;
  },
  /** Ojiichan helps at the stall from the order after his visit. */
  ojiichanHelps(state: GameState): boolean {
    const at = ojiichanVisitAt(state.progress.seed, state.progress.ladder);
    return at !== null && state.progress.completedOrders >= at && state.order.visit?.who !== 'ojiichan';
  },
  /** Ladder steps reached. */
  steps(state: GameState): number {
    return state.progress.ladder.length;
  },
  /** Golden Trophy steps reached but not yet celebrated (shown in the day recap). */
  newTrophies(state: GameState): { id: string; tier: number }[] {
    const p = state.progress;
    return trophyStatus(trophyInput(p))
      .filter((t) => t.tier > 0 && !p.seenUnlockRewards.includes(trophyKey(t.id, t.tier)))
      .map((t) => ({ id: t.id, tier: t.tier }));
  },
  /**
   * The news card to show now: in the shop, from the first order of the day after the rank-up,
   * oldest unseen first. Null when there is none.
   */
  pendingNews(state: GameState): NewsItem | null {
    if (state.phase !== 'shop' || state.mode !== 'order') return null;
    const p = state.progress;
    const ups = rankUpsOf(p.ladder);
    for (let i = 0; i < ups.length; i++) {
      const rank = (i + 2) as Rank;
      if (p.seenUnlockRewards.includes(`news:${rank}`)) continue;
      // From the next day; if the day ended on a delivery, one order later (max two pop-ups).
      const start = nextDayStart(ups[i]);
      const num = state.order.orderNumber;
      if (num < start || (num === start && deliveredAt(p, start - 1))) continue;
      const n = newsFor(rank);
      if (n) return n;
    }
    return null;
  },
  /** The Stage 2 intro plays now: in the shop, from the day after Ojiichan's visit, after any news card. */
  pendingStage2(state: GameState): boolean {
    if (state.phase !== 'shop' || state.mode !== 'order') return false;
    const p = state.progress;
    if (p.seenUnlockRewards.includes(STAGE2_KEY) || !p.seenUnlockRewards.includes('finale')) return false;
    const at = ojiichanVisitAt(p.seed, p.ladder);
    if (at === null || state.order.orderNumber < nextDayStart(at)) return false;
    return selectors.pendingNews(state) === null;
  },
  /** The Golden Request letter waiting on the counter (shop only). */
  waitingRequest(state: GameState) {
    if (state.phase !== 'shop' || state.mode !== 'order') return null;
    const p = state.progress;
    return waitingRequest(p.seenUnlockRewards, p.requests, p.requestClock, p.completedOrders, p.unlockedRecipes.includes(PIE_RECIPE));
  },
  /** Golden Chef rank (0 before Golden Chef). */
  goldenRank(state: GameState): number {
    return state.progress.ladder.length >= LADDER.length ? Math.max(1, goldenRankOf(state.progress.totalPoints)) : 0;
  },
  /** Apple ids the player has cooked with at least once. */
  cookedApples(state: GameState): Set<string> {
    return new Set(Object.keys(state.progress.discoveredPairings).map((k) => k.split(':')[0]));
  },
  /** The chef's records: best dish ever, total points, Golden Recipes, longest Perfect run. */
  records(state: GameState): { high: { recipeId: string; points: number } | null; total: number; golden: number; streak: number } {
    const p = state.progress;
    const best = Object.entries(p.bestPoints).sort((a, b) => b[1] - a[1])[0];
    return {
      high: best && best[1] > 0 ? { recipeId: best[0], points: best[1] } : null,
      total: p.totalPoints,
      golden: p.history.filter((h) => h.golden).length,
      streak: p.trophyStats.bestStreak,
    };
  },
  /** Golden Trophy progress, in cabinet order. */
  trophies(state: GameState): TrophyStatus[] {
    return trophyStatus(trophyInput(state.progress));
  },
  /** News cards already seen (the scrapbook), oldest first. */
  seenNews(state: GameState): NewsItem[] {
    return rankUpsOf(state.progress.ladder)
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
