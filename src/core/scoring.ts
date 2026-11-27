/**
 * Finished-dish evaluation.
 *   finishedStars = clamp(fitStars + techniqueBonus − executionPenalty, 0, 3)
 * (reference evaluateOrder with adaptationDelta = customerDelta = 0).
 */
import { RECIPE_ORDER,
  CHILD_FEEDBACK,
  RATING_LABELS,
  ZERO_FIT_FEEDBACK,
  apple,
  bestApplesFor,
  fitStars as fitStarsOf,
  gameplayTipFor,
  joinOr,
  recipe,
  zeroFitTip,
  type FitStars,
} from './content.ts';
import { summarizeTechnique, type Grade } from './timing.ts';
import { PIE_APPLES, PIE_RECIPE, pieFit } from './requests.ts';
import { scoreDish, type DishScore } from './points.ts';

export interface StepResult {
  stepId: string;
  grade: Grade;
  /** eventMs − target (signed) or null when no valid event. */
  error_ms: number | null;
  attemptId: string;
  /** True if this step used assistance (assistance-mode windows, alternate control, or Continue with help). */
  assisted: boolean;
  points: number;
}

export type DishLabel = 'Best' | 'Good' | 'OK' | 'Bad fit';

export interface DishEvaluation {
  appleId: string;
  recipeId: string;
  fitStars: FitStars;
  techniqueBonus: 0 | 1;
  executionPenalty: 0 | 1;
  finishedStars: 0 | 1 | 2 | 3;
  mean: number;
  assisted: boolean;
  /** Accepted grades in recipe step order. */
  grades: { stepId: string; grade: Grade }[];
  label: DishLabel;
  /** e.g. "Apple fit: 2. Careful cooking: +1. Result: 3." */
  explanation: string;
  childFeedback: string;
  tip: string;
  /** ringo_ame with a non-mini apple (fit kept as recorded). */
  sizeMismatch?: boolean;
  /** Points shown to the player. */
  score: DishScore;
  /** Festival Pie: the three apples it was baked with. */
  pieApples?: string[];
}

export interface EvaluateDishInput {
  appleId: string;
  recipeId: string;
  results: readonly StepResult[];
  /** Dish-level assisted grading (onboarding orders 1–3 or assistance mode). */
  assisted: boolean;
  /** Optional: restrict tip suggestions to these apple / recipe ids (e.g. unlocked). */
  availableApples?: readonly string[];
  availableRecipes?: readonly string[];
  /** Festival Pie: its three apples (appleId is the first); the fit comes from all three. */
  pieApples?: readonly string[];
}

/**
 * Collapse results to exactly one accepted result per recipe step (a replayed step replaces its
 * earlier result — last one wins), in recipe order. Throws if a step has no result or a result
 * references a step not in the recipe.
 */
export function acceptedResults(recipeId: string, results: readonly StepResult[]): StepResult[] {
  const r = recipe(recipeId);
  const byStep = new Map<string, StepResult>();
  for (const res of results) {
    if (!r.steps.some((s) => s.id === res.stepId)) throw new Error(`Step ${res.stepId} is not in ${recipeId}`);
    byStep.set(res.stepId, res);
  }
  return r.steps.map((s) => {
    const res = byStep.get(s.id);
    if (!res) throw new Error(`Missing result for step ${s.id}`);
    return res;
  });
}

/** Replace (or append) the result for one step, preserving the others. */
export function replaceStepResult(results: readonly StepResult[], next: StepResult): StepResult[] {
  return [...results.filter((r) => r.stepId !== next.stepId), next];
}

const clamp03 = (n: number) => Math.max(0, Math.min(3, n)) as 0 | 1 | 2 | 3;

export function evaluateDish(input: EvaluateDishInput): DishEvaluation {
  const { appleId, recipeId, assisted } = input;
  const a = apple(appleId);
  const rec = recipe(recipeId);
  const pie = recipeId === PIE_RECIPE && input.pieApples?.length === PIE_APPLES ? input.pieApples : null;
  const fit = pie ? pieFit(pie) : fitStarsOf(appleId, recipeId);
  const accepted = acceptedResults(recipeId, input.results);
  const tech = summarizeTechnique(accepted, { assisted });
  const techniqueBonus = tech.techniqueBonus;
  const executionPenalty = tech.executionPenalty;
  const finishedStars = clamp03(fit + techniqueBonus - executionPenalty);
  const label = RATING_LABELS[finishedStars] as DishLabel;

  const parts = [`Apple fit: ${fit}.`];
  if (techniqueBonus) parts.push(assisted ? 'Helper bonus: +1.' : 'Careful cooking: +1.');
  if (executionPenalty) parts.push('Tricky timing: −1.');
  parts.push(`Result: ${finishedStars}.`);
  if (fit + techniqueBonus - executionPenalty > 3) parts.push('(3 stars is the top!)');
  const explanation = parts.join(' ');

  const sizeMismatch = recipeId === 'ringo_ame' && a.sizeClass !== 'mini';

  let childFeedback: string;
  if (fit === 0) childFeedback = ZERO_FIT_FEEDBACK;
  else if (finishedStars === 0) childFeedback = 'Nice try! Watch the cue and try again.';
  else childFeedback = CHILD_FEEDBACK[finishedStars];

  let tip: string;
  if (fit === 0) {
    tip = zeroFitTip(appleId, recipeId, input.availableRecipes);
  } else if (sizeMismatch) {
    tip = `A Mini Candy Apple uses a whole tiny apple. ${a.nameEn} is bigger, so its fit stays at ${fit}. Try a mini apple like Alps Otome!`;
  } else if (executionPenalty) {
    tip = 'Tip: watch the marker and act when it reaches the gold zone.';
  } else if (fit < 3) {
    const best = bestApplesFor(recipeId, input.availableApples)
      .filter((x) => fitStarsOf(x.id, recipeId) === 3)
      .slice(0, 2);
    tip = best.length
      ? `Tip: ${joinOr(best.map((x) => x.nameEn))} ${best.length > 1 ? 'are' : 'is'} Best for ${rec.name}.`
      : gameplayTipFor(appleId, input.availableRecipes);
  } else if (recipeId === 'apple_jam' && a.fleshRed) {
    tip = `${a.nameEn}'s pink flesh made pink jam!`;
  } else {
    // Already a Best match: point to another dish instead of repeating this one.
    const others = (input.availableRecipes ?? RECIPE_ORDER).filter((r) => r !== recipeId);
    tip = others.length ? `Next, ${gameplayTipFor(appleId, others).replace(/^Try/, 'try')}` : gameplayTipFor(appleId, input.availableRecipes);
  }

  const result: DishEvaluation = {
    appleId,
    recipeId,
    fitStars: fit,
    techniqueBonus,
    executionPenalty,
    finishedStars,
    mean: tech.mean,
    assisted,
    grades: accepted.map((r) => ({ stepId: r.stepId, grade: r.grade })),
    label,
    explanation,
    childFeedback,
    tip,
    score: scoreDish(appleId, recipeId, accepted.map((r) => r.grade), pie ? fit : undefined),
  };
  if (pie) result.pieApples = [...pie];
  if (sizeMismatch) result.sizeMismatch = true;
  return result;
}

/** Practice summary (unscored: no stars, no progress). */
export interface PracticeSummary {
  appleId: string;
  recipeId: string;
  grades: { stepId: string; grade: Grade }[];
  mean: number;
}

export function summarizePractice(appleId: string, recipeId: string, results: readonly StepResult[]): PracticeSummary {
  const accepted = acceptedResults(recipeId, results);
  const tech = summarizeTechnique(accepted);
  return { appleId, recipeId, grades: accepted.map((r) => ({ stepId: r.stepId, grade: r.grade })), mean: tech.mean };
}
