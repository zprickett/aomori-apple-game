/**
 * Ojiichan's letter (onboarding) and notebook: one page per rank with a riddle about that rank's
 * recipes (locked ones show as silhouettes), a doodle, a postcard from his travels and where the
 * stall sets up next.
 */
import { useState } from 'react';
import {
  GRANDPA, letterFor, notebookPage, openPages, rankInfo, recipe, selectors, unlockedRecipes, withName,
  type GameState, type NewsItem, type NotebookPage, type Rank,
} from '../core/index.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { BACKGROUNDS } from '../game/backgrounds.ts';
import { dishIcon, portrait } from './icons.tsx';
import { RankBadge } from './Ranks.tsx';

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
export function GrandpaLetter({ name, onDone }: { name: string; onDone: () => void }) {
  const [step, setStep] = useState<'letter' | 'page'>('letter');
  const l = letterFor(name);
  return (
    <div className="onb letter-screen" data-testid="grandpa-letter">
      <div className="onb-sky" />
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

/** A news card (recognition after a rank-up), shown at the start of the next day. */
export function NewsCard({ item, name, onDone }: { item: NewsItem; name: string; onDone: () => void }) {
  return (
    <div className="news-backdrop" role="dialog" aria-label={item.title} data-testid="news-card">
      <div className={`news-card n-${item.kind}`}>
        <div className="news-icon" aria-hidden>{item.icon}</div>
        <div className="news-title">{item.title}</div>
        <p className="news-text">{withName(item.text, name)}</p>
        {item.kind === 'award' && <img className="news-portrait" src={portrait('O')} alt="Ojiichan" />}
        <button className="btn primary big" data-testid="news-done" onClick={() => { tap(); onDone(); }}>
          {item.kind === 'award' ? 'Ojiichan!' : 'Yay!'}
        </button>
      </div>
    </div>
  );
}

/** Scrapbook in My chef: every news card seen so far. */
export function Scrapbook({ state, name }: { state: GameState; name: string }) {
  const items = selectors.seenNews(state);
  if (!items.length) return null;
  return (
    <div className="scrapbook" data-testid="scrapbook">
      {items.map((n) => (
        <div key={n.rank} className={`scrap n-${n.kind}`}>
          <span className="scrap-icon" aria-hidden>{n.icon}</span>
          <div><b>{n.title}</b><span>{withName(n.text, name)}</span></div>
        </div>
      ))}
    </div>
  );
}
