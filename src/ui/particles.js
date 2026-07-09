// Particle effects and screen shake. Pooled: no allocations in update().

const MAX_PARTICLES = 500;

export class ParticleSystem {
  constructor() {
    this._pool = [];
    this._alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) this._pool.push(this._blank());
  }

  _blank() {
    return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', gravity: 300, sway: 0, phase: 0 };
  }

  get count() {
    return this._alive;
  }

  _emit(props) {
    let p;
    if (this._alive < MAX_PARTICLES) {
      p = this._pool[this._alive++];
    } else {
      // Recycle the oldest slot.
      p = this._pool[0];
      this._pool.push(this._pool.shift());
    }
    Object.assign(p, this._blank(), props);
    p.maxLife = p.life;
    return p;
  }

  spawnBurst(x, y, { color = '#00e5ff', count = 12, speed = 120, spread = Math.PI * 2, angle = 0, gravity = 300, lifeMs = 600, size = 3 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this._emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: lifeMs * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.9),
        color,
        gravity,
      });
    }
  }

  /** Horizontal explosion of cell fragments for a cleared row. */
  spawnLineClear(boardX, boardY, rowYpx, widthPx, cellSize, colors = ['#00e5ff']) {
    const cells = Math.max(4, Math.floor(widthPx / cellSize));
    for (let c = 0; c < cells; c++) {
      const cx = boardX + (c + 0.5) * cellSize;
      const color = colors[c % colors.length];
      for (let k = 0; k < 3; k++) {
        this._emit({
          x: cx,
          y: boardY + rowYpx,
          vx: (Math.random() - 0.5) * 260,
          vy: -60 - Math.random() * 160,
          life: 500 + Math.random() * 300,
          size: 2 + Math.random() * (cellSize * 0.3),
          color,
          gravity: 620,
        });
      }
    }
  }

  /** Gold rain for tetris / perfect clear. */
  spawnConfetti(x, y, widthPx) {
    const colors = ['#ffd500', '#ffffff', '#ffe97a', '#00e5ff'];
    for (let i = 0; i < 46; i++) {
      this._emit({
        x: x + Math.random() * widthPx,
        y: y - Math.random() * 30,
        vx: (Math.random() - 0.5) * 50,
        vy: 40 + Math.random() * 120,
        life: 1100 + Math.random() * 700,
        size: 2 + Math.random() * 3,
        color: colors[i % colors.length],
        gravity: 60,
        sway: 30 + Math.random() * 50,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dtMs) {
    const dt = dtMs / 1000;
    let write = 0;
    for (let i = 0; i < this._alive; i++) {
      const p = this._pool[i];
      p.life -= dtMs;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt + (p.sway ? Math.sin(p.phase + p.life / 180) * p.sway * dt : 0);
      p.y += p.vy * dt;
      if (write !== i) {
        const tmp = this._pool[write];
        this._pool[write] = p;
        this._pool[i] = tmp;
      }
      write++;
    }
    this._alive = write;
  }

  render(ctx) {
    if (this._alive === 0) return;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this._alive; i++) {
      const p = this._pool[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
  }

  clear() {
    this._alive = 0;
  }
}

export class ScreenShake {
  constructor() {
    this._intensity = 0;
    this._duration = 0;
    this._elapsed = 0;
    this._mul = 0.5; // soft
    this.offset = { x: 0, y: 0 };
  }

  setMode(mode) {
    this._mul = mode === 'off' ? 0 : mode === 'strong' ? 1 : 0.5;
  }

  shake(intensityPx, durationMs) {
    if (this._mul === 0) return;
    this._intensity = Math.max(this._intensity, intensityPx * this._mul);
    this._duration = Math.max(this._duration, durationMs);
    this._elapsed = 0;
  }

  update(dtMs) {
    if (this._duration <= 0) {
      this.offset.x = 0;
      this.offset.y = 0;
      return;
    }
    this._elapsed += dtMs;
    const t = this._elapsed / this._duration;
    if (t >= 1) {
      this._duration = 0;
      this._intensity = 0;
      this.offset.x = 0;
      this.offset.y = 0;
      return;
    }
    const decay = (1 - t) * this._intensity;
    this.offset.x = (Math.random() - 0.5) * 2 * decay;
    this.offset.y = (Math.random() - 0.5) * 2 * decay;
  }
}
