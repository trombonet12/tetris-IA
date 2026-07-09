import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreEvent,
  gravitySecondsPerRow,
  CLEAR_POINTS,
  TSPIN_POINTS,
  TSPIN_MINI_POINTS,
  ALL_CLEAR_POINTS,
  COMBO_POINTS,
  B2B_MULTIPLIER,
} from '../src/game/scoring.js';

test('base clear table: single/double/triple/tetris at level 1', () => {
  assert.equal(scoreEvent({ lines: 1 }).points, 100);
  assert.equal(scoreEvent({ lines: 2 }).points, 300);
  assert.equal(scoreEvent({ lines: 3 }).points, 500);
  assert.equal(scoreEvent({ lines: 4 }).points, 800);
  assert.equal(scoreEvent({ lines: 0 }).points, 0);
});

test('single scores 100 × level', () => {
  for (const level of [1, 2, 5, 10]) {
    const r = scoreEvent({ lines: 1, level });
    assert.equal(r.points, 100 * level);
    assert.equal(r.basePoints, 100 * level);
  }
});

test('clear table constants are the guideline values', () => {
  assert.deepEqual(CLEAR_POINTS, [0, 100, 300, 500, 800]);
  assert.deepEqual(TSPIN_POINTS, [400, 800, 1200, 1600]);
  assert.deepEqual(TSPIN_MINI_POINTS, [100, 200, 400]);
  assert.equal(COMBO_POINTS, 50);
  assert.equal(B2B_MULTIPLIER, 1.5);
});

test('T-spin double scores 1200 and is difficult', () => {
  const r = scoreEvent({ lines: 2, tspin: 'full' });
  assert.equal(r.points, 1200);
  assert.equal(r.difficult, true);
  assert.equal(r.breaksB2b, false);
});

test('T-spin zero (no lines) scores 400 and is not difficult', () => {
  const r = scoreEvent({ lines: 0, tspin: 'full' });
  assert.equal(r.points, 400);
  assert.equal(r.difficult, false);
  assert.equal(r.breaksB2b, false, 'no lines cleared never breaks b2b');
});

test('mini T-spin single scores 200', () => {
  const r = scoreEvent({ lines: 1, tspin: 'mini' });
  assert.equal(r.points, 200);
  assert.equal(r.difficult, true);
});

test('tetris with b2bActive: 800 × 1.5 = 1200 (b2bBonus = 400)', () => {
  const r = scoreEvent({ lines: 4, b2bActive: true });
  assert.equal(r.basePoints, 800);
  assert.equal(r.b2bBonus, 400);
  assert.equal(r.points, 1200);
  assert.equal(r.b2bApplied, true);
  assert.equal(r.difficult, true);
});

test('tetris without b2bActive gets no bonus', () => {
  const r = scoreEvent({ lines: 4, b2bActive: false });
  assert.equal(r.points, 800);
  assert.equal(r.b2bBonus, 0);
  assert.equal(r.b2bApplied, false);
});

test('b2bActive on a non-difficult clear applies no bonus', () => {
  const r = scoreEvent({ lines: 2, b2bActive: true });
  assert.equal(r.b2bApplied, false);
  assert.equal(r.b2bBonus, 0);
  assert.equal(r.points, 300);
});

test('combo: lines > 0, combo = 2, level 3 → comboPoints = 50 × 2 × 3', () => {
  const r = scoreEvent({ lines: 1, combo: 2, level: 3 });
  assert.equal(r.comboPoints, 300);
  assert.equal(r.points, 100 * 3 + 300);
});

test('combo 0 or negative adds nothing; lines = 0 never adds combo points', () => {
  assert.equal(scoreEvent({ lines: 1, combo: 0 }).comboPoints, 0);
  assert.equal(scoreEvent({ lines: 1, combo: -1 }).comboPoints, 0);
  assert.equal(scoreEvent({ lines: 0, combo: 5 }).comboPoints, 0);
});

test('all clear adds ALL_CLEAR_POINTS[lines] × level', () => {
  const single = scoreEvent({ lines: 1, allClear: true, level: 2 });
  assert.equal(single.allClearPoints, ALL_CLEAR_POINTS[1] * 2);
  assert.equal(single.points, 100 * 2 + 800 * 2);

  const tetris = scoreEvent({ lines: 4, allClear: true });
  assert.equal(tetris.allClearPoints, 2000);
  assert.equal(tetris.points, 800 + 2000);

  assert.equal(scoreEvent({ lines: 1, allClear: false }).allClearPoints, 0);
});

test('breaksB2b: true only for non-difficult line clears', () => {
  assert.equal(scoreEvent({ lines: 1 }).breaksB2b, true);
  assert.equal(scoreEvent({ lines: 2 }).breaksB2b, true);
  assert.equal(scoreEvent({ lines: 3 }).breaksB2b, true);
  assert.equal(scoreEvent({ lines: 4 }).breaksB2b, false, 'tetris keeps the streak');
  assert.equal(scoreEvent({ lines: 1, tspin: 'full' }).breaksB2b, false, 'T-spin keeps it');
  assert.equal(scoreEvent({ lines: 1, tspin: 'mini' }).breaksB2b, false, 'mini T-spin keeps it');
  assert.equal(scoreEvent({ lines: 0 }).breaksB2b, false, 'no clear does not break');
  assert.equal(scoreEvent({ lines: 0, tspin: 'full' }).breaksB2b, false);
});

test('T-spin full table by lines', () => {
  assert.equal(scoreEvent({ lines: 1, tspin: 'full' }).points, 800);
  assert.equal(scoreEvent({ lines: 3, tspin: 'full' }).points, 1600);
});

test('gravitySecondsPerRow: level 1 is exactly 1 second per row', () => {
  assert.equal(gravitySecondsPerRow(1), 1); // 0.8^0
});

test('gravitySecondsPerRow: decreasing with level until it hits the 20G floor', () => {
  const FLOOR = 1 / 1200;
  let prev = gravitySecondsPerRow(1);
  for (let level = 2; level <= 20; level++) {
    const t = gravitySecondsPerRow(level);
    assert.ok(t <= prev, `gravity at level ${level} (${t}) slower than level ${level - 1} (${prev})`);
    if (prev > FLOOR) {
      assert.ok(t < prev, `gravity at level ${level} (${t}) must strictly decrease above the floor`);
    } else {
      assert.equal(t, FLOOR);
    }
    prev = t;
  }
  // The formula reaches the floor at level 19 with the default constants.
  assert.equal(gravitySecondsPerRow(19), FLOOR);
  assert.ok(gravitySecondsPerRow(18) > FLOOR);
});

test('gravitySecondsPerRow: floored at 1/1200 (20G) at very high levels', () => {
  assert.equal(gravitySecondsPerRow(30), 1 / 1200);
  assert.equal(gravitySecondsPerRow(100), 1 / 1200);
  // Levels below 1 clamp to level 1.
  assert.equal(gravitySecondsPerRow(0), 1);
  assert.equal(gravitySecondsPerRow(-5), 1);
});
