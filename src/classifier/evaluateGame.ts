import type { FenHistoryEntry } from '../chess-logic/GameSession';
import type { EngineLine } from './types';

export interface EvalEngine {
  evaluatePosition(
    fen: string,
    options: { depth: number; multipv: number },
  ): Promise<{ lines: Array<{ scoreType: 'cp' | 'mate'; scoreValue: number; pv: string[] }> }>;
}

export interface EvaluateGameOptions {
  depth: number;
  multipv: number;
  onProgress?: (current: number, total: number) => void;
}

export interface EvaluatedMove extends FenHistoryEntry {
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
}

function toEngineLine(
  rawLines: Array<{ scoreType: 'cp' | 'mate'; scoreValue: number; pv: string[] }>,
  flip: boolean,
): EngineLine[] {
  if (!rawLines || rawLines.length === 0) {
    return [{ scoreType: 'cp', scoreValue: 0, pv: [] }];
  }
  return rawLines.map((raw) => ({
    scoreType: raw.scoreType,
    scoreValue: flip ? -raw.scoreValue : raw.scoreValue,
    pv: raw.pv,
  }));
}

export async function evaluateGame(
  fenHistory: FenHistoryEntry[],
  engine: EvalEngine,
  options: EvaluateGameOptions,
): Promise<EvaluatedMove[]> {
  const { depth, multipv, onProgress } = options;

  const uniqueFens: string[] = [];
  const fenSet = new Set<string>();

  for (const entry of fenHistory) {
    if (!fenSet.has(entry.fenBefore)) {
      fenSet.add(entry.fenBefore);
      uniqueFens.push(entry.fenBefore);
    }
    if (!fenSet.has(entry.fenAfter)) {
      fenSet.add(entry.fenAfter);
      uniqueFens.push(entry.fenAfter);
    }
  }

  const totalPositions = uniqueFens.length;
  const evalCache = new Map<string, Array<{ scoreType: 'cp' | 'mate'; scoreValue: number; pv: string[] }>>();

  let completed = 0;
  for (const fen of uniqueFens) {
    try {
      const result = await engine.evaluatePosition(fen, { depth, multipv });
      evalCache.set(fen, result.lines);
    } catch (err) {
      console.warn(`[evaluateGame] Warning: Failed to evaluate FEN ${fen}:`, err);
      evalCache.set(fen, [{ scoreType: 'cp', scoreValue: 0, pv: [] }]);
    }
    completed++;
    if (onProgress) {
      onProgress(completed, totalPositions);
    }
  }

  const results: EvaluatedMove[] = [];
  for (const entry of fenHistory) {
    const rawBefore = evalCache.get(entry.fenBefore) ?? [];
    const rawAfter = evalCache.get(entry.fenAfter) ?? [];

    const linesBefore = toEngineLine(rawBefore, false);
    const linesAfter = toEngineLine(rawAfter, true);

    results.push({
      ...entry,
      linesBefore,
      linesAfter,
    });
  }

  return results;
}
