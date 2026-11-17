/**
 * Unlock schedule, stall levels and the deterministic, seeded order queue.
 * All functions are pure; "completed" = number of completed orders.
 */
import { APPLE_ORDER, EXPANSION_DATA, RECIPE_ORDER, apple, recipe, type AppleId, type RecipeId } from './content.ts';
import { EARLIEST_RANK_UPS, rankInfo, recipeRank, recipeUnlockAtFor } from './ranks.ts';
import { OJIICHAN_VISIT, REGULARS, nextDayStart } from './story.ts';

/**
 * Apple unlocks: completed-order threshold → ids. Five starters, then one new apple after every
 * completed order (the prototype's Kogyoku 3 / Alps Otome 6 / Bramley 9 / Kurenai no Yume 12 /
 * Chiyuki 15 keep their slots). The 100th apple arrives after order 95.
 */
export const APPLE_UNLOCKS: ReadonlyArray<{ at: number; ids: readonly AppleId[] }> = Object.freeze(
  EXPANSION_DATA.apple_unlocks.map((u) => ({ at: u.at, ids: [...u.ids] })),
);

/**
 * Recipe unlocks follow the player's rank history (see ranks.ts RANK_RECIPES). Functions below take
 * `rankUps`; omitted, they assume every rank challenge was passed as early as possible.
 */
const DEFAULT_RANK_UPS = EARLIEST_RANK_UPS;

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

/** Unlocked recipe ids (recipe order) after `completed` orders with this rank history. */
export function unlockedRecipes(completed: number, rankUps: readonly number[] = DEFAULT_RANK_UPS): RecipeId[] {
  const c = count(completed);
  return RECIPE_ORDER.filter((id) => {
    const at = recipeUnlockAtFor(id, rankUps);
    return at !== null && at <= c;
  });
}

/**
 * Items newly earned exactly when the completed count reaches `completedCount` (≥ 1).
 * Returns empty lists for 0 (starting items are not "earned") and for counts with no unlock.
 */
export function unlocksEarnedAt(
  completedCount: number,
  rankUps: readonly number[] = DEFAULT_RANK_UPS,
): { apples: AppleId[]; recipes: RecipeId[] } {
  if (!Number.isInteger(completedCount) || completedCount < 1) return { apples: [], recipes: [] };
  return {
    apples: APPLE_UNLOCKS.filter((u) => u.at === completedCount).flatMap((u) => [...u.ids]),
    recipes: RECIPE_ORDER.filter((id) => recipeUnlockAtFor(id, rankUps) === completedCount),
  };
}

/** Completed-order threshold at which an apple unlocks (0 = start). */
export function appleUnlockAt(appleId: string): number {
  const u = APPLE_UNLOCKS.find((x) => (x.ids as readonly string[]).includes(appleId));
  if (!u) throw new Error(`Unknown apple ${appleId}`);
  return u.at;
}
/** Completed-order count at which a recipe unlocks, or null while its rank is not reached. */
export function recipeUnlockAt(recipeId: string, rankUps: readonly number[] = DEFAULT_RANK_UPS): number | null {
  return recipeUnlockAtFor(recipeId, rankUps);
}

/** Child-facing lock text for a locked recipe, e.g. "After 8 orders" or "Rank: Cook". */
export function recipeLockText(recipeId: string, rankUps: readonly number[]): string {
  const at = recipeUnlockAtFor(recipeId, rankUps);
  return at === null ? `Rank: ${rankInfo(recipeRank(recipeId)).name}` : `After ${at} orders`;
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

/** Customer models: A Sota, B Yui, C Grandpa Kiyoshi, D Mei; O Ojiichan (ceremony only). */
export type CustomerId = 'A' | 'B' | 'C' | 'D' | 'O';
/** Models used for everyday customers. */
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
  /** A story visit: a regular (by id) or Ojiichan. The UI shows `visitorName` and fills {name}. */
  visit?: {
    who: string;
    visitorName: string;
    tagline: string;
    /** Bubble colour. */
    color: string;
    customerId: CustomerId;
    /** 1-based story visit and how many there are (Ojiichan: 1 of 1). */
    step: number;
    of: number;
  };
  /** An apple the visitor gives on this order (unlocked when it is served). */
  giftAppleId?: AppleId;
}

export const DEFAULT_SEED = 20261015;

/**
 * Demonstration orders after an apple delivery: each runs on the first free order once both the
 * apple has arrived and its recipe is unlocked (recipe intros go first).
 */
export const DEMO_ORDERS: ReadonlyArray<{ appleId: AppleId; recipeId: RecipeId }> = [
  { appleId: 'a094', recipeId: 'apple_jam' },
  { appleId: 'a091', recipeId: 'ringo_ame' },
  { appleId: 'a032', recipeId: 'apple_jam' },
  { appleId: 'a058', recipeId: 'apple_jam' },
  { appleId: 'a086', recipeId: 'rabbit_apples' },
];

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
  intro?: boolean;
  demoApple?: AppleId;
}
const queueCache = new Map<string, QueueEntry[]>();

/** Recipe whose intro order is `num` (it unlocked at completed = num − 1), if any. */
function introAt(num: number, rankUps: readonly number[]): RecipeId | undefined {
  return RECIPE_ORDER.find((id) => recipeUnlockAtFor(id, rankUps) === num - 1);
}

/** Build (and memoise) recipe choices for orders 1..n for a seed and rank history. */
function recipeQueue(seed: number, n: number, rankUps: readonly number[]): QueueEntry[] {
  const key = `${seed}|${rankUps.join(',')}`;
  let q = queueCache.get(key);
  if (!q) {
    q = [];
    if (queueCache.size > 32) queueCache.clear();
    queueCache.set(key, q);
  }
  while (q.length < n) {
    const num = q.length + 1;
    const prev = q[num - 2]?.recipeId;
    const done = new Set(q.filter((e) => e.demoApple).map((e) => e.demoApple));
    const demoFor = (recipeId?: RecipeId) => DEMO_ORDERS.find((d) => {
      if (done.has(d.appleId) || (recipeId && d.recipeId !== recipeId)) return false;
      const rAt = recipeUnlockAtFor(d.recipeId, rankUps);
      return rAt !== null && rAt <= num - 1 && appleUnlockAt(d.appleId) <= num - 1;
    });
    const intro = introAt(num, rankUps);
    if (intro) {
      // An apple already waiting for this recipe is shown off in its intro order.
      const demo = demoFor(intro);
      q.push(demo ? { recipeId: intro, intro: true, demoApple: demo.appleId } : { recipeId: intro, intro: true });
      continue;
    }
    const demo = demoFor();
    if (demo && demo.recipeId !== prev) {
      q.push({ recipeId: demo.recipeId, demoApple: demo.appleId });
      continue;
    }
    const available = unlockedRecipes(num - 1, rankUps);
    const next = introAt(num + 1, rankUps);
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

// ---------------------------------------------------------------------------
// Story visits (regulars, Ojiichan) laid over the queue
// ---------------------------------------------------------------------------

type StoryVisit =
  | { kind: 'regular'; regularIndex: number; visitIndex: number }
  | { kind: 'ojiichan' };
const visitCache = new Map<string, Map<number, StoryVisit>>();

/** Order on which Ojiichan visits: the first order of the day after reaching Golden Chef. */
export function ojiichanOrder(rankUps: readonly number[]): number | null {
  const g = rankUps[3];
  return g === undefined ? null : nextDayStart(g);
}

/**
 * Which orders are story visits. Visits never replace a recipe intro or an apple demo (they move
 * to the next free order), each regular's visits stay in order, and Ojiichan's visit comes first.
 * Earlier orders never change when a later rank-up is added.
 */
function storyVisits(seed: number, rankUps: readonly number[]): Map<number, StoryVisit> {
  const key = `${seed}|${rankUps.join(',')}`;
  const hit = visitCache.get(key);
  if (hit) return hit;
  const taken = new Map<number, StoryVisit>();
  const free = (m: number) => {
    const e = recipeQueue(seed, m, rankUps)[m - 1];
    return !e.intro && !e.demoApple && !taken.has(m);
  };
  const oj = ojiichanOrder(rankUps);
  if (oj !== null) {
    let m = oj;
    while (!free(m)) m++;
    taken.set(m, { kind: 'ojiichan' });
  }
  REGULARS.forEach((r, regularIndex) => {
    let last = 0;
    r.visits.forEach((v, visitIndex) => {
      let m = Math.max(v.at, last + 1);
      while (!free(m)) m++;
      taken.set(m, { kind: 'regular', regularIndex, visitIndex });
      last = m;
    });
  });
  if (visitCache.size > 32) visitCache.clear();
  visitCache.set(key, taken);
  return taken;
}

/** Fill {dish}; {name} is left for the UI (the core does not know the chef's name). */
const withDish = (line: string, recipeId: RecipeId) => line.replaceAll('{dish}', recipe(recipeId).name);

/**
 * Deterministic order for a 1-based order number. Only requests recipes unlocked by
 * completed = orderNumber − 1 under `rankUps`. The first order after a recipe unlocks introduces
 * it; demo orders (DEMO_ORDERS) follow apple deliveries. Other orders rotate unlocked recipes
 * (seeded, least-recently-requested, never the same recipe twice in a row when avoidable).
 */
export function orderForIndex(orderNumber: number, seed: number = DEFAULT_SEED, rankUps: readonly number[] = DEFAULT_RANK_UPS): Order {
  if (!Number.isInteger(orderNumber) || orderNumber < 1) throw new RangeError('orderNumber must be an integer ≥ 1');
  const entry = recipeQueue(seed, orderNumber, rankUps)[orderNumber - 1];
  const recipeId = entry.recipeId;
  const customerId = CUSTOMERS[(orderNumber - 1 + Math.floor(rand(seed, 0, 7) * 4)) % 4];
  const order: Order = { orderId: orderIdFor(orderNumber), orderNumber, recipeId, customerId, line: '' };
  if (entry.demoApple) {
    order.demo = true;
    order.suggestedAppleId = entry.demoApple;
    order.line = DEMO_LINES[entry.demoApple] ?? INTRO_LINES[recipeId];
  } else if (entry.intro) {
    order.line = INTRO_LINES[recipeId];
  } else {
    const lines = LINES[recipeId];
    order.line = lines[Math.floor(rand(seed, orderNumber, 2) * lines.length)];
  }
  if (entry.intro) order.intro = true;
  const visit = storyVisits(seed, rankUps).get(orderNumber);
  if (visit?.kind === 'ojiichan') {
    order.customerId = OJIICHAN_VISIT.customer as CustomerId;
    order.line = withDish(OJIICHAN_VISIT.line, recipeId);
    order.visit = { who: 'ojiichan', visitorName: 'Ojiichan', tagline: OJIICHAN_VISIT.tagline, color: OJIICHAN_VISIT.color,
      customerId: order.customerId, step: 1, of: 1 };
  } else if (visit) {
    const r = REGULARS[visit.regularIndex];
    const v = r.visits[visit.visitIndex];
    order.customerId = r.customer as CustomerId;
    order.line = withDish(v.line, recipeId);
    order.visit = { who: r.id, visitorName: r.name, tagline: r.tagline, color: r.color, customerId: order.customerId,
      step: visit.visitIndex + 1, of: r.visits.length };
    if (v.giftApple) order.giftAppleId = v.giftApple as AppleId;
  }
  return order;
}

/** An order for a custom recipe (e.g. migrated legacy save whose recipe differs from the queue). */
export function customOrder(
  orderNumber: number,
  recipeId: RecipeId,
  seed: number = DEFAULT_SEED,
  rankUps: readonly number[] = DEFAULT_RANK_UPS,
): Order {
  const base = orderForIndex(orderNumber, seed, rankUps);
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
