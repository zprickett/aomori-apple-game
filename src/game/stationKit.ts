/** Shared building blocks for the per-recipe counter stages (stations.ts, stationsJourney.ts). */
export const COUNTER_Y = 0.95;
/** Food is drawn a little larger than life so it reads on a phone. */
export const FOOD = 1.4;
const BOARD_S = 1.2;
export const BOARD_H = 0.032 * BOARD_S;

export interface PropSpec {
  key: string;
  model: string;
  x: number;
  z: number;
  y?: number; // offset above counter top
  rotY?: number;
  scale?: number;
  /** Only these child nodes visible (by name); others hidden. */
  only?: string[];
  hide?: string[];
  tint?: 'apple' | 'jam' | 'none';
  /** Multiply scale by the apple variety's size scale. */
  appleSized?: boolean;
  /** Extra visual effect while shown. */
  fx?: 'steam' | 'sparkle' | 'bubbles' | 'glow';
}

export interface StepStage {
  bridge: PropSpec[][];
  bridgeLines: string[];
  ready: PropSpec[];
  done: PropSpec[];
  /** Point (world) the gesture targets + its rough world radius. */
  anchor: { x: number; y: number; z: number; r: number };
  swipeAxis?: 'v' | 'h';
  tool?: 'knife' | 'spoon';
  /** Diegetic cue drawn in 3D while the step is active. */
  cue?: 'juicer' | 'syrup' | 'oven' | 'microwave' | 'none';
  /** What the chef says when the step is ready. */
  chefLine: string;
  /** What she says after a good result. */
  praise: string;
}

export const board = (x = 0, z = 0.2): PropSpec => ({ key: 'board', model: 'CuttingBoard', x, z, scale: BOARD_S });
export const onBoard = (key: string, model: string, x = 0, z = 0.2, extra: Partial<PropSpec> = {}): PropSpec => ({
  key, model, x, z, y: BOARD_H, tint: 'apple', scale: FOOD, ...extra,
});
export const wholeApple = (x = 0, z = 0.2, extra: Partial<PropSpec> = {}) => onBoard('apple', 'Apple', x, z, { appleSized: true, ...extra });
export const peeled = (x = 0, z = 0.2) => onBoard('peeled', 'Apple_Peeled', x, z, { appleSized: true });

const Y = COUNTER_Y;

/** The oven (pies) and its button anchor. */
export const oven = (x = 0.1, z = 0.1, scale = 1.35): PropSpec => ({ key: 'oven', model: 'Oven', x, z, scale });
export const OVEN_BUTTON = { x: 0.1 + 0.115 * 1.35, y: Y + 0.08 * 1.35, z: 0.1 + 0.13 * 1.35, r: 0.05 };
