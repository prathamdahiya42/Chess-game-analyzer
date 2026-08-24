/**
 * engine/test.ts – Integration test for StockfishEngine.
 *
 * Evaluates 3 positions at depth 18 / multipv 3 and logs the results.
 * Run from the browser (Web Workers don't work in Node).
 *
 * Import and call `runEngineTest()` from App.tsx or the DevTools console.
 */

import { StockfishEngine } from './StockfishEngine';
import type { EvaluationResult, EngineLine } from './StockfishEngine';

// ── Test positions ─────────────────────────────────────────────────

interface TestCase {
  label: string;
  fen: string;
}

const POSITIONS: TestCase[] = [
  {
    label: '1 ▸ Starting position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    label: '2 ▸ Mate-in-1 for white (Qh7#)',
    // White: Kg1, Qf5, Rf1  Black: Kg8, Rf8, pawns g7 h6
    // White plays Qf7# (or Qh7# depending on engine)
    fen: '5rk1/4Qppp/8/8/8/8/5PPP/5RK1 w - - 0 1',
  },
  {
    label: '3 ▸ Clearly losing for white (down a queen + rook)',
    fen: 'r1bqr1k1/pppp1ppp/2n2n2/8/8/8/PPPP1PPP/R1B1K2R w KQ - 0 1',
  },
];

// ── Formatting helpers ─────────────────────────────────────────────

function formatScore(line: EngineLine): string {
  if (line.scoreType === 'mate') {
    const sign = line.scoreValue > 0 ? '+' : '';
    return `mate ${sign}${line.scoreValue}`;
  }
  const cp = line.scoreValue;
  const sign = cp >= 0 ? '+' : '';
  return `${sign}${(cp / 100).toFixed(2)}`;
}

function formatPv(pv: string[], maxMoves = 8): string {
  const truncated = pv.slice(0, maxMoves);
  return truncated.join(' ') + (pv.length > maxMoves ? ' …' : '');
}

function logResult(testCase: TestCase, result: EvaluationResult): void {
  console.group(
    `%c${testCase.label}`,
    'color: #a78bfa; font-weight: bold; font-size: 13px',
  );
  console.log(`FEN: ${testCase.fen}`);
  console.log(`Best move: ${result.bestmove}${result.ponder ? ` (ponder ${result.ponder})` : ''}`);
  console.log('');

  for (const line of result.lines) {
    const rank = `  PV${line.multipv}`;
    const score = formatScore(line);
    const pv = formatPv(line.pv);
    console.log(
      `%c${rank}%c  depth ${line.depth}  %c${score}%c  ${pv}`,
      'color: #60a5fa; font-weight: bold',
      'color: #9ca3af',
      line.scoreType === 'mate' ? 'color: #f87171; font-weight: bold' : 'color: #34d399',
      'color: #d1d5db',
    );
  }

  console.groupEnd();
}

// ── Main test runner ───────────────────────────────────────────────

export async function runEngineTest(): Promise<void> {
  const DEPTH = 18;
  const MULTIPV = 3;

  console.clear();
  console.log(
    '%c♟ Stockfish Engine Test',
    'color: #fbbf24; font-weight: bold; font-size: 16px',
  );
  console.log(`Depth: ${DEPTH}  |  MultiPV: ${MULTIPV}`);
  console.log('─'.repeat(50));

  const engine = new StockfishEngine();

  try {
    console.log('%cInitialising engine…', 'color: #9ca3af');
    const t0 = performance.now();
    await engine.init();
    console.log(
      `%c✓ Engine ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
      'color: #34d399',
    );
    console.log('');

    for (const testCase of POSITIONS) {
      const start = performance.now();
      const result = await engine.evaluatePosition(testCase.fen, {
        depth: DEPTH,
        multipv: MULTIPV,
      });
      const elapsed = ((performance.now() - start) / 1000).toFixed(1);

      logResult(testCase, result);
      console.log(`%c  ⏱ ${elapsed}s`, 'color: #6b7280');
      console.log('');
    }

    console.log(
      '%c✓ All 3 positions evaluated successfully.',
      'color: #34d399; font-weight: bold',
    );
  } catch (err) {
    console.error('Engine test failed:', err);
  } finally {
    engine.quit();
    console.log('%cEngine shut down.', 'color: #9ca3af');
  }
}
