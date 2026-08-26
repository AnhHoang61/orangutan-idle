/* Danh sách scene được nạp ở cuối file (sau khi Scenes có đủ helper). */
const Scenes = {
  index: 0,
  _list: [],

  get list() { return this._list; },
  get current() { return this._list[this.index]; },
  get name() { return this.current.name; },

  next(d = 1) {
    this.index = (this.index + d + this._list.length) % this._list.length;
    return this.name;
  },

  draw(ctx) { this.current.draw(ctx); },

  /* Có nên bật đèn trần / trăng sao khi tối */
  get isOutdoor() { return !!this.current.outdoor; },

  /* ---------- Helper dùng chung ---------- */

  /* Nền dọc chuyển sắc cho phần phía trên sàn */
  _sky(ctx, top, bot) {
    const g = ctx.createLinearGradient(0, 0, 0, CFG.FLOOR_Y);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.FLOOR_Y);
  },

  /* Sàn phẳng một màu + vân dọc phối cảnh */
  _floorBoards(ctx, base, dark, step = 66) {
    ctx.fillStyle = base;
    ctx.fillRect(0, CFG.FLOOR_Y, CFG.W, CFG.H - CFG.FLOOR_Y);
    ctx.fillStyle = dark;
    for (let x = -40; x < CFG.W + 80; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, CFG.H);
      ctx.lineTo(x + 30, CFG.FLOOR_Y);
      ctx.lineTo(x + 33, CFG.FLOOR_Y);
      ctx.lineTo(x + 4, CFG.H);
      ctx.closePath();
      ctx.fill();
    }
  },

  /* Sàn phẳng không vân (cỏ, cát, sàn gỗ liền) */
  _floorFlat(ctx, base, edge) {
    ctx.fillStyle = base;
    ctx.fillRect(0, CFG.FLOOR_Y, CFG.W, CFG.H - CFG.FLOOR_Y);
    if (edge) {
      ctx.fillStyle = edge;
      ctx.fillRect(0, CFG.FLOOR_Y, CFG.W, 5);
    }
  },

  /* Sao lấp lánh tất định, chỉ hiện khi trời tối thật.
     Đọc DayNight chứ không đọc Render._dark: bật đèn trong phòng
     không được làm sao trên trời tắt đi. */
  _stars(ctx, n, maxY) {
    const d = 1 - DayNight.light;
    if (d < 0.15) return;
    ctx.save();
    ctx.globalAlpha = clamp((d - 0.15) * 1.4, 0, 1);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < n; i++) {
      const x = hash1(i * 3 + 1) * CFG.W;
      const y = hash1(i * 3 + 2) * maxY;
      const tw = 0.55 + 0.45 * Math.sin(performance.now() / 700 + i);
      ctx.globalAlpha = clamp((d - 0.15) * 1.4, 0, 1) * tw;
      const s = hash1(i * 3 + 3) > 0.85 ? 2.5 : 1.6;
      ctx.fillRect(x, y, s, s);
    }
    ctx.restore();
  },

  /* Cây cối nền: tán lá xếp lớp */
  _tree(ctx, x, baseY, h, w, trunk, leaf, leafDark) {
    ctx.fillStyle = trunk;
    ctx.fillRect(x - w * 0.09, baseY - h * 0.62, w * 0.18, h * 0.62);
    ctx.fillStyle = leafDark;
    ctx.beginPath();
    ctx.ellipse(x, baseY - h * 0.72, w * 0.55, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = leaf;
    for (const [ox, oy, rr] of [[-w * 0.26, -h * 0.76, w * 0.3], [w * 0.24, -h * 0.74, w * 0.28], [0, -h * 0.88, w * 0.32]]) {
      ctx.beginPath();
      ctx.arc(x + ox, baseY + oy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /* Mặt trăng hoặc mặt trời tuỳ giờ trong ngày */
  _celestial(ctx, x, y, r) {
    const d = 1 - DayNight.light;
    if (d > 0.4) {
      ctx.fillStyle = '#f5e9c0';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,210,180,.5)';
      for (const [cx, cy, cr] of [[-4, -3, 3], [5, 4, 2.4], [1, 7, 1.8]]) {
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.4);
      g.addColorStop(0, 'rgba(255, 236, 170, .95)');
      g.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

/* ---------------- Danh sách scene ---------------- */
Scenes._list = [
  /* 1. Phòng ngủ ấm (bản gốc) */
  {
    name: 'Phòng ngủ',
    draw(ctx) {
      Scenes._sky(ctx, PAL.wallTop, PAL.wallBot);
      ctx.fillStyle = '#2f2845';
      ctx.fillRect(0, CFG.FLOOR_Y - 16, CFG.W, 16);
      Render._window(ctx, 400, 66, 168, 122);
      Render._window(ctx, 640, 66, 168, 122);
      // kệ phải + cây trái là đồ mua được (Decor), scene chỉ giữ phần cố định
      Render._shelf(ctx, 900, 168);
      Render._plant(ctx, 62, CFG.FLOOR_Y - 4);
      Scenes._floorBoards(ctx, PAL.floor, PAL.floorDark);
    },
  },

  /* 2. Rừng nhiệt đới — quê của đười ươi */
  {
    name: 'Rừng rậm',
    outdoor: true,
    draw(ctx) {
      Scenes._sky(ctx, '#2d5f4a', '#5b9b6b');
      Scenes._stars(ctx, 40, CFG.FLOOR_Y * 0.55);
      Scenes._celestial(ctx, 930, 78, 26);

      // núi mờ phía xa
      ctx.fillStyle = 'rgba(30, 70, 55, .55)';
      for (const [mx, mw, mh] of [[180, 260, 130], [520, 300, 165], [880, 280, 120]]) {
        ctx.beginPath();
        ctx.moveTo(mx - mw / 2, CFG.FLOOR_Y);
        ctx.lineTo(mx, CFG.FLOOR_Y - mh);
        ctx.lineTo(mx + mw / 2, CFG.FLOOR_Y);
        ctx.closePath();
        ctx.fill();
      }

      // hàng cây rậm
      for (let i = 0; i < 9; i++) {
        const x = 40 + i * 132 + hash1(i + 70) * 40;
        const h = 210 + hash1(i + 90) * 90;
        Scenes._tree(ctx, x, CFG.FLOOR_Y + 12, h, 130, '#4a3520', '#3f8a4a', '#2c6636');
      }

      // dây leo rủ từ trên
      ctx.strokeStyle = '#2f7a3f';
      ctx.lineWidth = 4;
      for (let i = 0; i < 7; i++) {
        const x = 70 + i * 168;
        const len = 90 + hash1(i + 30) * 120;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 18, len * 0.6, x + 6, len);
        ctx.stroke();
      }

      // đất rừng
      Scenes._floorFlat(ctx, '#5c7f3f', '#7ba354');
      // bụi cỏ lún phún
      ctx.fillStyle = '#476b30';
      for (let i = 0; i < 90; i++) {
        const x = hash1(i * 2 + 11) * CFG.W;
        const y = CFG.FLOOR_Y + 12 + hash1(i * 2 + 12) * (CFG.H - CFG.FLOOR_Y - 16);
        ctx.fillRect(x, y, 3, 7);
        ctx.fillRect(x + 4, y + 2, 3, 5);
      }
    },
  },

  /* 3. Bãi biển lúc chiều */
  {
    name: 'Bãi biển',
    outdoor: true,
    draw(ctx) {
      Scenes._sky(ctx, '#f2955c', '#ffd9a0');
      Scenes._stars(ctx, 32, CFG.FLOOR_Y * 0.5);
      Scenes._celestial(ctx, 760, 120, 34);

      // biển
      ctx.fillStyle = '#2f86b8';
      ctx.fillRect(0, CFG.FLOOR_Y - 108, CFG.W, 108);
      // vệt sóng ngang chạy chậm
      for (let i = 0; i < 7; i++) {
        const y = CFG.FLOOR_Y - 100 + i * 15;
        ctx.fillStyle = `rgba(255,255,255,${0.10 + i * 0.03})`;
        const off = Math.sin(performance.now() / 1400 + i) * 26;
        ctx.fillRect(-40 + off, y, CFG.W + 80, 3);
      }
      // bọt sóng sát bờ
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.moveTo(0, CFG.FLOOR_Y);
      for (let x = 0; x <= CFG.W; x += 40) {
        ctx.lineTo(x, CFG.FLOOR_Y - 6 + Math.sin(performance.now() / 900 + x * 0.02) * 4);
      }
      ctx.lineTo(CFG.W, CFG.FLOOR_Y);
      ctx.closePath();
      ctx.fill();

      // cát
      Scenes._floorFlat(ctx, '#e8cf9a', '#f2e0b8');
      ctx.fillStyle = 'rgba(190,160,110,.4)';
      for (let i = 0; i < 70; i++) {
        const x = hash1(i * 2 + 21) * CFG.W;
        const y = CFG.FLOOR_Y + 10 + hash1(i * 2 + 22) * (CFG.H - CFG.FLOOR_Y - 14);
        ctx.fillRect(x, y, 3, 2);
      }
      // vỏ sò rải rác
      for (let i = 0; i < 8; i++) {
        const x = 60 + hash1(i + 44) * (CFG.W - 120);
        const y = CFG.FLOOR_Y + 26 + hash1(i + 55) * 90;
        ctx.fillStyle = i % 2 ? '#f2b8c6' : '#fff0d8';
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 5, hash1(i) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // cây dừa
      for (const [px, ph] of [[110, 230], [1010, 200]]) {
        ctx.strokeStyle = '#8a5f34';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, CFG.FLOOR_Y + 20);
        ctx.quadraticCurveTo(px - 22, CFG.FLOOR_Y - ph * 0.5, px - 8, CFG.FLOOR_Y - ph);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#3f8a4a';
        for (let a = 0; a < 6; a++) {
          const ang = Math.PI + (a / 5) * Math.PI;
          ctx.save();
          ctx.translate(px - 8, CFG.FLOOR_Y - ph);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(34, 0, 36, 11, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
  },

  /* 4. Đồi tuyết */
  {
    name: 'Đồi tuyết',
    outdoor: true,
    draw(ctx) {
      Scenes._sky(ctx, '#3c4f77', '#9db6d4');
      Scenes._stars(ctx, 46, CFG.FLOOR_Y * 0.6);
      Scenes._celestial(ctx, 200, 84, 24);

      // dãy núi tuyết
      for (const [mx, mw, mh, col] of [
        [260, 420, 210, '#6f86a8'], [700, 480, 250, '#7d93b4'], [1030, 340, 180, '#8ba1bf'],
      ]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(mx - mw / 2, CFG.FLOOR_Y);
        ctx.lineTo(mx, CFG.FLOOR_Y - mh);
        ctx.lineTo(mx + mw / 2, CFG.FLOOR_Y);
        ctx.closePath();
        ctx.fill();
        // đỉnh phủ tuyết
        ctx.fillStyle = '#eaf2fa';
        ctx.beginPath();
        ctx.moveTo(mx - mw * 0.14, CFG.FLOOR_Y - mh * 0.66);
        ctx.lineTo(mx, CFG.FLOOR_Y - mh);
        ctx.lineTo(mx + mw * 0.14, CFG.FLOOR_Y - mh * 0.66);
        ctx.closePath();
        ctx.fill();
      }

      // cây thông
      for (let i = 0; i < 8; i++) {
        const x = 60 + i * 148 + hash1(i + 12) * 30;
        const h = 96 + hash1(i + 24) * 54;
        ctx.fillStyle = '#3e2a1c';
        ctx.fillRect(x - 4, CFG.FLOOR_Y - 18, 8, 22);
        ctx.fillStyle = '#1f5138';
        for (let t = 0; t < 3; t++) {
          const ty = CFG.FLOOR_Y - 14 - t * h * 0.26;
          const tw = 34 - t * 8;
          ctx.beginPath();
          ctx.moveTo(x - tw, ty);
          ctx.lineTo(x, ty - h * 0.4);
          ctx.lineTo(x + tw, ty);
          ctx.closePath();
          ctx.fill();
        }
      }

      // mặt tuyết
      Scenes._floorFlat(ctx, '#e9f1f9', '#ffffff');
      ctx.fillStyle = 'rgba(160,185,215,.5)';
      for (let i = 0; i < 26; i++) {
        const x = hash1(i * 2 + 61) * CFG.W;
        const y = CFG.FLOOR_Y + 18 + hash1(i * 2 + 62) * (CFG.H - CFG.FLOOR_Y - 24);
        ctx.beginPath();
        ctx.ellipse(x, y, 22, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // tuyết rơi
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      const t = performance.now() / 1000;
      for (let i = 0; i < 70; i++) {
        const sp = 18 + hash1(i + 200) * 34;
        const x = (hash1(i + 300) * CFG.W + Math.sin(t * 0.5 + i) * 22) % CFG.W;
        const y = (hash1(i + 400) * CFG.H + t * sp) % CFG.H;
        const r = hash1(i + 500) > 0.8 ? 2.6 : 1.7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  /* 5. Ban công nhìn ra thành phố đêm */
  {
    name: 'Thành phố',
    outdoor: true,
    draw(ctx) {
      Scenes._sky(ctx, '#141a33', '#3b2f52');
      Scenes._stars(ctx, 55, CFG.FLOOR_Y * 0.7);
      Scenes._celestial(ctx, 980, 66, 22);

      // các toà nhà xếp lớp, đèn cửa sổ tất định
      const rows = [
        { y: CFG.FLOOR_Y - 40, h: 150, w: 74, col: '#1e2440', lit: '#3d4670' },
        { y: CFG.FLOOR_Y - 20, h: 220, w: 92, col: '#262d4d', lit: '#4a5588' },
      ];
      rows.forEach((row, ri) => {
        for (let i = 0; i < Math.ceil(CFG.W / row.w) + 1; i++) {
          const x = i * row.w - 20 + ri * 26;
          const bh = row.h * (0.55 + hash1(i * 5 + ri * 90) * 0.65);
          ctx.fillStyle = row.col;
          ctx.fillRect(x, row.y - bh, row.w - 10, bh + 60);
          // cửa sổ
          for (let wy = 0; wy < Math.floor(bh / 22); wy++) {
            for (let wx = 0; wx < 3; wx++) {
              const on = hash1(i * 37 + wy * 7 + wx * 3 + ri * 11) > 0.42;
              if (!on) continue;
              ctx.fillStyle = hash1(i + wy + wx) > 0.7 ? '#ffd98a' : row.lit;
              ctx.fillRect(x + 9 + wx * 20, row.y - bh + 12 + wy * 22, 11, 12);
            }
          }
        }
      });

      // sàn ban công gỗ
      Scenes._floorBoards(ctx, '#4a3b30', '#3a2d24', 58);
      // lan can
      ctx.fillStyle = '#2b2119';
      ctx.fillRect(0, CFG.FLOOR_Y - 6, CFG.W, 10);
      ctx.fillStyle = '#37291f';
      for (let x = 20; x < CFG.W; x += 46) ctx.fillRect(x, CFG.FLOOR_Y - 4, 7, 26);
      // dây đèn treo
      ctx.strokeStyle = '#4a4030';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 26);
      ctx.quadraticCurveTo(CFG.W / 2, 78, CFG.W, 26);
      ctx.stroke();
      for (let i = 0; i <= 14; i++) {
        const t2 = i / 14;
        const bx = t2 * CFG.W;
        const by = 26 + Math.sin(t2 * Math.PI) * 52;
        const glow = 0.6 + 0.4 * Math.sin(performance.now() / 600 + i);
        ctx.fillStyle = `rgba(255, 210, 130, ${glow})`;
        ctx.beginPath();
        ctx.arc(bx, by + 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  /* 6. Đáy biển */
  {
    name: 'Đáy biển',
    outdoor: true,
    draw(ctx) {
      Scenes._sky(ctx, '#0d3f63', '#1c6f96');

      // tia nắng xuyên nước
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#bdf0ff';
      for (let i = 0; i < 6; i++) {
        const x = 90 + i * 190 + Math.sin(performance.now() / 2600 + i) * 26;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 46, 0);
        ctx.lineTo(x + 96, CFG.FLOOR_Y);
        ctx.lineTo(x - 16, CFG.FLOOR_Y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // rong biển lượn
      for (let i = 0; i < 12; i++) {
        const x = 40 + i * 96 + hash1(i + 77) * 30;
        const h = 100 + hash1(i + 88) * 130;
        ctx.strokeStyle = i % 2 ? '#2f8a5c' : '#246e4a';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, CFG.FLOOR_Y + 14);
        const sway = Math.sin(performance.now() / 1300 + i) * 22;
        ctx.quadraticCurveTo(x + sway, CFG.FLOOR_Y - h * 0.5, x + sway * 1.4, CFG.FLOOR_Y - h);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';

      // bong bóng nổi lên
      const tb = performance.now() / 1000;
      for (let i = 0; i < 34; i++) {
        const x = hash1(i + 600) * CFG.W + Math.sin(tb + i) * 12;
        const sp = 22 + hash1(i + 700) * 40;
        const y = CFG.H - ((tb * sp + hash1(i + 800) * CFG.H) % (CFG.H + 40));
        const r = 2 + hash1(i + 900) * 3.5;
        ctx.strokeStyle = 'rgba(200,240,255,.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // cát đáy biển
      Scenes._floorFlat(ctx, '#c9b489', '#ddcaa2');
      // đá và sao biển
      for (let i = 0; i < 12; i++) {
        const x = 50 + hash1(i + 111) * (CFG.W - 100);
        const y = CFG.FLOOR_Y + 24 + hash1(i + 222) * 100;
        if (i % 4 === 0) {
          ctx.fillStyle = '#e8825f';
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(hash1(i) * 3);
          for (let a = 0; a < 5; a++) {
            ctx.rotate((Math.PI * 2) / 5);
            ctx.beginPath();
            ctx.ellipse(0, -7, 3.4, 8, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.fillStyle = '#8d8377';
          ctx.beginPath();
          ctx.ellipse(x, y, 9 + hash1(i) * 7, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
];

