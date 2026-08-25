/* Con vật: chỉ số, máy trạng thái hành vi, animation.
   Trước đây là singleton; giờ là factory để hai con sống chung phòng. */

function makeAnimal(sp) {
  return {
    sp,                     // định nghĩa loài (SPECIES.orang | SPECIES.chimp)
    x: sp.startX, y: 468,
    vx: 0,
    facing: 1,              // 1 phải, -1 trái
    state: 'idle',
    stateTime: 0,
    nextDecide: rand(600, 2000),

    hunger: 70, energy: 80, happy: 65,

    // animation
    bob: rand(0, 6),        // lệch pha để hai con không thở đồng bộ
    blink: 0,
    nextBlink: rand(1200, 4000),
    earTwitch: 0,
    purr: 0,                // >0 = đang khoan khoái
    crouch: 0,              // 0..1 hạ người khi rình
    petCount: 0,

    target: null,           // {x, y} đích di chuyển
    friend: null,           // con kia, gán sau khi tạo cả hai

    get pal() { return this.sp.pal; },
    get scale() { return this.sp.scale; },
    get moods() { return this.sp.key === 'chimp' ? CHIMP_MOODS : MOODS; },

    reset() {
      this.x = this.sp.startX; this.y = 468;
      this.state = 'idle';
      this.hunger = 70; this.energy = 80; this.happy = 65;
      this.target = null;
      this.nextDecide = rand(600, 2000);
    },

    /* ---------- Chỉ số ---------- */
    _decay(dt) {
      const s = dt / 1000;
      this.hunger = clamp(this.hunger - CFG.DECAY.hunger * s, 0, 100);
      this.happy = clamp(this.happy - CFG.DECAY.happy * s, 0, 100);

      if (this.state === 'sleep') {
        this.energy = clamp(this.energy + CFG.SLEEP_RECOVER * s, 0, 100);
      } else {
        const drain = (this.state === 'chase' || this.state === 'play') ? 2.2 : 1;
        this.energy = clamp(this.energy - CFG.DECAY.energy * drain * s, 0, 100);
      }

      if (this.hunger < 15) this.happy = clamp(this.happy - 0.12 * s, 0, 100);
    },

    /* ---------- Hành động do người chơi gọi ---------- */
    pet() {
      if (this.state === 'sleep') {
        this.happy = clamp(this.happy - 4, 0, 100);
        this.setState('idle');
        return `Anh làm ${this.sp.petName} thức giấc rồi...`;
      }
      this.happy = clamp(this.happy + 7, 0, 100);
      this.purr = 1800;
      this.petCount += 1;
      this.setState('pet');
      FX.spawn('heart', this.x, this.y - 46, 2);
      FX.spawn('note', this.x + 18, this.y - 40, 1);
      return null;
    },

    callToFood() {
      if (this.state === 'sleep' && this.energy < CFG.TIRED_AT + 10) return;
      this.target = { x: Items.bowl.x + rand(-22, 22), y: Items.bowl.y - 6 };
      this.setState('walk');
    },

    startChase() { if (this.state !== 'sleep') this.setState('chase'); },
    startPlay() { if (this.state !== 'sleep') this.setState('play'); },

    /* Đi tới chào bạn */
    goGreet() {
      if (!this.friend || this.state === 'sleep') return;
      this.target = { x: this.friend.x + (this.x < this.friend.x ? -46 : 46), y: this.friend.y };
      this.setState('follow');
    },

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.stateTime = 0;
      this.vx = 0;
      if (s !== 'chase') this.crouch = 0;
      if (s === 'sleep') this.purr = 0;
    },

    /* ---------- Quyết định khi rảnh ---------- */
    _decide() {
      if (this.energy < CFG.TIRED_AT) { this.setState('sleep'); return; }
      if (this.hunger < CFG.HUNGRY_AT && Items.hasFood()) { this.callToFood(); return; }

      // thỉnh thoảng tìm bạn chơi
      const f = this.friend;
      if (f && f.state !== 'sleep' && Math.random() < 0.22) {
        const d = Math.abs(f.x - this.x);
        if (d > 120) { this.goGreet(); return; }
      }

      const r = Math.random();
      if (r < 0.28) this.setState('idle');
      else if (r < 0.60) {
        this.target = {
          x: rand(CFG.MARGIN, CFG.W - CFG.MARGIN),
          y: rand(CFG.WALK_TOP + 10, CFG.H - 40),
        };
        this.setState('walk');
      }
      else if (r < 0.78) this.setState('sit');
      else if (r < 0.93) this.setState('groom');
      else this.setState('sleep');
    },

    /* ---------- Update ---------- */
    update(dt) {
      this._decay(dt);
      this.stateTime += dt;
      const k = dt / 16.67;

      this.bob += dt * 0.004;
      if (this.purr > 0) this.purr -= dt;

      this.nextBlink -= dt;
      if (this.blink > 0) this.blink -= dt;
      else if (this.nextBlink <= 0) { this.blink = 130; this.nextBlink = rand(1800, 5200); }

      if (this.earTwitch > 0) this.earTwitch -= dt;
      else if (Math.random() < 0.002) this.earTwitch = 240;

      if (this.state === 'chase' && !Items.laser.on) this.setState('idle');
      if (this.state === 'play' && !Items.ball.active) this.setState('idle');

      switch (this.state) {
        case 'chase':  this._updChase(k, dt); break;
        case 'play':   this._updPlay(k, dt); break;
        case 'walk':   this._updWalk(k); break;
        case 'follow': this._updFollow(k); break;
        case 'greet':  if (this.stateTime > 1600) this.setState('idle'); break;
        case 'eat':    this._updEat(dt); break;
        case 'pet':    if (this.stateTime > 1500) this.setState('idle'); break;
        case 'groom':  if (this.stateTime > 3600) this.setState('idle'); break;
        case 'sit':    if (this.stateTime > 4200) this.setState('idle'); break;
        case 'sleep':  this._updSleep(dt); break;
        default: break;
      }

      if (['idle', 'sit', 'groom'].includes(this.state)) {
        this.nextDecide -= dt;
        if (this.nextDecide <= 0) {
          this.nextDecide = rand(CFG.IDLE_MIN, CFG.IDLE_MAX);
          this._decide();
        }
      }

      if (this.energy <= 2 && this.state !== 'sleep') this.setState('sleep');
    },

    _updChase(k, dt) {
      const L = Items.laser;
      const dx = L.x - this.x;
      const dy = (L.y - 8) - this.y;
      const d = Math.hypot(dx, dy) || 1;

      if (d > 42) {
        this.crouch = lerp(this.crouch, 0, 0.1 * k);
        const sp = this.sp.chaseSpeed;
        this.x += (dx / d) * sp * k;
        this.y += clamp((dy / d) * sp * 0.5 * k, -1.6, 1.6);
        this.vx = dx / d;
        if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;
      } else {
        this.crouch = lerp(this.crouch, 1, 0.12 * k);
        this.vx = 0;
        if (this.stateTime % 900 < 60) {
          this.x += this.facing * 5;
          FX.spawn('spark', L.x, L.y, 1);
          this.happy = clamp(this.happy + 0.9, 0, 100);
        }
      }
      this.y = clamp(this.y, CFG.WALK_TOP, CFG.H - 44);
      this.x = clamp(this.x, CFG.MARGIN * 0.6, CFG.W - CFG.MARGIN * 0.6);
      this.happy = clamp(this.happy + 0.012 * dt / 16.67, 0, 100);
    },

    _updPlay(k, dt) {
      const b = Items.ball;
      const dx = b.x - this.x;
      const d = Math.abs(dx);
      if (d > 26) {
        this.x += Math.sign(dx) * (this.sp.speed + 1) * k;
        this.y = lerp(this.y, clamp(b.y + 4, CFG.WALK_TOP, CFG.H - 34), 0.06 * k);
        this.vx = Math.sign(dx);
        this.facing = dx > 0 ? 1 : -1;
      } else {
        this.vx = 0;
        if (this.stateTime % 700 < 50) {
          Items.bat(this.x);
          this.happy = clamp(this.happy + 2.2, 0, 100);
          FX.spawn('note', this.x, this.y - 44, 1);
        }
      }
      this.happy = clamp(this.happy + 0.01 * dt / 16.67, 0, 100);
    },

    _updWalk(k) {
      if (!this.target) { this.setState('idle'); return; }
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        this.target = null;
        this.vx = 0;
        if (Items.hasFood() && Math.abs(this.x - Items.bowl.x) < 46) this.setState('eat');
        else this.setState('idle');
        return;
      }
      const sp = this.sp.speed;
      this.x += (dx / d) * sp * k;
      this.y += (dy / d) * sp * 0.55 * k;
      this.vx = dx / d;
      if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    },

    /* Đi tới bạn; tới gần thì cả hai chào nhau */
    _updFollow(k) {
      const f = this.friend;
      if (!f || f.state === 'sleep') { this.setState('idle'); return; }
      const dx = f.x - this.x;
      const d = Math.abs(dx);
      if (d < 56) {
        this.facing = dx > 0 ? 1 : -1;
        this.setState('greet');
        this.happy = clamp(this.happy + 6, 0, 100);
        FX.spawn('heart', (this.x + f.x) / 2, this.y - 58, 2);
        // bạn cũng vui, và quay lại nhìn
        f.happy = clamp(f.happy + 6, 0, 100);
        f.facing = dx > 0 ? -1 : 1;
        if (['idle', 'sit', 'walk'].includes(f.state)) f.setState('greet');
        return;
      }
      this.x += Math.sign(dx) * this.sp.speed * 1.25 * k;
      this.y = lerp(this.y, f.y, 0.04 * k);
      this.vx = Math.sign(dx);
      this.facing = dx > 0 ? 1 : -1;
      if (this.stateTime > 6000) this.setState('idle');   // chống kẹt
    },

    _updEat(dt) {
      if (this.stateTime > 750) {
        this.stateTime = 0;
        if (Items.takeBite()) {
          this.hunger = clamp(this.hunger + 22, 0, 100);
          this.happy = clamp(this.happy + 3, 0, 100);
        } else {
          this.setState('idle');
        }
      }
      if (this.hunger >= 99) this.setState('groom');
    },

    _updSleep(dt) {
      if (this.stateTime % 1100 < 20) FX.spawn('zzz', this.x + this.facing * 22, this.y - 40, 1);
      if (this.energy > 92) this.setState('groom');
    },

    hitTest(x, y) {
      const S = this.scale;
      return Math.abs(x - this.x) < 42 * S && y > this.y - 62 * S && y < this.y + 16;
    },

    moodText() {
      const M = this.moods;
      if (this.state === 'sleep') return pick(M.sleep);
      if (this.purr > 0) return pick(M.pet);
      if (this.hunger < CFG.HUNGRY_AT) return pick(M.hungry);
      if (this.energy < CFG.TIRED_AT + 8) return pick(M.tired);
      return pick(M[this.state] || M.idle);
    },
  };
}

/* Cả đàn. Thứ tự trong list = thứ tự tạo, không phải thứ tự vẽ. */
const Pets = {
  list: [],

  reset() {
    const orang = makeAnimal(SPECIES.orang);
    const chimp = makeAnimal(SPECIES.chimp);
    orang.friend = chimp;
    chimp.friend = orang;
    this.list = [orang, chimp];
  },

  get orang() { return this.list[0]; },
  get chimp() { return this.list[1]; },

  update(dt) {
    for (const a of this.list) a.update(dt);
    this._separate();
  },

  /* Đẩy nhẹ để hai con không trùng chỗ nhau.
     Bỏ qua khi đang chào nhau (cố ý đứng sát), hoặc khi cả hai
     đang bám cùng một mục tiêu (laser/bóng/bát) — lúc đó chen nhau
     là đúng và đẩy ra sẽ giật. */
  _separate() {
    const [a, b] = this.list;
    if (!a || !b) return;

    const busy = new Set(['greet', 'follow', 'chase', 'play', 'eat']);
    if (busy.has(a.state) || busy.has(b.state)) return;

    const dx = b.x - a.x;
    const min = 42;
    const gap = Math.abs(dx);
    if (gap < min && Math.abs(a.y - b.y) < 30) {
      // gap có thể = 0 -> chọn hướng cố định để không chia cho 0
      const s = gap < 0.5 ? (a === this.orang ? 1 : -1) : Math.sign(dx);
      const push = (min - gap) / 2 + 0.5;
      const lo = CFG.MARGIN * 0.6, hi = CFG.W - CFG.MARGIN * 0.6;
      a.x = clamp(a.x - s * push, lo, hi);
      b.x = clamp(b.x + s * push, lo, hi);
    }
  },

  /* Con nào bị click; ưu tiên con vẽ phía trước (y lớn hơn) */
  at(x, y) {
    return [...this.list].sort((p, q) => q.y - p.y).find((a) => a.hitTest(x, y)) || null;
  },

  /* Gọi hành động cho cả hai */
  each(fn) { for (const a of this.list) fn(a); },
};
