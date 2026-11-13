const iconMods = import.meta.glob('../assets/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function icon(name: string): string {
  return iconMods[`../assets/icons/${name}.webp`] ?? '';
}
export const appleIcon = (id: string) => icon(`apple_${id}`);
export const dishIcon = (id: string) => icon(`dish_${id}`);
export const portrait = (who: string) => icon(who === 'chef' ? 'chef_portrait' : `customer_${who}_portrait`);

export function Stars({ n, max = 3, size = 18, label }: { n: number; max?: number; size?: number; label?: string }) {
  const word = ['Bad fit', 'OK', 'Good', 'Best'][n] ?? '';
  return (
    <span className="stars" role="img" aria-label={label ?? `${n} of ${max} stars (${word})`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
            fill={i < n ? '#F4B93A' : 'none'} stroke={i < n ? '#C98A16' : '#B9A88E'} strokeWidth="1.6" strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

export function GestureIcon({ g }: { g: string }) {
  return (
    <span className={`gesture-icon g-${g}`} aria-label={g}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        {g === 'tap' && (<>
          <circle cx="16" cy="16" r="6" fill="currentColor" />
          <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        </>)}
        {g === 'swipe' && (<>
          <path d="M6 24 L26 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M19 7 L26 8 L25 15" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </>)}
        {g === 'circle' && (<>
          <path d="M16 5 A11 11 0 1 1 5.6 12.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M3.5 6.5 L5.6 12.8 L11.6 10.8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </>)}
      </svg>
    </span>
  );
}
