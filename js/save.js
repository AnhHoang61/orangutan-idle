/* Lưu tiến trình vào localStorage.

   Cái đáng chú ý là offline: đóng tab 2 tiếng rồi mở lại thì chỉ số phải
   tụt như thể thời gian đã trôi, và xu vẫn tích. Nhưng đi cả tuần về mà
   pet chết đói thì chơi mất vui, nên cả hai đều có mức trần. */
const Save = {
  KEY: 'orangutan-idle/v1',
  AUTOSAVE_MS: 5000,

  OFFLINE_DECAY_CAP: 8 * 3600 * 1000,   // chỉ số tụt tối đa 8 tiếng
  OFFLINE_COIN_CAP: 4 * 3600 * 1000,    // xu tích tối đa 4 tiếng

  /* Nhịp tụt khi đang chơi là ~15 phút cạn một thanh — dùng nguyên nhịp đó
     cho lúc vắng thì đi uống cà phê về pet đã đói trơ.
     Chọn 0.02 để vắng đủ 8 tiếng (mức trần) mới cạn khoảng một thanh của
     con đói nhanh nhất; vắng 1 tiếng chỉ tụt chừng 15 điểm. */
  OFFLINE_DECAY_MULT: 0.02,

  _timer: 0,
  lastReport: null,       // {away, coins, before:{}, after:{}} để UI báo lại

  /* ---------- Ghi ---------- */
  snapshot() {
    return {
      v: 1,
      at: Date.now(),
      coins: Economy.coins,
      acc: Economy._acc,
      decor: [...Decor.owned],
      scene: Scenes.index,
      // không lưu giờ: DayNight đọc đồng hồ máy nên luôn khớp thực tế
      lightsOn: Render.lightsOn,
      lightManual: Render.lightManual,
      bowls: Items.bowls.map((b) => b.food),
      pets: Pets.list.map((a) => ({
        key: a.sp.key,
        hunger: a.hunger, energy: a.energy, happy: a.happy,
        x: a.x, y: a.y,
      })),
    };
  },

  write() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.snapshot()));
      return true;
    } catch (e) {
      // hết quota hoặc trang chạy ở chế độ riêng tư: bỏ qua, game vẫn chơi được
      return false;
    }
  },

  update(dt) {
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = this.AUTOSAVE_MS;
      this.write();
    }
  },

  /* ---------- Đọc ---------- */
  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return (d && d.v === 1) ? d : null;
    } catch (e) {
      return null;
    }
  },

  /* Nạp lại trạng thái. Gọi sau Pets.reset()/Items.reset()/Decor.reset(). */
  load() {
    const d = this.read();
    if (!d) return false;

    Economy.coins = Math.max(0, d.coins | 0);
    Economy._acc = +d.acc || 0;

    Decor.owned = new Set(Array.isArray(d.decor) ? d.decor : []);

    if (Number.isInteger(d.scene) && Scenes.list[d.scene]) Scenes.index = d.scene;
    DayNight.update(0);        // giờ lấy từ máy, không lấy từ save
    if (typeof d.lightsOn === 'boolean') Render.lightsOn = d.lightsOn;
    if (typeof d.lightManual === 'boolean') Render.lightManual = d.lightManual;
    Render._wasNight = DayNight.isNight;
    // save cũ chỉ có một bát (d.bowl); giữ tương thích để không mất tiến trình
    if (Array.isArray(d.bowls)) {
      Items.bowls.forEach((b, i) => { b.food = clamp(d.bowls[i] | 0, 0, 3); });
    } else if (d.bowl !== undefined) {
      Items.bowls[0].food = clamp(d.bowl | 0, 0, 3);
    }

    for (const p of (d.pets || [])) {
      const a = Pets.list.find((x) => x.sp.key === p.key);
      if (!a) continue;                       // save cũ có loài đã bỏ
      a.hunger = clamp(+p.hunger, 0, 100);
      a.energy = clamp(+p.energy, 0, 100);
      a.happy = clamp(+p.happy, 0, 100);
      if (typeof p.x === 'number') a.x = clamp(p.x, CFG.MARGIN, CFG.W - CFG.MARGIN);
      if (typeof p.y === 'number') a.y = clamp(p.y, CFG.WALK_TOP, CFG.H - 40);
    }

    this._applyOffline(Date.now() - (+d.at || Date.now()));
    return true;
  },

  /* Thời gian vắng mặt: tụt chỉ số, tích xu, và nhích luôn đồng hồ trong game */
  _applyOffline(awayMs) {
    if (!(awayMs > 30000)) return;    // dưới 30s coi như reload, bỏ qua

    const before = Pets.list.map((a) => ({ hunger: a.hunger, energy: a.energy, happy: a.happy }));

    // Tính xu theo mức vui LÚC RỜI ĐI, trước khi tụt chỉ số. Nếu tính sau,
    // vắng càng lâu happy càng thấp nên lại càng ít xu — ngược đời.
    const coinMs = Math.min(awayMs, this.OFFLINE_COIN_CAP);
    const earned = Math.floor(Economy.rate() * (coinMs / 60000));

    const decayMs = Math.min(awayMs, this.OFFLINE_DECAY_CAP);
    const s = (decayMs / 1000) * this.OFFLINE_DECAY_MULT;
    for (const a of Pets.list) {
      const m = a.sp.decayScale || { hunger: 1, energy: 1, happy: 1 };
      a.hunger = clamp(a.hunger - CFG.DECAY.hunger * m.hunger * s, 8, 100);
      a.happy = clamp(a.happy - CFG.DECAY.happy * m.happy * s, 5, 100);
      // vắng mặt thì coi như pet tự đi ngủ: sức hồi chứ không tụt
      a.energy = clamp(a.energy + CFG.SLEEP_RECOVER * s * 0.35, 0, 100);
    }

    if (earned > 0) Economy.earn(earned);

    // giờ đã do đồng hồ máy quyết định, không phải cộng dồn thời gian vắng
    Render._wasNight = DayNight.isNight;

    this.lastReport = {
      away: awayMs,
      coins: earned,
      before,
      after: Pets.list.map((a) => ({ hunger: a.hunger, energy: a.energy, happy: a.happy })),
    };
  },

  /* Câu báo lại cho người chơi khi vừa mở game */
  welcomeText() {
    const r = this.lastReport;
    if (!r) return null;
    const mins = Math.round(r.away / 60000);
    const away = mins < 60
      ? `${mins} phút`
      : mins < 1440 ? `${Math.round(mins / 60)} tiếng` : `${Math.round(mins / 1440)} ngày`;

    const hungry = Pets.list.find((a) => a.hunger < CFG.HUNGRY_AT);
    const tail = hungry ? `, ${hungry.sp.petName} đói lắm rồi` : '';
    return r.coins > 0
      ? `Anh đi ${away}, để dành được ${r.coins} xu${tail}`
      : `Anh đi ${away} rồi${tail}`;
  },

  wipe() {
    try { localStorage.removeItem(this.KEY); } catch (e) { /* bỏ qua */ }
  },
};
