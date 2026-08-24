/**
 * uci.ts – Parser for raw UCI engine output lines.
 *
 * Converts "info …" and "bestmove …" strings into typed objects so the
 * rest of the app never touches raw text.
 *
 * Supports:
 *  • info lines with depth, seldepth, multipv, score cp/mate, nodes, nps, time, pv
 *  • bestmove lines with optional ponder move
 */

// ── Public types ───────────────────────────────────────────────────

/** Parsed representation of a UCI "info" line. */
export interface UciInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  scoreType: 'cp' | 'mate';
  /** Centipawns (scoreType 'cp') or moves-to-mate (scoreType 'mate'). */
  scoreValue: number;
  nodes?: number;
  nps?: number;
  time?: number;
  /** Principal variation – the sequence of moves the engine considers best. */
  pv: string[];
}

/** Parsed representation of a UCI "bestmove" line. */
export interface UciBestMove {
  bestmove: string;
  ponder?: string;
}

/** Tagged union returned by `parseUciLine`. */
export type UciParsed =
  | { kind: 'info'; data: UciInfo }
  | { kind: 'bestmove'; data: UciBestMove }
  | { kind: 'unknown'; raw: string };

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Tokenise a UCI line into whitespace-separated tokens.
 * Returns an empty array for blank / whitespace-only input.
 */
function tokenise(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/**
 * Read the next token as an integer.  Returns `undefined` when the
 * token is missing or not a valid integer.
 */
function intAt(tokens: string[], idx: number): number | undefined {
  const raw = tokens[idx];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

// ── Parsers ────────────────────────────────────────────────────────

/**
 * Parse a raw UCI "info" line.
 *
 * Example inputs:
 *   info depth 20 seldepth 25 multipv 1 score cp 35 nodes 1234567 nps 1234567 time 1000 pv e2e4 e7e5 g1f3
 *   info depth 15 multipv 1 score mate 3 pv d1h5 f7f6 h5e8
 *   info depth 12 score cp -42 pv d7d5
 *
 * Returns `null` when the line cannot be meaningfully parsed (e.g. an
 * "info string …" or "info currmove …" line without depth/score/pv).
 */
export function parseInfoLine(line: string): UciInfo | null {
  const tokens = tokenise(line);

  // Must start with "info"
  if (tokens[0] !== 'info') return null;

  let depth: number | undefined;
  let seldepth: number | undefined;
  let multipv = 1; // default when engine doesn't report multipv
  let scoreType: 'cp' | 'mate' | undefined;
  let scoreValue: number | undefined;
  let nodes: number | undefined;
  let nps: number | undefined;
  let time: number | undefined;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = intAt(tokens, ++i);
        break;

      case 'seldepth':
        seldepth = intAt(tokens, ++i);
        break;

      case 'multipv':
        multipv = intAt(tokens, ++i) ?? 1;
        break;

      case 'score': {
        const kind = tokens[++i]; // "cp" or "mate"
        if (kind === 'cp' || kind === 'mate') {
          scoreType = kind;
          scoreValue = intAt(tokens, ++i);
        }
        break;
      }

      case 'nodes':
        nodes = intAt(tokens, ++i);
        break;

      case 'nps':
        nps = intAt(tokens, ++i);
        break;

      case 'time':
        time = intAt(tokens, ++i);
        break;

      case 'pv':
        // Everything after "pv" is the move list
        pv = tokens.slice(i + 1);
        i = tokens.length; // break out of the loop
        break;

      // Skip tokens we don't care about (hashfull, tbhits, currmove, etc.)
      default:
        break;
    }
  }

  // An info line without depth + score + pv isn't useful for analysis
  if (depth === undefined || scoreType === undefined || scoreValue === undefined) {
    return null;
  }

  return {
    depth,
    ...(seldepth !== undefined && { seldepth }),
    multipv,
    scoreType,
    scoreValue,
    ...(nodes !== undefined && { nodes }),
    ...(nps !== undefined && { nps }),
    ...(time !== undefined && { time }),
    pv,
  };
}

/**
 * Parse a raw UCI "bestmove" line.
 *
 * Example inputs:
 *   bestmove e2e4 ponder e7e5
 *   bestmove d2d4
 *   bestmove (none)
 *
 * Returns `null` if the line is not a valid bestmove.
 */
export function parseBestMove(line: string): UciBestMove | null {
  const tokens = tokenise(line);
  if (tokens[0] !== 'bestmove' || !tokens[1]) return null;

  const result: UciBestMove = { bestmove: tokens[1] };

  if (tokens[2] === 'ponder' && tokens[3]) {
    result.ponder = tokens[3];
  }

  return result;
}

// ── Unified parser ─────────────────────────────────────────────────

/**
 * Parse any raw UCI output line into a tagged union.
 *
 * ```ts
 * const parsed = parseUciLine('info depth 20 score cp 35 pv e2e4');
 * if (parsed.kind === 'info') {
 *   console.log(parsed.data.scoreValue); // 35
 * }
 * ```
 */
export function parseUciLine(line: string): UciParsed {
  const trimmed = line.trim();

  if (trimmed.startsWith('bestmove')) {
    const data = parseBestMove(trimmed);
    if (data) return { kind: 'bestmove', data };
  }

  if (trimmed.startsWith('info')) {
    const data = parseInfoLine(trimmed);
    if (data) return { kind: 'info', data };
  }

  return { kind: 'unknown', raw: trimmed };
}
