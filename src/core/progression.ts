/**
 * Unlock schedule, stall levels and the deterministic, seeded order queue.
 * All functions are pure; "completed" = number of completed orders.
 */
import { APPLE_ORDER, EXPANSION_DATA, RECIPE_ORDER, apple, recipe, type AppleId, type RecipeId } from './content.ts';

/**
 * Apple unlocks: completed-order threshold → ids. Five starters, then one new apple after every
 * completed order (the prototype's Kogyoku 3 / Alps Otome 6 / Bramley 9 / Kurenai no Yume 12 /
 * Chiyuki 15 keep their slots). The 100th apple arrives after order 95.
 */
export const APPLE_UNLOCKS: ReadonlyArray<{ at: number; ids: readonly AppleId[] }> = Object.freeze(
  EXPANSION_DATA.apple_unlocks.map((u) => ({ at: u.at, ids: [...u.ids] })),
);

/** Recipe unlocks: completed-order threshold → id. */
export const RECIPE_UNLOCKS: ReadonlyArray<{ at: number; id: RecipeId }> = [
  { at: 0, id: 'fresh_juice' },
  { at: 2, id: 'rabbit_apples' },
  { at: 4, id: 'apple_jam' },
  { at: 6, id: 'ringo_ame' },
  { at: 7, id: 'hirosaki_pie' },
  { at: 13, id: 'jam_toast' },
  { at: 19, id: 'yogurt_parfait' },
  { at: 25, id: 'baked_apple' },
  { at: 31, id: 'apple_compote' },
];

/** All 100 apples collected. */
export const COLLECTION_COMPLETE_AT = Math.max(...EXPANSION_DATA.apple_unlocks.map((u) => u.at));
export const STALL_LEVEL_THRESHOLDS = [5, 10, 15] as const;

const count = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Unlocked apple ids (prototype order) after `completed` orders. */
export function unlockedApples(completed: number): AppleId[] {
  const c = count(completed);
  const set = new Set(APPLE_UNLOCKS.filter((u) => u.at <= c).flatMap((u) => u.ids));
  return APPLE_ORDER.filter((id) => set.has(id));
}

/** Unlocked recipe ids (recipe order) after `completed` orders. */
export function unlockedRecipes(completed: number): RecipeId[] {
  const c = count(completed);
  const set = new Set(RECIPE_UNLOCKS.filter((u) => u.at <= c).map((u) => u.id));
  return RECIPE_ORDER.filter((id) => set.has(id));
}

/**
 * Items newly earned exactly when the completed count reaches `completedCount` (≥ 1).
 * Returns empty lists for 0 (starting items are not "earned") and for counts with no unlock.
 */
export function unlocksEarnedAt(completedCount: number): { apples: AppleId[]; recipes: RecipeId[] } {
  if (!Number.isInteger(completedCount) || completedCount < 1) return { apples: [], recipes: [] };
  return {
    apples: APPLE_UNLOCKS.filter((u) => u.at === completedCount).flatMap((u) => [...u.ids]),
    recipes: RECIPE_UNLOCKS.filter((u) => u.at === completedCount).map((u) => u.id),
  };
}

/** Completed-order threshold at which an apple unlocks (0 = start). */
export function appleUnlockAt(appleId: string): number {
  const u = APPLE_UNLOCKS.find((x) => (x.ids as readonly string[]).includes(appleId));
  if (!u) throw new Error(`Unknown apple ${appleId}`);
  return u.at;
}
/** Completed-order threshold at which a recipe unlocks (0 = start). */
export function recipeUnlockAt(recipeId: string): number {
  const u = RECIPE_UNLOCKS.find((x) => x.id === recipeId);
  if (!u) throw new Error(`Unknown recipe ${recipeId}`);
  return u.at;
}
/** Child-facing lock text for a locked card, e.g. "Arrives after 6 orders". */
export function unlockConditionText(appleId: string): string {
  const at = appleUnlockAt(appleId);
  return at === 0 ? 'Available from the start' : `Arrives after ${at} orders`;
}

/** Stall visual level: 0; 1 at ≥5; 2 at ≥10; 3 at ≥15 completed orders. */
export function stallLevel(completed: number): 0 | 1 | 2 | 3 {
  const c = count(completed);
  return (STALL_LEVEL_THRESHOLDS.filter((t) => c >= t).length as 0 | 1 | 2 | 3);
}

export function isCollectionComplete(completed: number): boolean {
  return count(completed) >= COLLECTION_COMPLETE_AT;
}

// ---------------------------------------------------------------------------
// Order queue
// ---------------------------------------------------------------------------

export type CustomerId = 'A' | 'B' | 'C' | 'D';
export const CUSTOMERS: readonly CustomerId[] = ['A', 'B', 'C', 'D'];

export interface Order {
  /** Stable id from the order number, e.g. 'o-0007'. */
  orderId: string;
  orderNumber: number;
  recipeId: RecipeId;
  customerId: CustomerId;
  /** What the customer says (kid-friendly; names the dish). */
  line: string;
  /** A hint only; the player may pick any unlocked apple. */
  suggestedAppleId?: AppleId;
  /** Demonstration order after an apple delivery. */
  demo?: boolean;
  /** First order after this recipe unlocked. */
  intro?: boolean;
}

export const DEFAULT_SEED = 20261015;

/** Scripted onboarding/demo orders (order number → recipe, suggested apple). */
export const SCRIPTED_ORDERS: Readonly<Record<number, { recipeId: RecipeId; intro?: boolean; demoApple?: AppleId }>> = {
  1: { recipeId: 'fresh_juice', intro: true },
  3: { recipeId: 'rabbit_apples', intro: true },
  // Kogyoku arrives after order 3 but jam unlocks after order 4 → demo scheduled with jam's intro.
  5: { recipeId: 'apple_jam', intro: true, demoApple: 'a094' },
  7: { recipeId: 'ringo_ame', intro: true, demoApple: 'a091' },
  8: { recipeId: 'hirosaki_pie', intro: true },
  10: { recipeId: 'apple_jam', demoApple: 'a032' },
  13: { recipeId: 'apple_jam', demoApple: 'a058' },
  16: { recipeId: 'rabbit_apples', demoApple: 'a086' },
  14: { recipeId: 'jam_toast', intro: true },
  20: { recipeId: 'yogurt_parfait', intro: true },
  26: { recipeId: 'baked_apple', intro: true },
  32: { recipeId: 'apple_compote', intro: true },
};

export function orderIdFor(orderNumber: number): string {
  return `o-${String(orderNumber).padStart(4, '0')}`;
}

/** Small deterministic hash → [0, 1). */
function rand(seed: number, n: number, salt: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(n | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const INTRO_LINES: Record<RecipeId, string> = {
  fresh_juice: 'Hello! Could I have a Fresh Apple Juice, please?',
  rabbit_apples: 'Something new! Could you make me Rabbit Apple Wedges?',
  apple_jam: 'I heard you make Apple Jam now! May I have a jar?',
  ringo_ame: 'Festival time! One Mini Candy Apple, please!',
  hirosaki_pie: 'Could I try your new Hirosaki Apple Pie?',
  jam_toast: 'Good morning! Could I have Apple Jam Toast?',
  yogurt_parfait: 'Something cool and crunchy! An Apple Yogurt Parfait, please.',
  baked_apple: 'Brr, it’s chilly! May I have a warm Baked Apple?',
  apple_compote: 'Could you make me some Shiny Apple Compote?',
};

const LINES: Record<RecipeId, readonly string[]> = {
  fresh_juice: [
    'One Fresh Apple Juice, please!',
    "I'm thirsty! Fresh Apple Juice, please.",
    'May I have a Fresh Apple Juice?',
  ],
  rabbit_apples: [
    'Rabbit Apple Wedges for my snack, please!',
    'Could I have some Rabbit Apple Wedges?',
    'I love the little ears! Rabbit Apple Wedges, please.',
  ],
  apple_jam: ['A jar of Apple Jam, please!', 'Apple Jam for my toast, please.', 'Could you make Apple Jam today?'],
  ringo_ame: ['One Mini Candy Apple, please!', 'A shiny Mini Candy Apple, please!', 'May I have a Mini Candy Apple?'],
  hirosaki_pie: [
    'A slice of Hirosaki Apple Pie, please!',
    'Hirosaki Apple Pie smells so good! One, please.',
    'Could I have Hirosaki Apple Pie?',
  ],
  jam_toast: ['Apple Jam Toast, please!', 'Toast with apple jam for breakfast, please.', 'May I have Apple Jam Toast?'],
  yogurt_parfait: ['One Apple Yogurt Parfait, please!', 'A crunchy Apple Yogurt Parfait, please.', 'Could I have a parfait with apples?'],
  baked_apple: ['One Baked Apple, please!', 'A warm Baked Apple, please.', 'Could I have a soft Baked Apple?'],
  apple_compote: ['Shiny Apple Compote, please!', 'Could I have some Apple Compote?', 'Apple Compote for dessert, please.'],
};

const DEMO_LINES: Partial<Record<AppleId, string>> = {
  a094: 'May I have Apple Jam? Maybe try the new tart Kogyoku apples!',
  a091: 'One Mini Candy Apple, please! Those tiny Alps Otome apples look just right.',
  a032: 'Apple Jam, please! The new Bramley apples are great for cooking.',
  a058: 'Could you make pink Apple Jam? The new Kurenai no Yume apples have pink flesh!',
  a086: 'Rabbit Apple Wedges, please! Have you tried the new Chiyuki apples?',
};

interface QueueEntry {
  recipeId: RecipeId;
}
const queueCache = new Map<number, QueueEntry[]>();

function scriptedAt(n: number) {
  return SCRIPTED_ORDERS[n];
}

/** Build (and memoise) recipe choices for orders 1..n for a seed. */
function recipeQueue(seed: number, n: number): QueueEntry[] {
  let q = queueCache.get(seed);
  if (!q) {
    q = [];
    if (queueCache.size > 16) queueCache.clear();
    queueCache.set(seed, q);
  }
  while (q.length < n) {
    const num = q.length + 1;
    const scripted = scriptedAt(num);
    if (scripted) {
      q.push({ recipeId: scripted.recipeId });
      continue;
    }
    const available = unlockedRecipes(num - 1);
    const prev = q[num - 2]?.recipeId;
    const next = scriptedAt(num + 1)?.recipeId;
    let candidates = available.filter((r) => r !== prev && r !== next);
    if (!candidates.length) candidates = available.filter((r) => r !== prev);
    if (!candidates.length) candidates = available;
    // Least-recently-requested first; seeded tie-break.
    const lastSeen = (r: RecipeId) => {
      for (let i = q.length - 1; i >= 0; i--) if (q[i].recipeId === r) return i;
      return -1;
    };
    const oldest = Math.min(...candidates.map(lastSeen));
    const pool = candidates.filter((r) => lastSeen(r) === oldest);
    const pick = pool[Math.floor(rand(seed, num, 1) * pool.length)];
    q.push({ recipeId: pick });
  }
  return q;
}

/**
 * Deterministic order for a 1-based order number. Only requests recipes unlocked by
 * completed = orderNumber − 1. Orders 1/3/5/7/8 introduce juice/rabbit/jam/candy/pie;
 * demos follow apple deliveries (5 Kogyoku jam, 7 Alps Otome candy, 10 Bramley jam,
 * 13 Kurenai no Yume pink jam, 16 Chiyuki rabbit). Other orders rotate unlocked recipes
 * (seeded, least-recently-requested, never the same recipe twice in a row when avoidable).
 */
export function orderForIndex(orderNumber: number, seed: number = DEFAULT_SEED): Order {
  if (!Number.isInteger(orderNumber) || orderNumber < 1) throw new RangeError('orderNumber must be an integer ≥ 1');
  const q = recipeQueue(seed, orderNumber);
  const recipeId = q[orderNumber - 1].recipeId;
  const scripted = scriptedAt(orderNumber);
  const customerId = CUSTOMERS[(orderNumber - 1 + Math.floor(rand(seed, 0, 7) * 4)) % 4];
  const order: Order = { orderId: orderIdFor(orderNumber), orderNumber, recipeId, customerId, line: '' };
  if (scripted?.demoApple) {
    order.demo = true;
    order.suggestedAppleId = scripted.demoApple;
    order.line = DEMO_LINES[scripted.demoApple] ?? INTRO_LINES[recipeId];
  } else if (scripted?.intro) {
    order.line = INTRO_LINES[recipeId];
  } else {
    const lines = LINES[recipeId];
    order.line = lines[Math.floor(rand(seed, orderNumber, 2) * lines.length)];
  }
  if (scripted?.intro) order.intro = true;
  return order;
}

/** An order for a custom recipe (e.g. migrated legacy save whose recipe differs from the queue). */
export function customOrder(orderNumber: number, recipeId: RecipeId, seed: number = DEFAULT_SEED): Order {
  const base = orderForIndex(orderNumber, seed);
  if (base.recipeId === recipeId) return base;
  return {
    orderId: base.orderId,
    orderNumber,
    recipeId,
    customerId: base.customerId,
    line: `${LINES[recipeId][0]}`,
  };
}

/** Names for UI convenience. */
export function describeUnlocks(u: { apples: readonly string[]; recipes: readonly string[] }): string[] {
  return [...u.apples.map((id) => apple(id).nameEn), ...u.recipes.map((id) => recipe(id).name)];
}
