const FIXED_DT = 1000 / 60;
const MAX_FRAME_MS = 250;

/**
 * Scene contract:
 *   constructor(ctx)  ctx = { root, manager, settings, keybinds, audio, ... }
 *   enter(params), exit() → may return false-y or a cleanup;
 *   canLeave() → boolean | Promise<boolean> (optional; veto navigation)
 *   update(dtMs) fixed timestep; render() once per frame;
 *   onKeyDown(e), onKeyUp(e), resize() (all optional)
 */
export class SceneManager {
  constructor({ root, context = {} }) {
    this.root = root;
    this.context = { ...context, manager: this, root };
    this.scenes = new Map(); // name → factory
    this.current = null;
    this.currentName = null;
    this._running = false;
    this._lastTime = 0;
    this._accumulator = 0;

    window.addEventListener('keydown', (e) => this.current?.onKeyDown?.(e));
    window.addEventListener('keyup', (e) => this.current?.onKeyUp?.(e));
    window.addEventListener('resize', () => this.current?.resize?.());
  }

  register(name, factory) {
    this.scenes.set(name, factory);
  }

  async switchTo(name, params = {}) {
    const factory = this.scenes.get(name);
    if (!factory) throw new Error(`unknown scene: ${name}`);
    if (this.current?.canLeave) {
      const ok = await this.current.canLeave();
      if (!ok) return false;
    }
    this.current?.exit?.();
    this.root.innerHTML = '';
    this.current = factory(this.context);
    this.currentName = name;
    this._accumulator = 0;
    await this.current.enter?.(params);
    this.current.resize?.();
    return true;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    const frame = (now) => {
      if (!this._running) return;
      let dt = now - this._lastTime;
      this._lastTime = now;
      if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS; // tab was in background
      this._accumulator += dt;
      const scene = this.current;
      if (scene) {
        while (this._accumulator >= FIXED_DT) {
          scene.update?.(FIXED_DT);
          this._accumulator -= FIXED_DT;
        }
        scene.render?.();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
