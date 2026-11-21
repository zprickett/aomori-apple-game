/**
 * Declarative cooking "stage" for each playable recipe: which props are on the counter, in
 * which food state, before (bridge frames), during (ready) and after (done) each timed action.
 * Every timed step has a matching before/after food state; a timeout never creates the "after"
 * state until Retry or Continue-with-help resolves it.
 */
import type { RecipeId } from '../core/content.ts';
import { isJourneyRecipe } from '../core/ranks.ts';
import { journeyDish, journeyStages } from './stationsJourney.ts';

import { BOARD_H, COUNTER_Y, FOOD, board, onBoard, peeled, wholeApple, type PropSpec, type StepStage } from './stationKit.ts';

export { BOARD_H, COUNTER_Y, FOOD, OVEN_BUTTON, board, onBoard, oven, peeled, wholeApple } from './stationKit.ts';
export type { PropSpec, StepStage } from './stationKit.ts';

const Y = COUNTER_Y;



/** Microwave on the counter and its button anchor (shared by baked apple and compote). */
const MW_S = 1.3;
const microwave = (x = 0.1, z = 0.1, scale = MW_S): PropSpec => ({ key: 'microwave', model: 'Microwave', x, z, scale });
const MW_BUTTON = { x: 0.1 + 0.145 * MW_S, y: Y + 0.087 * MW_S, z: 0.1 + 0.142 * MW_S, r: 0.05 };

export function recipeStages(recipeId: RecipeId): StepStage[] {
  if (isJourneyRecipe(recipeId)) return journeyStages(recipeId);
  switch (recipeId) {
    case 'jam_toast':
    case 'yogurt_parfait':
    case 'baked_apple':
    case 'apple_compote':
      return expansionStages(recipeId);
    case 'fresh_juice': {
      const glass = (only: string[]): PropSpec => ({ key: 'glass', model: 'Dish_Juice', x: 0.3, z: 0.3, only, tint: 'apple', scale: 1.1 });
      return [{
        bridge: [
          [board(), wholeApple(0, 0.2, { fx: 'sparkle' })],
          [board(), onBoard('chunks', 'Apple_Chunks')],
          [board(-0.42, 0.28), { key: 'juicer', model: 'Juicer', x: 0, z: 0.14, scale: 1.25, hide: [] }, glass(['Juice_Coaster', 'Juice_Glass', 'Juice_Emblem'])],
        ],
        bridgeLines: ['First I wash and core your apple…', 'Chop, chop! Into the juicer it goes.', 'All loaded!'],
        ready: [board(-0.42, 0.28), { key: 'juicer', model: 'Juicer', x: 0, z: 0.14, scale: 1.25, tint: 'apple' }, glass(['Juice_Coaster', 'Juice_Glass', 'Juice_Emblem'])],
        done: [board(-0.42, 0.28), { key: 'juicer', model: 'Juicer', x: 0, z: 0.14, scale: 1.25, hide: ['Juicer_Chunks'] }, glass(['Juice_Coaster', 'Juice_Glass', 'Juice_Emblem', 'Juice_Fill', 'Juice_Straw', 'Juice_Garnish'])],
        anchor: { x: 0, y: Y + 0.12 * 1.25, z: 0.14 + 0.11 * 1.25, r: 0.06 },
        cue: 'juicer',
        chefLine: 'Press the big red button when the marker hits the gold!',
        praise: 'Listen to it whirr! Lovely fresh juice.',
      }];
    }
    case 'rabbit_apples':
      return [
        {
          bridge: [[board(), wholeApple(0, 0.2, { fx: 'sparkle' })]],
          bridgeLines: ['A quick wash… sparkly clean!'],
          ready: [board(), wholeApple()],
          done: [board(), onBoard('wedges', 'Apple_Wedges')],
          anchor: { x: 0, y: Y + BOARD_H + 0.11, z: 0.2, r: 0.12 },
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Slice straight down the middle, right on the cue!',
          praise: 'Neat wedges! I’ll pop the core out.',
        },
        {
          bridge: [[board(), onBoard('wedges', 'Apple_Wedges', 0, 0.2, { fx: 'sparkle' })]],
          bridgeLines: ['Core out! Now for the bunny ears…'],
          ready: [board(), onBoard('wedges', 'Apple_Wedges')],
          done: [board(), onBoard('rabbits', 'Rabbit_Wedges')],
          anchor: { x: 0, y: Y + BOARD_H + 0.07, z: 0.17, r: 0.14 },
          swipeAxis: 'h', tool: 'knife',
          chefLine: 'Swipe across the peel to cut the rabbit ears!',
          praise: 'Hop hop! Look at those ears!',
        },
      ];
    case 'apple_jam': {
      const pot = (only: string[], x = 0.36, z = 0.12, fx?: PropSpec['fx']): PropSpec => ({ key: 'pot', model: 'Pot', x, z, only: ['Pot_Body', 'Stove', ...only], tint: 'jam', fx });
      return [
        {
          bridge: [[board(), wholeApple()], [board(), peeled(), pot([])]],
          bridgeLines: ['I’ll peel and core it, then weigh it…', 'Ready for chopping!'],
          ready: [board(), peeled(), pot([])],
          done: [board(), onBoard('dice', 'Apple_Dice'), pot([])],
          anchor: { x: 0, y: Y + BOARD_H + 0.1, z: 0.2, r: 0.12 },
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Swipe down to cut little pieces — on the cue!',
          praise: 'Tiny pieces cook down beautifully.',
        },
        {
          bridge: [[board(-0.36, 0.28), onBoard('dice', 'Apple_Dice', -0.36, 0.28), pot([], 0.04, 0.12)]],
          bridgeLines: ['Fruit and sugar are measured out.'],
          ready: [board(-0.36, 0.28), onBoard('dice', 'Apple_Dice', -0.36, 0.28), pot([], 0.04, 0.12)],
          done: [board(-0.36, 0.28), pot(['Pot_Dice'], 0.04, 0.12)],
          anchor: { x: 0.04, y: Y + 0.16, z: 0.12, r: 0.14 },
          chefLine: 'Tap the pot to tip everything in!',
          praise: 'Plop! In they go.',
        },
        {
          bridge: [[board(-0.36, 0.28), pot(['Pot_Dice', 'Pot_Steam'], 0.04, 0.12, 'steam')], [board(-0.36, 0.28), pot(['Pot_Jam', 'Pot_Steam'], 0.04, 0.12, 'steam')]],
          bridgeLines: ['It sits a while, then simmers down…', 'Nearly jam! Time to add lemon juice.'],
          ready: [board(-0.36, 0.28), pot(['Pot_Jam', 'Pot_Steam'], 0.04, 0.12, 'steam')],
          done: [board(-0.36, 0.28), pot(['Pot_Jam'], 0.04, 0.12)],
          anchor: { x: 0.04, y: Y + 0.19, z: 0.12, r: 0.12 },
          tool: 'spoon',
          chefLine: 'Stir round and round — finish two big circles on the cue!',
          praise: 'Glossy and smooth. I’ll fill the jar!',
        },
      ];
    }
    case 'hirosaki_pie': {
      const pan = (only: string[], x = 0.36, z = 0.14, fx?: PropSpec['fx']): PropSpec => ({ key: 'pan', model: 'Pan', x, z, rotY: 0, only: ['Pan_Body', 'Pan_Stove', ...only], fx });
      const tin = (only: string[], x = 0, z = 0.18, extra: Partial<PropSpec> = {}): PropSpec => ({ key: 'tin', model: 'PieTin', x, z, scale: 1.25, only: ['PieTin_Tin', ...only], ...extra });
      return [
        {
          bridge: [[board(), wholeApple()], [board(), peeled()]],
          bridgeLines: ['Wash, peel, core… and the pastry is ready too.', 'Your turn to slice!'],
          ready: [board(), peeled()],
          done: [board(), onBoard('slices', 'Apple_Slices')],
          anchor: { x: 0, y: Y + BOARD_H + 0.1, z: 0.2, r: 0.12 },
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Swipe down to slice the apple on the cue!',
          praise: 'Thin, even slices — perfect for pie!',
        },
        {
          bridge: [[board(-0.38, 0.3), onBoard('slices', 'Apple_Slices', -0.38, 0.3, { scale: 0.8 }), pan([], 0.02, 0.14)]],
          bridgeLines: ['Butter’s melting in the pan…'],
          ready: [board(-0.38, 0.3), onBoard('slices', 'Apple_Slices', -0.38, 0.3, { scale: 0.8 }), pan([], 0.02, 0.14)],
          done: [board(-0.38, 0.3), pan(['Pan_Slices'], 0.02, 0.14)],
          anchor: { x: 0.02, y: Y + 0.1, z: 0.14, r: 0.14 },
          chefLine: 'Tap the pan to add apples, butter and sugar!',
          praise: 'Sizzle! Smells wonderful already.',
        },
        {
          bridge: [[board(-0.38, 0.3), pan(['Pan_Slices'], 0.02, 0.14, 'steam')]],
          bridgeLines: ['Let it bubble a little…'],
          ready: [board(-0.38, 0.3), pan(['Pan_Slices'], 0.02, 0.14, 'steam')],
          done: [board(-0.38, 0.3), pan(['Pan_Filling'], 0.02, 0.14)],
          anchor: { x: 0.02, y: Y + 0.1, z: 0.14, r: 0.12 },
          tool: 'spoon',
          chefLine: 'Stir gently in circles — finish on the cue!',
          praise: 'Golden filling! Now it cools down.',
        },
        {
          bridge: [[pan(['Pan_Filling'], 0.36, 0.08, 'steam'), tin(['PieTin_Shell'])]],
          bridgeLines: ['The filling cools and drains. Here’s the pastry case!'],
          ready: [pan(['Pan_Filling'], 0.38, 0.06), tin(['PieTin_Shell'])],
          done: [pan([], 0.38, 0.06), tin(['PieTin_Shell', 'PieTin_Filling', 'PieTin_Top'])],
          anchor: { x: 0, y: Y + 0.05, z: 0.18, r: 0.15 },
          chefLine: 'Tap the pastry to spoon the filling in!',
          praise: 'I’ll pop the lid on and brush it with egg.',
        },
        {
          bridge: [[tin(['PieTin_Shell', 'PieTin_Filling', 'PieTin_Top'], -0.3, 0.26), { key: 'oven', model: 'Oven', x: 0.1, z: 0.1, scale: 1.35 }]],
          bridgeLines: ['Into the oven! Baking goes extra fast here.'],
          ready: [{ key: 'oven', model: 'Oven', x: 0.1, z: 0.1, scale: 1.35 }],
          done: [{ key: 'oven', model: 'Oven', x: 0.36, z: 0.05, scale: 1.1 }, tin(['PieTin_Shell', 'PieTin_Filling', 'PieTin_TopBaked'], -0.1, 0.24)],
          anchor: { x: 0.1 + 0.115 * 1.35, y: Y + 0.08 * 1.35, z: 0.1 + 0.13 * 1.35, r: 0.05 },
          cue: 'oven',
          chefLine: 'Watch it turn golden — tap the button on the cue!',
          praise: 'Golden brown! What a pie!',
        },
      ];
    }
    case 'ringo_ame': {
      const stickApple = (x: number, z: number, y = 0.0): PropSpec[] => [
        { key: 'apple', model: 'Apple', x, z, y, tint: 'apple', appleSized: true, hide: ['Apple_Leaf'], scale: FOOD },
        { key: 'stick', model: 'Stick', x, z, y, appleSized: true, scale: FOOD },
      ];
      const tray = (x = 0, z = 0.2): PropSpec => ({ key: 'tray', model: 'CoolingTray', x, z, scale: 1.2 });
      const syrup = (only: string[], fx?: PropSpec['fx']): PropSpec => ({ key: 'syrup', model: 'SyrupPan', x: 0.04, z: 0.1, scale: 1.3, only: ['SyrupPan_Body', 'SyrupPan_Stove', 'Heat_Button', ...only], fx });
      const candy = (x: number, z: number, y = 0, paper = false): PropSpec => ({ key: 'candy', model: 'Dish_CandyApple', x, z, y, appleSized: true, tint: 'apple', scale: FOOD, only: paper ? ['Candy_Coat', 'Candy_Stick', 'Candy_Paper'] : ['Candy_Coat', 'Candy_Stick'] });
      return [
        {
          bridge: [[tray(), wholeApple(0, 0.2, { y: 0.032, fx: 'sparkle' })]],
          bridgeLines: ['Washed and dried — candy won’t stick to a wet apple!'],
          ready: [tray(), wholeApple(0, 0.2, { y: 0.032 })],
          done: [tray(), ...stickApple(0, 0.2, 0.032)],
          anchor: { x: 0, y: Y + 0.1, z: 0.2, r: 0.1 },
          chefLine: 'Tap the apple to push the stick in. It stays whole!',
          praise: 'Nice and straight!',
        },
        {
          bridge: [[...stickApple(-0.38, 0.3), syrup(['SyrupPan_Syrup', 'SyrupPan_Bubbles'], 'bubbles')]],
          bridgeLines: ['Sugar and water were mixed before heating. Now it bubbles — no stirring!'],
          ready: [...stickApple(-0.38, 0.3), syrup(['SyrupPan_Syrup', 'SyrupPan_Bubbles'], 'bubbles')],
          done: [...stickApple(-0.38, 0.3), syrup(['SyrupPan_Syrup'])],
          anchor: { x: 0.04, y: Y + 0.04 * 1.3, z: 0.1 + 0.115 * 1.3, r: 0.05 },
          cue: 'syrup',
          chefLine: 'Watch the syrup turn ruby red — tap the heat button on the cue!',
          praise: 'Just the right colour!',
        },
        {
          bridge: [[...stickApple(-0.25, 0.28), syrup(['SyrupPan_Syrup'])]],
          bridgeLines: ['Careful, it’s hot! I’ll hold the pan.'],
          ready: [...stickApple(-0.25, 0.28), syrup(['SyrupPan_Syrup'])],
          done: [candy(-0.25, 0.28, 0.0), syrup(['SyrupPan_Syrup'])],
          anchor: { x: 0.04, y: Y + 0.15, z: 0.1, r: 0.12 },
          chefLine: 'Tap the pan to dip — the apple twirls by itself!',
          praise: 'Shiny! What a glossy coat.',
        },
        {
          bridge: [[candy(0.3, 0.28, 0.06), tray(-0.02, 0.18)]],
          bridgeLines: ['Here’s the cooling tray with baking paper.'],
          ready: [candy(0.3, 0.28, 0.06), tray(-0.02, 0.18)],
          done: [tray(-0.02, 0.18), candy(-0.02, 0.18, 0.027, true)],
          anchor: { x: -0.02, y: Y + 0.03, z: 0.18, r: 0.14 },
          chefLine: 'Tap the tray to set it down to cool!',
          praise: 'It’s cooling into crunchy candy!',
        },
      ];
    }
  }
  throw new Error(`No stations for ${recipeId}`);
}

function expansionStages(recipeId: RecipeId): StepStage[] {
  switch (recipeId) {
    case 'jam_toast': {
      const toast = (only: string[]): PropSpec => ({ key: 'toast', model: 'Dish_Toast', x: -0.04, z: 0.18, scale: 1.9, tint: 'jam', only });
      const jar: PropSpec = { key: 'jar', model: 'Dish_Jam', x: 0.34, z: 0.06, scale: 0.95, tint: 'jam' };
      return [{
        bridge: [[toast(['Toast_Plate', 'Toast_Bread'])], [toast(['Toast_Plate', 'Toast_Bread']), jar]],
        bridgeLines: ['A thick slice of shokupan, toasted golden…', 'And here’s jam made from your apple!'],
        ready: [toast(['Toast_Plate', 'Toast_Bread']), jar],
        done: [toast(['Toast_Plate', 'Toast_Bread', 'Toast_Jam']), jar],
        anchor: { x: -0.04, y: Y + 0.075, z: 0.18, r: 0.12 },
        chefLine: 'Tap the toast on the cue to add the jam!',
        praise: 'I’ll spread it right to the edges. Yum!',
      }];
    }
    case 'yogurt_parfait': {
      const GX = 0.36, GZ = 0.06;
      const glass = (only: string[]): PropSpec => ({ key: 'glass', model: 'Dish_Parfait', x: GX, z: GZ, scale: 1.9, tint: 'apple', only: ['Parfait_Glass', ...only] });
      const glassAt = (y: number, r = 0.1) => ({ x: GX, y: Y + y, z: GZ, r });
      return [
        {
          bridge: [[board(), wholeApple(0, 0.2, { fx: 'sparkle' }), glass([])]],
          bridgeLines: ['Washed and cored! First, the yogurt.'],
          ready: [board(), wholeApple(), glass([])],
          done: [board(), wholeApple(), glass(['Parfait_Yogurt'])],
          anchor: glassAt(0.15),
          chefLine: 'Tap the glass to add the yogurt!',
          praise: 'Smooth and creamy!',
        },
        {
          bridge: [[board(), wholeApple(), glass(['Parfait_Yogurt'])]],
          bridgeLines: ['Now let’s cut the apple.'],
          ready: [board(), wholeApple(), glass(['Parfait_Yogurt'])],
          done: [board(), onBoard('dice', 'Apple_Dice'), glass(['Parfait_Yogurt'])],
          anchor: { x: 0, y: Y + 0.032 + 0.11, z: 0.2, r: 0.12 },
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Swipe down to cut the apple into little pieces!',
          praise: 'Perfect bite-size pieces!',
        },
        {
          bridge: [[board(), onBoard('dice', 'Apple_Dice'), glass(['Parfait_Yogurt'])]],
          bridgeLines: ['Into the glass they go…'],
          ready: [board(), onBoard('dice', 'Apple_Dice'), glass(['Parfait_Yogurt'])],
          done: [board(), glass(['Parfait_Yogurt', 'Parfait_Apple'])],
          anchor: glassAt(0.21),
          chefLine: 'Tap the glass to add the apple pieces!',
          praise: 'Look at those layers!',
        },
        {
          bridge: [[board(), glass(['Parfait_Yogurt', 'Parfait_Apple'])]],
          bridgeLines: ['Last of all, whipped cream!'],
          ready: [board(), glass(['Parfait_Yogurt', 'Parfait_Apple'])],
          done: [board(), glass(['Parfait_Yogurt', 'Parfait_Apple', 'Parfait_Top'])],
          anchor: glassAt(0.27),
          chefLine: 'Tap on the cue to swirl on the whipped cream!',
          praise: 'A perfect parfait!',
        },
      ];
    }
    case 'baked_apple': {
      const dish = (only: string[], x = 0, z = 0.18, extra: Partial<PropSpec> = {}): PropSpec => ({
        key: 'baked', model: 'Dish_BakedApple', x, z, scale: 1.7, tint: 'apple', appleSized: true, only: ['BakedApple_Plate', 'BakedApple_Body', ...only], ...extra,
      });
      const corer = (y: number): PropSpec => ({ key: 'corer', model: 'Corer', x: 0, z: 0.18, y, scale: 1.5 });
      return [
        {
          bridge: [[dish(['BakedApple_Stem'], 0, 0.18, { fx: 'sparkle' })]],
          bridgeLines: ['A quick wash… sparkly clean!'],
          ready: [dish(['BakedApple_Stem']), corer(0.27)],
          done: [dish(['BakedApple_Hole'])],
          anchor: { x: 0, y: Y + 0.2, z: 0.18, r: 0.12 },
          chefLine: 'Tap to push the corer down. The apple stays whole!',
          praise: 'A neat hole right through the middle!',
        },
        {
          bridge: [[dish(['BakedApple_Hole'])]],
          bridgeLines: ['Butter and sugar are ready.'],
          ready: [dish(['BakedApple_Hole'])],
          done: [dish(['BakedApple_Hole', 'BakedApple_Fill'])],
          anchor: { x: 0, y: Y + 0.21, z: 0.18, r: 0.1 },
          chefLine: 'Tap to fill the middle with butter and sugar!',
          praise: 'Filled to the top!',
        },
        {
          bridge: [[dish(['BakedApple_Hole', 'BakedApple_Fill'], -0.34, 0.3), microwave()]],
          bridgeLines: ['Into the microwave it goes!'],
          ready: [microwave()],
          done: [microwave(0.36, 0.04, 1.0), dish(['BakedApple_Hole', 'BakedApple_Glaze'], -0.1, 0.24)],
          anchor: MW_BUTTON,
          cue: 'microwave',
          chefLine: 'Watch it glow. Tap the button when it’s soft!',
          praise: 'Soft, sweet and bubbling!',
        },
      ];
    }
    case 'apple_compote': {
      const bowl = (only: string[], x = 0.02, z = 0.16): PropSpec => ({ key: 'bowl', model: 'Dish_Compote', x, z, scale: 1.4, tint: 'apple', only: ['Compote_Bowl', ...only] });
      const side = [board(-0.38, 0.3), onBoard('wedges', 'Apple_Wedges', -0.38, 0.3, { scale: 1.0 })];
      return [
        {
          bridge: [[board(), wholeApple(0, 0.2, { fx: 'sparkle' })]],
          bridgeLines: ['Washed and cored. The skin adds lovely colour!'],
          ready: [board(), wholeApple(), bowl([], 0.4, 0.06)],
          done: [board(), onBoard('wedges', 'Apple_Wedges'), bowl([], 0.4, 0.06)],
          anchor: { x: 0, y: Y + 0.032 + 0.11, z: 0.2, r: 0.12 },
          swipeAxis: 'v', tool: 'knife',
          chefLine: 'Swipe down to cut even wedges, on the cue!',
          praise: 'Nice even wedges!',
        },
        {
          bridge: [[...side, bowl([])]],
          bridgeLines: ['Sugar and a little butter are measured.'],
          ready: [...side, bowl([])],
          done: [board(-0.38, 0.3), bowl(['Compote_Raw', 'Compote_Sugar'])],
          anchor: { x: 0.02, y: Y + 0.05, z: 0.16, r: 0.13 },
          chefLine: 'Tap the dish to arrange the wedges and sugar!',
          praise: 'Arranged like a flower!',
        },
        {
          bridge: [[bowl(['Compote_Raw', 'Compote_Sugar', 'Compote_Lid'], -0.34, 0.3), microwave()]],
          bridgeLines: ['Lid on, into the microwave!'],
          ready: [microwave()],
          done: [microwave(0.36, 0.04, 1.0), bowl(['Compote_Glazed'], -0.1, 0.24)],
          anchor: MW_BUTTON,
          cue: 'microwave',
          chefLine: 'Tap the button when the apples turn shiny!',
          praise: 'Glossy and golden! I’ll let it rest.',
        },
      ];
    }
    default:
      throw new Error(`No stations for ${recipeId}`);
  }
}


/** Finished dish model shown on serve/result. */
export function dishProp(recipeId: RecipeId): PropSpec {
  if (isJourneyRecipe(recipeId)) return journeyDish(recipeId);
  switch (recipeId) {
    case 'fresh_juice': return { key: 'dish', model: 'Dish_Juice', x: 0, z: 0, tint: 'apple' };
    case 'rabbit_apples': return { key: 'dish', model: 'Dish_Rabbit', x: 0, z: 0, tint: 'apple' };
    case 'apple_jam': return { key: 'dish', model: 'Dish_Jam', x: 0, z: 0, tint: 'jam' };
    case 'hirosaki_pie': return { key: 'dish', model: 'Dish_Pie', x: 0, z: 0 };
    case 'ringo_ame': return { key: 'dish', model: 'Dish_CandyApple', x: 0, z: 0, tint: 'apple', appleSized: true, hide: ['Candy_Apple'] };
    case 'jam_toast': return { key: 'dish', model: 'Dish_Toast', x: 0, z: 0, tint: 'jam' };
    case 'yogurt_parfait': return { key: 'dish', model: 'Dish_Parfait', x: 0, z: 0, tint: 'apple', hide: ['Parfait_Crunch'] };
    case 'baked_apple': return { key: 'dish', model: 'Dish_BakedApple', x: 0, z: 0, tint: 'apple', appleSized: true, hide: ['BakedApple_Stem', 'BakedApple_Fill'] };
    case 'apple_compote': return { key: 'dish', model: 'Dish_Compote', x: 0, z: 0, tint: 'apple', hide: ['Compote_Raw', 'Compote_Sugar', 'Compote_Lid'] };
  }
  throw new Error(`No dish for ${recipeId}`);
}

export const DISH_DISPLAY_SCALE: Record<RecipeId, number> = {
  fresh_juice: 2.4, rabbit_apples: 2.1, apple_jam: 2.8, hirosaki_pie: 2.2, ringo_ame: 2.6,
  jam_toast: 2.3, yogurt_parfait: 2.0, baked_apple: 2.3, apple_compote: 2.2,
  apple_kinton: 2.4, apple_jelly: 2.4, whole_apple_pie: 2.0, apple_daifuku: 2.5, apple_dorayaki: 2.3, apple_keema: 2.0,
  apple_shumai: 2.1, apple_cheesecake: 2.1, apple_pork: 2.3, red_flesh_tart: 2.3, festival_pie: 2.2,
};

export const GESTURE_WORD: Record<string, string> = { tap: 'Tap', swipe: 'Swipe', circle: 'Circle' };
