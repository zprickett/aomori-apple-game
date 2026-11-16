/**
 * Story content for the Golden Chef Journey (src/data/story.json): Ojiichan's letter and his
 * notebook, one page per rank. Each page has a riddle about the recipes that rank brings, a doodle,
 * maybe a postcard from his travels, and where the stall sets up (the painted backdrop).
 * Pure functions; the JSON is validated by the tests.
 */
import STORY_JSON from '../data/story.json';
import { MAX_RANK, type Rank } from './ranks.ts';

/** Painted backdrop ids (images live in src/game/backgrounds.ts). */
export const STORY_BACKDROPS = ['aomori_city', 'lake_towada', 'takayama_inari'] as const;
export type BackdropId = (typeof STORY_BACKDROPS)[number];

export interface Postcard {
  place: string;
  /** Flag emoji for the stamp. */
  stamp: string;
  art: string;
  text: string;
}

export interface NotebookPage {
  rank: Rank;
  title: string;
  riddle: string | null;
  riddleRecipes: string[];
  doodle: { art: string; caption: string };
  postcard: Postcard | null;
  backdrop: BackdropId;
  /** Where the stall is now (shown when it moves), or null. May contain {name}. */
  where: string | null;
}

export interface Letter {
  greeting: string;
  body: string[];
  signoff: string;
  signature: string;
}

export interface RegularVisit {
  /** Earliest order number for this visit (it moves later past intro/demo orders). */
  at: number;
  /** Order line; {dish} = the dish ordered, {name} = the chef (filled in by the UI). */
  line: string;
  /** An apple the regular gives the player on this visit. */
  giftApple?: string;
}

export interface Regular {
  id: string;
  /** Customer model id ('A'..'D'). */
  customer: string;
  name: string;
  visits: RegularVisit[];
}

/** Recognition after a rank-up, shown at the start of the next day. */
export interface NewsItem {
  rank: Rank;
  kind: 'note' | 'paper' | 'invite' | 'award';
  icon: string;
  title: string;
  text: string;
}

interface StoryData {
  grandpa: { name: string; nameJa: string; gloss: string };
  letter: Letter;
  pages: NotebookPage[];
  regulars: Regular[];
  news: NewsItem[];
  ojiichanVisit: { customer: string; line: string };
}

const STORY = STORY_JSON as unknown as StoryData;

export const GRANDPA = Object.freeze({ ...STORY.grandpa });
export const NOTEBOOK: readonly NotebookPage[] = Object.freeze([...STORY.pages].sort((a, b) => a.rank - b.rank));
export const REGULARS: readonly Regular[] = Object.freeze(STORY.regulars);
export const NEWS: readonly NewsItem[] = Object.freeze([...STORY.news].sort((a, b) => a.rank - b.rank));
/** Ojiichan comes home for the Golden Chef ceremony as a customer (model 'O'). */
export const OJIICHAN_VISIT = Object.freeze({ ...STORY.ojiichanVisit });

export function newsFor(rank: Rank): NewsItem | null {
  return NEWS.find((n) => n.rank === rank) ?? null;
}

/** First order of the day after the one in which `completed` orders were reached. */
export function nextDayStart(completed: number, dayLength = 5): number {
  return Math.ceil(completed / dayLength) * dayLength + 1;
}

/** Replace {name} with the chef's name ("Chef" when blank). */
export function withName(text: string, name: string): string {
  return text.replaceAll('{name}', name.trim() || 'Chef');
}

export function letterFor(name: string): Letter {
  const l = STORY.letter;
  return { greeting: withName(l.greeting, name), body: l.body.map((b) => withName(b, name)), signoff: l.signoff, signature: l.signature };
}

export function notebookPage(rank: Rank): NotebookPage {
  const p = NOTEBOOK.find((x) => x.rank === rank);
  if (!p) throw new Error(`No notebook page for rank ${rank}`);
  return p;
}

/** Pages open at this rank (page N opens on reaching rank N). */
export function openPages(rank: Rank): NotebookPage[] {
  return NOTEBOOK.filter((p) => p.rank <= Math.min(rank, MAX_RANK));
}

/** Where the stall stands at this rank. */
export function backdropForRank(rank: Rank): BackdropId {
  return notebookPage(rank).backdrop;
}
