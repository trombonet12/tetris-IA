import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { mulberry32, rngInt } from '../src/core/rng.js';
import { UNIQUE_ROTATIONS, BOARD_WIDTH } from '../src/game/constants.js';
import { EXTENTS } from '../src/game/pieces.js';

/** Picks a valid random placement for the current piece (smoke.js pattern). */
function randomPlacement(game, rng) {
  const type = game.current.type;
  const rotation = rngInt(rng, 0, UNIQUE_ROTATIONS[type] - 1);
  const ext = EXTENTS[type][rotation];
  const x = rngInt(rng, -ext.minX, BOARD_WIDTH - 1 - ext.maxX);
  return { useHold: false, rotation, x };
}

test('50 short random games: no exceptions and core invariants hold', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const game = new Game({ seed });
    const rng = mulberry32(seed * 31 + 7);
    let prevScore = 0;
    let prevPieces = 0;
    let prevLines = 0;
    let guard = 0;

    while (game.state === 'playing' && game.stats.pieces < 80 && guard++ < 1000) {
      const res = game.applyPlacement(randomPlacement(game, rng));
      assert.notEqual(res.invalid, true, `seed ${seed}: generated an invalid placement`);

      // score >= 0 and monotonically non-decreasing.
      assert.ok(game.stats.score >= 0, `seed ${seed}: negative score`);
      assert.ok(game.stats.score >= prevScore, `seed ${seed}: score decreased`);
      prevScore = game.stats.score;

      // pieces grows by exactly 1 per successful placement.
      assert.equal(game.stats.pieces, prevPieces + 1, `seed ${seed}: pieces did not grow`);
      prevPieces = game.stats.pieces;

      // lines never decrease and match the reported clears.
      assert.equal(game.stats.lines, prevLines + res.linesCleared, `seed ${seed}: lines mismatch`);
      prevLines = game.stats.lines;

      assert.ok(res.linesCleared >= 0 && res.linesCleared <= 4);
    }
    assert.ok(guard < 1000, `seed ${seed}: guard tripped (possible infinite loop)`);

    if (game.state === 'over') {
      assert.ok(
        ['blockout', 'lockout', 'topout'].includes(game.overReason),
        `seed ${seed}: unexpected overReason ${game.overReason}`,
      );

      // After 'over', no action may mutate the game.
      const frozen = JSON.stringify({
        score: game.stats.score,
        lines: game.stats.lines,
        pieces: game.stats.pieces,
        level: game.stats.level,
        grid: Array.from(game.board.grid),
      });
      assert.equal(game.moveLeft(), false);
      assert.equal(game.moveRight(), false);
      assert.equal(game.rotateCW(), false);
      assert.equal(game.rotateCCW(), false);
      assert.equal(game.rotate180(), false);
      assert.equal(game.hold(), false);
      assert.equal(game.hardDrop(), false);
      game.step(10000);
      const after = game.applyPlacement(randomPlacement(game, rng));
      assert.equal(after.gameOver, true);
      assert.equal(after.linesCleared, 0);
      assert.equal(game.state, 'over');
      const now = JSON.stringify({
        score: game.stats.score,
        lines: game.stats.lines,
        pieces: game.stats.pieces,
        level: game.stats.level,
        grid: Array.from(game.board.grid),
      });
      assert.equal(now, frozen, `seed ${seed}: state mutated after game over`);
    }
  }
});

test('random games with hold enabled run without exceptions', () => {
  // Mirrors tools/smoke.js section 2 (useHold ~10% of placements). Placements
  // are computed for the pre-hold piece, so a hold can occasionally make them
  // invalid; those are simply skipped by the engine and tolerated here.
  for (let seed = 100; seed < 110; seed++) {
    const game = new Game({ seed });
    const rng = mulberry32(seed);
    let guard = 0;
    let prevScore = 0;
    while (game.state === 'playing' && game.stats.pieces < 120 && guard++ < 2000) {
      const p = randomPlacement(game, rng);
      p.useHold = rng() < 0.1;
      game.applyPlacement(p);
      assert.ok(game.stats.score >= prevScore, `seed ${seed}: score decreased`);
      prevScore = game.stats.score;
    }
    assert.ok(guard < 2000, `seed ${seed}: guard tripped`);
    assert.ok(game.stats.pieces > 0);
  }
});

test('random human-like action play never throws (smoke section 1 pattern)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const game = new Game({ seed });
    const rng = mulberry32(seed * 7919);
    let guard = 0;
    while (game.state === 'playing' && game.stats.pieces < 40 && guard++ < 100000) {
      const r = rng();
      if (r < 0.2) game.moveLeft();
      else if (r < 0.4) game.moveRight();
      else if (r < 0.5) game.rotateCW();
      else if (r < 0.55) game.rotateCCW();
      else if (r < 0.6) game.hold();
      else if (r < 0.7) game.hardDrop();
      else game.step(16.67);
      assert.ok(game.stats.score >= 0);
    }
    const snap = new Uint8Array(200);
    game.getSnapshot(snap);
    for (const v of snap) assert.ok(v <= 15);
  }
});
