/**
 * classifier/types.ts – Shared types for the move classification pipeline.
 */

/**
 * A single principal variation line returned by the engine, stripped down
 * to only the fields the classifier needs.
 *
 * Note: `scoreValue` here is always expressed from the perspective of the
 * player who just moved (positive = better for that player), regardless of
 * whose turn it was when Stockfish was queried.
 */
export interface EngineLine {
  /** Whether the score is in centipawns ('cp') or moves-to-mate ('mate'). */
  scoreType: 'cp' | 'mate';
  /**
   * Centipawns or moves-to-mate.
   * Positive  → the player who just moved is better.
   * Negative  → the player who just moved is worse.
   */
  scoreValue: number;
  /** Principal variation – sequence of UCI long-algebraic moves. */
  pv: string[];
}

/**
 * Qualitative label assigned to a move after comparing the evaluations
 * before and after it was played.
 */
export type MoveClassification =
  | 'blunder'
  | 'mistake'
  | 'inaccuracy'
  | 'good'
  | 'excellent'
  | 'great'
  | 'brilliant'
  | 'best';
