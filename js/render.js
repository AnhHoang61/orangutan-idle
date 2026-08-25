/* Vẽ phòng, mèo và ánh sáng. */
const Render = {
  lightsOn: true,
  _dark: 0,          // giá trị nội suy để tắt/bật đèn mượt

  draw(ctx) {
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    Scenes.draw(ctx);
    Items.drawBowl(ctx);

    // sort theo y: con/bóng đứng thấp hơn thì vẽ sau (che con phía trên)
    const layers = [
      ...Pets.list.map((a) => ({ y: a.y, fn: () => this._pet(ctx, a) })),
      { y: Items.ball.active ? Items.ball.y : -1, fn: () => Items.drawBall(ctx) },
    ].filter((l) => l.y >= 0).sort((a, b) => a.y - b.y);
    for (const l of layers) l.fn();

    Items.drawLaser(ctx);
    FX.draw(ctx);
    this._light(ctx);
  },

  /* Nền do Scenes vẽ. Các hàm _window/_shelf/_plant dưới đây
     được scene "Phòng ngủ" gọi lại. */

  _window(ctx, x, y, w, h) {
    ctx.fillStyle = '#1a2a4d';
    ctx.fillRect(x, y, w, h);
    // trời đêm + trăng
    const night = this._dark > 0.2;
    if (night) {
      ctx.fillStyle = '#f5e9c0';
      ctx.beginPath();
      ctx.arc(x + w - 42, y + 36, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2a4d';
      ctx.beginPath();
      ctx.arc(x + w - 34, y + 30, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (const [sx, sy] of [[18, 22], [46, 58], [30, 84], [96, 30], [70, 16], [112, 76]]) {
        ctx.fillRect(x + sx, y + sy, 2, 2);
      }
    } else {
      const sg = ctx.createLinearGradient(x, y, x, y + h);
      sg.addColorStop(0, '#7fb4e8');
      sg.addColorStop(1, '#c8dff2');
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.ellipse(x + 36, y + 40, 22, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 58, y + 36, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // khung
    ctx.strokeStyle = '#20192f';
    ctx.lineWidth = 7;
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    // bệ cửa
    ctx.fillStyle = '#3a3152';
    ctx.fillRect(x - 8, y + h, w + 16, 8);
  },

  _shelf(ctx, x, y) {
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(x, y, 128, 8);
    // mấy quyển sách
    const cols = ['#c9556b', '#5b86c9', '#d8a24e', '#7bc98c'];
    let bx = x + 8;
    for (let i = 0; i < 4; i++) {
      const h = 26 + (i % 3) * 7;
      ctx.fillStyle = cols[i];
      ctx.fillRect(bx, y - h, 13, h);
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.fillRect(bx, y - h, 13, 3);
      bx += 16;
    }
    // khung ảnh
    ctx.fillStyle = '#3e3454';
    ctx.fillRect(x + 84, y - 30, 34, 30);
    ctx.fillStyle = '#8f7fb0';
    ctx.fillRect(x + 88, y - 26, 26, 22);
    ctx.fillStyle = PAL.furA;
    ctx.beginPath();
    ctx.arc(x + 101, y - 15, 7, 0, Math.PI * 2);
    ctx.fill();
  },

  _plant(ctx, x, y) {
    ctx.fillStyle = '#a9603f';
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 44);
    ctx.lineTo(x + 26, y - 44);
    ctx.lineTo(x + 18, y);
    ctx.lineTo(x - 18, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c4744c';
    ctx.fillRect(x - 27, y - 50, 54, 8);
    ctx.fillStyle = '#4f8f5c';
    for (const [ax, ay, rot] of [[-14, -60, -0.7], [0, -74, 0], [14, -60, 0.7], [-6, -68, -0.3], [8, -66, 0.35]]) {
      ctx.save();
      ctx.translate(x + ax, y + ay);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  /* ---------- Con mèo ---------- */
  /* Vẽ một con vật. `a` là thực thể từ Pets.list. */
  _pet(ctx, a) {
    const s = a.state;
    if (s === 'sleep') return this._petSleeping(ctx, a);

    const P = a.pal;
    const moving = (s === 'walk' || s === 'chase' || s === 'play' || s === 'follow') && a.vx !== 0;
    const x = a.x;
    const crouch = a.crouch;
    const sitting = s === 'sit' || s === 'groom' || s === 'pet' || s === 'eat' || s === 'greet';
    const breathe = Math.sin(a.bob) * (sitting ? 1.1 : 0.6);
    const stepBob = moving ? Math.abs(Math.sin(a.bob * 3)) * 1.8 : 0;
    const y = a.y - stepBob + crouch * 6;
    const f = a.facing;

    const S = a.scale;

    // bóng
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath();
    ctx.ellipse(x, a.y + 10, 30 * S, 8 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f * S, S);      // lật ngang theo hướng + phóng to

    // đười ươi không có đuôi
    // chân sau + trước
    const bodyH = sitting ? 26 : 30 - crouch * 5;
    const legSwing = (s === 'walk' || s === 'chase' || s === 'play') && a.vx !== 0
      ? Math.sin(a.bob * 3) * 3 : 0;

    // chân sau: ngắn, hơi khuỳnh
    ctx.fillStyle = P.furB;
    if (sitting) {
      ctx.fillRect(-13, -8, 9, 10);
      ctx.fillRect(4, -8, 9, 10);
    } else {
      ctx.fillRect(-16 + legSwing, -11, 9, 13);
      ctx.fillRect(7 - legSwing, -11, 9, 13);
    }
    // bàn chân sẫm
    ctx.fillStyle = P.hoof;
    if (sitting) {
      ctx.fillRect(-14, -1, 11, 4);
      ctx.fillRect(3, -1, 11, 4);
    } else {
      ctx.fillRect(-17 + legSwing, -1, 11, 4);
      ctx.fillRect(6 - legSwing, -1, 11, 4);
    }

    // thân: vai rộng, thóp lại phía dưới
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    if (sitting) {
      ctx.ellipse(0, -20 + breathe, 19, 21, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, -21 + breathe, 24, bodyH / 2 + 6, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // ngực sáng
    ctx.fillStyle = P.belly;
    ctx.beginPath();
    ctx.ellipse(sitting ? 2 : 3, -16 + breathe, sitting ? 11 : 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tay: đười ươi buông dài sát sàn; tinh tinh ngắn hơn, chống đất kiểu knuckle-walk
    const long = a.sp.hasLongArms;
    const armSwing = moving ? Math.sin(a.bob * 3) * (long ? 5 : 4) : Math.sin(a.bob) * 1.2;
    const reach = long ? 1.15 : 0.95;    // tay tinh tinh với ngắn hơn
    const drop = long ? -2 : -7;         // và không chạm hẳn xuống sàn
    ctx.strokeStyle = P.furB;
    ctx.lineWidth = long ? 9 : 8;
    ctx.lineCap = 'round';
    for (const [sx, sw] of [[-19, -armSwing], [19, armSwing]]) {
      ctx.beginPath();
      ctx.moveTo(sx * 0.85, -31 + breathe);
      ctx.quadraticCurveTo(sx * (long ? 1.35 : 1.15) + sw, -18, sx * reach + sw * 1.6, drop);
      ctx.stroke();
    }
    // bàn tay
    ctx.fillStyle = P.hoof;
    for (const [sx, sw] of [[-19, -armSwing], [19, armSwing]]) {
      ctx.beginPath();
      ctx.ellipse(sx * reach + sw * 1.6, drop + 2, 5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';

    // đầu
    const headY = (sitting ? -40 : -32) + breathe;
    const headX = sitting ? 2 : 17;
    this._head(ctx, headX, headY, s, a);

    ctx.restore();
  },

  _head(ctx, hx, hy, state, a) {
    const P = a.pal;
    ctx.save();
    ctx.translate(hx, hy);

    // nghiêng đầu khi liếm chân
    if (state === 'groom') ctx.rotate(0.45 + Math.sin(a.bob * 4) * 0.12);
    if (state === 'eat') ctx.rotate(0.3 + Math.sin(a.bob * 6) * 0.1);

    // tai nhỏ tròn, sát đầu
    const tw = a.earTwitch > 0 ? 1.6 : 0;
    ctx.fillStyle = P.ear;
    for (const ex of [-16, 16]) {
      ctx.beginPath();
      ctx.ellipse(ex + Math.sign(ex) * tw, -1, 4, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // tóc xù trên đỉnh đầu
    ctx.fillStyle = P.furB;
    for (const [hx, hy, hr] of [[-7, -13, 5], [0, -15, 5.5], [7, -13, 5]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    // sọ tròn
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // gờ má hai bên (đặc trưng đười ươi đực)
    ctx.fillStyle = P.furB;
    for (const ex of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(ex * 14, 2, 5, 11, ex * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // đĩa mặt phẳng nhạt
    ctx.fillStyle = P.face;
    ctx.beginPath();
    ctx.ellipse(0, 1, 11.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // mắt
    const closed = a.blink > 0 || state === 'groom' || a.purr > 0;
    if (closed) {
      ctx.strokeStyle = P.eye;
      ctx.lineWidth = 2;
      for (const ex of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(ex, -2, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    } else {
      const wide = state === 'chase' || state === 'play';
      for (const ex of [-6, 6]) {
        ctx.fillStyle = '#fffdf5';
        ctx.beginPath();
        ctx.ellipse(ex, -2, wide ? 5 : 4.2, wide ? 5.4 : 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.eye;
        ctx.beginPath();
        // con ngươi co lại khi rình
        ctx.ellipse(ex + 0.6, -2, wide ? 2.6 : 1.5, wide ? 4.6 : 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillRect(ex - 1.6, -5, 1.6, 1.6);
      }
    }

    // vùng miệng nhô: mõm bầu thấp
    const chew = state === 'eat' ? Math.sin(a.bob * 6) * 1.2 : 0;
    ctx.fillStyle = P.snout;
    ctx.beginPath();
    ctx.ellipse(0, 7 + chew * 0.3, 7.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // mũi nhỏ: hai lỗ sát nhau, hướng xuống
    ctx.fillStyle = P.nostril;
    for (const nx of [-2.2, 2.2]) {
      ctx.beginPath();
      ctx.ellipse(nx, 4, 1.3, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // miệng: cười nhẹ cho cute
    ctx.strokeStyle = P.nostril;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (state === 'eat' && chew > 0) {
      ctx.arc(0, 8, 3.2, 0.05 * Math.PI, 0.95 * Math.PI);
    } else if (a.purr > 0 || state === 'play') {
      // cười tươi
      ctx.arc(0, 7, 4, 0.12 * Math.PI, 0.88 * Math.PI);
    } else {
      ctx.moveTo(-3.2, 8.5); ctx.quadraticCurveTo(0, 10.4, 3.2, 8.5);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.restore();
  },

  _petSleeping(ctx, a) {
    const P = a.pal;
    const x = a.x, y = a.y;
    const breathe = Math.sin(a.bob * 0.7) * 1.4;

    const S = a.scale;

    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 34 * S, 8 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(a.facing * S, S);

    // cuộn tròn: thân là ellipse bẹt
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, -14 + breathe, 34, 16 + breathe * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // chân gập dưới bụng
    ctx.fillStyle = P.furB;
    for (const ox of [-14, 2]) ctx.fillRect(ox, -4, 10, 6);
    ctx.fillStyle = P.hoof;
    for (const ox of [-14, 2]) ctx.fillRect(ox, 0, 10, 3);

    // một tay dài vắt qua người, tay kia buông ra sàn
    ctx.strokeStyle = P.furB;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, -22 + breathe);
    ctx.quadraticCurveTo(-12, -30 + breathe, -26, -14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-30, -18 + breathe);
    ctx.quadraticCurveTo(-40, -8, -34, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = P.hoof;
    ctx.beginPath();
    ctx.ellipse(-26, -13, 4.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-34, 1, 4.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // vệt lấm trên lưng
    ctx.fillStyle = P.furB;
    ctx.globalAlpha = 0.5;
    for (const ox of [-15, -4, 7]) {
      ctx.beginPath();
      ctx.ellipse(ox, -25 + breathe, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // đầu gối xuống, mắt nhắm
    ctx.save();
    ctx.translate(20, -16 + breathe);
    ctx.rotate(0.3);
    // tai lợn cụp
    for (const [ex, sgn] of [[-9, -1], [9, 1]]) {
      ctx.save();
      ctx.translate(ex, -7);
      ctx.rotate(sgn * 0.4);
      ctx.fillStyle = P.furB;
      ctx.beginPath();
      ctx.moveTo(sgn * -4, -3);
      ctx.quadraticCurveTo(sgn * 8, -8, sgn * 6, 6);
      ctx.quadraticCurveTo(sgn * 1, 4, sgn * -4, -3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.belly;
    ctx.beginPath();
    ctx.ellipse(0, 5, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // mắt nhắm
    ctx.strokeStyle = P.eye;
    ctx.lineWidth = 2;
    for (const ex of [-5, 6]) {
      ctx.beginPath();
      ctx.arc(ex, -1, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    // mõm
    ctx.fillStyle = P.snout;
    ctx.beginPath();
    ctx.ellipse(0, 7, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.nostril;
    for (const nx of [-3, 3]) {
      ctx.beginPath();
      ctx.ellipse(nx, 7, 1.3, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  },

  /* ---------- Ánh sáng ---------- */
  _light(ctx) {
    const target = this.lightsOn ? 0 : 1;
    this._dark = lerp(this._dark, target, 0.06);
    if (this._dark < 0.01) return;

    ctx.save();
    ctx.globalAlpha = this._dark * 0.72;
    ctx.fillStyle = '#0e0c1e';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.restore();

    // mắt mèo phát sáng trong tối
    if (this._dark > 0.35) {
      ctx.save();
      ctx.globalAlpha = clamp((this._dark - 0.35) * 1.6, 0, 1);
      ctx.fillStyle = PAL.eyeGlow;
      for (const a of Pets.list) {
        if (a.state === 'sleep' || a.blink > 0) continue;
        const S = a.scale;
        const sitting = ['sit', 'groom', 'pet', 'eat', 'greet'].includes(a.state);
        const hx = a.x + a.facing * (sitting ? 2 : 17) * S;
        const hy = a.y + (sitting ? -40 : -32) * S;
        for (const ex of [-6, 6]) {
          ctx.beginPath();
          ctx.ellipse(hx + ex * a.facing * S, hy - 2 * S, 3.4 * S, 4.4 * S, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },
};
