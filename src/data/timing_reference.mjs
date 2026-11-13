// Pure grading and content validation. Gesture recognition is specified separately.
export function gradeTiming(timing, eventMs, geometryValid = true, toleranceMultiplier = 1) {
  const {duration_ms: deadline, target_ms: target, perfect_ms: p, good_ms: g, ok_ms: o} = timing;
  if (![deadline,target,p,g,o].every(Number.isFinite) || !(0 < p && p <= g && g <= o && target >= o && target + o <= deadline)) throw Error('Invalid timing configuration');
  if (!Number.isFinite(toleranceMultiplier) || toleranceMultiplier < 1) throw Error('Invalid tolerance');
  if (eventMs === null || !Number.isFinite(eventMs) || eventMs < 0 || eventMs > deadline || !geometryValid) return {grade:'Miss', points:0, error_ms:null};
  const error = eventMs-target, abs = Math.abs(error);
  const grade = abs <= p*toleranceMultiplier ? 'Perfect' : abs <= g*toleranceMultiplier ? 'Good' : abs <= o*toleranceMultiplier ? 'OK' : 'Miss';
  return {grade, points:{Perfect:1,Good:0.75,OK:0.35,Miss:0}[grade], error_ms:error};
}
export function summarizeTechnique(results, {assisted=false}={}) {
  if (!Array.isArray(results) || results.length<1 || results.length>5) throw Error('Expected 1–5 accepted steps');
  const values={Perfect:1,Good:0.75,OK:0.35,Miss:0};
  if (results.some(r=>!Object.hasOwn(values,r.grade))) throw Error('Invalid grade');
  const mean=results.reduce((sum,r)=>sum+values[r.grade],0)/results.length;
  if(assisted) return {mean,techniqueBonus:1,executionPenalty:0,assisted:true};
  return {mean,techniqueBonus:mean>=0.75 && results.every(r=>r.grade!=='Miss')?1:0,executionPenalty:mean<0.40?1:0,assisted:false};
}
export function validateActionCatalog(catalog, prototype) {
  if(catalog.schema_version!=='2.0' || catalog.recipes.length!==20) throw Error('Expected v2/20 recipes');
  const ids=new Set(), steps=new Set();
  for(const r of catalog.recipes){
    if(ids.has(r.recipe_id)) throw Error('Duplicate recipe'); ids.add(r.recipe_id);
    if(r.steps.length<1 || r.steps.length>5 || r.action_count!==r.steps.length) throw Error('Invalid count');
    if(!r.source_urls.length || !r.research_note || !r.automatic_preparation_and_bridges.length) throw Error('Missing evidence/bridges');
    for(const s of r.steps){
      if(steps.has(s.id)) throw Error('Duplicate step'); steps.add(s.id);
      if(!['swipe','tap','circle'].includes(s.gesture)) throw Error('Unknown gesture');
      if(r.preserve_whole_apple && s.gesture==='swipe') throw Error('Whole apple cannot use swipe');
      if(r.recipe_id==='ringo_ame' && s.gesture==='circle') throw Error('No syrup stirring in whole candy variant');
      if(!s.target_object || !s.animation_event || !s.timing_event) throw Error('Missing interaction binding');
      gradeTiming(s.timing,s.timing.target_ms);
    }
  }
  const active=catalog.recipes.filter(r=>r.prototype_playable);
  if(active.length!==5 || prototype.recipes.length!==5) throw Error('Expected 5 active recipes');
  if(active.some(r=>!prototype.recipes.some(p=>p.id===r.recipe_id && p.action_plan_id===r.variant_id && p.action_count===r.action_count))) throw Error('Prototype action mapping mismatch');
  const pairKeys=new Set(prototype.pairings.map(p=>`${p.apple_id}:${p.recipe_id}`));
  if(prototype.apples.length!==10 || prototype.pairings.length!==50 || pairKeys.size!==50) throw Error('Expected 10 apples/50 unique pairings');
  for(const a of prototype.apples)for(const r of prototype.recipes){
    const p=prototype.pairings.find(p=>p.apple_id===a.id && p.recipe_id===r.id);
    if(!p || !Number.isInteger(p.fit_stars) || p.fit_stars<0 || p.fit_stars>3) throw Error('Invalid pairing');
  }
  return {recipePlans:20,activeRecipes:5,appleRecipePairings:50,timedSteps:steps.size};
}
