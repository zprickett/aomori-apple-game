/**
 * Player status panel ("My chef"): the chef turning round with their name, then their rank and
 * the ladder bar. Later sections (Golden Trophies and so on) go below the rank.
 */
import { useContext, useState } from 'react';
import { rankInfo, recipe, selectors, type GameState } from '../core/index.ts';
import { dishIcon } from './icons.tsx';
import { ChefContext } from '../game/chef.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { RankBadge, RankGoals } from './Ranks.tsx';
import { NotebookBook, Scrapbook } from './Notebook.tsx';
import { TrophyCabinet } from './Trophies.tsx';
import { Passport } from './Requests.tsx';
import { GRANDPA } from '../core/index.ts';
import { sfx } from '../game/audio.ts';

export function PlayerSheet({ state, reduced = false, onReplay }: { state: GameState; reduced?: boolean; onReplay?: (id: string) => void }) {
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
      <h3>Records</h3>
      <Records state={state} />
      <h3>Golden Trophies</h3>
      <TrophyCabinet state={state} />
      {Object.values(state.progress.requests).some((r) => r.done) && (<>
        <h3>Passport</h3>
        <Passport state={state} onReplay={(id) => onReplay?.(id)} />
      </>)}
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

/** The chef's records: high score (and which dish), total points, Golden Recipes, Perfect streak. */
function Records({ state }: { state: GameState }) {
  const r = selectors.records(state);
  return (
    <div className="records" data-testid="records">
      <div className="rec high">
        <span className="rec-label">🏆 High score</span>
        <b>{r.high ? r.high.points.toLocaleString() : '—'}</b>
        {r.high && <span className="rec-sub"><img src={dishIcon(r.high.recipeId)} alt="" />{recipe(r.high.recipeId).name}</span>}
      </div>
      <div className="rec"><span className="rec-label">Total points</span><b>{r.total.toLocaleString()}</b></div>
      <div className="rec"><span className="rec-label">✨ Golden Recipes</span><b>{r.golden}</b></div>
      <div className="rec"><span className="rec-label">🔥 Longest Perfect streak</span><b>{r.streak}</b></div>
    </div>
  );
}
