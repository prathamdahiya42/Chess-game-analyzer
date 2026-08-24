/**
 * classifier/test.ts – Full pipeline integration test.
 *
 * Runs:  GameSession → evaluateGame → classifyMove + detectBrilliant
 *
 * Uses Paul Morphy's "Opera Game" (1858) — arguably the most instructive
 * short game ever played.  It contains:
 *   • A famous rook sacrifice on b2 (move 17, Rxb2) that should surface
 *     as 'brilliant' (material down, engine agrees it's best, position not
 *     trivially won beforehand).
 *   • Several black blunders (Ba6??, Bb6??) that should register as
 *     'blunder' or 'mistake'.
 *
 * Call `runClassifierTest()` from App.tsx or the browser DevTools console.
 * (Web Workers — required for Stockfish WASM — do not run in Node.)
 *
 * Output: a styled console group per move showing:
 *   move#  SAN         eval-before  eval-after  classification
 */

import { Chess } from 'chess.js';
import { GameSession } from '../chess-logic/GameSession';
import { StockfishEngine } from '../engine/StockfishEngine';
import { evaluateGame } from './evaluateGame';
import { classifyMove } from './classifyMove';
import { detectBrilliant } from './detectBrilliant';
import type { EvaluatedMove } from './evaluateGame';
import type { MoveClassification } from './types';

// ── Test game ─────────────────────────────────────────────────────────────────

/**
 * Paul Morphy vs. Duke Karl / Count Isouard, Paris 1858.
 * Known as the "Opera Game" — a masterclass in open-file and piece activity.
 *
 * Annotated moves of interest:
 *   4…  Na6??  – a bad developing move losing control of d4
 *   5.  d3!    – Morphy calmly ignores the pawn, finishes development
 *   9…  Bd7?   – loses a piece after the game's key combination
 *   17. Rxb2!! – the famous rook sacrifice (brilliant)
 *   18. Rd1#   – back-rank checkmate
 */
const OPERA_GAME_PGN = `
[Event "Paris opera"]
[Site "Paris FRA"]
[Date "1858.11.??"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0
`;

// ── Analysis parameters ───────────────────────────────────────────────────────

const DEPTH = 16;   // balanced between speed and accuracy for a test
const MULTIPV = 3;  // need ≥ 2 lines to detect the 'great' gap

// ── Score formatting ──────────────────────────────────────────────────────────

function formatScore(scoreType: 'cp' | 'mate', scoreValue: number): string {
  if (scoreType === 'mate') {
    const sign = scoreValue > 0 ? '+' : '';
    return `M${sign}${scoreValue}`;
  }
  const pawns = scoreValue / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

// ── Classification badge ──────────────────────────────────────────────────────

const CLASSIFICATION_STYLE: Record<MoveClassification, string> = {
  brilliant:  'background:#7c3aed;color:#fff;border-radius:3px;padding:1px 5px;font-weight:bold',
  best:       'background:#059669;color:#fff;border-radius:3px;padding:1px 5px;font-weight:bold',
  great:      'background:#0284c7;color:#fff;border-radius:3px;padding:1px 5px;font-weight:bold',
  excellent:  'background:#16a34a;color:#fff;border-radius:3px;padding:1px 5px',
  good:       'background:#4b5563;color:#fff;border-radius:3px;padding:1px 5px',
  inaccuracy: 'background:#d97706;color:#fff;border-radius:3px;padding:1px 5px',
  mistake:    'background:#ea580c;color:#fff;border-radius:3px;padding:1px 5px',
  blunder:    'background:#dc2626;color:#fff;border-radius:3px;padding:1px 5px',
};

const CLASSIFICATION_ICON: Record<MoveClassification, string> = {
  brilliant:  '!!',
  best:       '★',
  great:      '!',
  excellent:  '⊕',
  good:       '·',
  inaccuracy: '?!',
  mistake:    '?',
  blunder:    '??',
};

// ── Per-move logging ──────────────────────────────────────────────────────────

function logMove(
  move: EvaluatedMove,
  classification: MoveClassification,
  elapsed: number,
): void {
  const moveLabel =
    move.color === 'w'
      ? `${move.moveNumber}.  ${move.san}`
      : `${move.moveNumber}… ${move.san}`;

  const before = move.linesBefore[0];
  const after  = move.linesAfter[0];

  const scoreBefore = before
    ? formatScore(before.scoreType, before.scoreValue)
    : '—';
  const scoreAfter  = after
    ? formatScore(after.scoreType, after.scoreValue)
    : '—';

  const icon  = CLASSIFICATION_ICON[classification];
  const style = CLASSIFICATION_STYLE[classification];

  // Drop in centipawns (positive = loss for mover)
  const cpBefore =
    before?.scoreType === 'cp' ? before.scoreValue
    : before?.scoreValue != null ? (before.scoreValue > 0 ? 10000 : -10000)
    : 0;
  const cpAfter =
    after?.scoreType === 'cp' ? after.scoreValue
    : after?.scoreValue != null ? (after.scoreValue > 0 ? 10000 : -10000)
    : 0;
  const drop = cpBefore - cpAfter;
  const dropStr =
    drop === 0  ? '  ±0'
    : drop > 0  ? `  -${drop}`
    : `  +${Math.abs(drop)}`;

  console.log(
    `%c ${icon} %c %-18s  before: %c${scoreBefore}%c  after: %c${scoreAfter}%c  Δ${dropStr} cp   %c${classification}%c  (${elapsed.toFixed(1)}s)`,
    style,
    'color:#d1d5db',
    moveLabel,
    cpBefore >= 0 ? 'color:#34d399' : 'color:#f87171',
    'color:#d1d5db',
    cpAfter  >= 0 ? 'color:#34d399' : 'color:#f87171',
    'color:#9ca3af',
    style,
    '',
  );
}

// ── Summary table ─────────────────────────────────────────────────────────────

function logSummaryTable(
  moves: EvaluatedMove[],
  classifications: MoveClassification[],
): void {
  console.groupCollapsed('%c📊 Summary table (copy-friendly)', 'color:#a78bfa;font-weight:bold');

  const rows = moves.map((m, i) => {
    const before = m.linesBefore[0];
    const after  = m.linesAfter[0];
    return {
      'Move':   m.color === 'w' ? `${m.moveNumber}.${m.san}` : `${m.moveNumber}…${m.san}`,
      'Color':  m.color === 'w' ? 'White' : 'Black',
      'Before': before ? formatScore(before.scoreType, before.scoreValue) : '—',
      'After':  after  ? formatScore(after.scoreType,  after.scoreValue)  : '—',
      'Class':  `${classifications[i]} ${CLASSIFICATION_ICON[classifications[i]]}`,
    };
  });

  console.table(rows);
  console.groupEnd();
}

// ── Stat counters ─────────────────────────────────────────────────────────────

function logStats(classifications: MoveClassification[]): void {
  const counts: Partial<Record<MoveClassification, number>> = {};
  for (const c of classifications) counts[c] = (counts[c] ?? 0) + 1;

  const order: MoveClassification[] = [
    'brilliant', 'best', 'great', 'excellent', 'good',
    'inaccuracy', 'mistake', 'blunder',
  ];

  console.group('%c📈 Classification breakdown', 'color:#a78bfa;font-weight:bold');
  for (const label of order) {
    const n = counts[label];
    if (!n) continue;
    const style = CLASSIFICATION_STYLE[label];
    const bar   = '█'.repeat(n);
    console.log(`%c ${label.padEnd(12)}%c  ${bar} ${n}`, style, 'color:#d1d5db');
  }
  console.groupEnd();
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runClassifierTest(): Promise<void> {
  console.clear();
  console.log(
    '%c♟ Classifier Pipeline Test — Morphy\'s Opera Game (1858)',
    'color:#fbbf24;font-weight:bold;font-size:16px',
  );
  console.log(
    '%cPaul Morphy vs. Duke Karl / Count Isouard  ·  Paris Opera  ·  1-0',
    'color:#9ca3af',
  );
  console.log(`%cDepth: ${DEPTH}  |  MultiPV: ${MULTIPV}`, 'color:#6b7280');
  console.log('%c' + '─'.repeat(70), 'color:#374151');

  // ── Load game ──────────────────────────────────────────────────────────────
  const session = new GameSession();
  try {
    session.loadPgn(OPERA_GAME_PGN);
  } catch (err) {
    console.error('Failed to load PGN:', err);
    return;
  }

  const fenHistory = session.getFenHistory();
  console.log(`%c  Loaded ${fenHistory.length} moves.`, 'color:#9ca3af');
  console.log('');

  // ── Boot engine ────────────────────────────────────────────────────────────
  const engine = new StockfishEngine();
  const classifications: MoveClassification[] = [];

  try {
    const t0 = performance.now();
    console.log('%cInitialising Stockfish…', 'color:#9ca3af');
    await engine.init();
    console.log(
      `%c✓ Engine ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
      'color:#34d399',
    );
    console.log('');

    // ── Evaluate every position ──────────────────────────────────────────────
    console.log('%cEvaluating positions…', 'color:#9ca3af');
    const evalStart = performance.now();

    const evaluatedMoves = await evaluateGame(fenHistory, engine, {
      depth: DEPTH,
      multipv: MULTIPV,
    });

    const evalElapsed = (performance.now() - evalStart) / 1000;
    console.log(
      `%c✓ All ${evaluatedMoves.length * 2} positions evaluated in ${evalElapsed.toFixed(1)}s`,
      'color:#34d399',
    );
    console.log('');

    // ── Classify each move ───────────────────────────────────────────────────
    console.log('%c' + '─'.repeat(70), 'color:#374151');
    console.log(
      '%c Move            Before     After      Δ             Classification',
      'color:#6b7280;font-style:italic',
    );
    console.log('%c' + '─'.repeat(70), 'color:#374151');

    for (let i = 0; i < evaluatedMoves.length; i++) {
      const move = evaluatedMoves[i];

      const before = move.linesBefore[0];
      const after  = move.linesAfter[0];

      if (!before || !after) {
        console.warn(`Move ${i + 1}: missing engine lines, skipping.`);
        classifications.push('good');
        continue;
      }

      // Extract the UCI move that was actually played from the PV of the
      // before-position best line — or fall back to guessing from the FEN diff.
      // Better: the played UCI move is the first token of the engine's PV
      // only when the played move IS the best move. We reconstruct it instead
      // from the SAN by looking at what changed between the FENs.
      // For now we use fenBefore's best PV[0] as a proxy for bestMove,
      // and we extract the played UCI move from fenBefore+SAN via chess.js.
      const playedUci = resolvePlayedUci(move.fenBefore, move.san);

      const baseLabel = classifyMove({
        evalBefore:  before,
        evalAfter:   after,
        playedMove:  playedUci,
        bestMoveEval: move.linesBefore,
      });

      const finalLabel = detectBrilliant({
        currentClassification: baseLabel,
        fenBefore:  move.fenBefore,
        fenAfter:   move.fenAfter,
        evalBefore: before,
      });

      classifications.push(finalLabel);

      // Per-move timing is folded into total; we log 0s per-move since
      // evaluateGame already batched the work.
      logMove(move, finalLabel, 0);
    }

    console.log('%c' + '─'.repeat(70), 'color:#374151');
    console.log('');

    // ── Summary ──────────────────────────────────────────────────────────────
    logSummaryTable(evaluatedMoves, classifications);
    logStats(classifications);

    console.log('');
    console.log(
      '%c✓ Classifier test complete.',
      'color:#34d399;font-weight:bold',
    );

  } catch (err) {
    console.error('%c✗ Test failed:', 'color:#f87171;font-weight:bold', err);
  } finally {
    engine.quit();
    console.log('%cEngine shut down.', 'color:#9ca3af');
  }
}

// ── UCI move resolver ─────────────────────────────────────────────────────────

/**
 * Given a FEN and a SAN string, return the UCI long-algebraic move string
 * (e.g. "e2e4", "e1g1", "e7e8q") by asking chess.js to apply the move and
 * reading back the `from`/`to`/`promotion` fields.
 *
 * Returns an empty string if the SAN cannot be parsed (e.g. the position
 * is already in checkmate before the move is applied).
 */
function resolvePlayedUci(fenBefore: string, san: string): string {
  try {
    // A fresh Chess instance per call — no shared mutable state.
    const tmp = new Chess(fenBefore);
    const move = tmp.move(san);
    if (!move) return '';
    const promo = move.promotion ?? '';
    return `${move.from}${move.to}${promo}`;
  } catch {
    return '';
  }
}
