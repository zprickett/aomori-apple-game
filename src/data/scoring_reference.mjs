// Framework-independent scoring reference. Pass parsed aomori_game_data.json.
// Fit ratings are authored game decisions, not scientific measurements.
export function createAppleScoring(data) {
  if (data.schema_version !== '1.0') throw new Error('Unsupported data schema');
  const pairs = new Map(data.pairings.map(p => [`${p.apple_id}:${p.recipe_id}`, p]));
  const apples = new Map(data.apples.map(a => [a.id, a]));
  const recipes = new Map(data.recipes.map(r => [r.id, r]));
  const boundedInt = (value, min, max, name) => {
    if (!Number.isInteger(value) || value < min || value > max)
      throw new RangeError(`${name} must be an integer in ${min}..${max}`);
    return value;
  };
  function fit(appleId, recipeId) {
    const value = pairs.get(`${appleId}:${recipeId}`);
    if (!value) throw new Error('Unknown apple or recipe ID');
    return structuredClone(value);
  }
  function evaluateOrder({appleId, recipeId, techniqueBonus = 0,
    adaptationDelta = 0, customerDelta = 0, executionPenalty = 0}) {
    if (recipeId === 'festival_pie')
      throw new Error('Festival matrix rows are ingredient-role fits; evaluate a three-apple composition separately');
    const pairing = fit(appleId, recipeId);
    boundedInt(techniqueBonus, 0, 1, 'techniqueBonus');
    boundedInt(adaptationDelta, 0, 1, 'adaptationDelta');
    boundedInt(customerDelta, -1, 1, 'customerDelta');
    boundedInt(executionPenalty, 0, 3, 'executionPenalty');
    if (adaptationDelta && pairing.fit_stars === 0)
      throw new Error('A zero-fit brief requires a new recipe/order evaluation, not an additive adaptation bonus');
    const stars = Math.max(0, Math.min(3, pairing.fit_stars + techniqueBonus +
      adaptationDelta + customerDelta - executionPenalty));
    return {stars, label: data.scoring.rating_scale[String(stars)],
      feedback: data.scoring.child_feedback[String(stars)],
      ingredientFit: pairing.fit_stars, evidenceBasis: pairing.evidence_basis,
      confidence: pairing.confidence, reason: pairing.reason};
  }
  // Flavor preview only. A mean firmness is NOT a simulated cooked texture.
  function blendFlavor(components) {
    if (!Array.isArray(components) || components.length < 1)
      throw new Error('Provide at least one apple component');
    let total = 0;
    const sums = {sweetness: 0, tartness: 0, juiciness: 0, aroma: 0};
    const unknown = new Set();
    for (const {appleId, grams} of components) {
      const apple = apples.get(appleId);
      if (!apple || !Number.isFinite(grams) || grams <= 0)
        throw new Error('Each blend component requires a valid apple and positive edible mass');
      total += grams;
      for (const trait of Object.keys(sums)) {
        sums[trait] += apple.game_stats_1to5[trait] * grams;
        if (apple.factual_traits[trait].status === 'unknown') unknown.add(trait);
      }
    }
    return {gameFlavor: Object.fromEntries(Object.entries(sums).map(([k,v]) => [k, v / total])),
      uncertainTraits: [...unknown], totalEdibleGrams: total,
      note: 'Shape retention and color are component properties; evaluate them separately.'};
  }
  return {fit, evaluateOrder, blendFlavor, apple: id => structuredClone(apples.get(id)),
    recipe: id => structuredClone(recipes.get(id))};
}
