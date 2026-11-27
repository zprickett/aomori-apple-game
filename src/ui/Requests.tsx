/**
 * Golden Requests (Stage 2): the intro manga page, the letter waiting on the counter, the request
 * screens (letter, menu card, apple matching, tasting reveal, rewards), the menu strip while
 * cooking, and the passport with the world map (My chef).
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import {
  APPLE_ORDER, FEAST, FEAST_FINALE, PIE_APPLES, PIE_RECIPE, REGULARS, REQUESTS, STAGE2_INTRO, apple, appleMatch, isFeast, menuCombo, menuGolds, menuPlan, menuPoints,
  requestById, skinFamily, withName,
  type ClueKey, type GameAction, type GameState, type GoldenRequest, type StatKey, type TwistRule,
} from '../core/index.ts';
import { ChefContext } from '../game/chef.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { PieSlots } from './Screens.tsx';
import { emitCue } from '../game/bus.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { appleIcon, dishIcon, portrait, Stars } from './icons.tsx';

type D = (a: GameAction) => void;
const tap = () => { unlockAudio(); sfx.tap(); };

// ---------------------------------------------------------------------------
// Stage 2 intro
// ---------------------------------------------------------------------------

/** The day after Ojiichan's ending: his postcards bring the world's letters (tap through 4 beats). */
export function Stage2Intro({ name, reduced, onDone }: { name: string; reduced: boolean; onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  const next = () => { tap(); if (beat < 3) setBeat(beat + 1); };
  useEffect(() => { if (beat === 2 && !reduced) sfx.fanfare(); }, [beat, reduced]);
  return (
    <div className={`reveal s2-intro b-${beat} ${reduced ? 'still' : ''}`} role="dialog" aria-label="The world is calling" data-testid="stage2-intro"
      onClick={beat < 3 ? next : undefined}>
      {beat === 0 && (
        <div className="s2-panel s2-oji" key="b0">
          <img src={portrait('O')} alt="Ojiichan" className="s2-face" />
          <div className="s2-say">{withName(STAGE2_INTRO.ojiichan1, name)}</div>
          <div className="s2-cards" aria-hidden><span>🇳🇴</span><span>🇫🇷</span><span>🇦🇺</span></div>
        </div>
      )}
      {beat === 1 && (
        <div className="s2-panel s2-whoosh" key="b1">
          <div className="s2-sfx">{STAGE2_INTRO.whoosh}</div>
          <div className="s2-letters" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ ['--i' as string]: i, left: `${8 + ((i * 41) % 76)}%`, top: `${6 + ((i * 29) % 64)}%`, ['--r' as string]: `${(i * 47) % 70 - 35}deg` }}>✉️</span>
            ))}
          </div>
        </div>
      )}
      {beat === 2 && (
        <div className="s2-panel s2-world" key="b2">
          <div className="s2-calling">{STAGE2_INTRO.calling}</div>
          <WorldMap pins={[{ lat: 61, lon: 8, label: 'Norway' }, { lat: 48.9, lon: 2.3, label: 'Paris' }, { lat: -20, lon: 146, label: 'Queensland' }]} home />
        </div>
      )}
      {beat === 3 && (
        <div className="s2-panel s2-oji" key="b3">
          <img src={portrait('O')} alt="Ojiichan" className="s2-face" />
          <div className="s2-say">{STAGE2_INTRO.ojiichan2}</div>
          <button className="btn primary huge" data-testid="stage2-open" onClick={(e) => { e.stopPropagation(); tap(); onDone(); }}>
            📬 Open the first letter
          </button>
        </div>
      )}
      {beat < 3 && <div className="rp-skip">Tap to continue</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The letter on the counter
// ---------------------------------------------------------------------------

/** A letter waiting on the counter: the kid can open it or keep serving customers. */
export function RequestLetterButton({ req, onOpen }: { req: GoldenRequest; onOpen: () => void }) {
  const feast = isFeast(req.id);
  return (
    <button className={`req-letter-btn ${feast ? 'feast' : ''}`} data-testid="request-letter" onClick={() => { tap(); onOpen(); }}
      aria-label={feast ? 'A gold letter from Ojiichan: open it' : `A letter from ${req.place}: open it`}>
      <span className="rl-env" aria-hidden>✉️<span className="rl-stamp">{req.stamp}</span></span>
      <span className="rl-text"><b>{feast ? 'Gold letter!' : 'Letter!'}</b><small>from {feast ? 'Ojiichan' : req.place}</small></span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Request screens
// ---------------------------------------------------------------------------

const CLUE_STAT: Partial<Record<ClueKey, StatKey>> = { crisp: 'raw_firmness', tart: 'tartness', sweet: 'sweetness', extraJuicy: 'juiciness', aromatic: 'aroma' };
const TWIST_STAT: Partial<Record<TwistRule, StatKey>> = { notVerySweet: 'sweetness', crisp: 'raw_firmness' };
const STAT_WORD: Record<StatKey, string> = { raw_firmness: 'Crisp', tartness: 'Tart', sweetness: 'Sweet', juiciness: 'Juicy', aroma: 'Smell' };

export function RequestScreen({ state, dispatch, name, reduced }: { state: GameState; dispatch: D; name: string; reduced: boolean }) {
  const run = state.request!;
  const req = requestById(run.id);
  switch (run.view) {
    case 'letter': return <RequestLetter req={req} name={name} dispatch={dispatch} />;
    case 'brief': return <RequestBrief req={req} first={run.first} dispatch={dispatch} />;
    case 'match': return <AppleMatchScreen state={state} req={req} dispatch={dispatch} />;
    case 'reveal': return isFeast(req.id)
      ? <FeastReveal state={state} req={req} name={name} reduced={reduced} dispatch={dispatch} />
      : <RequestReveal state={state} req={req} reduced={reduced} dispatch={dispatch} />;
    case 'rewards': return <RequestRewards state={state} req={req} name={name} reduced={reduced} dispatch={dispatch} />;
  }
}

function RequestLetter({ req, name, dispatch }: { req: GoldenRequest; name: string; dispatch: D }) {
  return (
    <div className={`req-backdrop ${isFeast(req.id) ? 'feast' : ''}`} role="dialog" aria-label={`Letter from ${req.visitor}`} data-testid="request-letter-card">
      <div className="req-postcard" style={{ ['--req' as string]: req.color }}>
        <div className="rp-stamp" aria-hidden><span>{req.stamp}</span><small>{req.place}</small></div>
        <img className="rp-face" src={portrait(req.customer)} alt={req.visitor} />
        <div className="rp-from">{req.visitor} · {req.place}</div>
        {req.letter.map((l) => <p key={l}>{withName(l, name)}</p>)}
      </div>
      <div className="req-foot">
        <button className="btn" data-testid="request-later" onClick={() => { tap(); dispatch({ type: 'REQUEST_EXIT' }); }}>Later</button>
        <button className="btn primary big" data-testid="request-read" onClick={() => { tap(); dispatch({ type: 'REQUEST_VIEW', view: 'brief' }); }}>See the menu</button>
      </div>
    </div>
  );
}

function RequestBrief({ req, first, dispatch }: { req: GoldenRequest; first: boolean; dispatch: D }) {
  return (
    <div className="req-backdrop" role="dialog" aria-label={req.title} data-testid="request-brief">
      <div className="req-menu" style={{ ['--req' as string]: req.color }}>
        <div className="rm-kicker">{isFeast(req.id) ? '🎆 Hirosaki Apple Festival' : '✨ Golden Request'}</div>
        <h2 className="rm-title">{req.title}</h2>
        <ol className="rm-dishes">
          {req.dishes.map((d) => (
            <li key={d.name}>
              <img src={dishIcon(d.recipe)} alt="" />
              {d.from && <img className="rm-from" src={portrait(d.from)} alt="" />}
              <span className="rm-name">{d.name}</span>
              <span className="rm-clue">🍎 {d.clueText}</span>
            </li>
          ))}
        </ol>
        <div className="rm-twist"><b>{req.twist.name}:</b> {req.twist.text}</div>
        {first && !isFeast(req.id) && (
          <div className="rm-tip"><img src={portrait('O')} alt="Ojiichan" /><span>{STAGE2_INTRO.tip}</span></div>
        )}
      </div>
      <div className="req-foot">
        <button className="btn" onClick={() => { tap(); dispatch({ type: 'REQUEST_VIEW', view: 'letter' }); }}>Back</button>
        <button className="btn primary big" data-testid="request-pick" onClick={() => { tap(); dispatch({ type: 'REQUEST_VIEW', view: 'match' }); }}>Pick the apples</button>
      </div>
    </div>
  );
}

function Dots({ n }: { n: number }) {
  return <span className="am-dots" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= n ? 'on' : ''} />)}</span>;
}

function AppleMatchScreen({ state, req, dispatch }: { state: GameState; req: GoldenRequest; dispatch: D }) {
  const run = state.request!;
  const firstOpen = run.apples.findIndex((a) => a === null);
  const [dish, setDish] = useState(firstOpen < 0 ? 0 : firstOpen);
  const d = req.dishes[dish];
  const stats = useMemo(() => [...new Set([...d.clue.map((c) => CLUE_STAT[c]), TWIST_STAT[req.twist.rule]].filter((x): x is StatKey => !!x))], [d, req]);
  const apples = APPLE_ORDER.filter((id) => state.progress.unlockedApples.includes(id));
  const ready = run.apples.every((a) => a !== null);
  const pie = d.recipe === PIE_RECIPE;
  const golds = menuGolds(req, run.apples, run.pie);
  const pick = (id: string) => {
    tap();
    dispatch({ type: 'REQUEST_PICK', dish, appleId: id });
    if (pie) {
      if (!run.pie.includes(id) && run.pie.length === PIE_APPLES - 1 && menuGolds(req, [], [...run.pie, id])[dish]) sfx.bell();
      return;
    }
    const m = appleMatch(id, d, req.twist.rule);
    if (m.gold) sfx.bell();
    // Move on to the next dish still without an apple.
    const nextOpen = run.apples.findIndex((a, i) => a === null && i !== dish);
    if (nextOpen >= 0) window.setTimeout(() => setDish(nextOpen), 650);
  };
  return (
    <div className="req-match" data-testid="request-match">
      <div className={`am-slots ${req.dishes.length > 3 ? 'compact' : ''}`}>
        {req.dishes.map((x, i) => {
          const a = run.apples[i];
          const m = a ? { gold: golds[i] } : null;
          return (
            <button key={x.name} className={`am-slot ${i === dish ? 'sel' : ''} ${m?.gold ? 'gold' : m ? 'miss' : ''}`}
              data-testid={`match-dish-${i}`} onClick={() => { tap(); setDish(i); }}>
              <img className="am-dish" src={dishIcon(x.recipe)} alt="" />
              {x.from && <img className="am-from" src={portrait(x.from)} alt="" />}
              <span className="am-name">{x.name}</span>
              <span className="am-clue">🍎 {x.clueText}</span>
              {x.recipe === PIE_RECIPE && run.pie.length
                ? <span className="am-pie">{run.pie.map((id) => <img key={id} src={appleIcon(id)} alt={apple(id).nameEn} />)}</span>
                : a ? <img className="am-apple" src={appleIcon(a)} alt={apple(a).nameEn} /> : <span className="am-empty">?</span>}
            </button>
          );
        })}
      </div>
      {req.dishes.length > 3 && <div className="am-current" data-testid="match-current"><b>{d.name}</b> · 🍎 {d.clueText}</div>}
      <div className="am-twist"><b>{req.twist.name}:</b> {req.twist.text}</div>
      {pie && <PieSlots ids={run.pie} onRemove={(id) => { tap(); dispatch({ type: 'REQUEST_PICK', dish, appleId: id }); }} />}
      {run.apples[dish] && (() => {
        const gold = golds[dish];
        return <div className={`am-verdict ${gold ? 'gold' : 'miss'}`} data-testid="match-verdict">{gold ? `✨ ${req.matchGood}` : req.matchMiss}</div>;
      })()}
      <div className="am-grid" role="list" aria-label={`Apples for ${d.name}`}>
        {apples.map((id) => {
          const a = apple(id);
          const chosen = pie ? run.pie.includes(id) : run.apples[dish] === id;
          return (
            <button key={id} role="listitem" className={`am-card ${chosen ? 'chosen' : ''}`} data-testid={`match-apple-${id}`} onClick={() => pick(id)}>
              <img src={appleIcon(id)} alt="" />
              <span className="am-aname">{a.nameEn}</span>
              {stats.map((k) => <span key={k} className="am-stat">{STAT_WORD[k]} <Dots n={a.stats[k]} /></span>)}
              {(d.clue.includes('pinkInside') || req.twist.rule === 'pinkInside') && a.fleshRed && <span className="am-stat">Pink inside</span>}
              {(d.clue.includes('tiny') || d.clue.includes('big') || req.twist.rule === 'tiny' || req.twist.rule === 'big') && <span className="am-stat">Size {a.sizeLabel}</span>}
              {pie && <span className={`am-stat skin-${skinFamily(a)}`}>{skinFamily(a) === 'red' ? 'Red' : skinFamily(a) === 'yellow' ? 'Yellow' : 'Green'} skin</span>}
            </button>
          );
        })}
      </div>
      <div className="req-foot am-foot">
        <button className="btn" onClick={() => { tap(); dispatch({ type: 'REQUEST_VIEW', view: 'brief' }); }}>Back</button>
        <button className="btn primary big" disabled={!ready} data-testid="request-cook" onClick={() => { tap(); dispatch({ type: 'REQUEST_COOK' }); }}>Cook the menu!</button>
      </div>
    </div>
  );
}

/** While cooking a request: which dish of the menu, and the menu-long combo. */
export function MenuStrip({ state }: { state: GameState }) {
  const run = state.request;
  if (!run) return null;
  const req = requestById(run.id);
  const live = state.cook ? [...run.steps, state.cook.stepResults] : run.steps;
  const combo = menuCombo(live);
  const plan = menuPlan(req);
  const now = plan[run.dishIndex];
  return (
    <div className={`menu-strip ${req.dishes.length > 3 ? 'long' : ''}`} data-testid="menu-strip">
      {req.dishes.map((d, i) => (
        <span key={d.name} className={`ms-dish ${i < now.dish ? 'done' : i === now.dish ? 'now' : ''}`}>
          <img src={dishIcon(d.recipe)} alt={d.name} />
          {i === now.dish && req.twist.kind === 'bigParty' && <b className="ms-round">{now.round}/{req.twist.rounds ?? 2}</b>}
        </span>
      ))}
      <span className={`ms-combo ${combo > 0 ? 'on' : ''}`}>🔥 {combo}</span>
    </div>
  );
}

function RequestReveal({ state, req, reduced, dispatch }: { state: GameState; req: GoldenRequest; reduced: boolean; dispatch: D }) {
  const run = state.request!;
  useEffect(() => { emitCue({ type: 'customer', anim: 'joy' }); if (!reduced) sfx.fanfare(); }, [reduced]);
  return (
    <div className={`reveal req-reveal ${reduced ? 'still' : ''}`} role="dialog" aria-label={`${req.visitor} tastes the menu`} data-testid="request-reveal">
      <div className="rr-panel rr-1">
        <img className="rr-face" src={portrait(req.customer)} alt="" />
        <div className="rr-dishes" aria-hidden>{req.dishes.map((d) => <img key={d.name} src={dishIcon(d.recipe)} alt="" />)}</div>
        <div className="rr-say">{req.tasting[0]}</div>
      </div>
      <div className="rr-panel rr-2">
        <img className="rr-face big" src={portrait(req.customer)} alt="" />
        <div className="rr-say big">{req.tasting[1]}</div>
      </div>
      <div className={`rr-panel rr-3 p-${req.crew.kind}`}>
        <div className={`rr-crew c-${req.crew.kind}`} aria-hidden>
          {Array.from({ length: req.crew.count }, (_, i) => <span key={i} className="crew" style={{ ['--i' as string]: i }}><i /></span>)}
        </div>
        <div className="rr-song">{req.tasting[2]}</div>
      </div>
      <div className="rr-score">
        {run.evaluations.map((e, i) => {
          const dish = menuPlan(req)[i].dish;
          const gold = menuGolds(req, run.apples, run.pie)[dish];
          return (
            <div key={i} className="rr-row">
              <img src={dishIcon(e.recipeId)} alt="" />
              <img src={appleIcon(e.appleId)} alt={apple(e.appleId).nameEn} className={gold ? 'gold' : ''} />
              <Stars n={e.score.stars} size={16} />
            </div>
          );
        })}
        {run.seal && <div className="rr-seal" data-testid="golden-seal">GOLDEN<br />SEAL</div>}
        <div className="rr-points" data-testid="menu-points">
          {(() => { const m = menuPoints(run.evaluations.map((e) => e.score.total), run.seal); return <>⭐ {m.base.toLocaleString()} × {m.mult} = <b>{m.total.toLocaleString()}</b></>; })()}
        </div>
      </div>
      <button className="btn primary huge" data-testid="request-next" onClick={() => { tap(); dispatch({ type: 'REQUEST_NEXT' }); }}>Next</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The World Apple Feast's ending
// ---------------------------------------------------------------------------

/** Everyone the chef cooked for: the twelve visitors, the four regulars, and Ojiichan. */
const FEAST_CROWD = [...REQUESTS.map((r) => ({ id: r.customer, name: r.visitor })), ...REGULARS.map((r) => ({ id: r.customer, name: r.name }))];

type FeastBeat = 'taste' | 'fireworks' | 'map' | 'page' | 'photo';

/**
 * The feast's ending, one tap per beat: everyone tastes (with the menu's score), fireworks over
 * Hirosaki, the world map lights up, Ojiichan's last notebook page, and the group photo for the
 * scrapbook. A replay shows the tasting and the fireworks only.
 */
function FeastReveal({ state, req, name, reduced, dispatch }: { state: GameState; req: GoldenRequest; name: string; reduced: boolean; dispatch: D }) {
  const run = state.request!;
  const beats: FeastBeat[] = run.first ? ['taste', 'fireworks', 'map', 'page', 'photo'] : ['taste', 'fireworks'];
  const [i, setI] = useState(0);
  const beat = beats[i];
  const last = i === beats.length - 1;
  useEffect(() => {
    if (beat === 'taste') emitCue({ type: 'customer', anim: 'joy' });
    if (!reduced && (beat === 'taste' || beat === 'fireworks')) sfx.fanfare();
    if (beat === 'map' || beat === 'page') sfx.swish();
  }, [beat, reduced]);
  const next = () => { tap(); if (last) dispatch({ type: 'REQUEST_NEXT' }); else setI(i + 1); };
  const golds = menuGolds(req, run.apples, run.pie);
  const m = menuPoints(run.evaluations.map((e) => e.score.total), run.seal);
  return (
    <div className={`reveal feast-reveal fb-${beat} ${reduced ? 'still' : ''}`} role="dialog" aria-label={req.title} data-testid="feast-reveal" data-beat={beat}>
      {beat === 'taste' && (
        <div className="fr-taste" key="taste">
          <div className="fr-cheer"><b>{FEAST_FINALE.cheerTitle}</b><span lang="ja">{FEAST_FINALE.cheerJa}</span></div>
          <div className="fr-crowd" aria-label="Everyone you cooked for">
            {FEAST_CROWD.map((c, k) => <img key={c.id} src={portrait(c.id)} alt={c.name} title={c.name} style={{ ['--i' as string]: k }} />)}
          </div>
          <div className="fr-oji"><img src={portrait('O')} alt="Ojiichan" /><div className="rr-say">{req.tasting[0]}</div></div>
          <div className="rr-say big">{withName(req.tasting[1], name)}</div>
          <div className="rr-score">
            {run.evaluations.map((e, k) => (
              <div key={k} className="rr-row">
                <img src={dishIcon(e.recipeId)} alt="" />
                {e.pieApples
                  ? e.pieApples.map((id) => <img key={id} src={appleIcon(id)} alt={apple(id).nameEn} className={golds[k] ? 'gold' : ''} />)
                  : <img src={appleIcon(e.appleId)} alt={apple(e.appleId).nameEn} className={golds[k] ? 'gold' : ''} />}
                <Stars n={e.score.stars} size={16} />
              </div>
            ))}
            {run.seal && <div className="rr-seal" data-testid="golden-seal">GOLDEN<br />SEAL</div>}
            <div className="rr-points" data-testid="menu-points">⭐ {m.base.toLocaleString()} × {m.mult} = <b>{m.total.toLocaleString()}</b></div>
          </div>
        </div>
      )}
      {beat === 'fireworks' && (
        <div className="fr-sky" key="fireworks">
          {Array.from({ length: 7 }, (_, k) => (
            <span key={k} className="fw" style={{ ['--i' as string]: k, left: `${14 + ((k * 37) % 72)}%`, top: `${10 + ((k * 29) % 56)}%`,
              ['--c' as string]: ['#FFD84A', '#FF6B5A', '#7CD14E', '#7FB2D8', '#F49AC1', '#FFFFFF', '#E8A92A'][k] }} aria-hidden>
              {Array.from({ length: 12 }, (_, j) => <i key={j} style={{ ['--a' as string]: `${j * 30}deg` }} />)}
            </span>
          ))}
          <div className="fr-kanpai">{withName(req.tasting[2], name)}</div>
          <div className="fr-line">{FEAST_FINALE.fireworks}</div>
        </div>
      )}
      {beat === 'map' && (
        <div className="fr-map" key="map">
          <WorldMap pins={REQUESTS.map((r) => ({ ...r.pin, label: r.place }))} home />
          <div className="fr-stamps" aria-hidden>{REQUESTS.map((r, k) => <span key={r.id} style={{ ['--i' as string]: k }}>{r.stamp}</span>)}</div>
          <div className="fr-line">{FEAST_FINALE.map}</div>
        </div>
      )}
      {beat === 'page' && <FeastPage name={name} />}
      {beat === 'photo' && <FeastPhoto name={name} reduced={reduced} />}
      <button className="btn primary huge" data-testid="feast-next" onClick={next}>
        {beat === 'photo' ? 'Put it in my scrapbook' : 'Next'}
      </button>
    </div>
  );
}

/** Ojiichan's last notebook page, written for the chef (also in the notebook once the feast is done). */
export function FeastPage({ name }: { name: string }) {
  return (
    <div className="feast-page" data-testid="feast-page">
      <div className="fp-title">{FEAST_FINALE.pageTitle}</div>
      {FEAST_FINALE.page.map((l) => <p key={l}>{withName(l, name || 'Chef')}</p>)}
      <div className="fp-sign"><img src={portrait('O')} alt="" />{withName(FEAST_FINALE.pageSign, name || 'Chef')}</div>
    </div>
  );
}

/** The feast photo: the chef and Ojiichan with every friend from around the world (kept in the scrapbook). */
export function FeastPhoto({ name, reduced, small = false }: { name: string; reduced: boolean; small?: boolean }) {
  const chef = useContext(ChefContext);
  return (
    <div className={`fp-card feast ${small ? 'small' : ''}`} data-testid="feast-photo">
      <div className="fp-pic">
        <div className="fp-back">
          <ChefPreview look={chef.look} reduced={reduced} framing="bust" rank={5} className="fp-chef" />
          <img className="fp-oji" src={portrait('O')} alt="Ojiichan" />
        </div>
        <div className="fp-front fp-crowd">
          {FEAST_CROWD.map((c) => <img key={c.id} src={portrait(c.id)} alt={c.name} title={c.name} />)}
        </div>
      </div>
      <div className="fp-caption">{withName(FEAST_FINALE.photo, name || 'Chef')}</div>
    </div>
  );
}

function RequestRewards({ state, req, name, reduced, dispatch }: { state: GameState; req: GoldenRequest; name: string; reduced: boolean; dispatch: D }) {
  const run = state.request!;
  useEffect(() => { if (run.first && !reduced) sfx.bell(); }, [run.first, reduced]);
  return (
    <div className={`req-rewards ${reduced ? 'still' : ''}`} role="dialog" aria-label="Rewards" data-testid="request-rewards">
      <div className="rw-card">
        <p className="rw-thanks">“{withName(req.thanks, name)}” <span>— {req.visitor}</span></p>
        {run.first && isFeast(req.id) ? (
          <div className="rw-items">
            <div className="rw-stamp" aria-label="Passport stamp: the World Apple Feast"><span>{req.stamp}</span><small>{req.place}</small></div>
            <div className="rw-gift">📖 {req.gift.name}<small>in your notebook</small></div>
            <div className="rw-soon">{FEAST_FINALE.season2}</div>
          </div>
        ) : run.first ? (
          <div className="rw-items">
            <div className="rw-stamp" aria-label={`Passport stamp: ${req.place}`}><span>{req.stamp}</span><small>{req.place}</small></div>
            <div className="rw-gift">🎁 {req.gift.name}<small>on your gift shelf</small></div>
          </div>
        ) : (
          <div className="rw-again">{run.seal ? 'You earned the Golden Seal!' : 'Gold apples and no breaks win the Golden Seal.'}</div>
        )}
      </div>
      <button className="btn primary huge" data-testid="request-done" onClick={() => { tap(); dispatch({ type: 'REQUEST_NEXT' }); }}>Back to the stall</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passport and world map (My chef)
// ---------------------------------------------------------------------------

/** Rough continents, as [lon, lat] rings, drawn on an equirectangular map. */
const LAND: number[][][] = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 62], [-60, 55], [-55, 48], [-70, 42], [-80, 30], [-82, 25], [-97, 26], [-105, 20], [-95, 16], [-83, 9], [-78, 8], [-90, 15], [-105, 23], [-117, 32], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 60]],
  [[-55, 60], [-45, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-52, -34], [-65, -42], [-70, -55], [-75, -45], [-72, -20], [-81, -5]],
  [[-10, 36], [0, 43], [-5, 48], [5, 52], [10, 55], [5, 58], [12, 65], [20, 70], [30, 70], [40, 66], [40, 45], [28, 41], [20, 40], [12, 38], [5, 44]],
  [[-5, 50], [1, 51], [0, 53], [-3, 58], [-6, 57], [-5, 54]],
  [[-17, 21], [-10, 30], [-5, 36], [10, 37], [32, 31], [43, 12], [51, 12], [40, -5], [40, -15], [33, -26], [20, -35], [13, -20], [9, -1], [-8, 5], [-17, 14]],
  [[40, 45], [40, 66], [60, 70], [80, 73], [110, 76], [140, 72], [170, 68], [180, 66], [160, 58], [142, 50], [135, 43], [122, 40], [122, 30], [110, 20], [105, 10], [98, 15], [92, 22], [80, 8], [72, 20], [60, 25], [50, 30], [36, 36], [28, 41]],
  [[130, 31], [135, 34], [141, 38], [142, 43], [145, 44], [141, 45], [139, 40], [136, 36], [130, 33]],
  [[114, -22], [122, -17], [131, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -31], [115, -34]],
  [[-180, -63], [-120, -62], [-75, -60], [-55, -63], [0, -62], [60, -61], [120, -62], [180, -63], [180, -72], [-180, -72]],
];
const AOMORI = { lat: 40.8, lon: 140.7 };
const xy = (lon: number, lat: number) => [lon + 180, 90 - lat] as const;

export function WorldMap({ pins, home = false }: { pins: { lat: number; lon: number; label: string; done?: boolean }[]; home?: boolean }) {
  const [hx, hy] = xy(AOMORI.lon, AOMORI.lat);
  return (
    <svg className="world-map" viewBox="0 10 360 150" role="img" aria-label={`World map: ${pins.map((p) => p.label).join(', ')}`}>
      <rect x="0" y="10" width="360" height="150" rx="10" className="wm-sea" />
      {LAND.map((ring, i) => <polygon key={i} className="wm-land" points={ring.map(([lo, la]) => xy(lo, la).join(',')).join(' ')} />)}
      {home && pins.map((p) => {
        const [x, y] = xy(p.lon, p.lat);
        return <path key={`l-${p.label}`} className="wm-route" d={`M${hx},${hy} Q${(hx + x) / 2},${Math.min(hy, y) - 25} ${x},${y}`} />;
      })}
      <circle cx={hx} cy={hy} r="3.2" className="wm-home" />
      {pins.map((p, i) => {
        const [x, y] = xy(p.lon, p.lat);
        return (
          <g key={p.label} className={`wm-pin ${p.done === false ? 'todo' : ''}`} style={{ ['--i' as string]: i }}>
            <path d={`M${x},${y} l-3.5,-7 a4,4 0 1,1 7,0 z`} />
            <circle cx={x} cy={y - 8.5} r="1.6" className="wm-dot" />
          </g>
        );
      })}
    </svg>
  );
}

/** Passport in My chef: a stamp per finished request, the world map, and replays. */
export function Passport({ state, onReplay }: { state: GameState; onReplay: (id: string) => void }) {
  const recs = state.progress.requests;
  const done = REQUESTS.filter((r) => recs[r.id]?.done);
  if (!done.length) return null;
  const feast = recs[FEAST.id]?.done;
  return (
    <div className="passport" data-testid="passport">
      <WorldMap pins={done.map((r) => ({ ...r.pin, label: r.place }))} />
      <div className="pp-stamps">
        {feast && (
          <div className="pp-stamp feast">
            <span className="pp-icon" aria-hidden>{FEAST.stamp}</span>
            <span className="pp-place">{FEAST.place}</span>
            <span className="pp-title">{FEAST.title}</span>
            {recs[FEAST.id].seal ? <span className="pp-seal">Golden Seal</span> : null}
            <button className="btn small" data-testid="replay-feast" onClick={() => { tap(); onReplay(FEAST.id); }}>Play again</button>
          </div>
        )}
        {done.map((r) => (
          <div key={r.id} className="pp-stamp">
            <span className="pp-icon" aria-hidden>{r.stamp}</span>
            <span className="pp-place">{r.place}</span>
            <span className="pp-title">{r.title}</span>
            {recs[r.id].seal ? <span className="pp-seal">Golden Seal</span> : null}
            <button className="btn small" data-testid={`replay-${r.id}`} onClick={() => { tap(); onReplay(r.id); }}>Play again</button>
          </div>
        ))}
      </div>
    </div>
  );
}
