import React from 'react';

interface EvalBarProps {
  scoreStr: string;
  cpValue: number; // centipawns (positive = white advantage)
  isFlipped?: boolean;
}

export const EvalBar: React.FC<EvalBarProps> = ({ scoreStr, cpValue, isFlipped = false }) => {
  const getWhiteHeightPercent = (cp: number): number => {
    if (Number.isNaN(cp)) return 50;
    if (cp >= 5000) return 100;
    if (cp <= -5000) return 0;

    const val = 1 / (1 + Math.exp(-0.003 * cp));
    return Math.min(100, Math.max(0, val * 100));
  };

  const whitePercent = getWhiteHeightPercent(cpValue);
  const blackPercent = 100 - whitePercent;

  const topPercent = isFlipped ? whitePercent : blackPercent;
  const bottomPercent = isFlipped ? blackPercent : whitePercent;
  const topColor = isFlipped ? '#EEEED2' : '#262421';
  const bottomColor = isFlipped ? '#262421' : '#EEEED2';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '512px',
        width: '28px',
        background: '#312e2b',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '2px solid #403c38',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: `${topPercent}%`,
          backgroundColor: topColor,
          transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      <div
        style={{
          width: '100%',
          height: `${bottomPercent}%`,
          backgroundColor: bottomColor,
          transition: 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: isFlipped
            ? whitePercent > 15 ? '8px' : 'auto'
            : whitePercent < 85 ? '8px' : 'auto',
          top: isFlipped
            ? whitePercent <= 15 ? '8px' : 'auto'
            : whitePercent >= 85 ? '8px' : 'auto',
          fontSize: '11px',
          fontWeight: 800,
          color: whitePercent > 50 ? '#262421' : '#EEEED2',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          letterSpacing: '0.2px',
          zIndex: 5,
        }}
      >
        {scoreStr}
      </div>
    </div>
  );
};
