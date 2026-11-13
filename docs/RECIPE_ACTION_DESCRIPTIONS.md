# Recipe action descriptions — version 2

Three gesture types, 1–5 timed actions per dish. A stage is one scored gesture, not a complete culinary step. Automatic chef preparation and cooking bridges remain visible. All timings are provisional game tuning; no real cooking temperatures or durations are inferred from the timer.

| Recipe | Active now | Actions | Gesture order |
|---|---|---:|---|
| Hirosaki Apple Pie | Yes | 5 | swipe → tap → circle → tap → tap |
| Rabbit Apples | Yes | 2 | swipe → swipe |
| Fresh Aomori Apple Juice | Yes | 1 | tap |
| Mini Ringo Ame | Yes | 4 | tap → tap → tap → tap |
| Baked Apple | Future | 3 | tap → tap → tap |
| Two-Colour Apple Jam | Yes | 3 | swipe → tap → circle |
| Apple Jam Shokupan Toast | Future | 1 | tap |
| Apple Yogurt Parfait | Future | 2 | tap → tap |
| Apple Nama Dorayaki | Future | 5 | swipe → circle → tap → tap → tap |
| Azuki Apple Daifuku | Future | 4 | swipe → circle → tap → tap |
| Fresh Apple Jelly | Future | 4 | swipe → circle → tap → tap |
| Whole Apple Pie | Future | 3 | tap → tap → tap |
| Rice-Cooker Apple Cheesecake | Future | 5 | swipe → circle → tap → tap → tap |
| Golden Apple Kinton | Future | 3 | swipe → circle → tap |
| Shiny Apple Compote | Future | 3 | swipe → tap → tap |
| Apple Keema Curry Rice | Future | 4 | swipe → tap → circle → tap |
| Fluffy Apple Shumai | Future | 4 | swipe → circle → tap → tap |
| Apple and Pork Rolls | Future | 5 | swipe → tap → tap → tap → tap |
| Pink-Flesh Apple Tart | Future | 5 | swipe → tap → circle → tap → tap |
| 100 Apples Collection Festival Pie | Future | 5 | swipe → tap → circle → tap → tap |

## Hirosaki Apple Pie

Apple form: **wedges**. Selected cooked-filling pastry variant. Supports cut apples, cooked filling, cooling, assembly and baking; all numerical game timings are invented tuning values, not cooking instructions.

Timed actions:

1. **Swipe — Slice the apples.** Swipe along the apple cut guide. Animation: `apple_sliced`.
2. **Tap — Add apples to the pan.** Tap the pan to add apples, butter and sugar. Animation: `pie_filling_added`.
3. **Circle — Stir the filling.** Circle gently while the filling reduces; finish on the cue. Animation: `pie_filling_cooked`.
4. **Tap — Fill the pastry.** Tap the pastry to place cooled filling; chef closes and glazes it. Animation: `pie_assembled`.
5. **Tap — Take out the golden pie.** Tap when the golden-bake cue reaches its target. Animation: `pie_baked`.

Automatic preparation / bridges:

- Chef washes, peels and cores fruit; pastry is prepared.
- Cool and drain cooked filling before assembly; pastry closure and egg wash animate automatically; baking is compressed.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/184.html)

## Rabbit Apples

Apple form: **wedges**. Simplified rabbit-ear presentation based on documented decorative wedge cuts; automatic core removal and plating.

Timed actions:

1. **Swipe — Cut apple wedges.** Swipe through the apple along the cut guide. Animation: `apple_wedged`.
2. **Swipe — Cut the rabbit ears.** Swipe along the V-shaped peel guide; one stroke animates the paired ear incisions. Animation: `rabbit_ears_cut`.

Automatic preparation / bridges:

- Chef washes the apple and automatically removes the core after the first cut.
- Chef plates finished rabbit wedges automatically.

Sources: [Recipe source 1](https://www.aomori-ringo.or.jp/20211214/5112/)

## Fresh Aomori Apple Juice

Apple form: **prepared_chunks**. Original one-action juice service using pre-cut fruit. Source supports cutting/core removal and machine extraction; game uses a juicer, not the source's exact blender ingredient formula.

Timed actions:

1. **Tap — Press the apple.** Tap the press button on the cue. Animation: `juice_pressed`.

Automatic preparation / bridges:

- Chef washes, cores and cuts the selected apple; loads the juicer automatically.
- Chef pours the pressed juice and adds the reference garnish automatically.

Sources: [Recipe source 1](https://delishkitchen.tv/recipes/335882553422512430)

## Mini Ringo Ame

Apple form: **whole**. Whole mini-apple candy variant, served intact. No swipe, no manual circle, and no stirring boiling sugar. Coating rotation is automatic and is not a mixing gesture.

Timed actions:

1. **Tap — Skewer the whole apple.** Tap the apple to insert its stick. Animation: `apple_skewered`.
2. **Tap — Stop heating the syrup.** Tap when the syrup readiness cue reaches the target. Animation: `syrup_ready`.
3. **Tap — Dip the whole apple.** Tap to dip and automatically turn the apple once or twice. Animation: `whole_apple_coated`.
4. **Tap — Set it on the cooling tray.** Tap the tray to place the whole coated apple; cooling animates. Animation: `candy_apple_cooled`.

Automatic preparation / bridges:

- Chef washes and thoroughly dries the apple.
- Sugar and water are combined before heat automatically; boil undisturbed; cool on baking paper automatically after dipping.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/185.html)

## Baked Apple

Apple form: **whole_cored**. Uses the documented microwave whole cored apple variant. No swipe even though coring removes the centre; model a corer, not a slicing knife.

Timed actions:

1. **Tap — Core the whole apple.** Tap to lower the coring tool; keep the outer apple intact. Animation: `whole_apple_cored`.
2. **Tap — Fill the apple centre.** Tap to add butter and the selected topping. Animation: `whole_apple_filled`.
3. **Tap — Finish heating the apple.** Tap the tenderness cue to finish heating. Animation: `whole_apple_cooked`.

Automatic preparation / bridges:

- Chef washes the apple.
- Microwave heating and resting animate between fill and final removal.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/157.html)

## Two-Colour Apple Jam

Apple form: **small_slices**. Retains cutting, measured ingredients and final mixing. Simmering happens before the final circle; do not interpret three gestures as the entire recipe. Default single jar; two-colour presentation is future optional styling.

Timed actions:

1. **Swipe — Cut small apple pieces.** Swipe along the small-piece guide. Animation: `apple_chopped`.
2. **Tap — Add fruit and sugar.** Tap the pot to add the measured ingredients. Animation: `jam_ingredients_added`.
3. **Circle — Mix in lemon juice.** Circle with the spoon near the end of reduction; finish on the cue. Animation: `jam_mixed`.

Automatic preparation / bridges:

- Chef washes, peels, cores and weighs the apple.
- Maceration and simmering are compressed automatic bridges; chef fills a jar after mixing.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/033.html)

## Apple Jam Shokupan Toast

Apple form: **prepared_jam**. Original single-slice jam toast adaptation. Source describes toast with apple jam and fresh apple in a sandwich; this simpler game variant omits sandwiching and raw slices. No fresh apple cutting in this service.

Timed actions:

1. **Tap — Add apple jam to toast.** Tap the toast on the cue to add jam. Animation: `jam_toast_finished`.

Automatic preparation / bridges:

- Chef toasts a slice of shokupan and provides jam made from the selected apple.
- Chef spreads the deposited jam automatically.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/148.html)

## Apple Yogurt Parfait

Apple form: **diced**. Original parfait presentation of documented apple/yogurt pairing. Pre-cut fruit is explicit; no fictional stirring of layered parfait.

Timed actions:

1. **Tap — Add yogurt.** Tap the glass to add yogurt. Animation: `yogurt_layer_added`.
2. **Tap — Layer apple and crunch.** Tap on the layer cue to add diced apple and topping. Animation: `parfait_finished`.

Automatic preparation / bridges:

- Chef washes, cores and dices the selected apple.
- Yogurt and crunchy topping portions are prepared.

Sources: [Recipe source 1](https://www.aomori-ringo.or.jp/bifidus/)

## Apple Nama Dorayaki

Apple form: **small_slices**. Preserves cooked and drained apple filling, mixed batter, pancake cooking, cream and azuki assembly.

Timed actions:

1. **Swipe — Cut apple filling.** Swipe to cut small apple slices. Animation: `dorayaki_apple_cut`.
2. **Circle — Mix pancake batter.** Circle the whisk; finish on the cue. Animation: `dorayaki_batter_mixed`.
3. **Tap — Pour pancake batter.** Tap the pan to pour a pancake. Animation: `dorayaki_pancake_poured`.
4. **Tap — Flip at the bubble cue.** Tap as bubbles appear; chef flips and finishes both sides, repeating automatically for a second pancake. Animation: `dorayaki_pancakes_ready`.
5. **Tap — Fill and sandwich.** Tap to add cooled apple, cream and azuki; chef closes the sandwich. Animation: `dorayaki_finished`.

Automatic preparation / bridges:

- Chef washes, peels and cores apple.
- After cutting chef simmers apple in apple juice, cools and drains it; ingredients are measured.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/169.html)

## Azuki Apple Daifuku

Apple form: **diced**. Cooked diced apple, not a whole raw apple. Heating, drying, azuki coating and mochi heating are visible automatic bridges.

Timed actions:

1. **Swipe — Dice the apple.** Swipe along the dice guide. Animation: `daifuku_apple_cut`.
2. **Circle — Mix the mochi.** Circle to combine mochi ingredients; chef heats and stirs to translucency. Animation: `mochi_mixed`.
3. **Tap — Place apple and azuki filling.** Tap to place cooled dry apple in azuki on flattened mochi. Animation: `daifuku_filled`.
4. **Tap — Close the mochi.** Tap on the closing cue; chef folds and seals. Animation: `daifuku_finished`.

Automatic preparation / bridges:

- Chef washes, peels and cores apple.
- Cook apple with sugar/lemon then dry and cool it after cutting; heat mochi between mixing and wrapping; chef coats apple with azuki.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/106.html)

## Fresh Apple Jelly

Apple form: **diced**. Retains fresh cubes, juice plus dissolved gelatin, moulding and chilling. Game set cue represents time compression.

Timed actions:

1. **Swipe — Dice apple cubes.** Swipe along the cube guide. Animation: `jelly_apple_cut`.
2. **Circle — Mix juice and gelatin.** Circle to combine juice and dissolved gelatin. Animation: `jelly_liquid_mixed`.
3. **Tap — Fill the mould.** Tap to add cubes and liquid. Animation: `jelly_mould_filled`.
4. **Tap — Unmould the chilled jelly.** Tap the set cue; chef unmoulds after compressed chilling. Animation: `jelly_finished`.

Automatic preparation / bridges:

- Chef washes, peels and cores fruit; gelatin is bloomed and dissolved automatically.
- Use prepared juice; automatic chilling begins after mould filling.

Sources: [Recipe source 1](https://www.zennoh.or.jp/am/recipe/ssi/post-36.html)

## Whole Apple Pie

Apple form: **whole_cored**. Product evidence confirms cored syrup-treated whole Fuji wrapped and baked in pastry. Gesture sequence is an authored reconstruction, not the producer's published manufacturing recipe. No swipe anywhere, including pastry.

Timed actions:

1. **Tap — Core the whole apple.** Tap to lower the corer; no apple slices. Animation: `whole_pie_apple_cored`.
2. **Tap — Wrap apple in pastry.** Tap to place the syrup-prepared apple; chef wraps and glazes. Animation: `whole_pie_wrapped`.
3. **Tap — Remove the golden whole pie.** Tap the bake cue; the apple remains whole inside. Animation: `whole_pie_baked`.

Automatic preparation / bridges:

- Chef washes the apple; pastry is prepared.
- After coring chef syrup-soaks and drains the apple automatically; cooling follows baking.

Sources: [Recipe source 1](https://aspam.jp/item/670/)

## Rice-Cooker Apple Cheesecake

Apple form: **slices**. Rice-cooker cheesecake with cooked apple slices and mixed batter; no oven substitution.

Timed actions:

1. **Swipe — Slice the apple.** Swipe the slice guide. Animation: `cheesecake_apple_cut`.
2. **Circle — Mix cheesecake batter.** Circle to combine softened cheese and batter ingredients. Animation: `cheesecake_batter_mixed`.
3. **Tap — Arrange cooked apples.** Tap to arrange cooled apple slices in the cooker. Animation: `cheesecake_apples_arranged`.
4. **Tap — Add batter and start cooker.** Tap to add batter and start. Animation: `cheesecake_cooking`.
5. **Tap — Turn out the cooled cake.** Tap after the cooking and cooling cues; chef turns out the cake. Animation: `cheesecake_finished`.

Automatic preparation / bridges:

- Chef washes, peels, cores apple and measures batter ingredients.
- Cook and cool apple slices after cutting; rice-cooker cycle and cooling are automatic bridges.

Sources: [Recipe source 1](https://www.morinaga.co.jp/recipe/detail/765)

## Golden Apple Kinton

Apple form: **small_slices**. Sweet-potato and cooked-apple kinton; mashing is a visible chef bridge, circle is combining rather than pretending to cut.

Timed actions:

1. **Swipe — Cut apple pieces.** Swipe the slice guide. Animation: `kinton_apple_cut`.
2. **Circle — Combine apple and sweet potato.** Circle to fold cooked apple into prepared sweet potato mash. Animation: `kinton_mixed`.
3. **Tap — Shape golden kinton.** Tap to portion and shape the soft mixture. Animation: `kinton_finished`.

Automatic preparation / bridges:

- Chef washes, peels and cores apple; cooks and mashes sweet potato.
- After cutting chef cooks and cools apple automatically.

Sources: [Recipe source 1](https://www.aomori-ringo.or.jp/20221128/6204/)

## Shiny Apple Compote

Apple form: **wedges**. Microwave wedge compote variant. No stirring or pot glazing invented for the cited microwave method.

Timed actions:

1. **Swipe — Cut even apple wedges.** Swipe the wedge guide. Animation: `compote_apple_cut`.
2. **Tap — Arrange and sweeten.** Tap to arrange wedges, sugar and optional butter. Animation: `compote_arranged`.
3. **Tap — Finish heating.** Tap the tenderness cue; chef rests the covered dish automatically. Animation: `compote_finished`.

Automatic preparation / bridges:

- Chef washes, peels and cores the apple.
- Cover and microwave after arranging; rest covered before serving.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/191.html)

## Apple Keema Curry Rice

Apple form: **diced_skin_on**. The Japanese title says marugoto but the recipe dices apple with skin on. Whole-fruit wording does not mean intact geometry here; swipe is correct.

Timed actions:

1. **Swipe — Dice apple and vegetables.** Swipe to dice the apple and prepared vegetables. Animation: `keema_produce_cut`.
2. **Tap — Add apple and vegetables.** Tap to add produce to the aromatic pan. Animation: `keema_produce_added`.
3. **Circle — Stir the curry.** Circle to saute produce; chef then cooks mince and adds tomato and water before simmering. Animation: `keema_stirred`.
4. **Tap — Add curry roux.** Tap the simmer cue to add roux; chef dissolves it, finishes cooking and serves with rice. Animation: `keema_finished`.

Automatic preparation / bridges:

- Chef washes/cores apple and prepares aromatics, vegetables, mince and rice.
- Cook aromatics first, then apple/vegetables, then mince, then tomato/water and simmer; these phases bridge the player steps in order.

Sources: [Recipe source 1](https://www.aomori-ringo.or.jp/20190701/3124/)

## Fluffy Apple Shumai

Apple form: **chopped_cooked**. Modern contest recipe with crushed somen coating; no conventional folded wrapper substituted.

Timed actions:

1. **Swipe — Chop the cooked apple.** Swipe to coarsely chop cooled cooked apple. Animation: `shumai_apple_chopped`.
2. **Circle — Mix the filling.** Circle to combine apple, onion, mince and seasonings. Animation: `shumai_filling_mixed`.
3. **Tap — Shape and coat.** Tap to portion balls and coat with crushed somen. Animation: `shumai_shaped`.
4. **Tap — Finish steaming.** Tap the steam cue after compressed cooking. Animation: `shumai_finished`.

Automatic preparation / bridges:

- Chef washes/cores apple; initial slicing, heating and cooling are automatic.
- Onion, mince, ginger and seasonings are prepared; crushed somen is ready.

Sources: [Recipe source 1](https://www.aomori-ringo.or.jp/20260219/9127/)

## Apple and Pork Rolls

Apple form: **slices_and_dice**. Preserves sauteed apple and mashed potato filling, pan cooking and apple-corn sauce. Game cue is not real-world meat safety verification.

Timed actions:

1. **Swipe — Cut apple slices and cubes.** Swipe; chef makes slices for filling and cubes for sauce. Animation: `pork_apple_cut`.
2. **Tap — Add apple and potato to pork.** Tap to add sauteed slices and mashed potato. Animation: `pork_filled`.
3. **Tap — Roll the pork.** Tap the seam cue; chef rolls the filling. Animation: `pork_rolled`.
4. **Tap — Place rolls in the pan.** Tap to begin pan cooking. Animation: `pork_in_pan`.
5. **Tap — Finish cooking and sauce.** Tap the cooked cue; chef finishes through-cooking, plates and adds prepared apple-corn sauce. Animation: `pork_finished`.

Automatic preparation / bridges:

- Chef prepares mashed potato and measures sauce ingredients.
- After cutting chef sautes the apple slices; sauce apple cubes cook in stock/corn and are thickened automatically.

Sources: [Recipe source 1](https://www.pref.aomori.lg.jp/soshiki/nourin/brand/files/20ryori_117.pdf)

## Pink-Flesh Apple Tart

Apple form: **slices**. Original pink-flesh styling of the documented compote/yogurt-mousse/biscuit-base tart. Not an oven-baked rose tart; reference art needs to reflect this variant.

Timed actions:

1. **Swipe — Cut pink apple pieces.** Swipe through the red-fleshed apple. Animation: `red_tart_apple_cut`.
2. **Tap — Add cooked fruit to mould.** Tap to arrange cooled compote pieces. Animation: `red_tart_fruit_arranged`.
3. **Circle — Mix yogurt mousse.** Circle to mix prepared whipped cream, yogurt and dissolved gelatin. Animation: `red_tart_mousse_mixed`.
4. **Tap — Add mousse and tart base.** Tap to fill and close with the prepared biscuit base. Animation: `red_tart_assembled`.
5. **Tap — Unmould the chilled tart.** Tap the set cue to unmould. Animation: `red_tart_finished`.

Automatic preparation / bridges:

- Chef prepares tart base and mousse; washes and cores apple.
- Apple compote cooking/cooling occurs after slicing; setting occurs before unmoulding.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/038.html)

## 100 Apples Collection Festival Pie

Apple form: **mixed_cut**. Original game finale, not a traditional 100-apple recipe. Generic pie preparation supports actions only; three-role composition needs separate future scoring, never sum matrix rows.

Timed actions:

1. **Swipe — Cut the three apple batches.** Swipe the batch guide; chef processes all three selections. Animation: `festival_apples_cut`.
2. **Tap — Add apple batches to pans.** Tap to distribute the batches into pans. Animation: `festival_fillings_added`.
3. **Circle — Mix the fillings.** Circle to cook the fillings; chef cools them. Animation: `festival_fillings_cooked`.
4. **Tap — Assemble the festival pie.** Tap to place complementary fillings; chef adds lattice and glaze. Animation: `festival_pie_assembled`.
5. **Tap — Finish the celebration bake.** Tap the golden-bake cue. Animation: `festival_pie_finished`.

Automatic preparation / bridges:

- Player chooses three complementary apples before cooking; this selection is not a timed action.
- Chef washes/cores apples and prepares pastry; cools fillings before assembly.

Sources: [Recipe source 1](https://www.ringodaigaku.com/eat/recipe_new/184.html)
