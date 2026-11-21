/**
 * Golden Requests (Stage 2): multi-dish menus from visitors abroad. A request has 2–3 dishes,
 * each with an apple clue, and one twist for the whole menu. The kid picks an apple per dish; a
 * gold match fits both the clue and the twist. A Golden Seal needs every apple gold and a
 * menu-long combo that never breaks (every action Good or Perfect, no help).
 * Text lives in src/data/story.json `requests` and `stage2Intro`.
 */
import storyData from '../data/story.json';
import { apple, isRecipeId, type AppleInfo, type RecipeId } from './content.ts';
import type { StepResult } from './scoring.ts';

export type ClueKey = 'crisp' | 'redSkin' | 'yellowSkin' | 'greenSkin' | 'tart' | 'sweet' | 'extraJuicy' | 'aromatic' | 'pinkInside' | 'tiny' | 'big';
/** Apple-based twists. (Collector, Big party and Rush order come with the requests that use them.) */
export type TwistRule = 'notVerySweet' | 'pinkInside' | 'tiny' | 'big';

export interface RequestDish {
  recipe: RecipeId;
  name: string;
  clue: ClueKey[];
  clueText: string;
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
  twist: { kind: string; rule: TwistRule; name: string; text: string };
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

const RAW = storyData as unknown as { requests: GoldenRequest[]; stage2Intro: Record<string, string> };

export const REQUESTS: readonly GoldenRequest[] = Object.freeze(RAW.requests);
export const STAGE2_INTRO = Object.freeze({ ...RAW.stage2Intro }) as Readonly<{
  ojiichan1: string; whoosh: string; calling: string; ojiichan2: string; tip: string;
}>;
/** Seen-key for the Stage 2 intro. */
export const STAGE2_KEY = 'stage2';

for (const r of REQUESTS) for (const d of r.dishes) if (!isRecipeId(d.recipe)) throw new Error(`Request ${r.id}: unknown recipe ${d.recipe}`);

export function requestById(id: string): GoldenRequest {
  const r = REQUESTS.find((x) => x.id === id);
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
    case 'notVerySweet': return a.stats.sweetness < 5;
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

/** The letter waiting on the counter: the first request not finished yet, once Stage 2 has begun. */
export function waitingRequest(seen: readonly string[], records: Readonly<Record<string, RequestRecord>>): GoldenRequest | null {
  if (!seen.includes(STAGE2_KEY)) return null;
  return REQUESTS.find((r) => !records[r.id]?.done) ?? null;
}

export function sanitizeRequests(v: unknown): Record<string, RequestRecord> {
  const out: Record<string, RequestRecord> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!REQUESTS.some((r) => r.id === id) || typeof raw !== 'object' || raw === null) continue;
    const x = raw as Record<string, unknown>;
    const int = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0);
    out[id] = { done: x.done === true, seal: x.seal === true, plays: int(x.plays), bestStars: Math.min(9, int(x.bestStars)) };
  }
  return out;
}
