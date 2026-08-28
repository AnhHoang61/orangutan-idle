/* Co-op hai người: một máy chạy mô phỏng (host), máy kia gửi ý định và vẽ
   lại trạng thái nhận được (guest).

   TẠI SAO HOST-AUTHORITATIVE, không phải lockstep: cat.js có hơn 20 chỗ gọi
   Math.random() quyết định hành vi pet, và update(dt) phụ thuộc frame rate
   (Math.pow(0.965,k), lerp(...,0.1*k), các trigger stateTime % 900 < 60).
   Hai máy cùng input vẫn ra kết quả khác nhau, nên phải có một bên làm chuẩn.

   Bước này (B4) chỉ có election + heartbeat. Chưa đồng bộ state — hai máy
   vẫn chạy hai thế giới riêng, chỉ biết ai là host.

   Transport dùng Room (js/room.js), chung khoá và chung pool broker với Chat. */
const Net = {
  CLAIM_WAIT_MS: 1200,      // chờ gom claim trước khi tự quyết
  HEARTBEAT_MS: 5000,
  PEER_TIMEOUT_MS: 20000,   // không nghe tim đập quá lâu -> coi như đã rời
  SEEN_MAX: 600,
  SNAP_MS: 200,             // host phát trạng thái 5 lần/giây
  SNAP_JUMP: 120,           // lệch quá bấy nhiêu px thì nhảy thẳng, khỏi lerp
  AIM_GAP_MS: 50,           // gửi con trỏ tối đa 20 lần/giây
  AIM_HOLD_MS: 600,         // giữ quyền ngắm bấy lâu sau cú động cuối
  TOAST_GAP_MS: 1200,       // báo hành động thưa ra, khỏi ngập dòng tâm trạng

  COOP_KEY: 'orangutan-idle/coop-on',

  mode: 'solo',             // 'solo' | 'pending' | 'host' | 'guest'
  id: null,                 // riêng từng tab, không lưu lại
  gen: 0,                   // thế hệ host, xem _onBeacon
  peerHere: false,
  peerName: '',

  myAim: null,              // con trỏ của mình, chỉ để vẽ (B7)
  peerAim: null,            // con trỏ người kia

  _claim: 0,
  _beat: 0,
  _hostBeat: 0,
  _peerBeat: 0,
  _cands: null,
  _seen: new Set(),
  _seenQ: [],
  _seq: 0,
  _fxOut: [],               // hạt FX chờ gửi kèm snapshot (B7)

  _snapT: 0,                // đếm ngược tới lần phát tiếp
  _snapSeq: 0,              // số thứ tự snapshot host phát ra
  _lastSeq: -1,             // seq cao nhất đã áp, để bỏ tin cũ / tới lệch
  _lastHid: null,           // host nào đang phát, đổi thì reset _lastSeq
  _gotSnap: false,          // đã áp snapshot đầu chưa

  isHost()  { return this.mode === 'host'; },
  isGuest() { return this.mode === 'guest'; },
  get on()  { return this.mode !== 'solo'; },

  /* Bật co-op: người chơi tự tick, không tự động vào. Chat.unlock() mở khoá
     sẵn từ localStorage nên nếu không có cờ riêng thì mọi lần vào lại sẽ bị
     đẩy vào co-op mà không hay. */
  wanted() { return localStorage.getItem(this.COOP_KEY) === '1'; },

  async start() {
    if (this.on || !Room.ready || !this.wanted()) return;

    this.id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');

    /* Di chúc: broker phát hộ khi máy này rớt không kịp chào. Payload phải
       RIÊNG theo tab — dùng chung một blob thì bộ lọc trùng ăn mất ở mọi máy
       trừ cái đầu tiên (bài học từ sudoku-coop). */
    await Room.setWill('game', { t: 'bye', id: this.id });

    /* Báo ra thay vì im lặng: lần trước thư viện mqtt nạp thành công nhưng
       rỗng 0 byte, nên `mqtt` không tồn tại mà chẳng có dấu hiệu gì —
       chat hiện đủ, bấm được, không nối. Mất nửa buổi mới tìm ra. */
    if (typeof mqtt === 'undefined') {
      UI.say('Thiếu thư viện mạng, đang chơi một mình');
      console.error('[net] mqtt chưa nạp — kiểm tra js/vendor/mqtt.min.js');
      return;
    }
    if (!Room.connect()) {
      UI.say('Không nối được, đang chơi một mình');
      return;
    }

    this.hookFX();

    Room.sub('game', (m) => this._onCtl(m));
    Room.sub('host', (b) => this._onBeacon(b));
    Room.sub('snap', (s) => this._onSnap(s));

    this.mode = 'pending';
    this._claim = this.CLAIM_WAIT_MS;
    this._cands = new Set([this.id]);

    // chào ngay, không chờ nhịp heartbeat: host đang sống sẽ đáp beacon liền
    this._send({ t: 'hello' });
    this._send({ t: 'claim' });

    addEventListener('beforeunload', () => this.stop());
  },

  stop() {
    if (!this.on) return;
    if (this.isHost()) Room.clearRetained('host');   // xoá beacon = phòng đóng
    this._send({ t: 'bye' });
    this.mode = 'solo';
    this.peerHere = false;
  },

  /* Mọi tin điều khiển đi qua đây để luôn có id + mid. Thiếu mid là bộ lọc
     trùng vô hiệu: cùng một tin tới qua 3 broker sẽ được xử 3 lần — với
     'bye' nghĩa là _promote() chạy 3 lần và gen nhảy 3 bậc. */
  _send(obj) {
    obj.id = this.id;
    obj.mid = this.id + '-' + (++this._seq);
    if (!obj.name) obj.name = Chat.myName;
    Room.pub('game', obj);
  },

  /* ---------- Nhận tin điều khiển ---------- */
  _onCtl(m) {
    if (!m || !m.id || m.id === this.id) return;
    if (m.mid && !this._fresh(m.mid)) return;        // tới qua nhiều broker

    this.peerHere = true;
    this._peerBeat = performance.now();
    if (m.name) this.peerName = String(m.name).slice(0, Chat.MAX_NAME);

    switch (m.t) {
      case 'hello':
        // host đang sống thì tự giới thiệu ngay, không chờ retained
        if (this.isHost()) { this._beacon(); this._sayHi(); }
        break;

      case 'claim':
        if (this.mode === 'pending') this._cands.add(m.id);
        break;

      case 'bye':
        // host chào rời -> lên thay ngay, không chờ hết PEER_TIMEOUT
        if (this.isGuest()) this._promote();
        else this.peerHere = false;
        break;

      case 'i':
        // ý định từ máy khách: chỉ chủ phòng được đổi thế giới
        if (this.isHost()) this._onIntent(m);
        break;

      case 'aim':
        this.peerAim = { x: m.x, y: m.y };
        // chủ phòng nhường quyền ngắm cho người vừa động
        if (this.isHost() && Items.laser.on) {
          this._aimOwner = 'peer';
          this._aimAt = performance.now();
          Items.aim(m.x, m.y);
        }
        break;

      case 'act':
        this._toast(m);
        break;
    }
  },

  /* ---------- Máy khách gửi ý định ---------- */
  intent(k, arg) {
    const m = { t: 'i', k };
    if (arg.pet) m.pet = arg.pet;
    if (arg.x !== undefined) { m.x = arg.x | 0; m.y = arg.y | 0; }
    if (arg.id) m.id2 = arg.id;          // id món đồ, tránh đụng field id của tab
    this._send(m);
  },

  /* Con trỏ: gửi dày hơn ý định nhưng vẫn tiết chế, và bỏ qua nếu laser tắt. */
  aim(x, y) {
    this.myAim = { x, y };
    if (!this.on || !Items.laser.on) return;
    const now = performance.now();
    if (now - (this._aimSent || 0) < this.AIM_GAP_MS) return;
    this._aimSent = now;
    this._send({ t: 'aim', x: x | 0, y: y | 0 });
  },

  /* ---------- Chủ phòng xử ý định ---------- */
  /* Gọi đúng App.apply() mà người bấm nút vẫn gọi — không viết bản luật thứ
     hai. Mọi phép kiểm đã có sẵn ở đó: bóng đang trong phòng thì không ném
     nữa, bát còn đầy thì không rót, đồ đã mua thì không mua lại. */
  _onIntent(m) {
    const arg = {};
    if (m.pet) arg.pet = m.pet;
    if (m.x !== undefined) { arg.x = m.x; arg.y = m.y; }
    if (m.id2) arg.id = m.id2;

    if (m.k === 'buy') {
      const ok = Shop.buy(m.id2);
      this._say({ k: ok ? 'buy' : 'poor', it: m.id2 });
    } else {
      App.apply(m.k, arg);
      this._say({ k: m.k, pet: arg.pet });
    }

    this._sendSnap();      // trả lời ngay, đừng để người ta chờ hết nhịp 200ms
  },

  /* Người này vừa làm gì -> báo cho người kia biết */
  afterAct(name, arg) {
    if (name === 'swap' || name === 'shop') return;    // chuyện riêng máy này
    this._say({ k: name, pet: arg && arg.pet });
    this._sendSnap();
  },

  _say(o) {
    this._send({ t: 'act', k: o.k, pet: o.pet, it: o.it });
  },

  /* Gửi SỰ KIỆN chứ không gửi câu chữ: bên nhận tự dịch. Nhờ vậy chuỗi lạ từ
     mạng không bao giờ đi thẳng vào chỗ hiển thị. */
  ACT_TEXT: {
    feed:  (n) => `${n} vừa cho ăn`,
    pet:   (n, p) => `${n} vừa vuốt ${p || 'thú'}`,
    walk:  (n, p) => `${n} gọi ${p || 'thú'} lại`,
    ball:  (n) => `${n} vừa ném bóng`,
    laser: (n) => `${n} bấm laser`,
    light: (n) => `${n} bấm đèn`,
    scene: (n) => `${n} đổi bối cảnh`,
    buy:   (n, _p, it) => `${n} vừa mua ${it || 'đồ mới'}`,
    poor:  (n) => `${n} muốn mua nhưng chưa đủ xu`,
  },

  _toast(m) {
    const fn = this.ACT_TEXT[m.k];
    if (!fn) return;
    // dồn dập thì bỏ: dòng này dùng chung chỗ với câu tâm trạng của pet
    const now = performance.now();
    if (now - (this._toastT || 0) < this.TOAST_GAP_MS) return;
    this._toastT = now;

    const who = this.peerName || 'Người kia';
    const pet = m.pet ? (Pets.list.find((a) => a.sp.key === m.pet) || {}).sp : null;
    UI.say(fn(who, pet ? pet.petName : null, m.it));
  },

  /* Lọc tin trùng: cùng một tin tới qua ba broker. Giới hạn FIFO để Set
     không phình mãi. */
  _fresh(mid) {
    if (this._seen.has(mid)) return false;
    this._seen.add(mid);
    this._seenQ.push(mid);
    while (this._seenQ.length > this.SEEN_MAX) this._seen.delete(this._seenQ.shift());
    return true;
  },

  /* ---------- Beacon: ai đang là host ---------- */
  _beacon() {
    Room.pub('host', { id: this.id, gen: this.gen, name: Chat.myName }, { retain: true });
  },

  /* Beacon retained là tối ưu, KHÔNG phải chỗ dựa: broker công cộng có lúc
     throttle và mất retained. Cơ chế thật là host trả lời 'hello' ngay. */
  _onBeacon(b) {
    if (!b || !b.id || b.id === this.id) return;

    this._hostBeat = performance.now();
    this.peerHere = true;
    if (b.name) this.peerName = String(b.name).slice(0, Chat.MAX_NAME);

    if (this.mode === 'pending') { this._becomeGuest(); return; }

    /* Hai máy cùng nhận mình là host (claim tới muộn hơn cửa sổ 1200ms).
       Luật hội tụ, không cần đàm phán: gen cao thắng, gen bằng thì id nhỏ
       thắng. Deterministic và phản đối xứng -> đúng một bên demote.

       gen là thứ chịu lực: không có nó, host cũ mở lại tab với id nhỏ hơn sẽ
       giành lại quyền và xoá sạch tiến độ của người đang giữ phòng. */
    const bg = b.gen | 0;
    if (this.isHost() && (bg > this.gen || (bg === this.gen && b.id < this.id))) {
      this._becomeGuest();
    }
  },

  /* ---------- Đổi vai ---------- */
  _becomeHost() {
    this.mode = 'host';
    this._beacon();
    UI.say(this.peerHere ? 'Anh giữ phòng, hai người cùng chăm' : 'Đang chờ người kia vào');
  },

  _becomeGuest() {
    this.mode = 'guest';
    this._hostBeat = performance.now();
    UI.say(`Đang chơi cùng ${this.peerName || 'người kia'}`);
  },

  /* Host chết -> guest lên thay. Không thể split-brain: đúng 2 người nên chỉ
     có đúng một guest, việc lên ngôi không ai tranh. */
  _promote() {
    this.gen += 1;              // cao hơn host cũ -> nó quay lại cũng phải nhường
    this.mode = 'host';
    this._beacon();
    this.peerHere = false;
    UI.say('Người kia rời phòng, anh giữ tiếp');
  },

  _sayHi() {
    UI.say(`${this.peerName || 'Người kia'} vừa vào phòng`);
  },

  /* ---------- Nhịp ---------- */
  update(dt) {
    if (!this.on) return;
    const now = performance.now();

    // hết cửa sổ gom claim -> tự quyết
    if (this.mode === 'pending') {
      this._claim -= dt;
      if (this._claim <= 0) {
        const winner = [...this._cands].sort()[0];   // min, hai máy tính ra như nhau
        if (winner === this.id) this._becomeHost();
        else this._becomeGuest();
      }
      return;
    }

    this._beat -= dt;
    if (this._beat <= 0) {
      this._beat = this.HEARTBEAT_MS;
      if (this.isHost()) this._beacon();
      else this._send({ t: 'hello' });
    }

    if (this.isHost()) {
      // phát trạng thái 5 lần/giây
      this._snapT -= dt;
      if (this._snapT <= 0) this._sendSnap();
    } else {
      this._lerpPets(dt);       // kéo pet về vị trí host cho mượt
    }

    // chốt chặn cuối khi host chết bẩn (crash, rớt wifi, di chúc không tới)
    if (this.isGuest() && this._hostBeat && now - this._hostBeat > this.PEER_TIMEOUT_MS) {
      this._promote();
    }
    if (this.isHost() && this.peerHere && now - this._peerBeat > this.PEER_TIMEOUT_MS) {
      this.peerHere = false;
    }
  },

  /* ---------- Host phát trạng thái ---------- */

  /* Dựng trên Save.snapshot() thay vì viết lại: Economy._acc (phần lẻ khi
     tích xu, thiếu là lệch pha) đi theo miễn phí qua field acc.

     Save.snapshot() cố tình bỏ tầng hành vi (state, timer, bóng, laser) vì
     chơi một mình reload lại thì cho pet về idle cũng được. Hai máy đang
     cùng chơi thì không được, nên đây là bản mở rộng của nó.

     Làm tròn để payload gọn: ~520 B JSON -> ~760 B sau mã hoá + base64. */
  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;

    const s = Save.snapshot();
    s.v = 2;
    s.gen = this.gen;
    s.hid = this.id;
    s.seq = ++this._snapSeq;
    s.dnT = DayNight.t;              // giờ của host, guest không đọc đồng hồ mình

    s.pets.forEach((p, i) => {
      const a = Pets.list[i];
      p.hunger = r1(p.hunger); p.energy = r1(p.energy); p.happy = r1(p.happy);
      p.x = r1(p.x); p.y = r1(p.y);
      p.st = a.state; p.sT = a.stateTime | 0; p.f = a.facing;
      p.tx = a.target ? a.target.x | 0 : null;
      p.ty = a.target ? a.target.y | 0 : null;
      p.sk = a.spotKind; p.bi = a.bowlIdx;
      p.w = a.winded | 0; p.nd = a.nextDecide | 0; p.pr = a.purr | 0;
    });

    s.ball = Items.ball.active
      ? [r1(Items.ball.x), r1(Items.ball.y), r2(Items.ball.vx), r2(Items.ball.vy), r2(Items.ball.spin)]
      : null;
    s.laser = Items.laser.on ? [Items.laser.tx | 0, Items.laser.ty | 0] : null;
    s.rare = Rare.active
      ? [Rare.active.kind, Rare.active.t | 0, Rare.active.dur, Rare.active.x | 0]
      : null;
    s.rcd = Rare.cooldown | 0;
    s.fx = this._fxOut.splice(0, 12);

    return s;
  },

  /* Chỉ broker primary, QoS 0: 760 B x 5/giây x 3 broker là 11 KB/s lên hạ
     tầng công cộng miễn phí, mà nhân bản chẳng lợi gì — snapshot idempotent,
     mất một cái thì cái sau tự chữa. */
  _sendSnap() {
    if (!this.isHost()) return;
    this._snapT = this.SNAP_MS;
    Room.pubOne('snap', this.snapshot());
  },

  /* ---------- Guest nhận trạng thái ---------- */
  _onSnap(s) {
    if (!s || s.v !== 2 || !s.hid) return;
    if (s.hid === this.id) return;              // tin của chính mình vòng lại

    // host đổi -> đánh số lại từ đầu
    if (s.hid !== this._lastHid) { this._lastHid = s.hid; this._lastSeq = -1; }
    if ((s.seq | 0) <= this._lastSeq) return;   // cũ, hoặc tới lệch thứ tự
    this._lastSeq = s.seq | 0;

    this._hostBeat = performance.now();
    this.peerHere = true;

    /* So gen TRƯỚC khi nhận gen của người ta, không thì điều kiện luôn đúng.
       Cùng luật với _onBeacon: gen cao thắng, gen bằng thì id nhỏ thắng —
       phản đối xứng nên đúng một bên nhường. */
    const sg = s.gen | 0;
    if (this.isHost()) {
      if (sg > this.gen || (sg === this.gen && s.hid < this.id)) this._becomeGuest();
      else return;              // mình vẫn là chủ, bỏ qua snapshot của người ta
    }

    this.gen = Math.max(this.gen, sg);
    if (!this.isGuest()) return;         // đang pending, chờ bầu xong

    this._applySnapshot(s);
  },

  _applySnapshot(s) {
    Economy.coins = Math.max(0, s.coins | 0);
    Economy._acc = +s.acc || 0;
    Decor.owned = new Set(s.decor || []);
    if (Scenes._list[s.scene]) Scenes.index = s.scene;
    Render.lightsOn = !!s.lightsOn;
    Render.lightManual = !!s.lightManual;
    (s.bowls || []).forEach((f, i) => { if (Items.bowls[i]) Items.bowls[i].food = clamp(f | 0, 0, 3); });

    // giờ theo host: guest lệch múi giờ vẫn thấy cùng ánh sáng
    if (typeof s.dnT === 'number') { DayNight.t = s.dnT; DayNight._sample(); }

    for (const p of (s.pets || [])) {
      const a = Pets.list.find((x) => x.sp.key === p.key);
      if (!a) continue;

      a.hunger = p.hunger; a.energy = p.energy; a.happy = p.happy;
      a.state = p.st; a.stateTime = p.sT | 0; a.facing = p.f;
      a.spotKind = p.sk; a.bowlIdx = p.bi;
      a.winded = p.w | 0; a.nextDecide = p.nd | 0; a.purr = p.pr | 0;

      // object MỚI: _updWalk kiểm !this.target nên không được sửa tại chỗ
      a.target = (p.tx === null || p.tx === undefined) ? null : { x: p.tx, y: p.ty };

      // lệch nhiều (đổi cảnh, vừa vào phòng) thì nhảy thẳng, còn lại lerp
      if (Math.hypot(p.x - a.x, p.y - a.y) > this.SNAP_JUMP) { a.x = p.x; a.y = p.y; }
      a._nx = p.x; a._ny = p.y;
    }

    if (s.laser) {
      Items.laser.on = true;
      Items.laser.tx = s.laser[0]; Items.laser.ty = s.laser[1];
    } else {
      Items.laser.on = false;
    }
    if (App.canvas) App.canvas.classList.toggle('laser', Items.laser.on);

    if (s.ball) {
      const b = Items.ball;
      b.active = true; b.x = s.ball[0]; b.y = s.ball[1];
      b.vx = s.ball[2]; b.vy = s.ball[3]; b.spin = s.ball[4];
    } else {
      Items.ball.active = false;
    }

    Rare.active = s.rare
      ? { kind: s.rare[0], t: s.rare[1], dur: s.rare[2], x: s.rare[3] }
      : null;
    Rare.cooldown = s.rcd | 0;

    for (const f of (s.fx || [])) FX.spawn(f[0], f[1], f[2], f[3]);

    const lbl = document.getElementById('scene-label');
    if (lbl) lbl.textContent = Scenes.name;

    /* Snapshot đầu: Save.load() vừa báo "anh đi 3 tiếng, để dành 40 xu" rồi
       trạng thái host ghi đè hết -> câu đó thành sai. Xoá đi. */
    if (!this._gotSnap) {
      this._gotSnap = true;
      Save.lastReport = null;
      UI.say(`Đang chơi cùng ${this.peerName || 'người kia'}`);
    }
  },

  /* Kéo pet về vị trí host mượt dần, thay vì nhảy 5 lần/giây. Đúng chiêu
     items.js:104 đang dùng cho laser. Sai số tối đa ~23px và đang hội tụ —
     pet trong game này đi lững thững, không cần chính xác hơn. */
  _lerpPets(dt) {
    const k = dt / 16.67;
    for (const a of Pets.list) {
      if (a._nx === undefined) continue;
      a.x = lerp(a.x, a._nx, clamp(0.25 * k, 0, 1));
      a.y = lerp(a.y, a._ny, clamp(0.25 * k, 0, 1));
      a.stateTime += dt;      // render khoá animation theo cái này
      a.tickAnim(dt);         // nhấp nhô, nháy mắt — không có thì đứng cứng
    }
  },

  /* Một laser, hai người ngắm -> đốm giật qua lại. Ai vừa động thì được ngắm,
     hết AIM_HOLD_MS không động mới nhường. */
  takeAim() {
    if (!this.isHost()) return;
    const now = performance.now();
    if (this._aimOwner === 'peer' && now - (this._aimAt || 0) < this.AIM_HOLD_MS) return;
    this._aimOwner = 'me';
    this._aimAt = now;
  },

  /* FX.spawn được gọi từ TRONG mô phỏng (tim khi vuốt, tia đuổi, zzz, vụn
     thức ăn). Máy khách bỏ Pets.update nên không có hạt nào — khác biệt thấy
     rõ ngay. Bọc từ ngoài để không phải sửa fx.js. */
  hookFX() {
    if (this._fxHooked) return;
    this._fxHooked = true;
    const orig = FX.spawn.bind(FX);
    FX.spawn = (t, x, y, n) => {
      if (this.isHost()) this._fxOut.push([t, Math.round(x), Math.round(y), n || 1]);
      return orig(t, x, y, n);
    };
  },

  /* Con trỏ người kia: xanh cyan + vòng viền để đọc ra "chuột của người khác",
     không phải laser thứ hai. Đỏ mới là đốm mà pet đuổi. */
  drawPeerLaser(ctx) {
    if (!this.on || !this.peerHere || !this.peerAim) return;
    const { x, y } = this.peerAim;

    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(75, 214, 255, 0.40)');
    g.addColorStop(1, 'rgba(75, 214, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(75, 214, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = '#4bd6ff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();

    if (this.peerName) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#bfefff';
      ctx.font = '600 10px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.peerName, x, y - 18);
    }
    ctx.restore();
  },
};
