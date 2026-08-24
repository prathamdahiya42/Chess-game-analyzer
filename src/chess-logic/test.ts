/**
 * Quick smoke-test for GameSession.getFenHistory().
 *
 * Run with:  npx tsx src/chess-logic/test.ts
 */

import { GameSession } from './GameSession';

// "Immortal Game" — Adolf Anderssen vs Lionel Kieseritzky, London 1851
// One of the most famous chess games ever played.
const pgn = `
[Event "London"]
[Site "London ENG"]
[Date "1851.06.21"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6
7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6
13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2
18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6
23. Be7# 1-0`;

const session = new GameSession();
session.loadPgn(pgn);

const history = session.getFenHistory();

console.log('='.repeat(100));
console.log(
  `  ${'Immortal Game — Anderssen vs Kieseritzky (1851)'}`,
);
console.log('='.repeat(100));
console.log();

for (const entry of history) {
  const moveLabel =
    entry.color === 'w'
      ? `${entry.moveNumber}. ${entry.san}`
      : `${entry.moveNumber}... ${entry.san}`;

  console.log(`  ${moveLabel.padEnd(14)} FEN before: ${entry.fenBefore}`);
  console.log(`${''.padEnd(16)} FEN after:  ${entry.fenAfter}`);
  console.log();
}

console.log('='.repeat(100));
console.log(`  Total moves: ${history.length}`);
console.log(`  Result:      ${session.getResult() ?? 'in progress'}`);
console.log(`  Game over:   ${session.isGameOver()}`);
console.log('='.repeat(100));
