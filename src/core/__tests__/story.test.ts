import { describe, expect, it } from 'vitest';
import { RECIPE_ORDER } from '../content.ts';
import { RANKS, RANK_RECIPES } from '../ranks.ts';
import { GRANDPA, NOTEBOOK, STORY_BACKDROPS, backdropForRank, letterFor, notebookPage, openPages, withName } from '../story.ts';

describe('story data', () => {
  it('has exactly one notebook page per rank', () => {
    expect(NOTEBOOK.map((p) => p.rank)).toEqual(RANKS.map((r) => r.rank));
  });

  it("each riddle is about exactly the recipes that page's rank brings", () => {
    for (const p of NOTEBOOK) expect([...p.riddleRecipes].sort()).toEqual(RANK_RECIPES[p.rank].map((x) => x.id).sort());
    const all = NOTEBOOK.flatMap((p) => p.riddleRecipes);
    expect(all.sort()).toEqual([...RECIPE_ORDER].sort());
    for (const p of NOTEBOOK) expect(p.riddle === null).toBe(p.riddleRecipes.length === 0);
  });

  it('the stall tours Aomori City → Lake Towada → Takayama Inari', () => {
    for (const p of NOTEBOOK) expect(STORY_BACKDROPS).toContain(p.backdrop);
    expect(RANKS.map((r) => backdropForRank(r.rank))).toEqual(['aomori_city', 'aomori_city', 'lake_towada', 'takayama_inari', 'takayama_inari']);
    // A page that moves the stall says so.
    for (let i = 1; i < NOTEBOOK.length; i++) {
      if (NOTEBOOK[i].backdrop !== NOTEBOOK[i - 1].backdrop) expect(NOTEBOOK[i].where).toBeTruthy();
    }
  });

  it('pages open with rank; the first is open from the start', () => {
    expect(openPages(1).map((p) => p.rank)).toEqual([1]);
    expect(openPages(4).map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(notebookPage(5).title).toBe('The last page');
  });

  it('letter and pages use the chef name and never he/she for the chef', () => {
    const l = letterFor('Mika');
    expect(l.greeting).toBe('Dear Mika,');
    expect(withName('{name}!', '  ')).toBe('Chef!');
    expect(withName(notebookPage(5).where!, 'Mika')).toContain('Mika');
    const text = JSON.stringify({ l, NOTEBOOK });
    expect(text).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    expect(GRANDPA.name).toBe('Ojiichan');
  });
});
