import React from 'react';
import { ChessPiece } from './ChessPiece';
import type { MoveClassification } from '../classifier/types';

interface ChessBoardProps {
  boardMatrix: ({ type: string; color: 'w' | 'b' } | null)[][];
  fromSquare?: string;
  toSquare?: string;
  classification?: MoveClassification;
  isFlipped?: boolean;
}

const BADGE_COLORS: Record<MoveClassification, { bg: string; text: string; label: string }> = {
  brilliant: { bg: '#7c3aed', text: '#ffffff', label: '!!' },
  great: { bg: '#0284c7', text: '#ffffff', label: '!' },
  best: { bg: '#059669', text: '#ffffff', label: '★' },
  excellent: { bg: '#16a34a', text: '#ffffff', label: '⊕' },
  good: { bg: '#4b5563', text: '#ffffff', label: '·' },
  inaccuracy: { bg: '#d97706', text: '#ffffff', label: '?!' },
  mistake: { bg: '#ea580c', text: '#ffffff', label: '?' },
  blunder: { bg: '#dc2626', text: '#ffffff', label: '??' },
};

export const ChessBoard: React.FC<ChessBoardProps> = ({
  boardMatrix,
  fromSquare,
  toSquare,
  classification,
  isFlipped = false,
}) => {
  const ranks = isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = isFlipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  return (
    <div
      style={{
        position: 'relative',
        userSelect: 'none',
        display: 'inline-block',
        padding: '16px',
        background: '#0f172a',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.4)',
        border: '1px solid #1e293b',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 64px)',
          gridTemplateRows: 'repeat(8, 64px)',
          width: '512px',
          height: '512px',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '2px solid #334155',
          position: 'relative',
        }}
      >
        {ranks.map((r, rIdx) =>
          files.map((f, cIdx) => {
            const sq = `${f}${r}`;
            const origRIdx = 8 - r;
            const origCIdx = f.charCodeAt(0) - 97;
            const cell = boardMatrix[origRIdx]?.[origCIdx] ?? null;

            const isDark = (origRIdx + origCIdx) % 2 === 1;
            const isFrom = fromSquare === sq;
            const isTo = toSquare === sq;
            const isHighlighted = isFrom || isTo;

            const showRankLabel = cIdx === 0;
            const showFileLabel = rIdx === 7;

            const badge = isTo && classification ? BADGE_COLORS[classification] : null;

            return (
              <div
                key={sq}
                style={{
                  width: '64px',
                  height: '64px',
                  position: 'relative',
                  backgroundColor: isHighlighted
                    ? isDark ? '#bacc44' : '#cdd26a'
                    : isDark ? '#769656' : '#EEEED2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s ease',
                  boxSizing: 'border-box',
                  border: isTo ? '2px solid #eab308' : isFrom ? '2px dashed #ca8a04' : 'none',
                }}
              >
                {showRankLabel && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isDark ? '#EEEED2' : '#769656',
                      pointerEvents: 'none',
                    }}
                  >
                    {r}
                  </span>
                )}

                {showFileLabel && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isDark ? '#EEEED2' : '#769656',
                      pointerEvents: 'none',
                    }}
                  >
                    {f}
                  </span>
                )}

                {cell && (
                  <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChessPiece type={cell.type} color={cell.color} size="52px" />
                  </div>
                )}

                {badge && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: badge.bg,
                      color: badge.text,
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '10px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                      zIndex: 10,
                      letterSpacing: '0.5px',
                      border: '1.5px solid #ffffff',
                    }}
                  >
                    {badge.label}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
