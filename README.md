# Aomori Apple Kitchen

A cozy, portrait-first cooking game for kids (≈6–12). You help **Chef Hana** run her little outdoor apple stall in Aomori: customers walk up and order a dish, you pick an apple, and then you cook *at her counter* — she does the washing, peeling and pouring beside you, talks you through each cue, and reacts to every cut, tap and stir.

- 10 playable apples, 5 recipes, the 50 researched fit scores from `prototype_game_data.json`
- Timed actions from `recipe_actions_20.json` (v2): juice 1 · rabbit wedges 2 · jam 3 · mini candy apple 4 · pie 5 actions, using only **tap**, **swipe** and **circle**
- **Arcade pacing (v2.1):** a coloured ring closes on the food and you act as it meets the outline. Cuts are Fruit-Ninja slices (any fast slash through the apple; 3 quick slices per whole-apple cut, 2 for rabbit ears), taps hit the ring, stirring finishes as the ring closes. Tight windows (e.g. slices Perfect ±80 ms, OK ±290 ms), jittered cue times, no Ready button, short chef bridges. Beats are averaged into one grade per authored step, so the pack's scoring rules are unchanged. Tuning lives in `src/core/arcade.ts`
- Flat-shaded low-poly 3D modelled in Blender (stall, chef, 4 customers, tools, food states, 5 dishes)

## Run

```bash
npm install
npm run dev            # http://localhost:5173  (portrait frame is centred on desktop)
npm run build          # production build → dist/
npm run build:single   # one self-contained HTML file → dist-single/index.html (models + icons inlined)
npm run preview
```

## Deploy (Cloudflare Workers)

The game is a static site (`dist/`), served by a Worker with static assets (`wrangler.jsonc`). No server code.

**One-off from your machine**
```bash
npx wrangler login     # once
npm run deploy         # builds and uploads → https://aomori-apple-kitchen.<your-subdomain>.workers.dev
```

**Automatic on every push (recommended)** — put this folder in a GitHub repo, then in the Cloudflare dashboard: *Workers & Pages → Create → Import a repository*, pick the repo and set
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Every push to `main` then rebuilds and redeploys; other branches can get preview URLs. Add a custom domain under the Worker's *Settings → Domains & Routes*. Players' saves live in their own browser (`localStorage`) per domain, so keep the same domain once kids start playing.

## Tests

```bash
npm test               # vitest: 104 tests – content contract, timing/scoring parity, recognizers, progression, saves, reducer
npm run test:ref       # the supplied pure reference checks (src/data/test_timing_reference.mjs)
npx tsc -b             # strict type check
# browser checks need the dev server running (they use a DEV-only clock hook):
npm run dev &  npm run test:e2e     # 31 DOM/pointer/persistence checks in headless Chromium
node e2e/play.mjs --orders 16 --fresh --shots ./shots   # scripted full playthrough with real pointer events
```
Playwright uses a Chromium binary; adjust `executablePath` in `e2e/*.mjs` if yours lives elsewhere.

## Where things live

| Path | What |
|---|---|
| `src/data/` | The supplied pack: `prototype_game_data.json`, `recipe_actions_20.json`, reference `.mjs` files (unchanged) |
| `src/core/` | Pure game logic (no rendering): content adapter + validation, timing/grading, gesture recognizers, scoring, progression/order queue, persistence, reducer state machine. API in `src/core/API.md` |
| `src/game/stations.ts` | Per-recipe counter "stages": which props/food state appear before (chef bridge), during and after every timed action, the gesture target, tool and diegetic cue |
| `src/three/` | R3F scene: camera rig, stall, chef & customer puppets (bone-free procedural animation), counter props, tools, dish display |
| `src/ui/` | HTML/CSS touch UI: order bubble, apple drawer, cooking overlay (guides, timing track, recognizer wiring), result/delivery cards, sheets |
| `assets/blender/` | Blender Python that builds every model (`build_assets.py` + helpers) |
| `assets/aomori.glb`, `assets/previews/`, `assets/ASSETS.md` | Exported GLB, preview renders, node/material manifest |
| `docs/` | The original build-pack documents and art references |

## Replacing / regenerating models

All art is one GLB with named root nodes (see `assets/ASSETS.md`). The game clones nodes by name and remaps materials by name (`M_AppleSkin` and `M_Jam` are re-tinted per apple variety, `Apple_Body` gets a generated skin texture).

```bash
pip install bpy            # Blender as a Python module (5.2 used here)
npm run assets             # rebuild GLB, previews and icons, copy into src/assets
```
To swap in hand-made art, export a GLB with the same node names/pivots (+Y up, fronts face +Z) to `src/assets/models/aomori.glb`. Blender is **not** needed to run or build the game.

## Saves

Progress is saved on this device in `localStorage` (`aomori-kitchen-save`, schema v2, action system 2.0) after each meaningful transition: unlocks, completed orders (idempotent by order id), best scores, discovered pairings, settings and the current order/apple/step with committed step results. Live gesture data and renderer state are never stored. Reloading mid-dish restarts only the unfinished step with a fresh count-in. Legacy v1 saves migrate (progress kept, current dish restarts with “Cooking controls updated—let’s start this dish again.”). Invalid or future-version saves are handled safely; if storage is unavailable the game runs in memory and shows “Progress cannot be saved on this device”. **Reset:** Settings ⚙︎ → Reset progress… → Yes, reset.

## Accessibility & options

Settings: sound, **Helper mode** (1.5× timing windows + clearly labelled helper bonus), **Button controls** (big button or Space/Enter instead of swipe/circle; keeps the cue, records assistance, never cuts a whole apple), **Less motion** (Auto follows `prefers-reduced-motion`). All tap targets ≥ 48 px. Practice kitchen lets kids try any unlocked recipe with no stars and no progress.

## Verified limitations (honest list)

- Verified in headless Chromium (software WebGL) at 360×800, 390×844, 430×932 and 1280×800, including a scripted 16-order run to full collection/free play. **Not yet verified on physical phones**; no frame-rate claims are made. Touch input was exercised with synthetic `PointerEvent`s (pointerType touch), not real fingers.
- Arcade timing (ring lead, beat gaps, windows) replaces the pack's slower default cue timings at the user's request; it is authored tuning that **has not been playtested with children**. The first 3 orders and Helper mode widen windows 1.5×.
- The pack's 20-recipe catalogue is data only; 15 future plans are not playable (by design).
- Google Fonts (Nunito) is optional; a rounded system font is used if it can't load.
- The GLB is ~2.5 MB; the single-file build is ~5 MB (≈1.1 MB gzipped JS + models).
