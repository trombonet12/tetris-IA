// Input controller: keyboard + gamepad with DAS/ARR handling.
// The engine only exposes atomic actions; auto-repeat lives here.

const DEFAULT_GAMEPAD_BINDS = {
  moveLeft: 14, // d-pad left
  moveRight: 15, // d-pad right
  softDrop: 13, // d-pad down
  hardDrop: 12, // d-pad up
  rotateCW: 0, // A
  rotateCCW: 1, // B
  rotate180: 3, // Y
  hold: 4, // LB
  pause: 9, // start
  restart: 8, // select
};

/**
 * @param {object} opts
 * @param {object} opts.keybinds action → KeyboardEvent.code
 * @param {number} opts.dasMs
 * @param {number} opts.arrMs 0 = instant to wall
 * @param {(action: string) => void} opts.onAction fired for every executed
 *   action (replay recording + finesse counting)
 */
export class InputController {
  constructor({ keybinds, dasMs, arrMs, gamepadBinds = null, onAction = null }) {
    this.keybinds = keybinds;
    this.dasMs = dasMs;
    this.arrMs = arrMs;
    this.gamepadBinds = gamepadBinds ?? DEFAULT_GAMEPAD_BINDS;
    this.onAction = onAction;
    this.game = null;
    this.enabled = true;
    this.onPause = null; // scene hooks
    this.onRestart = null;
    this._codeToAction = this._buildMap();
    this._held = { left: false, right: false };
    this._dasDir = 0; // -1 | 0 | 1 (direction currently charging/repeating)
    this._dasTimer = 0;
    this._arrTimer = 0;
    this._dasCharged = false;
    this._prevButtons = [];
    this._gamepadConnected = false;
  }

  _buildMap() {
    const map = new Map();
    for (const [action, code] of Object.entries(this.keybinds)) map.set(code, action);
    return map;
  }

  setKeybinds(keybinds) {
    this.keybinds = keybinds;
    this._codeToAction = this._buildMap();
  }

  setTiming({ dasMs, arrMs }) {
    if (dasMs !== undefined) this.dasMs = dasMs;
    if (arrMs !== undefined) this.arrMs = arrMs;
  }

  attach(game) {
    this.game = game;
    this.releaseAll();
  }

  releaseAll() {
    this._held.left = false;
    this._held.right = false;
    this._dasDir = 0;
    this._dasCharged = false;
    this.game?.setSoftDrop(false);
  }

  _fire(action) {
    this.onAction?.(action);
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  onKeyDown(e) {
    const action = this._codeToAction.get(e.code);
    if (!action) return false;
    e.preventDefault();
    if (e.repeat) return true; // we do our own repeat
    this._press(action);
    return true;
  }

  onKeyUp(e) {
    const action = this._codeToAction.get(e.code);
    if (!action) return false;
    this._release(action);
    return true;
  }

  _press(action) {
    switch (action) {
      case 'pause':
        this.onPause?.();
        return;
      case 'restart':
        this.onRestart?.();
        return;
    }
    if (!this.enabled || !this.game) return;
    switch (action) {
      case 'moveLeft':
        this._held.left = true;
        this._startDas(-1);
        if (this.game.moveLeft()) this._fire('moveLeft');
        break;
      case 'moveRight':
        this._held.right = true;
        this._startDas(1);
        if (this.game.moveRight()) this._fire('moveRight');
        break;
      case 'softDrop':
        this.game.setSoftDrop(true);
        this._fire('softDropOn');
        break;
      case 'hardDrop':
        if (this.game.hardDrop()) this._fire('hardDrop');
        break;
      case 'rotateCW':
        if (this.game.rotateCW()) this._fire('rotateCW');
        break;
      case 'rotateCCW':
        if (this.game.rotateCCW()) this._fire('rotateCCW');
        break;
      case 'rotate180':
        if (this.game.rotate180()) this._fire('rotate180');
        break;
      case 'hold':
        if (this.game.hold()) this._fire('hold');
        break;
    }
  }

  _release(action) {
    switch (action) {
      case 'moveLeft':
        this._held.left = false;
        this._settleDas();
        break;
      case 'moveRight':
        this._held.right = false;
        this._settleDas();
        break;
      case 'softDrop':
        this.game?.setSoftDrop(false);
        this._fire('softDropOff');
        break;
    }
  }

  _startDas(dir) {
    this._dasDir = dir;
    this._dasTimer = 0;
    this._arrTimer = 0;
    this._dasCharged = false;
  }

  _settleDas() {
    // If the opposite key is still held, DAS recharges in that direction.
    if (this._held.left && !this._held.right) this._startDas(-1);
    else if (this._held.right && !this._held.left) this._startDas(1);
    else this._dasDir = 0;
  }

  /** Call every fixed step. Runs DAS/ARR and polls the gamepad. */
  update(dtMs) {
    this._pollGamepad();
    if (!this.enabled || !this.game || this._dasDir === 0) return;
    const stillHeld = this._dasDir === -1 ? this._held.left : this._held.right;
    if (!stillHeld) {
      this._settleDas();
      return;
    }
    this._dasTimer += dtMs;
    if (this._dasTimer < this.dasMs) return;
    if (!this._dasCharged) {
      this._dasCharged = true;
      this._arrTimer = 0;
      this._repeatMove();
      return;
    }
    this._arrTimer += dtMs;
    if (this.arrMs <= 0) {
      // Instant: slam to the wall.
      let guard = 0;
      while (this._repeatMove() && guard++ < 12);
      return;
    }
    while (this._arrTimer >= this.arrMs) {
      this._arrTimer -= this.arrMs;
      if (!this._repeatMove()) break;
    }
  }

  _repeatMove() {
    if (!this.game) return false;
    const moved = this._dasDir === -1 ? this.game.moveLeft() : this.game.moveRight();
    if (moved) this._fire(this._dasDir === -1 ? 'moveLeft' : 'moveRight');
    return moved;
  }

  // ── Gamepad ──────────────────────────────────────────────────────────────

  _pollGamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) {
      if (this._gamepadConnected) {
        this._gamepadConnected = false;
        this._prevButtons = [];
      }
      return;
    }
    if (!this._gamepadConnected) {
      this._gamepadConnected = true;
      this.gamepadName = pad.id;
    }
    const actionByButton = new Map(Object.entries(this.gamepadBinds).map(([a, b]) => [b, a]));
    // Left stick horizontal acts as d-pad left/right.
    const axisLeft = pad.axes[0] < -0.5;
    const axisRight = pad.axes[0] > 0.5;

    for (let b = 0; b < pad.buttons.length; b++) {
      const pressed = pad.buttons[b].pressed || (b === 14 && axisLeft) || (b === 15 && axisRight);
      const was = this._prevButtons[b] ?? false;
      const action = actionByButton.get(b);
      if (!action) {
        this._prevButtons[b] = pressed;
        continue;
      }
      if (pressed && !was) this._press(action);
      else if (!pressed && was) this._release(action);
      this._prevButtons[b] = pressed;
    }
  }
}

export { DEFAULT_GAMEPAD_BINDS };

// ── Finesse (optimal input counting, approximate) ──────────────────────────

/**
 * Approximate optimal input count for a placement: minimal rotation taps
 * (1 for 90°, 1 for 180 if bound, else 2) + horizontal taps, where a DAS
 * charge to either wall counts as a single input. Hold adds one.
 */
export function optimalInputs({ rotation, dx, usedHold, has180 = true }) {
  let inputs = 0;
  if (rotation === 1 || rotation === 3) inputs += 1;
  else if (rotation === 2) inputs += has180 ? 1 : 2;
  const adx = Math.abs(dx);
  if (adx > 0) inputs += Math.min(adx, 2); // tap-tap or das (1) + adjust (1)
  if (usedHold) inputs += 1;
  return Math.max(1, inputs); // hard drop itself
}
