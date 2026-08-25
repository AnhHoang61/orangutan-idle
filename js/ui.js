/* Cập nhật thanh chỉ số và nút hành động. */
const UI = {
  els: {},
  _moodTimer: 0,

  init() {
    this.els = {
      hunger: document.getElementById('f-hunger'),
      energy: document.getElementById('f-energy'),
      happy: document.getElementById('f-happy'),
      mood: document.getElementById('mood'),
      laser: document.querySelector('[data-act="laser"]'),
      light: document.querySelector('[data-act="light"]'),
      ball: document.querySelector('[data-act="ball"]'),
    };
  },

  refresh(dt) {
    this.els.hunger.style.width = `${Cat.hunger}%`;
    this.els.energy.style.width = `${Cat.energy}%`;
    this.els.happy.style.width = `${Cat.happy}%`;

    this.els.laser.setAttribute('aria-pressed', String(Items.laser.on));
    this.els.light.setAttribute('aria-pressed', String(Render.lightsOn));
    this.els.ball.disabled = Items.ball.active;

    // đổi câu mood mỗi ~2.6s để không nhảy chữ liên tục
    this._moodTimer -= dt;
    if (this._moodTimer <= 0) {
      this._moodTimer = 2600;
      this.els.mood.textContent = Cat.moodText();
    }
  },

  /* Thông báo tạm thời, ghi đè dòng mood */
  say(msg) {
    if (!msg) return;
    this.els.mood.textContent = msg;
    this._moodTimer = 2600;
  },
};
