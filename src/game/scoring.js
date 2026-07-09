// Guideline scoring, implemented as pure functions for easy testing.

export const CLEAR_POINTS = [0, 100, 300, 500, 800]; // by lines cleared
export const TSPIN_POINTS = [400, 800, 1200, 1600]; // full T-spin, by lines
export const TSPIN_MINI_POINTS = [100, 200, 400]; // mini T-spin, by lines (0..2)
export const ALL_CLEAR_POINTS = [0, 800, 1200, 1800, 2000]; // perfect clear bonus
export const COMBO_POINTS = 50;
export const B2B_MULTIPLIER = 1.5;
export const SOFT_DROP_POINTS = 1; // per cell
export const HARD_DROP_POINTS = 2; // per cell

/**
 * Scores a lock event.
 * @param {object} ev
 * @param {number} ev.lines lines cleared (0..4)
 * @param {'none'|'mini'|'full'} ev.tspin
 * @param {number} ev.combo combo counter (0 = first clear of a chain; <0 = no chain)
 * @param {boolean} ev.b2bActive back-to-back streak was already active
 * @param {number} ev.level current level (multiplier)
 * @param {boolean} ev.allClear board empty after the clear
 * @returns {{points:number, difficult:boolean, b2bApplied:boolean, breaksB2b:boolean,
 *            basePoints:number, b2bBonus:number, comboPoints:number, allClearPoints:number}}
 *   difficult: counts toward back-to-back (tetris or T-spin line clear)
 *   breaksB2b: a non-difficult line clear resets the b2b streak
 */
export function scoreEvent({ lines = 0, tspin = 'none', combo = -1, b2bActive = false, level = 1, allClear = false }) {
  let base = 0;
  let difficult = false;

  if (tspin === 'full') {
    base = TSPIN_POINTS[lines] ?? 0;
    difficult = lines > 0;
  } else if (tspin === 'mini') {
    base = TSPIN_MINI_POINTS[lines] ?? 0;
    difficult = lines > 0;
  } else {
    base = CLEAR_POINTS[lines] ?? 0;
    difficult = lines === 4;
  }

  const b2bApplied = difficult && b2bActive;
  const basePoints = base * level;
  const b2bBonus = b2bApplied ? Math.floor(basePoints * B2B_MULTIPLIER) - basePoints : 0;
  const comboPoints = lines > 0 && combo > 0 ? COMBO_POINTS * combo * level : 0;
  const allClearPoints = allClear ? (ALL_CLEAR_POINTS[lines] ?? 0) * level : 0;
  const points = basePoints + b2bBonus + comboPoints + allClearPoints;

  const breaksB2b = lines > 0 && !difficult;
  return { points, difficult, b2bApplied, breaksB2b, basePoints, b2bBonus, comboPoints, allClearPoints };
}

/**
 * Guideline gravity: seconds a piece takes to fall one row at a given level.
 * time = (0.8 - (level-1) * 0.007) ^ (level-1)
 */
export function gravitySecondsPerRow(level) {
  const l = Math.max(1, level);
  const t = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  // Cap at 20G (20 rows per frame at 60fps).
  return Math.max(t, 1 / 1200);
}
