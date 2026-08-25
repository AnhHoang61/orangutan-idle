/* Con mèo: chỉ số, máy trạng thái hành vi, animation. */
const Cat = {
  x: 360, y: 300,
  vx: 0,
  facing: 1,              // 1 phải, -1 trái
  state: 'idle',
  stateTime: 0,
  nextDecide: 0,

  hunger: 70, energy: 80, happy: 65,

  // animation
  bob: 0,                 // dao động thân khi thở/đi
  tail: 0,                // pha đuôi
  blink: 0,               // >0 = đang nhắm mắt
  nextBlink: 2000,
  earTwitch: 0,
  purr: 0,                // >0 = đang rừ rừ
  crouch: 0,              // 0..1 hạ người khi rình
  petCount: 0,

  target: null,           // {x, y} đích di chuyển

  reset() {
    this.x = 560; this.y = 468;
    this.state = 'idle';
    this.hunger = 70; this.energy = 80; this.happy = 65;
    this.target = null;
    this.nextDecide = 1200;
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

    // đói lâu thì mất vui (giữ tương xứng với tốc độ tụt nền)
    if (this.hunger < 15) this.happy = clamp(this.happy - 0.12 * s, 0, 100);
  },

  /* ---------- Hành động do người chơi gọi ---------- */
  pet() {
    if (this.state === 'sleep') {
      // bị đánh thức: hơi mất vui
      this.happy = clamp(this.happy - 4, 0, 100);
      this.setState('idle');
      return 'Anh làm nó thức giấc rồi...';
    }
    this.happy = clamp(this.happy + 7, 0, 100);
    this.purr = 1800;
    this.petCount += 1;
    this.setState('pet');
    FX.spawn('heart', this.x, this.y - 46, 2);
    FX.spawn('note', this.x + 18, this.y - 40, 1);
    return null;
  },

  /* Mèo đi tới bát ăn */
  callToFood() {
    if (this.state === 'sleep' && this.energy < CFG.TIRED_AT + 10) return;
    this.target = { x: Items.bowl.x, y: Items.bowl.y - 6 };
    this.setState('walk');
  },

  startChase() { if (this.state !== 'sleep') this.setState('chase'); },
  startPlay() { if (this.state !== 'sleep') this.setState('play'); },

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
    // Ưu tiên: kiệt sức -> ngủ, đói + có đồ ăn -> ăn
    if (this.energy < CFG.TIRED_AT) { this.setState('sleep'); return; }
    if (this.hunger < CFG.HUNGRY_AT && Items.hasFood()) { this.callToFood(); return; }

    const r = Math.random();
    if (r < 0.30) this.setState('idle');
    else if (r < 0.62) {
      this.target = {
        x: rand(CFG.MARGIN, CFG.W - CFG.MARGIN),
        y: rand(CFG.WALK_TOP + 10, CFG.H - 40),
      };
      this.setState('walk');
    }
    else if (r < 0.80) this.setState('sit');
    else if (r < 0.94) this.setState('groom');
    else this.setState('sleep');
  },

  /* ---------- Update ---------- */
  update(dt) {
    this._decay(dt);
    this.stateTime += dt;
    const k = dt / 16.67;

    this.tail += dt * (this.state === 'chase' ? 0.011 : 0.004);
    this.bob += dt * 0.004;
    if (this.purr > 0) this.purr -= dt;

    // nháy mắt
    this.nextBlink -= dt;
    if (this.blink > 0) this.blink -= dt;
    else if (this.nextBlink <= 0) { this.blink = 130; this.nextBlink = rand(1800, 5200); }

    // giật tai thỉnh thoảng
    if (this.earTwitch > 0) this.earTwitch -= dt;
    else if (Math.random() < 0.002) this.earTwitch = 240;

    // laser tắt giữa lúc đuổi -> quay về rảnh
    if (this.state === 'chase' && !Items.laser.on) this.setState('idle');
    if (this.state === 'play' && !Items.ball.active) this.setState('idle');

    switch (this.state) {
      case 'chase': this._updChase(k, dt); break;
      case 'play':  this._updPlay(k, dt); break;
      case 'walk':  this._updWalk(k); break;
      case 'eat':   this._updEat(dt); break;
      case 'pet':   if (this.stateTime > 1500) this.setState('idle'); break;
      case 'groom': if (this.stateTime > 3600) this.setState('idle'); break;
      case 'sit':   if (this.stateTime > 4200) this.setState('idle'); break;
      case 'sleep': this._updSleep(dt); break;
      default: break;
    }

    // quyết định tiếp khi đang rảnh
    if (['idle', 'sit', 'groom'].includes(this.state)) {
      this.nextDecide -= dt;
      if (this.nextDecide <= 0) {
        this.nextDecide = rand(CFG.IDLE_MIN, CFG.IDLE_MAX);
        this._decide();
      }
    }

    // kiệt sức thì bỏ hết, đi ngủ
    if (this.energy <= 2 && this.state !== 'sleep') this.setState('sleep');
  },

  _updChase(k, dt) {
    const L = Items.laser;
    const dx = L.x - this.x;
    const dy = (L.y - 8) - this.y;
    const d = Math.hypot(dx, dy);

    // xa thì chạy, gần thì rình rồi vồ
    if (d > 42) {
      this.crouch = lerp(this.crouch, 0, 0.1 * k);
      const sp = 2.9;
      this.x += (dx / d) * sp * k;
      this.y += clamp((dy / d) * sp * 0.5 * k, -1.6, 1.6);
      this.vx = dx / d;
      if (Math.abs(dx) > 3) this.facing = dx > 0 ? 1 : -1;
    } else {
      this.crouch = lerp(this.crouch, 1, 0.12 * k);
      this.vx = 0;
      // vồ: nhích tới bằng nhịp
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
      this.x += Math.sign(dx) * 2.3 * k;
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
      // đi tới bát mà có đồ ăn thì ăn luôn
      if (Items.hasFood() && Math.abs(this.x - Items.bowl.x) < 40) this.setState('eat');
      else this.setState('idle');
      return;
    }
    const sp = 1.25;
    this.x += (dx / d) * sp * k;
    this.y += (dy / d) * sp * 0.55 * k;
    this.vx = dx / d;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  },

  _updEat(dt) {
    // mỗi ~750ms ăn một miếng
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
    // ngủ đủ thì tự thức
    if (this.energy > 92) this.setState('groom');
  },

  /* Người chơi click có trúng mèo không */
  hitTest(x, y) {
    const S = CFG.CAT_SCALE;
    return Math.abs(x - this.x) < 42 * S && y > this.y - 62 * S && y < this.y + 16;
  },

  /* Câu mô tả trạng thái cho UI */
  moodText() {
    if (this.state === 'sleep') return pick(MOODS.sleep);
    if (this.purr > 0) return pick(MOODS.pet);
    if (this.hunger < CFG.HUNGRY_AT) return pick(MOODS.hungry);
    if (this.energy < CFG.TIRED_AT + 8) return pick(MOODS.tired);
    return pick(MOODS[this.state] || MOODS.idle);
  },
};
