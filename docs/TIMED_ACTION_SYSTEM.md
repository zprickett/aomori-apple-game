# Timed cooking actions — implementation contract v2

This document and `recipe_actions_20.json` replace the previous generic 2–3-step cooking design. Keep 10 apples and 5 playable recipes. The remaining 15 action plans are future content only. Existing 50 fit scores remain unchanged.

## Design analysis

Three familiar inputs support many cooking animations without teaching a new control for every dish. Complexity comes from meaningful stages: 1 action for prepared-fruit juice service, 2 for rabbit wedges, 3 for jam, 4 for whole mini candy apples, and 5 for pie. Not every recipe uses all three inputs. Repeated tap stages are valid when the recipe requires them. Do not add cutting or mixing merely to vary gestures.

One action means one scored gesture and one target cue. Automatic animations can perform unscored supporting work; they are named in every recipe plan. The short juice service intentionally lets the chef core/cut/load the selected apple before the player's timed press tap. It does not pretend to show juice made without preparation. Harder recipes are longer, not automatically faster. Bake, chill, steam and simmer times are visibly compressed; game timers are never real cooking instructions.

Shuffle eligible customer orders and vary the target time within a published range. Never shuffle preparation steps, randomize gesture types, cut an intact apple, or mix at a chemically inappropriate stage. The prototype uses fixed per-step target times from JSON initially so tests and onboarding are reproducible. Optional later cue jitter: choose target ±250 ms once at step readiness, persist it, and display it from the start. Do not move a target after the timer begins.

## Input recognition

Pointer Events, one active pointer, pointer capture, normalized work-surface coordinates. UI controls and scene hit targets must agree. Ignore extra fingers; ignore taps outside the highlighted object. A timer begins only after instructions and the target object are ready, following a 1-second visual count-in. Instruction reading and automatic bridges are untimed.

- **Tap:** pointer-down within a highlighted object, at least 48 CSS px across. Tap places/adds, starts/stops a machine, flips, closes or removes food through a matching animation. It is never a drag/hold action. Score pointer-down time.
- **Swipe:** a guided cutting gesture only. Require a continuous stroke at least 0.12 work-surface units long, under 1,000 ms, crossing the displayed cut line within 0.08 units of the highlighted crossing point, with direction within 35 degrees of the guide. Score interpolated time at first valid guide crossing, not pointer-up. A valid but mistimed cut is still visibly a cut. A short tap does not count. Ear cuts may use one representative stroke with the chef animating the paired incisions.
- **Circle:** actual mixing, whisking or folding only. Display a ring around the bowl/pan; accept clockwise or anticlockwise chosen on the first valid arc. Default radius 0.20 work-surface units; accepted annulus 0.12–0.28. Unwrap angles across ±π, require two net full turns in one direction, at least 12 valid samples and at least 1,200 ms of tracked motion. Clamp accepted angular speed to 4π rad/s; reject teleports and ignore points near the centre/outside the annulus. Backtracking subtracts net arc and cannot farm progress. Score interpolated time when 4π net radians are reached. Complete the turns close to the cue; spinning faster is not intrinsically better. Pointer-up before completion allows a new attempt within the same deadline; discard unfinished arc on pointer cancellation. Do not circle to rotate a whole candy apple: that is an automatic dip animation.

Wrong gestures/object hits do not mutate food or reset the timer. One valid recognized gesture submits the step once. Extra inputs are ignored while feedback plays. Timing is independent of frame rate and uses monotonic active elapsed time; input timestamps are mapped to that same timebase.

## Timer and grades

JSON stores milliseconds, including the full deadline, cue time, and inclusive absolute-error windows. Tap/swipe default: 6,000 ms deadline, 3,500 ms cue, Perfect ±350 ms, Good ±800 ms, OK ±1,300 ms. Circle default: 8,000 ms deadline, 6,000 ms completion cue, Perfect ±450 ms, Good ±1,000 ms, OK ±1,600 ms. These need child playtesting and tuning; they are not research-derived values.

Keep a slim countdown track with a moving marker, a fixed green Good zone and smaller gold Perfect zone; shape/text labels supplement colour. Early/late distances are symmetric. On circle stages, show the same timing track plus mixing progress; avoid two competing clocks. Show “finish mixing on the cue,” with a suggested start prompt. A recognized action outside OK but before the deadline grades Miss; no valid action by deadline also grades Miss. Invalid gestures do not consume the submission, but time still runs. Do not reset on random tapping.

Grade points: Perfect 1, Good 0.75, OK 0.35, Miss 0. Store each accepted result with step ID, timing error or null, grade, attempt ID and assisted flag. Normalize recipe technique by the mean across its 1–5 steps; never sum points in a way that favours longer recipes. Show action grades using words, not extra stars.

Use `summarizeTechnique` from `timing_reference.mjs`:

- Mean ≥0.75 and no Miss: technique bonus +1, penalty 0.
- Mean ≥0.40 otherwise: bonus 0, penalty 0.
- Mean <0.40: bonus 0, penalty 1.

These outcomes are mutually exclusive. Feed them into the existing `evaluateOrder` with adaptation/customer deltas both 0. `finishedStars = clamp(fitStars + techniqueBonus - executionPenalty, 0, 3)`. Do not deduct another penalty per bad step. Preserve fit as its own rating. First three orders use assisted grading (+1/0) with raw grades still recorded. Normal mode is timed after onboarding; an optional assistance mode broadens windows by 1.5× and grants the same clearly labeled assistance bonus. Practice mode disables grading and cannot award scored stars or advance orders.

On Miss, offer **Retry this step** or **Continue with help**. Retry restarts that step with a count-in; it replaces only that step's accepted result. Continue performs the step automatically, records Miss (or assisted grade if assistance is explicitly switched on), then advances. No lost apples or progression block. Until one is selected, the game stays at the feedback state; it does not silently skip the step or restart the entire recipe.

## Food integrity and evidence

`preserve_whole_apple` is true for candy apple, baked apple and whole apple pie. Reject every swipe anywhere in those variants. Coring uses tap plus corer animation; the outer fruit remains intact. Candy syrup is combined before heating automatically, then boils without stirring. Whole-apple coating rotation is automatic. No manual circles in the candy variant.

Validate actual ingredient form and process rather than recipe titles: the sourced “whole apple keema” uses skin-on diced apples, so a cutting swipe is appropriate. The chosen compote is a microwave wedge recipe; use slicing, arranging and a heating tap, not invented pot stirring. The chosen tart is a chilled compote/mousse/biscuit-base adaptation, not a baked flower tart. Apple daifuku contains cooked diced fruit. All source summaries and adaptation notes are in `RECIPE_ACTION_DESCRIPTIONS.md`; original festival pie remains explicitly original.

Apple selection changes fruit appearance and final dish traits, but never randomizes the method or cue tolerances by variety. Unknown cultivar heat behavior stays unknown. Keep existing fit scores and make future method changes a new variant with a reviewed fit brief.

## Save/resume and access

Save action-system version, variant ID, current step ID, generated cue time (if jitter enabled), accepted step results, attempt ID and order ID at committed transitions. Never save renderer state or an unfinished pointer path. On refresh or returning from a hidden page, preserve committed steps and restart the unfinished step with a fresh count-in; no offline timing penalty. Pause auto cooking, audio and scene time while hidden. A cancelled pointer alone discards the unfinished gesture but does not reset the clock.

Migration from the old generic minigame save: preserve completed orders, unlocks, best scores and current apple/recipe; reset only the current unfinished recipe to its first v2 action and explain “Cooking controls updated—let’s start this dish again.” Do not reinterpret a legacy step index against a different sequence. Commit results/unlocks idempotently by order ID.

Alternate input mode retains the requested action semantics: a labeled keyboard/tap control animates a cut or contributes a mixing segment without requiring the physical gesture. Retain the cue, record assistance, and never let the alternative bypass whole-apple rules. Reduced motion changes animation, not scoring. No audio-only cues.

## Codex implementation and verification

Build reusable TapAction, SwipeCutAction and CircleMixAction recognizers/renderers. Drive scenes from step JSON (`target_object`, `animation_event`, `geometry_profile`, `timing_event`); do not implement five unrelated hard-coded minigames. Give each semantic animation a matching before/after food state. A timeout must not magically create a cut ingredient until Continue with help or Retry resolves it.

`timing_reference.mjs` is a pure grading/validation reference, not a complete gesture recognizer or clock. Implement recognizers and lifecycle handling in the application using the contract above. Resolve and validate every referenced animation and target for the five active recipes; future plans may remain data-only. The full matrix/research pack is not required to run the prototype.

Run `node test_timing_reference.mjs`. Additionally test actual UI integration: swipe crossing timing, circle wraparound/backtracking/invalid radius and speed, tap spam, duplicate submissions, timer deadline, cancel, resize, page visibility, save migration and reload. Verify whole-apple assets remain intact in all actions; verify syrup is not stirred after boiling. Report what was actually tested. Do not claim touch recognition or child playtesting merely because the pure reference tests pass.
