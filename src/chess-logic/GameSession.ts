import { Chess } from 'chess.js';
import type { Color, Square, PieceSymbol } from 'chess.js';

/** A single move entry returned by getMoveList(). */
export interface MoveEntry {
  /** Standard Algebraic Notation string (e.g. "e4", "Nf3", "O-O") */
  san: string;
  /** Full-move number (1, 2, 3, …) */
  moveNumber: number;
  /** Side that played this move */
  color: 'w' | 'b';
}

/** A move entry enriched with before/after FEN positions, returned by getFenHistory(). */
export interface FenHistoryEntry {
  /** FEN of the position immediately before this move was played */
  fenBefore: string;
  /** FEN of the position immediately after this move was played */
  fenAfter: string;
  /** Standard Algebraic Notation string (e.g. "e4", "Nf3", "O-O") */
  san: string;
  /** Full-move number (1, 2, 3, …) */
  moveNumber: number;
  /** Side that played this move */
  color: 'w' | 'b';
}

/**
 * High-level wrapper around a `chess.js` Chess instance.
 *
 * Provides a simplified, UI-friendly API for loading games, traversing moves,
 * making/undoing moves, and querying game-over state.
 */
export class GameSession {
  private chess: Chess;

  constructor() {
    this.chess = new Chess();
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /**
   * Load a game from a PGN string.
   * Resets any existing game state.
   *
   * @throws if the PGN is invalid or contains illegal moves.
   */
  loadPgn(pgn: string): void {
    this.chess.loadPgn(pgn);
  }

  /**
   * Load a position from a FEN string.
   * Resets the move history — only the position is set.
   *
   * @throws if the FEN is invalid.
   */
  loadFen(fen: string): void {
    this.chess.load(fen);
  }

  // ---------------------------------------------------------------------------
  // Move list
  // ---------------------------------------------------------------------------

  /**
   * Return every move played so far as a flat list of `MoveEntry` objects,
   * ordered from the first move to the last.
   *
   * Uses `history({ verbose: true })` internally to extract SAN, color, and
   * reconstruct the full-move number.
   */
  getMoveList(): MoveEntry[] {
    const verboseMoves = this.chess.history({ verbose: true });
    const entries: MoveEntry[] = [];

    // chess.js verbose history gives Move objects with `color` and `before` FEN.
    // We derive the move number from the FEN's full-move counter (6th token).
    for (const move of verboseMoves) {
      // `before` is the FEN *before* this move was played.
      const fenTokens = move.before.split(' ');
      const moveNumber = parseInt(fenTokens[5], 10);

      entries.push({
        san: move.san,
        moveNumber,
        color: move.color,
      });
    }

    return entries;
  }

  /**
   * Return every move played so far as a flat list of `FenHistoryEntry`
   * objects, each carrying the FEN before and after the move.
   *
   * Useful for position-level analysis (e.g. feeding each FEN to an engine).
   */
  getFenHistory(): FenHistoryEntry[] {
    const verboseMoves = this.chess.history({ verbose: true });
    const entries: FenHistoryEntry[] = [];

    for (const move of verboseMoves) {
      const moveNumber = parseInt(move.before.split(' ')[5], 10);

      entries.push({
        fenBefore: move.before,
        fenAfter: move.after,
        san: move.san,
        moveNumber,
        color: move.color,
      });
    }

    return entries;
  }

  // ---------------------------------------------------------------------------
  // Making / undoing moves
  // ---------------------------------------------------------------------------

  /**
   * Attempt to make a move from one square to another.
   *
   * @param from  - Origin square in algebraic notation (e.g. "e2").
   * @param to    - Destination square (e.g. "e4").
   * @param promotion - Optional promotion piece: 'q' | 'r' | 'b' | 'n'.
   * @returns `true` if the move was legal and applied, `false` otherwise.
   */
  makeMove(from: string, to: string, promotion?: string): boolean {
    try {
      this.chess.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion as PieceSymbol | undefined,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Undo the last move. No-op if there is no move to undo.
   */
  undo(): void {
    this.chess.undo();
  }

  // ---------------------------------------------------------------------------
  // Game-over queries
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` when the game is over (checkmate, stalemate, draw by
   * insufficient material, threefold repetition, or 50-move rule).
   */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /**
   * If the game is over, returns a human-readable result string:
   *
   * - `"1-0"` — White wins by checkmate
   * - `"0-1"` — Black wins by checkmate
   * - `"1/2-1/2"` — Draw (stalemate, insufficient material, threefold
   *   repetition, or 50-move rule)
   *
   * Returns `null` when the game is still in progress.
   */
  getResult(): string | null {
    if (!this.chess.isGameOver()) {
      return null;
    }

    if (this.chess.isCheckmate()) {
      // The side whose turn it is has been checkmated — the *other* side wins.
      return this.chess.turn() === 'w' ? '0-1' : '1-0';
    }

    // Any other game-over condition is a draw.
    return '1/2-1/2';
  }

  // ---------------------------------------------------------------------------
  // Convenience accessors (expose underlying Chess for advanced use)
  // ---------------------------------------------------------------------------

  /** Return the current FEN string. */
  get fen(): string {
    return this.chess.fen();
  }

  /** Return whose turn it is. */
  get turn(): Color {
    return this.chess.turn();
  }
}
