/* Vòng lặp game và xử lý input. */
const App = {
  ctx: null,
  last: 0,

  init() {
    const canvas = document.getElementById('scene');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    UI.init();
    Cat.reset();
    Items.reset();

    this._bindPointer(canvas);
    this._bindButtons();
    this._bindKeys();

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  /* Quy đổi toạ độ con trỏ theo tỉ lệ canvas bị CSS scale */
  _toScene(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CFG.W / r.width),
      y: (e.clientY - r.top) * (CFG.H / r.height),
    };
  },

  _bindPointer(canvas) {
    canvas.addEventListener('pointermove', (e) => {
      const p = this._toScene(e);
      if (Items.laser.on) Items.aim(p.x, p.y);
    });

    canvas.addEventListener('pointerdown', (e) => {
      const p = this._toScene(e);
      if (Items.laser.on) { Items.aim(p.x, p.y); return; }
      if (Cat.hitTest(p.x, p.y)) {
        UI.say(Cat.pet());
      } else {
        // click ra sàn: gọi mèo tới chỗ đó
        if (Cat.state !== 'sleep') {
          Cat.target = { x: clamp(p.x, CFG.MARGIN, CFG.W - CFG.MARGIN),
                         y: clamp(p.y, CFG.WALK_TOP + 10, CFG.H - 40) };
          Cat.setState('walk');
        }
      }
    });

    canvas.addEventListener('pointerleave', () => {
      // laser bay ra khỏi phòng -> mèo thôi đuổi
      if (Items.laser.on && Cat.state === 'chase') Cat.setState('idle');
    });
  },

  _bindButtons() {
    document.getElementById('actions').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this.act(btn.dataset.act);
    });
  },

  _bindKeys() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const map = { p: 'pet', f: 'feed', l: 'laser', b: 'ball', ' ': 'light', c: 'scene' };
      if (map[k]) { e.preventDefault(); this.act(map[k]); }
    });
  },

  act(name) {
    switch (name) {
      case 'pet':
        UI.say(Cat.pet());
        break;

      case 'feed':
        if (Items.fill()) {
          UI.say('Anh vừa rót thêm đồ ăn');
          Cat.callToFood();
        } else {
          UI.say('Bát vẫn còn đầy mà');
        }
        break;

      case 'laser': {
        const on = Items.toggleLaser();
        this.canvas.classList.toggle('laser', on);
        if (on) {
          if (Cat.energy < CFG.TIRED_AT) UI.say('Nó mệt quá, chẳng thèm đuổi');
          else { Cat.startChase(); UI.say('Mèo phát hiện đốm đỏ!'); }
        } else {
          UI.say('Tắt laser rồi');
        }
        break;
      }

      case 'ball':
        if (Items.ball.active) { UI.say('Bóng đang ở trong phòng'); break; }
        Items.toss();
        if (Cat.energy < CFG.TIRED_AT) UI.say('Nó lười, nằm nhìn quả bóng');
        else { Cat.startPlay(); UI.say('Mèo lao theo quả bóng'); }
        break;

      case 'scene': {
        const nm = Scenes.next();
        const lbl = document.getElementById('scene-label');
        if (lbl) lbl.textContent = nm;
        UI.say(`Bối cảnh: ${nm}`);
        break;
      }

      case 'light':
        Render.lightsOn = !Render.lightsOn;
        if (!Render.lightsOn) {
          UI.say('Tắt đèn, mèo dễ ngủ hơn');
          if (Cat.energy < 60 && Cat.state !== 'chase') Cat.setState('sleep');
        } else {
          UI.say('Bật đèn lên');
          if (Cat.state === 'sleep' && Cat.energy > CFG.TIRED_AT) Cat.setState('idle');
        }
        break;
    }
  },

  frame(now) {
    const dt = Math.min(60, now - this.last);   // kẹp dt để không nhảy khi tab ẩn
    this.last = now;

    Items.update(dt);
    Cat.update(dt);
    FX.update(dt);
    Render.draw(this.ctx);
    UI.refresh(dt);

    requestAnimationFrame((t) => this.frame(t));
  },
};

addEventListener('DOMContentLoaded', () => App.init());
