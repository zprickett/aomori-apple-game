/** Golden Trophies: the pop-up when a step is reached, and the cabinet in My chef. */
import { useEffect } from 'react';
import { TIER_NAMES, selectors, trophy, trophyInput, type GameState } from '../core/index.ts';
import { sfx } from '../game/audio.ts';

const TIER_CLASS = ['none', 'bronze', 'silver', 'gold'] as const;

export function TrophyMedal({ icon, tier, size = 64 }: { icon: string; tier: number; size?: number }) {
  return (
    <span className={`trophy-medal t-${TIER_CLASS[tier]}`} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      <span>{icon}</span>
    </span>
  );
}

/** Pop-up after a dish when a trophy step is reached (bronze, silver or gold). */
export function TrophyReveal({ state, id, tier, reduced, onDone }: { state: GameState; id: string; tier: number; reduced: boolean; onDone: () => void }) {
  const t = trophy(id);
  const steps = t.steps(trophyInput(state.progress));
  useEffect(() => { sfx.fanfare(); }, [id, tier]);
  return (
    <div className={`reveal trophy-pop t-${TIER_CLASS[tier]} ${reduced ? 'still' : ''}`} role="dialog" aria-label={`${t.name}: ${TIER_NAMES[tier]}`}
      data-testid="trophy-pop" onClick={() => { sfx.tap(); onDone(); }}>
      <div className="tp-rays" />
      <div className="tp-kick">GOLDEN TROPHY!</div>
      <div className="tp-medal"><TrophyMedal icon={t.icon} tier={tier} size={150} /></div>
      <div className="tp-name">{t.name}</div>
      <div className="tp-tier">{TIER_NAMES[tier]}</div>
      <div className="tp-goal">✓ {steps[tier - 1].goal}</div>
      {tier < 3 && <div className="tp-next">Next: {steps[tier].goal} for {TIER_NAMES[tier + 1]}</div>}
      <div className="rp-skip tp-skip">Tap to continue</div>
    </div>
  );
}

/** The cabinet: every trophy with its step and progress to the next. */
export function TrophyCabinet({ state }: { state: GameState }) {
  const list = selectors.trophies(state);
  const won = list.filter((t) => t.tier > 0).length;
  return (
    <div className="cabinet" data-testid="trophy-cabinet">
      <div className="cab-count">{won} of {list.length} trophies</div>
      <div className="cab-grid">
        {list.map((t) => (
          <div key={t.id} className={`cab-card t-${TIER_CLASS[t.tier]}`}>
            <TrophyMedal icon={t.icon} tier={t.tier} size={52} />
            <div className="cab-name">{t.name}</div>
            <div className="cab-pips" aria-label={t.tier ? TIER_NAMES[t.tier] : 'Not won yet'}>
              {[1, 2, 3].map((k) => <i key={k} className={k <= t.tier ? `on t-${TIER_CLASS[k]}` : ''} />)}
            </div>
            {t.next ? (
              <>
                <div className="cab-goal">{t.next.goal}</div>
                <div className="cab-bar"><i style={{ width: `${Math.round((t.next.have / t.next.need) * 100)}%` }} /></div>
                <div className="cab-num">{t.next.have.toLocaleString()} / {t.next.need.toLocaleString()}</div>
              </>
            ) : (
              <div className="cab-goal gold-done">Gold!</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
