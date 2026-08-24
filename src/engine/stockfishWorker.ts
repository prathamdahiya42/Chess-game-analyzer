/**
 * stockfishWorker.ts – Web Worker that loads Stockfish WASM and exposes
 * a typed message-based API for UCI communication.
 *
 * ┌─────────────┐  postMessage({type,payload})  ┌──────────────────┐
 * │  Main thread │ ──────────────────────────▶  │  This worker      │
 * │  (engine/)   │ ◀──────────────────────────  │  → Stockfish WASM │
 * └─────────────┘  postMessage({type,…})        └──────────────────┘
 *
 * ── Incoming messages (Main → Worker) ───────────────────────────
 *   { type: 'init' }                     – Load/restart the engine
 *   { type: 'command', payload: string } – Send a raw UCI command
 *   { type: 'terminate' }               – Destroy the inner engine
 *
 * ── Outgoing messages (Worker → Main) ───────────────────────────
 *   { type: 'ready' }                   – Engine finished loading
 *   { type: 'output', line: string }    – Raw engine output line
 *   { type: 'error',  message: string } – Something went wrong
 */

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

// ── Types ──────────────────────────────────────────────────────────
export interface WorkerInMessage {
  type: 'init' | 'command' | 'terminate';
  payload?: string;
}

export interface WorkerOutMessage {
  type: 'ready' | 'output' | 'error';
  line?: string;
  message?: string;
}

// ── State ──────────────────────────────────────────────────────────
let engine: Worker | null = null;

/**
 * Detect WASM support and return the URL to the appropriate engine JS.
 * Both files live in /public/stockfish/ and are served statically by Vite.
 */
function engineScriptUrl(): string {
  const hasWasm =
    typeof WebAssembly === 'object' &&
    typeof WebAssembly.validate === 'function' &&
    WebAssembly.validate(
      Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00),
    );
  return hasWasm ? '/stockfish/stockfish.wasm.js' : '/stockfish/stockfish.js';
}

/** Post a typed message to the main thread. */
function send(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

/**
 * Spin up the underlying Stockfish worker (a nested classic Worker).
 * stockfish.wasm.js / stockfish.js is designed to be loaded directly as a
 * Worker – it accepts UCI command strings via postMessage and emits raw
 * output lines back via postMessage.
 */
function initEngine(): void {
  terminateEngine();

  try {
    const url = engineScriptUrl();
    engine = new Worker(url);

    engine.addEventListener('message', (e: MessageEvent<string>) => {
      send({ type: 'output', line: e.data });
    });

    engine.addEventListener('error', (e: ErrorEvent) => {
      send({ type: 'error', message: e.message ?? 'Stockfish worker error' });
    });

    // Send "uci" to kick-start the engine. The engine will respond with
    // various id/option lines and finally "uciok", which the main-thread
    // wrapper can listen for to know the engine is ready.
    engine.postMessage('uci');
    send({ type: 'ready' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ type: 'error', message: `Failed to load Stockfish: ${msg}` });
  }
}

/** Tear down the inner engine worker. */
function terminateEngine(): void {
  if (engine) {
    engine.terminate();
    engine = null;
  }
}

// ── Message handler ────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      initEngine();
      break;

    case 'command':
      if (!engine) {
        send({
          type: 'error',
          message: 'Engine not initialised – send { type: "init" } first.',
        });
        return;
      }
      if (typeof payload === 'string') {
        engine.postMessage(payload);
      }
      break;

    case 'terminate':
      terminateEngine();
      break;

    default:
      send({ type: 'error', message: `Unknown message type: ${type}` });
  }
};
