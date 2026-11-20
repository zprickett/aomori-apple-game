/** Golden Trophies: the pop-up when a step is reached, and the cabinet in My chef. */
import { useEffect, useState } from 'react';
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
  const [open, setOpen] = useState<string | null>(null);
  const won = list.filter((t) => t.tier > 0).length;
  return (
    <div className="cabinet" data-testid="trophy-cabinet">
      <div className="cab-count">{won} of {list.length} trophies</div>
      <div className="cab-grid">
        {list.map((t) => (
          <button type="button" key={t.id} className={`cab-card t-${TIER_CLASS[t.tier]}`} onClick={() => { sfx.tap(); setOpen(t.id); }}
            aria-label={`${t.name}: tap for details`}>
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
          </button>
        ))}
      </div>
      {open && <TrophyInfo state={state} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Tapped trophy: what it counts and all three steps with progress. */
export function TrophyInfo({ state, id, onClose }: { state: GameState; id: string; onClose: () => void }) {
  const t = trophy(id);
  const steps = t.steps(trophyInput(state.progress));
  const tier = selectors.trophies(state).find((x) => x.id === id)?.tier ?? 0;
  return (
    <div className="trophy-info-back" role="dialog" aria-label={t.name} data-testid="trophy-info" onClick={() => { sfx.tap(); onClose(); }}>
      <div className="trophy-info" onClick={(e) => e.stopPropagation()}>
        <TrophyMedal icon={t.icon} tier={tier} size={84} />
        <div className="ti-name">{t.name}</div>
        {t.about && <p className="ti-about">{t.about}</p>}
        <ol className="ti-steps">
          {steps.map((st, k) => {
            const done = st.have >= st.need && tier > k;
            return (
              <li key={k} className={`t-${TIER_CLASS[k + 1]} ${done ? 'done' : ''}`}>
                <span className="ti-tier">{TIER_NAMES[k + 1]}</span>
                <span className="ti-goal">{st.goal}</span>
                <span className="ti-have">{done ? '✓' : `${st.have.toLocaleString()} / ${st.need.toLocaleString()}`}</span>
              </li>
            );
          })}
        </ol>
        <button className="btn primary big" onClick={() => { sfx.tap(); onClose(); }}>OK</button>
      </div>
    </div>
  );
}
