/** Story ranks UI: rank badge, next-rank goals, the rank-up intro and the end-of-day recap. */
import { useContext, useEffect } from 'react';
import { DAY_LENGTH, MAX_RANK, nextRankGoals, rankInfo, recipe, selectors, type GameAction, type GameState, type Rank } from '../core/index.ts';
import { emitCue } from '../game/bus.ts';
import { sfx } from '../game/audio.ts';
import { dishIcon, Stars } from './icons.tsx';
import { ChefContext } from '../game/chef.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';

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

/** Jagged manga shout balloon (a starburst polygon). */
function burstPoints(spikes: number, rx: number, ry: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? 1 : inner + 0.06 * Math.sin(i * 2.3);
    pts.push(`${(100 + Math.cos(a) * rx * k).toFixed(1)},${(60 + Math.sin(a) * ry * k).toFixed(1)}`);
  }
  return pts.join(' ');
}
const BURST = burstPoints(14, 98, 58, 0.78);

/** Falling confetti: apple petals and sparkles at fixed, varied spots. */
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 0.53) % 2.4).toFixed(2),
  dur: (2.6 + ((i * 0.71) % 1.6)).toFixed(2),
  kind: i % 3 === 0 ? 'spark' : i % 3 === 1 ? 'petal' : 'apple',
  spin: (i * 47) % 360,
}));

/**
 * Rank-up: a three-panel manga page, unlike the apple/recipe reveal. Top panel: the shout.
 * Middle panel: the player's chef jumping with arms up in a sparkle burst. Bottom panel: the new
 * rank medal and name. Panels slam in one after another; confetti falls over the page.
 */
export function RankUpIntro({ rank, reduced, onSkip }: { rank: Rank; reduced: boolean; onSkip: () => void }) {
  const r = rankInfo(rank);
  const chef = useContext(ChefContext);
  useEffect(() => { emitCue({ type: 'chef', anim: 'cheer' }); }, []);
  return (
    <div className={`reveal rank-page ${reduced ? 'still' : ''}`} role="dialog" aria-label={`Rank up: ${r.name}`}
      data-testid="rank-up" onClick={onSkip} style={{ ['--hue' as string]: RANK_HUE[rank] }}>
      <div className="rp-panel rp-top">
        <div className="rp-speed" />
        <svg className="rp-burst" viewBox="0 0 200 120" aria-hidden>
          <polygon points={BURST} />
        </svg>
        <div className="rp-shout">
          <span className="rp-kick">RANK UP!</span>
          <span className="rp-kick-ja" lang="ja" aria-hidden>ランクアップ！</span>
        </div>
      </div>
      <div className="rp-panel rp-mid">
        <div className="rp-sun" />
        <div className="rp-tone" />
        <ChefPreview look={chef.look} reduced={reduced} framing="jump" className="rp-chef" />
        <div className="rp-sfx rp-sfx-l" lang="ja" aria-hidden>ドーン!</div>
        <div className="rp-sfx rp-sfx-r" aria-hidden>YATTA!</div>
        {['a', 'b', 'c', 'd'].map((k) => <span key={k} className={`rp-twinkle t-${k}`} aria-hidden>✦</span>)}
      </div>
      <div className="rp-panel rp-bot">
        <div className="rp-dots" />
        <RankBadge rank={rank} size={74} />
        <div className="rp-rank">
          <span className="rp-name">{r.name}</span>
          <span className="rp-ja" lang="ja">{r.nameJa}</span>
        </div>
      </div>
      {!reduced && (
        <div className="rp-confetti" aria-hidden>
          {CONFETTI.map((c, i) => (
            <i key={i} className={`c-${c.kind}`}
              style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ['--spin' as string]: `${c.spin}deg` }} />
          ))}
        </div>
      )}
      <div className="rp-skip">Tap to continue</div>
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
