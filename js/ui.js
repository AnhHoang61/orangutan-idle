/* Cập nhật thanh chỉ số và nút hành động.
   Chỉ số hiển thị theo con đang được chọn (UI.selected). */
const UI = {
  els: {},
  selected: null,
  _moodTimer: 0,

  init() {
    this.els = {
      hunger: document.getElementById('f-hunger'),
      energy: document.getElementById('f-energy'),
      happy: document.getElementById('f-happy'),
      mood: document.getElementById('mood'),
      name: document.getElementById('cat-name'),
      laser: document.querySelector('[data-act="laser"]'),
      light: document.querySelector('[data-act="light"]'),
      ball: document.querySelector('[data-act="ball"]'),
      swapLabel: document.getElementById('swap-label'),
      clockIcon: document.getElementById('clock-icon'),
      clockTime: document.getElementById('clock-time'),
      clockPhase: document.getElementById('clock-phase'),
      coinCount: document.getElementById('coin-count'),
      coinRate: document.getElementById('coin-rate'),
      wxSep: document.getElementById('wx-sep'),
      wxTemp: document.getElementById('wx-temp'),
      wxLabel: document.getElementById('wx-label'),
    };
    this.select(Pets.orang);
  },

  /* Chọn con để xem chỉ số và nhận lệnh vuốt/gọi */
  select(a) {
    if (!a || this.selected === a) return;
    this.selected = a;
    if (this.els.name) this.els.name.textContent = `${a.sp.petName} · ${a.sp.label}`;
    if (this.els.swapLabel) {
      const other = a === Pets.orang ? Pets.pig : Pets.orang;
      this.els.swapLabel.textContent = `Sang ${other.sp.petName}`;
    }
    this._moodTimer = 0;   // cập nhật mood ngay
  },

  refresh(dt) {
    const a = this.selected;
    if (!a) return;

    this.els.hunger.style.width = `${a.hunger}%`;
    this.els.energy.style.width = `${a.energy}%`;
    this.els.happy.style.width = `${a.happy}%`;

    this.els.laser.setAttribute('aria-pressed', String(Items.laser.on));
    this.els.light.setAttribute('aria-pressed', String(Render.lightsOn));
    this.els.ball.disabled = Items.ball.active;

    if (this.els.clockTime) {
      this.els.clockIcon.textContent = DayNight.icon;
      this.els.clockTime.textContent = DayNight.clock;
      this.els.clockPhase.textContent = DayNight.phaseName;
    }

    if (this.els.coinCount) {
      this.els.coinCount.textContent = Economy.coins;
      this.els.coinRate.textContent = `+${Economy.rate().toFixed(1)}/phút`;
    }

    // thời tiết thật: chỉ hiện khi đã lấy được dữ liệu
    if (this.els.wxTemp) {
      const has = Weather.temp !== null;
      this.els.wxSep.hidden = !has;
      this.els.wxTemp.textContent = has ? `${Weather.icon} ${Weather.tempText}` : '';
      this.els.wxLabel.textContent = has ? Weather.label : '';
    }

    // đổi câu mood mỗi ~2.6s để không nhảy chữ liên tục
    this._moodTimer -= dt;
    if (this._moodTimer <= 0) {
      this._moodTimer = 2600;
      this.els.mood.textContent = a.moodText();
    }
  },

  /* Thông báo tạm thời, ghi đè dòng mood */
  say(msg) {
    if (!msg || !this.els.mood) return;
    this.els.mood.textContent = msg;
    this._moodTimer = 2600;
  },
};
