/* Đồ trang trí mua được. Mỗi món có giá, lớp vẽ, và vùng pet tương tác.

   `y` là mốc dưới của món, dùng để sort lớp với pet (món đứng thấp hơn
   thì vẽ sau, che pet phía trên).
   `back: true` = luôn vẽ sau nền, trước mọi pet (đồ treo tường).
   `spot` = chỗ pet có thể tới nằm/ngồi/ngắm, dùng ở task idle animation. */
const Decor = {
  owned: new Set(),

  /* Mua rồi thì vẽ, chưa mua thì không tồn tại trong phòng */
  has(id) { return this.owned.has(id); },

  buy(id) {
    const it = this.byId(id);
    if (!it || this.has(id)) return false;
    this.owned.add(id);
    return true;
  },

  byId(id) { return this.ITEMS.find((i) => i.id === id); },

  reset() { this.owned.clear(); },

  /* Tier mở dần: phải mua hết tier trước mới thấy tier sau */
  tierUnlocked(tier) {
    if (tier <= 1) return true;
    return this.ITEMS.filter((i) => i.tier === tier - 1).every((i) => this.has(i.id));
  },

  get list() { return this.ITEMS; },

  /* Các chỗ pet tới được, chỉ tính món đã mua */
  spots() {
    return this.ITEMS.filter((i) => this.has(i.id) && i.spot).map((i) => ({ id: i.id, ...i.spot }));
  },

  /* ---------- Vẽ ---------- */

  /* Đồ treo tường / đứng sau pet */
  drawBack(ctx) {
    for (const it of this.ITEMS) {
      if (!this.has(it.id) || !it.back) continue;
      it.draw(ctx);
    }
  },

  /* Món có chiều sâu: trả về layer để Render sort chung với pet */
  layers() {
    const out = [];
    for (const it of this.ITEMS) {
      if (!this.has(it.id) || it.back) continue;
      out.push({ y: it.y, fn: (ctx) => it.draw(ctx) });
    }
    return out;
  },

  /* Ánh sáng do đồ trang trí phát ra, vẽ sau lớp tối */
  drawGlow(ctx) {
    for (const it of this.ITEMS) {
      if (!this.has(it.id) || !it.glow) continue;
      it.glow(ctx);
    }
  },
};

/* ---------------- Danh sách món ----------------
   Toạ độ đặt tránh vùng bát ăn (x~190) và giữa phòng (chỗ pet đi lại). */
Decor.ITEMS = [
  /* ===== Tier 1: đồ cơ bản, rẻ ===== */
  {
    id: 'rug', tier: 1, price: 60, icon: '🟣',
    name: 'Thảm tròn', note: 'Chỗ nằm ấm giữa phòng',
    back: true, y: 0,
    draw(ctx) {
      // thảm vẽ dưới cùng, ngay trên sàn
      ctx.fillStyle = PAL.rug;
      ctx.beginPath();
      ctx.ellipse(560, 478, 300, 62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.rugEdge;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(560, 478, 268, 50, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(560, 478, 208, 36, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    spot: { x: 560, y: 486, kind: 'lie' },
  },

  {
    id: 'plant', tier: 1, price: 90, icon: '🪴',
    name: 'Cây nhỏ', note: 'Góc phòng xanh hơn',
    y: 404,
    draw(ctx) {
      const x = 1044, y = 404;
      // chậu
      ctx.fillStyle = '#a9603f';
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 40);
      ctx.lineTo(x + 24, y - 40);
      ctx.lineTo(x + 17, y);
      ctx.lineTo(x - 17, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c4744c';
      ctx.fillRect(x - 25, y - 46, 50, 8);
      // lá toả
      ctx.fillStyle = '#4f8f5c';
      for (const [ax, ay, rot] of [[-13, -56, -0.7], [0, -70, 0], [13, -56, 0.7], [-6, -64, -0.3], [8, -62, 0.35]]) {
        ctx.save();
        ctx.translate(x + ax, y + ay);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 8.5, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#66a86f';
      for (const [ax, ay, rot] of [[-8, -60, -0.5], [7, -58, 0.5]]) {
        ctx.save();
        ctx.translate(x + ax, y + ay);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
  },

  /* ===== Tier 2: đồ nội thất ===== */
  {
    id: 'shelf', tier: 2, price: 150, icon: '📚',
    name: 'Kệ sách', note: 'Treo tường, có khung ảnh',
    back: true, y: 0,
    draw(ctx) {
      const x = 96, y = 150;
      ctx.fillStyle = '#5a4630';
      ctx.fillRect(x, y, 128, 8);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(x, y + 8, 128, 4);
      const cols = ['#c9556b', '#5b86c9', '#d8a24e', '#7bc98c', '#b07ac9'];
      let bx = x + 7;
      for (let i = 0; i < 5; i++) {
        const h = 24 + (i % 3) * 8;
        ctx.fillStyle = cols[i];
        ctx.fillRect(bx, y - h, 12, h);
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.fillRect(bx, y - h, 12, 3);
        bx += 15;
      }
      // khung ảnh chân dung hai đứa
      ctx.fillStyle = '#3e3454';
      ctx.fillRect(x + 88, y - 32, 34, 32);
      ctx.fillStyle = '#8f7fb0';
      ctx.fillRect(x + 92, y - 28, 26, 24);
      ctx.fillStyle = SPECIES.orang.pal.furA;
      ctx.beginPath();
      ctx.arc(x + 100, y - 17, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SPECIES.pig.pal.furA;
      ctx.beginPath();
      ctx.arc(x + 111, y - 15, 5.5, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  {
    id: 'plush', tier: 2, price: 190, icon: '🧸',
    name: 'Gấu bông', note: 'Pet thích cọ vào',
    y: 462,
    draw(ctx) {
      const x = 300, y = 462;
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // tai
      ctx.fillStyle = '#9a6b43';
      for (const ex of [-11, 11]) {
        ctx.beginPath();
        ctx.arc(x + ex, y - 40, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      // thân
      ctx.fillStyle = '#b07d50';
      ctx.beginPath();
      ctx.ellipse(x, y - 12, 16, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      // bụng sáng
      ctx.fillStyle = '#cfa176';
      ctx.beginPath();
      ctx.ellipse(x, y - 9, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // chân tay
      ctx.fillStyle = '#9a6b43';
      for (const [lx, ly] of [[-15, -2], [15, -2]]) {
        ctx.beginPath();
        ctx.ellipse(x + lx, y + ly, 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // đầu
      ctx.fillStyle = '#b07d50';
      ctx.beginPath();
      ctx.arc(x, y - 33, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfa176';
      ctx.beginPath();
      ctx.ellipse(x, y - 29, 7, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // mắt mũi
      ctx.fillStyle = '#3a2a1c';
      for (const ex of [-5, 5]) {
        ctx.beginPath();
        ctx.arc(x + ex, y - 35, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(x, y - 29, 2.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    spot: { x: 336, y: 470, kind: 'nuzzle' },
  },

  /* ===== Tier 3: đồ chơi lớn ===== */
  {
    id: 'sofa', tier: 3, price: 320, icon: '🛋️',
    name: 'Sofa', note: 'Lợn trèo lên nằm được',
    y: 448,
    draw(ctx) {
      const x = 858, y = 448;
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 76, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // tựa lưng
      ctx.fillStyle = '#5f7f9c';
      ctx.beginPath();
      ctx.roundRect(x - 72, y - 66, 144, 44, 9);
      ctx.fill();
      // đệm ngồi
      ctx.fillStyle = '#77a0bf';
      ctx.beginPath();
      ctx.roundRect(x - 74, y - 30, 148, 24, 8);
      ctx.fill();
      // hai tay ghế
      ctx.fillStyle = '#526f8a';
      for (const ax of [-74, 60]) {
        ctx.beginPath();
        ctx.roundRect(x + ax, y - 44, 16, 40, 6);
        ctx.fill();
      }
      // đường chỉ giữa hai đệm
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 28);
      ctx.lineTo(x, y - 8);
      ctx.stroke();
      // gối tựa
      ctx.fillStyle = '#e4a0b4';
      ctx.save();
      ctx.translate(x - 44, y - 40);
      ctx.rotate(-0.18);
      ctx.beginPath();
      ctx.roundRect(-13, -13, 26, 26, 5);
      ctx.fill();
      ctx.restore();
      // chân gỗ
      ctx.fillStyle = '#4a3524';
      for (const lx of [-62, 54]) ctx.fillRect(x + lx, y - 6, 9, 9);
    },
    spot: { x: 858, y: 452, kind: 'sit-high' },
  },

  {
    id: 'aquarium', tier: 3, price: 420, icon: '🐠',
    name: 'Bể cá', note: 'Pet tới ngồi ngắm cá',
    y: 400,
    draw(ctx) {
      const x = 660, y = 400, w = 120, h = 76;
      // chân tủ
      ctx.fillStyle = '#4a3524';
      ctx.fillRect(x - w / 2 - 4, y - 8, w + 8, 10);
      // nước
      const g = ctx.createLinearGradient(x, y - h - 8, x, y - 8);
      g.addColorStop(0, '#3f9bc4');
      g.addColorStop(1, '#1d6d94');
      ctx.fillStyle = g;
      ctx.fillRect(x - w / 2, y - h - 8, w, h);
      // sỏi đáy
      ctx.fillStyle = '#8a7355';
      ctx.fillRect(x - w / 2, y - 20, w, 12);
      // rong
      ctx.fillStyle = '#2e7d4f';
      for (const [rx, rh] of [[-38, 30], [-30, 22], [34, 26], [42, 18]]) {
        ctx.beginPath();
        ctx.ellipse(x + rx, y - 20 - rh / 2, 4, rh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // ba con cá bơi qua lại, chu kỳ khác nhau
      const t = performance.now() / 1000;
      const fish = [
        [0.42, 30, '#f2a03d'], [0.31, 52, '#e8577a'], [0.55, 16, '#f7d259'],
      ];
      for (const [spd, oy, col] of fish) {
        const u = (t * spd) % 2;
        const dir = u < 1 ? 1 : -1;
        const p = u < 1 ? u : 2 - u;
        const fx = x - w / 2 + 14 + p * (w - 28);
        const fy = y - h - 8 + oy + Math.sin(t * 2 + oy) * 3;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(dir, 1);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(-12, -4);
        ctx.lineTo(-12, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1e1a22';
        ctx.beginPath();
        ctx.arc(3.4, -0.8, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // bọt khí
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      for (let i = 0; i < 5; i++) {
        const bt = (t * 0.5 + i * 0.2) % 1;
        ctx.beginPath();
        ctx.arc(x + 40, y - 20 - bt * (h - 16), 2 + i % 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // kính + khung
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(x - w / 2, y - h - 8, w * 0.3, h);
      ctx.strokeStyle = '#2a2233';
      ctx.lineWidth = 5;
      ctx.strokeRect(x - w / 2, y - h - 8, w, h);
      // nắp có đèn
      ctx.fillStyle = '#332a42';
      ctx.fillRect(x - w / 2 - 5, y - h - 16, w + 10, 9);
    },
    spot: { x: 660, y: 462, kind: 'watch' },
    glow(ctx) {
      // đèn bể cá hắt ra sàn khi phòng tối
      const d = Render._dark;
      if (d < 0.1) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = d * 0.3;
      const g = ctx.createRadialGradient(660, 370, 10, 660, 370, 150);
      g.addColorStop(0, 'rgba(120, 210, 255, .8)');
      g.addColorStop(1, 'rgba(120, 210, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(660, 370, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  /* ===== Tier 4: đồ đêm, chỉ đẹp khi tắt đèn ===== */
  {
    id: 'starlight', tier: 4, price: 560, icon: '⭐',
    name: 'Đèn sao', note: 'Dây sao treo tường, sáng về đêm',
    back: true, y: 0,
    draw(ctx) {
      // dây võng giữa hai điểm
      ctx.strokeStyle = 'rgba(80, 68, 100, .9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 46);
      ctx.quadraticCurveTo(560, 96, 1080, 46);
      ctx.stroke();
    },
    glow(ctx) {
      const d = clamp(Render._dark * 1.4, 0, 1);
      const t = performance.now() / 1000;
      ctx.save();
      for (let i = 0; i < 18; i++) {
        const u = i / 17;
        // theo đúng đường quadratic của dây
        const x = lerp(lerp(40, 560, u), lerp(560, 1080, u), u);
        const y = lerp(lerp(46, 96, u), lerp(96, 46, u), u);
        const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + i * 0.9);
        const a = clamp(0.25 + d * 0.75, 0, 1) * tw;

        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
        g.addColorStop(0, 'rgba(255, 232, 160, .9)');
        g.addColorStop(1, 'rgba(255, 232, 160, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = clamp(a + 0.2, 0, 1);
        ctx.fillStyle = '#fff4cd';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },

  {
    id: 'projector', tier: 4, price: 780, icon: '🪐',
    name: 'Máy chiếu thiên hà', note: 'Chiếu sao lên tường khi tắt đèn',
    y: 458,
    draw(ctx) {
      const x = 486, y = 458;
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // thân hình cầu trên đế
      ctx.fillStyle = '#2f2740';
      ctx.beginPath();
      ctx.roundRect(x - 15, y - 10, 30, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#453a5e';
      ctx.beginPath();
      ctx.arc(x, y - 20, 13, 0, Math.PI * 2);
      ctx.fill();
      // vòng đai
      ctx.strokeStyle = '#6f5d92';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y - 20, 17, 5.5, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      // ô kính phát sáng
      const on = Render._dark > 0.12;
      ctx.fillStyle = on ? '#9fd8ff' : '#5a6f86';
      ctx.beginPath();
      ctx.arc(x + 5, y - 24, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    glow(ctx) {
      const d = Render._dark;
      if (d < 0.12) return;
      const t = performance.now() / 1000;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // đốm sao quay chậm trên tường
      const a = clamp((d - 0.12) * 1.5, 0, 1);
      for (let i = 0; i < 46; i++) {
        const ang = hash1(i * 5 + 3) * Math.PI * 2 + t * 0.06;
        const rad = 60 + hash1(i * 5 + 4) * 240;
        const sx = 486 + Math.cos(ang) * rad;
        const sy = 190 + Math.sin(ang) * rad * 0.42;
        if (sy < 8 || sy > CFG.FLOOR_Y - 6) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
        ctx.globalAlpha = a * tw * 0.85;
        ctx.fillStyle = i % 5 === 0 ? '#ffd2e8' : '#dff0ff';
        const s = hash1(i * 5 + 5) > 0.82 ? 2.6 : 1.7;
        ctx.fillRect(sx, sy, s, s);
      }

      // quầng tím mờ như dải ngân hà
      ctx.globalAlpha = a * 0.16;
      const g = ctx.createRadialGradient(486, 200, 20, 486, 200, 320);
      g.addColorStop(0, 'rgba(150, 120, 255, .7)');
      g.addColorStop(1, 'rgba(150, 120, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(486, 200, 320, 150, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },
];
