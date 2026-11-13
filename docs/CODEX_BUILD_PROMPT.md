# Aomori Apple Kitchen — Codex build prompt v2 (timed recipe actions)

Copy everything below into Codex after extracting this package into the project. This is a build instruction, not a request for another planning document.

---

Build a complete playable prototype of **Aomori Apple Kitchen**, a cozy Japanese outdoor market cooking game for children aged approximately 6–12. Implement the game, run it, check it, and fix issues. Deliver a working game rather than a dashboard, static mockup, or illustrated landing page.

## Project and source files

Assume a new project unless the workspace already contains an application; inspect the existing project first and preserve its conventions if present. For a new project use TypeScript, React, Vite, and Three.js through React Three Fiber. Use HTML/CSS for accessible touch controls and real rendered 3D for the stall, chef, apples, customers, utensils, and dishes. Keep dependencies modest. Select versions compatible with the installed environment.

The following files accompany this prompt:

- `prototype_game_data.json`: 10 apples, 5 recipes, 50 researched game fit ratings, traits, evidence, and uncertainty.
- `scoring_reference.mjs`: existing apple-fit and final-dish scoring reference.
- `recipe_actions_20.json`: authoritative 1–5-action sequences for all 20 dishes; only five are marked playable.
- `TIMED_ACTION_SYSTEM.md`: mandatory gesture recognition, timing, grading, save migration and food-integrity contract.
- `RECIPE_ACTION_DESCRIPTIONS.md`: source-backed recipe variants, automatic preparation bridges and adaptation notes.
- `timing_reference.mjs` and `test_timing_reference.mjs`: pure grading/validation reference and runnable checks.

Read these files before implementation. Action schema v2 supersedes the prior generic minigames. The 20-recipe catalog does not expand playable scope beyond the five recipes listed below. Fit ratings remain unchanged.
- `art-reference/style-c-stall.jpeg`: authoritative visual direction for the stall and chef.
- `art-reference/juice-multiview.jpeg`: authoritative shape/material direction for the juice dish.

Resolve files relative to the extracted package, never a previous ChatGPT scratch path. If a reference file is absent, use the detailed direction below and report the absent file; do not stall implementation. The images are modeling references, not ready-to-use meshes or guaranteed orthographic blueprints. Do not display either reference sheet as the game scene.

## Visual direction — follow Style C

Simple, charming, flat-shaded low-poly 3D. Large readable forms, visible facets, soft daylight, restrained shadows, and a warm cream background. Original characters with the friendly proportions of a Japanese adventure game. Do not reproduce recognizable Nintendo characters or logos.

Recreate the reference's compact outdoor wooden stall: warm timber posts and counter, red roof/canopy, three red noren panels with cream apple emblems, a warm faceted lantern on the left, one apple crate, one small chalkboard on the right, and minimal greenery behind it. Keep the chef clearly visible behind the counter. She wears a red beret, white double-breasted jacket with red buttons, and a red apron; brown hair, expressive eyes, and a friendly face. Model a convincing simple character with hair, face and clothing, not a generic capsule. Use a short wave, gentle idle motion, and a serving animation.

Suggested palette: apple red #D94232, cream #FFF3D9, warm wood #A96F43, dark wood #68452E, leaf green #6A8C42, juice gold #F4C954. Match the attached references by eye rather than treating these approximate values as strict brand colors.

The juice model is a faceted clear tumbler containing golden juice, a red apple emblem, a red-and-white striped straw, a red-skinned apple wedge on the rim, and a simple wooden coaster. Use modest transparency; ensure the juice remains readable on mobile. Its glass, fill, straw, garnish, and coaster are separate reusable parts.

Make all five food models consistent with this style. Pie: golden pastry slice with apple filling on a simple plate. Rabbit apples: wedges with skin ears. Jam: a small glass jar of apple jam; red-flesh varieties may produce pink/red jam. Mini candy apple: small apple with glossy red coating on a stick. No photorealistic textures, elaborate scenery, crowded counters, or UI text embedded in textures. Use original procedural meshes/materials if finished GLB assets are unavailable. External asset services or Blender must not be required to launch the prototype. Structure models so GLB assets can replace them later.

## Screen and interaction

Portrait-first, touch-first. Design around 390 × 844 CSS pixels, support 360–430 px widths and taller phones, and center a portrait game frame on desktop. Respect safe-area insets and browser chrome; use dynamic viewport units. No horizontal scrolling or hover-only actions.

Main shop view: a small top status strip, spacious stall scene, one customer approaching from the foreground, one clear order bubble, and one prominent action at the bottom. Keep the chef visible. At most one waiting customer, with no impatience countdown.

Use separate focused states instead of showing every control at once:

1. Shop/order: customer arrives, requests a named dish, player accepts.
2. Apple selection: a bottom drawer with readable apple cards; locked varieties show a clear unlock condition. Selecting a card reveals name, Japanese name, a one-line trait hint and recipe fit stars, then a confirmation button.
3. Cooking: switch to a fixed close view of the work surface. Show one instruction and one action at a time, with progress through the recipe's 1–5 timed actions.
4. Serve/result: present the completed 3D dish, customer reaction, 0–3 result stars, fit versus cooking explanation, and one short helpful tip.
5. Delivery/unlock: a new apple crate and a concise discovery card, then return to the shop.

Secondary collection/menu/settings screens are available through small labeled buttons. Never turn the main scene into a collection dashboard. Tap targets at least 48 CSS px, readable text, strong contrast, and keyboard/mouse equivalents. Respect reduced-motion preferences. Default language English with Japanese apple names as secondary labels.

## Content scope and progression

Implement exactly these 10 playable apples, using the supplied IDs. Other varieties may appear only as future collection slots, not as playable content:

| Stage | Apples | IDs |
|---|---|---|
| Start | Fuji, Tsugaru, Orin, Jonagold, Toki | a048, a081, a023, a066, a006 |
| After order 3 | Kogyoku (Jonathan) | a094 |
| After order 6 | Alps Otome | a091 |
| After order 9 | Bramley | a032 |
| After order 12 | Kurenai no Yume | a058 |
| After order 15 | Chiyuki | a086 |

Unlocks happen after completed orders regardless of score, are permanent, and never depend on real dates. This prototype schedule supersedes the larger dataset's delivery-tier and unlock-order fields. Do not present delivery order as a scientific rarity ranking.

Five playable recipes:

| Recipe ID | Player-facing name | Unlock | Touch actions |
|---|---|---|---|
| fresh_juice | Fresh Apple Juice | Start | 1: tap to press; chef prepares fruit and pours automatically |
| rabbit_apples | Rabbit Apple Wedges | After order 2 | 2: swipe wedges; swipe ear cuts |
| apple_jam | Apple Jam | After order 4 | 3: swipe pieces; tap ingredients into pot; circle to mix at finishing stage |
| hirosaki_pie | Hirosaki Apple Pie | After order 7 | 5: swipe slices; tap into pan; circle filling; tap into pastry; tap bake cue |
| ringo_ame | Mini Candy Apple | After order 6 | 4: tap skewer; tap syrup readiness; tap dip; tap cooling tray. No swipe/circle |

Use exactly three gesture primitives: **swipe** for cutting, **tap** for placement/machine/finish cues, **circle** for actual mixing. Not every dish must contain all three. Do not require holds, free dragging, pinching or an extra gesture type. Each counted action is one scored gesture with its own timer and visible target time. Automatic animations perform named supporting preparation, cooling and cooking; they are not hidden extra player actions. Detailed step ordering, object bindings and animation events live in `recipe_actions_20.json`.

Read and implement `TIMED_ACTION_SYSTEM.md` in full. Timers begin after a count-in, pause for instructions and stop when hidden. Swipe scoring uses cut-line crossing time; circle scoring uses completion of required net turns. Never randomize step order or substitute gestures for variety. Whole candy apples, whole baked apples and whole-apple pies must never have swipe actions, even in future content. Core whole apples with tap plus corer animation. Do not stir boiling candy syrup; whole-apple dip rotation is automatic.

Actions outside their timing window give a gentle Miss result and a choice to retry that step or continue with help. No apples are lost. First three orders use assisted grading; normal play remains timed thereafter. Optional assistance and unscored practice modes are described in the contract. Pointer Events support touch/mouse; accessible tap/keyboard alternatives preserve semantic animations and record assistance. Do not claim these authored timing windows have been playtested.

Use a deterministic onboarding order sequence that introduces juice, rabbit wedges, jam, mini candy apples, and pie as they unlock. The next order after each apple delivery should demonstrate a useful match: Kogyoku → jam, Alps Otome → mini candy apple, Bramley → jam, Kurenai no Yume → pink jam, Chiyuki → rabbit wedges. If that recipe is not yet unlocked, use an available recipe and schedule the demonstration when it is. Then rotate unlocked recipes without requiring an unavailable apple. New choices should change visible food or feedback, not only a counter.

At order 15, celebrate the completed prototype collection and continue in free play. Give the stall a small visual improvement at orders 5, 10, and 15, such as a tidy sign, a crate upgrade, or a small red banner. Preserve the sparse composition. No shop-management economy is needed.

All unlocked apples have unlimited supply in this build. No ingredient loss, energy system, daily limits, advertising, payment, accounts, or multiplayer. Do not invent research claims to explain progression.

## Apple traits and scoring

Load all 50 apple/recipe fit scores directly from `prototype_game_data.json`. Do not generate a random matrix or replace researched values with visual guesses. Keep IDs stable. Build a typed adapter and validate unique IDs, exactly 10 apples, 5 recipes, 50 unique pairings and scores 0–3 at development startup/test time.

Display three star outlines consistently:

- 3: Best
- 2: Good
- 1: OK
- 0: Bad fit for this recipe

For child-facing zero feedback say “Try this apple in another dish!” A zero never means a rotten apple, an unsafe food claim, or a bad variety.

Distinguish **apple fit** from **finished dish stars**. For this prototype use:

`finishedStars = clamp(fitStars + techniqueBonus - executionPenalty, 0, 3)`

Use `gradeTiming` and `summarizeTechnique` from `timing_reference.mjs`. Perfect/Good/OK/Miss action points are 1/0.75/0.35/0. Average across the recipe's 1–5 accepted steps. Mean ≥0.75 with no Miss yields +1 technique bonus and no penalty; otherwise mean ≥0.40 yields no bonus or penalty; lower mean yields penalty 1 and no bonus. These mutually exclusive outcomes replace the prior vague cooking thresholds and prevent double penalties. First three orders or explicit assistance grant +1/0, retaining raw action grades. Adaptation/customer deltas remain 0. A replayed step replaces its previous accepted result, never accumulates extra points. Action grades are words; final dish stars remain 0–3.

Show the fit rating before cooking and explain any difference on the result screen: e.g. “Apple fit: 2. Careful cooking: +1. Result: 3.” Good cooking makes starter Fuji pie capable of earning three stars. Preserve matrix values even when the final dish earns a different score. No subjective hidden customer penalties.

Mini candy apple is the whole mini-apple brief: Alps Otome's small size is meaningful. Large apples may still be selected, but retain their lower recorded fit and show the size mismatch. Do not silently turn them into diced skewers with a different score. Bramley has a recorded zero for rabbit wedges; retain it and offer a helpful cooked-dish suggestion.

Use supplied trait hints and game statistics for learning. The 1–5 stats are game translations, not lab measurements. Raw firmness must not automatically determine heat retention. Unknown cooking behavior remains unknown. Red skin does not imply red flesh. Kurenai no Yume has a meaningful pink/red-flesh visual; use the data. Chiyuki's lower-browning trait can inform a short tip, but do not invent exact timings or reaction rates. Avoid unsupported “best in Japan” or factual rarity claims. Evidence metadata belongs in optional developer/reference views, not in the children's main flow.

## Save and state architecture

Save on this device through a versioned local persistence service behind an interface suitable for future account sync. No backend or sign-in now. Save unlocked IDs, completed-order count, recipe best scores, discovered pairings, settings, and current order/recipe/apple/cooking step, action-system/variant version and committed step results. Preserve the unfinished action's cue but restart its timer with a new count-in on reload; never advance through offline time. Commit after each meaningful transition. Reloading resumes coherently; do not save live gesture coordinates or renderer objects.

Handle invalid JSON, missing fields, unknown IDs, unavailable storage, and future save versions safely. Use a separate in-memory fallback with a visible short “Progress cannot be saved on this device” notice if storage fails. A schema migration should preserve compatible progress. Reset progress requires explicit confirmation in settings. Prevent double-order counting and repeated unlock rewards when reloading a result screen. Account features later must not require rewriting game logic.

Separate content, progression, scoring, persistence, input/minigames, scene assets, and UI. Use an explicit state machine or reducer for order → choose → cook → serve → result → delivery → next order. Keep rendering side effects outside scoring logic. Timers use monotonic active elapsed time. When the page is hidden pause all cooking; returning restarts only the unfinished action with a fresh count-in and preserves completed actions. Follow the legacy-save migration rules in `TIMED_ACTION_SYSTEM.md`. A seeded/deterministic order queue makes saves and tests reliable.

## Performance and polish

Target smooth mobile play with a modest scene budget; cap renderer pixel ratio around 1.5, limit lights/shadows, reuse geometries/materials and dispose resources. Avoid expensive postprocessing and unnecessary high-resolution textures. Aim for 30 fps or better on a midrange phone, but report only performance actually measured. No continuous React state updates every animation frame. Lazy-load secondary content where useful.

Provide loading and WebGL-unavailable states. Make sound optional, with short original/procedural effects if available; sound begins only after user interaction and respects mute. The game must work without audio. Animate customer arrival, chef wave, cooking response, serving, and a short unlock celebration. Keep transitions quick and prevent animations from blocking taps unnecessarily.

## Implementation workflow and acceptance

First inspect available files and project, then write a short implementation plan and build. Resolve routine decisions independently. Prioritize a complete order loop before expanding to all 10 apples and all 5 minigames, then finish progression, art, persistence and checks. Do not stop after the first working recipe. Do not ask for approval for every reversible implementation choice.

Run `node test_timing_reference.mjs` and appropriate checks for the actual stack. Add actual recognizer/UI tests for early/late events, deadline expiry, swipe crossing, circle angle wraparound and backtracking, rapid taps, pointer cancellation, visibility pause and reload. Passing pure grading tests does not verify gesture recognition. Add meaningful automated tests for the 50-pairing contract, score clamping, unlock thresholds, persistence migration/fallback, and duplicate completion prevention. Test touch actions and full game flow in a browser when browser tooling is available; otherwise give an honest manual verification checklist. Do not claim physical-device performance if only a desktop emulator was used.

Acceptance criteria:

1. A new player sees the recognizable Style C outdoor stall, chef, customer and one clear order action.
2. All 10 apples and 5 recipes are implemented, with exactly the supplied 50 fit scores.
3. The five recipes use exactly 1, 2, 3, 4 and 5 timed actions as authored. All three gesture primitives have working touch/mouse recognition, appropriate food animation and a result. Whole-apple variants reject swipes; boiling candy syrup has no stirring action.
4. All unlocks occur once at the defined thresholds; 15 completed orders expose the full prototype and free play.
5. Fuji pie can earn 3 with careful cooking; Bramley rabbit fit stays 0; Alps Otome candy fit stays 3.
6. Refresh preserves progress and the current coherent game state without duplicating rewards.
7. Layout works at 360 × 800, 390 × 844, 430 × 932 and desktop without clipped essential controls or horizontal scroll. Reduced-motion and alternate tap controls work.
8. Production build and meaningful automated checks pass; no unhandled browser errors during the verified loop.
9. Include a concise README with launch/build/test commands, data locations, save/reset behavior, model replacement instructions, and any verified limitations.

Return the implemented project, how to run it, a brief explanation of what was built and what was checked, and actual remaining limitations. No deployment is requested. Preserve the option to expand later to the researched 100 apples and 20 dishes through the same data model.
