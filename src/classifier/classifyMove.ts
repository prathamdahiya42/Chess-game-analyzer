/**
 * classifier/classifyMove.ts – Assign a qualitative label to a single move.
 *
 * All score values fed into this function must already be normalised to the
 * mover's perspective (positive = good for the player who played the move),
 * as produced by `evaluateGame.ts`.
 *
 * ── Classification thresholds (centipawns) ───────────────────────────────────
 *
 *   drop ≥ 200           →  'blunder'
 *   100 ≤ drop < 200     →  'mistake'
 *    50 ≤ drop < 100     →  'inaccuracy'
 *   drop < 50            →  'best' | 'excellent' | 'great' | 'good'
 *
 * Within the "drop < 50" tier the played move is compared with the engine's
 * top choice:
 *
 *   • move == engine best AND gap to 2nd-best > 150 cp  →  'great'
 *     (the engine found only one good move; the player found it too)
 *   • move within 10 cp of engine best                  →  'excellent'
 *   • move IS the engine best (by UCI string)            →  'best'
 *     (takes precedence over 'excellent')
 *   • otherwise                                          →  'good'
 *
 * Note: 'brilliant' is intentionally left to a higher-level annotator that
 * can detect sacrifices (material given up, engine says it's best).
 *
 * ── Mate score normalisation ─────────────────────────────────────────────────
 *
 * Stockfish reports forced-mate scores as very large numbers in its own
 * representation, but our `EngineLine.scoreValue` carries the raw mate
 * distance (e.g. +3 = mate in 3 for the mover, -2 = opponent mates in 2).
 * We map these to ±10 000 cp so that comparisons near forced mates remain
 * well-behaved without special-casing every arithmetic expression.
 */

import type { EngineLine, MoveClassification } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Sentinel centipawn value used to represent any forced-mate score. */
const MATE_CP = 10_000;

/** Thresholds (cp) that separate the four error tiers. */
const THRESHOLD_BLUNDER = 200;
const THRESHOLD_MISTAKE = 100;
const THRESHOLD_INACCURACY = 50;

/**
 * Within the "no significant drop" tier, a played move is considered to
 * match the engine's top choice if it is within this many centipawns.
 */
const BEST_MATCH_TOLERANCE_CP = 10;

/**
 * If the engine's best move is at least this many centipawns better than
 * the second-best move and the player chose that best move, the position
 * was "sharp" / "unique" → 'great'.
 */
const GREAT_GAP_CP = 150;

// ── Input / Output types ──────────────────────────────────────────────────────

export interface ClassifyMoveInput {
  /**
   * The best engine line for the position *before* the move was played.
   * (linesBefore[0] from EvaluatedMove, mover's perspective.)
   */
  evalBefore: EngineLine;

  /**
   * The best engine line for the position *after* the move was played.
   * (linesAfter[0] from EvaluatedMove, already flipped to mover's perspective.)
   */
  evalAfter: EngineLine;

  /**
   * The move that was actually played, in UCI long-algebraic notation
   * (e.g. "e2e4", "g1f3", "e1g1" for kingside castling).
   */
  playedMove: string;

  /**
   * All engine lines for the position *before* the move, sorted best-first
   * (linesBefore from EvaluatedMove).  Used to detect the "only good move"
   * gap that triggers 'great'.
   */
  bestMoveEval: EngineLine[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Normalise an `EngineLine` score to centipawns.
 *
 * - 'cp'   → returned as-is.
 * - 'mate' → mapped to ±MATE_CP, preserving sign:
 *              positive mate value  = mover is delivering mate  (+10 000)
 *              negative mate value  = mover is being mated      (-10 000)
 */
function toCp(line: EngineLine): number {
  if (line.scoreType === 'cp') return line.scoreValue;
  // Any forced-mate situation is treated as the maximum possible advantage.
  return line.scoreValue > 0 ? MATE_CP : -MATE_CP;
}

/**
 * Return the UCI move string that the engine considers best in the given set
 * of lines (the first move of the top PV, index 0).
 * Returns an empty string if the PV is missing.
 */
function engineBestMove(lines: EngineLine[]): string {
  return lines[0]?.pv[0] ?? '';
}

// ── Main classifier ───────────────────────────────────────────────────────────

/**
 * Classify a single move based on how much evaluation was lost and whether
 * the player found the engine's top choice.
 *
 * @param input  See {@link ClassifyMoveInput}.
 * @returns      A {@link MoveClassification} label.
 */
export function classifyMove(input: ClassifyMoveInput): MoveClassification {
  const { evalBefore, evalAfter, playedMove, bestMoveEval } = input;

  // Normalise both positions to centipawns (mover's perspective).
  const cpBefore = toCp(evalBefore);
  const cpAfter = toCp(evalAfter);

  // How many centipawns did the player lose by playing this move?
  // A positive drop means the position got worse for the mover.
  const drop = cpBefore - cpAfter;

  // ── Error tiers ──────────────────────────────────────────────────────────
  if (drop >= THRESHOLD_BLUNDER) return 'blunder';
  if (drop >= THRESHOLD_MISTAKE) return 'mistake';
  if (drop >= THRESHOLD_INACCURACY) return 'inaccuracy';

  // ── "No significant drop" tier ───────────────────────────────────────────

  const topMove = engineBestMove(bestMoveEval);
  const playedIsEngineBest = topMove !== '' && playedMove === topMove;

  // 'best': the played move is exactly the engine's top choice.
  // We resolve this label last so that 'great' can take priority when the
  // position is uniquely sharp.
  const topCp = toCp(bestMoveEval[0]);
  const secondCp = bestMoveEval[1] != null ? toCp(bestMoveEval[1]) : topCp - GREAT_GAP_CP - 1;
  const gapToSecondBest = topCp - secondCp;

  // 'great': the player found the only clearly good move in a sharp position.
  if (playedIsEngineBest && gapToSecondBest > GREAT_GAP_CP) {
    return 'great';
  }

  // 'best': played move matches the engine's top UCI move exactly.
  if (playedIsEngineBest) {
    return 'best';
  }

  // 'excellent': played move is within BEST_MATCH_TOLERANCE_CP of the top line.
  const playedCpAfterNormalised = cpAfter; // already mover-relative
  if (topCp - playedCpAfterNormalised <= BEST_MATCH_TOLERANCE_CP) {
    return 'excellent';
  }

  // Fallback: the move didn't lose much but wasn't particularly inspired.
  return 'good';
}
