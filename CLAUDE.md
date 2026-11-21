# Aomori Apple Kitchen

A portrait, mobile-first 3D cooking game for kids (about 6 to 12), built to show off Aomori's apples. The player picks an apple, cooks a recipe with timed tap, swipe and circle actions, and earns points. Stack: React 19, @react-three/fiber and three.js, Vite, Vitest, TypeScript, oxlint. It deploys to Cloudflare Workers as a static site.

- Repo: github.com/zprickett/aomori-apple-game. The Worker is named `aomori-apple-game` (`wrangler.jsonc`).
- README.md covers run, deploy and tests. It was written for the original 10-apple, 5-recipe prototype, so its counts are out of date.

## Commands

Always run from `~/Build/aomori`. `~/Build` has its own unrelated Next.js `npm run dev`.

```bash
npm run dev                # http://localhost:5173
npm test                   # vitest (185 tests)
npx tsc -b                 # strict type check
npm run lint               # oxlint
npm run build
```

## Dev-only URLs

These only work in dev, because they are gated by `import.meta.env.DEV`.

- `/?review`: browse all 100 apples (3D at true size, S/M/L, stats, fit per recipe).
- `/?review=recipes&recipe=<id>`: step through every frame of a recipe in the real scene. **▶ Play** opens the next URL.
- `/?play=<recipeId>&apple=<appleId>`: an in-memory practice session with everything unlocked. It does not touch saves. This one also works on the live site (for trying recipes on a phone).
- `/?skip=N`: start a fresh save with N orders already done on a typical 10-year-old's ladder (`TYPICAL_LADDER`, `typicalPoints` in `ranks.ts`), to test unlocks and reveals.
- `/?bg=<id>`: preview another painted backdrop (`aomori_city`, `lake_towada`, `takayama_inari`; see `src/game/backgrounds.ts`).
- `/?skip=60`: past Ojiichan's ending; after the news cards the Stage 2 intro plays, then Captain Ingrid's letter. `?skip` overwrites the chef you pick, so use a test chef.
- `/?skip=N&ready`: the same, with points just below the next ladder step, so the next dish reaches it. Rank-ups: N = 4, 17, 31 or 50. Ojiichan visits at order 56 (`?skip=55`).

## Layout

| Path | What |
|---|---|
| `src/core/` | Pure game logic, no rendering, all unit tested. `content.ts`: apples, recipes, `RECIPE_ORDER` (playable recipes). `requests.ts`: Golden Requests (apple clues, twists, Golden Seal, the waiting letter). `trophies.ts`: Golden Trophies. `ranks.ts`: the chef's ladder (one points-driven progression: 5 ranks with two ★ steps each, which recipes each step brings, v3 migration). `story.ts`: Ojiichan's letter and notebook (from `src/data/story.json`). `progression.ts`: unlock schedule, order queue, the second customer (`offerFor`, `waitingAfter`). `points.ts`: scoring, dish stars, Golden Recipe bonus. `profiles.ts`: chef profiles and looks. `gameReducer.ts`, `persistence.ts`. |
| `src/game/` | `backgrounds.ts`: painted backdrops behind the stall (Aomori City by default). `stations.ts`: per-recipe counter stages (props before, during and after each action). `stallPieces.ts`: which ladder step brings each stall piece. `useGame.ts`: boot, saves, dev URLs. `chef.ts`: the active chef context. |
| `src/three/` | `Scene.tsx`: camera, stall, chef, customers. `Showcase.tsx`: spinning hero model. `ChefPreview.tsx`, `chefLook.ts`: applies hair and colours to the chef model. `props.ts`. |
| `src/ui/` | `Ranks.tsx`: rank badge, the ladder bar, rank-up page, day recap (with the day's new trophies). `Finale.tsx`: Ojiichan's tasting and the group photo. `Notebook.tsx`: Ojiichan's letter, notebook pages and reveal. `Player.tsx`: My chef panel. `Trophies.tsx`: trophy pop-up and cabinet. `Onboarding.tsx`: welcome, chef maker, profile picker. `Chrome.tsx`: top bar, history, settings, collection. `CookOverlay.tsx`, `Screens.tsx`: result card, apple drawer. `Reveal.tsx`: manga unlock intro and overview. `Requests.tsx`: Stage 2 intro, the letter on the counter, request screens, menu strip, passport and world map. `Review.tsx`. |
| `src/data/` | Content data. See the next section. |
| `assets/blender/` | Blender Python that builds every model. `expansion.py` holds the newer dishes and tools. `chars.py` holds the chef and customers. |

## Data rules

- **Never edit** `src/data/prototype_game_data.json` or `recipe_actions_20.json`. They are the original pack. Changes go in layers on top:
  - `recipe_action_overrides.json`: changed action plans, such as the 4-step yogurt parfait.
  - `apples_expansion.json`, `apple_visuals.json`, `fit_matrix.json`: **generated** by `python3 scripts/build_content_data.py` from `src/data/source/` (the 100×20 CSV, the unlock cards, and the size research), plus `DRAFTS` in the script. Edit the script or the sources and re-run it. Never hand-edit the outputs.
- The 90 non-prototype apples have provisional stats, marked `"provisional": true`.
- Apple pace: 5 starters, then 3 new apples every 6 orders starting after order 3 (all 100 by order 189). Set in `scripts/build_content_data.py` (`BATCH*`). A batch shares one "3 NEW APPLES!" intro.
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
- rank pieces: `Chef_Badge`, `Chef_Scarf`, `Chef_HatStar` (the apron `Chef_Apron` turns gold at Golden Chef)
- stall parts: `Stall_Frame`, `Stall_Roof`, `Counter_Cloth`, `Noren_L/C/R`, `Noren_Rod`, `Lantern`, `Lantern_Bracket`, `Crate`, `Chalkboard`, `Greenery`, `Ground`; extras `Upgrade_Sign`, `Upgrade_Crate2`, `Upgrade_Banner`
- materials: `M_ChefIris`, `M_ChefButton`, `M_ChefSkirt`, `M_ChefHat`

Customers are `Customer_A..D` plus `Customer_O` (Ojiichan) in `chars.py`. Golden Request visitors: `Customer_I` Ingrid, `G` Mr. Ōgane, `F` Chef Amélie, `L` Commander Leila, `M` Carer Mia, `P` Princess Amara, `H` the Head Butler, `R` Grandma Rosa (`build_customer_I`, `build_visitors`). Gifts: the two-tier `Gift_Shelf` on the right post and `Gift_Longship`, `Gift_LuckyCat`, `Gift_CopperPan`, `Gift_EarthPhoto`, `Gift_FlyingFox`, `Gift_PinkLantern`, `Gift_Teapot`, `Gift_Taxi` (`build_gifts` in `stall.py`).

## Game design decisions (from the user)

- Story: the Golden Chef Journey (Claude Doc "Aomori Apple Kitchen: Golden Chef Journey"). The hero is the player's own chef, not a fixed "Hana". Built: phase 1 (ranks, stars, days), phase 2 (Ojiichan's letter after the chef maker, a notebook page per rank, stall tour) phase 3 (regulars, news cards, Ojiichan's visit), phase 4 (stall upgrades and chef outfit pieces per rank) and phase 5 (Golden Trophy cabinet). Stage 1 is complete; Stage 2's eight Golden Requests and trophies are built (see below); the World Apple Feast finale is not.
- Golden Request gifts go on one small gift shelf on the stall's right post (the user's choice, the one exception to "no extra props"). Requests begin after Golden Chef, not earlier.
- Grandpa is "Ojiichan". Story text lives in `src/data/story.json` (edit it freely; tests check it). Never use he/she for the chef. Postcards foreshadow Stage 2 visitors (Norway, Paris, Queensland).
- Customers: A Sota, B Yui, C Grandpa Kiyoshi, D Mei (the four regulars, also everyday customers); O Ojiichan (chef whites, only on his visit the day after Golden Chef). Each regular has 4 story visits (`story.json` `regulars`, each timed as `rank` + `after` orders), laid over the order queue in `progression.ts` without replacing recipe intros or apple demos. Last visits fall in Head Cook, so every story ends before Golden Chef. Mei's last visit gives the Oirase apple early.
- News cards (Sota's thank-you note, Aomori Daily, festival invite, Golden Apple award) show at the start of the day after each rank-up (one order later if the day ended on a celebration), say why they came and who sent them, have their own entrance per kind, and are kept in the My chef scrapbook. Customers stay hidden while one shows.
- Stirring is forgiving (`FREEFORM_CIRCLE` in `recognizers.ts`): two circles of any size, anywhere on screen, either way round; lifting the finger keeps the progress. The strict ring-band mode stays for its tests.
- Apples already cooked with show a plain green ✓ in the apple picker and the collection.
- Story characters (regulars, Ojiichan) get their own order bubble: colour, portrait, big name, tagline and story hearts. Everyday customers keep the plain bubble.
- The stall builds up along the ladder from the original stall's own parts (split in `stall.py`; list in `src/game/stallPieces.ts`), always in the same design and framing: Helper bare frame, counter and one crate; Apprentice red awning, ★ apple counter cloth; Cook noren (shortened in the scene so the chef's face shows), ★ paper lantern; Head Cook chalkboard, ★ second crate, ★★ hanging sign; Golden Chef bunting. No extra props around the stall. A ★ step with only a stall piece shows a small "Stall upgrade!" card. Chef pieces: badge (Apprentice), neckerchief (Cook), beret star (Head Cook), gold apron (Golden Chef), in `RANK_PIECES` (chefLook.ts).
- Stall upgrade moment: the new piece stays hidden after the dish, then the 'upgrade' camera (wide shot, customers out) drops it in with a manga STALL UPGRADE! frame (`StallUpgrade` in Reveal.tsx, `pop` in Scene's Stall). Rank-ups get their piece's moment too. The shop camera is a little wider than before.
- High score = a dish that beats the chef's best-ever dish (`newHigh` on the order record): a NEW HIGH SCORE! burst on the result card, a highlight in the day recap, and Records in My chef. Score chips and trophies can be tapped for an explanation.
- Opening: a three-panel manga page (Ojiichan flies off, the chef finds the empty stall, a note on the counter) before Ojiichan's letter. Text in story.json `prologue`; the first news card explains letters (`firstLetter`).
- Character dialog is listed for editing in the Claude Doc "Aomori Apple Kitchen: character dialog" (https://claude.ai/artifact/1kurEaUL1S2sneM8B4TwZD), including a draft Stage 2 intro.
- First order: a "Let's make your first order!" banner, and a "Time it right!" tip before the very first action.
- Golden Trophies (`trophies.ts`): 8 trophies with bronze/silver/gold steps (Golden Peeler, Hop-Hop Warren, Golden Spoon, Perfect Streak, Rainbow Basket, Apple Encyclopedia, Big and Small, Regulars' Friend). Counters live in `trophyStats` in the save (rebuilt from history for older saves). New steps are listed in the day recap (no pop-ups after dishes); the cabinet is in My chef. World Traveller, Golden Seal Master and Collector's Crown come with Stage 2.
- The stall tours with rank: Aomori City (Helper, Apprentice), Lake Towada (Cook), Takayama Inari (Head Cook, Golden Chef). Each backdrop's `groundTop` lines its sand up with the stall.
- ONE progression, driven by points (decided after the 2026-11-19 playtest): the chef's ladder in `ranks.ts`. Every dish earns points, so nobody gets stuck; better cooking just climbs faster. Ranks at 1,200 / 11,500 / 30,000 / 55,000 pts with two ★ steps each (stall pieces and mid-rank recipes). Tuned by simulation so a typical 10-year-old reaches Golden Chef around order 50 (7-year-old ~60, adult ~38). No chef levels, no rank skill goals.
- Kids choose: on everyday orders two customers wait and the kid taps who to serve (`offerFor`). A new recipe's intro and story visits must be served. The customer not picked waits for the next turn, once.
- Max two pop-ups between orders: a rank-up is the rank page + notebook page (a recipe that comes with a rank skips its manga intro); a rank-up or Ojiichan's order keeps that order's apples for the next order.
- Ojiichan's ending: after his order, a manga tasting ("It's better than mine!"), then a group photo with the four regulars (kept in the scrapbook). From then on he stays at the stall, behind the counter, and carries Stage 2's story.
- A day is 5 orders, then a recap. Saves are v5 (`ladder`, `waiting`, `requests`); v3 rank histories (and v2's earliest schedule) move onto the ladder without losing rank or recipes.
- Scoring:
  - Each action scores Perfect 100, Good 70 or OK 40. Perfect windows: tap ±90 ms, slice ±100 ms; two Perfect slices and one Good still make a Perfect step. "Chef, help!" gives an assisted OK.
  - Dish stars (0–3) come from points: 3 at 70%+ of the best possible total, 2 at 40%+, 1 above 0. A Golden Recipe is never below 2 and earns +25% points.
  - Recipes with more steps are worth more (difficulty multiplier).
  - Consecutive Perfects add a combo bonus.
  - The apple-fit multiplier is ×0.5 to ×2.
- **No** tier labels (Sprout, Blossom and so on). The only badge is **"Golden Recipe"**, given when every action is Perfect. NEW BEST only shows for a real improvement.
- No hint or feedback line on the result card.
- Remove UI text that states the obvious.
- New apples and recipes unlock with a manga-style intro (about 6.3 s), then a full-screen overview with no "Best apples" section. The apple picker shows a one-line reason for each apple's fit (`fitReason` in `content.ts`); the apple descriptions themselves stay as they are.
- Light background (`#FCF8F0`).
- The cooking action should sit near the vertical centre on mobile.
- Profiles: up to 6 chefs. Each profile has its own save key, `aomori-kitchen-save:<id>`.
- The chef look is:
  - sex
  - 3 hair styles per sex
  - eyes: brown, green or blue
  - outfit colour: red, pink, light blue or purple. It colours the buttons, skirt and hat.

## After Golden Chef: the long-term loop (decided 2026-11-22)

- Visitors keep sending big-scoring menu requests mixed in with everyday orders; kids use them for points, trophies and learning the apples. A letter arrives every 4–7 orders after the last request (`letterGap`, `requestClock` in the save): new visitors first in story order, then returning ones (never the same twice in a row). A waiting letter stays until opened.
- Points keep counting: Golden Chef rank 1 at 55,000, each gap 10% bigger (68,200, 82,720, 98,692…; `goldenRankOf` in `ranks.ts`). Always worded "Golden Chef rank 2", never "Golden Chef 2". A quick gold card after the dish that reaches it (seen key `grank:N`), the ladder bar, My chef and the day recap.
- The 11 journey recipes are each brought by a returning regular who found it (story.json `recipeIntros`, shown in their story bubble with "Found a new recipe!"): 8 orders after Golden Chef, then every 3–5 orders (`JOURNEY_GAPS`).

## Golden Requests (Stage 2: Slices A and B built 2026-11-21/22)

- The Stage 2 intro (`stage2Intro` in story.json) plays from the day after Ojiichan's visit, after any news card, then opens the first request. After that a waiting request is a letter button above the bottom bar; the kid can open it or keep serving customers.
- Flow (mode 'request', phase 'request'): letter → menu card (dishes with apple clues, one twist; Ojiichan's tip the first time) → apple matching (a gold match fits the clue and the twist) → the dishes cooked back to back with a menu combo strip → manga tasting reveal with the visitor's crew → rewards (passport stamp, the gift drops onto the gift shelf with the wide camera). Request runs are not saved; a reload goes back to the shop.
- Golden Seal: every apple gold and every action Good or Perfect without help. Any finished request counts. Request menus earn ×1.5 points, ×2 with the Golden Seal (`menuPoints`), plus trophy counts, not orders. Replays from the Passport in My chef.
- All 8 requests are in story.json `requests` (each with letter, dishes and clues, twist, tasting lines, crew kind and gift): Ingrid, Ōgane (Big party: every dish twice, round 2 at ×0.8 timing), Amélie (Rush order: one "Try again" for the whole menu), Leila (yellow/green apples only), Mia (naturally sweet only), Amara (pink inside), the Head Butler (Rush order), Rosa (L size only). Every dish has at least 2 gold apples by the time its letter can arrive (tested).
- Stage 2 trophies: World Traveller (stamps 3/6/8), Golden Seal Master (sealed requests 1/4/8), Apple Detective (gold matches 10/50/150, `trophyStats.goldMatches`). Apple Detective replaced Collector's Crown (no rarity data for most apples).
- Not built: the World Apple Feast finale; Festival Pie's 3-apple picker.
- Saves are v5: `requests` records ({done, seal, plays, bestStars}) and `requestClock`; v4 saves load with none.

## Status

- Playable: 100 apples and all 20 recipes. Stage 1's nine: `fresh_juice`, `rabbit_apples`, `apple_jam`, `ringo_ame`, `hirosaki_pie`, `jam_toast`, `yogurt_parfait`, `baked_apple`, `apple_compote`.
- Journey recipes (built 2026-11-21): `apple_kinton`, `apple_jelly`, `whole_apple_pie`, `apple_daifuku`, `apple_dorayaki`, `apple_keema`, `apple_shumai`, `apple_cheesecake`, `apple_pork`, `red_flesh_tart`, `festival_pie`. They unlock after Golden Chef (`JOURNEY_RECIPES` in `ranks.ts`), each brought by a regular (see the long-term loop above). They are not on the notebook's riddle pages. Festival Pie uses the one chosen apple for now; its 3-apple picker is not built.
- Journey stages are in `src/game/stationsJourney.ts`; shared stage helpers in `stationKit.ts`. Models are in `assets/blender/expansion2.py` (`FryPan`, `MixBowl`, `RiceCooker`, `PorkPrep` and each `Dish_*`).
- Adding a recipe touches:
  - `RECIPE_ORDER`, `REQUIRED_ACTION_COUNTS`, `DISH_WANTS` and `SHORT_DISH` (`content.ts`)
  - its ladder step in `LADDER` or `JOURNEY_RECIPES` (`ranks.ts`), and `INTRO_LINES` and `LINES` in `progression.ts`
  - its stages and dish in `stations.ts` or `stationsJourney.ts`, and `DISH_DISPLAY_SCALE`
  - models in `expansion.py` or `expansion2.py`
  - its dish icon (`previews.py` icon list)
  - the tests

## Git workflow

- Work on a branch, commit, then `git merge --ff-only` into `main`.
- **Push only when the user asks.**
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before committing, run `npm test`, `npx tsc -b` and `npm run lint`. Check UI changes in the browser at mobile size.
