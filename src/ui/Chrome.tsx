import { useState } from 'react';
import {
  APPLES, GOLDEN_LABEL, RECIPES, apple, fitStars, rankInfo, recipe, recipeLockText, selectors, unlockConditionText,
  type GameAction, type GameState,
} from '../core/index.ts';
import { appleIcon, dishIcon, Stars } from './icons.tsx';
import { RankBadge } from './Ranks.tsx';
import { PlayerSheet } from './Player.tsx';
import { sfx, unlockAudio } from '../game/audio.ts';

type D = (a: GameAction) => void;
export type SheetKind = 'collection' | 'practice' | 'settings' | 'history' | 'player';

export function TopBar({ state, onOpen, onExitPractice }: { state: GameState; onOpen: (k: SheetKind) => void; onExitPractice: () => void }) {
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
            {inShop ? (
              <button className="pill pill-btn" aria-label={`${done} orders served. See past orders`} data-testid="open-history" onClick={() => { unlockAudio(); onOpen('history'); }}>🧺 {done}</button>
            ) : (
              <span className="pill" aria-label={`${done} orders served`}>🧺 {done}</span>
            )}
            {!inShop && <span className="pill" aria-label={`${state.progress.unlockedApples.length} of ${APPLES.length} apples`}>🍎 {state.progress.unlockedApples.length}/{APPLES.length}</span>}
            {inShop && (
              <button className="pill pill-btn rank-pill" data-testid="open-player"
                aria-label={`My chef: ${rankInfo(selectors.rank(state)).name}, ${state.progress.totalPoints.toLocaleString()} points`}
                onClick={() => { unlockAudio(); onOpen('player'); }}>
                <RankBadge rank={selectors.rank(state)} size={22} />
              </button>
            )}
          </>
        )}
      </div>
      <nav className="menu">
        {inShop && (<>
          <button className="btn small" onClick={() => { unlockAudio(); onOpen('collection'); }} data-testid="open-collection"
            aria-label={`Apples: ${state.progress.unlockedApples.length} of ${APPLES.length} collected`}>🍎 {state.progress.unlockedApples.length}/{APPLES.length}</button>
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

export function Sheet({ kind, state, dispatch, onClose, persistent, chefName, onSwitchChef, onEditChef, onWatchIntro }: {
  kind: SheetKind; state: GameState; dispatch: D; onClose: () => void; persistent: boolean;
  chefName?: string; onSwitchChef?: () => void; onEditChef?: () => void; onWatchIntro?: () => void;
}) {
  const title = kind === 'collection' ? 'Apple collection' : kind === 'practice' ? 'Practice kitchen' : kind === 'history' ? 'Past orders'
    : kind === 'player' ? 'My chef' : 'Settings';
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
          {kind === 'history' && <History state={state} />}
          {kind === 'player' && <PlayerSheet state={state} onReplay={(id) => { onClose(); dispatch({ type: 'OPEN_REQUEST', id }); }} />}
          {kind === 'settings' && <Settings state={state} dispatch={dispatch} onClose={onClose} persistent={persistent}
            chefName={chefName} onSwitchChef={onSwitchChef} onEditChef={onEditChef} onWatchIntro={onWatchIntro} />}
        </div>
      </div>
    </div>
  );
}

const STAT_LABEL: Record<string, string> = { sweetness: 'Sweet', tartness: 'Tart', juiciness: 'Juicy', raw_firmness: 'Crunchy', aroma: 'Smell' };

function Collection({ state }: { state: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const disc = state.progress.discoveredPairings;
  const cooked = selectors.cookedApples(state);
  return (
    <>
      <div className="coll-count">{state.progress.unlockedApples.length} of {APPLES.length} apples collected · <span className="cooked-tick inline" aria-hidden>✓</span> {cooked.size} cooked</div>
      <div className="coll-grid">
        {APPLES.map((a) => {
          const unlocked = state.progress.unlockedApples.includes(a.id);
          return (
            <button key={a.id} className={`coll-card ${unlocked ? '' : 'locked'} ${open === a.id ? 'sel' : ''}`} disabled={!unlocked} onClick={() => setOpen(open === a.id ? null : a.id)}>
              {unlocked && cooked.has(a.id) && <span className="cooked-tick" aria-label="Cooked before">✓</span>}
              <img src={appleIcon(a.id)} alt="" className={unlocked ? '' : 'sil'} />
              <span className="nm">{unlocked ? a.nameEn.replace(' (Jonathan)', '') : '???'}</span>
              {!unlocked && <span className="lock">{unlockConditionText(a.id)}</span>}
            </button>
          );
        })}
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
          </div>
        );
      })()}
      <div className="recipe-list">
        <h3>Recipes</h3>
        {RECIPES.map((r) => {
          const unlocked = state.progress.unlockedRecipes.includes(r.id);
          const best = state.progress.bestPoints[r.id];
          return (
            <div key={r.id} className={`fit-row ${unlocked ? '' : 'locked'}`}>
              <img src={dishIcon(r.id)} alt="" /><span>{r.name}<small> · {r.steps.length} {r.steps.length === 1 ? 'action' : 'actions'}</small></span>
              <span className="best">{unlocked ? (best !== undefined ? `Best ${best.toLocaleString()} pts` : 'Not cooked yet') : recipeLockText(r.id, state.progress.ladder)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const PIP: Record<string, string> = { Perfect: 'p-Perfect', Good: 'p-Good', OK: 'p-OK', Miss: 'p-Miss' };

function History({ state }: { state: GameState }) {
  const p = state.progress;
  const orders = [...p.history].reverse();
  return (
    <div className="history" data-testid="history">
      <h3>Best scores</h3>
      <div className="hist-bests">
        {RECIPES.filter((r) => p.unlockedRecipes.includes(r.id)).map((r) => {
          const b = p.bestPoints[r.id];
          return (
            <div key={r.id} className="hist-best">
              <img src={dishIcon(r.id)} alt="" />
              <span className="nm">{r.name}</span>
              <b>{b !== undefined ? b.toLocaleString() : '—'}</b>
            </div>
          );
        })}
      </div>
      <h3>Orders</h3>
      {orders.length === 0 ? (
        <p className="muted">{p.completedOrders > 0 ? 'Orders from before scores were added aren’t listed. Your next order will show here.' : 'No orders yet. Your first one will show here!'}</p>
      ) : (
        <ol className="hist-list">
          {orders.map((o) => {
            const r = recipe(o.recipeId);
            const a = apple(o.appleId);
            return (
              <li key={o.orderId} className="hist-row">
                <span className="hist-no">#{o.orderNumber}</span>
                <img src={dishIcon(o.recipeId)} alt="" className="hist-dish" />
                <div className="hist-mid">
                  <div className="hist-name">{r.name}</div>
                  <div className="hist-apple"><img src={appleIcon(o.appleId)} alt="" />{a.nameEn.replace(' (Jonathan)', '')}</div>
                  <div className="beat-pips">{o.grades.map((g, i) => <span key={i} className={`pip ${PIP[g]}`} title={g} />)}</div>
                </div>
                <div className="hist-right">
                  <div className="hist-pts">{o.points.toLocaleString()}</div>
                  {o.golden && <div className="rank-mini golden">🏆 {GOLDEN_LABEL}</div>}
                  {o.newBest && <div className="new-best sm">BEST</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Practice({ state, dispatch, onClose }: { state: GameState; dispatch: D; onClose: () => void }) {
  return (
    <>
      <p className="muted">Practice doesn’t count as an order.</p>
      <div className="practice-list">
        {RECIPES.map((r) => {
          const unlocked = state.progress.unlockedRecipes.includes(r.id);
          return (
            <button key={r.id} className="practice-item" disabled={!unlocked} data-testid={`practice-${r.id}`}
              onClick={() => { sfx.tap(); dispatch({ type: 'START_PRACTICE', recipeId: r.id }); onClose(); }}>
              <img src={dishIcon(r.id)} alt="" />
              <span>{r.name}<small>{unlocked ? `${r.steps.length} ${r.steps.length === 1 ? 'action' : 'actions'}` : recipeLockText(r.id, state.progress.ladder)}</small></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Settings({ state, dispatch, onClose, persistent, chefName, onSwitchChef, onEditChef, onWatchIntro }: {
  state: GameState; dispatch: D; onClose: () => void; persistent: boolean;
  chefName?: string; onSwitchChef?: () => void; onEditChef?: () => void; onWatchIntro?: () => void;
}) {
  const s = state.settings;
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof s>) => { dispatch({ type: 'SET_SETTINGS', settings: p }); unlockAudio(); };
  return (
    <div className="settings">
      {(onEditChef || onSwitchChef) && (
        <div className="chef-row">
          <span className="chef-who">🧑‍🍳 {chefName}</span>
          {onEditChef && <button className="btn small" data-testid="edit-chef" onClick={() => { onClose(); onEditChef(); }}>Edit my chef</button>}
          {onSwitchChef && <button className="btn small" data-testid="switch-chef" onClick={() => { onClose(); onSwitchChef(); }}>Switch chef</button>}
        </div>
      )}
      <label className="toggle"><input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} data-testid="set-sound" /> Sound effects</label>
      <label className="toggle"><input type="checkbox" checked={s.assistance} onChange={(e) => set({ assistance: e.target.checked })} data-testid="set-assist" />
        <span>Easy timing<small>Wider timing windows for every action.</small></span></label>
      <label className="toggle"><input type="checkbox" checked={s.altControls} onChange={(e) => set({ altControls: e.target.checked })} data-testid="set-alt" />
        <span>Button controls<small>Use a big button (or Space) instead of swiping and circling.</small></span></label>
      {onWatchIntro && <button className="btn" data-testid="watch-intro" onClick={() => { unlockAudio(); onClose(); onWatchIntro(); }}>▶ Watch the intro</button>}
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
