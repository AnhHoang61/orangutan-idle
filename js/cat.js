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
    winded: 0,              // >0 = vừa hết hơi, chưa đuổi lại được
    spotKind: null,         // việc sẽ làm khi đi tới đích (thảm, sofa, cửa sổ...)
    bowlIdx: -1,            // bát đang nhắm tới; -1 = chưa nhận bát nào

    target: null,           // {x, y} đích di chuyển
    friend: null,           // con kia, gán sau khi tạo cả hai

    get pal() { return this.sp.pal; },
    get scale() { return this.sp.scale; },
    get moods() { return this.sp.key === 'pig' ? PIG_MOODS : MOODS; },

    reset() {
      this.x = this.sp.startX; this.y = 468;
      this.state = 'idle';
      this.hunger = 70; this.energy = 80; this.happy = 65;
      this.target = null;
      this.winded = 0;
      this.spotKind = null;
      this.nextDecide = rand(600, 2000);
    },

    /* ---------- Chỉ số ---------- */
    /* Mỗi loài tụt chỉ số theo nhịp riêng: lợn đói rất nhanh,
       đười ươi già thì hết sức nhanh. */
    _decay(dt) {
      const s = dt / 1000;
      const m = this.sp.decayScale || { hunger: 1, energy: 1, happy: 1 };
      this.hunger = clamp(this.hunger - CFG.DECAY.hunger * m.hunger * s, 0, 100);
      this.happy = clamp(this.happy - CFG.DECAY.happy * m.happy * s, 0, 100);

      if (this.state === 'sleep') {
        this.energy = clamp(this.energy + CFG.SLEEP_RECOVER * s, 0, 100);
      } else {
        const drain = (this.state === 'chase' || this.state === 'play') ? 2.2 : 1;
        this.energy = clamp(this.energy - CFG.DECAY.energy * m.energy * drain * s, 0, 100);
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
      // tự chọn bát trống gần mình nhất, để hai con không dồn vào một bát
      const b = Items.claimBowl(this);
      if (!b) return;
      this.target = { x: b.x + rand(-18, 18), y: b.y - 6 };
      this.setState('walk');
    },

    /* Con lazy vừa bỏ cuộc thì còn mệt, chưa chịu đuổi lại */
    _tooTired() { return this.sp.lazy && this.winded > 0; },

    startChase() {
      if (this.state === 'sleep' || this._tooTired()) return;
      this.setState('chase');
    },
    startPlay() {
      if (this.state === 'sleep' || this._tooTired()) return;
      this.setState('play');
    },

    /* Lết theo được vài bước rồi ngồi phệt xuống thở */
    _giveUp(what) {
      this.winded = CFG.LAZY_COOLDOWN;
      this.setState('sit');
      FX.spawn('zzz', this.x + this.facing * 26, this.y - 34, 1);
      return `${this.sp.petName} đuổi ${what} hai bước là hết hơi`;
    },

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

      // đêm khuya thì dễ ngủ hơn hẳn; đười ươi già càng dễ
      if (DayNight.isNight) {
        const p = this.sp.old ? 0.55 : 0.4;
        if (Math.random() < p) { this.setState('sleep'); return; }
      }
      if (this.hunger < CFG.HUNGRY_AT && Items.hasFood()) { this.callToFood(); return; }

      // thỉnh thoảng tìm bạn chơi
      const f = this.friend;
      if (f && f.state !== 'sleep' && Math.random() < 0.22) {
        const d = Math.abs(f.x - this.x);
        if (d > 120) { this.goGreet(); return; }
      }

      // hiếm khi: tới chơi với đồ trang trí đã mua
      if (Math.random() < 0.3 && this._goToSpot()) return;

      // hiếm hơn nữa: sự kiện đặc biệt để ngồi ngắm
      if (Math.random() < 0.01 && Rare.tryStart(this)) return;

      const r = Math.random();
      if (r < 0.16) this.setState('idle');
      else if (r < 0.42) {
        this.target = {
          x: rand(CFG.MARGIN, CFG.W - CFG.MARGIN),
          y: rand(CFG.WALK_TOP + 10, CFG.H - 40),
        };
        this.setState('walk');
      }
      else if (r < 0.55) this.setState('sit');
      else if (r < 0.66) this.setState('groom');
      else if (r < 0.74) this.setState('yawn');
      else if (r < 0.82) this.setState('stretch');
      else if (r < 0.89) this.setState('scratch');
      else if (r < 0.96) this.setState('lie');
      else this.setState('sleep');
    },

    /* Đi tới một chỗ do đồ trang trí tạo ra (thảm, gấu bông, sofa, bể cá) */
    _goToSpot() {
      const spots = Decor.spots();
      if (!spots.length) return false;
      const s = pick(spots);
      // lợn 100kg không trèo sofa nhanh được, nhưng vẫn cố
      this.target = { x: clamp(s.x + rand(-16, 16), CFG.MARGIN, CFG.W - CFG.MARGIN), y: s.y };
      this.spotKind = s.kind;
      this.setState('walk');
      return true;
    },

    /* ---------- Update ---------- */
    /* Nhấp nhô, nháy mắt, giật tai — thuần thẩm mỹ, không đổi gameplay.
       Tách riêng để máy khách (co-op) gọi được: nó bỏ Pets.update() nên nếu
       mấy dòng này nằm trong đó thì hai con đứng cứng, mắt mở trừng trừng.

       Math.random() ở đây không sao: nó chỉ giật tai, hai máy lệch cũng
       không ai thấy. purr có trong snapshot nhưng đếm cục bộ vẫn đúng —
       snapshot chỉnh lại 5 lần/giây và nó chỉ ảnh hưởng câu mô tả tâm trạng. */
    tickAnim(dt) {
      this.bob += dt * 0.004;
      if (this.purr > 0) this.purr -= dt;

      this.nextBlink -= dt;
      if (this.blink > 0) this.blink -= dt;
      else if (this.nextBlink <= 0) { this.blink = 130; this.nextBlink = rand(1800, 5200); }

      if (this.earTwitch > 0) this.earTwitch -= dt;
      else if (Math.random() < 0.002) this.earTwitch = 240;
    },

    update(dt) {
      this._decay(dt);
      this.stateTime += dt;
      const k = dt / 16.67;

      this.tickAnim(dt);

      // winded là timer gameplay (có trong snapshot), không phải thẩm mỹ:
      // để ở đây chứ đừng đưa vào tickAnim, không thì máy khách đếm trùng
      if (this.winded > 0) this.winded -= dt;

      if (this.state === 'chase' && !Items.laser.on) this.setState('idle');
      if (this.state === 'play' && !Items.ball.active) this.setState('idle');

      // lợn đuổi được vài bước là hết hơi, ngồi phệt xuống
      if (this.sp.lazy && (this.state === 'chase' || this.state === 'play')
          && this.stateTime > CFG.LAZY_GIVEUP) {
        UI.say(this._giveUp(this.state === 'chase' ? 'đốm đỏ' : 'quả bóng'));
      }

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

        // các animation rảnh rỗi: hết thời lượng thì về idle
        case 'yawn':    if (this.stateTime > 1700) this.setState('idle'); break;
        case 'stretch': if (this.stateTime > 2000) this.setState('idle'); break;
        case 'scratch': if (this.stateTime > 2400) this.setState('idle'); break;
        case 'lie':     this._updLie(dt); break;
        case 'watch':   if (this.stateTime > 6500) this.setState('idle'); break;
        case 'window':  if (this.stateTime > 5200) this.setState('idle'); break;
        case 'nuzzle':  this._updNuzzle(dt); break;
        case 'climb':   this._updClimb(dt); break;
        default: break;
      }

      if (['idle', 'sit', 'groom', 'lie'].includes(this.state)) {
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
        // đứng cạnh bát nào còn đồ ăn thì ăn bát đó
        const near = Items.nearBowl(this.x);
        if (near && near.food > 0) {
          this.bowlIdx = Items.bowls.indexOf(near);
          this.setState('eat');
          return;
        }
        // tới nơi rồi thì làm việc gắn với chỗ đó
        const kind = this.spotKind;
        this.spotKind = null;
        if (kind === 'pushBall') { this._pushBall(); return; }
        const map = { lie: 'lie', nuzzle: 'nuzzle', 'sit-high': 'climb', watch: 'watch', window: 'window' };
        this.setState(map[kind] || 'idle');
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
        // ăn đúng bát mình đã nhận, không thò sang bát con kia
        const bowl = Items.bowls[this.bowlIdx] || Items.nearBowl(this.x);
        if (Items.takeBite(bowl)) {
          this.hunger = clamp(this.hunger + 22, 0, 100);
          this.happy = clamp(this.happy + 3, 0, 100);
        } else {
          this.bowlIdx = -1;
          this.setState('idle');
        }
      }
      if (this.hunger >= 99) this.setState('groom');
    },

    _updSleep(dt) {
      if (this.stateTime % 1100 < 20) FX.spawn('zzz', this.x + this.facing * 22, this.y - 40, 1);
      if (this.energy > 92) this.setState('groom');
    },

    /* Nằm dài: nghỉ lâu, hồi chút sức, dễ trôi vào giấc ngủ */
    _updLie(dt) {
      this.energy = clamp(this.energy + 0.55 * dt / 1000, 0, 100);
      if (this.stateTime > 7000) {
        this.setState(this.energy < 45 ? 'sleep' : 'idle');
      }
    },

    /* Ủi bóng về phía thảm; tới gần thảm thì nằm luôn lên đó */
    _pushBall() {
      const b = Items.ball;
      if (!b.active) { this.setState('idle'); return; }
      const rug = Decor.byId('rug');
      const goal = rug && rug.spot ? rug.spot.x : 560;
      // đẩy bóng về hướng thảm rồi đi theo
      b.vx = Math.sign(goal - b.x) * rand(1.6, 2.6);
      b.vy = rand(-0.4, 0.4);
      FX.spawn('spark', b.x, b.y - 6, 1);
      this.happy = clamp(this.happy + 2, 0, 100);
      this.target = { x: clamp(goal, CFG.MARGIN, CFG.W - CFG.MARGIN), y: 486 };
      this.spotKind = 'lie';
      this.setState('walk');
    },

    /* Cọ vào gấu bông: vui lên, có tim bay ra */
    _updNuzzle(dt) {
      if (this.stateTime % 1200 < 20) {
        this.happy = clamp(this.happy + 1.6, 0, 100);
        FX.spawn('heart', this.x + this.facing * 16, this.y - 44, 1);
      }
      if (this.stateTime > 4200) this.setState('idle');
    },

    /* Trèo sofa: lợn nặng nên mất lâu hơn, xong thì ngồi lại một lúc */
    _updClimb(dt) {
      const dur = this.sp.lazy ? 5600 : 4000;
      if (this.stateTime % 1400 < 20) this.happy = clamp(this.happy + 1.1, 0, 100);
      if (this.stateTime > dur) this.setState('idle');
    },

    /* Vùng click: lợn bè ngang và thấp, đười ươi hẹp và cao */
    hitTest(x, y) {
      const S = this.scale;
      const pig = this.sp.body === 'pig';
      const halfW = (pig ? 52 : 42) * S;
      const top = (pig ? 46 : 62) * S;
      return Math.abs(x - this.x) < halfW && y > this.y - top && y < this.y + 16;
    },

    moodText() {
      const M = this.moods;
      if (this.state === 'sleep') return pick(M.sleep);
      if (this.purr > 0) return pick(M.pet);
      // các animation rảnh có thoại riêng, ưu tiên hơn cả câu đói/mỏi
      if (M[this.state] && !['idle', 'walk', 'sit'].includes(this.state)) return pick(M[this.state]);
      if (this.hunger < CFG.HUNGRY_AT) return pick(M.hungry);
      if (this.energy < CFG.TIRED_AT + 8) return pick(M.tired);
      return pick(M[this.state] || M.idle);
    },
  };
}

/* Sự kiện hiếm: chỉ để ngồi ngắm, không ảnh hưởng chỉ số nhiều.
   Mỗi lần _decide() có ~1% cơ hội gọi tryStart. */
const Rare = {
  active: null,       // {kind, t, dur}
  cooldown: 0,

  reset() { this.active = null; this.cooldown = 0; },

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const e = this.active;
    if (!e) return;
    e.t += dt;
    if (e.t > e.dur) this.active = null;
  },

  /* Chim bay qua cửa sổ: cả hai chạy tới ngắm.
     Lợn kéo bóng vào thảm: chỉ lợn làm, con kia nhìn theo. */
  tryStart(a) {
    if (this.active || this.cooldown > 0) return false;

    const opts = [];
    if (!Scenes.isOutdoor && DayNight.light > 0.35) opts.push('bird');
    if (Items.ball.active && Decor.has('rug')) opts.push('ballToRug');

    if (!opts.length) return false;
    const kind = pick(opts);

    if (kind === 'bird') {
      this.active = { kind, t: 0, dur: 6000, x: -40 };
      this.cooldown = 45000;
      // cả hai đang rảnh thì kéo nhau tới cửa sổ
      for (const p of Pets.list) {
        if (['sleep', 'chase', 'play', 'eat'].includes(p.state)) continue;
        p.target = { x: rand(430, 700), y: CFG.WALK_TOP + rand(14, 34) };
        p.spotKind = 'window';
        p.setState('walk');
      }
      UI.say('Có con chim đậu ngoài cửa sổ!');
      return true;
    }

    // lợn ủi bóng về thảm
    this.active = { kind, t: 0, dur: 9000 };
    this.cooldown = 60000;
    a.target = { x: Items.ball.x, y: clamp(Items.ball.y + 6, CFG.WALK_TOP, CFG.H - 40) };
    a.spotKind = 'pushBall';
    a.setState('walk');
    UI.say(`${a.sp.petName} định kéo quả bóng vào thảm`);
    return true;
  },

  get bird() { return this.active && this.active.kind === 'bird' ? this.active : null; },

  /* Chim bay ngang qua ô cửa sổ, vẽ sau nền trước pet */
  draw(ctx) {
    const e = this.bird;
    if (!e) return;
    const u = e.t / e.dur;
    const x = lerp(392, 812, u);
    const y = 108 + Math.sin(u * Math.PI * 3) * 14;
    const flap = Math.sin(e.t * 0.02);

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3c3a52';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // đầu + mỏ
    ctx.beginPath();
    ctx.arc(7, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0a24a';
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(16, -1.5);
    ctx.lineTo(10, 0);
    ctx.closePath();
    ctx.fill();
    // cánh vỗ
    ctx.strokeStyle = '#4a4763';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1, -2);
    ctx.quadraticCurveTo(-7, -6 + flap * 7, -13, -3 + flap * 9);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  },
};

/* Cả đàn. Thứ tự trong list = thứ tự tạo, không phải thứ tự vẽ. */
const Pets = {
  list: [],

  reset() {
    const orang = makeAnimal(SPECIES.orang);
    const pig = makeAnimal(SPECIES.pig);
    orang.friend = pig;
    pig.friend = orang;
    this.list = [orang, pig];
  },

  get orang() { return this.list[0]; },
  get pig() { return this.list[1]; },

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

    // 'walk' cũng bỏ qua: hai con đi ngang nhau thì cứ để xuyên qua,
    // đẩy ra lúc đang di chuyển làm đường đi giật và dễ kẹt vòng lặp
    // (đi vào -> bị đẩy ra -> đi vào lại).
    const busy = new Set(['greet', 'follow', 'chase', 'play', 'eat', 'walk']);
    if (busy.has(a.state) || busy.has(b.state)) return;

    const dx = b.x - a.x;
    // hạ từ 42 xuống 18: chỉ tách khi chồng gần hẳn, còn lại cho đứng sát nhau
    const min = 18;
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
