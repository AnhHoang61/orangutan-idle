/* Vẽ phòng, mèo và ánh sáng. */
const Render = {
  lightsOn: true,
  lightManual: false,   // true khi người chơi tự bấm; đèn thôi tự bật/tắt theo giờ
  _dark: 0,             // giá trị nội suy để tắt/bật đèn mượt
  _wasNight: false,

  draw(ctx) {
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    this._boxOutside(ctx);        // nền ngoài hộp + tường ngoài dày

    // Nội dung phòng: clip trong lòng hộp rồi nén toạ độ CFG vào đó.
    // Nhờ transform này Scenes/Decor/Items/Pets giữ nguyên toạ độ cũ.
    ctx.save();
    this._boxPath(ctx);
    ctx.clip();
    ctx.translate(BOX.offX, BOX.y);
    ctx.scale(BOX.scale, BOX.scale);
    this._drawRoom(ctx);
    ctx.restore();

    this._boxEdge(ctx);           // bóng đổ trong lòng + viền hộp
  },

  /* Đường bo góc của lòng hộp; dùng cho cả clip và stroke */
  _boxPath(ctx) {
    ctx.beginPath();
    ctx.roundRect(BOX.x, BOX.y, BOX.w, BOX.h, BOX.radius - BOX.wall * 0.4);
  },

  /* Nền phía ngoài hộp và khối tường dày bao quanh */
  _boxOutside(ctx) {
    // nền bàn: tối, hơi có chiều sâu
    const g = ctx.createRadialGradient(CFG.W / 2, CFG.H * 0.35, 80, CFG.W / 2, CFG.H * 0.5, CFG.W * 0.7);
    g.addColorStop(0, '#231d33');
    g.addColorStop(1, '#15111f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    // bóng hộp đổ xuống mặt bàn
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#6a5844';
    ctx.beginPath();
    ctx.roundRect(BOX.ox, BOX.oy, BOX.ow, BOX.oh, BOX.radius);
    ctx.fill();
    ctx.restore();

    // mặt gỗ của tường ngoài: sáng ở trên, tối dần xuống dưới
    const wg = ctx.createLinearGradient(0, BOX.oy, 0, BOX.oy + BOX.oh);
    wg.addColorStop(0, '#8a7358');
    wg.addColorStop(0.5, '#6a5844');
    wg.addColorStop(1, '#4e402f');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.roundRect(BOX.ox, BOX.oy, BOX.ow, BOX.oh, BOX.radius);
    ctx.fill();
  },

  /* Bóng đổ từ tường vào trong phòng + đường viền trong */
  _boxEdge(ctx) {
    ctx.save();
    this._boxPath(ctx);
    ctx.clip();

    // bốn dải tối sát tường, tạo cảm giác hộp có chiều sâu
    const d = 26;
    const sides = [
      [BOX.x, BOX.y, BOX.w, d, 0, 1],            // trên
      [BOX.x, BOX.bottom - d, BOX.w, d, 0, -1],  // dưới
      [BOX.x, BOX.y, d, BOX.h, 1, 0],            // trái
      [BOX.right - d, BOX.y, d, BOX.h, -1, 0],   // phải
    ];
    for (const [x, y, w, h, sx, sy] of sides) {
      const g = ctx.createLinearGradient(
        x + (sx < 0 ? w : 0), y + (sy < 0 ? h : 0),
        x + (sx > 0 ? w : sx < 0 ? 0 : 0), y + (sy > 0 ? h : sy < 0 ? 0 : 0),
      );
      g.addColorStop(0, 'rgba(0, 0, 0, .42)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    // viền trong hộp
    ctx.strokeStyle = 'rgba(20, 15, 28, .8)';
    ctx.lineWidth = 3;
    this._boxPath(ctx);
    ctx.stroke();

    // gờ sáng trên mép tường ngoài, cho ra chất gỗ
    ctx.strokeStyle = 'rgba(255, 240, 214, .16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(BOX.ox + 1, BOX.oy + 1, BOX.ow - 2, BOX.oh - 2, BOX.radius);
    ctx.stroke();
  },

  /* Toàn bộ nội dung phòng, vẽ trong vùng đã clip */
  _drawRoom(ctx) {
    Scenes.draw(ctx);
    Sky.draw(ctx);                // mưa/tuyết trong ô cửa sổ, giọt đọng trên kính
    Rare.draw(ctx);               // chim ngoài cửa sổ: sau nền, trước đồ trong phòng
    Decor.drawBack(ctx);          // thảm, kệ tường: dưới mọi thứ khác
    Items.drawBowls(ctx);

    // sort theo y: cái nào đứng thấp hơn thì vẽ sau (che cái phía trên)
    const layers = [
      ...Pets.list.map((a) => ({ y: a.y, fn: () => this._pet(ctx, a) })),
      ...Decor.layers().map((l) => ({ y: l.y, fn: () => l.fn(ctx) })),
      { y: Items.ball.active ? Items.ball.y : -1, fn: () => Items.drawBall(ctx) },
    ].filter((l) => l.y >= 0).sort((a, b) => a.y - b.y);
    for (const l of layers) l.fn();

    Items.drawLaser(ctx);
    Net.drawPeerLaser(ctx);       // con trỏ người kia (xanh cyan), no-op khi chơi một mình
    FX.draw(ctx);
    this._light(ctx);
    Decor.drawGlow(ctx);          // đèn sao, bể cá: sáng xuyên qua lớp tối
    Sky.drawOverlay(ctx);         // sương mù, loé sấm: phủ lên trên cùng
  },

  /* Nền do Scenes vẽ. Các hàm _window/_shelf/_plant dưới đây
     được scene "Phòng ngủ" gọi lại. */

  /* Ô cửa sổ: trời trong ô đổi theo giờ, không theo đèn trong phòng */
  _window(ctx, x, y, w, h) {
    ctx.fillStyle = '#1a2a4d';
    ctx.fillRect(x, y, w, h);
    const night = DayNight.light < 0.3;
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

  /* ---------- Con vật ---------- */
  /* Vẽ một con vật. `a` là thực thể từ Pets.list.
     Mỗi body plan có bộ vẽ riêng: 'ape' thân dọc tay dài, 'pig' thân ngang bốn chân. */
  _pet(ctx, a) {
    if (a.sp.body === 'pig') return this._pig(ctx, a);
    return this._ape(ctx, a);
  },

  _ape(ctx, a) {
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

  /* ---------- Lợn béo ----------
     Body plan khác hẳn khỉ: thân nằm ngang, bụng sà gần sàn, bốn chân ngắn ngủn.
     100kg nên mọi thứ đều rung: bụng lắc theo bước đi, má rung khi phanh. */
  _pig(ctx, a) {
    const s = a.state;
    if (s === 'sleep') return this._pigSleeping(ctx, a);

    const P = a.pal;
    const moving = (s === 'walk' || s === 'chase' || s === 'play' || s === 'follow') && a.vx !== 0;
    const sitting = s === 'sit' || s === 'groom' || s === 'pet' || s === 'eat' || s === 'greet';
    const S = a.scale;
    const f = a.facing;

    // nặng nên bước ngắn mà nhún sâu
    const stepBob = moving ? Math.abs(Math.sin(a.bob * 2.4)) * 2.4 : 0;
    const breathe = Math.sin(a.bob * 0.9) * (sitting ? 1.4 : 0.9);
    const jiggle = moving ? Math.sin(a.bob * 4.8) * 1.6 : Math.sin(a.bob * 1.2) * 0.5;
    const y = a.y - stepBob;

    // bóng: rộng vì thân bè ngang
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + 10, 42 * S, 9 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(a.x, y);
    ctx.scale(f * S, S);

    const legSwing = moving ? Math.sin(a.bob * 2.4) * 2.2 : 0;

    // bốn chân: ngắn, mập, gần như không thấy khi ngồi
    ctx.fillStyle = P.furB;
    if (sitting) {
      // ngồi bệt: chân sau gập hẳn, chỉ hở hai chân trước
      ctx.fillRect(14, -9, 8, 11);
      ctx.fillRect(24, -8, 8, 10);
    } else {
      for (const [lx, sw] of [[-22, legSwing], [-9, -legSwing], [12, -legSwing], [25, legSwing]]) {
        ctx.fillRect(lx + sw, -12, 8.5, 14);
      }
    }
    // móng guốc sẫm
    ctx.fillStyle = P.hoof;
    if (sitting) {
      ctx.fillRect(13, -1, 10, 4);
      ctx.fillRect(23, -1, 10, 4);
    } else {
      for (const [lx, sw] of [[-22, legSwing], [-9, -legSwing], [12, -legSwing], [25, legSwing]]) {
        ctx.fillRect(lx + sw - 1, -1, 10.5, 4);
      }
    }

    // thân: ellipse rất bè ngang, tâm thấp — 100kg sà xuống
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    if (sitting) {
      ctx.ellipse(-2, -17 + breathe, 33, 20 + breathe * 0.3, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, -19 + breathe, 38, 18 + breathe * 0.3, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // bụng phình xuống dưới, lắc lư khi đi
    ctx.fillStyle = P.belly;
    ctx.beginPath();
    ctx.ellipse(-4 + jiggle * 0.5, -10 + breathe * 0.5, 27, 11 + Math.abs(jiggle) * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // lườn sáng dọc lưng
    ctx.fillStyle = P.furLight;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(2, -29 + breathe, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // đuôi xoắn lò xo phía sau
    ctx.strokeStyle = P.furB;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-36, -26 + breathe);
    ctx.quadraticCurveTo(-46, -30, -42, -21);
    ctx.quadraticCurveTo(-39, -14, -46, -16);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // đầu gắn liền thân, gần như không có cổ
    this._pigHead(ctx, sitting ? 28 : 32, (sitting ? -30 : -27) + breathe, s, a, jiggle);

    ctx.restore();
  },

  _pigHead(ctx, hx, hy, state, a, jiggle) {
    const P = a.pal;
    ctx.save();
    ctx.translate(hx, hy);

    // ủi mõm xuống sàn khi gãi / ăn
    if (state === 'groom') ctx.rotate(0.55 + Math.sin(a.bob * 4) * 0.1);
    if (state === 'eat') ctx.rotate(0.42 + Math.sin(a.bob * 7) * 0.09);

    // tai to cụp về trước, che nửa mắt
    const tw = a.earTwitch > 0 ? 0.22 : 0;
    for (const [ex, sgn] of [[-9, -1], [8, 1]]) {
      ctx.save();
      ctx.translate(ex, -13);
      ctx.rotate(sgn * (0.5 + tw));
      ctx.fillStyle = P.ear;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(sgn * 11, -6, sgn * 7, 11);
      ctx.quadraticCurveTo(sgn * 1, 6, 0, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // đầu: gần tròn, má phồng
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 15.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // má béo rung khi đang di chuyển
    ctx.fillStyle = P.face;
    ctx.beginPath();
    ctx.ellipse(-1, 4 + Math.abs(jiggle) * 0.2, 14, 11.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // mắt nhỏ tí, lọt trong má
    const closed = a.blink > 0 || state === 'groom' || a.purr > 0;
    if (closed) {
      ctx.strokeStyle = P.eye;
      ctx.lineWidth = 1.9;
      for (const ex of [-7, 6]) {
        ctx.beginPath();
        ctx.arc(ex, -3, 2.8, 0.12 * Math.PI, 0.88 * Math.PI);
        ctx.stroke();
      }
    } else {
      const wide = state === 'eat' || state === 'play';
      for (const ex of [-7, 6]) {
        ctx.fillStyle = '#fffdf5';
        ctx.beginPath();
        ctx.ellipse(ex, -3, wide ? 3.4 : 2.9, wide ? 3.6 : 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.eye;
        ctx.beginPath();
        ctx.ellipse(ex + 0.4, -3, wide ? 2.2 : 1.9, wide ? 2.8 : 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fillRect(ex - 1.3, -4.6, 1.4, 1.4);
      }
    }

    // mõm: đĩa tròn dẹt nhô ra, đặc trưng nhất của lợn
    const chew = state === 'eat' ? Math.sin(a.bob * 7) * 1.3 : 0;
    ctx.fillStyle = P.snout;
    ctx.beginPath();
    ctx.ellipse(9, 8 + chew * 0.4, 10, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // vành mõm sáng
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(9, 8 + chew * 0.4, 10, 8, 0.15, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    // hai lỗ mũi to trên đĩa mõm
    ctx.fillStyle = P.nostril;
    for (const nx of [5.5, 12.5]) {
      ctx.beginPath();
      ctx.ellipse(nx, 7 + chew * 0.4, 2, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // miệng dưới mõm
    ctx.strokeStyle = P.nostril;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (state === 'eat' && chew > 0) {
      ctx.arc(6, 15, 3.4, 0.05 * Math.PI, 0.95 * Math.PI);
    } else if (a.purr > 0 || state === 'play') {
      ctx.arc(5, 14, 4.2, 0.1 * Math.PI, 0.9 * Math.PI);
    } else {
      ctx.moveTo(1, 15.5); ctx.quadraticCurveTo(5, 17.2, 9, 15.5);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.restore();
  },

  /* Lợn ngủ: đổ hẳn sang một bên, bụng phơi ra, bốn chân chìa ngang */
  _pigSleeping(ctx, a) {
    const P = a.pal;
    const S = a.scale;
    const breathe = Math.sin(a.bob * 0.6) * 2.2;   // thở phập phồng rõ hơn khỉ

    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + 10, 48 * S, 9 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(a.facing * S, S);

    // bốn chân chìa ngang, thõng ra
    ctx.strokeStyle = P.furB;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const [lx, ly] of [[-20, -6], [-7, -4], [10, -4], [23, -6]]) {
      ctx.beginPath();
      ctx.moveTo(lx, ly - 6);
      ctx.quadraticCurveTo(lx - 6, ly + 2, lx - 11, ly + 1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // thân đổ ngang: ellipse cực bè, gần sàn
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, -14 + breathe * 0.4, 42, 15 + breathe * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // bụng phơi lên trời
    ctx.fillStyle = P.belly;
    ctx.beginPath();
    ctx.ellipse(-3, -9 + breathe * 0.3, 30, 9 + breathe * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // đuôi xoắn thả lỏng
    ctx.strokeStyle = P.furB;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, -18);
    ctx.quadraticCurveTo(-50, -22, -47, -13);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // đầu nằm nghiêng trên sàn
    ctx.save();
    ctx.translate(32, -13 + breathe * 0.3);
    ctx.rotate(0.42);
    // tai cụp che mặt
    for (const [ex, sgn] of [[-8, -1], [7, 1]]) {
      ctx.save();
      ctx.translate(ex, -11);
      ctx.rotate(sgn * 0.62);
      ctx.fillStyle = P.ear;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.quadraticCurveTo(sgn * 10, -5, sgn * 6, 10);
      ctx.quadraticCurveTo(sgn * 1, 5, 0, -3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = P.furA;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 14.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.face;
    ctx.beginPath();
    ctx.ellipse(-1, 4, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // mắt nhắm tít
    ctx.strokeStyle = P.eye;
    ctx.lineWidth = 1.9;
    for (const ex of [-7, 6]) {
      ctx.beginPath();
      ctx.arc(ex, -3, 2.8, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
    }
    // mõm
    ctx.fillStyle = P.snout;
    ctx.beginPath();
    ctx.ellipse(8, 8, 9.5, 7.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.nostril;
    for (const nx of [5, 12]) {
      ctx.beginPath();
      ctx.ellipse(nx, 7, 1.9, 2.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

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

    // gờ má hai bên (đặc trưng đười ươi đực; con già thì gờ to hơn)
    const old = a.sp.old;
    ctx.fillStyle = P.furB;
    for (const ex of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(ex * (old ? 15.5 : 14), 2, old ? 6 : 5, old ? 12.5 : 11, ex * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // lông bạc phủ ngoài gờ má
    if (old && P.grey) {
      ctx.fillStyle = P.grey;
      ctx.globalAlpha = 0.5;
      for (const ex of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(ex * 17, 4, 4, 10, ex * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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

  /* Nắng xiên qua cửa sổ. Mạnh nhất lúc chiều muộn, tắt về đêm.
     Hai vệt nghiêng đổ từ vị trí hai cửa sổ của scene Phòng ngủ. */
  _sunbeam(ctx) {
    // mây mưa che thì không còn nắng xiên nữa
    const s = DayNight.sunbeam * Weather.sunFactor;
    if (s < 0.02 || Scenes.isOutdoor) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = s * 0.16;
    for (const wx of [484, 724]) {
      const g = ctx.createLinearGradient(wx, 66, wx + 190, CFG.H);
      g.addColorStop(0, 'rgba(255, 214, 150, 1)');
      g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(wx - 78, 70);
      ctx.lineTo(wx + 78, 70);
      ctx.lineTo(wx + 250, CFG.H);
      ctx.lineTo(wx + 70, CFG.H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  /* ---------- Ánh sáng ----------
     Độ tối gộp từ hai nguồn: ánh sáng tự nhiên theo giờ (DayNight.light)
     và đèn trong phòng. Đèn bù được phần lớn nhưng không hết — đêm bật đèn
     vẫn tối hơn giữa trưa. */
  _light(ctx) {
    // trời tối tự nhiên + mây mưa che thêm
    const natural = clamp((1 - DayNight.light) + Weather.gloom, 0, 1);
    const target = this.lightsOn ? natural * 0.32 : natural * 0.82 + 0.18;
    this._dark = lerp(this._dark, target, 0.05);

    // phủ tint không khí theo giờ (cam lúc chiều, xanh tím lúc đêm)
    const [r, g, b, alpha] = DayNight.tint;
    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.restore();
    }

    // tint riêng của thời tiết: xám lam khi mưa, trắng xanh khi tuyết
    const wt = Weather.tint;
    if (wt) {
      ctx.save();
      ctx.globalAlpha = wt[3];
      ctx.fillStyle = `rgb(${wt[0] | 0}, ${wt[1] | 0}, ${wt[2] | 0})`;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.restore();
    }

    this._sunbeam(ctx);

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
        const pig = a.sp.body === 'pig';
        // offset đầu phải khớp với hàm vẽ tương ứng (_ape / _pig)
        const hx = a.x + a.facing * (pig ? (sitting ? 28 : 32) : (sitting ? 2 : 17)) * S;
        const hy = a.y + (pig ? (sitting ? -30 : -27) : (sitting ? -40 : -32)) * S;
        const eyes = pig ? [-7, 6] : [-6, 6];
        const r = pig ? 2.4 : 3.4;      // mắt lợn nhỏ hơn
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.ellipse(hx + ex * a.facing * S, hy - (pig ? 3 : 2) * S, r * S, (r + 0.6) * S, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },
};
