/* Hiệu ứng nổi: tim khi vuốt, mẩu thức ăn khi nhai, chữ Zzz khi ngủ. */
const FX = {
  parts: [],

  /* type: heart | crumb | zzz | note | spark */
  spawn(type, x, y, n = 1) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type,
        x: x + rand(-6, 6),
        y: y + rand(-4, 4),
        vx: rand(-0.35, 0.35),
        vy: type === 'crumb' ? rand(-1.2, -0.4) : rand(-0.55, -0.28),
        life: 1,
        decay: type === 'zzz' ? 0.006 : 0.011,
        rot: rand(-0.4, 0.4),
        size: rand(0.85, 1.25),
      });
    }
  },

  update(dt) {
    const k = dt / 16.67;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * k;
      p.y += p.vy * k;
      if (p.type === 'crumb') p.vy += 0.06 * k;      // mẩu thức ăn rơi xuống
      p.life -= p.decay * k;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
  },

  draw(ctx) {
    for (const p of this.parts) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.scale(p.size, p.size);
      switch (p.type) {
        case 'heart': this._heart(ctx); break;
        case 'crumb': this._crumb(ctx); break;
        case 'zzz':   this._zzz(ctx, p); break;
        case 'note':  this._note(ctx); break;
        case 'spark': this._spark(ctx); break;
      }
      ctx.restore();
    }
  },

  _heart(ctx) {
    ctx.fillStyle = '#ff7aa8';
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-7, -1, -4, -7, 0, -3);
    ctx.bezierCurveTo(4, -7, 7, -1, 0, 5);
    ctx.fill();
  },

  _crumb(ctx) {
    ctx.fillStyle = PAL.food;
    ctx.fillRect(-2, -2, 4, 4);
  },

  _zzz(ctx, p) {
    ctx.fillStyle = 'rgba(190, 215, 255, .95)';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.rotate(p.rot * 0.4);
    ctx.fillText('z', 0, 0);
  },

  _note(ctx) {
    ctx.fillStyle = '#ffd88a';
    ctx.beginPath();
    ctx.ellipse(-2, 3, 3.2, 2.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0.6, -6, 1.8, 9);
    ctx.fillRect(0.6, -6, 5, 2);
  },

  _spark(ctx) {
    ctx.fillStyle = '#fff2c4';
    ctx.fillRect(-1, -4, 2, 8);
    ctx.fillRect(-4, -1, 8, 2);
  },

  clear() { this.parts.length = 0; },
};
