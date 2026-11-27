/**
 * Golden Requests (Stage 2): multi-dish menus from visitors abroad. A request has 2–3 dishes,
 * each with an apple clue, and one twist for the whole menu. The kid picks an apple per dish; a
 * gold match fits both the clue and the twist. A Golden Seal needs every apple gold and a
 * menu-long combo that never breaks (every action Good or Perfect, no help).
 * Text lives in src/data/story.json `requests` and `stage2Intro`.
 */
import storyData from '../data/story.json';
import { apple, fitStars, isRecipeId, type AppleInfo, type FitStars, type RecipeId } from './content.ts';
import type { StepResult } from './scoring.ts';

export type ClueKey = 'crisp' | 'redSkin' | 'yellowSkin' | 'greenSkin' | 'tart' | 'sweet' | 'extraJuicy' | 'aromatic' | 'pinkInside' | 'tiny' | 'big';
/** The apple rule of a twist ('none' for Big party and Rush order, which change the cooking). */
export type TwistRule = 'none' | 'crisp' | 'notVerySweet' | 'naturallySweet' | 'lightSkin' | 'pinkInside' | 'tiny' | 'big';
export type TwistKind = 'picky' | 'colour' | 'size' | 'bigParty' | 'rush' | 'gentle';
export type CrewKind = 'sailors' | 'staff' | 'brigade' | 'astronauts' | 'bats' | 'royals' | 'footmen' | 'family' | 'penguins' | 'cousins' | 'rangers' | 'drummers';

export interface RequestDish {
  recipe: RecipeId;
  name: string;
  clue: ClueKey[];
  clueText: string;
  /** World Apple Feast: whose story the dish comes from (Customer letter). */
  from?: string;
}

export interface GoldenRequest {
  id: string;
  title: string;
  visitor: string;
  place: string;
  stamp: string;
  /** Customer model letter (Customer_<letter>). */
  customer: string;
  color: string;
  pin: { lat: number; lon: number };
  letter: string[];
  dishes: RequestDish[];
  twist: { kind: TwistKind; rule: TwistRule; name: string; text: string; /** Big party: rounds per dish. */ rounds?: number; /** Rush order: retries for the whole menu. */ retries?: number };
  /** The visitor's crew in the tasting panel. */
  crew: { kind: CrewKind; count: number };
  matchGood: string;
  matchMiss: string;
  tasting: string[];
  thanks: string;
  gift: { name: string; node: string };
}

/** Saved per request. */
export interface RequestRecord {
  done: boolean;
  seal: boolean;
  plays: number;
  /** Best total stars over the menu. */
  bestStars: number;
}

/** The World Apple Feast's ending text (story.json `feast.finale`). */
export interface FeastFinale {
  cheerTitle: string; cheerJa: string; fireworks: string; map: string;
  pageTitle: string; page: string[]; pageSign: string; season2: string; photo: string;
}

const RAW = storyData as unknown as { requests: GoldenRequest[]; stage2Intro: Record<string, string>; feast: GoldenRequest & { finale: FeastFinale } };

/** The twelve visitors' requests (the passport, the map, the gift shelf and the trophies). */
export const REQUESTS: readonly GoldenRequest[] = Object.freeze(RAW.requests);
/**
 * Stage 2's finale: the World Apple Feast. Ojiichan's gold letter arrives once all twelve requests
 * are done; every visitor returns for the Hirosaki Apple Festival. It plays like a request (five
 * dishes, the last one Festival Pie with three apples) and ends with fireworks, the map, the last
 * notebook page and a photo. Replayable from the passport. Not in REQUESTS.
 */
export const FEAST: GoldenRequest = Object.freeze(RAW.feast);
export const FEAST_FINALE: FeastFinale = Object.freeze(RAW.feast.finale);
export const FEAST_ID = FEAST.id;
export const isFeast = (id: string) => id === FEAST_ID;
/** Festival Pie is baked with three different apples. */
export const PIE_RECIPE: RecipeId = 'festival_pie';
export const PIE_APPLES = 3;
const ALL_REQUESTS: readonly GoldenRequest[] = [...REQUESTS, FEAST];
export const STAGE2_INTRO = Object.freeze({ ...RAW.stage2Intro }) as Readonly<{
  ojiichan1: string; whoosh: string; calling: string; ojiichan2: string; tip: string;
}>;
/** Seen-key for the Stage 2 intro. */
export const STAGE2_KEY = 'stage2';

for (const r of ALL_REQUESTS) for (const d of r.dishes) if (!isRecipeId(d.recipe)) throw new Error(`Request ${r.id}: unknown recipe ${d.recipe}`);

export function requestById(id: string): GoldenRequest {
  const r = ALL_REQUESTS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown request ${id}`);
  return r;
}

/** Skin colour family from the skin's base colour. */
export function skinFamily(a: AppleInfo): 'red' | 'yellow' | 'green' {
  const hex = a.skin.base.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min || 1e-6;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 30 || h >= 330) return 'red';
  if (h < 62) return 'yellow';
  return 'green';
}

export function clueHolds(a: AppleInfo, clue: ClueKey): boolean {
  switch (clue) {
    case 'crisp': return a.stats.raw_firmness >= 4;
    case 'tart': return a.stats.tartness >= 4;
    case 'sweet': return a.stats.sweetness >= 4;
    case 'extraJuicy': return a.stats.juiciness >= 5;
    case 'aromatic': return a.stats.aroma >= 4;
    case 'redSkin': return skinFamily(a) === 'red';
    case 'yellowSkin': return skinFamily(a) === 'yellow';
    case 'greenSkin': return skinFamily(a) === 'green';
    case 'pinkInside': return a.fleshRed;
    case 'tiny': return a.sizeLabel === 'S';
    case 'big': return a.sizeLabel === 'L';
  }
}

export function twistHolds(a: AppleInfo, rule: TwistRule): boolean {
  switch (rule) {
    case 'none': return true;
    case 'crisp': return a.stats.raw_firmness >= 4;
    case 'notVerySweet': return a.stats.sweetness < 5;
    case 'naturallySweet': return a.stats.sweetness >= 4;
    case 'lightSkin': return skinFamily(a) !== 'red';
    case 'pinkInside': return a.fleshRed;
    case 'tiny': return a.sizeLabel === 'S';
    case 'big': return a.sizeLabel === 'L';
  }
}

export interface AppleMatch {
  clue: boolean;
  twist: boolean;
  /** Fits the clue and the twist. */
  gold: boolean;
}

export function appleMatch(appleId: string, dish: RequestDish, rule: TwistRule): AppleMatch {
  const a = apple(appleId);
  const clue = dish.clue.every((c) => clueHolds(a, c));
  const twist = twistHolds(a, rule);
  return { clue, twist, gold: clue && twist };
}

/** Three different apples with one red, one yellow and one green skin: Festival Pie's best mix. */
export function threeColours(ids: readonly string[]): boolean {
  return ids.length === PIE_APPLES && new Set(ids).size === PIE_APPLES && new Set(ids.map((id) => skinFamily(apple(id)))).size === PIE_APPLES;
}

/** Festival Pie's apple fit with three apples: their average fit, +1 for red, yellow and green (top 3). */
export function pieFit(ids: readonly string[]): FitStars {
  if (!ids.length) return 0;
  const mean = ids.reduce((n, id) => n + fitStars(id, PIE_RECIPE), 0) / ids.length;
  return Math.max(0, Math.min(3, Math.round(mean) + (threeColours(ids) ? 1 : 0))) as FitStars;
}

/**
 * Gold matches of a menu, per dish. A Festival Pie dish needs its three apples (`pie`) and they
 * must be red, yellow and green; every other dish checks its one apple against the clue and twist.
 */
export function menuGolds(r: GoldenRequest, apples: readonly (string | null)[], pie: readonly string[] = []): boolean[] {
  return r.dishes.map((d, i) => (d.recipe === PIE_RECIPE
    ? threeColours(pie) && twistHoldsAll(pie, r.twist.rule)
    : apples[i] !== null && appleMatch(apples[i]!, d, r.twist.rule).gold));
}
const twistHoldsAll = (ids: readonly string[], rule: TwistRule) => ids.every((id) => twistHolds(apple(id), rule));

/** Menu-long combo: consecutive accepted actions graded Good or Perfect without help. */
export function comboKept(r: StepResult): boolean {
  return (r.grade === 'Perfect' || r.grade === 'Good') && !r.assisted;
}

/** Golden Seal: every apple a gold match and the combo never broke across the menu. */
export function sealEarned(golds: readonly boolean[], steps: readonly (readonly StepResult[])[]): boolean {
  return golds.length > 0 && golds.every(Boolean) && steps.every((d) => d.length > 0 && d.every(comboKept));
}

/** Current menu combo (count of the latest unbroken run). */
export function menuCombo(steps: readonly (readonly StepResult[])[]): number {
  let n = 0;
  for (const d of steps) for (const r of d) n = comboKept(r) ? n + 1 : 0;
  return n;
}

/** When the last request was finished (completed-order count) and which one it was. */
export interface RequestClock { at: number; last: string | null }
export const NO_CLOCK: Readonly<RequestClock> = Object.freeze({ at: 0, last: null });

/** Small deterministic hash → [0, 1). */
function hash01(n: number, salt: number): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Orders between letters: 4–7, varied (the n-th letter after the first). */
export function letterGap(n: number): number {
  return 4 + Math.floor(hash01(n, 11) * 4);
}

/** Total plays of every request. */
export const totalPlays = (records: Readonly<Record<string, RequestRecord>>) => Object.values(records).reduce((n, r) => n + r.plays, 0);

/**
 * The letter waiting on the counter once Stage 2 has begun: Captain Ingrid's straight away, then a
 * letter every 4–7 orders after the last request was finished. New visitors come first, in story
 * order; once all have visited, a returning visitor (never the same one twice in a row).
 */
export function waitingRequest(seen: readonly string[], records: Readonly<Record<string, RequestRecord>>, clock: RequestClock = NO_CLOCK, completed = 0, feastReady = true): GoldenRequest | null {
  if (!seen.includes(STAGE2_KEY)) return null;
  const plays = totalPlays(records);
  if (plays > 0 && completed < clock.at + letterGap(plays)) return null;
  const fresh = REQUESTS.find((r) => !records[r.id]?.done);
  if (fresh) return fresh;
  // All twelve visited: Ojiichan's gold letter for the World Apple Feast (once Festival Pie is known).
  if (!records[FEAST_ID]?.done && feastReady) return FEAST;
  const pool = REQUESTS.filter((r) => r.id !== clock.last);
  return pool[Math.floor(hash01(plays, 23) * pool.length)];
}

/** Cooking order of a menu: each dish, once per Big party round. */
export interface PlanItem { dish: number; round: number }
export function menuPlan(r: GoldenRequest): PlanItem[] {
  const rounds = r.twist.kind === 'bigParty' ? Math.max(1, r.twist.rounds ?? 2) : 1;
  return r.dishes.flatMap((_, dish) => Array.from({ length: rounds }, (_, k) => ({ dish, round: k + 1 })));
}
/** Name of the dish at this plan position, with its Big party round. */
export function requestDishName(id: string, planIndex: number): string {
  const r = requestById(id);
  const item = menuPlan(r)[planIndex];
  const name = r.dishes[item.dish].name;
  return r.twist.kind === 'bigParty' ? `${name} (round ${item.round})` : name;
}
/** Who stands at the counter: the visitor, or in the feast the friend whose dish is cooking. */
export function requestCustomer(id: string, planIndex: number): string {
  const r = requestById(id);
  if (!isFeast(id)) return r.customer;
  const from = r.dishes[menuPlan(r)[planIndex]?.dish ?? 0]?.from;
  // Ojiichan helps behind the counter, so Grandma Rosa orders the pie for everyone.
  return from && from !== 'O' ? from : 'R';
}
/** Big party: later rounds run faster (the ring closes sooner). */
export const ROUND_SPEED = 0.8;

/** Request menus are the big scorers: ×1.5, or ×2 with the Golden Seal. */
export const MENU_BONUS = 1.5;
export const SEAL_BONUS = 2;
export function menuPoints(dishPoints: readonly number[], seal: boolean): { base: number; total: number; mult: number } {
  const base = dishPoints.reduce((a, b) => a + b, 0);
  const mult = seal ? SEAL_BONUS : MENU_BONUS;
  return { base, total: Math.round(base * mult), mult };
}

export function sanitizeClock(v: unknown): RequestClock {
  if (typeof v !== 'object' || v === null) return { ...NO_CLOCK };
  const o = v as Record<string, unknown>;
  const at = typeof o.at === 'number' && Number.isInteger(o.at) && o.at >= 0 ? o.at : 0;
  const last = typeof o.last === 'string' && ALL_REQUESTS.some((r) => r.id === o.last) ? o.last : null;
  return { at, last };
}

export function sanitizeRequests(v: unknown): Record<string, RequestRecord> {
  const out: Record<string, RequestRecord> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!ALL_REQUESTS.some((r) => r.id === id) || typeof raw !== 'object' || raw === null) continue;
    const x = raw as Record<string, unknown>;
    const int = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0);
    out[id] = { done: x.done === true, seal: x.seal === true, plays: int(x.plays), bestStars: Math.min(9, int(x.bestStars)) };
  }
  return out;
}
