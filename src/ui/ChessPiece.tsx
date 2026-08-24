import React from 'react';

interface ChessPieceProps {
  type: string; // 'p', 'n', 'b', 'r', 'q', 'k' or uppercase
  color: 'w' | 'b';
  size?: number | string;
  style?: React.CSSProperties;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({ type, color, size = '100%', style }) => {
  const pType = type.toLowerCase();
  const isWhite = color === 'w';
  const pieceFileName = `${color}${pType}.svg`;

  return (
    <img
      src={`/pieces/${pieceFileName}`}
      alt={`${isWhite ? 'White' : 'Black'} ${pType}`}
      style={{
        width: size,
        height: size,
        display: 'block',
        userSelect: 'none',
        pointerEvents: 'none',
        filter: isWhite
          ? 'drop-shadow(0px 2px 3px rgba(0,0,0,0.4))'
          : 'drop-shadow(0px 2px 3px rgba(0,0,0,0.6))',
        ...style,
      }}
    />
  );
};
