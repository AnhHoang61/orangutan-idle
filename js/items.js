/* Đồ vật trong phòng: hai bát ăn, cuộn len, đốm laser. */
const Items = {
  /* Hai bát đặt xa nhau hai đầu phòng để hai con không phải tranh nhau.
     food 0..3 miếng mỗi bát. */
  bowls: [
    { x: 190, y: 468, food: 0 },
    { x: 980, y: 468, food: 0 },
  ],
  ball: { x: 860, y: 470, vx: 0, vy: 0, spin: 0, active: false },
  laser: { on: false, x: 560, y: 470, tx: 560, ty: 470 },

  reset() {
    for (const b of this.bowls) b.food = 0;
    this.ball.active = false;
    this.laser.on = false;
  },

  /* ---------- Bát ăn ---------- */
  fill() {
    let added = false;
    for (const b of this.bowls) {
      if (b.food < 3) added = true;
      b.food = 3;
    }
    return added;
  },

  hasFood() { return this.bowls.some((b) => b.food > 0); },

  /* Bát còn đồ ăn ở gần x nhất, trong bán kính r */
  nearBowl(x, r = 52) {
    let best = null;
    let bd = r;
    for (const b of this.bowls) {
      const d = Math.abs(b.x - x);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  /* Chọn bát cho con `a`: ưu tiên bát còn đồ ăn mà con kia không nhắm tới,
     trong số đó lấy bát gần nhất. Nhờ vậy hai đứa tự chia nhau hai bát. */
  claimBowl(a) {
    const f = a.friend;
    const taken = (f && f.bowlIdx >= 0 && (f.state === 'walk' || f.state === 'eat'))
      ? f.bowlIdx : -1;

    const withFood = this.bowls
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.food > 0);
    if (!withFood.length) return null;

    const free = withFood.filter(({ i }) => i !== taken);
    const pool = free.length ? free : withFood;
    pool.sort((p, q) => Math.abs(p.b.x - a.x) - Math.abs(q.b.x - a.x));

    a.bowlIdx = pool[0].i;
    return pool[0].b;
  },

  takeBite(bowl) {
    if (!bowl || bowl.food <= 0) return false;
    bowl.food -= 1;
    FX.spawn('crumb', bowl.x, bowl.y - 12, 3);
    return true;
  },

  /* ---------- Bóng ---------- */
  toss() {
    const b = this.ball;
    b.active = true;
    b.x = rand(CFG.MARGIN + 60, CFG.W - CFG.MARGIN - 60);
    b.y = CFG.WALK_TOP + 14;
    b.vx = rand(-4.2, 4.2);
    b.vy = rand(1.2, 2.4);
    FX.spawn('spark', b.x, b.y, 3);
  },

  /* Mèo húc bóng -> bóng bay đi */
  bat(fromX) {
    const b = this.ball;
    if (!b.active) return;
    b.vx = (b.x >= fromX ? 1 : -1) * rand(2.4, 4.6);
    b.vy = rand(-1.8, -0.6);
    b.spin = rand(-0.4, 0.4);
    FX.spawn('spark', b.x, b.y - 6, 2);
  },

  /* ---------- Laser ---------- */
  toggleLaser() {
    this.laser.on = !this.laser.on;
    return this.laser.on;
  },
  aim(x, y) {
    this.laser.tx = clamp(x, CFG.MARGIN * 0.5, CFG.W - CFG.MARGIN * 0.5);
    this.laser.ty = clamp(y, CFG.WALK_TOP, CFG.H - 30);
  },

  update(dt) {
    const k = dt / 16.67;

    // laser trượt mềm về vị trí chuột
    const L = this.laser;
    L.x = lerp(L.x, L.tx, clamp(0.22 * k, 0, 1));
    L.y = lerp(L.y, L.ty, clamp(0.22 * k, 0, 1));

    // bóng: có ma sát, nảy vào tường
    const b = this.ball;
    if (b.active) {
      b.x += b.vx * k;
      b.y += b.vy * k;
      b.vx *= Math.pow(0.965, k);
      b.vy *= Math.pow(0.965, k);
      b.spin += b.vx * 0.02 * k;

      const lo = CFG.MARGIN * 0.6, hi = CFG.W - CFG.MARGIN * 0.6;
      if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx) * 0.7; }
      if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx) * 0.7; }
      if (b.y < CFG.WALK_TOP) { b.y = CFG.WALK_TOP; b.vy = Math.abs(b.vy) * 0.7; }
      if (b.y > CFG.H - 26) { b.y = CFG.H - 26; b.vy = -Math.abs(b.vy) * 0.5; }

      if (Math.abs(b.vx) < 0.04) b.vx = 0;
      if (Math.abs(b.vy) < 0.04) b.vy = 0;
    }
  },

  /* ---------- Vẽ ---------- */
  drawBowls(ctx) {
    for (let i = 0; i < this.bowls.length; i++) this._bowl(ctx, this.bowls[i], i);
  },

  /* Hai bát khác màu nhẹ để phân biệt được của con nào hay ăn */
  _bowl(ctx, bowl, idx) {
    const { x, y, food } = bowl;
    const cool = idx === 0;
    const body = cool ? PAL.bowl : PAL.bowlWarm;
    const dark = cool ? PAL.bowlDark : PAL.bowlWarmDark;

    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // thức ăn trong bát
    if (food > 0) {
      ctx.fillStyle = PAL.food;
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 6 + food * 4, 3 + food, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // thân bát
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - 24, y - 4);
    ctx.lineTo(x + 24, y - 4);
    ctx.lineTo(x + 16, y + 10);
    ctx.lineTo(x - 16, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 24, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(x - 20, y + 1, 8, 3);
  },

  drawBall(ctx) {
    const b = this.ball;
    if (!b.active) return;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 9, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    ctx.fillStyle = PAL.ball;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    // đường len
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1.6;
    for (const a of [0, 1, 2]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 4, a * 1.05, 0, Math.PI * 2);
      ctx.stroke();
    }
    // sợi len thò ra
    ctx.strokeStyle = PAL.ball;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.quadraticCurveTo(16, 10, 22, 4);
    ctx.stroke();
    ctx.restore();
  },

  drawLaser(ctx) {
    if (!this.laser.on) return;
    const { x, y } = this.laser;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
    g.addColorStop(0, 'rgba(255, 80, 90, .55)');
    g.addColorStop(1, 'rgba(255, 80, 90, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PAL.laser;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 1, y - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  },
};
