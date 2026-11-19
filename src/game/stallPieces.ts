/**
 * How the stall builds up with the story rank, from the original stall's own parts (split apart
 * in assets/blender/stall.py) so the stall always keeps its design and framing. Helper starts with
 * the bare wooden frame, counter and one crate; Golden Chef has the full original stall.
 * `inStall` = a part of the Stall model; otherwise its own model root, cloned separately.
 */
export interface StallPiece {
  node: string;
  rank: number;
  inStall?: boolean;
}

export const STALL_PIECES: readonly StallPiece[] = Object.freeze([
  // Apprentice: the red awning and the apple counter cloth
  { node: 'Stall_Roof', rank: 2, inStall: true },
  { node: 'Counter_Cloth', rank: 2, inStall: true },
  // Cook: noren curtains on their rod, the paper lantern on its bracket
  { node: 'Noren_L', rank: 3, inStall: true },
  { node: 'Noren_C', rank: 3, inStall: true },
  { node: 'Noren_R', rank: 3, inStall: true },
  { node: 'Noren_Rod', rank: 3, inStall: true },
  { node: 'Lantern', rank: 3, inStall: true },
  { node: 'Lantern_Bracket', rank: 3, inStall: true },
  // Head Cook: chalkboard menu, a second crate, the hanging sign
  { node: 'Chalkboard', rank: 4, inStall: true },
  { node: 'Upgrade_Crate2', rank: 4 },
  { node: 'Upgrade_Sign', rank: 4 },
  // Golden Chef: bunting
  { node: 'Upgrade_Banner', rank: 5 },
]);
