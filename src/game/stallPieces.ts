/**
 * How the stall builds up along the chef's ladder (core/ranks.ts LADDER), from the original
 * stall's own parts (split apart in assets/blender/stall.py) so the stall always keeps its design
 * and framing. Helper starts with the bare wooden frame, counter and one crate; Golden Chef has
 * the full original stall. `step` = the ladder step index that brings the piece.
 * `inStall` = a part of the Stall model; otherwise its own model root, cloned separately.
 */
export interface StallPiece {
  node: string;
  step: number;
  inStall?: boolean;
  /** Kid-facing name, for the piece that stands for its step ("Stall upgrade!" and "next" lines). */
  label?: string;
}

export const STALL_PIECES: readonly StallPiece[] = Object.freeze([
  // Apprentice: the red awning; Apprentice ★: the apple counter cloth
  { node: 'Stall_Roof', step: 0, inStall: true, label: 'Red awning' },
  { node: 'Counter_Cloth', step: 1, inStall: true, label: 'Apple counter cloth' },
  // Cook: noren curtains on their rod; Cook ★: the paper lantern on its bracket
  { node: 'Noren_L', step: 3, inStall: true, label: 'Noren curtains' },
  { node: 'Noren_C', step: 3, inStall: true },
  { node: 'Noren_R', step: 3, inStall: true },
  { node: 'Noren_Rod', step: 3, inStall: true },
  { node: 'Lantern', step: 4, inStall: true, label: 'Paper lantern' },
  { node: 'Lantern_Bracket', step: 4, inStall: true },
  // Head Cook: chalkboard menu; ★: a second crate; ★★: the hanging sign
  { node: 'Chalkboard', step: 6, inStall: true, label: 'Chalkboard menu' },
  { node: 'Upgrade_Crate2', step: 7, label: 'Second apple crate' },
  { node: 'Upgrade_Sign', step: 8, label: 'Hanging sign' },
  // Golden Chef: bunting
  { node: 'Upgrade_Banner', step: 9, label: 'Bunting' },
]);

/** Stall pieces a ladder step brings (for the "Stall upgrade!" toast). */
export function piecesAtStep(step: number): StallPiece[] {
  return STALL_PIECES.filter((p) => p.step === step);
}

/**
 * The ladder step whose stall piece this delivery shows off (rank step first, then ★ steps), or
 * undefined. Until its moment plays, the stall is shown without that piece.
 */
export function upgradeStepOf(d: { rank: number | null; steps: readonly number[] }, rankStep: number | null): number | undefined {
  const candidates = [...(rankStep !== null ? [rankStep] : []), ...d.steps];
  return candidates.find((st) => piecesAtStep(st).some((x) => x.label));
}

/** The kid-facing name of what a step adds to the stall. */
export function stepPieceLabel(step: number): string {
  return piecesAtStep(step).find((x) => x.label)?.label ?? '';
}
