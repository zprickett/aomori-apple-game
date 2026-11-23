/**
 * The game's manga-style name logo: a jagged speech burst behind chunky outlined letters, the
 * Japanese name on a red ribbon, and an apple standing in for the first "o" of Aomori.
 * `slam` plays the entrance (the intro's title moment); without it the logo just sits there.
 */
const AOMORI = ['A', 'apple', 'm', 'o', 'r', 'i'] as const;
const KITCHEN = 'Apple Kitchen';

/** The burst: a jagged ring of points (a manga shout bubble). */
function burstPath(n = 18, rx = 200, ry = 118, cx = 210, cy = 130): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : 0.8 + ((i * 7) % 5) * 0.025;
    pts.push(`${(cx + Math.cos(a) * rx * k).toFixed(1)},${(cy + Math.sin(a) * ry * k).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}
const BURST = burstPath();

function LogoApple() {
  return (
    <svg className="logo-apple" viewBox="-60 -70 120 130" aria-hidden>
      <path d="M0 -34 C-20 -50 -56 -46 -57 -6 C-58 30 -30 56 -10 52 C-4 50 4 50 10 52 C30 56 58 30 57 -6 C56 -46 20 -50 0 -34 Z"
        fill="#D94232" stroke="#4A3326" strokeWidth="9" strokeLinejoin="round" paintOrder="stroke" />
      <ellipse cx="-28" cy="-20" rx="8" ry="13" transform="rotate(30 -28 -20)" fill="#FFFAF0" opacity="0.85" />
      <path d="M-2 -36 Q0 -50 8 -60" fill="none" stroke="#4A3326" strokeWidth="7" strokeLinecap="round" />
      <path d="M6 -52 Q24 -68 44 -58 Q28 -42 6 -52 Z" fill="#6A8C42" stroke="#4A3326" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ slam = false, className = '' }: { slam?: boolean; className?: string }) {
  return (
    <div className={`logo ${slam ? 'slam' : ''} ${className}`} role="img" aria-label="Aomori Apple Kitchen" data-testid="logo">
      <svg className="logo-burst" viewBox="0 0 420 260" aria-hidden>
        <path d={BURST} fill="#FFFAF0" stroke="#4A3326" strokeWidth="6" strokeLinejoin="round" />
      </svg>
      <span className="logo-ja" lang="ja" aria-hidden>青森りんごキッチン</span>
      <span className="logo-a" aria-hidden>
        {AOMORI.map((c, i) => c === 'apple'
          ? <span key={i} className="logo-ch logo-o" style={{ ['--i' as string]: i }}><LogoApple /></span>
          : <span key={i} className="logo-ch" style={{ ['--i' as string]: i }}>{c}</span>)}
      </span>
      <span className="logo-b" aria-hidden>
        {KITCHEN.split('').map((c, i) => <span key={i} className="logo-ch" style={{ ['--i' as string]: i + 6 }}>{c === ' ' ? ' ' : c}</span>)}
      </span>
    </div>
  );
}
