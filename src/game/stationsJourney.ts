/**
 * Counter stages for the journey recipes (after Golden Chef): kinton, jelly, whole apple pie,
 * daifuku, dorayaki, keema curry, shumai, cheesecake, pork rolls, pink tart and Festival Pie.
 * Models are in assets/blender/expansion2.py (FryPan, MixBowl, RiceCooker, PorkPrep, Dish_*).
 */
import type { RecipeId } from '../core/content.ts';
import { BOARD_H, COUNTER_Y, FOOD, OVEN_BUTTON, board, onBoard, oven, peeled, wholeApple, type PropSpec, type StepStage } from './stationKit.ts';

const Y = COUNTER_Y;
const KNIFE = { x: 0, y: Y + BOARD_H + 0.1, z: 0.2, r: 0.12 };

/** The side board (left) with what was just cut on it. */
const side = (model?: string, key = 'cut'): PropSpec[] => [
  { ...board(-0.38, 0.3), key: 'side' },
  ...(model ? [onBoard(key, model, -0.38, 0.3, { scale: 1.0 })] : []),
];

const bowl = (only: string[], x = 0.04, z = 0.14, scale = 1.3, fx?: PropSpec['fx']): PropSpec => ({
  key: 'bowl', model: 'MixBowl', x, z, scale, tint: 'apple', only: ['MixBowl_Body', ...only], fx,
});
const BOWL = { x: 0.04, y: Y + 0.07, z: 0.14, r: 0.16 };
const bowlAside = (only: string[] = []) => bowl(only, -0.36, 0.28, 1.0);

const pan = (only: string[], x = 0.02, z = 0.14, fx?: PropSpec['fx']): PropSpec => ({
  key: 'pan', model: 'FryPan', x, z, tint: 'apple', only: ['FP_Stove', 'FP_Body', ...only], fx,
});
const PAN = { x: 0.02, y: Y + 0.1, z: 0.14, r: 0.14 };

const dish = (key: string, model: string, scale: number, tint: PropSpec['tint'] = 'apple') =>
  (only: string[], x = 0, z = 0.18, extra: Partial<PropSpec> = {}): PropSpec => ({ key, model, x, z, scale, tint, only, ...extra });

/** Wash, peel and core, then a cutting swipe on the main board (ends in `cut`). */
function cutStep(cut: string, opts: { skinOn?: boolean; lines?: string[]; chef?: string; praise: string; extra?: PropSpec[] }): StepStage {
  const start = opts.skinOn ? wholeApple() : peeled();
  const extra = opts.extra ?? [];
  return {
    bridge: opts.skinOn
      ? [[board(), wholeApple(0, 0.2, { fx: 'sparkle' }), ...extra]]
      : [[board(), wholeApple(0, 0.2, { fx: 'sparkle' }), ...extra], [board(), peeled(), ...extra]],
    bridgeLines: opts.lines ?? (opts.skinOn ? ['Washed and cored. The skin stays on!'] : ['Wash, peel and core…', 'Your turn to cut!']),
    ready: [board(), start, ...extra],
    done: [board(), onBoard('cut', cut), ...extra],
    anchor: KNIFE,
    swipeAxis: 'v', tool: 'knife',
    chefLine: opts.chef ?? (cut === 'Apple_Slices' ? 'Swipe down to slice the apple on the cue!' : 'Swipe down to cut little pieces on the cue!'),
    praise: opts.praise,
  };
}

/** Two-circle mix in the bowl, with the cut apple on the side board. */
function mixStep(cut: string, before: string, after: string, line: string, chef: string, praise: string): StepStage {
  return {
    bridge: [[...side(cut), bowl([before])]],
    bridgeLines: [line],
    ready: [...side(cut), bowl([before])],
    done: [...side(), bowl([after])],
    anchor: BOWL,
    tool: 'spoon',
    chefLine: chef,
    praise,
  };
}

const ovenStep = (before: PropSpec, after: PropSpec, praise: string): StepStage => ({
  bridge: [[before, oven()]],
  bridgeLines: ['Into the oven! Baking goes extra fast here.'],
  ready: [oven()],
  done: [oven(0.36, 0.05, 1.1), after],
  anchor: OVEN_BUTTON,
  cue: 'oven',
  chefLine: 'Watch it turn golden. Tap the button on the cue!',
  praise,
});

export function journeyStages(recipeId: RecipeId): StepStage[] {
  switch (recipeId) {
    case 'apple_kinton': {
      const k = dish('kinton', 'Dish_Kinton', 1.7);
      return [
        cutStep('Apple_Dice', { lines: ['Wash, peel and core… the sweet potato is already soft.', 'Your turn to cut!'], praise: 'Little pieces, ready to cook!' }),
        mixStep('Apple_Dice', 'MixBowl_KintonRaw', 'MixBowl_Kinton', 'The apple cooks soft, then meets the sweet potato.',
          'Mix round and round. Two big circles!', 'Smooth and golden!'),
        {
          bridge: [[bowl(['MixBowl_Kinton'], 0.36, 0.06, 1.0), k(['Kinton_Plate'], -0.06, 0.2)]],
          bridgeLines: ['Time to shape them.'],
          ready: [bowl(['MixBowl_Kinton'], 0.36, 0.06, 1.0), k(['Kinton_Plate'], -0.06, 0.2)],
          done: [bowl([], 0.36, 0.06, 1.0), k(['Kinton_Plate', 'Kinton_Balls'], -0.06, 0.2)],
          anchor: { x: -0.06, y: Y + 0.05, z: 0.2, r: 0.14 },
          chefLine: 'Tap the plate to twist golden balls!',
          praise: 'Like little golden treasures!',
        },
      ];
    }
    case 'apple_jelly': {
      const j = dish('jelly', 'Dish_Jelly', 1.8);
      const mould = ['Jelly_Cup', 'Jelly_Cubes'];
      return [
        cutStep('Apple_Dice', { chef: 'Swipe down to cut little cubes on the cue!', praise: 'Perfect little cubes!' }),
        mixStep('Apple_Dice', 'MixBowl_JuiceRaw', 'MixBowl_Juice', 'Apple juice and gelatin, ready to mix.',
          'Stir round and round to melt the gelatin!', 'Clear and golden!'),
        {
          bridge: [[bowl(['MixBowl_Juice'], 0.36, 0.06, 1.0), j(mould, -0.04, 0.2)]],
          bridgeLines: ['The apple cubes go in the mould.'],
          ready: [bowl(['MixBowl_Juice'], 0.36, 0.06, 1.0), j(mould, -0.04, 0.2)],
          done: [bowl([], 0.36, 0.06, 1.0), j([...mould, 'Jelly_Liquid'], -0.04, 0.2)],
          anchor: { x: -0.04, y: Y + 0.12, z: 0.2, r: 0.12 },
          chefLine: 'Tap the mould to pour in the juice!',
          praise: 'Into the fridge it goes!',
        },
        {
          bridge: [[j(['Jelly_Plate', ...mould, 'Jelly_Liquid'])]],
          bridgeLines: ['Chilly! The fridge sets it fast here.'],
          ready: [j(['Jelly_Plate', ...mould, 'Jelly_Liquid'])],
          done: [j(['Jelly_Plate', 'Jelly_Set'])],
          anchor: { x: 0, y: Y + 0.1, z: 0.18, r: 0.12 },
          chefLine: 'Tap to turn it out. Wobble wobble!',
          praise: 'It wobbles! So pretty.',
        },
      ];
    }
    case 'whole_apple_pie': {
      const wp = (only: string[], x = 0, z = 0.18, extra: Partial<PropSpec> = {}): PropSpec => ({
        key: 'wpie', model: 'Dish_WholePie', x, z, scale: 1.6, tint: 'apple', appleSized: true, only: ['WholePie_Plate', ...only], ...extra,
      });
      const corer: PropSpec = { key: 'corer', model: 'Corer', x: 0, z: 0.18, y: 0.29, scale: 1.5 };
      return [
        {
          bridge: [[wp(['WholePie_Body', 'WholePie_Stem'], 0, 0.18, { fx: 'sparkle' })]],
          bridgeLines: ['Washed! The pastry is ready too.'],
          ready: [wp(['WholePie_Body', 'WholePie_Stem']), corer],
          done: [wp(['WholePie_Body', 'WholePie_Hole'])],
          anchor: { x: 0, y: Y + 0.2, z: 0.18, r: 0.12 },
          chefLine: 'Tap to push the corer down. The apple stays whole!',
          praise: 'Cored, and still whole!',
        },
        {
          bridge: [[wp(['WholePie_Body', 'WholePie_Hole'])]],
          bridgeLines: ['A quick soak in syrup. Now the pastry!'],
          ready: [wp(['WholePie_Body', 'WholePie_Hole'])],
          done: [wp(['WholePie_Pastry'])],
          anchor: { x: 0, y: Y + 0.14, z: 0.18, r: 0.13 },
          chefLine: 'Tap to wrap the apple in pastry!',
          praise: 'All tucked in, like a blanket!',
        },
        ovenStep(wp(['WholePie_Pastry'], -0.3, 0.26), wp(['WholePie_Baked'], -0.1, 0.24), 'A golden apple parcel!'),
      ];
    }
    case 'apple_daifuku': {
      const d = dish('daifuku', 'Dish_Daifuku', 1.7);
      const flat = ['Daifuku_Plate', 'Daifuku_Sheet'];
      return [
        cutStep('Apple_Dice', { chef: 'Swipe down to cut little cubes on the cue!', praise: 'Tiny cubes for the filling!' }),
        mixStep('Apple_Dice', 'MixBowl_Flour', 'MixBowl_Mochi', 'The apple cooks with sugar. Now rice flour and water for the mochi!',
          'Mix round and round. Two big circles!', 'Soft and stretchy mochi!'),
        {
          bridge: [[bowl(['MixBowl_Mochi'], 0.36, 0.06, 1.0), d(flat, -0.04, 0.2)]],
          bridgeLines: ['The warm mochi is patted flat. Here’s sweet azuki too!'],
          ready: [bowl(['MixBowl_Mochi'], 0.36, 0.06, 1.0), d(flat, -0.04, 0.2)],
          done: [bowl([], 0.36, 0.06, 1.0), d([...flat, 'Daifuku_Fill'], -0.04, 0.2)],
          anchor: { x: -0.04, y: Y + 0.04, z: 0.2, r: 0.13 },
          chefLine: 'Tap the mochi to add apple and azuki!',
          praise: 'Sweet and tangy together!',
        },
        {
          bridge: [[d([...flat, 'Daifuku_Fill'], -0.04, 0.2)]],
          bridgeLines: ['Now wrap it up.'],
          ready: [d([...flat, 'Daifuku_Fill'], -0.04, 0.2)],
          done: [d(['Daifuku_Plate', 'Daifuku_Ball'], -0.04, 0.2)],
          anchor: { x: -0.04, y: Y + 0.07, z: 0.2, r: 0.13 },
          chefLine: 'Tap to wrap it into a ball!',
          praise: 'Soft and round. Perfect daifuku!',
        },
      ];
    }
    case 'apple_dorayaki': {
      const d = dish('dora', 'Dish_Dorayaki', 1.7);
      return [
        cutStep('Apple_Slices', { praise: 'Nice thin slices!' }),
        mixStep('Apple_Slices', 'MixBowl_Lumps', 'MixBowl_Batter', 'The slices simmer in apple juice. Now the pancake batter!',
          'Mix the batter round and round!', 'Smooth batter, no lumps!'),
        {
          bridge: [[bowlAside(['MixBowl_Batter']), pan([])]],
          bridgeLines: ['The pan is hot!'],
          ready: [bowlAside(['MixBowl_Batter']), pan([])],
          done: [bowlAside(['MixBowl_Batter']), pan(['FP_Raw'])],
          anchor: PAN,
          chefLine: 'Tap the pan to pour a round pancake!',
          praise: 'A perfect circle!',
        },
        {
          bridge: [[bowlAside(['MixBowl_Batter']), pan(['FP_Raw'])]],
          bridgeLines: ['Wait for the bubbles…'],
          ready: [bowlAside(['MixBowl_Batter']), pan(['FP_Bubbly'])],
          done: [bowlAside(), pan(['FP_Cooked'])],
          anchor: PAN,
          chefLine: 'Bubbles! Tap to flip it on the cue!',
          praise: 'Golden brown! I’ll make one more.',
        },
        {
          bridge: [[...side('Apple_Slices'), d(['Dora_Plate', 'Dora_Bottom'], 0.06, 0.18)]],
          bridgeLines: ['Two pancakes are ready. Here comes the cream!'],
          ready: [...side('Apple_Slices'), d(['Dora_Plate', 'Dora_Bottom'], 0.06, 0.18)],
          done: [...side(), d(['Dora_Plate', 'Dora_Bottom', 'Dora_Fill', 'Dora_Top'], 0.06, 0.18)],
          anchor: { x: 0.06, y: Y + 0.06, z: 0.18, r: 0.14 },
          chefLine: 'Tap to add cream and apple, then the lid!',
          praise: 'A fluffy apple sandwich!',
        },
      ];
    }
    case 'apple_keema':
      return [
        cutStep('Apple_Dice', { skinOn: true, chef: 'Swipe down to dice the apple on the cue!', praise: 'Crunchy little cubes!' }),
        {
          bridge: [[...side('Apple_Dice'), pan([])]],
          bridgeLines: ['Onion and garlic are sizzling in the pan.'],
          ready: [...side('Apple_Dice'), pan([])],
          done: [...side(), pan(['FP_Veg'])],
          anchor: PAN,
          chefLine: 'Tap the pan to add apple and vegetables!',
          praise: 'Sizzle! Smells yummy!',
        },
        {
          bridge: [[...side(), pan(['FP_Veg', 'FP_Mince'], 0.02, 0.14, 'steam')]],
          bridgeLines: ['In goes the mince, then tomato and water.'],
          ready: [...side(), pan(['FP_Veg', 'FP_Mince'], 0.02, 0.14, 'steam')],
          done: [...side(), pan(['FP_Stew'], 0.02, 0.14, 'steam')],
          anchor: PAN,
          tool: 'spoon',
          chefLine: 'Stir round and round. Two big circles!',
          praise: 'Bubbling nicely!',
        },
        {
          bridge: [[...side(), pan(['FP_Stew', 'FP_Roux'])]],
          bridgeLines: ['Here’s the curry roux.'],
          ready: [...side(), pan(['FP_Stew', 'FP_Roux'])],
          done: [...side(), pan(['FP_Curry'])],
          anchor: PAN,
          chefLine: 'Tap to melt in the curry roux on the cue!',
          praise: 'Thick and mild. Just right!',
        },
      ];
    case 'apple_shumai': {
      const s = dish('shumai', 'Dish_Shumai', 1.6);
      return [
        {
          ...cutStep('Apple_Dice', { chef: 'Swipe down to chop it small on the cue!', praise: 'Tiny bits for the filling!' }),
          bridge: [[board(), wholeApple(0, 0.2, { fx: 'sparkle' })], [board(), onBoard('wedges', 'Apple_Wedges')]],
          bridgeLines: ['Washed and cored…', 'The apple is cooked soft. Let’s chop it!'],
          ready: [board(), onBoard('wedges', 'Apple_Wedges')],
        },
        mixStep('Apple_Dice', 'MixBowl_FillingRaw', 'MixBowl_Filling', 'Mince, onion and ginger are ready.',
          'Mix the filling round and round!', 'All mixed up!'),
        {
          bridge: [[bowlAside(['MixBowl_Filling']), s(['Shumai_Basket'], 0.06, 0.16)]],
          bridgeLines: ['Crunchy somen noodles make the coat.'],
          ready: [bowlAside(['MixBowl_Filling']), s(['Shumai_Basket'], 0.06, 0.16)],
          done: [bowlAside(), s(['Shumai_Basket', 'Shumai_Raw'], 0.06, 0.16)],
          anchor: { x: 0.06, y: Y + 0.06, z: 0.16, r: 0.15 },
          chefLine: 'Tap the steamer to shape and coat the shumai!',
          praise: 'Look at their noodle coats!',
        },
        {
          bridge: [[s(['Shumai_Basket', 'Shumai_Lid'], 0.06, 0.16, { fx: 'steam' })]],
          bridgeLines: ['Lid on! Steaming goes extra fast here.'],
          ready: [s(['Shumai_Basket', 'Shumai_Lid'], 0.06, 0.16, { fx: 'steam' })],
          done: [s(['Shumai_Basket', 'Shumai_Cooked'], 0.06, 0.16)],
          anchor: { x: 0.06, y: Y + 0.15, z: 0.16, r: 0.14 },
          chefLine: 'Watch the steam. Tap the lid on the cue!',
          praise: 'Fluffy and juicy!',
        },
      ];
    }
    case 'apple_cheesecake': {
      const rc = (only: string[], x = 0.08, z = 0.1, scale = 1.3, fx?: PropSpec['fx']): PropSpec => ({
        key: 'rc', model: 'RiceCooker', x, z, scale, tint: 'apple', only: ['RC_Body', 'RC_Button', ...only], fx,
      });
      const cake = dish('cake', 'Dish_Cheesecake', 1.6);
      const POT = { x: 0.08, y: Y + 0.19, z: 0.1, r: 0.14 };
      return [
        cutStep('Apple_Slices', { praise: 'Even slices!' }),
        mixStep('Apple_Slices', 'MixBowl_Lumps', 'MixBowl_Cheese', 'The slices cook soft. Cream cheese, eggs and sugar are ready!',
          'Mix the batter round and round!', 'Creamy and smooth!'),
        {
          bridge: [[bowlAside(['MixBowl_Cheese']), rc(['RC_LidOpen', 'RC_Pot'])]],
          bridgeLines: ['Here’s the rice cooker!'],
          ready: [bowlAside(['MixBowl_Cheese']), rc(['RC_LidOpen', 'RC_Pot'])],
          done: [bowlAside(['MixBowl_Cheese']), rc(['RC_LidOpen', 'RC_Pot', 'RC_Apples'])],
          anchor: POT,
          chefLine: 'Tap the pot to lay the apples in a flower!',
          praise: 'A pretty apple flower!',
        },
        {
          bridge: [[bowlAside(['MixBowl_Cheese']), rc(['RC_LidOpen', 'RC_Pot', 'RC_Apples'])]],
          bridgeLines: ['Now the batter.'],
          ready: [bowlAside(['MixBowl_Cheese']), rc(['RC_LidOpen', 'RC_Pot', 'RC_Apples'])],
          done: [bowlAside(), rc(['RC_Lid'])],
          anchor: POT,
          chefLine: 'Tap to pour in the batter and close the lid!',
          praise: 'Beep! The cooker is on.',
        },
        {
          bridge: [[rc(['RC_Lid', 'RC_Steam'], 0.08, 0.1, 1.3, 'steam')]],
          bridgeLines: ['It bakes, then cools down. Done!'],
          ready: [rc(['RC_Lid'])],
          done: [rc(['RC_LidOpen', 'RC_Pot'], 0.36, 0.04, 1.0), cake(['Cheesecake_Plate', 'Cheesecake_Cake', 'Cheesecake_Apples'], -0.08, 0.22)],
          anchor: { x: 0.08, y: Y + 0.26, z: 0.1, r: 0.14 },
          chefLine: 'Tap to turn the cake out onto the plate!',
          praise: 'Apples on top. Ta-da!',
        },
      ];
    }
    case 'apple_pork': {
      const pork = (only: string[], x = 0.12, z = 0.18, scale = 1.6): PropSpec => ({ key: 'pork', model: 'PorkPrep', x, z, y: BOARD_H, scale, tint: 'apple', only });
      const main = board(0.12, 0.18);
      return [
        cutStep('Apple_Slices', { lines: ['The potato is mashed. Wash, peel and core…', 'Your turn to slice!'], praise: 'Nice slices!' }),
        {
          bridge: [[...side('Apple_Slices'), main, pork(['Pork_Strips'])]],
          bridgeLines: ['Thin slices of pork, ready to roll.'],
          ready: [...side('Apple_Slices'), main, pork(['Pork_Strips'])],
          done: [...side(), main, pork(['Pork_Strips', 'Pork_Fill'])],
          anchor: { x: 0.12, y: Y + 0.04, z: 0.18, r: 0.14 },
          chefLine: 'Tap the pork to add apple and potato!',
          praise: 'Ready to roll!',
        },
        {
          bridge: [[...side(), main, pork(['Pork_Strips', 'Pork_Fill'])]],
          bridgeLines: ['Roll them up nice and tight.'],
          ready: [...side(), main, pork(['Pork_Strips', 'Pork_Fill'])],
          done: [...side(), main, pork(['Pork_Rolled'])],
          anchor: { x: 0.12, y: Y + 0.04, z: 0.18, r: 0.14 },
          chefLine: 'Tap to roll them up!',
          praise: 'Three neat rolls!',
        },
        {
          bridge: [[...side(), pork(['Pork_Rolled'], -0.38, 0.3, 1.2), pan([])]],
          bridgeLines: ['The pan is hot!'],
          ready: [...side(), pork(['Pork_Rolled'], -0.38, 0.3, 1.2), pan([])],
          done: [...side(), pan(['FP_Rolls'])],
          anchor: PAN,
          chefLine: 'Tap the pan to lay the rolls in!',
          praise: 'Sizzle sizzle!',
        },
        {
          bridge: [[...side(), pan(['FP_Rolls'], 0.02, 0.14, 'steam')]],
          bridgeLines: ['They brown all over. Here comes the apple sauce!'],
          ready: [...side(), pan(['FP_Rolls'], 0.02, 0.14, 'steam')],
          done: [...side(), pan(['FP_RollsCooked'])],
          anchor: PAN,
          chefLine: 'Tap to pour on the sauce on the cue!',
          praise: 'Shiny and golden!',
        },
      ];
    }
    case 'red_flesh_tart': {
      const t = dish('tart', 'Dish_PinkTart', 1.7, 'jam');
      const ring = ['PinkTart_Plate', 'PinkTart_Ring'];
      const full = [...ring, 'PinkTart_MFruit', 'PinkTart_MMousse', 'PinkTart_MBase'];
      return [
        cutStep('Apple_Dice', { skinOn: true, lines: ['Washed and cored. Pink apples are the best for this!'], chef: 'Swipe down to cut it into pieces on the cue!', praise: 'Look at that colour!' }),
        {
          bridge: [[...side('Apple_Dice'), t(ring, 0.06, 0.2)]],
          bridgeLines: ['The pieces cook into a pink compote and cool.'],
          ready: [...side('Apple_Dice'), t(ring, 0.06, 0.2)],
          done: [...side(), t([...ring, 'PinkTart_MFruit'], 0.06, 0.2)],
          anchor: { x: 0.06, y: Y + 0.06, z: 0.2, r: 0.13 },
          chefLine: 'Tap the mould to spoon in the fruit!',
          praise: 'A shiny pink layer!',
        },
        {
          bridge: [[t([...ring, 'PinkTart_MFruit'], 0.36, 0.06, { scale: 1.2 }), bowl(['MixBowl_MousseRaw'])]],
          bridgeLines: ['Now a yogurt mousse!'],
          ready: [t([...ring, 'PinkTart_MFruit'], 0.36, 0.06, { scale: 1.2 }), bowl(['MixBowl_MousseRaw'])],
          done: [t([...ring, 'PinkTart_MFruit'], 0.36, 0.06, { scale: 1.2 }), bowl(['MixBowl_Mousse'])],
          anchor: BOWL,
          tool: 'spoon',
          chefLine: 'Mix round and round until it’s all pink!',
          praise: 'Fluffy pink mousse!',
        },
        {
          bridge: [[bowlAside(['MixBowl_Mousse']), t([...ring, 'PinkTart_MFruit'], 0.06, 0.2)]],
          bridgeLines: ['The biscuit base is ready.'],
          ready: [bowlAside(['MixBowl_Mousse']), t([...ring, 'PinkTart_MFruit'], 0.06, 0.2)],
          done: [bowlAside(), t(full, 0.06, 0.2)],
          anchor: { x: 0.06, y: Y + 0.08, z: 0.2, r: 0.13 },
          chefLine: 'Tap to add the mousse and the biscuit base!',
          praise: 'Layer, layer, layer!',
        },
        {
          bridge: [[t(full, 0.06, 0.2)]],
          bridgeLines: ['Into the fridge to set. Chilly!'],
          ready: [t(full, 0.06, 0.2)],
          done: [t(['PinkTart_Plate', 'PinkTart_Done'], 0.06, 0.2)],
          anchor: { x: 0.06, y: Y + 0.1, z: 0.2, r: 0.13 },
          chefLine: 'Tap to lift off the mould!',
          praise: 'A pink tart! So pretty!',
        },
      ];
    }
    case 'festival_pie': {
      const pie = dish('fpie', 'Dish_FestivalPie', 1.25, 'none');
      const three = (model: string, x0: number, z0: number, s: number): PropSpec[] =>
        [-1, 0, 1].map((k, i) => onBoard(i ? `apple${i}` : 'apple', model, x0 + k * 0.13, z0, { appleSized: model === 'Apple', scale: FOOD * s }));
      const cooked = ['Festival_Tin', 'Festival_Shell'];
      return [
        {
          bridge: [[board(), ...three('Apple', 0, 0.2, 0.62)]],
          bridgeLines: ['Three apples for the big festival!'],
          ready: [board(), ...three('Apple', 0, 0.2, 0.62)],
          done: [board(), ...three('Apple_Slices', 0, 0.2, 0.55)],
          anchor: KNIFE,
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Swipe down to cut all three on the cue!',
          praise: 'Three piles of slices!',
        },
        {
          bridge: [[...side('Apple_Slices'), pan([])]],
          bridgeLines: ['Each apple gets its own little batch.'],
          ready: [...side('Apple_Slices'), pan([])],
          done: [...side(), pan(['FP_Three'])],
          anchor: PAN,
          chefLine: 'Tap the pan to add all three batches!',
          praise: 'Red, gold and pink!',
        },
        {
          bridge: [[...side(), pan(['FP_Three'], 0.02, 0.14, 'steam')]],
          bridgeLines: ['Butter and sugar go in too.'],
          ready: [...side(), pan(['FP_Three'], 0.02, 0.14, 'steam')],
          done: [...side(), pan(['FP_ThreeCooked'])],
          anchor: PAN,
          tool: 'spoon',
          chefLine: 'Stir gently. Two big circles!',
          praise: 'Three sweet fillings!',
        },
        {
          bridge: [[pan(['FP_ThreeCooked'], 0.38, 0.06), pie(cooked)]],
          bridgeLines: ['The fillings cool. Here’s the pastry!'],
          ready: [pan(['FP_ThreeCooked'], 0.38, 0.06), pie(cooked)],
          done: [pan([], 0.38, 0.06), pie([...cooked, 'Festival_Fill', 'Festival_Top'])],
          anchor: { x: 0, y: Y + 0.06, z: 0.18, r: 0.15 },
          chefLine: 'Tap the pastry to fill it and add the lattice!',
          praise: 'A festival lattice!',
        },
        ovenStep(pie([...cooked, 'Festival_Fill', 'Festival_Top'], -0.3, 0.26),
          pie([...cooked, 'Festival_Fill', 'Festival_TopBaked', 'Festival_Flag'], -0.1, 0.24), 'The Festival Pie! Hooray!'),
      ];
    }
    default:
      throw new Error(`No journey stations for ${recipeId}`);
  }
}

/** Finished dish model shown on serve/result. */
export function journeyDish(recipeId: RecipeId): PropSpec {
  const d = (model: string, extra: Partial<PropSpec> = {}): PropSpec => ({ key: 'dish', model, x: 0, z: 0, tint: 'apple', ...extra });
  switch (recipeId) {
    case 'apple_kinton': return d('Dish_Kinton');
    case 'apple_jelly': return d('Dish_Jelly', { hide: ['Jelly_Cup', 'Jelly_Cubes', 'Jelly_Liquid'] });
    case 'whole_apple_pie': return d('Dish_WholePie', { appleSized: true, hide: ['WholePie_Body', 'WholePie_Stem', 'WholePie_Hole', 'WholePie_Pastry'] });
    case 'apple_daifuku': return d('Dish_Daifuku', { hide: ['Daifuku_Sheet', 'Daifuku_Fill'] });
    case 'apple_dorayaki': return d('Dish_Dorayaki');
    case 'apple_keema': return d('Dish_Keema');
    case 'apple_shumai': return d('Dish_Shumai', { hide: ['Shumai_Raw', 'Shumai_Lid'] });
    case 'apple_cheesecake': return d('Dish_Cheesecake');
    case 'apple_pork': return d('Dish_PorkRolls');
    case 'red_flesh_tart': return d('Dish_PinkTart', { tint: 'jam', hide: ['PinkTart_Ring', 'PinkTart_MFruit', 'PinkTart_MMousse', 'PinkTart_MBase'] });
    case 'festival_pie': return d('Dish_FestivalPie', { tint: 'none', hide: ['Festival_Top'] });
    default:
      throw new Error(`No journey dish for ${recipeId}`);
  }
}
