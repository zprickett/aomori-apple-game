/**
 * Player status panel ("My chef"): the chef turning round with their name, then chef level and
 * story rank. Later sections (Golden Trophies and so on) go below the rank.
 */
import { useContext } from 'react';
import { chefLevel, rankInfo, selectors, type GameState } from '../core/index.ts';
import { ChefContext } from '../game/chef.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { RankBadge, RankGoals } from './Ranks.tsx';

/** Chef level from lifetime points. */
export function LevelCard({ state }: { state: GameState }) {
  const p = state.progress;
  const lv = chefLevel(p.totalPoints);
  return (
    <div className="hist-level" data-testid="level-card">
      <div className="lv-row">
        <span className="lv-badge">Lv {lv.level}</span>
        <span className="lv-title">{lv.title}</span>
        <span className="lv-pts">{p.totalPoints.toLocaleString()} pts</span>
      </div>
      <div className="lv-track"><i style={{ width: `${Math.round(lv.frac * 100)}%` }} /></div>
      <div className="small-print">{(lv.next - p.totalPoints).toLocaleString()} pts to Lv {lv.level + 1}</div>
    </div>
  );
}

export function PlayerSheet({ state, reduced = false }: { state: GameState; reduced?: boolean }) {
  const chef = useContext(ChefContext);
  const r = rankInfo(selectors.rank(state));
  return (
    <div className="player" data-testid="player">
      <div className="pl-hero">
        <ChefPreview look={chef.look} reduced={reduced} spin className="pl-chef" />
        <div className="pl-name">{chef.name || 'Chef'}</div>
      </div>
      <h3>Level</h3>
      <LevelCard state={state} />
      <h3>Rank</h3>
      <div className="pl-rank">
        <RankBadge rank={r.rank} size={44} />
        <div>
          <div className="pl-rank-name">{r.name}</div>
          <div className="pl-rank-ja" lang="ja">{r.nameJa}</div>
        </div>
      </div>
      <RankGoals state={state} />
    </div>
  );
}
