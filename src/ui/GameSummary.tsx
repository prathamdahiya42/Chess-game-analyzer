import React from 'react';
import type { MoveClassification } from '../classifier/types';

export interface SummaryMove {
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  classification: MoveClassification;
  evalBeforeStr: string;
  evalAfterStr: string;
  deltaStr: string;
}

interface GameSummaryProps {
  moves: SummaryMove[];
  onSelectPreset: (pgn: string) => void;
  onOpenPgnModal: () => void;
}

export const PRESET_GAMES = [
  {
    title: "⚡ Paul Morphy's Opera Game (1858)",
    pgn: `[Event "Paris opera"]
[Site "Paris FRA"]
[Date "1858.11.??"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    title: "👑 Kasparov's Immortal vs Topalov (1999)",
    pgn: `[Event "Hoogovens Group A"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[EventDate "1999.01.16"]
[Round "4"]
[Result "1-0"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[ECO "B07"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`,
  },
  {
    title: "🔥 Bobby Fischer's Game of the Century (1956)",
    pgn: `[Event "Third Rosenwald Trophy"]
[Site "New York, NY USA"]
[Date "1956.10.17"]
[EventDate "1956.10.07"]
[Round "8"]
[Result "0-1"]
[White "Donald Byrne"]
[Black "Robert James Fischer"]
[ECO "D92"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`,
  },
];

const CLASSIFICATION_ORDER: MoveClassification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

const BADGE_STYLES: Record<MoveClassification, { label: string; bg: string }> = {
  brilliant:  { label: 'Brilliant !!', bg: '#7c3aed' },
  great:      { label: 'Great !',      bg: '#15b8a6' },
  best:       { label: 'Best ★',       bg: '#059669' },
  excellent:  { label: 'Excellent ⊕', bg: '#16a34a' },
  good:       { label: 'Good ·',       bg: '#4b5563' },
  inaccuracy: { label: 'Inaccuracy ?!',bg: '#d97706' },
  mistake:    { label: 'Mistake ?',    bg: '#ea580c' },
  blunder:    { label: 'Blunder ??',   bg: '#dc2626' },
};

function computeAccuracy(moves: SummaryMove[], side: 'w' | 'b'): number {
  const sideMoves = moves.filter((m) => m.color === side);
  if (sideMoves.length === 0) return 100;

  let totalScore = 0;
  sideMoves.forEach((m) => {
    switch (m.classification) {
      case 'brilliant': totalScore += 100; break;
      case 'great':     totalScore += 98;  break;
      case 'best':      totalScore += 95;  break;
      case 'excellent': totalScore += 88;  break;
      case 'good':      totalScore += 75;  break;
      case 'inaccuracy':totalScore += 55;  break;
      case 'mistake':   totalScore += 30;  break;
      case 'blunder':   totalScore += 10;  break;
    }
  });

  return Math.round(totalScore / sideMoves.length);
}

export const GameSummary: React.FC<GameSummaryProps> = ({ moves, onSelectPreset, onOpenPgnModal }) => {
  const whiteAcc = computeAccuracy(moves, 'w');
  const blackAcc = computeAccuracy(moves, 'b');

  const countClassification = (side: 'w' | 'b', type: MoveClassification) => {
    return moves.filter((m) => m.color === side && m.classification === type).length;
  };

  return (
    <div
      style={{
        background: '#312e2b',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #403c38',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
        color: '#EEEED2',
      }}
    >
      {/* Preset & PGN Header Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid #403c38',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: '#a3a19f' }}>Preset Game:</label>
          <select
            onChange={(e) => {
              if (e.target.value) onSelectPreset(e.target.value);
            }}
            defaultValue={PRESET_GAMES[0].pgn}
            className="theme-select"
          >
            {PRESET_GAMES.map((g, idx) => (
              <option key={idx} value={g.pgn}>
                {g.title}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={onOpenPgnModal}
          className="secondary-btn"
        >
          📝 Custom PGN
        </button>
      </div>

      {/* Accuracy Cards (White vs Black) */}
      {moves.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          {/* White Accuracy */}
          <div
            style={{
              background: '#262421',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid #403c38',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#a3a19f' }}>WHITE ACCURACY</div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff' }}>{whiteAcc}%</div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: `conic-gradient(#81b64c ${whiteAcc * 3.6}deg, #403c38 0deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#262421',
                }}
              />
            </div>
          </div>

          {/* Black Accuracy */}
          <div
            style={{
              background: '#262421',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid #403c38',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#a3a19f' }}>BLACK ACCURACY</div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff' }}>{blackAcc}%</div>
            </div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: `conic-gradient(#ef4444 ${blackAcc * 3.6}deg, #403c38 0deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#262421',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Move Classification breakdown table */}
      {moves.length > 0 && (
        <div style={{ background: '#262421', padding: '14px', borderRadius: '8px', border: '1px solid #403c38' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#a3a19f', marginBottom: '10px' }}>
            MOVE QUALITY BREAKDOWN
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <div style={{ fontWeight: 700, color: '#a3a19f' }}>Classification</div>
            <div style={{ fontWeight: 700, color: '#EEEED2', textAlign: 'center' }}>White</div>
            <div style={{ fontWeight: 700, color: '#EEEED2', textAlign: 'center' }}>Black</div>

            {CLASSIFICATION_ORDER.map((type) => {
              const wCount = countClassification('w', type);
              const bCount = countClassification('b', type);
              if (wCount === 0 && bCount === 0) return null;

              const badge = BADGE_STYLES[type];

              return (
                <React.Fragment key={type}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        backgroundColor: badge.bg,
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 700, color: wCount > 0 ? '#ffffff' : '#403c38' }}>
                    {wCount}
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 700, color: bCount > 0 ? '#ffffff' : '#403c38' }}>
                    {bCount}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
