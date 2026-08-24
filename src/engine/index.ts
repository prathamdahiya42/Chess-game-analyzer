/**
 * StockfishEngine – Main-thread wrapper around the Stockfish Web Worker.
 *
 * Usage:
 *   const engine = new StockfishEngine();
 *   engine.onOutput((line) => console.log(line));
 *   await engine.init();
 *   engine.send('position startpos');
 *   engine.send('go depth 20');
 *   // … later
 *   engine.destroy();
 */

import type { WorkerInMessage, WorkerOutMessage } from './stockfishWorker';

export type OutputCallback = (line: string) => void;
export type ErrorCallback = (message: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private outputListeners: OutputCallback[] = [];
  private errorListeners: ErrorCallback[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Spin up the Web Worker and ask it to load Stockfish.
   * Resolves when the worker signals `ready` (engine loaded).
   */
  init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('./stockfishWorker.ts', import.meta.url),
          { type: 'module' },
        );
      } catch (err) {
        reject(err);
        return;
      }

      this.worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        this.handleMessage(e.data);
      };

      this.worker.onerror = (e: ErrorEvent) => {
        this.notifyError(e.message ?? 'Worker error');
      };

      // Wait for the 'ready' signal coming from the worker after it
      // creates the inner Stockfish worker and sends "uci".
      const onReady = (e: MessageEvent<WorkerOutMessage>) => {
        if (e.data.type === 'ready') {
          this.worker?.removeEventListener('message', onReady);
          resolve();
        } else if (e.data.type === 'error') {
          this.worker?.removeEventListener('message', onReady);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener('message', onReady);

      // Tell the worker to load the engine
      this.post({ type: 'init' });
    });
  }

  /** Tear down the worker and release resources. */
  destroy(): void {
    if (this.worker) {
      this.post({ type: 'terminate' });
      this.worker.terminate();
      this.worker = null;
    }
    this.outputListeners = [];
    this.errorListeners = [];
  }

  // ── Sending UCI commands ───────────────────────────────────────

  /** Send a raw UCI command string to the engine. */
  send(uciCommand: string): void {
    this.post({ type: 'command', payload: uciCommand });
  }

  // ── Listeners ──────────────────────────────────────────────────

  /** Subscribe to raw engine output lines. Returns an unsubscribe fn. */
  onOutput(cb: OutputCallback): () => void {
    this.outputListeners.push(cb);
    return () => {
      this.outputListeners = this.outputListeners.filter((l) => l !== cb);
    };
  }

  /** Subscribe to error messages. Returns an unsubscribe fn. */
  onError(cb: ErrorCallback): () => void {
    this.errorListeners.push(cb);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== cb);
    };
  }

  // ── Convenience helpers ────────────────────────────────────────

  /**
   * Send a UCI command and collect output lines until a sentinel
   * line is received (e.g. "uciok", "readyok", "bestmove …").
   */
  collectUntil(
    command: string,
    sentinel: string | RegExp,
    timeoutMs = 10_000,
  ): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const lines: string[] = [];
      const matches =
        typeof sentinel === 'string'
          ? (line: string) => line.startsWith(sentinel)
          : (line: string) => sentinel.test(line);

      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Timed out waiting for "${sentinel}" after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.onOutput((line) => {
        lines.push(line);
        if (matches(line)) {
          clearTimeout(timer);
          unsub();
          resolve(lines);
        }
      });

      this.send(command);
    });
  }

  /** Shorthand: wait for "readyok" after sending "isready". */
  isReady(): Promise<string[]> {
    return this.collectUntil('isready', 'readyok');
  }

  // ── Internal ───────────────────────────────────────────────────

  private post(msg: WorkerInMessage): void {
    if (!this.worker) {
      console.warn('[StockfishEngine] No worker – call init() first.');
      return;
    }
    this.worker.postMessage(msg);
  }

  private handleMessage(msg: WorkerOutMessage): void {
    switch (msg.type) {
      case 'output':
        if (msg.line != null) this.notifyOutput(msg.line);
        break;
      case 'error':
        if (msg.message) this.notifyError(msg.message);
        break;
      // 'ready' is handled by init()
    }
  }

  private notifyOutput(line: string): void {
    for (const cb of this.outputListeners) cb(line);
  }

  private notifyError(message: string): void {
    for (const cb of this.errorListeners) cb(message);
  }
}
