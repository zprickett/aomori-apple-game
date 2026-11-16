# Aomori Apple Kitchen — core game-logic API

Pure TypeScript, no rendering, no React. Import from `src/core` (barrel `index.ts`) or from individual modules.

```ts
import { gameReducer, initialStateFromSave, toSaveData, selectors, createSaveStore,
         TapRecognizer, SwipeRecognizer, CircleRecognizer, apple, recipe } from './core';
```

| Module | Purpose |
|---|---|
| `content.ts` | Typed adapter over `prototype_game_data.json` + `recipe_actions_20.json`; validation at import |
| `timing.ts` | Typed port of `gradeTiming` / `summarizeTechnique` (parity-tested against the `.mjs`) |
| `recognizers.ts` | Tap / Swipe / Circle gesture recognizers |
| `stepTimer.ts` | Step tolerance, grading, expiry, track zones, count-in |
| `scoring.ts` | `evaluateDish` (fit + technique → finished stars, explanation, tip) |
| `progression.ts` | Unlock schedule, stall level, deterministic seeded order queue |
| `persistence.ts` | Versioned save (v2), sanitising, v1 migration, localStorage/memory store |
| `gameReducer.ts` | Explicit state machine, save ↔ state, selectors |

Importing `content.ts` runs `validateContent()` (and the reference `validateActionCatalog`) once and throws if the data is broken. There are no other import side effects.

---

## content.ts

### Types
```ts
type Gesture = 'tap' | 'swipe' | 'circle';
type FitStars = 0 | 1 | 2 | 3;
type AppleId = 'a048' | 'a081' | 'a023' | 'a066' | 'a006' | 'a094' | 'a091' | 'a032' | 'a058' | 'a086';
type RecipeId = 'fresh_juice' | 'rabbit_apples' | 'apple_jam' | 'hirosaki_pie' | 'ringo_ame';

interface StepDef {
  id: string; recipeId: string; index: number;          // index = 0-based position in recipe
  gesture: Gesture; label: string; prompt: string;
  target_object: string; animation_event: string; timing_event: string;
  timing: { duration_ms; target_ms; perfect_ms; good_ms; ok_ms };   // ms, step timebase
  geometry_profile?: string; failure_animation?: string;
}
interface RecipeInfo {
  id; name /* player-facing, e.g. "Mini Candy Apple" */; nameJa; dataName /* name_en in data */;
  variantId; actionCount; preserveWholeApple; appleForm;
  bridges: string[];      // automatic_preparation_and_bridges ([0] before first action, [last] while serving)
  steps: StepDef[]; profile; culturalContext; researchNote;
}
interface AppleInfo {
  id; nameEn; nameJa; overviewForKids; traitHint /* one line for kids */;
  stats: { sweetness; tartness; juiciness; raw_firmness; aroma };   // 1–5 game translations
  sizeClass: 'standard' | 'small' | 'mini';
  fleshRed: boolean;          // only flesh_color 'pink_or_red' (Kurenai no Yume)
  browning: string | null;    // 'resistant' for Chiyuki, else null (unknown)
  heatBehavior: string | null;// documented only: 'retains_shape' (Kogyoku), 'breaks_down_quickly' (Bramley)
  sizeText: string | null;
  skin: { base: string; second: string; pattern: 'streak' | 'blush' | 'solid' };
  flesh: string;              // '#FFF1C9' default, '#F29AA6' Kurenai no Yume
  scale: number;              // mini 0.65, small 0.85, standard 1, Bramley 1.12
}
interface Pairing { appleId; recipeId; fitStars: FitStars; fitLabel; reason; confidence;
                    evidenceBasis; ratingStatus; uncertainInputs: string[]; adaptation: string | null }
```

### Values / functions
| Export | Description |
|---|---|
| `APPLES: readonly AppleInfo[]` | 10 apples in prototype order a048, a081, a023, a066, a006, a094, a091, a032, a058, a086 |
| `RECIPES: readonly RecipeInfo[]` | 5 playable recipes: fresh_juice, rabbit_apples, apple_jam, hirosaki_pie, ringo_ame |
| `APPLE_ORDER`, `RECIPE_ORDER`, `RECIPE_DISPLAY_NAMES`, `REQUIRED_ACTION_COUNTS`, `COOKED_RECIPES`, `GESTURES` | constants |
| `apple(id)`, `recipe(id)` | lookup; throw on unknown ids |
| `fitStars(appleId, recipeId): FitStars` | researched fit from the JSON |
| `pairing(appleId, recipeId): Pairing` | full record (reason, confidence, …) for dev/reference views |
| `isAppleId(x)`, `isRecipeId(x)` | type guards |
| `gameplayTipFor(appleId, available?)` | kid tip naming **only playable** recipes (fit 3, else 2, else 1); optional filter by unlocked recipe ids. e.g. `"Try Fuji in Fresh Apple Juice or Rabbit Apple Wedges!"`. Adds qualitative data-backed notes (Kurenai pink flesh; Chiyuki "Its cut flesh resists browning."). No numbers. |
| `zeroFitTip(appleId, recipeId, available?)` | `"Try this apple in another dish! Bramley is Best in Apple Jam or Hirosaki Apple Pie."` (raw dishes → prefers cooked) |
| `bestApplesFor(recipeId, pool?)` | apples ranked by fit |
| `joinOr(items)` | "A", "A or B", "A, B or C" |
| `RATING_LABELS` / `CHILD_FEEDBACK` / `ZERO_FIT_FEEDBACK` | text from data; `ZERO_FIT_FEEDBACK = "Try this apple in another dish!"` |
| `validateContent(proto?, catalog?)` | throws on: ≠10 apples / ≠5 recipes / ≠50 unique pairings, duplicate apple/recipe/step/pairing ids, score outside 0–3, gesture outside vocabulary, swipe in any `preserve_whole_apple` recipe, circle in ringo_ame, action counts ≠ 1/2/3/5/4, missing bindings, invalid timing; then runs the reference `validateActionCatalog`. Returns `{apples, recipes, pairings, timedSteps}`. |

---

## timing.ts
```ts
type Grade = 'Perfect' | 'Good' | 'OK' | 'Miss';
const GRADE_POINTS = { Perfect: 1, Good: 0.75, OK: 0.35, Miss: 0 };
const ASSIST_TOLERANCE = 1.5;
gradeTiming(timing, eventMs: number | null, geometryValid = true, toleranceMultiplier = 1)
  → { grade, points, error_ms /* eventMs − target, null if no valid event */ }
summarizeTechnique(results: {grade}[], { assisted? })
  → { mean, techniqueBonus: 0|1, executionPenalty: 0|1, assisted }
```
Identical semantics to `timing_reference.mjs` (inclusive windows; event < 0 or > deadline → Miss; same error messages).

---

## recognizers.ts — feeding pointer input

### Coordinate & time contract
* **x, y**: normalised work-surface units on a **square** surface, 0..1, y down. Use the same square for drawing the guides and hit targets.
* **t**: active-clock ms in the step timebase = ms since the step's timed phase (after count-in) started. May be negative before the start.
* Recognizers use only sample timestamps → frame-rate independent.

```ts
interface PointerSample { x: number; y: number; t: number; pointerId: number }
interface RecognizerResult { eventMs: number; kind: 'tap'|'swipe'|'circle'; detail?: TapDetail|SwipeDetail|CircleDetail }
interface Recognizer {
  down(s); move(s); up(s); cancel(pointerId?);
  readonly result: RecognizerResult | null;   // set once; never changes until reset()
  readonly progress: number;                  // 0..1 (circle net-turn fraction; tap/swipe 0|1)
  readonly feedback: RecognizerFeedback | null;
  reset(): void;                              // for Retry
  readonly kind;
}
type RecognizerFeedback = 'missed_target' | 'too_short' | 'off_guide' | 'wrong_angle'
                        | 'too_slow' | 'outside_ring' | 'too_fast' | 'incomplete';
```
Single pointer: a second pointer's `down` is ignored while one is active; samples with another `pointerId` are ignored.

#### Wiring example (React/DOM)
```ts
// When the reducer enters cook.sub === 'active' (after COUNTIN_DONE):
let activeStartPerf = performance.now();          // same clock as PointerEvent.timeStamp
const step = selectors.currentStep(state)!;
const rec = new SwipeRecognizer({ x1: .25, y1: .5, x2: .75, y2: .5, crossX: .5, crossY: .5 });

const onPointer = (e: PointerEvent) => {
  if (!selectors.acceptsInput(state)) return;      // ignore inputs during feedback etc.
  const rect = surface.getBoundingClientRect();     // the square work surface
  const evs = e.type === 'pointermove' ? e.getCoalescedEvents?.() ?? [e] : [e];
  for (const ev of evs) {
    const s = sampleFromPointer(ev, rect, activeStartPerf); // t = ev.timeStamp − activeStartPerf
    if (e.type === 'pointerdown') { surface.setPointerCapture(e.pointerId); rec.down(s); }
    else if (e.type === 'pointermove') rec.move(s);
    else if (e.type === 'pointerup') rec.up(s);
  }
  if (e.type === 'pointercancel') rec.cancel(e.pointerId); // discards gesture, clock keeps running
  if (rec.result) dispatch({ type: 'SUBMIT', eventMs: rec.result.eventMs });
};
// Deadline: in a rAF loop, if isExpired(step, performance.now() − activeStartPerf) and no result:
//   dispatch({ type: 'SUBMIT', eventMs: null });
// Hidden page: dispatch VISIBILITY_HIDDEN; discard the recognizer; on return the reducer is at
// 'instruction' → READY → fresh count-in → new activeStartPerf, new/reset recognizer.
```
`sampleFromPointer(e, rect, activeStartPerf)` divides by `min(width, height)` of the rect. `pxToUnits(px, surfacePx)` converts a CSS-px radius (≥ 24 px radius for a 48 px target) to units.

`createRecognizer({ gesture, ...config })` builds one from a `StepDef.gesture`.

### TapRecognizer({ x, y, radius })
Pointer-down inside the circle submits; `eventMs` = down time. Down outside → `feedback = 'missed_target'`, no submission. No hold/drag needed. Tap spam submits once.

### SwipeRecognizer({ x1, y1, x2, y2, crossX, crossY, …overrides })
Guide = dashed segment (x1,y1)→(x2,y2); the checkpoint ("cut line") passes through (crossX, crossY) perpendicular to the guide. Valid swipe:
* one continuous stroke, path length ≥ **0.12**;
* submission < **1000 ms** after pointer-down;
* its **first** checkpoint crossing lies within **0.08** of the crossing point;
* direction within **35°** of the guide axis, **either way**.
* **Direction choice:** overall stroke vector from the down point to the submission point (interpolated crossing point, or the later sample where length becomes sufficient). Falls back to the local segment if degenerate.
* `eventMs` = linearly interpolated time of the first crossing (not pointer-up). If the crossing happens before 0.12 has been travelled, it submits at the first later sample of the same stroke that reaches 0.12 (still < 1000 ms), keeping `eventMs` = crossing time.
* Invalid strokes never submit; the stroke is dead until lifted; `feedback` ∈ `too_short` (incl. short tap), `off_guide` (crossed too far from the point, or never crossed), `wrong_angle`, `too_slow`.
* `detail`: `{ crossX, crossY, offset, angleDeg, direction: 1|-1, length }`.

### CircleRecognizer({ cx, cy, radius = 0.20, inner = 0.12, outer = 0.28, …overrides })
* Samples with distance from centre < inner or > outer are ignored (`feedback = 'outside_ring'`) and break continuity: the next valid sample re-anchors without adding arc.
* Angle deltas unwrapped into (−π, π]; accepted |Δθ| clamped to 4π·Δt/1000 (4π rad/s).
* Teleport (> 0.2 units between consecutive valid samples) → re-anchor, adds nothing.
* Direction locked by first |net| ≥ 0.35 rad (cw or ccw); afterwards opposite motion subtracts (no farming).
* Completion: net ≥ 4π in the locked direction **and** ≥ 12 valid samples **and** ≥ 1200 ms tracked (last valid t − first valid t of this attempt).
* `eventMs` = interpolated time at which net first reaches 4π. If the sample/time requirements are not yet met at that moment (only samples at/before that moment count), it submits at the first later valid sample where they are met (and net is still ≥ 4π), with `eventMs` = that sample's t.
* Pointer-up before completion discards the attempt (`feedback` `'incomplete'`, or `'too_fast'` if 4π was reached but requirements weren't); a new down starts fresh. `cancel()` discards the arc.
* `progress` = clamp(net·dir / 4π, 0, 1). `netRadians`, `direction` exposed for visuals.
* `detail`: `{ direction: 1|-1, validSamples, trackedMs }` (direction +1 = clockwise on screen, y down).

Defaults are exported as `SWIPE_DEFAULTS` and `CIRCLE_DEFAULTS`.

---

## stepTimer.ts
```ts
COUNT_IN_MS = 1000  (alias countInMs)
toleranceMultiplier({ assistanceTolerance }) → 1.5 | 1     // onboarding alone does NOT widen windows
gradeStep(step, eventMs | null, toleranceMult = 1) → { grade, points, error_ms }
isExpired(step, activeMs)  → activeMs > duration_ms       // an event exactly at the deadline still counts
remainingMs(step, activeMs), trackFraction(step, activeMs) // 0..1 marker position
trackZones(step, multiplier = 1) → { durationMs, targetMs, multiplier,
                                     perfect: {start,end}, good: {start,end}, ok: {start,end} } // clamped to [0, duration]
suggestedCircleStartMs(step, typicalMs = 2000)            // "start mixing now" hint for circle steps
```

---

## scoring.ts
```ts
interface StepResult { stepId; grade: Grade; error_ms: number | null; attemptId: string; assisted: boolean; points: number }
evaluateDish({ appleId, recipeId, results, assisted, availableApples?, availableRecipes? }) → DishEvaluation
interface DishEvaluation {
  appleId; recipeId; fitStars; techniqueBonus: 0|1; executionPenalty: 0|1;
  finishedStars: 0|1|2|3; mean; assisted; grades: {stepId, grade}[];
  label: 'Best'|'Good'|'OK'|'Bad fit';
  explanation;   // "Apple fit: 2. Careful cooking: +1. Result: 3." / "Helper bonus: +1." / "Tricky timing: −1."
                 // plus "(3 stars is the top!)" when the sum is clamped
  childFeedback; // data child_feedback[stars]; fit 0 → "Try this apple in another dish!"
  tip;           // zero-fit tip, size tip, timing tip, best-apple tip, or gameplay tip
  sizeMismatch?: true  // ringo_ame with a non-mini apple (recorded fit kept)
}
acceptedResults(recipeId, results)   // one result per step (last wins), recipe order; throws if missing
replaceStepResult(results, next)     // replace that step's result
summarizePractice(appleId, recipeId, results) → { appleId, recipeId, grades, mean }
```
`finishedStars = clamp(fit + techniqueBonus − executionPenalty, 0, 3)`; same as reference `evaluateOrder` with adaptation/customer deltas 0 (parity-tested for all 50 pairings).

---

## progression.ts
```ts
unlockedApples(completed) / unlockedRecipes(completed, rankUps?)  // canonical order; recipes follow ranks.ts
unlocksEarnedAt(completedCount, rankUps?) → { apples, recipes }  // newly earned exactly at that count (0 → none)
appleUnlockAt(id), recipeUnlockAt(id, rankUps?) → number | null, recipeLockText(id, rankUps), unlockConditionText(appleId)
stallLevel(completed) → 0|1|2|3   (≥5, ≥10, ≥15)
isCollectionComplete(completed)   (≥15)
orderForIndex(orderNumber /*1-based*/, seed = DEFAULT_SEED, rankUps = EARLIEST_RANK_UPS) → Order
interface Order { orderId /* 'o-0007' */; orderNumber; recipeId; customerId: 'A'|'B'|'C'|'D';
                  line; suggestedAppleId?; demo?; intro? }
customOrder(orderNumber, recipeId, seed)   // used for migrated saves whose recipe differs
```
Schedule — apples: start a048 a081 a023 a066 a006; 3 → a094; 6 → a091; 9 → a032; 12 → a058; 15 → a086. Recipes: fresh_juice start; 2 → rabbit_apples; 4 → apple_jam; 6 → ringo_ame; 7 → hirosaki_pie.

Order script: the first order after a recipe unlocks is its intro (with that recipe's waiting `DEMO_ORDERS` apple, if any). Other `DEMO_ORDERS` (Kogyoku, Alps Otome, Bramley, Kurenai no Yume pink jam, Chiyuki) run on the first free order once both apple and recipe are unlocked. Other orders: unlocked recipes only, least-recently-requested first with a seeded tie-break, never the same recipe twice in a row when avoidable. `rankUps` (ranks.ts) decides when each rank's recipes unlock; omitted, every rank is assumed reached at 5/15/30/50. `suggestedAppleId` is only a hint.

---

## persistence.ts
```ts
SAVE_KEY = 'aomori-kitchen-save'; SAVE_VERSION = 2; ACTION_SYSTEM_VERSION = '2.0'
interface SaveData {
  version: 2; actionSystemVersion: '2.0'; seed: number;
  completedOrders: number; completedOrderIds: string[];
  unlockedApples: string[]; unlockedRecipes: string[];
  bestScores: Record<recipeId, 0..3>;
  discoveredPairings: Record<`${appleId}:${recipeId}`, { bestStars, fit }>;
  settings: { sound: boolean; assistance: boolean; altControls: boolean; reducedMotion: 'system'|'on'|'off' };
  seenUnlockRewards: string[];   // 'apple:a094', 'recipe:apple_jam'
  current: null | { orderId; orderNumber; recipeId; appleId: string|null;
                    phase: 'shop'|'choose'|'cook'|'result'|'delivery';
                    variantId; stepIndex /* next step to play */; stepResults: StepResult[];
                    attemptId; cueTime?; pendingResult?: DishEvaluation | null };
  notices?: string[];
}
interface SaveStore { load(): { data, notice, persistent }; save(data): boolean; reset(keepSettings?): SaveData; readonly persistent }
createSaveStore(storage?: StorageLike | null, key = SAVE_KEY): SaveStore   // undefined → globalThis.localStorage
createMemoryStore(); defaultSave(seed?, settings?); parseSave(text); sanitizeSave(raw); migrateV1(raw)
```
Behaviour:
* Unavailable/throwing storage (on probe, read or write) → in-memory store, notice **"Progress cannot be saved on this device"**, `save()` returns `false`.
* Invalid JSON / non-object / unknown version number ≤ 2 → defaults + notice "Saved progress could not be read, so a new game started." (next save overwrites).
* Missing fields → defaults. Unknown apple/recipe ids → dropped. Unlocks = saved ∪ schedule(completedOrders).
* `version > 2` → compatible progress read for the session, store switches to memory and **never overwrites**; notice NOTICE_FUTURE.
* v1 `{version:1, completedOrders, unlockedApples, bestScores, settings?, current?:{orderId, recipeId, appleId, minigameStep}}` → v2 preserving completed orders/unlocks/best scores/settings/current apple+recipe; current dish restarts at **stepIndex 0, no results**, notice **"Cooking controls updated—let’s start this dish again."**; `minigameStep` is never used. A v2 save whose `variantId` differs from the current plan is reset the same way.
* No gesture coordinates or renderer state are stored.

---

## gameReducer.ts

### State
```ts
type Phase = 'shop'|'choose'|'cook'|'serve'|'result'|'delivery';
type CookSub = 'bridge'|'instruction'|'countin'|'active'|'feedback'|'miss';
interface GameState {
  progress: { seed; completedOrders; completedOrderIds; unlockedApples; unlockedRecipes;
              bestScores; discoveredPairings; seenUnlockRewards };
  settings: SaveSettings;
  mode: 'order' | 'practice';
  phase: Phase;
  order: Order;                  // active order (or the just-completed one in result/delivery)
  practiceRecipeId: string|null;
  previewAppleId: string|null;   // choose drawer selection
  appleId: string|null;          // confirmed apple
  cook: null | { stepIndex; sub: CookSub; stepResults: StepResult[]; attemptId; attemptSeq;
                 lastResult: StepResult|null /* shown in feedback/miss */; helped: boolean };
  result: DishEvaluation|null;           // order mode
  practiceResult: PracticeSummary|null;  // practice mode (no stars)
  delivery: { apples; recipes; collectionComplete } | null;  // unseen unlock rewards
  hidden: boolean; notice: string|null;
}
```

### Actions
| Action | Valid when | Effect |
|---|---|---|
| `ACCEPT_ORDER` | shop (order mode) | → choose |
| `PREVIEW_APPLE {appleId}` | choose, apple unlocked | sets `previewAppleId` |
| `CONFIRM_APPLE` | choose with preview | → cook, step 0, sub `bridge` |
| `BACK` | choose | → shop (practice: exits practice) |
| `BRIDGE_DONE` | cook/bridge | → instruction (untimed chef prep/animation finished) |
| `READY` | cook/instruction | → countin, **new attemptId** |
| `COUNTIN_DONE` | cook/countin | → active (start the active clock now) |
| `SUBMIT {eventMs \| null, assistedInput?}` | cook/active | grades with tolerance 1.5× if `settings.assistance`; non-Miss → commit (replacing that step's result) → feedback; Miss → `miss` (not committed yet). `null` = deadline expired. `assistedInput` marks alternate controls. |
| `FEEDBACK_DONE` | cook/feedback | next step `bridge`, or phase `serve` after the last step |
| `RETRY_STEP` | cook/miss or feedback | → countin of the same step, new attemptId; new result replaces only that step |
| `CONTINUE_WITH_HELP` | cook/miss | commits Miss (or `OK` if assistance mode is on), `assisted: true`, `helped: true` → feedback |
| `SERVE_DONE` (alias `COMPLETE_ORDER`) | serve | evaluates the dish and **commits the order idempotently** (by orderId / order number); computes `delivery`; → result. Practice: `practiceResult`, no progress. |
| `RESULT_DONE` | result | → delivery if unseen unlocks, else next order's shop (practice: back to shop) |
| `DELIVERY_DONE` | delivery | marks rewards seen → next order's shop |
| `VISIBILITY_HIDDEN` | any | `hidden = true`; cook in active/countin → instruction (fresh count-in later), committed steps kept |
| `RESUME` | any | `hidden = false` |
| `SET_SETTINGS {settings: Partial}` | any | merge settings |
| `RESET_PROGRESS {confirm: true}` | any | fresh progress (settings kept); ignored without `confirm: true` |
| `START_PRACTICE {recipeId}` | shop, recipe unlocked | practice choose |
| `EXIT_PRACTICE` | practice | → shop of the untouched order |
| `DISMISS_NOTICE` | any | clears `notice` |

Invalid actions return the **same state object** (cheap no-op detection). Dish-level assisted grading = order number ≤ 3 or `settings.assistance`; raw step grades are always recorded.

### Save/restore
```ts
const store = createSaveStore();
const { data, notice } = store.load();
let state = initialStateFromSave(data, notice);
// after each dispatch:
const next = gameReducer(state, action);
if (shouldPersist(state, next)) store.save(toSaveData(next));
```
* `toSaveData(state)`: practice is not persisted (saves the underlying order's shop). A step in `feedback` is saved as completed (stepIndex + 1); an unfinished step (instruction/countin/active/miss) is saved as not done.
* `initialStateFromSave(save, notice?)`: cook resumes at the saved stepIndex with sub `instruction` (fresh count-in, no offline time); all steps done → `serve`; result/delivery show the stored `pendingResult` and **do not re-commit**; delivery is recomputed from unseen rewards.
* `initialState(seed?)` — fresh game. `commitCompletedOrder(progress, order, evaluation)` and `pendingDelivery(progress, completed?)` are exported for tests/tools.

### Selectors (`selectors.*`)
`activeRecipe`, `currentOrder`, `currentStep` (cook only), `stepProgress {index,total}`, `toleranceMultiplier`, `isAssistedDish`, `trackZones` (with active multiplier), `bridgeText` (bridges[0] before step 1, else null), `serveBridgeText`, `unlockedApples`, `unlockedRecipes`, `appleCards` (10 cards: `{apple, unlocked, unlockText, fitStars}`), `previewFit`, `stallLevel`, `collectionComplete`, `lastStepResult`, `acceptsInput` (cook/active and not hidden), `isPractice`.

### Typical cook-step UI loop
1. `bridge`: play the automatic prep animation (`bridgeText`) → `BRIDGE_DONE`.
2. `instruction`: show `step.label` / `step.prompt`, highlight `step.target_object` → player taps Ready → `READY`.
3. `countin`: 1 s (`COUNT_IN_MS`) visual count → `COUNTIN_DONE`; record `activeStartPerf`.
4. `active`: draw the track (`selectors.trackZones`), feed the recognizer; `SUBMIT` on result or `SUBMIT {eventMs: null}` when `isExpired`.
5. `feedback`: play `step.animation_event` and the grade word → `FEEDBACK_DONE`. `miss`: offer Retry / Continue with help (play the animation on help).
