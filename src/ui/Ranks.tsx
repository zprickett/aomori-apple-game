/** Story ranks UI: rank badge, next-rank goals, the rank-up intro and the end-of-day recap. */
import { useEffect } from 'react';
import { DAY_LENGTH, MAX_RANK, nextRankGoals, rankInfo, recipe, selectors, type GameAction, type GameState, type Rank } from '../core/index.ts';
import { emitCue } from '../game/bus.ts';
import { sfx } from '../game/audio.ts';
import { dishIcon, Stars } from './icons.tsx';

type D = (a: GameAction) => void;

/** Medal colour per rank (Golden Chef is gold). */
const RANK_HUE: Record<Rank, string> = { 1: '#9BC27A', 2: '#7FB2D8', 3: '#E8806A', 4: '#B48AD8', 5: '#F4C954' };

export function RankBadge({ rank, size = 28 }: { rank: Rank; size?: number }) {
  return (
    <span className="rank-badge" style={{ width: size, height: size, ['--rank-hue' as string]: RANK_HUE[rank] }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <path d="M10 2h5l-3 9H7zM17 2h5l3 9h-5z" fill="#E05A4B" />
        <circle cx="16" cy="20" r="10" fill="var(--rank-hue)" stroke="#4A3326" strokeWidth="2" />
        <text x="16" y="24.5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#4A3326">{rank === MAX_RANK ? '★' : rank}</text>
      </svg>
    </span>
  );
}

export function RankGoals({ state }: { state: GameState }) {
  const goals = nextRankGoals(state.progress);
  const rank = selectors.rank(state);
  if (!goals.length) return <div className="rank-goals done">Top rank reached!</div>;
  const next = rankInfo(rank + 1);
  return (
    <div className="rank-goals" data-testid="rank-goals">
      <div className="rg-head"><RankBadge rank={next.rank} size={24} /> Next: <b>{next.name}</b></div>
      <ul>
        {goals.map((g) => (
          <li key={g.id} className={g.done ? 'done' : ''}>
            <span className="rg-check" aria-hidden>{g.done ? '✓' : ''}</span>
            <span className="rg-label">{g.label}</span>
            {g.need > 1 && <span className="rg-count">{g.have}/{g.need}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankSheet({ state }: { state: GameState }) {
  const r = rankInfo(selectors.rank(state));
  return (
    <>
      <div className="rank-now">
        <RankBadge rank={r.rank} size={52} />
        <div>
          <div className="rn-name">{r.name}</div>
          <div className="rn-ja" lang="ja">{r.nameJa}</div>
        </div>
      </div>
      <RankGoals state={state} />
    </>
  );
}

/** Manga-style "RANK UP!" entrance. */
export function RankUpIntro({ rank, reduced, onSkip }: { rank: Rank; reduced: boolean; onSkip: () => void }) {
  const r = rankInfo(rank);
  useEffect(() => { emitCue({ type: 'chef', anim: 'cheer' }); }, []);
  return (
    <div className={`reveal manga rank-up ${reduced ? 'still' : ''}`} role="dialog" aria-label={`Rank up: ${r.name}`}
      data-testid="rank-up" onClick={onSkip} style={{ ['--hue' as string]: RANK_HUE[rank] }}>
      <div className="mg-rays" />
      <div className="mg-dots" />
      <div className="mg-slash" />
      <div className="mg-ja" lang="ja" aria-hidden>{r.nameJa}</div>
      <div className="mg-shout">
        <span className="mg-kick">RANK UP!</span>
        <span className="mg-kick-ja" lang="ja" aria-hidden>ランクアップ！</span>
      </div>
      <div className="ru-medal"><RankBadge rank={rank} size={150} /></div>
      <div className="mg-name">{r.name}</div>
      <div className="mg-skip">Tap to continue</div>
    </div>
  );
}

/** End-of-day recap: the day's dishes with stars, points and progress to the next rank. */
export function DayRecap({ state, dispatch, reduced }: { state: GameState; dispatch: D; reduced: boolean }) {
  const records = selectors.dayRecords(state);
  const stars = records.reduce((n, h) => n + (h.stars ?? 0), 0);
  const points = records.reduce((n, h) => n + h.points, 0);
  useEffect(() => {
    if (!reduced) sfx.fanfare();
  }, [reduced]);
  return (
    <div className="sheet-card result day-recap" role="dialog" aria-label={`Day ${selectors.day(state)} recap`} data-testid="day-recap">
      <div className="dr-head">
        <h2>Day {selectors.day(state)}</h2>
        <div className="dr-total"><Stars n={1} max={1} size={22} label="Stars today" /> {stars}/{DAY_LENGTH * 3} · <b>{points.toLocaleString()}</b> pts</div>
      </div>
      <div className="dr-dishes">
        {records.map((h) => (
          <div key={h.orderId} className={`dr-dish ${h.golden ? 'golden' : ''}`}>
            <img src={dishIcon(h.recipeId)} alt={recipe(h.recipeId).name} />
            <Stars n={h.stars ?? 0} size={13} label={`${h.stars ?? 0} of 3 stars`} />
          </div>
        ))}
      </div>
      <RankGoals state={state} />
      <button className="btn primary huge" data-testid="day-next" onClick={() => { sfx.tap(); dispatch({ type: 'DAY_DONE' }); }}>
        Next day
      </button>
    </div>
  );
}
