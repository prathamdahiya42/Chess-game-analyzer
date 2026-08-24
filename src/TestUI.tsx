import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { GameSession } from './chess-logic/GameSession';
import { StockfishEngine } from './engine/StockfishEngine';
import { evaluateGame } from './classifier/evaluateGame';
import { classifyMove } from './classifier/classifyMove';
import { detectBrilliant } from './classifier/detectBrilliant';
import type { MoveClassification } from './classifier/types';

import { ChessBoard } from './ui/ChessBoard';
import { EvalBar } from './ui/EvalBar';
import { EvalGraph } from './ui/EvalGraph';
import { GameSummary, PRESET_GAMES } from './ui/GameSummary';

const LABEL_COLORS: Record<MoveClassification, { bg: string; color: string }> = {
  brilliant:  { bg: '#7c3aed', color: '#ffffff' },
  great:      { bg: '#15b8a6', color: '#ffffff' },
  best:       { bg: '#059669', color: '#ffffff' },
  excellent:  { bg: '#16a34a', color: '#ffffff' },
  good:       { bg: '#4b5563', color: '#ffffff' },
  inaccuracy: { bg: '#d97706', color: '#ffffff' },
  mistake:    { bg: '#ea580c', color: '#ffffff' },
  blunder:    { bg: '#dc2626', color: '#ffffff' },
};

export interface ProcessedMove {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  fenBefore: string;
  fenAfter: string;
  fromSquare: string;
  toSquare: string;
  evalBeforeStr: string;
  evalAfterStr: string;
  evalAfterCp: number;
  deltaStr: string;
  classification: MoveClassification;
}

function parseMoveSquares(fenBefore: string, san: string) {
  try {
    const tmp = new Chess(fenBefore);
    const m = tmp.move(san);
    if (m) {
      return {
        fromSquare: m.from,
        toSquare: m.to,
        playedUci: `${m.from}${m.to}${m.promotion ?? ''}`,
      };
    }
  } catch {
    // ignore
  }
  return { fromSquare: '', toSquare: '', playedUci: '' };
}

function formatScore(line?: { scoreType: 'cp' | 'mate'; scoreValue: number }): string {
  if (!line) return '0.00';
  if (line.scoreType === 'mate') {
    return `M${line.scoreValue > 0 ? '+' : ''}${line.scoreValue}`;
  }
  const cp = line.scoreValue;
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}

function getCp(line?: { scoreType: 'cp' | 'mate'; scoreValue: number }): number {
  if (!line) return 0;
  if (line.scoreType === 'mate') {
    return line.scoreValue > 0 ? 10000 : -10000;
  }
  return line.scoreValue;
}

export function TestUI() {
  const [pgnInput, setPgnInput] = useState(PRESET_GAMES[0].pgn);
  const [depth, setDepth] = useState<number>(12);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [analyzedMoves, setAnalyzedMoves] = useState<ProcessedMove[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPgnModal, setShowPgnModal] = useState(false);

  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0, elapsed: 0, eta: 0 });
  const activeEngineRef = useRef<StockfishEngine | null>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRowRef.current && tableContainerRef.current) {
      const container = tableContainerRef.current;
      const row = activeRowRef.current;
      
      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      const containerHeight = container.clientHeight;
      const containerScrollTop = container.scrollTop;
      
      if (rowTop < containerScrollTop) {
        container.scrollTo({ top: rowTop, behavior: 'smooth' });
      } else if (rowTop + rowHeight > containerScrollTop + containerHeight) {
        container.scrollTo({ top: rowTop + rowHeight - containerHeight, behavior: 'smooth' });
      }
    }
  }, [currentStep]);

  const handleAnalyzeGame = async (pgnToRun?: string) => {
    const pgn = pgnToRun ?? pgnInput;
    setErrorMsg('');
    setAnalyzing(true);
    setStatusMessage('Loading PGN...');
    setProgress({ current: 0, total: 0, percent: 0, elapsed: 0, eta: 0 });

    const startTime = Date.now();

    try {
      const session = new GameSession();
      session.loadPgn(pgn);
      const fenHistory = session.getFenHistory();

      if (fenHistory.length === 0) {
        throw new Error('No valid moves found in PGN.');
      }

      setStatusMessage('Initialising Stockfish Engine...');
      const engine = new StockfishEngine();
      activeEngineRef.current = engine;
      await engine.init();

      setStatusMessage(`Evaluating ${fenHistory.length * 2} positions with Stockfish (depth ${depth})...`);

      const evaluatedMoves = await evaluateGame(fenHistory, engine, {
        depth,
        multipv: 3,
        onProgress: (current, total) => {
          const elapsed = (Date.now() - startTime) / 1000;
          const percent = Math.round((current / total) * 100);
          const rate = current / elapsed;
          const remaining = total - current;
          const eta = rate > 0 ? Math.ceil(remaining / rate) : 0;

          setProgress({
            current,
            total,
            percent,
            elapsed: Math.round(elapsed),
            eta,
          });
          setStatusMessage(`Evaluating position ${current} of ${total} (${percent}%) — ETA: ~${eta}s`);
        },
      });

      engine.quit();
      activeEngineRef.current = null;

      setStatusMessage('Classifying moves...');
      const processed: ProcessedMove[] = evaluatedMoves.map((m) => {
        const { fromSquare, toSquare, playedUci } = parseMoveSquares(m.fenBefore, m.san);
        const before = m.linesBefore[0];
        const after = m.linesAfter[0];

        const baseLabel = classifyMove({
          evalBefore: before,
          evalAfter: after,
          playedMove: playedUci,
          bestMoveEval: m.linesBefore,
        });

        const finalLabel = detectBrilliant({
          currentClassification: baseLabel,
          fenBefore: m.fenBefore,
          fenAfter: m.fenAfter,
          evalBefore: before,
        });

        const cpBefore = getCp(before);
        const cpAfter = getCp(after);
        const drop = cpBefore - cpAfter;

        let deltaStr = `${drop > 0 ? '-' : '+'}${Math.abs(drop)} cp`;
        if (drop === 0) deltaStr = '0 cp';

        return {
          moveNumber: m.moveNumber,
          color: m.color,
          san: m.san,
          fenBefore: m.fenBefore,
          fenAfter: m.fenAfter,
          fromSquare,
          toSquare,
          evalBeforeStr: formatScore(before),
          evalAfterStr: formatScore(after),
          evalAfterCp: cpAfter,
          deltaStr,
          classification: finalLabel,
        };
      });

      const totalTime = Math.round((Date.now() - startTime) / 1000);
      setAnalyzedMoves(processed);
      setCurrentStep(1);
      setStatusMessage(`✓ Analysis complete! ${processed.length} moves evaluated in ${totalTime}s.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      if (activeEngineRef.current) {
        try { activeEngineRef.current.quit(); } catch {}
        activeEngineRef.current = null;
      }
      setAnalyzing(false);
    }
  };

  const handleStop = () => {
    if (activeEngineRef.current) {
      try {
        activeEngineRef.current.quit();
      } catch {}
      activeEngineRef.current = null;
    }
    setAnalyzing(false);
    setStatusMessage('Analysis stopped by user.');
  };

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(analyzedMoves.length, prev + 1));
  }, [analyzedMoves.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  // Current move and board matrix
  const currentMove = currentStep > 0 ? analyzedMoves[currentStep - 1] : null;
  const currentFen = currentMove
    ? currentMove.fenAfter
    : analyzedMoves.length > 0
    ? analyzedMoves[0].fenBefore
    : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const boardMatrix = (() => {
    try {
      return new Chess(currentFen).board();
    } catch {
      return new Chess().board();
    }
  })();

  const evalBarCp = currentMove ? currentMove.evalAfterCp : 0;
  const evalBarStr = currentMove ? currentMove.evalAfterStr : '0.00';

  return (
    <div style={{ background: '#262421', minHeight: '100vh', color: '#EEEED2', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Navbar */}
      <header style={{ borderBottom: '1px solid #403c38', background: '#312e2b', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px', color: '#81b64c' }}>♟</span>
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #81b64c, #EEEED2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Free Chess Game Analyzer
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#a3a19f', marginRight: '8px' }}>Depth:</label>
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                disabled={analyzing}
                className="theme-select"
              >
                <option value={10}>Depth 10 (Ultra Fast ~5s)</option>
                <option value={12}>Depth 12 (Fast ~15s - Recommended)</option>
                <option value={14}>Depth 14 (Balanced ~45s)</option>
                <option value={16}>Depth 16 (Deep ~2m)</option>
              </select>
            </div>

            <button
              onClick={() => handleAnalyzeGame()}
              disabled={analyzing}
              className="primary-btn"
            >
              {analyzing ? '⌛ Evaluating...' : '▶ Analyze Game'}
            </button>

            {analyzing && (
              <button
                onClick={handleStop}
                className="stop-btn"
              >
                ⏹ Stop
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '24px' }}>
        {/* Progress indicator bar */}
        {analyzing && progress.total > 0 && (
          <div style={{ background: '#312e2b', padding: '16px', borderRadius: '10px', border: '1px solid #403c38', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#EEEED2' }}>
              <span>Evaluating Position {progress.current} of {progress.total}</span>
              <span>{progress.percent}% — Elapsed: {progress.elapsed}s | ETA: ~{progress.eta}s</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#262421', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.percent}%`, height: '100%', background: 'linear-gradient(to right, #769656, #81b64c)', transition: 'width 0.2s ease' }} />
            </div>
          </div>
        )}

        {statusMessage && !analyzing && (
          <div style={{ marginBottom: '16px', color: '#81b64c', fontSize: '14px', fontWeight: 700 }}>
            {statusMessage}
          </div>
        )}

        {errorMsg && (
          <div style={{ marginBottom: '16px', color: '#f87171', fontSize: '14px', fontWeight: 700 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '32px', alignItems: 'flex-start' }}>
          {/* Left Column: Board + Eval Bar */}
          <div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
              <EvalBar scoreStr={evalBarStr} cpValue={evalBarCp} isFlipped={isFlipped} />
              <ChessBoard
                boardMatrix={boardMatrix}
                fromSquare={currentMove?.fromSquare}
                toSquare={currentMove?.toSquare}
                classification={currentMove?.classification}
                isFlipped={isFlipped}
              />
            </div>

            {/* Board Controls */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#312e2b', padding: '12px 16px', borderRadius: '10px', border: '1px solid #403c38' }}>
              <button
                onClick={() => setCurrentStep(0)}
                onMouseDown={(e) => e.preventDefault()}
                disabled={currentStep === 0}
                className="secondary-btn"
                style={{ padding: '8px 14px' }}
              >
                |&lt;
              </button>
              <button
                onClick={handlePrev}
                onMouseDown={(e) => e.preventDefault()}
                disabled={currentStep === 0}
                className="secondary-btn"
                style={{ padding: '8px 18px' }}
              >
                ← Prev
              </button>
              <button
                onClick={handleNext}
                onMouseDown={(e) => e.preventDefault()}
                disabled={currentStep === analyzedMoves.length}
                className="primary-btn"
                style={{ padding: '8px 24px' }}
              >
                Next →
              </button>
              <button
                onClick={() => setCurrentStep(analyzedMoves.length)}
                onMouseDown={(e) => e.preventDefault()}
                disabled={currentStep === analyzedMoves.length}
                className="secondary-btn"
                style={{ padding: '8px 14px' }}
              >
                &gt;|
              </button>

              <button
                onClick={() => setIsFlipped(!isFlipped)}
                onMouseDown={(e) => e.preventDefault()}
                className="secondary-btn"
                style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: '13px' }}
              >
                🔄 Flip Board
              </button>
            </div>

            {/* Slider */}
            {analyzedMoves.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#a3a19f', fontWeight: 700 }}>Move {currentStep} / {analyzedMoves.length}</span>
                <input
                  type="range"
                  min={0}
                  max={analyzedMoves.length}
                  value={currentStep}
                  onChange={(e) => setCurrentStep(Number(e.target.value))}
                  className="theme-slider"
                  style={{ flex: 1 }}
                />
              </div>
            )}
          </div>

          {/* Right Column: Game Summary + Notation Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <GameSummary
              moves={analyzedMoves}
              onSelectPreset={(pgn) => {
                setPgnInput(pgn);
                handleAnalyzeGame(pgn);
              }}
              onOpenPgnModal={() => setShowPgnModal(true)}
            />

            {/* Current Move Detail */}
            <div style={{ 
              background: '#312e2b', 
              padding: '16px', 
              borderRadius: '12px', 
              border: '1px solid #403c38', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              minHeight: '74px',
              boxSizing: 'border-box'
            }}>
              {currentMove ? (
                <>
                  <div>
                    <div style={{ fontSize: '12px', color: '#a3a19f', fontWeight: 700 }}>CURRENT MOVE</div>
                    <div style={{ fontSize: '20px', fontWeight: 900 }}>
                      {currentMove.color === 'w' ? `${currentMove.moveNumber}. ${currentMove.san}` : `${currentMove.moveNumber}... ${currentMove.san}`}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        backgroundColor: LABEL_COLORS[currentMove.classification].bg,
                        color: LABEL_COLORS[currentMove.classification].color,
                      }}
                    >
                      {currentMove.classification}
                    </span>
                    <div style={{ fontSize: '12px', color: '#a3a19f', marginTop: '4px' }}>
                      Eval: {currentMove.evalAfterStr} ({currentMove.deltaStr})
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#a3a19f', fontWeight: 600 }}>
                  {analyzedMoves.length > 0 ? 'Select a move to see details' : 'Analyze a game to see move details'}
                </div>
              )}
            </div>

            {/* Move Notation Table */}
            {analyzedMoves.length > 0 && (
              <div style={{ background: '#312e2b', borderRadius: '12px', border: '1px solid #403c38', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #403c38', fontSize: '13px', fontWeight: 700, color: '#a3a19f' }}>
                  PGN MOVE LIST ({analyzedMoves.length} moves)
                </div>

                <div ref={tableContainerRef} style={{ maxHeight: '280px', overflowY: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <tbody>
                      {analyzedMoves.map((m, idx) => {
                        const stepNum = idx + 1;
                        const isSelected = currentStep === stepNum;
                        const badge = LABEL_COLORS[m.classification];

                        return (
                          <tr
                            key={idx}
                            ref={isSelected ? activeRowRef : null}
                            onClick={() => setCurrentStep(stepNum)}
                            style={{
                              cursor: 'pointer',
                              borderBottom: '1px solid #403c38',
                              backgroundColor: isSelected ? '#403c38' : idx % 2 === 0 ? '#312e2b' : '#2a2725',
                            }}
                          >
                            <td style={{ padding: '8px 16px', width: '50px', color: '#a3a19f', fontWeight: isSelected ? 800 : 500 }}>
                              {m.color === 'w' ? `${m.moveNumber}.` : `${m.moveNumber}...`}
                            </td>
                            <td style={{ padding: '8px 16px', fontWeight: 700, color: isSelected ? '#81b64c' : '#EEEED2' }}>
                              {m.san}
                            </td>
                            <td style={{ padding: '8px 16px', color: '#a3a19f' }}>
                              {m.evalAfterStr}
                            </td>
                            <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                              <span
                                style={{
                                  backgroundColor: badge.bg,
                                  color: badge.color,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {m.classification}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Advantage Graph */}
        {analyzedMoves.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <EvalGraph moves={analyzedMoves} currentStep={currentStep} onSelectStep={(step) => setCurrentStep(step)} />
          </div>
        )}
      </main>

      {/* PGN Modal */}
      {showPgnModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#312e2b', border: '1px solid #403c38', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#EEEED2' }}>Paste Custom PGN</h3>
            <textarea
              rows={8}
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              className="theme-textarea"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '13px', boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowPgnModal(false)} className="secondary-btn">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPgnModal(false);
                  handleAnalyzeGame();
                }}
                className="primary-btn"
              >
                Analyze Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
