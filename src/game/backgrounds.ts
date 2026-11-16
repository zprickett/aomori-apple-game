/**
 * Painted backdrops behind the stall. Each is a portrait painting whose lower part is plain sandy
 * ground; the stall stands on that ground (the 3D ground only catches shadows).
 *
 * `groundTop` = fraction of the image height where the sandy ground starts.
 * Which one shows follows the story: the stall tours with the player's rank (core/story.ts).
 */
import aomoriCity from '../assets/backgrounds/aomori_city.webp';
import lakeTowada from '../assets/backgrounds/lake_towada.webp';
import takayamaInari from '../assets/backgrounds/takayama_inari.webp';

import { backdropForRank, type BackdropId, type Rank } from '../core/index.ts';

export type BackgroundId = BackdropId;

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

/** Screen height fraction where the sand should start: the stall's feet land just below it. */
export const GROUND_LINE = 0.56;

/**
 * Size and offset (fractions of the frame height) that put a backdrop's sand edge on GROUND_LINE
 * while still covering the whole frame.
 */
export function backdropFit(b: Backdrop): { top: number; height: number } {
  const height = Math.max(1, (1 - GROUND_LINE) / (1 - b.groundTop), GROUND_LINE / b.groundTop);
  return { top: GROUND_LINE - b.groundTop * height, height };
}

/** The backdrop for the player's rank. DEV only: `?bg=lake_towada` overrides it. */
export function backgroundFor(rank: Rank): Backdrop {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const id = new URLSearchParams(location.search).get('bg') as BackgroundId | null;
    if (id && id in BACKGROUNDS) return BACKGROUNDS[id];
  }
  return BACKGROUNDS[backdropForRank(rank)];
}
