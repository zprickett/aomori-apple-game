# Aomori Apple Kitchen

A portrait, mobile-first 3D cooking game for kids (about 6 to 12), built to show off Aomori's apples. The player picks an apple, cooks a recipe with timed tap, swipe and circle actions, and earns points. Stack: React 19, @react-three/fiber and three.js, Vite, Vitest, TypeScript, oxlint. It deploys to Cloudflare Workers as a static site.

- Repo: github.com/zprickett/aomori-apple-game. The Worker is named `aomori-apple-game` (`wrangler.jsonc`).
- README.md covers run, deploy and tests. It was written for the original 10-apple, 5-recipe prototype, so its counts are out of date.

## Commands

Always run from `~/Build/aomori`. `~/Build` has its own unrelated Next.js `npm run dev`.

```bash
npm run dev                # http://localhost:5173
npm test                   # vitest (121 tests)
npx tsc -b                 # strict type check
npm run lint               # oxlint
npm run build
```

## Dev-only URLs

These only work in dev, because they are gated by `import.meta.env.DEV`.

- `/?review`: browse all 100 apples (3D at true size, S/M/L, stats, fit per recipe).
- `/?review=recipes&recipe=<id>`: step through every frame of a recipe in the real scene. **▶ Play** opens the next URL.
- `/?play=<recipeId>&apple=<appleId>`: an in-memory practice session with everything unlocked. It does not touch saves.
- `/?skip=N`: start a fresh save with N orders already done, to test unlocks and reveals.

## Layout

| Path | What |
|---|---|
| `src/core/` | Pure game logic, no rendering, all unit tested. `content.ts`: apples, recipes, `RECIPE_ORDER` (playable recipes). `progression.ts`: unlock schedule. `points.ts`: scoring, golden, chef levels. `profiles.ts`: chef profiles and looks. `gameReducer.ts`, `persistence.ts`. |
| `src/game/` | `stations.ts`: per-recipe counter stages (props before, during and after each action). `useGame.ts`: boot, saves, dev URLs. `chef.ts`: the active chef context. |
| `src/three/` | `Scene.tsx`: camera, stall, chef, customers. `Showcase.tsx`: spinning hero model. `ChefPreview.tsx`, `chefLook.ts`: applies hair and colours to the chef model. `props.ts`. |
| `src/ui/` | `Onboarding.tsx`: welcome, story, chef maker, profile picker. `Chrome.tsx`: top bar, history, settings, collection. `CookOverlay.tsx`, `Screens.tsx`: result card, apple drawer. `Reveal.tsx`: manga unlock intro and overview. `Review.tsx`. |
| `src/data/` | Content data. See the next section. |
| `assets/blender/` | Blender Python that builds every model. `expansion.py` holds the newer dishes and tools. `chars.py` holds the chef and customers. |

## Data rules

- **Never edit** `src/data/prototype_game_data.json` or `recipe_actions_20.json`. They are the original pack. Changes go in layers on top:
  - `recipe_action_overrides.json`: changed action plans, such as the 4-step yogurt parfait.
  - `apples_expansion.json`, `apple_visuals.json`, `fit_matrix.json`: **generated** by `python3 scripts/build_content_data.py` from `src/data/source/` (the 100×20 CSV, the unlock cards, and the size research), plus `DRAFTS` in the script. Edit the script or the sources and re-run it. Never hand-edit the outputs.
- The 90 non-prototype apples have provisional stats, marked `"provisional": true`.
- Apple sizes come from research: S ≤ 250 g, M ≤ 350 g, L above that. 3D scale is S 0.85, M 1.0, L 1.12, and apples of 100 g or less use 0.62.

## 3D assets (Blender)

Use Blender 5.x headless. `python3` alone can't import `bpy`, and Pillow isn't installed, so `npm run assets` doesn't work as written. Use:

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python assets/blender/build_assets.py -- [--no-render] [--only-render=name,name]
cp assets/aomori.glb src/assets/models/aomori.glb      # the game imports this copy; forgetting it = "Missing model node"
$B -b --factory-startup --python scripts/icons_blender.py   # assets/icons-png/*.png → src/assets/icons/*.webp
```

The chef's customisable parts are named nodes and materials, which `chefLook.ts` relies on:
- hair: `Chef_Hair_F1..3`, `Chef_Hair_M1..3`
- materials: `M_ChefIris`, `M_ChefButton`, `M_ChefSkirt`, `M_ChefHat`

## Game design decisions (from the user)

- Scoring:
  - Each action scores Perfect 100, Good 70 or OK 40.
  - Recipes with more steps are worth more (difficulty multiplier).
  - Consecutive Perfects add a combo bonus.
  - The apple-fit multiplier is ×0.5 to ×2.
- **No** tier labels (Sprout, Blossom and so on). The only badge is **"Golden Recipe"**, given when every action is Perfect.
- No hint or feedback line on the result card.
- Remove UI text that states the obvious.
- New apples and recipes unlock with a manga-style intro (about 6.3 s), then a full-screen overview with no "Best apples" section.
- Light background (`#FCF8F0`).
- The cooking action should sit near the vertical centre on mobile.
- Profiles: up to 6 chefs. Each profile has its own save key, `aomori-kitchen-save:<id>`.
- The chef look is:
  - sex
  - 3 hair styles per sex
  - eyes: brown, green or blue
  - outfit colour: red, pink, light blue or purple. It colours the buttons, skirt and hat.

## Status

- Playable: 100 apples and 9 recipes: `fresh_juice`, `rabbit_apples`, `apple_jam`, `mini_candy_apple`, `hirosaki_pie`, `jam_toast`, `yogurt_parfait`, `baked_apple`, `apple_compote`.
- Not built yet: 11 recipes in `EXTRA_RECIPE_META` (`src/core/content.ts`). They are dorayaki, daifuku, jelly, whole apple pie, cheesecake, kinton, keema, shumai, pork rolls, pink tart, and Festival Pie, a 3-apple finale.
- Adding a recipe touches:
  - `RECIPE_ORDER` and `REQUIRED_ACTION_COUNTS`
  - unlocks and intro lines in `progression.ts`
  - a stage function in `stations.ts`
  - models in `expansion.py`
  - its dish icon
  - the tests

## Git workflow

- Work on a branch, commit, then `git merge --ff-only` into `main`.
- **Push only when the user asks.**
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before committing, run `npm test`, `npx tsc -b` and `npm run lint`. Check UI changes in the browser at mobile size.
