import { useState } from 'react';
import {
  APPLES, RECIPES, fitStars, pairing, selectors, unlockConditionText, recipeUnlockAt,
  type GameAction, type GameState,
} from '../core/index.ts';
import { appleIcon, dishIcon, Stars } from './icons.tsx';
import { sfx, unlockAudio } from '../game/audio.ts';

type D = (a: GameAction) => void;

export function TopBar({ state, onOpen, onExitPractice }: { state: GameState; onOpen: (k: 'collection' | 'practice' | 'settings') => void; onExitPractice: () => void }) {
  const inShop = state.phase === 'shop' && state.mode === 'order';
  const practice = state.mode === 'practice';
  const r = selectors.activeRecipe(state);
  const done = state.progress.completedOrders;
  return (
    <header className="topbar">
      <div className="status">
        {state.phase === 'cook' || state.phase === 'serve' ? (
          <span className="pill strong">{practice ? 'Practice · ' : ''}{r.name}</span>
        ) : (
          <>
            <span className="pill" aria-label={`${done} orders served`}>🧺 {done}</span>
            <span className="pill" aria-label={`${state.progress.unlockedApples.length} of 10 apples`}>🍎 {state.progress.unlockedApples.length}/10</span>
          </>
        )}
      </div>
      <nav className="menu">
        {inShop && (<>
          <button className="btn small" onClick={() => { unlockAudio(); onOpen('collection'); }} data-testid="open-collection">Apples</button>
          <button className="btn small" onClick={() => { unlockAudio(); onOpen('practice'); }} data-testid="open-practice">Practice</button>
          <button className="btn small" onClick={() => { unlockAudio(); onOpen('settings'); }} data-testid="open-settings" aria-label="Settings">⚙︎</button>
        </>)}
        {practice && state.phase !== 'result' && <button className="btn small" onClick={onExitPractice} data-testid="exit-practice">Exit practice</button>}
      </nav>
    </header>
  );
}

export function Notice({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null;
  return (
    <div className="notice" role="status" data-testid="notice">
      <span>{text}</span>
      <button className="btn small ghost" onClick={onClose} aria-label="Dismiss">OK</button>
    </div>
  );
}

export function Sheet({ kind, state, dispatch, onClose, persistent }: { kind: 'collection' | 'practice' | 'settings'; state: GameState; dispatch: D; onClose: () => void; persistent: boolean }) {
  const title = kind === 'collection' ? 'Apple collection' : kind === 'practice' ? 'Practice kitchen' : 'Settings';
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid={`sheet-${kind}`}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn small" onClick={onClose} data-testid="close-sheet">Close</button>
        </div>
        <div className="sheet-body">
          {kind === 'collection' && <Collection state={state} />}
          {kind === 'practice' && <Practice state={state} dispatch={dispatch} onClose={onClose} />}
          {kind === 'settings' && <Settings state={state} dispatch={dispatch} onClose={onClose} persistent={persistent} />}
        </div>
      </div>
    </div>
  );
}

const STAT_LABEL: Record<string, string> = { sweetness: 'Sweet', tartness: 'Tart', juiciness: 'Juicy', raw_firmness: 'Crunchy', aroma: 'Smell' };

function Collection({ state }: { state: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const [grown, setGrown] = useState(false);
  const disc = state.progress.discoveredPairings;
  return (
    <>
      <div className="coll-grid">
        {APPLES.map((a) => {
          const unlocked = state.progress.unlockedApples.includes(a.id);
          return (
            <button key={a.id} className={`coll-card ${unlocked ? '' : 'locked'} ${open === a.id ? 'sel' : ''}`} disabled={!unlocked} onClick={() => setOpen(open === a.id ? null : a.id)}>
              <img src={appleIcon(a.id)} alt="" className={unlocked ? '' : 'sil'} />
              <span className="nm">{unlocked ? a.nameEn.replace(' (Jonathan)', '') : '???'}</span>
              {!unlocked && <span className="lock">{unlockConditionText(a.id)}</span>}
            </button>
          );
        })}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={`f${i}`} className="coll-card future" aria-label="Future apple slot"><span className="q">?</span><span className="nm">Someday</span></div>
        ))}
      </div>
      {open && (() => {
        const a = APPLES.find((x) => x.id === open)!;
        return (
          <div className="coll-detail">
            <div className="ad-head"><img src={appleIcon(a.id)} alt="" /><div><div className="ad-name">{a.nameEn} <span className="ja" lang="ja">{a.nameJa}</span></div><div className="ad-trait">{a.overviewForKids}</div></div></div>
            <div className="stats">
              {Object.entries(a.stats).map(([k, v]) => (
                <div key={k} className="stat"><span>{STAT_LABEL[k] ?? k}</span><div className="bar"><i style={{ width: `${(v / 5) * 100}%` }} /></div></div>
              ))}
              <div className="fine">Game stats are friendly guides, not lab measurements.</div>
            </div>
            <div className="fits">
              {RECIPES.map((r) => {
                const key = `${a.id}:${r.id}`;
                const d = disc[key];
                return (
                  <div key={r.id} className="fit-row">
                    <img src={dishIcon(r.id)} alt="" /><span>{r.name}</span>
                    <span className="fit-stars"><Stars n={fitStars(a.id, r.id)} size={14} label={`Apple fit ${fitStars(a.id, r.id)} of 3`} /></span>
                    <span className="best">{d ? `Cooked: ${d.bestStars}★` : '—'}</span>
                  </div>
                );
              })}
            </div>
            {grown && (
              <div className="grownup">
                {RECIPES.map((r) => { const p = pairing(a.id, r.id); return <div key={r.id}><b>{r.name}</b>: {p.reason} <i>({p.evidenceBasis.replace(/_/g, ' ')}, {p.confidence} confidence)</i></div>; })}
              </div>
            )}
          </div>
        );
      })()}
      <div className="recipe-list">
        <h3>Recipes</h3>
        {RECIPES.map((r) => {
          const unlocked = state.progress.unlockedRecipes.includes(r.id);
          const best = state.progress.bestScores[r.id];
          return (
            <div key={r.id} className={`fit-row ${unlocked ? '' : 'locked'}`}>
              <img src={dishIcon(r.id)} alt="" /><span>{r.name}<small> · {r.steps.length} {r.steps.length === 1 ? 'action' : 'actions'}</small></span>
              <span className="best">{unlocked ? (best !== undefined ? <Stars n={best} size={14} /> : 'Not cooked yet') : `After ${recipeUnlockAt(r.id)} orders`}</span>
            </div>
          );
        })}
      </div>
      <label className="toggle small-print"><input type="checkbox" checked={grown} onChange={(e) => setGrown(e.target.checked)} /> Notes for grown-ups (why each fit rating)</label>
      {grown && (
        <div className="grownup">
          Fit ratings are authored game-design judgements informed by variety descriptions, not lab results. Timing windows are authored tuning values that still need child playtesting.
          {RECIPES.map((r) => <div key={r.id}><b>{r.name}</b>: {r.researchNote}</div>)}
        </div>
      )}
    </>
  );
}

function Practice({ state, dispatch, onClose }: { state: GameState; dispatch: D; onClose: () => void }) {
  return (
    <>
      <p className="muted">Try any recipe you’ve unlocked. Practice has no stars and doesn’t count as an order.</p>
      <div className="practice-list">
        {RECIPES.map((r) => {
          const unlocked = state.progress.unlockedRecipes.includes(r.id);
          return (
            <button key={r.id} className="practice-item" disabled={!unlocked} data-testid={`practice-${r.id}`}
              onClick={() => { sfx.tap(); dispatch({ type: 'START_PRACTICE', recipeId: r.id }); onClose(); }}>
              <img src={dishIcon(r.id)} alt="" />
              <span>{r.name}<small>{unlocked ? `${r.steps.length} ${r.steps.length === 1 ? 'action' : 'actions'}` : `Unlocks after ${recipeUnlockAt(r.id)} orders`}</small></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Settings({ state, dispatch, onClose, persistent }: { state: GameState; dispatch: D; onClose: () => void; persistent: boolean }) {
  const s = state.settings;
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof s>) => { dispatch({ type: 'SET_SETTINGS', settings: p }); unlockAudio(); };
  return (
    <div className="settings">
      <label className="toggle"><input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} data-testid="set-sound" /> Sound effects</label>
      <label className="toggle"><input type="checkbox" checked={s.assistance} onChange={(e) => set({ assistance: e.target.checked })} data-testid="set-assist" />
        <span>Helper mode<small>Wider timing windows and a helper bonus (marked on results).</small></span></label>
      <label className="toggle"><input type="checkbox" checked={s.altControls} onChange={(e) => set({ altControls: e.target.checked })} data-testid="set-alt" />
        <span>Button controls<small>Use a big button (or Space) instead of swiping and circling.</small></span></label>
      <div className="seg" role="radiogroup" aria-label="Reduced motion">
        <span>Less motion</span>
        {(['system', 'on', 'off'] as const).map((v) => (
          <button key={v} role="radio" aria-checked={s.reducedMotion === v} className={`btn small ${s.reducedMotion === v ? 'on' : ''}`} onClick={() => set({ reducedMotion: v })}>{v === 'system' ? 'Auto' : v === 'on' ? 'On' : 'Off'}</button>
        ))}
      </div>
      <p className="muted small-print">{persistent ? 'Progress is saved on this device.' : 'Progress cannot be saved on this device.'}</p>
      {!confirm ? (
        <button className="btn danger" onClick={() => setConfirm(true)} data-testid="reset">Reset progress…</button>
      ) : (
        <div className="confirm">
          <p>Start over? All apples, recipes and stars will be reset. Settings stay.</p>
          <div className="row">
            <button className="btn danger" data-testid="reset-confirm" onClick={() => { dispatch({ type: 'RESET_PROGRESS', confirm: true }); setConfirm(false); onClose(); }}>Yes, reset</button>
            <button className="btn" onClick={() => setConfirm(false)}>Keep my progress</button>
          </div>
        </div>
      )}
    </div>
  );
}
