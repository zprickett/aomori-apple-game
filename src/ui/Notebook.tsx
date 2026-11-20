/**
 * Ojiichan's letter (onboarding) and notebook: one page per rank with a riddle about that rank's
 * recipes (locked ones show as silhouettes), a doodle, a postcard from his travels and where the
 * stall sets up next.
 */
import { useContext, useState } from 'react';
import {
  GRANDPA, letterFor, notebookPage, openPages, rankInfo, recipe, selectors, unlockedRecipes, withName,
  type GameState, type NewsItem, type NotebookPage, type Rank, FIRST_LETTER, PROLOGUE, DEFAULT_LOOK, type ChefLook } from '../core/index.ts';
import { ChefPreview } from '../three/ChefPreview.tsx';
import { sfx, unlockAudio } from '../game/audio.ts';
import { BACKGROUNDS } from '../game/backgrounds.ts';
import { dishIcon, portrait } from './icons.tsx';
import { RankBadge } from './Ranks.tsx';
import { PhotoCard } from './Finale.tsx';
import { ChefContext } from '../game/chef.ts';

const tap = () => { unlockAudio(); sfx.tap(); };

export function NotebookPageView({ page, name, unlocked }: { page: NotebookPage; name: string; unlocked: readonly string[] }) {
  const moved = page.where ? BACKGROUNDS[page.backdrop] : null;
  return (
    <article className="nb-page" data-testid={`notebook-page-${page.rank}`}>
      <header className="nb-head">
        <RankBadge rank={page.rank} size={30} />
        <div>
          <div className="nb-kicker">Page {page.rank} · {rankInfo(page.rank).name}</div>
          <h3 className="nb-title">{page.title}</h3>
        </div>
      </header>
      {page.riddle && (
        <section className="nb-riddle">
          <p>“{page.riddle}”</p>
          <div className="nb-answers">
            {page.riddleRecipes.map((id) => {
              const open = unlocked.includes(id);
              return (
                <div key={id} className={`nb-answer ${open ? 'open' : ''}`}>
                  <img src={dishIcon(id)} alt="" className={open ? '' : 'sil'} />
                  <span>{open ? recipe(id).name : '?'}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="nb-doodle" aria-label="Doodle">
        <div className="nb-doodle-art" aria-hidden>{page.doodle.art}</div>
        <div className="nb-doodle-cap">{page.doodle.caption}</div>
      </section>
      {page.postcard && (
        <section className="nb-postcard" aria-label={`Postcard from ${page.postcard.place}`}>
          <div className="nb-pc-art" aria-hidden>{page.postcard.art}</div>
          <div className="nb-pc-body">
            <div className="nb-pc-place">{page.postcard.place}</div>
            <p>{page.postcard.text}</p>
          </div>
          <div className="nb-pc-stamp" aria-hidden>{page.postcard.stamp}</div>
        </section>
      )}
      {page.where && (
        <section className="nb-where">
          {moved && <div className="nb-where-pic" style={{ backgroundImage: `url(${moved.url})` }} aria-hidden />}
          <p>{withName(page.where, name)}</p>
        </section>
      )}
      <footer className="nb-sign">— {GRANDPA.name}</footer>
    </article>
  );
}

/** Onboarding, right after the chef maker: Ojiichan's letter, then notebook page 1. */
export function GrandpaLetter({ name, look, onDone }: { name: string; look?: ChefLook; onDone: () => void }) {
  const [step, setStep] = useState<'prologue' | 'letter' | 'page'>('prologue');
  const l = letterFor(name);
  if (step === 'prologue') return <Prologue name={name} look={look} onDone={() => setStep('letter')} />;
  return (
    <div className="onb letter-screen" data-testid="grandpa-letter">
      <div className="onb-sky" />
      {step === 'letter' && (
        <div className="lt-day" data-testid="letter-day">
          <span className="lt-day-n">Day 1</span>
          <span className="lt-day-t">Welcome to your apple stall!</span>
        </div>
      )}
      {step === 'letter' ? (
        <div className="lt-paper" key="letter">
          <div className="lt-stamp" aria-hidden>🍎</div>
          <p className="lt-greet">{l.greeting}</p>
          {l.body.map((b) => <p key={b}>{b}</p>)}
          <p className="lt-sign">{l.signoff}<br /><b>{l.signature}</b> <span lang="ja">{GRANDPA.nameJa}</span></p>
        </div>
      ) : (
        <div className="lt-notebook" key="page">
          <NotebookPageView page={notebookPage(1)} name={name} unlocked={unlockedRecipes(0)} />
        </div>
      )}
      <div className="onb-foot">
        {step === 'letter' ? (
          <button className="btn primary huge" data-testid="letter-next" onClick={() => { tap(); setStep('page'); }}>📖 Open the notebook</button>
        ) : (
          <button className="btn primary huge" data-testid="letter-done" onClick={() => { tap(); onDone(); }}>Let’s cook!</button>
        )}
      </div>
    </div>
  );
}

/**
 * The opening, a three-panel manga page before the letter: Ojiichan flies off, the chef arrives at
 * the empty stall, and a note waits on the counter (tap it to read the letter).
 */
function Prologue({ name, look, onDone }: { name: string; look?: ChefLook; onDone: () => void }) {
  return (
    <div className="onb prologue" data-testid="prologue">
      <div className="pr-panel pr-1">
        <div className="pr-sky" />
        <span className="pr-plane" aria-hidden>✈️</span>
        <img className="pr-oji" src={portrait('O')} alt="Ojiichan" />
        <span className="pr-case" aria-hidden>🧳</span>
        <div className="pr-say">{PROLOGUE.byeSay}</div>
        <div className="pr-cap">{PROLOGUE.bye}</div>
      </div>
      <div className="pr-panel pr-2" style={{ backgroundImage: `url(${BACKGROUNDS.aomori_city.url})` }}>
        <ChefPreview look={look ?? DEFAULT_LOOK} className="pr-chef" />
        <div className="pr-sfx">{PROLOGUE.arriveSay}</div>
        <div className="pr-cap">{withName(PROLOGUE.arrive, name)}</div>
      </div>
      <button type="button" className="pr-panel pr-3" data-testid="prologue-note" onClick={() => { tap(); onDone(); }}>
        <div className="pr-note">
          <span className="pr-pin" aria-hidden />
          <span className="pr-note-to">{withName(PROLOGUE.noteTo, name)}</span>
          <span aria-hidden>🍎</span>
        </div>
        <div className="pr-cap">{PROLOGUE.note}</div>
        <div className="pr-tap">Tap the note!</div>
      </button>
    </div>
  );
}

/** Full-screen "new page" after a rank-up. */
export function NotebookReveal({ rank, state, name, onDone }: { rank: Rank; state: GameState; name: string; onDone: () => void }) {
  return (
    <div className="reveal overview nb-reveal" role="dialog" aria-label="New notebook page" data-testid="notebook-reveal">
      <div className="nb-reveal-tag">📖 New notebook page!</div>
      <div className="nb-reveal-body">
        <NotebookPageView page={notebookPage(rank)} name={name} unlocked={state.progress.unlockedRecipes} />
      </div>
      <div className="ov-foot">
        <button className="btn primary huge" data-testid="notebook-next" onClick={() => { sfx.tap(); onDone(); }}>Next</button>
      </div>
    </div>
  );
}

/** The notebook from the My chef panel: flip through the open pages; later ones show locked. */
export function NotebookBook({ state, name }: { state: GameState; name: string }) {
  const rank = selectors.rank(state);
  const pages = openPages(rank);
  const [i, setI] = useState(pages.length - 1);
  const page = pages[Math.min(i, pages.length - 1)];
  const next = rank < 5 ? rankInfo(rank + 1) : null;
  return (
    <div className="nb-book" data-testid="notebook">
      <NotebookPageView page={page} name={name} unlocked={state.progress.unlockedRecipes} />
      <div className="nb-nav">
        <button className="btn small" disabled={i <= 0} onClick={() => { tap(); setI(i - 1); }} aria-label="Previous page">‹</button>
        <span className="nb-count">Page {page.rank} of 5</span>
        <button className="btn small" disabled={i >= pages.length - 1} onClick={() => { tap(); setI(i + 1); }} aria-label="Next page">›</button>
      </div>
      {next && i === pages.length - 1 && <div className="nb-locked">🔒 The next page opens at <b>{next.name}</b>.</div>}
    </div>
  );
}

/**
 * A news card: recognition for reaching a new rank, shown at the start of the next day. Says why it
 * came (the new rank) and who sent it, and each kind has its own entrance: the note drops in on a
 * pin and sways, the newspaper spins in, the invitation rises out of an opening envelope, the award
 * lands on gold rays with confetti.
 */
export function NewsCard({ item, name, first = false, onDone }: { item: NewsItem; name: string; first?: boolean; onDone: () => void }) {
  const r = rankInfo(item.rank);
  return (
    <div className={`news-backdrop k-${item.kind}`} role="dialog" aria-label={item.title} data-testid="news-card">
      {item.kind === 'award' && <div className="news-rays" aria-hidden />}
      {item.kind === 'invite' && (
        <div className="news-envelope" aria-hidden><div className="env-back" /><div className="env-flap" /><div className="env-front" /></div>
      )}
      <div className={`news-card n-${item.kind}`}>
        {item.kind === 'note' && <div className="news-pin" aria-hidden />}
        <div className="news-why"><RankBadge rank={item.rank} size={22} /> You’re {/^[AEIOU]/.test(r.name) ? 'an' : 'a'} {r.name} now!</div>
        {first && <div className="news-first" data-testid="news-first"><b>📬 Your first letter!</b> {FIRST_LETTER}</div>}
        <div className="news-icon" aria-hidden>{item.icon}</div>
        <div className="news-title">{item.title}</div>
        {item.kind === 'paper' && <img className="news-photo" src={dishIcon('rabbit_apples')} alt="Photo: rabbit apples" />}
        <p className="news-text">{withName(item.text, name)}</p>
        <div className="news-from">— {item.from}</div>
        {item.kind === 'award' && <img className="news-portrait" src={portrait('O')} alt="Ojiichan" />}
        <button className="btn primary big" data-testid="news-done" onClick={() => { tap(); onDone(); }}>
          {item.kind === 'award' ? 'Ojiichan!' : 'Yay!'}
        </button>
      </div>
      {item.kind === 'award' && (
        <div className="rp-confetti" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} className={['c-spark', 'c-petal', 'c-apple'][i % 3]}
              style={{ left: `${(i * 41 + 7) % 100}%`, animationDelay: `${((i * 0.37) % 2).toFixed(2)}s`, animationDuration: `${(2.8 + (i % 4) * 0.4).toFixed(1)}s`, ['--spin' as string]: `${(i * 53) % 360}deg` }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Scrapbook in My chef: every news card seen so far. */
export function Scrapbook({ state, name }: { state: GameState; name: string }) {
  const items = selectors.seenNews(state);
  const chef = useContext(ChefContext);
  const photo = state.progress.seenUnlockRewards.includes('finale');
  if (!items.length) return null;
  return (
    <div className="scrapbook" data-testid="scrapbook">
      {photo && <PhotoCard name={name} look={chef.look} reduced small />}
      {items.map((n) => (
        <div key={n.rank} className={`scrap n-${n.kind}`}>
          <span className="scrap-icon" aria-hidden>{n.icon}</span>
          <div><b>{n.title}</b><span>{withName(n.text, name)} — {n.from}</span></div>
        </div>
      ))}
    </div>
  );
}
