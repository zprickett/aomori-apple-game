/**
 * How the stall builds up with the story rank. Helper starts with a bare stall (frame, roof,
 * counter, one crate); each rank adds pieces. `node` is a model root (cloned on its own) or, with
 * `inStall`, a part of the Stall model that is hidden until its rank.
 */
export interface StallPiece {
  node: string;
  rank: number;
  /** Shown in the "Your stall grew!" note. */
  name: string;
  /** A child of the Stall model rather than its own model root. */
  inStall?: boolean;
}

export const STALL_PIECES: readonly StallPiece[] = Object.freeze([
  { node: 'Noren_L', rank: 2, name: 'Noren curtains', inStall: true },
  { node: 'Noren_C', rank: 2, name: '', inStall: true },
  { node: 'Noren_R', rank: 2, name: '', inStall: true },
  { node: 'Upgrade_Sign', rank: 2, name: 'A hanging sign' },
  { node: 'Upgrade_Crate2', rank: 2, name: 'A second apple crate' },
  { node: 'Lantern', rank: 3, name: 'A paper lantern', inStall: true },
  { node: 'Chalkboard', rank: 3, name: 'A chalkboard menu', inStall: true },
  { node: 'Upgrade_Banner', rank: 3, name: 'Bunting' },
  { node: 'Upgrade_Oven', rank: 3, name: 'A brick oven' },
  { node: 'Upgrade_Bench', rank: 3, name: 'A bench for customers' },
  { node: 'Upgrade_Lanterns', rank: 4, name: 'A string of lanterns' },
  { node: 'Upgrade_Cart', rank: 4, name: 'A side cart' },
  { node: 'Upgrade_AppleTree', rank: 4, name: 'An apple tree' },
  { node: 'Upgrade_Trophy', rank: 5, name: 'A trophy shelf' },
]);

/** Names of what a rank adds to the stall (Golden Chef also turns the noren gold). */
export function stallGains(rank: number): string[] {
  const names = STALL_PIECES.filter((p) => p.rank === rank && p.name).map((p) => p.name);
  return rank === 5 ? ['Gold noren curtains', ...names] : names;
}
