/** First-run onboarding (welcome → make your chef → Ojiichan's letter, in Notebook.tsx) and the "Who's cooking?" profile picker. */
import { useMemo, useState } from 'react';
import {
  DEFAULT_LOOK, EYE_COLORS, HAIR_NAMES, MAX_PROFILES, NAME_MAX, OUTFIT_COLORS, cleanName, ladderProgress, rankInfo, parseSave, saveKeyFor,
  type ChefLook, type ChefSex, type EyeColor, type HairStyle, type OutfitColor, type Profile,
} from '../core/index.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { Logo } from './Logo.tsx';

const tap = () => { unlockAudio(); sfx.tap(); };

// ---------------------------------------------------------------------------
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="onb welcome" data-testid="welcome">
      <div className="onb-sky" />
      <div className="wl-title">
        <h1 className="sr-only">Aomori Apple Kitchen</h1>
        <Logo />
      </div>
      <ChefPreview look={DEFAULT_LOOK} className="wl-chef" />
      <div className="wl-apples" aria-hidden>🍎🍏🍎</div>
      <div className="onb-foot">
        <button className="btn primary huge" data-testid="get-started" onClick={() => { tap(); onStart(); }}>Get started</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ChefMaker({ initial, mode, onDone, onBack }: {
  initial?: Profile; mode: 'create' | 'edit'; onDone: (name: string, look: ChefLook) => void; onBack?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [look, setLook] = useState<ChefLook>(initial?.look ?? { sex: 'female', hair: 1, eyes: 'brown', outfit: 'red' });
  const set = (p: Partial<ChefLook>) => { tap(); setLook((l) => ({ ...l, ...p })); };
  const ok = cleanName(name).length > 0;
  return (
    <div className="onb maker" data-testid="chef-maker">
      <div className="mk-head">
        {onBack && <button className="btn small ghost" onClick={() => { tap(); onBack(); }}>‹ Back</button>}
        <h2>{mode === 'create' ? 'Make your chef' : 'Edit your chef'}</h2>
      </div>
      <ChefPreview look={look} framing="large" className="mk-preview" />
      <div className="mk-body">
        <label className="mk-row mk-name">
          <span>Name</span>
          <input data-testid="chef-name" value={name} maxLength={NAME_MAX} placeholder="Your chef name" autoComplete="off"
            onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="mk-row">
          <span>Chef</span>
          <div className="seg-btns">
            {(['female', 'male'] as ChefSex[]).map((sx) => (
              <button key={sx} className={`btn small ${look.sex === sx ? 'on' : ''}`} data-testid={`sex-${sx}`} aria-pressed={look.sex === sx}
                onClick={() => set({ sex: sx })}>{sx === 'female' ? 'Girl' : 'Boy'}</button>
            ))}
          </div>
        </div>
        <div className="mk-row">
          <span>Hair</span>
          <div className="seg-btns">
            {([1, 2, 3] as HairStyle[]).map((h) => (
              <button key={h} className={`btn small ${look.hair === h ? 'on' : ''}`} data-testid={`hair-${h}`} aria-pressed={look.hair === h}
                onClick={() => set({ hair: h })}>{HAIR_NAMES[look.sex][h - 1]}</button>
            ))}
          </div>
        </div>
        <div className="mk-row">
          <span>Eyes<small>{EYE_COLORS[look.eyes].label}</small></span>
          <div className="swatches">
            {(Object.keys(EYE_COLORS) as EyeColor[]).map((c) => (
              <button key={c} className={`swatch-btn ${look.eyes === c ? 'on' : ''}`} style={{ background: EYE_COLORS[c].hex }}
                aria-label={`${EYE_COLORS[c].label} eyes`} aria-pressed={look.eyes === c} data-testid={`eyes-${c}`} onClick={() => set({ eyes: c })} />
            ))}
          </div>
        </div>
        <div className="mk-row">
          <span>Outfit<small>{OUTFIT_COLORS[look.outfit].label}</small></span>
          <div className="swatches">
            {(Object.keys(OUTFIT_COLORS) as OutfitColor[]).map((c) => (
              <button key={c} className={`swatch-btn ${look.outfit === c ? 'on' : ''}`} style={{ background: OUTFIT_COLORS[c].hex }}
                aria-label={`${OUTFIT_COLORS[c].label} buttons and apron`} aria-pressed={look.outfit === c} data-testid={`outfit-${c}`} onClick={() => set({ outfit: c })} />
            ))}
          </div>
        </div>
      </div>
      <div className="onb-foot">
        <button className="btn primary huge" disabled={!ok} data-testid="chef-done" onClick={() => { tap(); onDone(cleanName(name), look); }}>
          {mode === 'create' ? 'Start cooking!' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function statsFor(id: string) {
  try {
    const { data } = parseSave(localStorage.getItem(saveKeyFor(id)));
    return { orders: data.completedOrders, rank: rankInfo(ladderProgress(data.totalPoints, data.ladder.length).rank).name };
  } catch {
    return { orders: 0, rank: rankInfo(1).name };
  }
}

export function WhoIsCooking({ profiles, activeId, onPlay, onNew, onDelete }: {
  profiles: Profile[]; activeId: string | null; onPlay: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | undefined>(activeId ?? profiles[0]?.id);
  const [confirm, setConfirm] = useState(false);
  const p = profiles.find((x) => x.id === sel) ?? profiles[0];
  const stats = useMemo(() => Object.fromEntries(profiles.map((x) => [x.id, statsFor(x.id)])), [profiles]);
  return (
    <div className="onb who" data-testid="who-is-cooking">
      <div className="who-title">
        <Logo className="sm" />
        <h2>Who’s cooking today?</h2>
      </div>
      {p && <ChefPreview look={p.look} className="who-preview" />}
      <div className="who-list">
        {profiles.map((x) => (
          <button key={x.id} className={`who-card ${x.id === p?.id ? 'sel' : ''}`} data-testid={`profile-${x.name}`}
            onClick={() => { tap(); setSel(x.id); setConfirm(false); }}>
            <i className="who-dot" style={{ background: OUTFIT_COLORS[x.look.outfit].hex }} />
            <span className="who-name">{x.name}</span>
            <span className="who-meta">{stats[x.id].rank} · {stats[x.id].orders} orders</span>
          </button>
        ))}
        {profiles.length < MAX_PROFILES && (
          <button className="who-card add" data-testid="new-chef" onClick={() => { tap(); onNew(); }}>＋ New chef</button>
        )}
      </div>
      <div className="onb-foot">
        {p && (confirm ? (
          <div className="confirm">
            <p>Delete {p.name}? Their apples, recipes and points will be gone.</p>
            <div className="row">
              <button className="btn danger" onClick={() => { onDelete(p.id); setConfirm(false); setSel(undefined); }}>Yes, delete</button>
              <button className="btn" onClick={() => setConfirm(false)}>Keep</button>
            </div>
          </div>
        ) : (
          <>
            <button className="btn primary huge" data-testid="play" onClick={() => { tap(); onPlay(p.id); }}>Play as {p.name}</button>
            <button className="btn small ghost who-del" onClick={() => setConfirm(true)}>Delete chef</button>
          </>
        ))}
      </div>
    </div>
  );
}
