/**
 * Painted backdrops behind the stall. Each is a portrait painting whose lower part is plain sandy
 * ground; the stall stands on that ground (the 3D ground only catches shadows).
 *
 * `groundTop` = fraction of the image height where the sandy ground starts (used to line the
 * stall's feet up with it). Phase 2 story work picks which one shows; for now it's Aomori City.
 */
import aomoriCity from '../assets/backgrounds/aomori_city.webp';
import lakeTowada from '../assets/backgrounds/lake_towada.webp';
import takayamaInari from '../assets/backgrounds/takayama_inari.webp';

export type BackgroundId = 'aomori_city' | 'lake_towada' | 'takayama_inari';

export interface Backdrop {
  id: BackgroundId;
  name: string;
  url: string;
  groundTop: number;
}

export const BACKGROUNDS: Readonly<Record<BackgroundId, Backdrop>> = Object.freeze({
  aomori_city: { id: 'aomori_city', name: 'Aomori City', url: aomoriCity, groundTop: 0.56 },
  lake_towada: { id: 'lake_towada', name: 'Lake Towada', url: lakeTowada, groundTop: 0.655 },
  takayama_inari: { id: 'takayama_inari', name: 'Takayama Inari Shrine', url: takayamaInari, groundTop: 0.62 },
});

export const DEFAULT_BACKGROUND: BackgroundId = 'aomori_city';

/** DEV only: `?bg=lake_towada` previews another backdrop. */
export function currentBackground(): Backdrop {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const id = new URLSearchParams(location.search).get('bg') as BackgroundId | null;
    if (id && id in BACKGROUNDS) return BACKGROUNDS[id];
  }
  return BACKGROUNDS[DEFAULT_BACKGROUND];
}
