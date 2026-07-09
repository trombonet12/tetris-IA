// Engine smoke test: random human-like play + random AI placements.
// Run: npm run smoke
import { Game } from '../src/game/game.js';
import { mulberry32, rngInt } from '../src/core/rng.js';
import { UNIQUE_ROTATIONS, BOARD_WIDTH } from '../src/game/constants.js';
import { EXTENTS } from '../src/game/pieces.js';

// 1) Random-action play: 1000 pieces across several seeds.
{
  let totalPieces = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const game = new Game({ seed });
    const rng = mulberry32(seed * 7919);
    let guard = 0;
    while (game.state === 'playing' && game.stats.pieces < 100 && guard++ < 500000) {
      const r = rng();
      if (r < 0.2) game.moveLeft();
      else if (r < 0.4) game.moveRight();
      else if (r < 0.5) game.rotateCW();
      else if (r < 0.55) game.rotateCCW();
      else if (r < 0.6) game.hold();
      else if (r < 0.7) game.hardDrop();
      else game.step(16.67);
    }
    totalPieces += game.stats.pieces;
    const snap = new Uint8Array(200);
    game.getSnapshot(snap);
  }
  console.log(`random-play OK: ${totalPieces} pieces locked across 10 seeds`);
}

// 2) Random AI placements via applyPlacement (training hot path).
{
  let totalPieces = 0;
  let totalLines = 0;
  for (let seed = 100; seed < 110; seed++) {
    const game = new Game({ seed });
    const rng = mulberry32(seed);
    let guard = 0;
    while (game.state === 'playing' && game.stats.pieces < 500 && guard++ < 5000) {
      const type = game.current.type;
      const rotation = rngInt(rng, 0, UNIQUE_ROTATIONS[type] - 1);
      const ext = EXTENTS[type][rotation];
      const x = rngInt(rng, -ext.minX, BOARD_WIDTH - 1 - ext.maxX);
      const res = game.applyPlacement({ useHold: rng() < 0.1, rotation, x });
      if (res.invalid) throw new Error(`invalid placement generated: type=${type} rot=${rotation} x=${x}`);
    }
    totalPieces += game.stats.pieces;
    totalLines += game.stats.lines;
  }
  console.log(`ai-placement OK: ${totalPieces} pieces, ${totalLines} lines across 10 seeds`);
}

// 3) Determinism: same seed + same script ⇒ identical outcome.
{
  const play = (seed) => {
    const game = new Game({ seed });
    const rng = mulberry32(42);
    while (game.state === 'playing' && game.stats.pieces < 200) {
      const type = game.current.type;
      const rotation = rngInt(rng, 0, UNIQUE_ROTATIONS[type] - 1);
      const ext = EXTENTS[type][rotation];
      const x = rngInt(rng, -ext.minX, BOARD_WIDTH - 1 - ext.maxX);
      game.applyPlacement({ useHold: false, rotation, x });
    }
    return `${game.stats.score}|${game.stats.lines}|${game.stats.pieces}|${game.overReason}`;
  };
  const a = play(555);
  const b = play(555);
  if (a !== b) throw new Error(`determinism broken: ${a} vs ${b}`);
  console.log(`determinism OK: ${a}`);
}

console.log('SMOKE PASSED');
