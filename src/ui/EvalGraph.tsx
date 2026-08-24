import React from 'react';
import type { MoveClassification } from '../classifier/types';

export interface GraphMove {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  evalAfterCp: number;
  evalAfterStr: string;
  classification: MoveClassification;
}

interface EvalGraphProps {
  moves: GraphMove[];
  currentStep: number;
  onSelectStep: (step: number) => void;
}

const CLASSIFICATION_DOT_COLORS: Record<MoveClassification, string> = {
  brilliant:  '#7c3aed',
  great:      '#15b8a6',
  best:       '#059669',
  excellent:  '#16a34a',
  good:       '#64748b',
  inaccuracy: '#d97706',
  mistake:    '#ea580c',
  blunder:    '#dc2626',
};

export const EvalGraph: React.FC<EvalGraphProps> = ({ moves, currentStep, onSelectStep }) => {
  if (moves.length === 0) return null;

  const width = 800;
  const height = 120;
  const padding = 20;

  // Clamp CP between -1000 and +1000 for graph plotting
  const clampCp = (cp: number) => Math.max(-1000, Math.min(1000, cp));

  // Y coordinate mapper: +1000 cp -> top (padding), 0 -> middle, -1000 cp -> bottom (height - padding)
  const getY = (cp: number) => {
    const clamped = clampCp(cp);
    const normalized = (clamped + 1000) / 2000; // 0 (black win) to 1 (white win)
    return height - padding - normalized * (height - 2 * padding);
  };

  const getX = (index: number) => {
    if (moves.length <= 1) return width / 2;
    return padding + (index / (moves.length - 1)) * (width - 2 * padding);
  };

  // Points array for polyline
  const points = moves.map((m, idx) => `${getX(idx)},${getY(m.evalAfterCp)}`).join(' ');

  // Active step coordinates
  const activeIdx = Math.max(0, currentStep - 1);
  const activeX = moves.length > 0 ? getX(activeIdx) : getX(0);
  const activeY = moves.length > 0 ? getY(moves[activeIdx]?.evalAfterCp ?? 0) : getY(0);

  const zeroY = getY(0);

  return (
    <div
      style={{
        background: '#312e2b',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1px solid #403c38',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: '#EEEED2', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#81b64c' }}>📈 Game Advantage Flow</span>
        </h4>
        <span style={{ fontSize: '12px', color: '#a3a19f' }}>
          Click anywhere on graph to jump to move
        </span>
      </div>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const normalizedX = (clickX / rect.width) * width;
            // Find closest move index
            let closestIdx = 0;
            let minDiff = Infinity;
            moves.forEach((_, idx) => {
              const diff = Math.abs(getX(idx) - normalizedX);
              if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
              }
            });
            onSelectStep(closestIdx + 1);
          }}
        >
          {/* Zero Line (Equal Evaluation) */}
          <line
            x1={padding}
            y1={zeroY}
            x2={width - padding}
            y2={zeroY}
            stroke="#403c38"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Area Fill for White Advantage (above zero line) */}
          <defs>
            <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#81b64c" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#81b64c" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="blackGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Graph Line */}
          <polyline
            fill="none"
            stroke="#81b64c"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Special Move Highlight Dots (Brilliant / Blunders) */}
          {moves.map((m, idx) => {
            if (m.classification === 'brilliant' || m.classification === 'blunder' || m.classification === 'great') {
              return (
                <circle
                  key={idx}
                  cx={getX(idx)}
                  cy={getY(m.evalAfterCp)}
                  r="4.5"
                  fill={CLASSIFICATION_DOT_COLORS[m.classification]}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              );
            }
            return null;
          })}

          {/* Active Move Cursor Line */}
          {currentStep > 0 && (
            <>
              <line
                x1={activeX}
                y1={padding}
                x2={activeX}
                y2={height - padding}
                stroke="#eab308"
                strokeWidth="2"
                strokeDasharray="2 2"
              />
              <circle
                cx={activeX}
                cy={activeY}
                r="6"
                fill="#eab308"
                stroke="#0f172a"
                strokeWidth="2"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
