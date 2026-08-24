/**
 * StockfishEngine.ts – High-level Stockfish interface with safety guards.
 *
 * Composes the low-level worker wrapper (`./index.ts`) with the UCI
 * parser (`./uci.ts`) to provide a clean, Promise-based API for
 * position evaluation.
 */

import { Chess } from 'chess.js';
import { StockfishEngine as RawWorker } from './index';
import { parseUciLine } from './uci';
import type { UciInfo, UciBestMove } from './uci';

// ── Public types ───────────────────────────────────────────────────

export interface EngineLine {
  depth: number;
  multipv: number;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  pv: string[];
}

export interface EvaluationResult {
  lines: EngineLine[];
  bestmove: string;
  ponder?: string;
}

export interface EvalOptions {
  depth: number;
  multipv: number;
  /** Timeout in ms per position before issuing 'stop' (default 8000ms) */
  timeoutMs?: number;
}

// ── Engine class ───────────────────────────────────────────────────

export class StockfishEngine {
  private raw: RawWorker;
  private ready = false;
  private pendingEval: {
    resolve: (result: EvaluationResult) => void;
    reject: (err: Error) => void;
    lines: Map<number, UciInfo>;
    timer: ReturnType<typeof setTimeout>;
    softTimer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor() {
    this.raw = new RawWorker();
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.raw.init();
    this.raw.onOutput((line) => this.onLine(line));
    this.raw.onError((msg) => this.onEngineError(msg));

    await this.raw.collectUntil('uci', 'uciok');
    await this.raw.isReady();

    this.ready = true;
  }

  setOption(name: string, value: string | number): void {
    this.assertReady();
    this.raw.send(`setoption name ${name} value ${value}`);
  }

  /**
   * Evaluate a FEN position.
   *
   * Fast-paths game-over positions (checkmate/stalemate) with chess.js,
   * sends commands cleanly with protocol sync, and handles position timeouts.
   */
  async evaluatePosition(
    fen: string,
    options: EvalOptions,
  ): Promise<EvaluationResult> {
    this.assertReady();

    // 1. Checkmate / Stalemate instant evaluation guard
    try {
      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        if (chess.isCheckmate()) {
          // Side to move is checkmated
          return {
            lines: [{ depth: 0, multipv: 1, scoreType: 'mate', scoreValue: 0, pv: [] }],
            bestmove: '(none)',
          };
        }
        // Draw / Stalemate
        return {
          lines: [{ depth: 0, multipv: 1, scoreType: 'cp', scoreValue: 0, pv: [] }],
          bestmove: '(none)',
        };
      }
    } catch {
      // Ignore fen parsing errors and fallback to Stockfish
    }

    // Abort any in-flight evaluation
    if (this.pendingEval) {
      this.cancelPending('New evaluation started');
    }

    const { depth, multipv, timeoutMs = 8000 } = options;

    // Send option and position
    this.raw.send(`setoption name MultiPV value ${multipv}`);
    this.raw.send(`position fen ${fen}`);

    return new Promise<EvaluationResult>((resolve, reject) => {
      // Soft timer: send "stop" so engine returns best lines so far
      const softTimer = setTimeout(() => {
        if (this.pendingEval) {
          try {
            this.raw.send('stop');
          } catch {}
        }
      }, timeoutMs);

      // Hard timeout fallback: resolve with whatever we have instead of rejecting and breaking the analysis
      const timer = setTimeout(() => {
        if (!this.pendingEval) return;
        const { lines } = this.pendingEval;
        this.pendingEval = null;
        clearTimeout(softTimer);

        const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
        const engineLines: EngineLine[] = sorted.map((info) => ({
          depth: info.depth,
          multipv: info.multipv,
          scoreType: info.scoreType,
          scoreValue: info.scoreValue,
          pv: info.pv,
        }));

        resolve({
          lines: engineLines.length > 0
            ? engineLines
            : [{ depth: 0, multipv: 1, scoreType: 'cp', scoreValue: 0, pv: [] }],
          bestmove: '(none)',
        });
      }, timeoutMs + 2000);

      this.pendingEval = {
        resolve,
        reject,
        lines: new Map(),
        timer,
        softTimer,
      };

      this.raw.send(`go depth ${depth}`);
    });
  }

  stop(): void {
    if (this.ready) {
      this.raw.send('stop');
    }
  }

  quit(): void {
    if (this.pendingEval) {
      this.cancelPending('Engine quit');
    }
    if (this.ready) {
      this.raw.send('quit');
    }
    this.raw.destroy();
    this.ready = false;
  }

  // ── Internal ───────────────────────────────────────────────────

  private onLine(line: string): void {
    if (!this.pendingEval) return;
    const parsed = parseUciLine(line);

    switch (parsed.kind) {
      case 'info':
        this.handleInfo(parsed.data);
        break;
      case 'bestmove':
        this.handleBestMove(parsed.data);
        break;
    }
  }

  private handleInfo(info: UciInfo): void {
    if (!this.pendingEval) return;
    this.pendingEval.lines.set(info.multipv, info);
  }

  private handleBestMove(bm: UciBestMove): void {
    if (!this.pendingEval) return;

    const { resolve, lines, timer, softTimer } = this.pendingEval;
    clearTimeout(timer);
    clearTimeout(softTimer);
    this.pendingEval = null;

    const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    const engineLines: EngineLine[] = sorted.map((info) => ({
      depth: info.depth,
      multipv: info.multipv,
      scoreType: info.scoreType,
      scoreValue: info.scoreValue,
      pv: info.pv,
    }));

    resolve({
      lines: engineLines.length > 0
        ? engineLines
        : [{ depth: 0, multipv: 1, scoreType: 'cp', scoreValue: 0, pv: [] }],
      bestmove: bm.bestmove,
      ponder: bm.ponder,
    });
  }

  private onEngineError(message: string): void {
    if (this.pendingEval) {
      this.cancelPending(message);
    } else {
      console.error('[StockfishEngine]', message);
    }
  }

  private cancelPending(reason: string): void {
    if (!this.pendingEval) return;
    const { reject, timer, softTimer } = this.pendingEval;
    clearTimeout(timer);
    clearTimeout(softTimer);
    this.pendingEval = null;
    reject(new Error(reason));
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new Error('Engine not initialised – call init() first.');
    }
  }
}
