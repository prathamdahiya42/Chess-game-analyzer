/**
 * classifier/detectBrilliant.ts – Upgrade a move to 'brilliant' when it
 * constitutes a sound material sacrifice.
 *
 * A move qualifies as brilliant when ALL three conditions hold:
 *
 *  1. The base classification is already 'best' or 'excellent'
 *     (the engine agrees the move is objectively good).
 *
 *  2. The mover voluntarily gave up material — i.e. the total weighted
 *     piece value of their pieces dropped between fenBefore and fenAfter,
 *     using standard values: P=1 N=3 B=3 R=5 Q=9.
 *     Captures where the mover also takes an enemy piece are handled
 *     correctly because we look only at the *mover's own* material count.
 *     En-passant and promotion are handled by chess.js board parsing.
 *
 *  3. The position was not already trivially winning for the mover before
 *     the move (eval strictly between −DECISIVE_CP and +DECISIVE_CP,
 *     default ±600 cp). A player converting a +900 cp advantage can give
 *     up a rook "brilliantly" — we skip that noise.
 *
 * ── Why parse FEN instead of using move flags? ───────────────────────────────
 *
 * UCI move strings are long-algebraic (e.g. "e4d5") and carry no capture or
 * promotion metadata.  Parsing the FEN for both sides' material before and
 * after the move is the simplest approach that correctly handles:
 *   • promotions (pawn disappears, new piece appears)
 *   • en-passant captures (captured pawn is not on the destination square)
 *   • any future edge cases added to the game-logic layer
 *
 * chess.js v1.x exposes `Chess.board()` which returns an 8×8 matrix of
 * { type, color } | null entries — ideal for counting material.
 */

import { Chess } from 'chess.js';
import type { EngineLine, MoveClassification } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Standard piece values in pawns (integers for exact arithmetic). */
const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0, // kings are never captured; included for completeness
};

/**
 * Evaluations whose absolute value is at or above this threshold are
 * considered "trivially winning/losing" — we skip brilliant detection to
 * avoid noise in clearly decided games.
 */
const DECISIVE_CP = 600;

/** Sentinel cp value used for mate scores — mirrors classifyMove.ts. */
const MATE_CP = 10_000;

// ── Public types ──────────────────────────────────────────────────────────────

export interface DetectBrilliantInput {
  /**
   * The classification already assigned by `classifyMove()`.
   * Only 'best' and 'excellent' are candidates for upgrade.
   */
  currentClassification: MoveClassification;

  /**
   * FEN of the position *before* the move was played.
   * Used to count the mover's material and to read the eval.
   */
  fenBefore: string;

  /**
   * FEN of the position *after* the move was played.
   * Used to count the mover's material after the move.
   */
  fenAfter: string;

  /**
   * Best engine line for fenBefore, in the mover's perspective.
   * Used to check whether the pre-move position was already decisive.
   */
  evalBefore: EngineLine;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parse a FEN string and return the total weighted material for a given
 * color ('w' | 'b'), expressed in pawn units.
 *
 * @throws if the FEN is invalid (chess.js will throw).
 */
function countMaterial(fen: string, color: 'w' | 'b'): number {
  const chess = new Chess(fen);
  let total = 0;

  for (const row of chess.board()) {
    for (const square of row) {
      if (square && square.color === color) {
        total += PIECE_VALUE[square.type] ?? 0;
      }
    }
  }

  return total;
}

/**
 * Read the active side from a FEN string (the 2nd space-separated token).
 * Returns 'w' or 'b'.
 */
function sideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] as 'w' | 'b';
}

/**
 * Normalise an EngineLine score to centipawns (mover's perspective).
 * Mirrors the same helper in classifyMove.ts so the two modules are
 * self-contained and importable independently.
 */
function toCp(line: EngineLine): number {
  if (line.scoreType === 'cp') return line.scoreValue;
  return line.scoreValue > 0 ? MATE_CP : -MATE_CP;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Optionally upgrade a move's classification to 'brilliant'.
 *
 * Returns 'brilliant' when the move passes all three criteria; otherwise
 * returns `currentClassification` unchanged.
 *
 * @example
 * ```ts
 * const label = detectBrilliant({
 *   currentClassification: classifyMove(input),
 *   fenBefore: entry.fenBefore,
 *   fenAfter:  entry.fenAfter,
 *   evalBefore: entry.linesBefore[0],
 * });
 * ```
 */
export function detectBrilliant(input: DetectBrilliantInput): MoveClassification {
  const { currentClassification, fenBefore, fenAfter, evalBefore } = input;

  // ── Condition 1: base label must be 'best' or 'excellent' ─────────────────
  if (currentClassification !== 'best' && currentClassification !== 'excellent') {
    return currentClassification;
  }

  // ── Condition 3: position must not be trivially decisive ──────────────────
  // Check this before the (slightly more expensive) material counting.
  const cpBeforeAbsolute = Math.abs(toCp(evalBefore));
  if (cpBeforeAbsolute >= DECISIVE_CP) {
    return currentClassification;
  }

  // ── Condition 2: mover must have lost material ────────────────────────────
  const mover = sideToMove(fenBefore);

  let materialBefore: number;
  let materialAfter: number;

  try {
    materialBefore = countMaterial(fenBefore, mover);
    materialAfter = countMaterial(fenAfter, mover);
  } catch {
    // Defensive: if FEN parsing fails for any reason, don't upgrade.
    return currentClassification;
  }

  // A sacrifice means the mover's material strictly decreased.
  // Note: captures where the mover also takes an enemy piece register as
  // either a net loss (sacrifice) or a net gain (trade up) — only a net
  // loss in the *mover's own* material triggers this path.
  if (materialAfter >= materialBefore) {
    return currentClassification;
  }

  // All three conditions satisfied → upgrade to brilliant.
  return 'brilliant';
}
