/**
 * Player status panel ("My chef"): the chef turning round with their name, then their rank and
 * the ladder bar. Later sections (Golden Trophies and so on) go below the rank.
 */
import { useContext, useState } from 'react';
import { rankInfo, selectors, type GameState } from '../core/index.ts';
import { ChefContext } from '../game/chef.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { RankBadge, RankGoals } from './Ranks.tsx';
import { NotebookBook, Scrapbook } from './Notebook.tsx';
import { TrophyCabinet } from './Trophies.tsx';
import { GRANDPA } from '../core/index.ts';
import { sfx } from '../game/audio.ts';

export function PlayerSheet({ state, reduced = false }: { state: GameState; reduced?: boolean }) {
  const chef = useContext(ChefContext);
  const r = rankInfo(selectors.rank(state));
  const [book, setBook] = useState(false);
  if (book) {
    return (
      <div className="player" data-testid="player">
        <button className="btn small ghost nb-back" onClick={() => { sfx.tap(); setBook(false); }}>‹ My chef</button>
        <NotebookBook state={state} name={chef.name} />
      </div>
    );
  }
  return (
    <div className="player" data-testid="player">
      <div className="pl-hero">
        <ChefPreview look={chef.look} reduced={reduced} spin rank={r.rank} className="pl-chef" />
        <div className="pl-name">{chef.name || 'Chef'}</div>
      </div>
      <h3>Rank</h3>
      <div className="pl-rank">
        <RankBadge rank={r.rank} size={44} />
        <div>
          <div className="pl-rank-name">{r.name}</div>
          <div className="pl-rank-ja" lang="ja">{r.nameJa}</div>
        </div>
      </div>
      <RankGoals state={state} />
      <h3>Golden Trophies</h3>
      <TrophyCabinet state={state} />
      {selectors.seenNews(state).length > 0 && (<>
        <h3>Scrapbook</h3>
        <Scrapbook state={state} name={chef.name} />
      </>)}
      <button className="btn big nb-open" data-testid="open-notebook" onClick={() => { sfx.tap(); setBook(true); }}>
        📖 {GRANDPA.name}’s notebook
      </button>
    </div>
  );
}
