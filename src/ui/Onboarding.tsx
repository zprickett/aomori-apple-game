/** First-run onboarding (welcome → story → make your chef) and the "Who's cooking?" profile picker. */
import { useMemo, useState } from 'react';
import {
  DEFAULT_LOOK, EYE_COLORS, HAIR_NAMES, MAX_PROFILES, NAME_MAX, OUTFIT_COLORS, chefLevel, cleanName, parseSave, saveKeyFor,
  type ChefLook, type ChefSex, type EyeColor, type HairStyle, type OutfitColor, type Profile,
} from '../core/index.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';

const tap = () => { unlockAudio(); sfx.tap(); };

// ---------------------------------------------------------------------------
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="onb welcome" data-testid="welcome">
      <div className="onb-sky" />
      <div className="wl-title">
        <span className="wl-ja" lang="ja">青森りんごキッチン</span>
        <h1>Aomori<br />Apple Kitchen</h1>
      </div>
      <ChefPreview look={DEFAULT_LOOK} className="wl-chef" />
      <div className="wl-apples" aria-hidden>🍎🍏🍎</div>
      <div className="onb-foot">
        <button className="btn primary huge" data-testid="get-started" onClick={() => { tap(); onStart(); }}>Get started</button>
      </div>
    </div>
  );
}

const STORY = [
  { icon: '🗾', title: 'Welcome to Aomori', body: 'Aomori is the home of apples in Japan. Its orchards grow more apples than anywhere else in the country!' },
  { icon: '🧺', title: 'Your own apple stall', body: 'Customers will ask for dishes. Pick the best apple, then tap, swipe and stir to cook it.' },
  { icon: '🏆', title: 'Become a Master Apple Chef', body: 'Collect all 100 apples, unlock new recipes and earn points to level up. Ready?' },
];

export function Story({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [i, setI] = useState(0);
  const s = STORY[i];
  const last = i === STORY.length - 1;
  return (
    <div className="onb story" data-testid="story">
      <div className="onb-sky" />
      <div className="st-card" key={i}>
        <div className="st-icon" aria-hidden>{s.icon}</div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
      </div>
      <div className="onb-foot">
        <div className="ov-dots">{STORY.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row onb-row">
          <button className="btn" onClick={() => { tap(); if (i === 0) onBack(); else setI(i - 1); }}>‹ Back</button>
          <button className="btn primary big" data-testid="story-next" onClick={() => { tap(); if (last) onDone(); else setI(i + 1); }}>
            {last ? 'Make my chef' : 'Next'}
          </button>
        </div>
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
      <ChefPreview look={look} className="mk-preview" />
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
          <span>Eyes</span>
          <div className="swatches">
            {(Object.keys(EYE_COLORS) as EyeColor[]).map((c) => (
              <button key={c} className={`swatch-btn ${look.eyes === c ? 'on' : ''}`} style={{ background: EYE_COLORS[c].hex }}
                aria-label={`${EYE_COLORS[c].label} eyes`} aria-pressed={look.eyes === c} data-testid={`eyes-${c}`} onClick={() => set({ eyes: c })} />
            ))}
          </div>
        </div>
        <div className="mk-row">
          <span>Outfit</span>
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
    return { orders: data.completedOrders, level: chefLevel(data.totalPoints) };
  } catch {
    return { orders: 0, level: chefLevel(0) };
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
        <span className="wl-ja" lang="ja">青森りんごキッチン</span>
        <h2>Who’s cooking today?</h2>
      </div>
      {p && <ChefPreview look={p.look} className="who-preview" />}
      <div className="who-list">
        {profiles.map((x) => (
          <button key={x.id} className={`who-card ${x.id === p?.id ? 'sel' : ''}`} data-testid={`profile-${x.name}`}
            onClick={() => { tap(); setSel(x.id); setConfirm(false); }}>
            <i className="who-dot" style={{ background: OUTFIT_COLORS[x.look.outfit].hex }} />
            <span className="who-name">{x.name}</span>
            <span className="who-meta">Lv {stats[x.id].level.level} · {stats[x.id].orders} orders</span>
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
