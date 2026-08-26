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

/* ---------------- Thời tiết nhìn thấy được ----------------
   Mưa và tuyết chỉ rơi trong khung cửa sổ (nhìn ra ngoài trời), cộng thêm
   giọt đọng trên kính. Ngoài trời (scene outdoor) thì rơi khắp khung. */
const Sky = {
  drops: [],
  flakes: [],
  beads: [],          // giọt đọng trên kính, tất định theo hash
  flash: 0,           // >0 = đang loé sáng vì sấm
  nextFlash: 9000,

  /* Hai ô cửa sổ của scene Phòng ngủ; khớp với Render._window trong scenes.js */
  WINDOWS: [
    { x: 400, y: 66, w: 168, h: 122 },
    { x: 640, y: 66, w: 168, h: 122 },
  ],

  reset() {
    this.drops.length = 0;
    this.flakes.length = 0;
    this.beads.length = 0;
    this.flash = 0;
  },

  _spawnDrop(area) {
    return {
      x: area.x + Math.random() * area.w,
      y: area.y + Math.random() * area.h,
      len: rand(7, 16),
      sp: rand(7, 12),
      a: rand(0.25, 0.6),
    };
  },

  _spawnFlake(area) {
    return {
      x: area.x + Math.random() * area.w,
      y: area.y + Math.random() * area.h,
      r: rand(1.2, 2.8),
      sp: rand(0.5, 1.4),
      drift: rand(-0.4, 0.4),
      ph: rand(0, 6.3),
      a: rand(0.5, 0.95),
    };
  },

  /* Vùng để hạt rơi: trong ô cửa sổ, hoặc cả khung nếu là scene ngoài trời */
  _areas() {
    if (Scenes.isOutdoor) return [{ x: 0, y: 0, w: CFG.W, h: CFG.FLOOR_Y }];
    return this.WINDOWS.map((w) => ({ x: w.x + 4, y: w.y + 4, w: w.w - 8, h: w.h - 8 }));
  },

  update(dt) {
    const k = dt / 16.67;
    const areas = this._areas();
    const raining = Weather.isRaining;
    const snowing = Weather.isSnowing;

    // số hạt mong muốn theo cường độ
    const wantDrops = raining
      ? Math.round((Weather.kind === 'storm' ? 34 : Weather.kind === 'shower' ? 26 : 16) * areas.length)
      : 0;
    const wantFlakes = snowing ? 20 * areas.length : 0;

    // thêm/bớt dần cho mượt khi thời tiết đổi
    while (this.drops.length < wantDrops) this.drops.push(this._spawnDrop(pick(areas)));
    while (this.drops.length > wantDrops) this.drops.pop();
    while (this.flakes.length < wantFlakes) this.flakes.push(this._spawnFlake(pick(areas)));
    while (this.flakes.length > wantFlakes) this.flakes.pop();

    // gió đẩy mưa nghiêng
    const slant = clamp(Weather.wind / 12, -0.6, 0.6);

    for (const d of this.drops) {
      d.y += d.sp * k;
      d.x += slant * d.sp * 0.5 * k;
      const a = areas.find((r) => d.x >= r.x - 12 && d.x <= r.x + r.w + 12) || areas[0];
      if (d.y > a.y + a.h) Object.assign(d, this._spawnDrop(a), { y: a.y - rand(0, 12) });
    }

    for (const f of this.flakes) {
      f.ph += dt * 0.002;
      f.y += f.sp * k;
      f.x += (Math.sin(f.ph) * 0.5 + slant * 0.8) * k;
      const a = areas.find((r) => f.x >= r.x - 10 && f.x <= r.x + r.w + 10) || areas[0];
      if (f.y > a.y + a.h) Object.assign(f, this._spawnFlake(a), { y: a.y - rand(0, 10) });
    }

    // Giọt đọng trên kính: chỉ có khi đang mưa VÀ đang ở trong phòng có
    // cửa sổ. Đổi sang scene ngoài trời thì phải xoá, không thì giọt còn
    // lơ lửng ở chỗ chẳng có kính nào.
    const wantBeads = raining && !Scenes.isOutdoor;
    if (wantBeads && !this.beads.length) {
      for (let i = 0; i < 26; i++) {
        const w = this.WINDOWS[i % this.WINDOWS.length];
        this.beads.push({
          x: w.x + 8 + hash1(i * 7 + 1) * (w.w - 16),
          y: w.y + 8 + hash1(i * 7 + 2) * (w.h - 16),
          r: 1.4 + hash1(i * 7 + 3) * 2.4,
        });
      }
    } else if (!wantBeads && this.beads.length) {
      this.beads.length = 0;
    }

    // sấm: loé sáng cả phòng
    if (Weather.kind === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = rand(6000, 16000);
        this.flash = 320;
      }
    }
    if (this.flash > 0) this.flash -= dt;
  },

  /* Vẽ mưa/tuyết trong ô cửa sổ; gọi sau khi Scenes đã vẽ nền */
  draw(ctx) {
    if (this.drops.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190, 214, 240, .75)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      const slant = clamp(Weather.wind / 12, -0.6, 0.6);
      for (const d of this.drops) {
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + slant * d.len, d.y + d.len);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.flakes.length) {
      ctx.save();
      ctx.fillStyle = '#f4f9ff';
      for (const f of this.flakes) {
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (this.beads.length) {
      ctx.save();
      for (const b of this.beads) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#cfe4f7';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * 0.8, b.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.4, b.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  /* Sương mù + loé sấm, vẽ sau lớp tối để phủ lên cả phòng */
  drawOverlay(ctx) {
    if (Weather.kind === 'fog') {
      const t = performance.now() / 1000;
      ctx.save();
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 3; i++) {
        const y = 150 + i * 130 + Math.sin(t * 0.15 + i) * 16;
        const g = ctx.createLinearGradient(0, y - 70, 0, y + 70);
        g.addColorStop(0, 'rgba(214, 220, 234, 0)');
        g.addColorStop(0.5, 'rgba(214, 220, 234, .9)');
        g.addColorStop(1, 'rgba(214, 220, 234, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 70, CFG.W, 140);
      }
      ctx.restore();
    }

    if (this.flash > 0) {
      // hai nhịp loé nhanh rồi tắt
      const u = this.flash / 320;
      const a = (Math.sin(u * Math.PI * 3) ** 2) * u * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = '#dce8ff';
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.restore();
    }
  },
};
