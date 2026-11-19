/**
 * Ojiichan's visit ending (after his order at Golden Chef): a three-panel manga tasting, then a
 * group photo with the four regulars that goes into the scrapbook. From then on he stays at the
 * stall (Scene `helper`).
 */
import { useContext, useEffect, useState } from 'react';
import { REGULARS, recipe, withName, type GameState } from '../core/index.ts';
import { ChefContext } from '../game/chef.ts';
import { emitCue } from '../game/bus.ts';
import { sfx } from '../game/audio.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { dishIcon, portrait } from './icons.tsx';

/** Ojiichan tastes the dish: "…!!" and "It's better than mine." Tap to continue. */
export function OjiichanTasting({ state, reduced, onDone }: { state: GameState; reduced: boolean; onDone: () => void }) {
  const chef = useContext(ChefContext);
  const dish = recipe(state.result?.recipeId ?? state.order.recipeId);
  useEffect(() => { emitCue({ type: 'customer', anim: 'joy' }); if (!reduced) sfx.fanfare(); }, [reduced]);
  return (
    <div className={`reveal finale-taste ${reduced ? 'still' : ''}`} role="dialog" aria-label="Ojiichan tastes your dish"
      data-testid="finale-taste" onClick={() => { sfx.tap(); onDone(); }}>
      <div className="ft-panel ft-1">
        <img className="ft-face" src={portrait('O')} alt="" />
        <img className="ft-dish" src={dishIcon(dish.id)} alt="" />
        <div className="ft-say">Let’s see… your {dish.name}.</div>
      </div>
      <div className="ft-panel ft-2">
        <img className="ft-face big" src={portrait('O')} alt="" />
        <div className="ft-sfx" lang="ja" aria-hidden>もぐもぐ</div>
        <div className="ft-shock" aria-hidden>…!!</div>
      </div>
      <div className="ft-panel ft-3">
        <div className="ft-say big">{withName('It’s better than mine, {name}!', chef.name || 'Chef')}</div>
        <div className="ft-say">I’ve seen the whole world. From today, I’ll help at <b>our</b> stall.</div>
        <div className="ft-hearts" aria-hidden>♥ ♥ ♥</div>
      </div>
      <div className="rp-skip">Tap to continue</div>
    </div>
  );
}

/** Everyone in front of the Golden stall: "Say cheese!", a flash, then the photo. */
export function GroupPhoto({ reduced, onDone }: { reduced: boolean; onDone: () => void }) {
  const chef = useContext(ChefContext);
  const [snapped, setSnapped] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => { setSnapped(true); sfx.bell(); }, 1400);
    return () => window.clearTimeout(id);
  }, [reduced]);
  return (
    <div className={`reveal finale-photo ${snapped ? 'snapped' : ''}`} role="dialog" aria-label="Group photo" data-testid="finale-photo">
      {!snapped && <div className="fp-cheese">Say cheese! 📸</div>}
      <div className="fp-flash" aria-hidden />
      <PhotoCard name={chef.name} look={chef.look} reduced={reduced} />
      <button className="btn primary huge" data-testid="finale-done" disabled={!snapped} onClick={() => { sfx.tap(); onDone(); }}>
        Put it in my scrapbook
      </button>
    </div>
  );
}

/** The photo itself (also shown, smaller, in the scrapbook). */
export function PhotoCard({ name, look, reduced, small = false }: { name: string; look: Parameters<typeof ChefPreview>[0]['look']; reduced: boolean; small?: boolean }) {
  return (
    <div className={`fp-card ${small ? 'small' : ''}`} data-testid="group-photo">
      <div className="fp-pic">
        <div className="fp-back">
          <ChefPreview look={look} reduced={reduced} framing="bust" rank={5} className="fp-chef" />
          <img className="fp-oji" src={portrait('O')} alt="Ojiichan" />
        </div>
        <div className="fp-front">
          {REGULARS.map((r) => <img key={r.id} src={portrait(r.customer)} alt={r.name} title={r.name} />)}
        </div>
      </div>
      <div className="fp-caption">Golden Chef {name || 'Chef'} & friends · Aomori</div>
    </div>
  );
}
